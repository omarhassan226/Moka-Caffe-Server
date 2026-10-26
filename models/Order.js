const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  item: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Item"
  },
  code: String,
  nameAr: { type: String, required: true },
  nameEn: String,
  category: String,
  unit: { type: String, default: "قطعة" },
  quantity: { type: Number, required: true, min: 0.1 },
  unitPrice: { type: Number, required: true },
  taxType: { type: String, enum: ["SCHD_5", "VAT_14", "NONE"], default: "SCHD_5" },
  taxRate: { type: Number, default: 0.05 },
  isMissing: { type: Boolean, default: false },
  subtotalUntaxed: Number,
  subtotalTax: Number,
  subtotalTaxInclusive: Number
});

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      index: true
    },
    branchName: {
      type: String,
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["draft", "confirmed", "invoiced", "delivered"],
      default: "confirmed"
    },
    orderDate: {
      type: Date,
      default: Date.now
    },
    salesperson: {
      type: String,
      default: "abd elrahman khaled"
    },
    client: {
      name: { type: String, default: "Daily Dose" },
      branch: { type: String, default: "Daily Dose Zamalek" },
      taxId: { type: String, default: "560483929" }
    },
    items: [OrderItemSchema],
    totalUnits: { type: Number, default: 0 },
    untaxedTotal: { type: Number, default: 0 },
    schd5Base: { type: Number, default: 0 },
    schd5Amount: { type: Number, default: 0 },
    vat14Base: { type: Number, default: 0 },
    vat14Amount: { type: Number, default: 0 },
    totalTaxes: { type: Number, default: 0 },
    grandTotal: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
