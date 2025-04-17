// functions/modules/game-answers.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const functions = require("firebase-functions/v1");
const { GAME_STATUS, PHASE_STATUS, QUESTION_TYPE } = require("../constants");
const {
  schedulePhaseTimeout,
  cancelTimeoutTask,
  checkWinners,
} = require("./game-utils");

/**
 * Allows a player to select a region to color
 */
exports.setPlanningResult = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication is required to select a region"
      );
    }

    // Validate input parameters
    const { gameId, regionId } = data;

    if (!gameId || !regionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Game ID or region ID not specified"
      );
    }

    try {
      // Get user data
      const userId = context.auth.uid;

      // Get game data
      const gameDoc = await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .get();

      if (!gameDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Game not found");
      }

      const gameData = gameDoc.data();

      // Check game status
      if (gameData.status !== GAME_STATUS.RUNNING) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Game is not active"
        );
      }

      // Check phase status
      if (
        !gameData.currentPhase ||
        gameData.currentPhase.status !== PHASE_STATUS.PLANNING
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not in planning stage"
        );
      }

      // Check if user is the active player
      if (gameData.currentPhase.activePlayerId !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "It's not your turn"
        );
      }

      // Check if the selected region exists
      if (!gameData.map.status.hasOwnProperty(regionId)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Region does not exist"
        );
      }

      // Check if the region is already controlled by current player
      if (gameData.map.status[regionId] === userId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "You already control this region"
        );
      }

      // Determine if region is contested by another player
      const contestedPlayerId = gameData.map.status[regionId] || null;

      // Update current phase
      const updatedPhase = {
        ...gameData.currentPhase,
        regionId: regionId,
        contestedPlayerId: contestedPlayerId,
        status: PHASE_STATUS.POST_PLANNING,
        startAt: FieldValue.serverTimestamp(),
      };

      // Cancel previous timeout task if exists
      if (gameData.currentPhase.timeoutTaskId) {
        try {
          await cancelTimeoutTask(gameData.currentPhase.timeoutTaskId);
        } catch (error) {
          console.warn("Failed to cancel timeout task:", error);
          // Continue execution even if cancellation fails
        }
      }

      // Schedule new timeout
      const timeoutTaskId = await schedulePhaseTimeout(
        gameId,
        gameData.rules.timeForPostPlanning
      );
      updatedPhase.timeoutTaskId = timeoutTaskId;

      // Update game document
      await admin.firestore().collection("games").doc(gameId).update({
        currentPhase: updatedPhase,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error selecting region:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Error while selecting region"
      );
    }
  });

/**
 * Allows a player to answer a question
 */
exports.setAnswer = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Перевірка аутентифікації
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Для відповіді на питання потрібна аутентифікація"
      );
    }

    // Валідація вхідних параметрів
    const { gameId, variant, number } = data;

    if (!gameId || (variant === undefined && number === undefined)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Не вказано ID гри або відповідь"
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

      // Перевірка статусу гри
      if (gameData.status !== "running") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Гра не активна"
        );
      }

      // Перевірка статусу фази
      if (!gameData.currentPhase || gameData.currentPhase.status !== "answer") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Зараз не стадія відповіді"
        );
      }

      // Перевірка, чи є користувач активним або оспорюючим гравцем
      const isActivePlayer = gameData.currentPhase.activePlayerId === userId;
      const isContestedPlayer =
        gameData.currentPhase.contestedPlayerId === userId;

      if (!isActivePlayer && !isContestedPlayer) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Ви не можете відповісти на це питання"
        );
      }

      // Перевірка, чи не відповів гравець уже
      if (isActivePlayer && gameData.currentPhase.activePlayerAnswer !== null) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Ви вже відповіли на це питання"
        );
      }

      if (
        isContestedPlayer &&
        gameData.currentPhase.contestedPlayerAnswer !== null
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Ви вже відповіли на це питання"
        );
      }

      // Валідація типу відповіді відповідно до типу питання
      const questionType = gameData.currentPhase.question.type;

      if (questionType === "variant" && variant === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Для питання з варіантами потрібно вказати ID варіанту"
        );
      }

      if (questionType === "number" && number === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Для числового питання потрібно вказати числову відповідь"
        );
      }

      // Створення об'єкта відповіді
      const answer =
        questionType === "variant" ? { variant: variant } : { number: number };

      // Оновлення поточної фази
      const updatedPhase = { ...gameData.currentPhase };

      if (isActivePlayer) {
        updatedPhase.activePlayerAnswer = answer;
      } else {
        updatedPhase.contestedPlayerAnswer = answer;
      }

      // Перевірка, чи всі необхідні гравці відповіли
      const allPlayersAnswered =
        updatedPhase.activePlayerAnswer !== null &&
        (updatedPhase.contestedPlayerId === null ||
          updatedPhase.contestedPlayerAnswer !== null);

      // Оновлення документа гри з першими змінами
      await admin.firestore().collection("games").doc(gameId).update({
        currentPhase: updatedPhase,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Якщо всі гравці відповіли, відміняємо таймаут і запускаємо обробку відповідей
      if (allPlayersAnswered) {
        // Скасування таймауту
        if (gameData.currentPhase.timeoutTaskId) {
          try {
            await cancelTimeoutTask(gameData.currentPhase.timeoutTaskId);
          } catch (error) {
            console.warn("Failed to cancel timeout task:", error);
            // Продовжуємо виконання навіть у разі помилки скасування
          }
        }

        // Викликаємо логіку обробки відповідей
        const updateData = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Перевіряємо переможця
        const winners = checkWinners(updatedPhase);

        // Оновлюємо лічильники правильних і неправильних відповідей
        const updatedPlayers = [...gameData.players];

        // Перевіряємо активного гравця
        const activePlayerIndex = updatedPlayers.findIndex(
          (player) => player.id === updatedPhase.activePlayerId
        );

        if (activePlayerIndex !== -1) {
          const isActivePlayerCorrect = winners.includes(
            updatedPhase.activePlayerId
          );

          if (isActivePlayerCorrect) {
            updatedPlayers[activePlayerIndex].correctAnswers =
              (updatedPlayers[activePlayerIndex].correctAnswers || 0) + 1;
          } else {
            updatedPlayers[activePlayerIndex].wrongAnswers =
              (updatedPlayers[activePlayerIndex].wrongAnswers || 0) + 1;
          }
        }

        // Перевіряємо гравця, чий регіон оскаржується (якщо такий є)
        if (
          updatedPhase.contestedPlayerId &&
          updatedPhase.contestedPlayerAnswer !== null
        ) {
          const contestedPlayerIndex = updatedPlayers.findIndex(
            (player) => player.id === updatedPhase.contestedPlayerId
          );

          if (contestedPlayerIndex !== -1) {
            const isContestedPlayerCorrect = winners.includes(
              updatedPhase.contestedPlayerId
            );

            if (isContestedPlayerCorrect) {
              updatedPlayers[contestedPlayerIndex].correctAnswers =
                (updatedPlayers[contestedPlayerIndex].correctAnswers || 0) + 1;
            } else {
              updatedPlayers[contestedPlayerIndex].wrongAnswers =
                (updatedPlayers[contestedPlayerIndex].wrongAnswers || 0) + 1;
            }
          }
        }

        // Додаємо оновлених гравців до об'єкта оновлення
        updateData.players = updatedPlayers;

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
          ...updatedPhase,
          status: "post-answer",
          startAt: FieldValue.serverTimestamp(),
          // Зберігаємо стан карти після відповіді для відображення на фронтенді
          mapStatusAfter: { ...gameData.map.status },
        };

        // Якщо регіон був захоплений, оновлюємо mapStatusAfter
        if (winners.length === 1) {
          const winnerId = winners[0];
          updateData.currentPhase.mapStatusAfter[
            gameData.currentPhase.regionId
          ] = winnerId;
        }

        // Плануємо таймаут для фази post-answer
        const timeoutTaskId = await schedulePhaseTimeout(
          gameId,
          gameData.rules.timeForPostAnswer
        );
        updateData.currentPhase.timeoutTaskId = timeoutTaskId;

        // Зберігаємо оновлені дані
        await admin
          .firestore()
          .collection("games")
          .doc(gameId)
          .update(updateData);
      }

      return { success: true };
    } catch (error) {
      console.error("Помилка відповіді на питання:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Помилка при відповіді на питання"
      );
    }
  });
