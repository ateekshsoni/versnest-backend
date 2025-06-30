/**
 * @fileoverview Enhanced database connection management
 * Provides connection pooling, monitoring, and proper error handling
 * Implements connection lifecycle management and health checks
 */

import mongoose from 'mongoose';
import config from '../config/index.js';
import logger from '../utils/logger.js';

class DatabaseConnection {
  constructor() {
    this.isConnected = false;
    this.retryAttempts = 0;
    this.maxRetryAttempts = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async connect() {
    try {
      // Set mongoose options
      mongoose.set('strictQuery', false);
      
      // Connection options
      const options = {
        ...config.database.options,
        dbName: config.database.name,
      };

      // Connect to MongoDB
      await mongoose.connect(config.database.uri, options);
      
      this.isConnected = true;
      this.retryAttempts = 0;
      
      logger.info('MongoDB connected successfully', {
        database: config.database.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
      });

      // Set up connection event listeners
      this.setupEventListeners();
      
    } catch (error) {
      logger.error('MongoDB connection failed', {
        error: error.message,
        attempt: this.retryAttempts + 1,
      });

      if (this.retryAttempts < this.maxRetryAttempts) {
        this.retryAttempts++;
        logger.info(`Retrying connection in ${this.retryDelay / 1000} seconds...`);
        
        setTimeout(() => {
          this.connect();
        }, this.retryDelay);
      } else {
        logger.error('Max retry attempts reached. Exiting...');
        process.exit(1);
      }
    }
  }

  setupEventListeners() {
    const connection = mongoose.connection;

    // Connection events
    connection.on('connected', () => {
      logger.info('Mongoose connected to MongoDB');
    });

    connection.on('error', (error) => {
      logger.error('Mongoose connection error', { error: error.message });
    });

    connection.on('disconnected', () => {
      logger.warn('Mongoose disconnected from MongoDB');
      this.isConnected = false;
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      await this.gracefulShutdown();
    });

    process.on('SIGTERM', async () => {
      await this.gracefulShutdown();
    });
  }

  async gracefulShutdown() {
    logger.info('Received shutdown signal. Closing database connection...');
    
    try {
      await mongoose.connection.close();
      logger.info('Database connection closed successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during database shutdown', { error: error.message });
      process.exit(1);
    }
  }

  // Health check method
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'disconnected', message: 'Database not connected' };
      }

      // Ping the database
      await mongoose.connection.db.admin().ping();
      
      return { 
        status: 'healthy', 
        message: 'Database connection is healthy',
        database: config.database.name,
        collections: Object.keys(mongoose.connection.collections),
      };
    } catch (error) {
      return { 
        status: 'unhealthy', 
        message: 'Database health check failed',
        error: error.message,
      };
    }
  }

  // Get connection stats
  getStats() {
    const connection = mongoose.connection;
    
    return {
      isConnected: this.isConnected,
      host: connection.host,
      port: connection.port,
      name: connection.name,
      readyState: connection.readyState,
      collections: Object.keys(connection.collections).length,
    };
  }
}

// Create singleton instance
const databaseConnection = new DatabaseConnection();

export default databaseConnection; 