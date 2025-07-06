/**
 * Production-Ready MongoDB Connection Module
 * Enhanced with security, reliability, and monitoring capabilities
 */

const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { getDatabaseConfig, getConnectionUris } = require('../config/database');

// Connection state management
let isConnected = false;
let connectionAttempts = 0;
const databaseConfig = getDatabaseConfig();
const MAX_RETRY_ATTEMPTS = databaseConfig.maxRetryAttempts;
const RETRY_INTERVAL = databaseConfig.retryInterval;

/**
 * Validates MongoDB URI format and structure
 * @param {string} uri - MongoDB connection string
 * @returns {boolean} - Whether URI is valid
 */
const validateMongoUri = (uri) => {
  if (!uri || typeof uri !== 'string') {
    return false;
  }
  
  // Basic MongoDB URI validation
  const mongoUriRegex = /^mongodb(\+srv)?:\/\//;
  return mongoUriRegex.test(uri);
};

/**
 * Generates secure connection URI with fallback logic
 * @returns {string} - Validated MongoDB URI
 */
const getMongoUri = () => {
  const uriCandidates = getConnectionUris().filter(Boolean);
  
  for (const uri of uriCandidates) {
    if (validateMongoUri(uri)) {
      // Mask credentials in logs
      const maskedUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://***:***@');
      logger.info(`Using MongoDB URI: ${maskedUri}`);
      return uri;
    }
  }
  
  throw new Error('No valid MongoDB URI found in environment variables');
};

/**
 * Enhanced connection options optimized for production
 */
const getConnectionOptions = () => {
  const config = getDatabaseConfig();
  
  return {
    // Connection pool optimization
    maxPoolSize: config.maxPoolSize,
    minPoolSize: config.minPoolSize,
    
    // Timeout settings
    serverSelectionTimeoutMS: config.serverSelectionTimeoutMS,
    socketTimeoutMS: config.socketTimeoutMS,
    connectTimeoutMS: config.connectTimeoutMS,
    
    // Heartbeat and monitoring
    heartbeatFrequencyMS: config.heartbeatFrequencyMS,
    maxIdleTimeMS: config.maxIdleTimeMS,
    
    // Write concern for data consistency
    writeConcern: config.writeConcern,
    
    // Read preference for load balancing
    readPreference: config.readPreference,
    
    // Additional production optimizations
    ...(config.compressors && { compressors: config.compressors }),
    ...(config.maxStalenessSeconds && { maxStalenessSeconds: config.maxStalenessSeconds }),
    ...(config.authSource && { authSource: config.authSource })
  };
};

/**
 * Sets up comprehensive connection event monitoring
 */
const setupConnectionMonitoring = () => {
  const connection = mongoose.connection;
  
  // Connection events
  connection.on('connected', () => {
    isConnected = true;
    connectionAttempts = 0;
    logger.info('✅ MongoDB connection established');
  });
  
  connection.on('error', (error) => {
    isConnected = false;
    logger.error('❌ MongoDB connection error:', {
      error: error.message,
      stack: error.stack,
      attempts: connectionAttempts
    });
  });
  
  connection.on('disconnected', () => {
    isConnected = false;
    logger.warn('⚠️ MongoDB disconnected');
    
    // Attempt reconnection if not shutting down
    if (!process.env.SHUTDOWN_INITIATED) {
      handleReconnection();
    }
  });
  
  connection.on('reconnected', () => {
    isConnected = true;
    logger.info('🔄 MongoDB reconnected successfully');
  });
  
  // Monitoring events
  connection.on('fullsetup', () => {
    logger.info('📊 MongoDB replica set fully connected');
  });
  
  connection.on('timeout', () => {
    logger.warn('⏱️ MongoDB connection timeout');
  });
};

/**
 * Handles reconnection logic with exponential backoff
 */
const handleReconnection = async () => {
  if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
    logger.error('💥 Maximum reconnection attempts reached. Shutting down.');
    process.exit(1);
  }
  
  connectionAttempts++;
  const delay = RETRY_INTERVAL * Math.pow(2, connectionAttempts - 1); // Exponential backoff
  
  logger.info(`� Attempting reconnection #${connectionAttempts} in ${delay}ms...`);
  
  setTimeout(async () => {
    try {
      await connectDB();
    } catch (error) {
      logger.error('Failed to reconnect:', error.message);
    }
  }, delay);
};

/**
 * Sets up graceful shutdown handlers
 */
const setupGracefulShutdown = () => {
  const shutdown = async (signal) => {
    logger.info(`📤 Received ${signal}. Initiating graceful shutdown...`);
    process.env.SHUTDOWN_INITIATED = 'true';
    
    try {
      await mongoose.connection.close();
      logger.info('✅ MongoDB connection closed gracefully');
    } catch (error) {
      logger.error('Error during MongoDB shutdown:', error.message);
    } finally {
      process.exit(0);
    }
  };
  
  // Handle various shutdown signals
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    shutdown('unhandledRejection');
  });
};

/**
 * Main connection function with enhanced error handling
 */
const connectDB = async () => {
  // Prevent multiple simultaneous connections
  if (isConnected || mongoose.connection.readyState === 1) {
    logger.warn('MongoDB connection already established');
    return mongoose.connection;
  }
  
  try {
    const mongoUri = getMongoUri();
    const options = getConnectionOptions();
    
    logger.info('� Initiating MongoDB connection...');
    
    const conn = await mongoose.connect(mongoUri, options);
    
    // Log successful connection details (without sensitive info)
    const { host, port, name } = conn.connection;
    logger.info('✅ MongoDB Connected Successfully', {
      host,
      port,
      database: name,
      environment: process.env.NODE_ENV || 'development',
      poolSize: options.maxPoolSize
    });
    
    return conn;
    
  } catch (error) {
    connectionAttempts++;
    logger.error('💥 Database connection failed:', {
      error: error.message,
      attempts: connectionAttempts,
      maxAttempts: MAX_RETRY_ATTEMPTS
    });
    
    if (connectionAttempts >= MAX_RETRY_ATTEMPTS) {
      logger.error('Maximum connection attempts reached. Exiting...');
      process.exit(1);
    }
    
    // Retry connection with exponential backoff
    const delay = RETRY_INTERVAL * Math.pow(2, connectionAttempts - 1);
    logger.info(`Retrying connection in ${delay}ms...`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectDB();
  }
};

/**
 * Initialize database connection and monitoring
 */
const initializeDatabase = async () => {
  setupConnectionMonitoring();
  setupGracefulShutdown();
  
  return connectDB();
};

/**
 * Health check function for monitoring
 */
const healthCheck = () => {
  return {
    isConnected,
    readyState: mongoose.connection.readyState,
    connectionAttempts,
    host: mongoose.connection.host,
    name: mongoose.connection.name
  };
};

// Export functions
module.exports = {
  connectDB: initializeDatabase,
  healthCheck,
  isConnected: () => isConnected
};
