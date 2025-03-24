// functions/modules/game-timeouts.js
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { GAME_STATUS, PHASE_STATUS, QUESTION_TYPE } = require("../constants");
const {
  newPhase,
  checkWinners,
  checkAndHandleGameEnd,
  schedulePhaseTimeout,
} = require("./game-utils");

/**
 * Обробляє таймаути фаз гри
 */
exports.gameCurrentPhaseTimeout = functions
  .region("europe-central2")
  .https.onRequest(async (req, res) => {
    try {
      // Парсимо тіло запиту
      const { gameId } = req.body;

      if (!gameId) {
        res.status(400).send({ error: "Missing gameId parameter" });
        return;
      }

      // Отримання даних гри
      const gameDoc = await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .get();

      if (!gameDoc.exists) {
        res.status(404).send({ error: "Game not found" });
        return;
      }

      const gameData = gameDoc.data();

      // Перевірка, чи не завершена гра
      if (gameData.status !== GAME_STATUS.RUNNING) {
        res.status(200).send({ message: "Game is not running" });
        return;
      }

      // Обробка різних статусів фази
      let updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      switch (gameData.currentPhase.status) {
        case PHASE_STATUS.PLANNING:
          await handlePlanningTimeout(gameId, gameData, updateData);
          break;

        case PHASE_STATUS.POST_PLANNING:
          await handlePostPlanningTimeout(gameId, gameData, updateData);
          break;

        case PHASE_STATUS.ANSWER:
          await handleAnswerTimeout(gameId, gameData, updateData);
          break;

        case PHASE_STATUS.POST_ANSWER:
          await handlePostAnswerTimeout(gameId, gameData, updateData);
          break;

        default:
          res.status(400).send({ error: "Unknown phase status" });
          return;
      }

      res.status(200).send({ success: true });
    } catch (error) {
      console.error("Error processing game timeout:", error);
      res.status(500).send({ error: "Internal server error" });
    }
  });

/**
 * Обробка таймауту фази "planning"
 */
async function handlePlanningTimeout(gameId, gameData, updateData) {
  // Збільшення лічильника пропущених ходів
  const skippedCount = (gameData.planningSkippedCount || 0) + 1;
  updateData.planningSkippedCount = skippedCount;

  // Перевірка, чи не пропустили всі гравці свій хід
  if (skippedCount >= gameData.players.length) {
    // Всі гравці пропустили хід, завершуємо гру
    updateData.status = GAME_STATUS.SKIPPED;
    await admin.firestore().collection("games").doc(gameId).update(updateData);
    return;
  }

  // Переведення поточної фази в статус "skipped"
  const currentPhase = {
    ...gameData.currentPhase,
    status: PHASE_STATUS.SKIPPED,
  };

  // Додавання поточної фази до архіву
  const phases = [...(gameData.phases || []), currentPhase];
  updateData.phases = phases;

  // Модифікація черги ходів
  const moves = [...gameData.moves];

  // Видаляємо найстаріший хід, якщо в черзі більше 5 ходів
  if (moves.length >= 5) {
    moves.shift();
  }

  // Додаємо новий хід в кінець черги
  const lastMove = moves[moves.length - 1];
  const playerIndex = gameData.players.findIndex(
    (player) => player.id === lastMove.playerId
  );
  const nextPlayerIndex = (playerIndex + 1) % gameData.players.length;
  const nextPlayerId = gameData.players[nextPlayerIndex].id;

  // Визначаємо номер раунду для нового ходу
  let nextRound = lastMove.round;
  if (nextPlayerIndex === 0) {
    nextRound++; // Новий раунд, якщо ходить перший гравець
  }

  moves.push({
    id: lastMove.id + 1,
    playerId: nextPlayerId,
    round: nextRound,
  });

  updateData.moves = moves;

  // Перевіряємо умови закінчення гри
  if (await checkAndHandleGameEnd(gameId, gameData, updateData, nextRound)) {
    return; // Гра завершена
  }

  // Створюємо нову фазу
  const newPhaseObj = newPhase(
    moves.find((m) => m.id === currentPhase.id + 1),
    currentPhase
  );
  updateData.currentPhase = newPhaseObj;
  updateData.currentRound = newPhaseObj.round;

  // Плануємо таймаут для нової фази
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPlanning
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Зберігаємо оновлення в БД
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}

/**
 * Обробка таймауту фази "post-planning"
 */
async function handlePostPlanningTimeout(gameId, gameData, updateData) {
  // Визначаємо тип питання
  const questionType = gameData.currentPhase.contestedPlayerId
    ? QUESTION_TYPE.NUMBER
    : QUESTION_TYPE.VARIANT;

  // Отримуємо випадкове питання з БД
  let question;

  try {
    // Для варіантів шукаємо питання з конкретного регіону
    // Спочатку отримуємо кількість документів для визначення випадкового зсуву
    const queryConstraints = [["type", "==", questionType]];

    if (questionType === QUESTION_TYPE.VARIANT) {
      // Додаємо фільтр за регіоном, якщо тип питання варіантний
      queryConstraints.push([
        "subjectId",
        "==",
        gameData.currentPhase.regionId,
      ]);
    }

    const countQuery = await admin
      .firestore()
      .collection("questions")
      .where(...queryConstraints[0]);

    if (queryConstraints.length > 1) {
      countQuery.where(...queryConstraints[1]);
    }

    const countResult = await countQuery.count().get();
    const count = countResult.data().count;

    if (count === 0) {
      // Якщо немає питань для конкретного регіону, шукаємо загальні питання
      const generalCountQuery = await admin
        .firestore()
        .collection("questions")
        .where("type", "==", questionType)
        .where("subjectId", "==", "*")
        .count()
        .get();

      const generalCount = generalCountQuery.data().count;

      if (generalCount === 0) {
        throw new Error(`No questions found for type ${questionType}`);
      }

      // Генеруємо випадковий індекс
      const randomIndex = Math.floor(Math.random() * generalCount);

      // Отримуємо питання за випадковим індексом
      const questionsSnapshot = await admin
        .firestore()
        .collection("questions")
        .where("type", "==", questionType)
        .where("subjectId", "==", "*")
        .offset(randomIndex)
        .limit(1)
        .get();

      if (questionsSnapshot.empty) {
        throw new Error(`Failed to get random question`);
      }

      question = questionsSnapshot.docs[0].data();
    } else {
      // Генеруємо випадковий індекс
      const randomIndex = Math.floor(Math.random() * count);

      // Отримуємо питання за випадковим індексом
      const questionsQuery = admin
        .firestore()
        .collection("questions")
        .where(...queryConstraints[0]);

      if (queryConstraints.length > 1) {
        questionsQuery.where(...queryConstraints[1]);
      }

      const questionsSnapshot = await questionsQuery
        .offset(randomIndex)
        .limit(1)
        .get();

      if (questionsSnapshot.empty) {
        throw new Error(
          `Failed to get random question for region ${gameData.currentPhase.regionId}`
        );
      }

      question = questionsSnapshot.docs[0].data();
    }
  } catch (error) {
    console.error("Error getting question:", error);

    // Створюємо запасне питання, якщо не вдалося отримати з БД
    question = createFallbackQuestion(
      questionType,
      gameData.currentPhase.regionId
    );
  }

  // Оновлюємо поточну фазу
  updateData.currentPhase = {
    ...gameData.currentPhase,
    status: PHASE_STATUS.ANSWER,
    question: question,
    activePlayerAnswer: null,
    contestedPlayerAnswer: null,
    startAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Плануємо таймаут для фази answer
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForAnswer
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Зберігаємо оновлення в БД
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}

/**
 * Створює запасне питання, якщо не вдалося отримати з БД
 */
function createFallbackQuestion(questionType, regionId) {
  if (questionType === QUESTION_TYPE.VARIANT) {
    return {
      id: "fallback-variant",
      type: "variant",
      subjectId: regionId,
      text: "Який відсоток населення України живе в містах?",
      variants: [
        { id: 1, text: "50%", isCorrect: false },
        { id: 2, text: "60%", isCorrect: false },
        { id: 3, text: "70%", isCorrect: true },
        { id: 4, text: "80%", isCorrect: false },
      ],
    };
  } else {
    return {
      id: "fallback-number",
      type: "number",
      subjectId: "*",
      text: "Яке населення України в мільйонах станом на 2023 рік?",
      numberAnswer: {
        value: 36.7,
        units: "млн",
      },
    };
  }
}

/**
 * Обробка таймауту фази "answer"
 */
async function handleAnswerTimeout(gameId, gameData, updateData) {
  // Перевіряємо переможця
  const winners = checkWinners(gameData.currentPhase);

  // Обробляємо результат залежно від кількості переможців
  if (winners.length === 1) {
    // Один переможець - регіон зафарбовується у колір переможця
    const winnerId = winners[0];
    const mapStatus = { ...gameData.map.status };
    mapStatus[gameData.currentPhase.regionId] = winnerId;
    updateData["map.status"] = mapStatus;
  }

  // Оновлюємо поточну фазу
  updateData.currentPhase = {
    ...gameData.currentPhase,
    status: PHASE_STATUS.POST_ANSWER,
    startAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Плануємо таймаут для фази post-answer
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPostAnswer
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Зберігаємо оновлені дані
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}

/**
 * Обробка таймауту фази "post-answer"
 */
async function handlePostAnswerTimeout(gameId, gameData, updateData) {
  // Додаємо поточну фазу до архіву
  const phases = [...(gameData.phases || []), gameData.currentPhase];
  updateData.phases = phases;

  // Модифікація черги ходів
  const moves = [...gameData.moves];

  // Видаляємо найстаріший хід, якщо в черзі більше 5 ходів
  if (moves.length >= 5) {
    moves.shift();
  }

  // Додаємо новий хід в кінець черги
  const lastMove = moves[moves.length - 1];
  const playerIndex = gameData.players.findIndex(
    (player) => player.id === lastMove.playerId
  );
  const nextPlayerIndex = (playerIndex + 1) % gameData.players.length;
  const nextPlayerId = gameData.players[nextPlayerIndex].id;

  // Визначаємо номер раунду для нового ходу
  let nextRound = lastMove.round;
  if (nextPlayerIndex === 0) {
    nextRound++; // Новий раунд, якщо ходить перший гравець
  }
  console.log(
    "moves before",
    gameData.moves.map((m) => ({
      id: m.id,
      round: m.round,
      name: gameData.players.find((player) => player.id === m.playerId)
        .displayName,
    }))
  );

  moves.push({
    id: lastMove.id + 1,
    playerId: nextPlayerId,
    round: nextRound,
  });

  updateData.moves = moves;

  // Перевірка умов завершення гри
  if (await checkAndHandleGameEnd(gameId, gameData, updateData, nextRound)) {
    return; // Гра завершена
  }
  console.log(
    "moves after",
    updateData.moves.map((m) => ({
      id: m.id,
      round: m.round,
      name: gameData.players.find((player) => player.id === m.playerId)
        .displayName,
    }))
  );
  // Створюємо нову фазу
  const newPhaseObj = newPhase(
    moves.find((m) => m.id === gameData.currentPhase.id + 1),
    gameData.currentPhase
  );
  updateData.currentPhase = newPhaseObj;
  updateData.currentRound = newPhaseObj.round;

  // Плануємо таймаут для нової фази
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPlanning
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Зберігаємо оновлені дані
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}
