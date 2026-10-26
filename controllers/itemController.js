const ItemService = require("../services/itemService");
const asyncHandler = require("../middlewares/asyncHandler");

/**
 * @desc   Get all catalog items with optional filtering and search
 * @route  GET /api/items
 * @access Public
 */
const getItems = asyncHandler(async (req, res) => {
  const { category, search } = req.query;
  const items = await ItemService.getItems({ category, search });
  res.json(items);
});

/**
 * @desc   Get single catalog item by ID
 * @route  GET /api/items/:id
 * @access Public
 */
const getItemById = asyncHandler(async (req, res) => {
  const item = await ItemService.getItemById(req.params.id);
  res.json(item);
});

/**
 * @desc   Create new catalog item
 * @route  POST /api/items
 * @access Public
 */
const createItem = asyncHandler(async (req, res) => {
  const created = await ItemService.createItem(req.body);
  res.status(201).json(created);
});

/**
 * @desc   Update catalog item
 * @route  PUT /api/items/:id
 * @access Public
 */
const updateItem = asyncHandler(async (req, res) => {
  const updated = await ItemService.updateItem(req.params.id, req.body);
  res.json(updated);
});

/**
 * @desc   Delete catalog item
 * @route  DELETE /api/items/:id
 * @access Public
 */
const deleteItem = asyncHandler(async (req, res) => {
  await ItemService.deleteItem(req.params.id);
  res.status(204).end();
});

module.exports = {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem
};
