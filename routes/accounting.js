const express = require("express");
const {
  getMonthlySummary,
  getInvoices,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  scanInvoiceImage,
  getWasteRecords,
  createWasteRecord,
  deleteWasteRecord,
  getSalesRecords,
  createSalesRecord,
  deleteSalesRecord
} = require("../controllers/accountingController");

const router = express.Router();

// Monthly Overview Summary & P&L
router.get("/summary", getMonthlySummary);

// Invoices (صور الفواتير والمشتريات والمسح بالذكاء الاصطناعي)
router.get("/invoices", getInvoices);
router.post("/invoices", createInvoice);
router.post("/invoices/scan", scanInvoiceImage);
router.put("/invoices/:id", updateInvoice);
router.delete("/invoices/:id", deleteInvoice);

// Waste (الهالك والضايع)
router.get("/waste", getWasteRecords);
router.post("/waste", createWasteRecord);
router.delete("/waste/:id", deleteWasteRecord);

// Sales (المبيعات)
router.get("/sales", getSalesRecords);
router.post("/sales", createSalesRecord);
router.delete("/sales/:id", deleteSalesRecord);

module.exports = router;

