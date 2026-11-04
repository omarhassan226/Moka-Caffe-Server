const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      default: ""
    },
    supplier: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      default: "خامات وبن",
      index: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    month: {
      type: String, // Format: YYYY-MM (e.g., "2026-11")
      index: true
    },
    imageData: {
      type: String, // Base64 data URL or external URL
      default: ""
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

InvoiceSchema.pre("save", function (next) {
  if (this.invoiceDate) {
    const d = new Date(this.invoiceDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    this.month = `${yyyy}-${mm}`;
  }
  next();
});

module.exports = mongoose.model("Invoice", InvoiceSchema);

