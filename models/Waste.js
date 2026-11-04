const mongoose = require("mongoose");

const WasteSchema = new mongoose.Schema(
  {
    itemName: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01
    },
    unit: {
      type: String,
      default: "قطعة"
    },
    lossValue: {
      type: Number,
      required: true,
      min: 0
    },
    reason: {
      type: String,
      default: "تلف / سوء تخزين",
      index: true
    },
    wasteDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    month: {
      type: String, // Format: YYYY-MM
      index: true
    },
    responsible: {
      type: String,
      default: "الشيفت"
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

WasteSchema.pre("save", function (next) {
  if (this.wasteDate) {
    const d = new Date(this.wasteDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    this.month = `${yyyy}-${mm}`;
  }
  next();
});

module.exports = mongoose.model("Waste", WasteSchema);

