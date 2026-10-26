require("dotenv").config();

const mongoose = require("mongoose");
const { connectDB } = require("./config/db");
const { DEFAULT_CATALOG } = require("./config/defaultCatalog");
const { INITIAL_RAW_ORDERS_TEXT } = require("./config/initialData");
const ParserService = require("./services/parserService");
const BillingService = require("./services/billingService");
const Item = require("./models/Item");
const Order = require("./models/Order");

async function seed() {
  try {
    await connectDB();
    console.log("Database connected for seeding.");

    const operations = DEFAULT_CATALOG.map(item => ({
      updateOne: {
        filter: { code: item.code },
        update: { $setOnInsert: item },
        upsert: true
      }
    }));

    const result = await Item.bulkWrite(operations, { ordered: false });
    console.log(`Added ${result.upsertedCount} missing catalog products.`);

    const orderCount = await Order.countDocuments();
    if (orderCount === 0) {
      const catalog = await Item.find().lean();
      const parser = new ParserService(catalog);
      const sections = parser.parseOrdersText(INITIAL_RAW_ORDERS_TEXT);

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        const calculation = BillingService.calculateOrder(section.items);
        await Order.create({
          orderNumber: `S${15800 + i}`,
          branchName: section.name,
          totalUnits: calculation.totalUnits,
          untaxedTotal: calculation.untaxedTotal,
          schd5Base: calculation.schd5Base,
          schd5Amount: calculation.schd5Amount,
          vat14Base: calculation.vat14Base,
          vat14Amount: calculation.vat14Amount,
          totalTaxes: calculation.totalTaxes,
          grandTotal: calculation.grandTotal,
          items: calculation.items.map(item => ({
            code: item.code,
            nameAr: item.nameAr,
            nameEn: item.nameEn,
            category: item.category,
            unit: item.unit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxType: item.taxType,
            taxRate: item.taxRate,
            isMissing: item.isMissing,
            subtotalUntaxed: item.subtotalUntaxed,
            subtotalTax: item.subtotalTax,
            subtotalTaxInclusive: item.subtotalTaxInclusive
          }))
        });
      }
      console.log(`Added ${sections.length} starter orders.`);
    } else {
      console.log(`Existing orders found (${orderCount}); leaving them unchanged.`);
    }
  } catch (err) {
    console.error("Seed error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    console.log("Seeding process completed.");
  }
}

seed();
