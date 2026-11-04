const AccountingService = require("../services/accountingService");
const AiInvoiceService = require("../services/aiInvoiceService");
const asyncHandler = require("../middlewares/asyncHandler");

/**
 * @desc Scan invoice photo with AI Vision
 * @route POST /api/accounting/invoices/scan
 */
const scanInvoiceImage = asyncHandler(async (req, res) => {
  const { imageData, apiKey } = req.body;
  const headerKey = req.headers["x-gemini-api-key"];
  const result = await AiInvoiceService.scanInvoice({
    imageData,
    apiKey: apiKey || headerKey
  });
  res.json(result);
});

/**
 * @desc Get monthly overview & P&L calculation
 * @route GET /api/accounting/summary?month=YYYY-MM
 */
const getMonthlySummary = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const summary = await AccountingService.getMonthlySummary(month);
  res.json(summary);
});

/**
 * @desc Get all invoices
 * @route GET /api/accounting/invoices
 */
const getInvoices = asyncHandler(async (req, res) => {
  const { month, category } = req.query;
  const invoices = await AccountingService.getInvoices({ month, category });
  res.json(invoices);
});

/**
 * @desc Create new invoice with optional image
 * @route POST /api/accounting/invoices
 */
const createInvoice = asyncHandler(async (req, res) => {
  const { invoiceNumber, supplier, category, amount, invoiceDate, imageData, notes } = req.body;
  if (!supplier || amount === undefined || amount === null) {
    return res.status(400).json({ error: "اسم المورد والمبلغ مطلوبان" });
  }

  const invoice = await AccountingService.createInvoice({
    invoiceNumber,
    supplier,
    category,
    amount: Number(amount),
    invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
    imageData: imageData || "",
    notes: notes || ""
  });

  res.status(201).json(invoice);
});

/**
 * @desc Delete invoice
 * @route DELETE /api/accounting/invoices/:id
 */
const deleteInvoice = asyncHandler(async (req, res) => {
  const deleted = await AccountingService.deleteInvoice(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "الفاتورة غير موجودة" });
  }
  res.json({ success: true, message: "تم حذف الفاتورة بنجاح" });
});

/**
 * @desc Get all waste records
 * @route GET /api/accounting/waste
 */
const getWasteRecords = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const waste = await AccountingService.getWasteRecords({ month });
  res.json(waste);
});

/**
 * @desc Create waste record
 * @route POST /api/accounting/waste
 */
const createWasteRecord = asyncHandler(async (req, res) => {
  const { itemName, quantity, unit, lossValue, reason, wasteDate, responsible, notes } = req.body;
  if (!itemName || lossValue === undefined || lossValue === null) {
    return res.status(400).json({ error: "اسم الصنف وقيمة الخسارة مطلوبان" });
  }

  const waste = await AccountingService.createWasteRecord({
    itemName,
    quantity: Number(quantity) || 1,
    unit: unit || "قطعة",
    lossValue: Number(lossValue),
    reason: reason || "تلف / سوء تخزين",
    wasteDate: wasteDate ? new Date(wasteDate) : new Date(),
    responsible: responsible || "الشيفت",
    notes: notes || ""
  });

  res.status(201).json(waste);
});

/**
 * @desc Delete waste record
 * @route DELETE /api/accounting/waste/:id
 */
const deleteWasteRecord = asyncHandler(async (req, res) => {
  const deleted = await AccountingService.deleteWasteRecord(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "سجل الهالك غير موجود" });
  }
  res.json({ success: true, message: "تم حذف سجل الهالك بنجاح" });
});

/**
 * @desc Get sales records
 * @route GET /api/accounting/sales
 */
const getSalesRecords = asyncHandler(async (req, res) => {
  const { month } = req.query;
  const sales = await AccountingService.getSalesRecords({ month });
  res.json(sales);
});

/**
 * @desc Create sales record
 * @route POST /api/accounting/sales
 */
const createSalesRecord = asyncHandler(async (req, res) => {
  const { recordDate, branchName, cashAmount, visaAmount, onlineAmount, totalAmount, ordersCount, notes } = req.body;
  
  const total = Number(totalAmount) || (Number(cashAmount || 0) + Number(visaAmount || 0) + Number(onlineAmount || 0));
  if (!total && total !== 0) {
    return res.status(400).json({ error: "مبلغ المبيعات مطلوب" });
  }

  const sales = await AccountingService.createSalesRecord({
    recordDate: recordDate ? new Date(recordDate) : new Date(),
    branchName: branchName || "الفرع الرئيسي",
    cashAmount: Number(cashAmount) || 0,
    visaAmount: Number(visaAmount) || 0,
    onlineAmount: Number(onlineAmount) || 0,
    totalAmount: total,
    ordersCount: Number(ordersCount) || 0,
    notes: notes || ""
  });

  res.status(201).json(sales);
});

/**
 * @desc Delete sales record
 * @route DELETE /api/accounting/sales/:id
 */
const deleteSalesRecord = asyncHandler(async (req, res) => {
  const deleted = await AccountingService.deleteSalesRecord(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: "سجل المبيعات غير موجود" });
  }
  res.json({ success: true, message: "تم حذف سجل المبيعات بنجاح" });
});

module.exports = {
  getMonthlySummary,
  getInvoices,
  createInvoice,
  deleteInvoice,
  scanInvoiceImage,
  getWasteRecords,
  createWasteRecord,
  deleteWasteRecord,
  getSalesRecords,
  createSalesRecord,
  deleteSalesRecord
};

