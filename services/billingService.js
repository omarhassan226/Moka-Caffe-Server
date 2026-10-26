/**
 * Móka Accounting & Calculation Engine - Enterprise Server Service
 * Precision financial calculations matching official Egyptian tax invoices:
 * - Untaxed Amount
 * - Schedule Tax (ضريبة جدول 5%)
 * - VAT (ضريبة قيمة مضافة 14%)
 * - Category groupings & duplicate item consolidation
 * - Multi-Branch aggregations
 */

class BillingService {
  /**
   * Round to 2 decimal places to match financial currency standards
   */
  static round(num) {
    return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
  }

  /**
   * Calculate single line item
   */
  static calculateLineItem(item, quantity = 1) {
    const qty = parseFloat(quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const taxRate = parseFloat(item.taxRate) || 0;
    const taxType = item.taxType || (taxRate === 0.05 ? "SCHD_5" : taxRate === 0.14 ? "VAT_14" : "NONE");

    const untaxedSubtotal = this.round(qty * unitPrice);
    const taxPerUnit = this.round(unitPrice * taxRate);
    const taxSubtotal = this.round(qty * taxPerUnit);
    const taxInclusiveSubtotal = this.round(qty * (unitPrice + taxPerUnit));

    return {
      itemId: item.id || item.code || String(item._id || ""),
      code: item.code || "",
      nameAr: item.nameAr || item.parsedName || "صنف بدون اسم",
      nameEn: item.nameEn || "",
      category: item.category || "أصناف أخرى",
      unit: item.unit || "قطعة",
      quantity: qty,
      unitPrice: unitPrice,
      taxType: taxType,
      taxRate: taxRate,
      taxAmountPerUnit: taxPerUnit,
      priceTaxInclusive: this.round(unitPrice + taxPerUnit),
      subtotalUntaxed: untaxedSubtotal,
      subtotalTax: taxSubtotal,
      subtotalTaxInclusive: taxInclusiveSubtotal,
      isMissing: !!item.isMissing
    };
  }

  /**
   * Consolidate duplicate items in a list
   */
  static consolidateDuplicates(items) {
    const map = new Map();

    for (const it of items) {
      const key = it.code && it.code !== "NEW"
        ? it.code
        : it.itemId || it.code || it.nameAr;
      const sourceItemIds = it.sourceItemIds || [it.itemId || it.code || it.nameAr];
      if (map.has(key)) {
        const existing = map.get(key);
        existing.quantity += it.quantity;
        existing.sourceItemIds.push(...sourceItemIds);
      } else {
        map.set(key, { ...it, sourceItemIds: [...sourceItemIds] });
      }
    }

    const result = [];
    for (const merged of map.values()) {
      result.push({
        ...this.calculateLineItem(merged, merged.quantity),
        sourceItemIds: merged.sourceItemIds
      });
    }
    return result;
  }

  /**
   * Calculate full order with taxes and category breakdowns
   */
  static calculateOrder(orderItems, options = { consolidate: false }) {
    let itemsToProcess = (orderItems || []).map(it => {
      if (it.matchedItem) {
        return this.calculateLineItem(it.matchedItem, it.quantity);
      } else if (it.unitPrice !== undefined) {
        return this.calculateLineItem(it, it.quantity);
      } else {
        return this.calculateLineItem({
          id: "temp-" + Math.random().toString(36).substring(2, 8),
          code: "NEW",
          nameAr: it.parsedName || it.nameAr || "صنف غير مسجل",
          nameEn: it.nameEn || "",
          category: "أصناف جديدة",
          unitPrice: 0,
          taxType: "SCHD_5",
          taxRate: 0.05,
          isMissing: true
        }, it.quantity);
      }
    });

    if (options && options.consolidate) {
      itemsToProcess = this.consolidateDuplicates(itemsToProcess);
    }

    let totalUnits = 0;
    let untaxedTotal = 0;
    let schd5Base = 0;
    let schd5Amount = 0;
    let vat14Base = 0;
    let vat14Amount = 0;
    let missingItemsCount = 0;

    const categoryGroups = {};

    for (const line of itemsToProcess) {
      totalUnits += line.quantity;
      untaxedTotal += line.subtotalUntaxed;

      if (line.taxType === "SCHD_5") {
        schd5Base += line.subtotalUntaxed;
        schd5Amount += line.subtotalTax;
      } else if (line.taxType === "VAT_14") {
        vat14Base += line.subtotalUntaxed;
        vat14Amount += line.subtotalTax;
      }

      if (line.isMissing) {
        missingItemsCount++;
      }

      const catName = line.category || "أصناف عامة";
      if (!categoryGroups[catName]) {
        categoryGroups[catName] = {
          categoryName: catName,
          totalUnits: 0,
          untaxedTotal: 0,
          taxTotal: 0,
          totalWithTax: 0,
          items: []
        };
      }
      categoryGroups[catName].totalUnits += line.quantity;
      categoryGroups[catName].untaxedTotal += line.subtotalUntaxed;
      categoryGroups[catName].taxTotal += line.subtotalTax;
      categoryGroups[catName].totalWithTax += line.subtotalTaxInclusive;
      categoryGroups[catName].items.push(line);
    }

    untaxedTotal = this.round(untaxedTotal);
    schd5Base = this.round(schd5Base);
    schd5Amount = this.round(schd5Amount);
    vat14Base = this.round(vat14Base);
    vat14Amount = this.round(vat14Amount);
    const totalTaxes = this.round(schd5Amount + vat14Amount);
    const grandTotal = this.round(untaxedTotal + totalTaxes);

    const categories = Object.values(categoryGroups).map(g => ({
      categoryName: g.categoryName,
      totalUnits: g.totalUnits,
      untaxedTotal: this.round(g.untaxedTotal),
      taxTotal: this.round(g.taxTotal),
      totalWithTax: this.round(g.totalWithTax),
      items: g.items
    }));

    return {
      items: itemsToProcess,
      totalUnits,
      untaxedTotal,
      schd5Base,
      schd5Amount,
      vat14Base,
      vat14Amount,
      totalTaxes,
      grandTotal,
      missingItemsCount,
      categories
    };
  }

  /**
   * Calculate Multi-Branch Combined Summary
   */
  static calculateMultiBranchSummary(orders = []) {
    let grandTotalUnits = 0;
    let grandUntaxed = 0;
    let grandSchd5Base = 0;
    let grandSchd5Tax = 0;
    let grandVat14Base = 0;
    let grandVat14Tax = 0;
    let grandTotal = 0;
    let grandMissing = 0;

    const consolidatedCategoryMap = {};

    for (const order of orders) {
      const calc = order.calculation || this.calculateOrder(order.items);
      grandTotalUnits += calc.totalUnits;
      grandUntaxed += calc.untaxedTotal;
      grandSchd5Base += calc.schd5Base;
      grandSchd5Tax += calc.schd5Amount;
      grandVat14Base += calc.vat14Base;
      grandVat14Tax += calc.vat14Amount;
      grandTotal += calc.grandTotal;
      grandMissing += calc.missingItemsCount;

      for (const cat of calc.categories) {
        if (!consolidatedCategoryMap[cat.categoryName]) {
          consolidatedCategoryMap[cat.categoryName] = {
            categoryName: cat.categoryName,
            totalUnits: 0,
            untaxedTotal: 0,
            taxTotal: 0,
            totalWithTax: 0
          };
        }
        consolidatedCategoryMap[cat.categoryName].totalUnits += cat.totalUnits;
        consolidatedCategoryMap[cat.categoryName].untaxedTotal += cat.untaxedTotal;
        consolidatedCategoryMap[cat.categoryName].taxTotal += cat.taxTotal;
        consolidatedCategoryMap[cat.categoryName].totalWithTax += cat.totalWithTax;
      }
    }

    return {
      totalOrders: orders.length,
      totalUnits: grandTotalUnits,
      untaxedTotal: this.round(grandUntaxed),
      schd5Base: this.round(grandSchd5Base),
      schd5Amount: this.round(grandSchd5Tax),
      vat14Base: this.round(grandVat14Base),
      vat14Amount: this.round(grandVat14Tax),
      totalTaxes: this.round(grandSchd5Tax + grandVat14Tax),
      grandTotal: this.round(grandTotal),
      missingItemsCount: grandMissing,
      categories: Object.values(consolidatedCategoryMap)
    };
  }
}

module.exports = BillingService;
