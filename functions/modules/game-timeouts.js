// functions/modules/game-timeouts.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const functions = require("firebase-functions/v1");
const { GAME_STATUS, PHASE_STATUS, QUESTION_TYPE } = require("../constants");
const {
  newPhase,
  checkWinners,
  checkAndHandleGameEnd,
  schedulePhaseTimeout,
} = require("./game-utils");

/**
 * Handles game phase timeouts
 */
exports.gameCurrentPhaseTimeout = functions
  .region("europe-central2")
  .https.onRequest(async (req, res) => {
    try {
      // Parse request body
      const { gameId } = req.body;

      if (!gameId) {
        res.status(400).send({ error: "Missing gameId parameter" });
        return;
      }

      // Get game data
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

      // Check if game is not finished
      if (gameData.status !== GAME_STATUS.RUNNING) {
        res.status(200).send({ message: "Game is not running" });
        return;
      }

      // Process different phase statuses
      let updateData = {
        updatedAt: FieldValue.serverTimestamp(),
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
 * Handles timeout of "planning" phase
 */
async function handlePlanningTimeout(gameId, gameData, updateData) {
  // Increase skipped moves counter
  const skippedCount = (gameData.planningSkippedCount || 0) + 1;
  updateData.planningSkippedCount = skippedCount;

  // Check if all players skipped their move
  if (skippedCount >= gameData.players.length) {
    // All players skipped their move, end game
    updateData.status = GAME_STATUS.SKIPPED;
    await admin.firestore().collection("games").doc(gameId).update(updateData);
    return;
  }

  // Change current phase status to "skipped"
  const currentPhase = {
    ...gameData.currentPhase,
    status: PHASE_STATUS.SKIPPED,
  };

  // Add current phase to archive
  const phases = [...(gameData.phases || []), currentPhase];
  updateData.phases = phases;

  // Modify moves queue
  const moves = [...gameData.moves];

  // Remove oldest move if queue has more than 5 moves
  if (moves.length >= 5) {
    moves.shift();
  }

  // Add new move to end of queue
  const lastMove = moves[moves.length - 1];
  const playerIndex = gameData.players.findIndex(
    (player) => player.id === lastMove.playerId
  );
  const nextPlayerIndex = (playerIndex + 1) % gameData.players.length;
  const nextPlayerId = gameData.players[nextPlayerIndex].id;

  // Determine round number for new move
  let nextRound = lastMove.round;
  if (nextPlayerIndex === 0) {
    nextRound++; // New round if first player's turn
  }

  moves.push({
    id: lastMove.id + 1,
    playerId: nextPlayerId,
    round: nextRound,
  });

  updateData.moves = moves;

  // Check end game conditions
  if (await checkAndHandleGameEnd(gameId, gameData, updateData, nextRound)) {
    return; // Game ended
  }

  // Create new phase
  const newPhaseObj = newPhase(
    moves.find((m) => m.id === currentPhase.id + 1),
    currentPhase
  );
  updateData.currentPhase = newPhaseObj;
  updateData.currentRound = newPhaseObj.round;

  // Schedule timeout for new phase
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPlanning
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Save update to DB
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}

/**
 * Handles timeout of "post-planning" phase
 */
async function handlePostPlanningTimeout(gameId, gameData, updateData) {
  // Determine question type
  const questionType = gameData.currentPhase.contestedPlayerId
    ? QUESTION_TYPE.NUMBER
    : QUESTION_TYPE.VARIANT;

  // Get random question from DB
  let question;

  try {
    // For variants, look for questions from specific region
    // First get document count to determine random offset
    const queryConstraints = [["type", "==", questionType]];

    if (questionType === QUESTION_TYPE.NUMBER) {
      // Add region filter if question type is variant
      queryConstraints.push([
        "subjectId",
        "==",
        gameData.currentPhase.regionId,
      ]);
    }

    let countQuery = await admin
      .firestore()
      .collection("questions")
      .where(...queryConstraints[0]);

    if (queryConstraints.length > 1) {
      countQuery = countQuery.where(...queryConstraints[1]);
    }

    console.dir(countQuery);
    console.log();

    const countResult = await countQuery.count().get();
    const count = countResult.data().count;

    if (count === 0) {
      console.log(
        "NOT found " + " questions with type " + questionType,
        gameData.currentPhase.regionId,
        JSON.stringify(queryConstraints)
      );
      // If no questions for specific region, look for general questions
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

      // Generate random index
      const randomIndex = Math.floor(Math.random() * generalCount);

      // Get question at random index
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
      console.log(
        "found " + count + " questions with type " + questionType,
        gameData.currentPhase.regionId,
        JSON.stringify(queryConstraints)
      );
      // Generate random index
      const randomIndex = Math.floor(Math.random() * count);

      // Get question at random index
      let questionsQuery = admin
        .firestore()
        .collection("questions")
        .where(...queryConstraints[0]);

      if (queryConstraints.length > 1) {
        questionsQuery = questionsQuery.where(...queryConstraints[1]);
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

    // Create fallback question if failed to get from DB
    question = createFallbackQuestion(
      questionType,
      gameData.currentPhase.regionId
    );
  }

  // Update current phase
  updateData.currentPhase = {
    ...gameData.currentPhase,
    status: PHASE_STATUS.ANSWER,
    question: question,
    activePlayerAnswer: null,
    contestedPlayerAnswer: null,
    startAt: FieldValue.serverTimestamp(),
  };

  // Schedule timeout for answer phase
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForAnswer
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Save update to DB
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}

/**
 * Creates a fallback question if failed to get from DB
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

async function handleAnswerTimeout(gameId, gameData, updateData) {
  // Перевіряємо переможця
  const winners = checkWinners(gameData.currentPhase);

  // Оновлюємо лічильники правильних і неправильних відповідей
  const updatedPlayers = [...gameData.players];

  // Обробка активного гравця
  if (gameData.currentPhase.activePlayerAnswer !== null) {
    const activePlayerIndex = updatedPlayers.findIndex(
      (player) => player.id === gameData.currentPhase.activePlayerId
    );

    if (activePlayerIndex !== -1) {
      const isActivePlayerCorrect = winners.includes(
        gameData.currentPhase.activePlayerId
      );

      if (isActivePlayerCorrect) {
        updatedPlayers[activePlayerIndex].correctAnswers =
          (updatedPlayers[activePlayerIndex].correctAnswers || 0) + 1;
      } else {
        updatedPlayers[activePlayerIndex].wrongAnswers =
          (updatedPlayers[activePlayerIndex].wrongAnswers || 0) + 1;
      }
    }
  } else {
    // Якщо активний гравець не відповів, це вважається неправильною відповіддю
    const activePlayerIndex = updatedPlayers.findIndex(
      (player) => player.id === gameData.currentPhase.activePlayerId
    );

    if (activePlayerIndex !== -1) {
      updatedPlayers[activePlayerIndex].wrongAnswers =
        (updatedPlayers[activePlayerIndex].wrongAnswers || 0) + 1;
    }
  }

  // Обробка гравця, чий регіон оскаржується (якщо такий є)
  if (gameData.currentPhase.contestedPlayerId) {
    const contestedPlayerIndex = updatedPlayers.findIndex(
      (player) => player.id === gameData.currentPhase.contestedPlayerId
    );

    if (contestedPlayerIndex !== -1) {
      if (gameData.currentPhase.contestedPlayerAnswer !== null) {
        const isContestedPlayerCorrect = winners.includes(
          gameData.currentPhase.contestedPlayerId
        );

        if (isContestedPlayerCorrect) {
          updatedPlayers[contestedPlayerIndex].correctAnswers =
            (updatedPlayers[contestedPlayerIndex].correctAnswers || 0) + 1;
        } else {
          updatedPlayers[contestedPlayerIndex].wrongAnswers =
            (updatedPlayers[contestedPlayerIndex].wrongAnswers || 0) + 1;
        }
      } else {
        // Якщо гравець не відповів, це вважається неправильною відповіддю
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
    ...gameData.currentPhase,
    status: "post-answer",
    startAt: FieldValue.serverTimestamp(),
    // Додаємо стан карти після відповіді для відображення на фронтенді
    mapStatusAfter: { ...gameData.map.status },
  };

  // Якщо регіон був захоплений, оновлюємо mapStatusAfter
  if (winners.length === 1) {
    const winnerId = winners[0];
    updateData.currentPhase.mapStatusAfter[gameData.currentPhase.regionId] =
      winnerId;
  }

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
 * Handles timeout of "post-answer" phase
 */
async function handlePostAnswerTimeout(gameId, gameData, updateData) {
  // Add current phase to archive
  const phases = [...(gameData.phases || []), gameData.currentPhase];
  updateData.phases = phases;

  // Modify moves queue
  const moves = [...gameData.moves];

  // Remove oldest move if queue has more than 5 moves
  if (moves.length >= 5) {
    moves.shift();
  }

  // Add new move to end of queue
  const lastMove = moves[moves.length - 1];
  const playerIndex = gameData.players.findIndex(
    (player) => player.id === lastMove.playerId
  );
  const nextPlayerIndex = (playerIndex + 1) % gameData.players.length;
  const nextPlayerId = gameData.players[nextPlayerIndex].id;

  // Determine round number for new move
  let nextRound = lastMove.round;
  if (nextPlayerIndex === 0) {
    nextRound++; // New round if first player's turn
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

  // Check end game conditions
  if (await checkAndHandleGameEnd(gameId, gameData, updateData, nextRound)) {
    return; // Game ended
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
  // Create new phase
  const newPhaseObj = newPhase(
    moves.find((m) => m.id === gameData.currentPhase.id + 1),
    gameData.currentPhase
  );
  updateData.currentPhase = newPhaseObj;
  updateData.currentRound = newPhaseObj.round;

  // Schedule timeout for new phase
  const timeoutTaskId = await schedulePhaseTimeout(
    gameId,
    gameData.rules.timeForPlanning
  );
  updateData.currentPhase.timeoutTaskId = timeoutTaskId;

  // Save updated data
  await admin.firestore().collection("games").doc(gameId).update(updateData);
}
