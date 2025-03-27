// scripts/import-data.js
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
const fs = require("fs");
const serviceAccount = require("./service-account-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function importData() {
  try {
    // Зчитуємо GeoJSON файл як рядок
    const geoJsonString = fs.readFileSync("./data/ukraine.geojson", "utf8");

    // Зберігаємо GeoJSON як єдиний документ з id 'ukraine'
    await db.collection("maps").doc("ukraine").set({
      id: "ukraine",
      geoJson: geoJsonString,
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log("GeoJSON карта успішно імпортована");

    // Зчитуємо запитання з JSON файлу
    const questionsRaw = fs.readFileSync("./data/questions.json", "utf8");
    const questions = JSON.parse(questionsRaw);

    // Імпорт запитань
    const batch = db.batch();

    questions.forEach((question) => {
      const questionRef = db.collection("questions").doc();
      batch.set(questionRef, {
        ...question,
        createdAt: FieldValue.serverTimestamp(),
      });
    });

    await batch.commit();
    console.log(`Імпортовано ${questions.length} запитань`);
  } catch (error) {
    console.error("Помилка імпорту даних:", error);
  }
}

importData().catch(console.error);
