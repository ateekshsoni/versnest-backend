/**
 * Simple Logger Utility
 * Basic logging for the application
 */

const logger = {
  info: (message, data) => {
    console.log(`[INFO] ${message}`, data ? JSON.stringify(data) : '');
  },
  
  error: (message, data) => {
    console.error(`[ERROR] ${message}`, data ? JSON.stringify(data) : '');
  },
  
  warn: (message, data) => {
    console.warn(`[WARN] ${message}`, data ? JSON.stringify(data) : '');
  },
  
  debug: (message, data) => {
    console.debug(`[DEBUG] ${message}`, data ? JSON.stringify(data) : '');
  }
};

// Export for CommonJS
module.exports = logger;

// Export for ES6 modules (for compatibility with existing models)
module.exports.appLogger = logger;
module.exports.default = logger;
