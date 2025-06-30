/**
 * 🗄️ ENHANCED DATABASE CONNECTION
 * 
 * This file provides a robust database connection with advanced features:
 * - Connection pooling optimization
 * - Automatic retry logic
 * - Health monitoring
 * - Graceful shutdown handling
 * - Performance monitoring
 * - Error handling and logging
 * 
 * Learning Points:
 * - Database connection pooling improves performance
 * - Health checks ensure database availability
 * - Graceful shutdown prevents data corruption
 * - Connection events help with monitoring
 * - Retry logic handles temporary network issues
 */

import mongoose from 'mongoose';
import { CONFIG } from '../config/index.js';
import { appLogger } from '../utils/logger.js';
import { DatabaseError } from '../utils/errors.js';

/**
 * 🔄 Database Connection State Management
 */
class DatabaseManager {
  constructor() {
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
    this.healthCheckInterval = null;
  }

  /**
   * 🚀 Initialize Database Connection
   * 
   * Sets up the database connection with all necessary configurations
   * and event handlers for monitoring and error handling.
   */
  async connect() {
    try {
      // Configure Mongoose settings
      await this.configureMongoose();
      
      // Establish connection
      await this.establishConnection();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();
      
      appLogger.info('Database connection established successfully', {
        database: this.getDatabaseName(),
        connectionState: mongoose.connection.readyState,
      });
      
      this.isConnected = true;
      this.connectionRetries = 0;
      
    } catch (error) {
      appLogger.error('Failed to connect to database', {
        error: error.message,
        retries: this.connectionRetries,
        maxRetries: this.maxRetries,
      });
      
      await this.handleConnectionError(error);
    }
  }

  /**
   * ⚙️ Configure Mongoose Settings
   * 
   * Sets up Mongoose with optimal settings for production use
   */
  async configureMongoose() {
    // Mongoose configuration for production
    mongoose.set('strictQuery', false);
    
    // Disable mongoose's default promise library warning
    mongoose.Promise = global.Promise;
    
    // Configure connection options
    const connectionOptions = {
      // Connection pool settings
      maxPoolSize: CONFIG.database.maxPoolSize,
      minPoolSize: 1,
      
      // Timeout settings
      serverSelectionTimeoutMS: CONFIG.database.serverSelectionTimeoutMS,
      socketTimeoutMS: CONFIG.database.socketTimeoutMS,
      connectTimeoutMS: 10000,
      
      // Heartbeat settings
      heartbeatFrequencyMS: 10000,
      
      // Retry logic
      retryWrites: true,
      retryReads: true,
      
      // Buffer settings
      bufferMaxEntries: 0,
      bufferCommands: false,
      
      // Authentication
      authSource: 'admin',
    };

    return connectionOptions;
  }

  /**
   * 🔗 Establish Database Connection
   */
  async establishConnection() {
    const options = await this.configureMongoose();
    
    const startTime = Date.now();
    await mongoose.connect(CONFIG.database.uri, options);
    const duration = Date.now() - startTime;
    
    appLogger.logDatabase('connect', 'mongodb', duration, true);
  }

  /**
   * 📡 Setup Event Listeners
   * 
   * Monitors database connection events for logging and error handling
   */
  setupEventListeners() {
    // Connection opened
    mongoose.connection.on('connected', () => {
      appLogger.info('Database connected', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
      });
    });

    // Connection error
    mongoose.connection.on('error', (error) => {
      appLogger.error('Database connection error', {
        error: error.message,
        stack: error.stack,
      });
    });

    // Connection disconnected
    mongoose.connection.on('disconnected', () => {
      appLogger.warn('Database disconnected');
      this.isConnected = false;
    });

    // Connection reconnected
    mongoose.connection.on('reconnected', () => {
      appLogger.info('Database reconnected');
      this.isConnected = true;
    });

    // Connection close
    mongoose.connection.on('close', () => {
      appLogger.info('Database connection closed');
      this.isConnected = false;
    });

    // MongoDB driver events
    mongoose.connection.on('fullsetup', () => {
      appLogger.debug('Database replica set fully setup');
    });

    mongoose.connection.on('all', () => {
      appLogger.debug('Database replica set connected to all servers');
    });
  }

  /**
   * 🏥 Start Health Monitoring
   * 
   * Periodically checks database health and logs metrics
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        appLogger.error('Database health check failed', {
          error: error.message,
        });
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * 🔍 Perform Health Check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      // Simple ping to check connection
      await mongoose.connection.db.admin().ping();
      
      const duration = Date.now() - startTime;
      const stats = await this.getConnectionStats();
      
      appLogger.logPerformance('database_health_check', duration, stats);
      
    } catch (error) {
      throw new DatabaseError('Health check failed', error);
    }
  }

  /**
   * 📊 Get Connection Statistics
   */
  async getConnectionStats() {
    try {
      const db = mongoose.connection.db;
      const stats = await db.stats();
      
      return {
        readyState: mongoose.connection.readyState,
        collections: stats.collections,
        dataSize: stats.dataSize,
        indexSize: stats.indexSize,
        storageSize: stats.storageSize,
        connectionCount: mongoose.connection.totalSocketCount || 0,
      };
    } catch (error) {
      appLogger.warn('Failed to get database stats', { error: error.message });
      return {
        readyState: mongoose.connection.readyState,
        connectionCount: 0,
      };
    }
  }

  /**
   * 🔄 Handle Connection Errors
   */
  async handleConnectionError(error) {
    this.connectionRetries++;
    
    if (this.connectionRetries >= this.maxRetries) {
      appLogger.error('Maximum database connection retries exceeded', {
        maxRetries: this.maxRetries,
        error: error.message,
      });
      
      // In production, you might want to implement circuit breaker pattern
      // or alert monitoring systems here
      throw new DatabaseError('Database connection failed after maximum retries', error);
    }

    // Wait before retrying
    appLogger.info(`Retrying database connection in ${this.retryDelay}ms`, {
      attempt: this.connectionRetries,
      maxRetries: this.maxRetries,
    });
    
    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
    
    // Exponential backoff
    this.retryDelay = Math.min(this.retryDelay * 2, 30000); // Max 30 seconds
    
    return this.connect();
  }

  /**
   * 🛑 Graceful Shutdown
   * 
   * Properly closes database connections on application shutdown
   */
  setupGracefulShutdown() {
    const shutdownHandler = async (signal) => {
      appLogger.info(`Received ${signal}, shutting down database connection...`);
      
      try {
        // Clear health check interval
        if (this.healthCheckInterval) {
          clearInterval(this.healthCheckInterval);
        }
        
        // Close mongoose connection
        await mongoose.connection.close();
        
        appLogger.info('Database connection closed successfully');
        process.exit(0);
        
      } catch (error) {
        appLogger.error('Error during database shutdown', {
          error: error.message,
        });
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGUSR2', () => shutdownHandler('SIGUSR2')); // Nodemon restart
  }

  /**
   * 📋 Get Database Information
   */
  getDatabaseName() {
    return mongoose.connection.name || 'unknown';
  }

  /**
   * 🔍 Get Connection Status
   */
  getConnectionStatus() {
    const readyStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };

    return {
      isConnected: this.isConnected,
      readyState: readyStates[mongoose.connection.readyState] || 'unknown',
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      database: mongoose.connection.name,
    };
  }

  /**
   * 🧹 Clean Disconnection
   */
  async disconnect() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
    
    this.isConnected = false;
    appLogger.info('Database disconnected manually');
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

/**
 * 🚀 Main Connect Function
 * 
 * Exported function to establish database connection
 */
export const connectDatabase = async () => {
  return databaseManager.connect();
};

/**
 * 🔍 Database Health Check Function
 * 
 * Returns current database health status
 */
export const getDatabaseHealth = async () => {
  try {
    const stats = await databaseManager.getConnectionStats();
    const status = databaseManager.getConnectionStatus();
    
    return {
      status: status.isConnected ? 'healthy' : 'unhealthy',
      ...status,
      ...stats,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
};

/**
 * 🛑 Disconnect Function
 */
export const disconnectDatabase = async () => {
  return databaseManager.disconnect();
};

// Export database manager for advanced usage
export { databaseManager };

// Default export for backwards compatibility
export default connectDatabase;
