/**
 * @fileoverview Centralized configuration management for the application
 * This module provides a single source of truth for all configuration values
 * and ensures type safety and validation of environment variables.
 */

import dotenv from 'dotenv';
import Joi from 'joi';

// Load environment variables
dotenv.config();

/**
 * Environment configuration schema for validation
 * This ensures all required environment variables are present and valid
 */
const envVarsSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  
  // Server Configuration
  PORT: Joi.number().default(3000),
  HOST: Joi.string().default('localhost'),
  
  // Database Configuration
  MONGO_URI: Joi.string().required(),
  MONGO_DB_NAME: Joi.string().required(),
  
  // JWT Configuration
  JWT_SECRET: Joi.string().required().min(32),
  JWT_EXPIRES_IN: Joi.string().default('24h'),
  JWT_REFRESH_SECRET: Joi.string().required().min(32),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),
  
  // Redis Configuration (for caching and sessions)
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: Joi.string().optional(),
  
  // Security Configuration
  CORS_ORIGIN: Joi.string().default('*'),
  COOKIE_SECRET: Joi.string().min(32).required(),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: Joi.number().default(15 * 60 * 1000), // 15 minutes
  RATE_LIMIT_MAX: Joi.number().default(100),
  
  // Email Configuration (for notifications)
  SMTP_HOST: Joi.string().optional(),
  SMTP_PORT: Joi.number().optional(),
  SMTP_USER: Joi.string().optional(),
  SMTP_PASS: Joi.string().optional(),
  FROM_EMAIL: Joi.string().email().optional(),
  
  // File Upload Configuration
  MAX_FILE_SIZE: Joi.number().default(5 * 1024 * 1024), // 5MB
  UPLOAD_PATH: Joi.string().default('./uploads'),
  
  // Logging Configuration
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
  LOG_FILE: Joi.string().default('./logs/app.log'),
  
  // Monitoring Configuration
  ENABLE_MONITORING: Joi.boolean().default(true),
  MONITORING_PORT: Joi.number().default(3001),
  
  // API Documentation
  API_PREFIX: Joi.string().default('/api/v1'),
  API_VERSION: Joi.string().default('1.0.0'),
  
  // Client Configuration
  CLIENT_URL: Joi.string().optional(),
  
  // Feature Flags
  ENABLE_CACHE: Joi.boolean().default(true),
  ENABLE_RATE_LIMITING: Joi.boolean().default(true),
  ENABLE_COMPRESSION: Joi.boolean().default(true),
}).unknown();

/**
 * Validate environment variables against schema
 */
const { error, value: envVars } = envVarsSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

/**
 * Application configuration object
 * Provides type-safe access to all configuration values
 */
const config = {
  // Environment
  env: envVars.NODE_ENV,
  isDevelopment: envVars.NODE_ENV === 'development',
  isProduction: envVars.NODE_ENV === 'production',
  isTest: envVars.NODE_ENV === 'test',
  
  // Server
  server: {
    port: envVars.PORT,
    host: envVars.HOST,
    url: `http://${envVars.HOST}:${envVars.PORT}`,
  },
  
  // Database
  database: {
    uri: envVars.MONGO_URI,
    name: envVars.MONGO_DB_NAME,
    options: {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferMaxEntries: 0,
      useNewUrlParser: true,
      useUnifiedTopology: true,
    },
  },
  
  // JWT
  jwt: {
    secret: envVars.JWT_SECRET,
    expiresIn: envVars.JWT_EXPIRES_IN,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
    refreshExpiresIn: envVars.JWT_REFRESH_EXPIRES_IN,
    cookieOptions: {
      httpOnly: true,
      secure: envVars.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
  
  // Redis
  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD,
    options: {
      retryDelayOnFailover: 100,
      enableReadyCheck: false,
      maxRetriesPerRequest: null,
    },
  },
  
  // Security
  security: {
    corsOrigin: envVars.CORS_ORIGIN,
    cookieSecret: envVars.COOKIE_SECRET,
    bcryptRounds: 12,
    passwordMinLength: 8,
    passwordMaxLength: 128,
    rateLimit: {
      windowMs: envVars.RATE_LIMIT_WINDOW_MS,
      max: envVars.RATE_LIMIT_MAX,
    },
  },
  
  // Email
  email: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    user: envVars.SMTP_USER,
    pass: envVars.SMTP_PASS,
    from: envVars.FROM_EMAIL,
    secure: envVars.NODE_ENV === 'production',
  },
  
  // File Upload
  upload: {
    maxFileSize: envVars.MAX_FILE_SIZE,
    uploadPath: envVars.UPLOAD_PATH,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'text/plain'],
  },
  
  // Logging
  logging: {
    level: envVars.LOG_LEVEL,
    file: envVars.LOG_FILE,
    maxFiles: '14d', // Keep logs for 14 days
    maxSize: '20m', // Max file size 20MB
  },
  
  // Monitoring
  monitoring: {
    enabled: envVars.ENABLE_MONITORING,
    port: envVars.MONITORING_PORT,
  },
  
  // API Documentation
  api: {
    prefix: envVars.API_PREFIX,
    version: envVars.API_VERSION,
  },
  
  // Client
  client: {
    url: envVars.CLIENT_URL,
  },
  
  // Feature Flags
  features: {
    cache: envVars.ENABLE_CACHE,
    rateLimiting: envVars.ENABLE_RATE_LIMITING,
    compression: envVars.ENABLE_COMPRESSION,
  },
};

export default config; 