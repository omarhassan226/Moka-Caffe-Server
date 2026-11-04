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
      type: String, // Primary/cover base64 image
      default: ""
    },
    images: {
      type: [String], // Array of images for multi-page invoices (up to 10+ pages)
      default: []
    },
    pageCount: {
      type: Number,
      default: 1
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

  // Handle multi-image pages synchronization
  if (Array.isArray(this.images) && this.images.length > 0) {
    this.pageCount = this.images.length;
    if (!this.imageData) {
      this.imageData = this.images[0];
    }
  } else if (this.imageData) {
    this.images = [this.imageData];
    this.pageCount = 1;
  }

  next();
});

module.exports = mongoose.model("Invoice", InvoiceSchema);
