const express = require("express");
const itemsRoutes = require("./items");
const ordersRoutes = require("./orders");
const { getConnectionStatus } = require("../config/db");

const router = express.Router();

// Mount resources
router.use("/items", itemsRoutes);
router.use("/orders", ordersRoutes);

// Central API Health Check
router.get("/health", (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: dbStatus.connected ? "healthy" : "unavailable",
    system: "Móka Caffe Billing ERP Enterprise API",
    version: "2.0.0",
    mongoConnected: dbStatus.connected,
    database: {
      name: dbStatus.name,
      readyState: dbStatus.readyState
    },
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
