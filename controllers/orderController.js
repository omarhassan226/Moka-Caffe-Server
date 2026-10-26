const OrderService = require("../services/orderService");
const BillingService = require("../services/billingService");
const asyncHandler = require("../middlewares/asyncHandler");

/**
 * @desc   Get all orders
 * @route  GET /api/orders
 * @access Public
 */
const getOrders = asyncHandler(async (req, res) => {
  const orders = await OrderService.getAllOrders();
  res.json(orders);
});

/**
 * @desc   Get single order by ID
 * @route  GET /api/orders/:id
 * @access Public
 */
const getOrderById = asyncHandler(async (req, res) => {
  const order = await OrderService.getOrderById(req.params.id);
  res.json(order);
});

/**
 * @desc   Get financial summary (single order or consolidated all branches)
 * @route  GET /api/orders/summary
 * @access Public
 */
const getOrderSummary = asyncHandler(async (req, res) => {
  const { orderId, consolidate } = req.query;
  const summary = await OrderService.getSummary({ orderId, consolidate });
  res.json(summary);
});

/**
 * @desc   Parse raw text orders with smart Arabic recognition
 * @route  POST /api/orders/parse
 * @access Public
 */
const parseOrderText = asyncHandler(async (req, res) => {
  const { text } = req.body;
  const result = await OrderService.parseOrderText(text);
  res.json(result);
});

/**
 * @desc   Ad-hoc financial calculation for an array of items
 * @route  POST /api/orders/calculate
 * @access Public
 */
const calculateOrder = asyncHandler(async (req, res) => {
  const { items, consolidate } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: "Invalid items array" });
  }
  const calculation = BillingService.calculateOrder(items, { consolidate });
  res.json(calculation);
});

/**
 * @desc   Create new branch order
 * @route  POST /api/orders
 * @access Public
 */
const createOrder = asyncHandler(async (req, res) => {
  const branchName = req.body.branchName || req.body.name;
  const items = req.body.items || [];
  const order = await OrderService.createOrder({ branchName, items });
  res.status(201).json(order);
});

/**
 * @desc   Update branch order items or name
 * @route  PUT /api/orders/:id
 * @access Public
 */
const updateOrder = asyncHandler(async (req, res) => {
  const order = await OrderService.updateOrder(req.params.id, {
    branchName: req.body.branchName || req.body.name,
    items: req.body.items
  });
  res.json(order);
});

/**
 * @desc   Delete branch order
 * @route  DELETE /api/orders/:id
 * @access Public
 */
const deleteOrder = asyncHandler(async (req, res) => {
  await OrderService.deleteOrder(req.params.id);
  res.status(204).end();
});

module.exports = {
  getOrders,
  getOrderById,
  getOrderSummary,
  parseOrderText,
  calculateOrder,
  createOrder,
  updateOrder,
  deleteOrder
};
