const mongoose = require("mongoose");
const Item = require("../models/Item");

class ItemService {
  /**
   * Format item for client consumption
   */
  static serializeItem(item) {
    if (!item) return null;
    const value = item.toObject ? item.toObject() : item;
    return {
      ...value,
      id: String(value._id)
    };
  }

  /**
   * Escape special characters for safe regular expression search
   */
  static escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Get all items matching optional search and category filters
   */
  static async getItems({ category, search } = {}) {
    const query = {};

    if (category && category !== "all") {
      query.category = category;
    }

    if (search && String(search).trim()) {
      const match = new RegExp(this.escapeRegex(String(search).trim()), "i");
      query.$or = [{ nameAr: match }, { nameEn: match }, { code: match }];
    }

    const items = await Item.find(query).sort({ nameAr: 1 }).lean();
    return items.map(this.serializeItem);
  }

  /**
   * Get item by ObjectId
   */
  static async getItemById(id) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid item ID");
      error.status = 400;
      throw error;
    }
    const item = await Item.findById(id).lean();
    if (!item) {
      const error = new Error("Item not found");
      error.status = 404;
      throw error;
    }
    return this.serializeItem(item);
  }

  /**
   * Create a new item
   */
  static async createItem(data) {
    const payload = { ...data };
    delete payload._id;
    delete payload.id;

    if (!payload.code) {
      payload.code = `GEN-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const created = await Item.create(payload);
    return this.serializeItem(created);
  }

  /**
   * Update an existing item
   */
  static async updateItem(id, updates) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid item ID");
      error.status = 400;
      throw error;
    }

    const payload = { ...updates };
    delete payload._id;
    delete payload.id;

    const item = await Item.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true
    });

    if (!item) {
      const error = new Error("Item not found");
      error.status = 404;
      throw error;
    }

    return this.serializeItem(item);
  }

  /**
   * Delete item by ID
   */
  static async deleteItem(id) {
    if (!mongoose.isValidObjectId(id)) {
      const error = new Error("Invalid item ID");
      error.status = 400;
      throw error;
    }

    const item = await Item.findByIdAndDelete(id);
    if (!item) {
      const error = new Error("Item not found");
      error.status = 404;
      throw error;
    }

    return true;
  }

  /**
   * Find catalog items by array of codes
   */
  static async findByCodes(codes = []) {
    return Item.find({ code: { $in: codes } }).lean();
  }

  /**
   * Retrieve all items as lean objects for parser
   */
  static async getAllLean() {
    return Item.find().lean();
  }
}

module.exports = ItemService;
