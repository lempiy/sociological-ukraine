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

    // Зчитуємо всі файли запитань з директорії data/questions
    const questionsDir = path.join(__dirname, "./data/questions");
    console.log(`Читаємо запитання з директорії ${questionsDir}`);

    // Перевіряємо, чи існує директорія
    if (!fs.existsSync(questionsDir)) {
      console.error(`Помилка: Директорія не знайдена: ${questionsDir}`);
      console.log(
        'Створіть директорію "data/questions" і додайте в неї JSON файли з запитаннями'
      );
      return;
    }

    // Отримуємо список всіх файлів у директорії
    const files = fs.readdirSync(questionsDir);

    // Фільтруємо тільки JSON файли
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.error(
        `Помилка: JSON файли не знайдені в директорії ${questionsDir}`
      );
      return;
    }

    console.log(`Знайдено ${jsonFiles.length} JSON файлів з запитаннями`);

    // Імпорт запитань
    const batch = db.batch();
    let questionCount = 0;

    // Проходимо по кожному файлу і зчитуємо запитання
    for (const file of jsonFiles) {
      const filePath = path.join(questionsDir, file);
      console.log(`Обробка файлу: ${filePath}`);

      const questionsRaw = fs.readFileSync(filePath, "utf8");
      let questions;

      try {
        questions = JSON.parse(questionsRaw);

        // Перевіряємо, чи є questions масивом
        if (!Array.isArray(questions)) {
          console.warn(`Файл ${file} не містить масиву запитань, пропускаємо`);
          continue;
        }

        // Додаємо кожне запитання з поточного файлу
        questions.forEach(async (question, index) => {
          // Використовуємо ім'я файлу і індекс для створення унікального ID
          const fileBaseName = path.basename(file, ".json");
          const questionRef = db
            .collection("questions")
            .doc(`emulator-${fileBaseName}-question-${index}`);

          batch.set(questionRef, {
            ...question,
            sourceFile: file, // Додаємо інформацію про файл-джерело
            createdAt: FieldValue.serverTimestamp(),
          });

          questionCount++;
        });
      } catch (error) {
        console.error(`Помилка парсингу JSON у файлі ${file}:`, error);
        continue;
      }
    }

    await batch.commit();

    console.log(`Імпортовано ${questionCount} запитань в емулятор`);

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
  const questionsDir = path.join(__dirname, "./data/questions");

  const geoJsonExists = fs.existsSync(geoJsonPath);
  const questionsDirExists = fs.existsSync(questionsDir);

  if (!geoJsonExists) {
    console.error(`Помилка: Файл не знайдено: ${geoJsonPath}`);
    console.log('Створіть директорію "data" і додайте файл "ukraine.geojson"');
  }

  if (!questionsDirExists) {
    console.error(`Помилка: Директорію не знайдено: ${questionsDir}`);
    console.log(
      'Створіть директорію "data/questions" і додайте в неї JSON файли з запитаннями'
    );
  } else {
    // Перевіряємо наявність JSON файлів у директорії
    const files = fs.readdirSync(questionsDir);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));

    if (jsonFiles.length === 0) {
      console.error(
        `Попередження: JSON файли не знайдені в директорії ${questionsDir}`
      );
    } else {
      console.log(`Знайдено ${jsonFiles.length} JSON файлів з запитаннями`);
    }
  }

  return geoJsonExists && questionsDirExists;
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
