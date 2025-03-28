// functions/modules/game-creation.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const functions = require("firebase-functions/v1");
const { PLAYER_COLORS, GAME_STATUS } = require("../constants");
const { startGameInternal } = require("./game-operations");

/**
 * Створює нову гру з вказаними параметрами
 */
exports.createGame = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Перевірка аутентифікації
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Для створення гри потрібна аутентифікація"
      );
    }

    // Валідація вхідних параметрів
    const {
      gameName,
      timeForPlanning,
      timeForAnswer,
      numberOfPlayers,
      maxRounds,
    } = data;

    if (!gameName || !timeForPlanning || !timeForAnswer || !numberOfPlayers) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Недостатньо параметрів для створення гри"
      );
    }

    if (numberOfPlayers < 1 || numberOfPlayers > 6) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Кількість гравців має бути від 1 до 6"
      );
    }

    try {
      // Генерація унікального коду приєднання (4 цифри)
      const joinCode = Math.floor(1000 + Math.random() * 9000).toString();

      // Отримання даних користувача
      const userId = context.auth.uid;
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      const userData = userDoc.data() || {};

      // Отримання даних карти України
      const mapDoc = await admin
        .firestore()
        .collection("maps")
        .doc("ukraine")
        .get();
      const mapData = mapDoc.data();

      if (!mapData) {
        throw new Error("Не знайдено карту України в базі даних");
      }

      // Визначення порожньої карти (всі регіони нейтральні)
      const geoJsonObj = JSON.parse(mapData.geoJson);
      const regions = geoJsonObj.features.map(
        (feature) => feature.properties["iso3166-2"]
      );

      const mapStatus = {};
      regions.forEach((regionId) => {
        mapStatus[regionId] = ""; // Порожній рядок означає нейтральний регіон
      });

      // Створення документа гри
      const gameData = {
        id: "", // Буде замінено на ID документа після створення
        name: gameName,
        map: {
          id: "ukraine",
          updatedAt: FieldValue.serverTimestamp(),
          status: mapStatus,
        },
        players: [
          {
            id: userId,
            displayName: userData.displayName || "Гравець",
            avatarUrl: userData.photoURL || "",
            color: PLAYER_COLORS[0], // Перший колір з константи
            isCreator: true,
            isWinner: false,
          },
        ],
        moves: [],
        rules: {
          timeForPlanning: parseInt(timeForPlanning),
          timeForPostPlanning: 2, // 2 секунди на перехід між фазами
          timeForAnswer: parseInt(timeForAnswer),
          timeForPostAnswer: 5, // 10 секунд на показ результату
          numberOfPlayers: parseInt(numberOfPlayers),
          maxRounds: parseInt(maxRounds) || 0,
        },
        status: GAME_STATUS.LOBBY,
        currentRound: 0,
        currentPhase: null,
        phases: [],
        joinCode: joinCode,
        planningSkippedCount: 0, // Лічильник пропущених ходів
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      };

      // Збереження гри в Firestore
      const gameRef = await admin.firestore().collection("games").add(gameData);
      const gameId = gameRef.id;

      if (gameData.players.length === gameData.rules.numberOfPlayers) {
        // Якщо досягнуто максимальної кількості гравців, автоматично запускаємо гру
        await startGameInternal(gameId);
      }

      // Повернення ID гри клієнту
      return { gameId };
    } catch (error) {
      console.error("Помилка створення гри:", error);
      throw new functions.https.HttpsError(
        "internal",
        "Помилка при створенні гри"
      );
    }
  });

/**
 * Дозволяє користувачу приєднатися до існуючої гри за кодом
 */
exports.joinGame = functions
  .region("europe-central2")
  .https.onCall(async (data, context) => {
    // Перевірка аутентифікації
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Для приєднання до гри потрібна аутентифікація"
      );
    }

    // Валідація вхідних параметрів
    const { joinCode } = data;

    if (!joinCode) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Не вказано код приєднання до гри"
      );
    }

    try {
      // Отримання даних користувача
      const userId = context.auth.uid;
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .get();
      const userData = userDoc.data() || {};

      // Пошук гри за кодом приєднання
      const fiveHoursAgo = new Date();
      fiveHoursAgo.setHours(fiveHoursAgo.getHours() - 5);

      const gamesQuery = await admin
        .firestore()
        .collection("games")
        .where("joinCode", "==", joinCode)
        .where("status", "==", GAME_STATUS.LOBBY)
        .where("createdAt", ">", fiveHoursAgo)
        .limit(1)
        .get();

      if (gamesQuery.empty) {
        throw new functions.https.HttpsError(
          "not-found",
          "Гру не знайдено або термін приєднання закінчився"
        );
      }

      const gameDoc = gamesQuery.docs[0];
      const gameData = gameDoc.data();
      const gameId = gameDoc.id;

      // Перевірка, чи не перевищено максимальну кількість гравців
      if (gameData.players.length >= gameData.rules.numberOfPlayers) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Максимальну кількість гравців для цієї гри вже досягнуто"
        );
      }

      // Перевірка, чи не є користувач уже учасником гри
      const isPlayerAlreadyJoined = gameData.players.some(
        (player) => player.id === userId
      );

      if (isPlayerAlreadyJoined) {
        // Якщо користувач уже в грі, просто повертаємо ID гри
        return { gameId };
      }

      // Додавання користувача до списку гравців
      const playerColor = PLAYER_COLORS[gameData.players.length];

      const newPlayer = {
        id: userId,
        displayName: userData.displayName || "Гравець",
        avatarUrl: userData.photoURL || "",
        color: playerColor,
        isCreator: false,
        isWinner: false,
      };

      // Оновлення документа гри
      await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .update({
          players: FieldValue.arrayUnion(newPlayer),
          updatedAt: FieldValue.serverTimestamp(),
        });

      // Перевірка, чи досягнуто максимальної кількості гравців
      const updatedGameDoc = await admin
        .firestore()
        .collection("games")
        .doc(gameId)
        .get();
      const updatedGameData = updatedGameDoc.data();

      if (
        updatedGameData.players.length === updatedGameData.rules.numberOfPlayers
      ) {
        // Якщо досягнуто максимальної кількості гравців, автоматично запускаємо гру
        await startGameInternal(gameId);
      }

      // Повернення ID гри клієнту
      return { gameId };
    } catch (error) {
      console.error("Помилка приєднання до гри:", error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError(
        "internal",
        "Помилка при приєднанні до гри"
      );
    }
  });
