/**
 * 🚀 VerseNest Production Server
 * 
 * This server file handles:
 * - HTTP server creation and startup
 * - Graceful shutdown handling
 * - Error monitoring and recovery
 * - Performance monitoring
 * - Health checks and lifecycle management
 */

const http = require("http");
const app = require("./app.js");
const { CONFIG } = require('./src/config/index.js');
// const { initializeSocket } = require('./socket');

// Server configuration
const port = CONFIG.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';

/**
 * 🔧 Server Setup with Enhanced Configuration
 */
const server = http.createServer(app);

// Configure server timeouts for better performance
server.timeout = 120000; // 2 minutes timeout
server.keepAliveTimeout = 65000; // Keep-alive timeout
server.headersTimeout = 66000; // Headers timeout (should be > keepAliveTimeout)

// Set max listeners to prevent memory leak warnings
server.setMaxListeners(20);

/**
 * 🎯 Server Startup with Error Handling
 */
const startServer = async () => {
  try {
    console.log('🚀 Starting VerseNest Server...');
    console.log(`📋 Environment: ${CONFIG.NODE_ENV}`);
    console.log(`🌐 Host: ${host}`);
    console.log(`🔌 Port: ${port}`);
    
    // Start the server
    server.listen(port, host, () => {
      console.log('✅ Server successfully started!');
      console.log(`🌍 Server is running at http://${host}:${port}`);
      console.log(`🏥 Health check: http://${host}:${port}/health`);
      console.log(`📊 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
      console.log(`⏱️  Startup time: ${process.uptime().toFixed(2)} seconds`);
      
      // Initialize socket.io if needed
      // initializeSocket(server);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;

      switch (error.code) {
        case 'EACCES':
          console.error(`❌ ${bind} requires elevated privileges`);
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(`❌ ${bind} is already in use`);
          console.log(`💡 Try: npm run kill:port or lsof -ti:${port} | xargs kill -9`);
          process.exit(1);
          break;
        default:
          console.error(`❌ Server error:`, error);
          throw error;
      }
    });

    // Handle successful server startup
    server.on('listening', () => {
      const addr = server.address();
      const bind = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + addr.port;
      console.log(`🎧 Server listening on ${bind}`);
    });

  } catch (error) {
    console.error('💥 Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * 🔄 Graceful Shutdown Handler
 */
const gracefulShutdown = (signal) => {
  console.log(`\n📤 ${signal} received, initiating graceful shutdown...`);
  
  const shutdownTimeout = setTimeout(() => {
    console.error('❌ Forceful shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 seconds timeout

  server.close(async () => {
    console.log('🔌 HTTP server closed');
    
    try {
      // Close database connections
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('🗄️  Database connection closed');
      }
      
      // Close other resources (Redis, etc.)
      // if (redisClient) {
      //   await redisClient.quit();
      //   console.log('🔴 Redis connection closed');
      // }
      
      clearTimeout(shutdownTimeout);
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      clearTimeout(shutdownTimeout);
      process.exit(1);
    }
  });
  
  // Stop accepting new connections
  server.closeAllConnections?.(); // Node.js 18+
};

/**
 * 🛡️ Enhanced Error Handling
 */
// Graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  console.error('Stack trace:', err.stack);
  
  // Log to external service in production
  if (CONFIG.IS_PRODUCTION) {
    // await logErrorToService(err);
  }
  
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
  
  // Log to external service in production
  if (CONFIG.IS_PRODUCTION) {
    // await logErrorToService(reason);
  }
  
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Handle warnings
process.on('warning', (warning) => {
  console.warn('⚠️  Process Warning:', warning.name);
  console.warn('Message:', warning.message);
  console.warn('Stack:', warning.stack);
});

/**
 * 📊 Performance Monitoring
 */
if (CONFIG.IS_DEVELOPMENT) {
  // Monitor memory usage in development
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const formatMB = (bytes) => Math.round(bytes / 1024 / 1024);
    
    console.log(`📊 Memory - RSS: ${formatMB(memUsage.rss)}MB, Heap: ${formatMB(memUsage.heapUsed)}/${formatMB(memUsage.heapTotal)}MB`);
  }, 60000); // Every minute
}

/**
 * 🚀 Start the Server
 */
startServer();