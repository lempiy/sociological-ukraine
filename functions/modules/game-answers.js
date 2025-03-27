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
    // Authentication check
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Authentication is required to answer a question"
      );
    }

    // Validate input parameters
    const { gameId, variant, number } = data;

    if (!gameId || (variant === undefined && number === undefined)) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Game ID or answer not specified"
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
        gameData.currentPhase.status !== PHASE_STATUS.ANSWER
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Not in answer stage"
        );
      }

      // Check if user is the active or contested player
      const isActivePlayer = gameData.currentPhase.activePlayerId === userId;
      const isContestedPlayer =
        gameData.currentPhase.contestedPlayerId === userId;

      if (!isActivePlayer && !isContestedPlayer) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You cannot answer this question"
        );
      }

      // Check if user has already answered
      if (isActivePlayer && gameData.currentPhase.activePlayerAnswer !== null) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "You already answered this question"
        );
      }

      if (
        isContestedPlayer &&
        gameData.currentPhase.contestedPlayerAnswer !== null
      ) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "You already answered this question"
        );
      }

      // Validate answer type according to question type
      const questionType = gameData.currentPhase.question.type;

      if (questionType === QUESTION_TYPE.VARIANT && variant === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "For variant questions, you must specify variant ID"
        );
      }

      if (questionType === QUESTION_TYPE.NUMBER && number === undefined) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "For numeric questions, you must specify a numeric answer"
        );
      }

      // Create answer object
      const answer =
        questionType === QUESTION_TYPE.VARIANT
          ? { variant: variant }
          : { number: number };

      // Update current phase
      const updatedPhase = { ...gameData.currentPhase };

      if (isActivePlayer) {
        updatedPhase.activePlayerAnswer = answer;
      } else {
        updatedPhase.contestedPlayerAnswer = answer;
      }

      // Check if all required players have answered
      const allPlayersAnswered =
        updatedPhase.activePlayerAnswer !== null &&
        (updatedPhase.contestedPlayerId === null ||
          updatedPhase.contestedPlayerAnswer !== null);

      // Update game document
      await admin.firestore().collection("games").doc(gameId).update({
        currentPhase: updatedPhase,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // If all players have answered, cancel timeout and process answers
      if (allPlayersAnswered) {
        // Cancel timeout
        if (gameData.currentPhase.timeoutTaskId) {
          try {
            await cancelTimeoutTask(gameData.currentPhase.timeoutTaskId);
          } catch (error) {
            console.warn("Failed to cancel timeout task:", error);
            // Continue execution even if cancellation fails
          }
        }

        // Call answer processing logic manually
        const updateData = {
          updatedAt: FieldValue.serverTimestamp(),
        };

        // Check for winners
        const winners = checkWinners(updatedPhase);

        // Process result based on number of winners
        if (winners.length === 1) {
          // One winner - region is colored in winner's color
          const winnerId = winners[0];
          const mapStatus = { ...gameData.map.status };
          mapStatus[gameData.currentPhase.regionId] = winnerId;
          updateData["map.status"] = mapStatus;
        }

        // Update current phase
        updateData.currentPhase = {
          ...updatedPhase,
          status: PHASE_STATUS.POST_ANSWER,
          startAt: FieldValue.serverTimestamp(),
          // Store the map status after the answer for reference in front-end
          mapStatusAfter: { ...gameData.map.status },
        };

        // If the region was claimed, update the mapStatusAfter
        if (winners.length === 1) {
          const winnerId = winners[0];
          updateData.currentPhase.mapStatusAfter[
            gameData.currentPhase.regionId
          ] = winnerId;
        }

        // Schedule timeout for post-answer phase
        const timeoutTaskId = await schedulePhaseTimeout(
          gameId,
          gameData.rules.timeForPostAnswer
        );
        updateData.currentPhase.timeoutTaskId = timeoutTaskId;

        // Save updated data
        await admin
          .firestore()
          .collection("games")
          .doc(gameId)
          .update(updateData);
      }

      return { success: true };
    } catch (error) {
      console.error("Error answering question:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Error while answering question"
      );
    }
  });
