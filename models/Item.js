const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    nameAr: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    nameEn: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      required: true,
      index: true,
      default: "أصناف عامة"
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    taxType: {
      type: String,
      enum: ["SCHD_5", "VAT_14", "NONE"],
      default: "SCHD_5"
    },
    taxRate: {
      type: Number,
      default: 0.05
    },
    unit: {
      type: String,
      default: "قطعة"
    },
    aliases: [{
      type: String,
      trim: true
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Item", ItemSchema);
