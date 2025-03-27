// functions/modules/game-operations.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const functions = require("firebase-functions/v1");
const { GAME_STATUS } = require("../constants");
const {
  newPhase,
  schedulePhaseTimeout,
  cancelTimeoutTask,
} = require("./game-utils");

/**
 * Внутрішня функція для запуску гри
 */
exports.startGameInternal = async (gameId) => {
  // Отримання даних гри
  const gameDoc = await admin.firestore().collection("games").doc(gameId).get();

  if (!gameDoc.exists) {
    throw new functions.https.HttpsError("not-found", "Гру не знайдено");
  }

  const gameData = gameDoc.data();

  // Перевірка статусу гри
  if (gameData.status !== GAME_STATUS.LOBBY) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Гра вже запущена або завершена"
    );
  }

  // Створення масиву черги ходів
  const players = gameData.players;
  const movesArray = [];

  // Додаємо перші 3 ходи (або менше, якщо гравців менше 3)
  for (let i = 0; i < 3; i++) {
    const playerIndex = i % players.length;
    const round = Math.floor(i / players.length) + 1;

    movesArray.push({
      id: i + 1,
      playerId: players[playerIndex].id,
      round: round,
    });
  }

  // Викликаємо допоміжну функцію для створення нової фази
  const currentPhase = newPhase(movesArray[0], null);

  // Створюємо відкладений виклик функції через Cloud Tasks
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPlanning
  );

  // Додаємо ID завдання таймауту до фази
  currentPhase.timeoutTaskId = timeoutTaskId;

  // Оновлюємо дані гри
  const updateData = {
    moves: movesArray,
    currentPhase: currentPhase,
    status: GAME_STATUS.RUNNING,
    currentRound: 1,
    updatedAt: FieldValue.serverTimestamp(),
  };

  // Зберігаємо оновлені дані
  await admin.firestore().collection("games").doc(gameId).update(updateData);
};

/**
 * Запускає гру, переходячи з лоббі в активний ігровий стан
 */
exports.startGame = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Валідація вхідних параметрів
    const { gameId } = data;

    if (!gameId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Не вказано ID гри"
      );
    }

    try {
      // Виклик внутрішньої функції запуску гри
      await exports.startGameInternal(gameId);
      return { success: true };
    } catch (error) {
      console.error("Помилка запуску гри:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Помилка при запуску гри"
      );
    }
  });

/**
 * Дозволяє користувачу вийти з гри
 */
exports.leaveGame = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Перевірка аутентифікації
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Для виходу з гри потрібна аутентифікація"
      );
    }

    // Валідація вхідних параметрів
    const { gameId } = data;

    if (!gameId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Не вказано ID гри"
      );
    }

    try {
      // Отримання даних користувача
      const userId = context.auth.uid;

      // Отримання даних гри
      const gameDoc = await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .get();

      if (!gameDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Гру не знайдено");
      }

      const gameData = gameDoc.data();

      // Перевірка, чи є користувач учасником гри
      const playerIndex = gameData.players.findIndex(
        (player) => player.id === userId
      );

      if (playerIndex === -1) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Ви не є учасником цієї гри"
        );
      }

      // Перевірка статусу гри
      if (
        gameData.status === GAME_STATUS.FINISHED ||
        gameData.status === GAME_STATUS.SKIPPED
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Неможливо вийти з завершеної гри"
        );
      }

      // Видалення гравця зі списку учасників
      const updatedPlayers = gameData.players.filter(
        (player) => player.id !== userId
      );

      // Оновлення даних гри залежно від статусу
      const updateData = {
        players: updatedPlayers,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (gameData.status === GAME_STATUS.RUNNING) {
        // Видалення гравця з черги ходів
        const updatedMoves = gameData.moves.filter(
          (move) => move.playerId !== userId
        );
        updateData.moves = updatedMoves;

        // Зміна статусу всіх регіонів, що належать гравцю, на нейтральний
        const mapStatus = { ...gameData.map.status };
        Object.keys(mapStatus).forEach((regionId) => {
          if (mapStatus[regionId] === userId) {
            mapStatus[regionId] = ""; // Порожній рядок означає нейтральний регіон
          }
        });
        updateData["map.status"] = mapStatus;

        // Перевірка, чи потрібно пропустити поточну фазу
        if (
          gameData.currentPhase &&
          gameData.currentPhase.activePlayerId === userId
        ) {
          // Якщо поточний хід належить гравцю, що виходить

          // Скасування таймауту, якщо він є
          if (gameData.currentPhase.timeoutTaskId) {
            try {
              await cancelTimeoutTask(gameData.currentPhase.timeoutTaskId);
            } catch (error) {
              console.warn("Failed to cancel timeout task:", error);
              // Продовжуємо виконання навіть у разі помилки скасування
            }
          }

          // Збереження поточної фази в архів
          const phases = [
            ...(gameData.phases || []),
            {
              ...gameData.currentPhase,
              status: "skipped",
            },
          ];
          updateData.phases = phases;

          // Визначення наступного гравця
          // Знаходимо позицію активного гравця в оновленому масиві гравців
          const remainingPlayers = updatedPlayers.length;

          if (remainingPlayers > 0) {
            const lastMove = gameData.moves.length
              ? gameData.moves[gameData.moves.length - 1]
              : null;
            // Створення нової черги ходів з мінімум 1 ходом
            if (updatedMoves.length === 0) {
              updateData.moves = [
                {
                  id: lastMove ? lastMove.id + 1 : 1,
                  playerId: updatedPlayers[0].id,
                  round: gameData.currentRound,
                },
              ];
            }

            // Створення нової фази для наступного гравця
            const nextPhase = newPhase(
              updateData.moves.find(
                (m) => m.id == gameData.currentPhase.id + 1
              ),
              gameData.currentPhase
            );

            // Планування таймауту для нової фази
            const timeoutTaskId = await schedulePhaseTimeout(
              gameId,
              gameData.rules.timeForPlanning
            );
            nextPhase.timeoutTaskId = timeoutTaskId;

            updateData.currentPhase = nextPhase;
          } else {
            // Якщо гравців не залишилося, завершуємо гру
            updateData.status = GAME_STATUS.SKIPPED;
            updateData.currentPhase = null;
          }
        }
      }

      // Якщо після виходу гравця в грі не залишилося учасників, видаляємо гру
      if (updatedPlayers.length === 0) {
        await admin.firestore().collection("games").doc(gameId).delete();
        return {
          success: true,
          message: "Гру видалено, оскільки всі гравці залишили її",
        };
      }

      // Оновлення документа гри
      await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .update(updateData);

      return { success: true };
    } catch (error) {
      console.error("Помилка виходу з гри:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Помилка при виході з гри"
      );
    }
  });

// Зміна статусу всіх регіонів
