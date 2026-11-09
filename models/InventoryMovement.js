const mongoose = require("mongoose");

const InventoryMovementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["IN_INITIAL", "IN_PURCHASE", "OUT_WASTE", "OUT_EXPIRED", "OUT_SALE", "ADJUSTMENT"],
      required: true,
      index: true
    },
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "InventoryItem",
      index: true
    },
    itemName: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    quantity: {
      type: Number,
      required: true
    },
    previousStock: {
      type: Number,
      default: 0
    },
    newStock: {
      type: Number,
      default: 0
    },
    unitCost: {
      type: Number,
      default: 0
    },
    totalValue: {
      type: Number,
      default: 0
    },
    reason: {
      type: String,
      default: ""
    },
    reference: {
      type: String,
      default: "" // File name, invoice number, etc.
    },
    movementDate: {
      type: Date,
      default: Date.now,
      index: true
    },
    month: {
      type: String, // YYYY-MM
      index: true
    }
  },
  { timestamps: true }
);

InventoryMovementSchema.pre("save", function (next) {
  if (this.movementDate) {
    const d = new Date(this.movementDate);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    this.month = `${yyyy}-${mm}`;
  }
  next();
});

module.exports = mongoose.model("InventoryMovement", InventoryMovementSchema);

