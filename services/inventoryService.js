const XLSX = require("xlsx");
const InventoryItem = require("../models/InventoryItem");
const InventoryMovement = require("../models/InventoryMovement");
const Waste = require("../models/Waste");
const { DEFAULT_CATALOG } = require("../config/defaultCatalog");

class InventoryService {
  /**
   * Determine default shelf life in days based on item name and category
   */
  static getShelfLifeConfig(name = "", category = "") {
    const s = (name + " " + category).toLowerCase();

    // 1. Frozen / Long-life (14 days)
    if (
      s.includes("molten") ||
      s.includes("مولتن") ||
      s.includes("volcano") ||
      s.includes("بركان") ||
      s.includes("chees") ||
      s.includes("تشيز") ||
      s.includes("fudge") ||
      s.includes("فادج") ||
      s.includes("مجمد") ||
      s.includes("frozen")
    ) {
      return { shelfLifeDays: 14, shelfLifeType: "frozen_14d" };
    }

    // 2. Cookies, Muffins, English Cakes, Brownies (5 days)
    if (
      s.includes("cookie") ||
      s.includes("كوكيز") ||
      s.includes("muffin") ||
      s.includes("مافن") ||
      s.includes("english cake") ||
      s.includes("انجلش") ||
      s.includes("brownie") ||
      s.includes("براونيز")
    ) {
      return { shelfLifeDays: 5, shelfLifeType: "pastry_5d" };
    }

    // 3. Fresh Sandwiches, Salads, Dairy & Fresh Cream (3 days)
    return { shelfLifeDays: 3, shelfLifeType: "fresh_3d" };
  }

  /**
   * Smart Item Matcher against catalog and aliases
   */
  static matchCatalogItem(rawName = "") {
    const clean = String(rawName).trim().toLowerCase();
    if (!clean || clean === "الإجمالي اليومي") return null;

    // Look in DEFAULT_CATALOG
    for (const c of DEFAULT_CATALOG) {
      if (c.nameEn && c.nameEn.toLowerCase() === clean) return c;
      if (c.nameAr && c.nameAr.toLowerCase() === clean) return c;
      if (c.aliases && c.aliases.some(a => a.toLowerCase() === clean)) return c;
    }

    // Extended alias mappings for common variations in sheets
    const customAliases = [
      {
        match: ["chocolate hazelnut tart", "تارت شوكليت هازلنت", "تارت هازلنت"],
        nameAr: "تارت بندق وشوكولاتة",
        nameEn: "Chocolate Hazelnut Tart",
        category: "حلويات وكيك",
        unitPrice: 75.00
      },
      {
        match: ["chocolate fudge cake", "فادج كيك", "شوكليت فادج كيك"],
        nameAr: "شوكليت فادج كيك",
        nameEn: "Chocolate Fudge Cake",
        category: "حلويات وكيك",
        unitPrice: 65.00
      },
      {
        match: ["carrot cake", "كيك جزر", "كروت كيك"],
        nameAr: "كيك الجزر",
        nameEn: "Carrot Cake",
        category: "حلويات وكيك",
        unitPrice: 65.00
      },
      {
        match: ["volcano nutella", "nutella volcano", "بركان نوتيلا", "فولكانو نوتيلا"],
        nameAr: "بركان نوتيلا",
        nameEn: "Nutella Volcano",
        category: "حلويات وكيك",
        unitPrice: 66.00
      },
      {
        match: ["croissant flat nutella", "flat croissant nutella", "فلات كرواسون نوتيلا"],
        nameAr: "فلات كرواسون نوتيلا",
        nameEn: "Flat Croissant Nutella",
        category: "مخبوزات وكرواسون",
        unitPrice: 55.00
      },
      {
        match: ["croissant feta thyem", "croissant feta thyme", "كرواسون فيتا زعتر", "كرواسون فيتا"],
        nameAr: "كرواسون فيتا وزعتر",
        nameEn: "Croissant Feta Thyme",
        category: "مخبوزات وكرواسون",
        unitPrice: 42.00
      },
      {
        match: ["tuna pasta salad", "باستا تونه", "باستا تونة سالاد", "سلطة مكرونة تونة"],
        nameAr: "سلطة باستا تونة",
        nameEn: "Tuna Pasta Salad",
        category: "سلطات وساندوتشات",
        unitPrice: 75.00
      },
      {
        match: ["ceaser salad", "caesar salad", "سيزر سالاد", "سلطة سيزر"],
        nameAr: "سلطة سيزر",
        nameEn: "Caesar Salad",
        category: "سلطات وساندوتشات",
        unitPrice: 65.00
      },
      {
        match: ["pain swiss nutella", "pain suisse nutella", "بان سويس نوتيلا", "بان سويس"],
        nameAr: "بان سويس نوتيلا",
        nameEn: "Pain Suisse Nutella",
        category: "مخبوزات وكرواسون",
        unitPrice: 58.00
      },
      {
        match: ["chees cake", "cheesecake", "تشيز كيك", "تشيزكيك"],
        nameAr: "تشيز كيك",
        nameEn: "Cheesecake",
        category: "حلويات وكيك",
        unitPrice: 68.00
      }
    ];

    for (const ca of customAliases) {
      if (ca.match.some(m => clean.includes(m) || m.includes(clean))) {
        return ca;
      }
    }

    // Fallback: Return clean formatted object
    return {
      nameAr: rawName,
      nameEn: rawName,
      category: "أصناف عامة",
      unitPrice: 50.00
    };
  }

  /**
   * 1. Import Starting Inventory from Sheet (جرد موكا 9-11-2026.xlsx)
   */
  static async importInitialInventory({ fileBuffer, filePath, baselineDate = "2026-11-09" }) {
    let wb;
    if (fileBuffer) {
      wb = XLSX.read(fileBuffer, { type: "buffer" });
    } else if (filePath) {
      wb = XLSX.readFile(filePath);
    } else {
      throw new Error("لم يتم تمرير ملف الجرد");
    }

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const baseDate = new Date(baselineDate);
    const results = [];
    let totalUnitsAdded = 0;

    for (const r of rows) {
      const rawName = String(r["اسم الصنف"] || "").trim();
      if (!rawName || rawName === "الإجمالي اليومي") continue;

      // Determine starting count: check 'يوم 9' or any day column or 'الإجمالي'
      let count = 0;
      if (r["يوم 9"] != null && Number(r["يوم 9"]) >= 0) {
        count = Number(r["يوم 9"]);
      } else {
        // Fallback: find any day column with positive number, or use 'الإجمالي'
        for (let i = 1; i <= 30; i++) {
          const val = Number(r[`يوم ${i}`]);
          if (!isNaN(val) && val > 0) {
            count += val;
          }
        }
        if (count === 0 && Number(r["الإجمالي"]) > 0) {
          count = Number(r["الإجمالي"]);
        }
      }

      const catalogMatch = this.matchCatalogItem(rawName);
      const nameAr = catalogMatch.nameAr || rawName;
      const nameEn = catalogMatch.nameEn || rawName;
      const category = catalogMatch.category || "مخبوزات وحلويات";
      const unitCost = Number(catalogMatch.unitPrice || 0);
      const shelfConfig = this.getShelfLifeConfig(nameEn, category);

      const expiryDate = new Date(baseDate);
      expiryDate.setDate(expiryDate.getDate() + shelfConfig.shelfLifeDays);

      // Upsert Inventory Item
      let invItem = await InventoryItem.findOne({
        $or: [{ nameEn: nameEn }, { nameAr: nameAr }]
      });

      if (!invItem) {
        invItem = new InventoryItem({
          code: catalogMatch.code || "",
          nameAr,
          nameEn,
          category,
          unitCost,
          shelfLifeType: shelfConfig.shelfLifeType,
          defaultExpiryDays: shelfConfig.shelfLifeDays,
          currentStock: 0,
          batches: []
        });
      } else {
        invItem.unitCost = unitCost || invItem.unitCost;
        invItem.shelfLifeType = shelfConfig.shelfLifeType;
        invItem.defaultExpiryDays = shelfConfig.shelfLifeDays;
      }

      // Reset / Set baseline batch if count > 0
      if (count > 0) {
        const batch = {
          batchNumber: `INIT-${nameEn.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${Date.now().toString(36)}`,
          quantity: count,
          initialQuantity: count,
          arrivalDate: baseDate,
          expiryDate: expiryDate,
          shelfLifeDays: shelfConfig.shelfLifeDays,
          unitCost: unitCost,
          source: "شيت جرد موكا 9-11-2026",
          status: "active"
        };

        invItem.batches = [batch];
        invItem.currentStock = count;
        invItem.lastMovementDate = baseDate;
        await invItem.save();

        totalUnitsAdded += count;

        // Log movement
        await InventoryMovement.create({
          type: "IN_INITIAL",
          itemId: invItem._id,
          itemName: nameAr,
          quantity: count,
          previousStock: 0,
          newStock: count,
          unitCost,
          totalValue: count * unitCost,
          reason: "رصيد جرد افتتاحي من شيت جرد موكا",
          reference: "جرد موكا 9-11-2026.xlsx",
          movementDate: baseDate
        });
      } else {
        invItem.batches = [];
        invItem.currentStock = 0;
        await invItem.save();
      }

      results.push({
        nameAr,
        nameEn,
        stock: count,
        expiryDays: shelfConfig.shelfLifeDays,
        expiryDate: expiryDate.toISOString().split("T")[0]
      });
    }

    return {
      success: true,
      message: `تم تهيئة أرصدة المخزن بنجاح بإجمالي (${totalUnitsAdded}) قطعة موزعة على (${results.filter(r => r.stock > 0).length}) صنف متوفر.`,
      totalUnitsAdded,
      itemsCount: results.length,
      baselineDate
    };
  }

  /**
   * 2. Import & Automatically Deduct Waste from Sheet (west 11.xlsx)
   */
  static async importWasteDeduction({ fileBuffer, filePath, autoCreateWasteRecords = true }) {
    let wb;
    if (fileBuffer) {
      wb = XLSX.read(fileBuffer, { type: "buffer" });
    } else if (filePath) {
      wb = XLSX.readFile(filePath);
    } else {
      throw new Error("لم يتم تمرير ملف الويست");
    }

    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    const deductedItems = [];
    let totalWasteUnits = 0;
    let totalWasteValue = 0;

    for (const r of rows) {
      const rawName = String(r["اسم الصنف"] || "").trim();
      if (!rawName || rawName === "الإجمالي اليومي") continue;

      // Extract waste entries by day (e.g. يوم 5, يوم 6, يوم 7, يوم 9...)
      const dayEntries = [];
      for (let day = 1; day <= 30; day++) {
        const val = Number(r[`يوم ${day}`]);
        if (!isNaN(val) && val > 0) {
          dayEntries.push({ day, quantity: val });
        }
      }

      if (dayEntries.length === 0) continue;

      const catalogMatch = this.matchCatalogItem(rawName);
      const nameAr = catalogMatch.nameAr || rawName;
      const nameEn = catalogMatch.nameEn || rawName;
      const unitCost = Number(catalogMatch.unitPrice || 0);

      // Find item in inventory
      let invItem = await InventoryItem.findOne({
        $or: [{ nameEn: nameEn }, { nameAr: nameAr }]
      });

      for (const entry of dayEntries) {
        const wasteQty = entry.quantity;
        const wasteDate = new Date(`2026-11-${String(entry.day).padStart(2, "0")}`);
        const lossVal = wasteQty * unitCost;

        let prevStock = invItem ? invItem.currentStock : 0;
        let newStock = Math.max(0, prevStock - wasteQty);

        if (invItem) {
          // Deduct from batches (FIFO)
          let remainingToDeduct = wasteQty;
          for (const b of invItem.batches) {
            if (b.quantity > 0) {
              const take = Math.min(b.quantity, remainingToDeduct);
              b.quantity -= take;
              remainingToDeduct -= take;
              if (b.quantity === 0) b.status = "depleted";
              if (remainingToDeduct <= 0) break;
            }
          }
          invItem.recalculateStock();
          invItem.lastMovementDate = wasteDate;
          await invItem.save();
        }

        // 1. Log inventory movement
        await InventoryMovement.create({
          type: "OUT_WASTE",
          itemId: invItem ? invItem._id : null,
          itemName: nameAr,
          quantity: -wasteQty,
          previousStock: prevStock,
          newStock: newStock,
          unitCost,
          totalValue: lossVal,
          reason: `هالك مسجل في يوم ${entry.day} نوفمبر`,
          reference: "west 11.xlsx",
          movementDate: wasteDate
        });

        // 2. Automatically record in Waste model for accounting integration
        if (autoCreateWasteRecords) {
          await Waste.create({
            itemName: nameAr,
            quantity: wasteQty,
            unit: "قطعة",
            lossValue: lossVal,
            reason: "تلف / ويست فرع ويست",
            wasteDate: wasteDate,
            responsible: "ويست 11",
            notes: `خصم هالك تلقائي من شيت الويست يوم ${entry.day}`
          });
        }

        totalWasteUnits += wasteQty;
        totalWasteValue += lossVal;

        deductedItems.push({
          itemName: nameAr,
          day: entry.day,
          quantity: wasteQty,
          lossValue: lossVal,
          remainingStock: newStock
        });
      }
    }

    return {
      success: true,
      message: `تم خصم الويست بنجاح: إجمالي (${totalWasteUnits}) قطعة مسجلة كهالك بقيمة (${totalWasteValue.toFixed(2)} ج.م) وتم تحديث المخزن فورياً.`,
      totalWasteUnits,
      totalWasteValue: parseFloat(totalWasteValue.toFixed(2)),
      deductedItemsCount: deductedItems.length,
      details: deductedItems
    };
  }

  /**
   * 3. Import Incoming Goods / Daily Deliveries (بضاعة واردة جديدة)
   */
  static async importIncomingGoods({ items, fileBuffer, filePath, arrivalDate = new Date() }) {
    let incomingList = [];

    if (Array.isArray(items) && items.length > 0) {
      incomingList = items;
    } else if (fileBuffer || filePath) {
      const wb = fileBuffer ? XLSX.read(fileBuffer, { type: "buffer" }) : XLSX.readFile(filePath);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet);

      // Normalize row columns
      incomingList = rawRows.map(r => ({
        name: r["اسم الصنف"] || r["الصنف"] || r["Item"] || r["Name"] || r["item_name"],
        quantity: Number(r["الكمية"] || r["العدد"] || r["Quantity"] || r["Qty"] || 0),
        unitPrice: Number(r["سعر الوحدة"] || r["السعر"] || r["Price"] || r["Unit Price"] || 0),
        expiryDays: Number(r["أيام الصلاحية"] || r["الصلاحية"] || 0)
      })).filter(it => it.name && it.quantity > 0);
    }

    if (incomingList.length === 0) {
      throw new Error("لم يتم العثور على أي أصناف واردة صالحة للإضافة");
    }

    const arrDate = new Date(arrivalDate);
    let totalAddedUnits = 0;
    let totalAddedValue = 0;
    const addedItems = [];

    for (const inc of incomingList) {
      const rawName = String(inc.name).trim();
      const qty = Number(inc.quantity);
      if (!rawName || isNaN(qty) || qty <= 0) continue;

      const catalogMatch = this.matchCatalogItem(rawName);
      const nameAr = catalogMatch.nameAr || rawName;
      const nameEn = catalogMatch.nameEn || rawName;
      const category = catalogMatch.category || "مخبوزات وحلويات";
      const unitCost = Number(inc.unitPrice) || Number(catalogMatch.unitPrice || 0);

      const shelfConfig = this.getShelfLifeConfig(nameEn, category);
      const shelfDays = inc.expiryDays > 0 ? inc.expiryDays : shelfConfig.shelfLifeDays;

      const expDate = new Date(arrDate);
      expDate.setDate(expDate.getDate() + shelfDays);

      let invItem = await InventoryItem.findOne({
        $or: [{ nameEn: nameEn }, { nameAr: nameAr }]
      });

      if (!invItem) {
        invItem = new InventoryItem({
          code: catalogMatch.code || "",
          nameAr,
          nameEn,
          category,
          unitCost,
          shelfLifeType: shelfConfig.shelfLifeType,
          defaultExpiryDays: shelfDays,
          currentStock: 0,
          batches: []
        });
      }

      const prevStock = invItem.currentStock;
      const newStock = prevStock + qty;

      const newBatch = {
        batchNumber: `IN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`,
        quantity: qty,
        initialQuantity: qty,
        arrivalDate: arrDate,
        expiryDate: expDate,
        shelfLifeDays: shelfDays,
        unitCost: unitCost,
        source: "بضاعة واردة جديدة",
        status: "active"
      };

      invItem.batches.push(newBatch);
      invItem.recalculateStock();
      invItem.lastMovementDate = arrDate;
      await invItem.save();

      // Log movement
      await InventoryMovement.create({
        type: "IN_PURCHASE",
        itemId: invItem._id,
        itemName: nameAr,
        quantity: qty,
        previousStock: prevStock,
        newStock: newStock,
        unitCost,
        totalValue: qty * unitCost,
        reason: "توريد بضاعة جديدة للمخزن",
        reference: "شيت بضاعة واردة",
        movementDate: arrDate
      });

      totalAddedUnits += qty;
      totalAddedValue += qty * unitCost;

      addedItems.push({
        itemName: nameAr,
        quantity: qty,
        shelfDays,
        expiryDate: expDate.toISOString().split("T")[0],
        newStock
      });
    }

    return {
      success: true,
      message: `تم إضافة البضاعة الواردة بنجاح: (${totalAddedUnits}) قطعة بقيمة (${totalAddedValue.toFixed(2)} ج.م) وتم تحديد تواريخ الصلاحية آلياً.`,
      totalAddedUnits,
      totalAddedValue: parseFloat(totalAddedValue.toFixed(2)),
      itemsCount: addedItems.length,
      details: addedItems
    };
  }

  /**
   * 4. Deduct Expired Goods from Stock (خصم منتهي الصلاحية)
   */
  static async deductExpiredGoods({ autoDeductAll = true, specificBatchIds = [], itemsList = [] }) {
    const now = new Date();
    let totalExpiredUnits = 0;
    let totalExpiredLoss = 0;
    const expiredDetails = [];

    // Option A: Specific items imported from an expired list
    if (Array.isArray(itemsList) && itemsList.length > 0) {
      for (const exp of itemsList) {
        const rawName = String(exp.name || "").trim();
        const qty = Number(exp.quantity || 0);
        if (!rawName || qty <= 0) continue;

        const catalogMatch = this.matchCatalogItem(rawName);
        const nameAr = catalogMatch.nameAr || rawName;
        const nameEn = catalogMatch.nameEn || rawName;
        const unitCost = Number(catalogMatch.unitPrice || 0);

        let invItem = await InventoryItem.findOne({
          $or: [{ nameEn: nameEn }, { nameAr: nameAr }]
        });

        if (invItem && invItem.currentStock > 0) {
          const prevStock = invItem.currentStock;
          const actualDeduct = Math.min(prevStock, qty);
          const newStock = prevStock - actualDeduct;
          const lossVal = actualDeduct * unitCost;

          let rem = actualDeduct;
          for (const b of invItem.batches) {
            if (b.quantity > 0) {
              const take = Math.min(b.quantity, rem);
              b.quantity -= take;
              rem -= take;
              if (b.quantity === 0) b.status = "depleted";
              if (rem <= 0) break;
            }
          }

          invItem.recalculateStock();
          await invItem.save();

          await InventoryMovement.create({
            type: "OUT_EXPIRED",
            itemId: invItem._id,
            itemName: nameAr,
            quantity: -actualDeduct,
            previousStock: prevStock,
            newStock: newStock,
            unitCost,
            totalValue: lossVal,
            reason: "خصم إكسباير (منتهي الصلاحية)",
            reference: "شيت إكسباير",
            movementDate: now
          });

          await Waste.create({
            itemName: nameAr,
            quantity: actualDeduct,
            unit: "قطعة",
            lossValue: lossVal,
            reason: "انتهاء صلاحية (إكسباير)",
            wasteDate: now,
            responsible: "إدارة المخزن",
            notes: "خصم آلي لبضاعة منتهية الصلاحية"
          });

          totalExpiredUnits += actualDeduct;
          totalExpiredLoss += lossVal;
          expiredDetails.push({ itemName: nameAr, quantity: actualDeduct, lossValue: lossVal, newStock });
        }
      }

      return {
        success: true,
        message: `تم خصم (${totalExpiredUnits}) قطعة منتهية الصلاحية بقيمة (${totalExpiredLoss.toFixed(2)} ج.م) وتسجيلها كهالك تلقائياً.`,
        totalExpiredUnits,
        totalExpiredLoss: parseFloat(totalExpiredLoss.toFixed(2)),
        details: expiredDetails
      };
    }

    // Option B: Automated Scan of All Batches Past Expiry Date
    const allItems = await InventoryItem.find({ currentStock: { $gt: 0 } });

    for (const item of allItems) {
      let itemDeducted = 0;
      let itemLoss = 0;

      for (const batch of item.batches) {
        if (batch.quantity > 0 && new Date(batch.expiryDate) < now) {
          const deductQty = batch.quantity;
          const cost = Number(batch.unitCost || item.unitCost || 0);
          const loss = deductQty * cost;

          batch.quantity = 0;
          batch.status = "expired";

          itemDeducted += deductQty;
          itemLoss += loss;
        }
      }

      if (itemDeducted > 0) {
        const prevStock = item.currentStock;
        item.recalculateStock();
        await item.save();

        await InventoryMovement.create({
          type: "OUT_EXPIRED",
          itemId: item._id,
          itemName: item.nameAr,
          quantity: -itemDeducted,
          previousStock: prevStock,
          newStock: item.currentStock,
          unitCost: item.unitCost,
          totalValue: itemLoss,
          reason: "انتهاء فترة الصلاحية المقررة للصنف",
          reference: "فحص آلي للصلاحيات",
          movementDate: now
        });

        await Waste.create({
          itemName: item.nameAr,
          quantity: itemDeducted,
          unit: item.unit || "قطعة",
          lossValue: itemLoss,
          reason: "انتهاء صلاحية (إكسباير)",
          wasteDate: now,
          responsible: "إدارة المخزن",
          notes: "خصم آلي للباتشات المنتهية"
        });

        totalExpiredUnits += itemDeducted;
        totalExpiredLoss += itemLoss;

        expiredDetails.push({
          itemName: item.nameAr,
          quantity: itemDeducted,
          lossValue: itemLoss,
          remainingStock: item.currentStock
        });
      }
    }

    return {
      success: true,
      message: totalExpiredUnits > 0
        ? `تم العثور على (${totalExpiredUnits}) قطعة منتهية الصلاحية بقيمة (${totalExpiredLoss.toFixed(2)} ج.م) وتم خصمها من المخزن وتسجيلها في الهالك.`
        : "لا توجد أي أصناف منتهية الصلاحية بالمخزن حالياً، جميع البضائع صالحة.",
      totalExpiredUnits,
      totalExpiredLoss: parseFloat(totalExpiredLoss.toFixed(2)),
      details: expiredDetails
    };
  }

  /**
   * 5. Get Live Inventory Overview & Expiry Status
   */
  static async getInventoryOverview({ filter = "all", search = "" } = {}) {
    const now = new Date();
    const query = {};

    if (search) {
      query.$or = [
        { nameAr: { $regex: search, $options: "i" } },
        { nameEn: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } }
      ];
    }

    const items = await InventoryItem.find(query).sort({ currentStock: -1, nameAr: 1 });

    let totalStockUnits = 0;
    let totalStockValuation = 0;
    let expiringSoonCount = 0;
    let expiredCount = 0;
    let outOfStockCount = 0;

    const enrichedItems = items.map(it => {
      totalStockUnits += it.currentStock;
      const itemVal = it.currentStock * it.unitCost;
      totalStockValuation += itemVal;

      if (it.currentStock === 0) {
        outOfStockCount++;
      }

      // Check nearest expiry batch
      const activeBatches = (it.batches || []).filter(b => b.quantity > 0);
      let nearestExpiry = null;
      let daysRemaining = null;
      let status = "fresh";

      if (activeBatches.length > 0) {
        activeBatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        nearestExpiry = activeBatches[0].expiryDate;

        const diffMs = new Date(nearestExpiry).getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        if (daysRemaining < 0) {
          status = "expired";
          expiredCount++;
        } else if (daysRemaining <= 1) {
          status = "expiring_today";
          expiringSoonCount++;
        } else if (daysRemaining <= 2) {
          status = "expiring_soon";
          expiringSoonCount++;
        } else {
          status = "fresh";
        }
      } else if (it.currentStock > 0) {
        // Fallback default calculation
        const fallbackExp = new Date(it.lastMovementDate || it.updatedAt);
        fallbackExp.setDate(fallbackExp.getDate() + (it.defaultExpiryDays || 3));
        nearestExpiry = fallbackExp;
        const diffMs = fallbackExp.getTime() - now.getTime();
        daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        status = daysRemaining < 0 ? "expired" : (daysRemaining <= 2 ? "expiring_soon" : "fresh");
      }

      return {
        id: it._id,
        code: it.code,
        nameAr: it.nameAr,
        nameEn: it.nameEn,
        category: it.category,
        currentStock: it.currentStock,
        unit: it.unit,
        unitCost: it.unitCost,
        totalValue: parseFloat(itemVal.toFixed(2)),
        defaultExpiryDays: it.defaultExpiryDays,
        shelfLifeType: it.shelfLifeType,
        nearestExpiry: nearestExpiry ? nearestExpiry.toISOString().split("T")[0] : null,
        daysRemaining,
        status,
        batchesCount: activeBatches.length,
        batches: activeBatches.map(b => ({
          batchNumber: b.batchNumber,
          quantity: b.quantity,
          arrivalDate: b.arrivalDate ? b.arrivalDate.toISOString().split("T")[0] : "",
          expiryDate: b.expiryDate ? b.expiryDate.toISOString().split("T")[0] : "",
          source: b.source
        }))
      };
    });

    // Apply Filter if requested
    let filteredList = enrichedItems;
    if (filter === "expiring_soon") {
      filteredList = enrichedItems.filter(it => it.status === "expiring_soon" || it.status === "expiring_today");
    } else if (filter === "expired") {
      filteredList = enrichedItems.filter(it => it.status === "expired");
    } else if (filter === "in_stock") {
      filteredList = enrichedItems.filter(it => it.currentStock > 0);
    } else if (filter === "out_of_stock") {
      filteredList = enrichedItems.filter(it => it.currentStock === 0);
    }

    return {
      kpi: {
        totalUniqueItems: items.length,
        availableItemsCount: items.filter(i => i.currentStock > 0).length,
        totalStockUnits,
        totalStockValuation: parseFloat(totalStockValuation.toFixed(2)),
        expiringSoonCount,
        expiredCount,
        outOfStockCount
      },
      items: filteredList
    };
  }

  /**
   * 6. Manual Stock Adjustment (تسوية جرد يدوية)
   */
  static async adjustStock({ itemId, newQuantity, reason = "تسوية جرد يدوية" }) {
    const item = await InventoryItem.findById(itemId);
    if (!item) throw new Error("الصنف غير موجود بالمخزن");

    const prevStock = item.currentStock;
    const newQty = Number(newQuantity);
    if (isNaN(newQty) || newQty < 0) throw new Error("الكمية يجب أن تكون رقماً موجباً");

    const diff = newQty - prevStock;
    item.currentStock = newQty;

    // Adjust batch
    if (newQty > 0) {
      if (item.batches.length > 0) {
        item.batches[0].quantity = newQty;
      } else {
        const exp = new Date();
        exp.setDate(exp.getDate() + (item.defaultExpiryDays || 3));
        item.batches.push({
          batchNumber: `ADJ-${Date.now().toString(36).toUpperCase()}`,
          quantity: newQty,
          initialQuantity: newQty,
          arrivalDate: new Date(),
          expiryDate: exp,
          source: "تسوية يدوية",
          status: "active"
        });
      }
    } else {
      item.batches = [];
    }

    item.lastMovementDate = new Date();
    await item.save();

    await InventoryMovement.create({
      type: "ADJUSTMENT",
      itemId: item._id,
      itemName: item.nameAr,
      quantity: diff,
      previousStock: prevStock,
      newStock: newQty,
      unitCost: item.unitCost,
      totalValue: Math.abs(diff) * item.unitCost,
      reason: reason,
      reference: "تسوية جرد يدوية",
      movementDate: new Date()
    });

    return {
      success: true,
      message: `تم تعديل رصيد صنف "${item.nameAr}" من (${prevStock}) إلى (${newQty}) بنجاح.`,
      item
    };
  }

  /**
   * 7. Get Inventory Movements Audit Trail
   */
  static async getMovements({ limit = 100, month = "", type = "" } = {}) {
    const query = {};
    if (month) query.month = month;
    if (type) query.type = type;

    const movements = await InventoryMovement.find(query)
      .sort({ movementDate: -1, createdAt: -1 })
      .limit(Number(limit));

    return movements;
  }
}

module.exports = InventoryService;

