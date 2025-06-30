/**
 * 🔧 CENTRALIZED CONFIGURATION MANAGEMENT
 * 
 * This file consolidates all environment variables and configuration settings
 * into a single, validated source of truth. This approach follows the 
 * "Single Source of Truth" principle and makes configuration management
 * more maintainable and secure.
 * 
 * Key Benefits:
 * - Type safety through validation
 * - Environment-specific configurations
 * - Centralized configuration access
 * - Error handling for missing variables
 */

require('dotenv').config();

// Simple configuration object without validation for now
const CONFIG = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3000,
  
  // Database Configuration
  MONGO_URI: process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/versenest',
  
  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'default-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  
  // Email Configuration
  EMAIL_HOST: process.env.EMAIL_HOST,
  EMAIL_PORT: parseInt(process.env.EMAIL_PORT) || 587,
  EMAIL_USER: process.env.EMAIL_USER,
  EMAIL_PASS: process.env.EMAIL_PASS,
  
  // Client Configuration
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',
  
  // Security
  BCRYPT_ROUNDS: parseInt(process.env.BCRYPT_ROUNDS) || 12,
  
  // Admin Configuration
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'admin@versenest.com',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin123',
  
  // Redis Configuration (optional)
  REDIS_URL: process.env.REDIS_URL,
  
  // File Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  
  // Rate Limiting
  RATE_LIMIT_WINDOW: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
};

module.exports = { CONFIG };
  DB_TIMEOUT: z.string().transform(Number).pipe(z.number().positive()).default(5000),
  
  // JWT Configuration
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT refresh secret must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('versenest-api'),
  JWT_AUDIENCE: z.string().default('versenest-users'),
  
  // Security Settings
  BCRYPT_ROUNDS: z.string().transform(Number).pipe(z.number().min(8).max(15)).default(12),
  MAX_LOGIN_ATTEMPTS: z.string().transform(Number).pipe(z.number().positive()).default(5),
  LOCKOUT_DURATION: z.string().transform(Number).pipe(z.number().positive()).default(900000),
  PASSWORD_MIN_LENGTH: z.string().transform(Number).pipe(z.number().min(6)).default(8),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).pipe(z.number().positive()).default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).pipe(z.number().positive()).default(100),
  
  // CORS Configuration
  CLIENT_URL: z.string().url(),
  
  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.string().default('combined'),
  LOG_MAX_FILES: z.string().transform(Number).pipe(z.number().positive()).default(5),
  LOG_MAX_SIZE: z.string().default('10m'),
  
  // Performance Settings
  ENABLE_COMPRESSION: z.string().transform(val => val === 'true').default(true),
  TRUST_PROXY: z.string().transform(val => val === 'true').default(false),
  REQUEST_TIMEOUT: z.string().transform(Number).pipe(z.number().positive()).default(30000),
  
  // Feature Flags
  ENABLE_METRICS: z.string().transform(val => val === 'true').default(true),
  ENABLE_HEALTH_CHECK: z.string().transform(val => val === 'true').default(true),
  ENABLE_API_DOCS: z.string().transform(val => val === 'true').default(true),
  
  // Redis Configuration (optional)
  REDIS_URL: z.string().url().optional(),
  REDIS_PASSWORD: z.string().optional(),
  
  // Admin Configuration
  ADMIN_EMAIL: z.string().email().default('admin@versenest.com'),
  ADMIN_PASSWORD: z.string().min(8).default('Admin@123456'),
  
  // Development Settings
  DEBUG: z.string().optional(),
  DETAILED_ERRORS: z.string().transform(val => val === 'true').default(false),
});

// 🔍 Validate Configuration
let config;
try {
  config = configSchema.parse(process.env);
} catch (error) {
  console.error('❌ Configuration validation failed:');
  console.error(error.errors);
  process.exit(1);
}

// 📚 Environment-specific configurations
const environmentConfig = {
  development: {
    logLevel: 'debug',
    enableDetailedErrors: true,
    enableApiDocs: true,
  },
  production: {
    logLevel: 'info',
    enableDetailedErrors: false,
    enableApiDocs: false,
  },
  test: {
    logLevel: 'error',
    enableDetailedErrors: false,
    enableApiDocs: false,
  }
};

// 🎯 Final Configuration Object
export const CONFIG = {
  ...config,
  ...environmentConfig[config.NODE_ENV],
  
  // Computed properties
  isDevelopment: config.NODE_ENV === 'development',
  isProduction: config.NODE_ENV === 'production',
  isTest: config.NODE_ENV === 'test',
  
  // Database configuration object
  database: {
    uri: config.MONGO_URI,
    maxPoolSize: config.DB_MAX_POOL_SIZE,
    serverSelectionTimeoutMS: config.DB_TIMEOUT,
    socketTimeoutMS: 45000,
  },
  
  // JWT configuration object
  jwt: {
    secret: config.JWT_SECRET,
    refreshSecret: config.JWT_REFRESH_SECRET,
    accessExpiry: config.JWT_ACCESS_EXPIRY,
    refreshExpiry: config.JWT_REFRESH_EXPIRY,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  },
  
  // Security configuration object
  security: {
    bcryptRounds: config.BCRYPT_ROUNDS,
    maxLoginAttempts: config.MAX_LOGIN_ATTEMPTS,
    lockoutDuration: config.LOCKOUT_DURATION,
    passwordMinLength: config.PASSWORD_MIN_LENGTH,
  },
  
  // Rate limiting configuration
  rateLimit: {
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
  },
  
  // Redis configuration
  redis: config.REDIS_URL ? {
    url: config.REDIS_URL,
    password: config.REDIS_PASSWORD,
  } : null,
  
  // Admin configuration
  admin: {
    email: config.ADMIN_EMAIL,
    password: config.ADMIN_PASSWORD,
  },
};

export default CONFIG;
