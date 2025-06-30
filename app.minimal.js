// Load environment variables from .env file
require("dotenv").config();

// Import dependencies
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

// Import database connection
const connectDB = require("./src/database/connection.js");

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Basic middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Test route
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to VerseNest API",
    version: "2.0.0",
    status: "active",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Basic error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal Server Error'
  });
});

// Export app for server entry point
module.exports = app;
