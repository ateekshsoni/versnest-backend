// Import Reader model and service for registration
import ReaderModel from "../models/reader.model.js";
import { createReader } from "../services/reader.service.js";
import { validationResult } from "express-validator";
import blacklistTokenModel from "../models/blacklistToken.model.js";
// Controller for registering a new reader
/**
 * Register a new reader
 * @route POST /reader/register
 */
const registerReader = async (req, res, next) => {
  try {
    // Validate request body using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    // Prevent duplicate registration
    const existing = await ReaderModel.findOne({ email: req.body.email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }
    // Extract fields from request body
    const { fullName, email, password, genreFocus, moodPreferences } = req.body;
    // Create a new reader instance (not yet saved)
    const reader = await createReader({
      fullName,
      email,
      password,
      genreFocus,
      moodPreferences,
    });
    // Generate authentication token for the reader
    const token = await reader.generateAuthToken();
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    // Save the reader to the database
    await reader.save();
    // Remove password from response
    const readerObj = reader.toObject();
    delete readerObj.password;
    // Send success response with reader info and token
    res.status(201).json({ message: "Reader registered successfully", reader: readerObj, token });
  } catch (error) {
    next(error);
  }
};
/**
 * Login a reader
 * @route POST /reader/login
 */
const loginReader = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    const { email, password } = req.body;
    const reader = await ReaderModel.findOne({ email }).select("+password");
    if (!reader) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const isMatch = await reader.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = await reader.generateAuthToken();
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });
    // Remove password from response
    const readerObj = reader.toObject();
    delete readerObj.password;
    res.status(200).json({ message: "Reader logged in successfully", reader: readerObj, token });
  } catch (error) {
    next(error);
  }
};
/**
 * Get reader profile
 * @route GET /reader/profile
 */
const getReaderProfile = async (req, res, next) => {
  try {
    // Use lean for performance, ensure password is not returned
    const reader = await ReaderModel.findById(req.reader._id).select("-password").lean();
    res.status(200).json({
      message: "Reader profile fetched successfully",
      reader,
    });
  } catch (error) {
    next(error);
  }
};
/**
 * Logout reader (should be POST for best practice)
 * @route POST /reader/logout
 */
const logoutReader = async (req, res, next) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.clearCookie("token");
    await blacklistTokenModel.create({ token });
    res.status(200).json({ message: "Reader logged out successfully" });
  } catch (error) {
    next(error);
  }
};

// Export controller methods
export default { registerReader, loginReader, getReaderProfile, logoutReader };
