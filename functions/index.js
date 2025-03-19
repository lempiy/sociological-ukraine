// functions/index.js
const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Ініціалізація Firebase Admin
admin.initializeApp();

const regionFunctions = functions.region("europe-west1");

// Імпорт модулів з окремих файлів
const gameCreationModule = require("./modules/game-creation");
const gameOperationsModule = require("./modules/game-operations");
const gameAnswersModule = require("./modules/game-answers");
const gameTimeoutsModule = require("./modules/game-timeouts");
const gameUtilsModule = require("./modules/game-utils");

// Експорт всіх Cloud Functions

// Функції для створення та керування грою
exports.createGame = gameCreationModule.createGame;
exports.joinGame = gameCreationModule.joinGame;
exports.startGame = gameOperationsModule.startGame;
exports.leaveGame = gameOperationsModule.leaveGame;

// Функції для ігрового процесу
exports.setPlanningResult = gameAnswersModule.setPlanningResult;
exports.setAnswer = gameAnswersModule.setAnswer;

// Функція для обробки таймаутів
exports.gameCurrentPhaseTimeout = gameTimeoutsModule.gameCurrentPhaseTimeout;
