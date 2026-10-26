const mongoose = require("mongoose");

let cachedPromise = null;

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI;

  if (!mongoUri && (process.env.VERCEL || process.env.NODE_ENV === "production")) {
    throw new Error(
      "Missing MONGODB_URI environment variable on Vercel. " +
      "Please go to your Vercel Project Dashboard -> Settings -> Environment Variables, " +
      "add MONGODB_URI with your MongoDB Atlas connection string, and redeploy."
    );
  }

  const connectionString = mongoUri || "mongodb://localhost:27017/moka_caffe";

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = mongoose.connect(connectionString, {
    serverSelectionTimeoutMS: 8000
  }).then((mongooseInstance) => {
    console.log("MongoDB connection established successfully.");
    return mongooseInstance.connection;
  }).catch((err) => {
    cachedPromise = null;
    console.error("MongoDB connection error:", err.message);
    throw err;
  });

  return cachedPromise;
}

function getConnectionStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
}

module.exports = {
  connectDB,
  getConnectionStatus
};
