require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("./config/db");
const { DEFAULT_CATALOG } = require("./config/defaultCatalog");
const Item = require("./models/Item");

async function seed() {
  try {
    await connectDB();
    console.log("Database connected for seeding.");

    // Only seed the real master product catalog (if missing)
    const operations = DEFAULT_CATALOG.map(item => ({
      updateOne: {
        filter: { code: item.code },
        update: { $setOnInsert: item },
        upsert: true
      }
    }));

    const result = await Item.bulkWrite(operations, { ordered: false });
    console.log(`Synced master catalog: ${result.upsertedCount} new products added.`);
    console.log("No fake orders or fake demo data seeded. Database remains clean.");
  } catch (err) {
    console.error("Seed error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Seeding process completed.");
  }
}

seed();
