// functions/constants.js

// Константа з кольорами для гравців
exports.PLAYER_COLORS = [
  "#FF5733", // Червоний
  "#33FF57", // Зелений
  "#3357FF", // Синій
  "#F3FF33", // Жовтий
  "#FF33F6", // Рожевий
  "#33FFF6", // Бірюзовий
];

// Константи для статусів гри
exports.GAME_STATUS = {
  LOBBY: "lobby",
  RUNNING: "running",
  FINISHED: "finished",
  SKIPPED: "skipped",
};

// Константи для статусів фаз
exports.PHASE_STATUS = {
  PLANNING: "planning",
  POST_PLANNING: "post-planning",
  ANSWER: "answer",
  POST_ANSWER: "post-answer",
  SKIPPED: "skipped",
};

// Константи для типів питань
exports.QUESTION_TYPE = {
  VARIANT: "variant",
  NUMBER: "number",
};

// Налаштування для Cloud Tasks
exports.CLOUD_TASKS_CONFIG = {
  LOCATION: "europe-central2",
  QUEUE: "game-timeouts",
};
