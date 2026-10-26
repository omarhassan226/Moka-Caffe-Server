const mongoose = require("mongoose");

let cachedPromise = null;

async function connectDB(uri) {
  const mongoUri = uri || process.env.MONGODB_URI || "mongodb://localhost:27017/moka_caffe";

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (cachedPromise) {
    return cachedPromise;
  }

  cachedPromise = mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 5000
  }).then((mongooseInstance) => {
    console.log("MongoDB connection established.");
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
