import blacklistTokenModel from "../models/blacklistToken.model.js";
import WriterModel from "../models/writer.model.js";
import { createWriter } from "../services/writer.service.js";
import { validationResult } from "express-validator";

/**
 * Register a new writer
 * @route POST /writer/register
 */
const registerWriter = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    // Prevent duplicate registration
    const existing = await WriterModel.findOne({ email: req.body.email });
    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }
    // Extract fields from request body
    const { fullName, email, password, genreFocus, penName, shortBio } =
      req.body;

    // Create a new writer instance (not yet saved)
    const writer = await createWriter({
      fullName,
      email,
      password,
      genreFocus,
      penName,
      shortBio,
    });

    // Generate authentication token for the writer
    const token = await writer.generateAuthToken();
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    }); // Set the token in a cookie
    // Save the writer to the database
    await writer.save();

    // Remove password from response
    const writerObj = writer.toObject();
    delete writerObj.password;
    // Send success response with writer info and token
    res
      .status(201)
      .json({ message: "Writer registered successfully", writer: writerObj, token });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

/**
 * Login a writer
 * @route POST /writer/login
 */
const loginWriter = async (req, res, next) => {
  try {
    // Validate request body using express-validator
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Extract email and password from request body
    const { email, password } = req.body;

    const writer = await WriterModel.findOne({ email }).select("+password");
    if (!writer) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Compare password with stored hash
    const isMatch = await writer.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    // Generate authentication token for the writer
    const token = await writer.generateAuthToken();
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    }); // Set the token in a cookie
    // Remove password from response
    const writerObj = writer.toObject();
    delete writerObj.password;
    // Send success response with writer info and token
    res
      .status(200)
      .json({ message: "Writer logged in successfully", writer: writerObj, token });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

/**
 * Get writer profile
 * @route GET /writer/profile
 */
const getWriterProfile = async (req, res, next) => {
  try {
    // Use lean for performance, ensure password is not returned
    const writer = await WriterModel.findById(req.writer._id).select("-password").lean();
    res.status(200).json({
      message: "Writer profile fetched successfully",
      writer,
    });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

/**
 * Logout writer (should be POST for best practice)
 * @route POST /writer/logout
 */
const writerLogout = async (req, res, next) => {
  try {
    // Clear the token cookie
    const token = req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    res.clearCookie("token");
    await blacklistTokenModel.create({ token });
    res.status(200).json({ message: "Writer logged out successfully" });
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

// Export controller methods
export default { registerWriter, loginWriter, getWriterProfile, writerLogout };
