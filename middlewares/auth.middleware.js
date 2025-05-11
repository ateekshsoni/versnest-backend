import blacklistTokenModel from "../models/blacklistToken.model.js";
import ReaderModel from "../models/reader.model.js";
import writerModel from "../models/writer.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

// Middleware to authenticate Reader using JWT and check blacklist
const authReader = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Check if token is blacklisted
    const isBlacklisted = await blacklistTokenModel.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      // Verify JWT and attach reader to request
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const reader = await ReaderModel.findById(decoded._id).select(
        "-password"
      );
      if (!reader) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      req.reader = reader;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

// Middleware to authenticate Writer using JWT and check blacklist
const authWriter = async (req, res, next) => {
  try {
    // Get token from cookie or Authorization header
    const token =
      req.cookies?.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    // Check if token is blacklisted
    const isBlacklisted = await blacklistTokenModel.findOne({ token });
    if (isBlacklisted) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    try {
      // Verify JWT and attach writer to request
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const writer = await writerModel
        .findById(decoded._id)
        .select("-password");
      if (!writer) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      req.writer = writer;
      return next();
    } catch (error) {
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch (error) {
    // Pass errors to error handling middleware
    next(error);
  }
};

export default { authReader, authWriter };
