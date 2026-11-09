const mongoose = require("mongoose");

const BatchSchema = new mongoose.Schema({
  batchNumber: {
    type: String,
    default: () => "B-" + Date.now().toString(36).toUpperCase()
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  initialQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  arrivalDate: {
    type: Date,
    default: Date.now
  },
  expiryDate: {
    type: Date,
    required: true
  },
  shelfLifeDays: {
    type: Number,
    default: 3
  },
  unitCost: {
    type: Number,
    default: 0
  },
  source: {
    type: String,
    default: "جرد مبدئي" // جرد مبدئي / بضاعة واردة / فاتورة
  },
  status: {
    type: String,
    enum: ["active", "expiring_soon", "expired", "depleted"],
    default: "active"
  },
  notes: {
    type: String,
    default: ""
  }
});

const InventoryItemSchema = new mongoose.Schema(
  {
    code: {
      type: String,
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
      trim: true,
      index: true
    },
    category: {
      type: String,
      required: true,
      default: "مخبوزات وحلويات",
      index: true
    },
    currentStock: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    unit: {
      type: String,
      default: "قطعة"
    },
    unitCost: {
      type: Number,
      default: 0,
      min: 0
    },
    shelfLifeType: {
      type: String,
      enum: ["fresh_3d", "pastry_5d", "frozen_14d", "custom"],
      default: "fresh_3d"
    },
    defaultExpiryDays: {
      type: Number,
      default: 3
    },
    minStockAlert: {
      type: Number,
      default: 2
    },
    batches: [BatchSchema],
    lastMovementDate: {
      type: Date,
      default: Date.now
    },
    notes: {
      type: String,
      default: ""
    }
  },
  { timestamps: true }
);

// Virtual to recalculate total stock from active batches
InventoryItemSchema.methods.recalculateStock = function () {
  if (this.batches && this.batches.length > 0) {
    this.currentStock = this.batches.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
  }
  return this.currentStock;
};

module.exports = mongoose.model("InventoryItem", InventoryItemSchema);

