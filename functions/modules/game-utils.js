// functions/modules/game-utils.js
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { CloudTasksClient } = require("@google-cloud/tasks");
const { CLOUD_TASKS_CONFIG } = require("../constants");

/**
 * Створює нову фазу гри
 * @param {Object} move - Об'єкт ходу з playerId та round
 * @param {Object|null} previousPhase - Попередня фаза (якщо є)
 * @returns {Object} - Нова фаза гри
 */
exports.newPhase = (move, previousPhase) => {
  return {
    id: move.id,
    round: move.round,
    status: "planning",
    startAt: admin.firestore.FieldValue.serverTimestamp(),
    activePlayerId: move.playerId,
    activePlayerAnswer: null,
    regionId: "",
    question: null,
    contestedPlayerId: null,
    contestedPlayerAnswer: null,
  };
};

/**
 * Перевіряє переможців на основі відповідей на питання
 * @param {Object} phase - Поточна фаза гри
 * @returns {Array} - Масив ID гравців-переможців
 */
exports.checkWinners = (phase) => {
  const winners = [];

  if (!phase.question) {
    return winners;
  }

  if (phase.question.type === "variant") {
    // Для питань з варіантами - перевіряємо, чи правильний варіант обрав гравець
    const correctVariant = phase.question.variants.find((v) => v.isCorrect);
    if (!correctVariant) {
      return winners;
    }

    const correctVariantId = correctVariant.id;

    if (
      phase.activePlayerAnswer &&
      phase.activePlayerAnswer.variant === correctVariantId
    ) {
      winners.push(phase.activePlayerId);
    }
  } else if (phase.question.type === "number") {
    // Для числових питань - порівнюємо відповіді гравців
    const correctAnswer = phase.question.numberAnswer.value;

    // Відповіді гравців (або null, якщо не відповіли)
    const activePlayerAnswer = phase.activePlayerAnswer
      ? phase.activePlayerAnswer.number
      : null;
    const contestedPlayerAnswer = phase.contestedPlayerAnswer
      ? phase.contestedPlayerAnswer.number
      : null;

    if (phase.contestedPlayerId) {
      // Дуель - порівнюємо відповіді гравців, хто ближче до правильної
      if (activePlayerAnswer !== null && contestedPlayerAnswer !== null) {
        const activePlayerDiff = Math.abs(activePlayerAnswer - correctAnswer);
        const contestedPlayerDiff = Math.abs(
          contestedPlayerAnswer - correctAnswer
        );

        if (activePlayerDiff < contestedPlayerDiff) {
          winners.push(phase.activePlayerId);
        } else if (contestedPlayerDiff < activePlayerDiff) {
          winners.push(phase.contestedPlayerId);
        } else {
          // Однакова відстань до правильної відповіді - обидва перемагають
          winners.push(phase.activePlayerId, phase.contestedPlayerId);
        }
      } else if (activePlayerAnswer !== null) {
        // Тільки активний гравець відповів
        winners.push(phase.activePlayerId);
      } else if (contestedPlayerAnswer !== null) {
        // Тільки оспорюваний гравець відповів
        winners.push(phase.contestedPlayerId);
      }
    } else {
      // Звичайна відповідь (не дуель) - перевіряємо, чи відповів активний гравець правильно
      if (
        activePlayerAnswer !== null &&
        Math.abs(activePlayerAnswer - correctAnswer) / correctAnswer <= 0.1
      ) {
        // Допускаємо похибку до 10% для числових відповідей
        winners.push(phase.activePlayerId);
      }
    }
  }

  return winners;
};

/**
 * Перевіряє, чи є в грі переможець
 * @param {Object} gameData - Дані гри
 * @returns {string|null} - ID гравця-переможця або null, якщо переможця немає
 */
exports.checkWinner = (gameData) => {
  // Для перемоги гравець повинен контролювати всі регіони на карті
  const mapStatus = gameData.map.status;
  const regions = Object.keys(mapStatus);

  // Для кожного гравця перевіряємо, чи контролює він всі регіони
  for (const player of gameData.players) {
    const playerId = player.id;
    const controlledRegions = regions.filter(
      (regionId) => mapStatus[regionId] === playerId
    );

    if (controlledRegions.length === regions.length) {
      return playerId; // Гравець контролює всю карту
    }
  }

  // Альтернативна умова перемоги - гравець з найбільшою кількістю регіонів у кінці гри
  if (
    gameData.rules.maxRounds > 0 &&
    gameData.currentRound >= gameData.rules.maxRounds
  ) {
    let maxRegions = 0;
    let winnerId = null;

    for (const player of gameData.players) {
      const playerId = player.id;
      const controlledRegions = regions.filter(
        (regionId) => mapStatus[regionId] === playerId
      ).length;

      if (controlledRegions > maxRegions) {
        maxRegions = controlledRegions;
        winnerId = playerId;
      }
    }

    return winnerId;
  }

  return null; // Немає переможця
};

/**
 * Перевіряє умови завершення гри та обробляє перемогу
 * @param {string} gameId - ID гри
 * @param {Object} gameData - Дані гри
 * @param {Object} updateData - Об'єкт для оновлення даних гри
 * @param {number} nextRound - Номер наступного раунду
 * @returns {boolean} - true, якщо гра завершена, false - якщо гра продовжується
 */
exports.checkAndHandleGameEnd = async (
  gameId,
  gameData,
  updateData,
  nextRound
) => {
  // Перевірка умов завершення гри
  const winner = exports.checkWinner(gameData);
  const maxRoundsReached =
    gameData.rules.maxRounds > 0 && nextRound > gameData.rules.maxRounds;

  if (winner || maxRoundsReached) {
    // Завершуємо гру, якщо є переможець або досягнуто максимальної кількості раундів
    updateData.status = "finished";

    // Додаємо поточну фазу до архіву, якщо вона є
    if (gameData.currentPhase) {
      const phases = [...(gameData.phases || []), gameData.currentPhase];
      updateData.phases = phases;
    }

    updateData.currentPhase = null;

    // Якщо є переможець, позначаємо його
    if (winner) {
      const updatedPlayers = gameData.players.map((player) => {
        if (player.id === winner) {
          return { ...player, isWinner: true };
        }
        return player;
      });
      updateData.players = updatedPlayers;
    }

    // Зберігаємо оновлений об'єкт гри в БД
    await admin.firestore().collection("games").doc(gameId).update(updateData);

    return true; // Гра завершена
  }

  return false; // Гра продовжується
};

/**
 * Планування відкладеного виклику функції таймауту
 * @param {string} gameId - ID гри
 * @param {number} delaySeconds - Затримка в секундах
 * @returns {string} - ID завдання Cloud Tasks
 */
exports.schedulePhaseTimeout = async (gameId, delaySeconds) => {
  // Налаштування Cloud Tasks
  const project = process.env.GCLOUD_PROJECT;
  const location = CLOUD_TASKS_CONFIG.LOCATION;
  const queue = CLOUD_TASKS_CONFIG.QUEUE;

  const tasksClient = new CloudTasksClient();
  const queuePath = tasksClient.queuePath(project, location, queue);

  // Створення унікального ID завдання
  const taskId = `game-${gameId}-timeout-${Date.now()}`;

  // Дані для передачі функції
  const payload = {
    gameId: gameId,
  };

  // Створення завдання
  const task = {
    name: tasksClient.taskPath(project, location, queue, taskId),
    httpRequest: {
      httpMethod: "POST",
      url: `https://${location}-${project}.cloudfunctions.net/gameCurrentPhaseTimeout`,
      headers: {
        "Content-Type": "application/json",
      },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    },
  };

  // Створення завдання в черзі
  await tasksClient.createTask({
    parent: queuePath,
    task: task,
  });

  return taskId;
};

/**
 * Скасування завдання таймауту
 * @param {string} taskId - ID завдання для скасування
 */
exports.cancelTimeoutTask = async (taskId) => {
  const project = process.env.GCLOUD_PROJECT;
  const location = CLOUD_TASKS_CONFIG.LOCATION;
  const queue = CLOUD_TASKS_CONFIG.QUEUE;

  const tasksClient = new CloudTasksClient();
  const taskPath = tasksClient.taskPath(project, location, queue, taskId);

  await tasksClient.deleteTask({
    name: taskPath,
  });
};
