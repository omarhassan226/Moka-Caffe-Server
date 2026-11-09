const express = require("express");
const router = express.Router();
const InventoryController = require("../controllers/inventoryController");

router.get("/", InventoryController.getOverview);
router.post("/import-initial", InventoryController.importInitial);
router.post("/import-waste", InventoryController.importWaste);
router.post("/import-incoming", InventoryController.importIncoming);
router.post("/deduct-expired", InventoryController.deductExpired);
router.post("/adjust", InventoryController.adjustStock);
router.get("/movements", InventoryController.getMovements);
router.post("/sync-local-sheets", InventoryController.syncLocalSheets);

module.exports = router;

