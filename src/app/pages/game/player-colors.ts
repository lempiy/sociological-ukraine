/**
 * Палітра кольорів для гравців
 * Кольори повинні бути достатньо контрастними для відрізнення на карті
 */
export const PLAYER_COLORS = [
    '#3F51B5', // Синій (індіго)
    '#E91E63', // Рожевий
    '#4CAF50', // Зелений
    '#FF9800', // Помаранчевий
    '#9C27B0', // Фіолетовий
    '#00BCD4', // Блакитний
];

/**
 * Отримує колір гравця за його індексом
 * @param index Індекс гравця
 * @returns Колір у форматі HEX
 */
export function getPlayerColor(index: number): string {
    return PLAYER_COLORS[index % PLAYER_COLORS.length];
}