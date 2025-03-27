// functions/constants.js

// Константа з кольорами для гравців
exports.PLAYER_COLORS = [
  "#C5B1E0",
  "#C9ECD7",
  "#A2D2E2",
  "#FFE5B9",
  "#D7C1E0",
  "#E2EFC7",
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
