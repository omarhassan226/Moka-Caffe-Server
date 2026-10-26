const express = require("express");
const {
  getOrders,
  getOrderById,
  getOrderSummary,
  parseOrderText,
  calculateOrder,
  createOrder,
  updateOrder,
  deleteOrder
} = require("../controllers/orderController");
const validateObjectId = require("../middlewares/validateObjectId");

const router = express.Router();

router.get("/summary", getOrderSummary);
router.post("/parse", parseOrderText);
router.post("/calculate", calculateOrder);

router.route("/")
  .get(getOrders)
  .post(createOrder);

router.route("/:id")
  .all(validateObjectId("id"))
  .get(getOrderById)
  .put(updateOrder)
  .delete(deleteOrder);

module.exports = router;
