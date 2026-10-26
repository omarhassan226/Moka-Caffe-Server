const express = require("express");
const {
  getItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem
} = require("../controllers/itemController");
const validateObjectId = require("../middlewares/validateObjectId");

const router = express.Router();

router.route("/")
  .get(getItems)
  .post(createItem);

router.route("/:id")
  .all(validateObjectId("id"))
  .get(getItemById)
  .put(updateItem)
  .delete(deleteItem);

module.exports = router;
