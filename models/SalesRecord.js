const mongoose = require("mongoose");

const SalesRecordSchema = new mongoose.Schema(
  {
    recordDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    month: {
      type: String, // Format: YYYY-MM
      index: true
    },
    branchName: {
      type: String,
      default: "الفرع الرئيسي"
    },
    cashAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    visaAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    onlineAmount: {
      type: Number,
      default: 0,
      min: 0
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0
    },
    ordersCount: {
      type: Number,
      default: 0,
      min: 0
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

SalesRecordSchema.pre("save", function (next) {
  if (this.recordDate) {
    const d = new Date(this.recordDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    this.month = `${yyyy}-${mm}`;
  }
  // Auto calculate total if not explicitly provided or if zero
  if (!this.totalAmount && (this.cashAmount || this.visaAmount || this.onlineAmount)) {
    this.totalAmount = (Number(this.cashAmount) || 0) + (Number(this.visaAmount) || 0) + (Number(this.onlineAmount) || 0);
  }
  next();
});

module.exports = mongoose.model("SalesRecord", SalesRecordSchema);

