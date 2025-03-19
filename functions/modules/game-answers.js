// functions/modules/game-answers.js
const admin = require("firebase-admin");
const functions = require("firebase-functions/v1");
const { GAME_STATUS, PHASE_STATUS, QUESTION_TYPE } = require("../constants");
const {
  schedulePhaseTimeout,
  cancelTimeoutTask,
  checkWinners,
} = require("./game-utils");

/**
 * Дозволяє гравцю вибрати регіон для зафарбовування
 */
exports.setPlanningResult = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Перевірка аутентифікації
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Для вибору регіону потрібна аутентифікація"
      );
    }

    // Валідація вхідних параметрів
    const { gameId, regionId } = data;

    if (!gameId || !regionId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Не вказано ID гри або регіону"
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
      if (gameData.status !== GAME_STATUS.RUNNING) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Гра не активна"
        );
      }

      // Перевірка статусу фази
      if (
        !gameData.currentPhase ||
        gameData.currentPhase.status !== PHASE_STATUS.PLANNING
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Зараз не стадія планування"
        );
      }

      // Перевірка, чи є користувач активним гравцем
      if (gameData.currentPhase.activePlayerId !== userId) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Зараз не ваш хід"
        );
      }

      // Перевірка, чи існує вибраний регіон
      if (!gameData.map.status.hasOwnProperty(regionId)) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Регіон не існує"
        );
      }

      // Перевірка, чи не належить регіон поточному гравцю
      if (gameData.map.status[regionId] === userId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Ви вже контролюєте цей регіон"
        );
      }

      // Визначення, чи є регіон під контролем іншого гравця
      const contestedPlayerId = gameData.map.status[regionId] || null;

      // Оновлення поточної фази
      const updatedPhase = {
        ...gameData.currentPhase,
        regionId: regionId,
        contestedPlayerId: contestedPlayerId,
        status: PHASE_STATUS.POST_PLANNING,
        startAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Якщо є попередня таска таймауту, скасовуємо її
      if (gameData.currentPhase.timeoutTaskId) {
        try {
          await cancelTimeoutTask(gameData.currentPhase.timeoutTaskId);
        } catch (error) {
          console.warn("Failed to cancel timeout task:", error);
          // Продовжуємо виконання навіть у разі помилки скасування
        }
      }

      // Планування нового таймауту
      const timeoutTaskId = await schedulePhaseTimeout(
        gameId,
        gameData.rules.timeForPostPlanning
      );
      updatedPhase.timeoutTaskId = timeoutTaskId;

      // Оновлення документа гри
      await admin.firestore().collection("games").doc(gameId).update({
        currentPhase: updatedPhase,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Помилка вибору регіону:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Помилка при виборі регіону"
      );
    }
  });

/**
 * Дозволяє гравцю відповісти на питання
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
      if (gameData.status !== GAME_STATUS.RUNNING) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Гра не активна"
        );
      }

      // Перевірка статусу фази
      if (
        !gameData.currentPhase ||
        gameData.currentPhase.status !== PHASE_STATUS.ANSWER
      ) {
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

      if (questionType === QUESTION_TYPE.VARIANT && variant === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Для питання з варіантами потрібно вказати ID варіанту"
        );
      }

      if (questionType === QUESTION_TYPE.NUMBER && number === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Для числового питання потрібно вказати числову відповідь"
        );
      }

      // Створення об'єкта відповіді
      const answer =
        questionType === QUESTION_TYPE.VARIANT
          ? { variant: variant }
          : { number: number };

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

      // Оновлення документа гри
      await admin.firestore().collection("games").doc(gameId).update({
        currentPhase: updatedPhase,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

        // Викликаємо логіку обробки відповідей самостійно
        const updateData = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Перевіряємо переможця
        const winners = checkWinners(updatedPhase);

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
