/**
 * Optimized Database Connection
 * Production-ready MongoDB connection with performance optimization
 */

const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/versenest';
    
    console.log('Connecting to MongoDB...');
    
    // Optimized connection options for production
    const options = {
      // Connection pool optimization
      maxPoolSize: 10, // Maximum number of connections in the connection pool
      minPoolSize: 2,  // Minimum number of connections
      
      // Timeout settings
      serverSelectionTimeoutMS: 5000, // How long mongoose will wait for server selection
      socketTimeoutMS: 45000, // How long a send or receive on a socket can take
      connectTimeoutMS: 10000, // How long to wait for initial connection
      
      // Other optimizations
      maxIdleTimeMS: 30000, // Close connections after 30 seconds of inactivity
      
      // Remove deprecated options - these are now handled automatically
      // bufferMaxEntries: 0, // DEPRECATED
      // bufferCommands: false, // DEPRECATED
      // useNewUrlParser: true, // DEPRECATED
      // useUnifiedTopology: true, // DEPRECATED
    };

    const conn = await mongoose.connect(mongoUri, options);

    console.log(`✅ MongoDB Connected: ${conn.connection.host}:${conn.connection.port}`);
    console.log(`📊 Database: ${conn.connection.name}`);
    
    // Set up event listeners for monitoring
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🔄 MongoDB reconnected');
    });

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('📤 Closing MongoDB connection...');
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    });

    return conn;
  } catch (error) {
    console.error('💥 Database connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
