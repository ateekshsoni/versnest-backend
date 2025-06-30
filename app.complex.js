// Load environment variables from .env file
require("dotenv").config();

// Import dependencies
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Import database connection
const connectDB = require("./src/database/connection.js");

// Import routes
const authRoutes = require("./src/routes/auth.routes.js");
const userRoutes = require("./src/routes/user.routes.js");
const postRoutes = require("./src/routes/post.routes.js");
const commentRoutes = require("./src/routes/comment.routes.js");
const adminRoutes = require("./src/routes/admin.routes.js");
const notificationRoutes = require("./src/routes/notification.routes.js");
const interactionRoutes = require("./src/routes/interaction.routes.js");

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

/**
 * 🛡️ SECURITY MIDDLEWARE
 * Applied before all other middleware for maximum protection
 */
app.use(helmet()); // Security headers

/**
 * 🌐 CORS CONFIGURATION
 * Configure Cross-Origin Resource Sharing
 */
app.use(cors({
  origin: process.env.CLIENT_URL || ["http://localhost:3000", "http://localhost:5173"], // React/Vite default ports
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
}));

/**
 * 📝 REQUEST PARSING MIDDLEWARE
 */
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded bodies
app.use(cookieParser()); // Parse cookies

/**
 * 🚦 GLOBAL RATE LIMITING
 * Apply basic rate limiting to all requests
 */
const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalRateLimit);

/**
 * 📊 REQUEST LOGGING
 * Log all incoming requests for monitoring
 */
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${req.ip}`);
  next();
});

/**
 * 🛣️ API ROUTES
 * All routes are prefixed with /api for consistency
 */
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/interactions", interactionRoutes);

/**
 * 🏠 ROOT ENDPOINT
 * Basic health check and API information
 */
app.get("/", (req, res) => {
  res.json({
    message: "Welcome to VerseNest API",
    version: "2.0.0",
    status: "active",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      posts: "/api/posts",
      comments: "/api/comments",
      admin: "/api/admin",
      notifications: "/api/notifications",
      interactions: "/api/interactions"
    },
    documentation: "/api/docs", // Future API documentation endpoint
    timestamp: new Date().toISOString()
  });
});

/**
 * 🔍 API DOCUMENTATION INFO
 * Placeholder for future API documentation
 */
app.get("/api", (req, res) => {
  res.json({
    message: "VerseNest API v2.0",
    description: "A modern, scalable backend for the VerseNest platform",
    features: [
      "JWT Authentication with refresh tokens",
      "Role-based access control",
      "Social interactions (likes, comments, follows)",
      "Real-time notifications",
      "Content management system",
      "Advanced search and filtering",
      "Analytics and insights",
      "Admin dashboard capabilities"
    ],
    endpoints: {
      auth: {
        prefix: "/api/auth",
        description: "Authentication and user management"
      },
      users: {
        prefix: "/api/users",
        description: "User profiles and social features"
      },
      posts: {
        prefix: "/api/posts",
        description: "Content creation and management"
      },
      comments: {
        prefix: "/api/comments",
        description: "Comment system with threading"
      },
      interactions: {
        prefix: "/api/interactions",
        description: "Social interactions and engagement"
      },
      notifications: {
        prefix: "/api/notifications",
        description: "User notifications and alerts"
      },
      admin: {
        prefix: "/api/admin",
        description: "Administrative functions and analytics"
      }
    },
    contact: {
      developer: "VerseNest Team",
      email: "dev@versenest.com",
      version: "2.0.0"
    }
  });
});

/**
 * 🔍 HEALTH CHECK ENDPOINT
 * Basic health check for monitoring systems
 */
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || "development"
  });
});

/**
 * 🚫 404 HANDLER
 * Handle requests to non-existent endpoints
 */
app.use("*", (req, res) => {
  console.log(`404 Not Found - ${req.method} ${req.originalUrl} - ${req.ip}`);
  
  res.status(404).json({
    success: false,
    message: "Endpoint not found",
    requestedUrl: req.originalUrl,
    method: req.method,
    availableEndpoints: [
      "/api/auth",
      "/api/users", 
      "/api/posts",
      "/api/comments",
      "/api/interactions",
      "/api/notifications",
      "/api/admin"
    ],
    timestamp: new Date().toISOString()
  });
});

/**
 * 🚨 GLOBAL ERROR HANDLER
 * Must be the last middleware to catch all errors
 */
app.use((error, req, res, next) => {
  console.error('Error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Export app for server entry point
module.exports = app;
