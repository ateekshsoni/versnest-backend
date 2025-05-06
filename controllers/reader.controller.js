// Import Reader model and service for registration
import ReaderModel from "../models/reader.model.js";
import { createReader } from "../services/reader.service.js";
import { validationResult } from "express-validator";
import blacklistTokenModel from "../models/blacklistToken.model.js";
// Controller for registering a new reader
const registerReader = async (req, res, next) => {
  try {
    // Validate request body using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
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
    res.cookie("token", token); // Set the token in a cookie

    // Save the reader to the database
    await reader.save();

    // Send success response with reader info and token
    res
      .status(201)
      .json({ message: "Reader registered successfully", reader, token });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};
const loginReader = async (req, res, next) => {
  try {
    // Validate request body using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Extract email and password from request body
    const { email, password } = req.body;

    const reader = await ReaderModel.findOne({ email }).select("+password");
    if (!reader) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Compare password with stored hash
    const isMatch = await reader.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Generate authentication token for the reader
    const token = await reader.generateAuthToken();
    res.cookie("token", token); // Set the token in a cookie
    // Send success response with reader info and token
    res
      .status(200)
      .json({ message: "Reader logged in successfully", reader, token });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

// Controller for getting reader profile
const getReaderProfile = async (req, res, next) => {
  try {
    res.status(200).json({
      message: "Reader profile fetched successfully",
      reader: req.reader,
    });
  } catch (error) {
    // Pass errors to error handling middleware
    res.status(500).json({ message: "Internal server error" });
    next(error);
  }
};
const logoutReader = async (req, res, next) => {
    try {
        // Clear the authentication token cookie
        const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
        if (!token) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        res.clearCookie("token");
        await blacklistTokenModel.create({ token });
        res.status(200).json({ message: "Reader logged out successfully" });
    } catch (error) {
        // Pass errors to error handling middleware
        next(error);
    }
    };

// Export controller methods
export default { registerReader, loginReader, getReaderProfile , logoutReader };
