// scripts/import-data.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function importData() {
  try {
    // Зчитуємо GeoJSON файл як рядок
    const geoJsonPath = path.resolve("./data/ukraine.geojson");
    console.log(`Читаємо GeoJSON з ${geoJsonPath}`);
    const geoJsonString = fs.readFileSync(geoJsonPath, "utf8");

    // Зберігаємо GeoJSON як єдиний документ з id 'ukraine'
    await db.collection("maps").doc("ukraine").set({
      id: "ukraine",
      geoJson: geoJsonString,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log("GeoJSON карта успішно імпортована");

    // Зчитуємо всі файли запитань з директорії data/questions
    const questionsDir = path.resolve("./data/questions");
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

    let totalQuestions = 0;

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

        // Імпорт запитань порціями по 400 (через обмеження Firestore на 500 операцій у батчі)
        for (let i = 0; i < questions.length; i += 400) {
          const batch = db.batch();
          const chunk = questions.slice(i, i + 400);

          chunk.forEach((question) => {
            const questionRef = db.collection("questions").doc();
            batch.set(questionRef, {
              ...question,
              sourceFile: file, // Додаємо інформацію про файл-джерело
              createdAt: FieldValue.serverTimestamp(),
            });
          });

          await batch.commit();
          totalQuestions += chunk.length;
          console.log(
            `Імпортовано частину запитань: ${i + chunk.length}/${
              questions.length
            } з файлу ${file}`
          );
        }
      } catch (error) {
        console.error(`Помилка парсингу JSON у файлі ${file}:`, error);
        continue;
      }
    }

    console.log(
      `Загалом імпортовано ${totalQuestions} запитань з ${jsonFiles.length} файлів`
    );
  } catch (error) {
    console.error("Помилка імпорту даних:", error);
    console.error(error.stack);
  }
}

importData().catch((error) => {
  console.error("Помилка виконання скрипту:", error);
  process.exit(1);
});
