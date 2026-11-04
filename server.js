const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const mongoose = require("mongoose");
const { connectDB } = require("./config/db");
const apiRoutes = require("./routes");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
const PORT = process.env.PORT || 5000;

// Core Middlewares
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: "*"
}));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serverless DB Connection Middleware
app.use(async (req, res, next) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    next();
  } catch (err) {
    console.error("Database connection failure:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
      tip: "Please make sure MONGODB_URI is configured in Vercel Project Settings > Environment Variables, and MongoDB Atlas Network Access includes 0.0.0.0/0."
    });
  }
});

// Mount Modular API Routes
app.use("/api", apiRoutes);

// Static file serving (if deployed together or in local development)
const frontendPath = path.join(__dirname, "../frontend");
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.join(frontendPath, "index.html"));
  });
} else {
  // Standalone API deployment root endpoint
  app.get("/", (req, res) => {
    res.json({
      status: "online",
      name: "Móka Caffe Billing ERP Backend API",
      version: "2.0.0",
      healthCheck: "/api/health",
      documentation: "Móka Billing REST API for Bakery & Daily Dose orders"
    });
  });
}

// Central Error Handler (must be registered after routes)
app.use(errorHandler);

async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => {
      console.log("====================================================");
      console.log(`  Móka Caffe Billing ERP Server running on port ${PORT}`);
      console.log(`  URL: http://localhost:${PORT}`);
      console.log(`  API Health: http://localhost:${PORT}/api/health`);
      console.log("====================================================");
    });
  } catch (err) {
    console.error("Critical: Failed to start server.", err.message);
    process.exit(1);
  }
}

// Only start the HTTP listener if not running in a serverless environment (e.g. Vercel)
if (!process.env.VERCEL) {
  startServer();
}

module.exports = app;
