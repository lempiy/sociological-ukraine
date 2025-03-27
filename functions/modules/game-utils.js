// functions/modules/game-utils.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const { CloudTasksClient } = require("@google-cloud/tasks");
const { CLOUD_TASKS_CONFIG } = require("../constants");

/**
 * Creates a new game phase
 * @param {Object} move - Move object with playerId and round
 * @param {Object|null} previousPhase - Previous phase (if any)
 * @returns {Object} - New game phase
 */
exports.newPhase = (move, previousPhase) => {
  return {
    id: move.id,
    round: move.round,
    status: "planning",
    startAt: FieldValue.serverTimestamp(),
    activePlayerId: move.playerId,
    activePlayerAnswer: null,
    regionId: "",
    question: null,
    contestedPlayerId: null,
    contestedPlayerAnswer: null,
  };
};

/**
 * Checks for winners based on question answers
 * @param {Object} phase - Current game phase
 * @returns {Array} - Array of player IDs who won
 */
exports.checkWinners = (phase) => {
  const winners = [];

  if (!phase.question) {
    return winners;
  }

  if (phase.question.type === "variant") {
    // For variant questions - check if player chose the correct variant
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
    // For numeric questions - compare player answers
    const correctAnswer = phase.question.numberAnswer.value;

    // Player answers (or null if no answer)
    const activePlayerAnswer = phase.activePlayerAnswer
      ? phase.activePlayerAnswer.number
      : null;
    const contestedPlayerAnswer = phase.contestedPlayerAnswer
      ? phase.contestedPlayerAnswer.number
      : null;

    if (phase.contestedPlayerId) {
      // Duel - compare player answers, find which is closer to correct
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
          // Equal distance to correct answer - both win (rare)
          winners.push(phase.activePlayerId, phase.contestedPlayerId);
        }
      } else if (activePlayerAnswer !== null) {
        // Only active player answered
        winners.push(phase.activePlayerId);
      } else if (contestedPlayerAnswer !== null) {
        // Only contested player answered
        winners.push(phase.contestedPlayerId);
      }
    } else {
      // Normal answer (not duel) - check if active player answered correctly
      if (
        activePlayerAnswer !== null &&
        Math.abs(activePlayerAnswer - correctAnswer) / correctAnswer <= 0.1
      ) {
        // Allow 10% error margin for number answers
        winners.push(phase.activePlayerId);
      }
    }
  }

  return winners;
};

/**
 * Checks if there's a winner in the game
 * @param {Object} gameData - Game data
 * @returns {string|null} - Winner player ID or null if no winner
 */
exports.checkWinner = (gameData) => {
  // To win, a player must control all regions on the map
  const mapStatus = gameData.map.status;
  const regions = Object.keys(mapStatus);

  // For each player, check if they control all regions
  for (const player of gameData.players) {
    const playerId = player.id;
    const controlledRegions = regions.filter(
      (regionId) => mapStatus[regionId] === playerId
    );

    if (controlledRegions.length === regions.length) {
      return playerId; // Player controls the entire map
    }
  }

  // Alternative win condition - player with most regions at end of game
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

  return null; // No winner
};

/**
 * Checks end game conditions and handles winner
 * @param {string} gameId - Game ID
 * @param {Object} gameData - Game data
 * @param {Object} updateData - Object for updating game data
 * @param {number} nextRound - Next round number
 * @returns {boolean} - true if game is finished, false if game continues
 */
exports.checkAndHandleGameEnd = async (
  gameId,
  gameData,
  updateData,
  nextRound
) => {
  // Check end game conditions
  const winner = exports.checkWinner(gameData);
  const maxRoundsReached =
    gameData.rules.maxRounds > 0 && nextRound > gameData.rules.maxRounds;

  if (winner || maxRoundsReached) {
    // End game if there's a winner or maximum rounds reached
    updateData.status = "finished";

    // Add current phase to archive if it exists
    if (gameData.currentPhase) {
      const phases = [...(gameData.phases || []), gameData.currentPhase];
      updateData.phases = phases;
    }

    updateData.currentPhase = null;

    // If there's a winner, mark them
    if (winner) {
      const updatedPlayers = gameData.players.map((player) => {
        if (player.id === winner) {
          return { ...player, isWinner: true };
        }
        return player;
      });
      updateData.players = updatedPlayers;
    }

    // Save updated game object to DB
    await admin.firestore().collection("games").doc(gameId).update(updateData);

    return true; // Game ended
  }

  return false; // Game continues
};

/**
 * Schedule a delayed call to the phase timeout function
 * @param {string} gameId - Game ID
 * @param {number} delaySeconds - Delay in seconds
 * @returns {string} - Cloud Tasks task ID
 */
exports.schedulePhaseTimeout = async (gameId, delaySeconds) => {
  if (process.env.FUNCTIONS_EMULATOR) {
    return schedulePhaseTimeoutEmulator(gameId, delaySeconds);
  } else {
    return schedulePhaseTimeoutCloud(gameId, delaySeconds);
  }
};

async function schedulePhaseTimeoutCloud(gameId, delaySeconds) {
  // Cloud Tasks settings
  const project = process.env.GCLOUD_PROJECT;
  const location = CLOUD_TASKS_CONFIG.LOCATION;
  const queue = CLOUD_TASKS_CONFIG.QUEUE;

  const tasksClient = new CloudTasksClient();
  const queuePath = tasksClient.queuePath(project, location, queue);

  // Create unique task ID
  const taskId = `game-${gameId}-timeout-${Date.now()}`;

  // Data to pass to function
  const payload = {
    gameId: gameId,
  };

  // Create task
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

  // Create task in queue
  await tasksClient.createTask({
    parent: queuePath,
    task: task,
  });

  return taskId;
}

async function schedulePhaseTimeoutEmulator(gameId, delaySeconds) {
  // Create unique task ID
  const taskId = `game-${gameId}-timeout-${Date.now()}`;
  // Use setTimeout for emulation
  setTimeout(async () => {
    try {
      const to = await admin
        .firestore()
        .collection("emulator-timers")
        .doc(taskId)
        .get();
      if (!to.exists) return;
      console.log(
        `[Emulator] >> Timeout triggered ${taskId} for game ${gameId}`
      );

      // Get game data
      const gameDoc = await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .get();

      if (!gameDoc.exists) {
        console.error(`Game ${gameId} not found`);
        return;
      }

      const gameData = gameDoc.data();

      // Check if game is not finished
      if (gameData.status !== "running") {
        console.log(`Game ${gameId} is not active, skipping timeout`);
        return;
      }

      // Create mock request and response objects
      const mockReq = { body: { gameId } };
      const mockRes = {
        status: (code) => ({
          send: (data) => {
            console.log(
              `[Emulator] Timeout response: ${code}, ${JSON.stringify(data)}`
            );
          },
        }),
      };

      // Get access to gameCurrentPhaseTimeout function
      const gameTimeouts = require("./game-timeouts");

      // Call timeout handler
      await gameTimeouts.gameCurrentPhaseTimeout(mockReq, mockRes);
    } catch (error) {
      console.error(`[Emulator] Error executing timeout ${taskId}:`, error);
    }
  }, delaySeconds * 1000);

  await admin.firestore().collection("emulator-timers").doc(taskId).set({
    id: "",
  });

  console.log(
    `[Emulator] > Scheduled timeout ${taskId} for game ${gameId} in ${delaySeconds} seconds`
  );

  return taskId;
}

/**
 * Cancel a timeout task
 * @param {string} taskId - Task ID to cancel
 */
exports.cancelTimeoutTask = async (taskId) => {
  if (process.env.FUNCTIONS_EMULATOR) {
    return cancelTimeoutTaskEmulator(taskId);
  } else {
    return cancelTimeoutTaskCloud(taskId);
  }
};

async function cancelTimeoutTaskCloud(taskId) {
  const project = process.env.GCLOUD_PROJECT;
  const location = CLOUD_TASKS_CONFIG.LOCATION;
  const queue = CLOUD_TASKS_CONFIG.QUEUE;

  const tasksClient = new CloudTasksClient();
  const taskPath = tasksClient.taskPath(project, location, queue, taskId);

  await tasksClient.deleteTask({
    name: taskPath,
  });
}

async function cancelTimeoutTaskEmulator(taskId) {
  const to = await admin
    .firestore()
    .collection("emulator-timers")
    .doc(taskId)
    .delete();
  console.log(`[Emulator] X Timeout ${taskId} canceled`);
}
