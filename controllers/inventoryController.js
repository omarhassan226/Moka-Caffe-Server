const path = require("path");
const fs = require("fs");
const InventoryService = require("../services/inventoryService");

class InventoryController {
  /**
   * GET /api/inventory
   */
  static async getOverview(req, res, next) {
    try {
      const { filter, search } = req.query;
      const data = await InventoryService.getInventoryOverview({ filter, search });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/import-initial
   */
  static async importInitial(req, res, next) {
    try {
      const { fileData, baselineDate } = req.body;
      let fileBuffer = null;
      let filePath = null;

      if (fileData) {
        const cleanBase64 = fileData.replace(/^data:.*?;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
      } else {
        // Fallback to local default file
        const defaultPath = path.join(__dirname, "../../frontend/جرد موكا 9-11-2026.xlsx");
        if (fs.existsSync(defaultPath)) {
          filePath = defaultPath;
        } else {
          throw new Error("يرجى رفع ملف شيت الجرد بصيغة Excel");
        }
      }

      const result = await InventoryService.importInitialInventory({
        fileBuffer,
        filePath,
        baselineDate: baselineDate || "2026-11-09"
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/import-waste
   */
  static async importWaste(req, res, next) {
    try {
      const { fileData, autoCreateWasteRecords } = req.body;
      let fileBuffer = null;
      let filePath = null;

      if (fileData) {
        const cleanBase64 = fileData.replace(/^data:.*?;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
      } else {
        const defaultPath = path.join(__dirname, "../../frontend/west 11.xlsx");
        if (fs.existsSync(defaultPath)) {
          filePath = defaultPath;
        } else {
          throw new Error("يرجى رفع ملف شيت الويست بصيغة Excel");
        }
      }

      const result = await InventoryService.importWasteDeduction({
        fileBuffer,
        filePath,
        autoCreateWasteRecords: autoCreateWasteRecords !== false
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/import-incoming
   */
  static async importIncoming(req, res, next) {
    try {
      const { items, fileData, arrivalDate } = req.body;
      let fileBuffer = null;

      if (fileData) {
        const cleanBase64 = fileData.replace(/^data:.*?;base64,/, "");
        fileBuffer = Buffer.from(cleanBase64, "base64");
      }

      const result = await InventoryService.importIncomingGoods({
        items,
        fileBuffer,
        arrivalDate: arrivalDate || new Date()
      });

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/deduct-expired
   */
  static async deductExpired(req, res, next) {
    try {
      const { itemsList } = req.body;
      const result = await InventoryService.deductExpiredGoods({
        autoDeductAll: true,
        itemsList
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/adjust
   */
  static async adjustStock(req, res, next) {
    try {
      const { itemId, newQuantity, reason } = req.body;
      if (!itemId) throw new Error("مُعرف الصنف مطلوب");
      const result = await InventoryService.adjustStock({ itemId, newQuantity, reason });
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/inventory/movements
   */
  static async getMovements(req, res, next) {
    try {
      const { limit, month, type } = req.query;
      const movements = await InventoryService.getMovements({ limit, month, type });
      res.json({ success: true, count: movements.length, data: movements });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/inventory/sync-local-sheets
   * Automatically initializes starting stock from 'جرد موكا 9-11-2026.xlsx'
   * and deducts waste from 'west 11.xlsx' in one clean automated flow!
   */
  static async syncLocalSheets(req, res, next) {
    try {
      const invPath = path.join(__dirname, "../../frontend/جرد موكا 9-11-2026.xlsx");
      const wastePath = path.join(__dirname, "../../frontend/west 11.xlsx");

      if (!fs.existsSync(invPath)) {
        throw new Error("ملف جرد موكا 9-11-2026.xlsx غير موجود");
      }
      if (!fs.existsSync(wastePath)) {
        throw new Error("ملف west 11.xlsx غير موجود");
      }

      // 1. Initial count
      const initResult = await InventoryService.importInitialInventory({
        filePath: invPath,
        baselineDate: "2026-11-09"
      });

      // 2. Waste deduction
      const wasteResult = await InventoryService.importWasteDeduction({
        filePath: wastePath,
        autoCreateWasteRecords: true
      });

      // 3. Current Overview
      const overview = await InventoryService.getInventoryOverview();

      res.json({
        success: true,
        message: `تم تهيئة المخزن بشيت الجرد (${initResult.totalUnitsAdded} قطعة) وخصم الويست (${wasteResult.totalWasteUnits} قطعة) وتحديث الأرصدة تلقائياً!`,
        init: initResult,
        waste: wasteResult,
        currentStockUnits: overview.kpi.totalStockUnits,
        totalValuation: overview.kpi.totalStockValuation
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = InventoryController;
