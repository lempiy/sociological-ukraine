// scripts/seed-emulator.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

// Встановлюємо змінну середовища для використання емулятора Firestore
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8081";

// Ініціалізуємо Firebase Admin для роботи з емулятором
// Для емулятора нам не потрібен сертифікат service account
admin.initializeApp({
  projectId: "sociology-ukraine", // Вкажіть ваш project ID
});

const db = admin.firestore();

async function importData() {
  try {
    // Зчитуємо GeoJSON файл як рядок
    const geoJsonPath = path.join(__dirname, "./data/ukraine.geojson");
    console.log(`Читаємо GeoJSON з ${geoJsonPath}`);
    const geoJsonString = fs.readFileSync(geoJsonPath, "utf8");

    // Зберігаємо GeoJSON як єдиний документ з id 'ukraine'
    await db.collection("maps").doc("ukraine").set({
      id: "ukraine",
      geoJson: geoJsonString,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log("GeoJSON карта успішно імпортована в емулятор");

    // Зчитуємо запитання з JSON файлу
    const questionsPath = path.join(__dirname, "./data/questions.json");
    console.log(`Читаємо запитання з ${questionsPath}`);
    const questionsRaw = fs.readFileSync(questionsPath, "utf8");
    const questions = JSON.parse(questionsRaw);

    // Імпорт запитань
    const batch = db.batch();

    questions.forEach((question, index) => {
      // Додаємо унікальний ID для кращого відстеження в емуляторі
      const questionRef = db
        .collection("questions")
        .doc(`emulator-question-${index}`);
      batch.set(questionRef, {
        ...question,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`Імпортовано ${questions.length} запитань в емулятор`);

    // Додатково можемо створити тестовий документ користувача
    await db.collection("users").doc("test-user-1").set({
      id: "test-user-1",
      displayName: "Тестовий Користувач",
      email: "test@example.com",
      photoURL: "https://via.placeholder.com/150",
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log("Тестовий користувач успішно доданий в емулятор");
  } catch (error) {
    console.error("Помилка імпорту даних в емулятор:", error);
    console.error(error.stack);
  }
}

// Перевіряємо наявність файлів перед запуском
function checkFiles() {
  const geoJsonPath = path.join(__dirname, "./data/ukraine.geojson");
  const questionsPath = path.join(__dirname, "./data/questions.json");

  const geoJsonExists = fs.existsSync(geoJsonPath);
  const questionsExist = fs.existsSync(questionsPath);

  if (!geoJsonExists) {
    console.error(`Помилка: Файл не знайдено: ${geoJsonPath}`);
    console.log('Створіть директорію "data" і додайте файл "ukraine.geojson"');
  }

  if (!questionsExist) {
    console.error(`Помилка: Файл не знайдено: ${questionsPath}`);
    console.log('Створіть директорію "data" і додайте файл "questions.json"');
  }

  return geoJsonExists && questionsExist;
}

// Запускаємо скрипт, якщо файли існують
if (checkFiles()) {
  importData()
    .then(() =>
      console.log("Імпорт даних в емулятор Firebase завершено успішно")
    )
    .catch((error) => console.error("Помилка під час імпорту:", error));
} else {
  console.log("Імпорт даних не виконано через відсутність необхідних файлів.");
}
