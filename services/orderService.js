const mongoose = require("mongoose");
const Order = require("../models/Order");
const ItemService = require("./itemService");
const BillingService = require("./billingService");
const ParserService = require("./parserService");

class OrderService {
  /**
   * Serialize Order with computed calculations
   */
  static serializeOrder(order) {
    if (!order) return null;
    const value = order.toObject ? order.toObject() : order;
    const items = (value.items || []).map(item => ({
      ...item,
      id: String(item._id),
      item: item.item ? String(item.item) : undefined
    }));

    const calculation = BillingService.calculateOrder(
      items.map(item => ({ ...item, id: item.id }))
    );

    return {
      ...value,
      id: String(value._id),
      name: value.branchName,
      items,
      calculation
    };
  }

  /**
   * Normalize input items against the Item catalog
   */
  static async normalizeItems(inputItems, existingOrderItems = []) {
    if (!Array.isArray(inputItems)) {
      const error = new Error("Items must be an array");
      error.status = 400;
      throw error;
    }

    const codes = [...new Set(inputItems.map(item => item.code).filter(Boolean))];
    const catalogItems = await ItemService.findByCodes(codes);
    const catalogByCode = new Map(catalogItems.map(item => [item.code, item]));
    const existingById = new Map(
      (existingOrderItems || []).map(item => [String(item._id), item])
    );

    return inputItems.map(input => {
      const quantity = Number(input.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        const error = new Error("Each item quantity must be greater than zero");
        error.status = 400;
        throw error;
      }

      const inputId = input._id || input.id;
      const existingItem = inputId && existingById.get(String(inputId));
      if (existingItem) {
        return {
          ...(existingItem.toObject ? existingItem.toObject() : existingItem),
          quantity,
          _id: existingItem._id
        };
      }

      const catalogItem = catalogByCode.get(input.code);
      const item = catalogItem
        ? {
            item: catalogItem._id,
            code: catalogItem.code,
            nameAr: catalogItem.nameAr,
            nameEn: catalogItem.nameEn,
            category: catalogItem.category,
            unit: catalogItem.unit,
            quantity,
            unitPrice: catalogItem.unitPrice,
            taxType: catalogItem.taxType,
            taxRate: catalogItem.taxRate
          }
        : {
            code: input.code || "NEW",
            nameAr: input.nameAr || input.parsedName || "صنف غير مسجل",
            nameEn: input.nameEn || "",
            category: input.category || "أصناف جديدة",
            unit: input.unit || "قطعة",
            quantity,
            unitPrice: Number(input.unitPrice) || 0,
            taxType: input.taxType || "SCHD_5",
            taxRate: input.taxRate == null ? 0.05 : Number(input.taxRate),
            isMissing: true
          };

      if (input._id && mongoose.isValidObjectId(input._id)) {
        item._id = input._id;
      } else if (input.id && mongoose.isValidObjectId(input.id)) {
        item._id = input.id;
      }
      return item;
    });
  }

  /**
   * Recalculate taxes & totals and save order
   */
  static async calculateAndSaveOrder(order, inputItems) {
    const items = await this.normalizeItems(inputItems, order.items);
    const calculation = BillingService.calculateOrder(
      items.map(item => ({ ...item, id: String(item._id || item.item || item.code) }))
    );

    const calculatedItems = calculation.items.map((line, index) => ({
      ...items[index],
      subtotalUntaxed: line.subtotalUntaxed,
      subtotalTax: line.subtotalTax,
      subtotalTaxInclusive: line.subtotalTaxInclusive
    }));

    order.items = calculatedItems;
    order.totalUnits = calculation.totalUnits;
    order.untaxedTotal = calculation.untaxedTotal;
    order.schd5Base = calculation.schd5Base;
    order.schd5Amount = calculation.schd5Amount;
    order.vat14Base = calculation.vat14Base;
    order.vat14Amount = calculation.vat14Amount;
    order.totalTaxes = calculation.totalTaxes;
    order.grandTotal = calculation.grandTotal;

    await order.save();
    return this.serializeOrder(order);
  }

  /**
   * Get all orders
   */
  static async getAllOrders() {
    const orders = await Order.find().sort({ createdAt: -1 });
    return orders.map(this.serializeOrder);
  }

  /**
   * Get single order by ID
   */
  static async getOrderById(id) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid order ID");
      error.status = 400;
      throw error;
    }
    const order = await Order.findById(id);
    if (!order) {
      const error = new Error("Order not found");
      error.status = 404;
      throw error;
    }
    return this.serializeOrder(order);
  }

  /**
   * Get order summary for single branch or multi-branch
   */
  static async getSummary({ orderId, consolidate } = {}) {
    const isConsolidated = consolidate === "true" || consolidate === true;

    if (orderId) {
      if (!mongoose.isValidObjectId(orderId)) {
        const error = new Error("Invalid order ID");
        error.status = 400;
        throw error;
      }
      const order = await Order.findById(orderId);
      if (!order) {
        const error = new Error("Order not found");
        error.status = 404;
        throw error;
      }
      const serialized = this.serializeOrder(order);
      const calculation = BillingService.calculateOrder(serialized.items, {
        consolidate: isConsolidated
      });
      return {
        title: order.branchName,
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        items: calculation.items,
        summary: calculation
      };
    }

    const orders = await Order.find().sort({ createdAt: -1 });
    const serializedOrders = orders.map(this.serializeOrder);
    const calculations = serializedOrders.map(order =>
      BillingService.calculateOrder(order.items, {
        consolidate: isConsolidated
      })
    );
    const summary = BillingService.calculateMultiBranchSummary(
      calculations.map(calculation => ({ calculation }))
    );
    const allItems = serializedOrders.flatMap(order => order.items);
    const items = BillingService.calculateOrder(allItems, {
      consolidate: isConsolidated
    }).items;

    return {
      title: "إجمالي كافة الفروع والطلبيات",
      items,
      summary
    };
  }

  /**
   * Parse Arabic orders text against catalog
   */
  static async parseOrderText(text) {
    if (typeof text !== "string" || !text.trim()) {
      const error = new Error("الرجاء إدخال نص الطلبية");
      error.status = 400;
      throw error;
    }

    const catalog = await ItemService.getAllLean();
    const parser = new ParserService(catalog);
    const sections = parser.parseOrdersText(text);

    const calculatedSections = sections.map(section => ({
      name: section.name,
      items: section.items,
      calculation: BillingService.calculateOrder(section.items)
    }));

    const summary = BillingService.calculateMultiBranchSummary(
      calculatedSections.map(section => ({ calculation: section.calculation }))
    );

    return {
      sections: calculatedSections,
      summary
    };
  }

  /**
   * Create new order
   */
  static async createOrder({ branchName, name, items = [] }) {
    const title = String(branchName || name || "").trim();
    if (!title) {
      const error = new Error("Branch name is required");
      error.status = 400;
      throw error;
    }

    const order = new Order({
      branchName: title,
      orderNumber: `ORD-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`
    });

    return this.calculateAndSaveOrder(order, items);
  }

  /**
   * Update existing order
   */
  static async updateOrder(id, { branchName, name, items }) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid order ID");
      error.status = 400;
      throw error;
    }

    const order = await Order.findById(id);
    if (!order) {
      const error = new Error("Order not found");
      error.status = 404;
      throw error;
    }

    if (branchName || name) {
      order.branchName = String(branchName || name).trim();
    }

    return this.calculateAndSaveOrder(order, items || []);
  }

  /**
   * Delete order by ID
   */
  static async deleteOrder(id) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid order ID");
      error.status = 400;
      throw error;
    }

    const order = await Order.findByIdAndDelete(id);
    if (!order) {
      const error = new Error("Order not found");
      error.status = 404;
      throw error;
    }

    return true;
  }
}

module.exports = OrderService;
