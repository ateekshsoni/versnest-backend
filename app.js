// Load environment variables from .env file
import dotenv from "dotenv";
dotenv.config();

// Import dependencies
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

// Import database connection and routes
import connectDB from "./db/db.js";
import readerRoutes from "./routes/reader.routes.js";
import writerRoutes from "./routes/writer.routes.js";

// Initialize Express app
const app = express();

// Connect to MongoDB
connectDB();

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.CLIENT_URL || true, // Set to your frontend URL in production
  credentials: true, // Allow cookies
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use("/reader", readerRoutes);
app.use("/writer", writerRoutes);
// Root endpoint
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// Export app for server entry point
export default app;
