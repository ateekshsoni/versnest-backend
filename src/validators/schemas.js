/**
 * 🛡️ INPUT VALIDATION SCHEMAS
 * 
 * This file contains all Zod validation schemas for input validation.
 * Zod is a TypeScript-first schema declaration and validation library
 * that provides excellent runtime type safety and validation.
 * 
 * Why Zod over express-validator?
 * - Type-safe schemas
 * - Better error messages
 * - Composable and reusable schemas
 * - Automatic TypeScript type inference
 * - More expressive validation rules
 * 
 * Learning Points:
 * - Schema-driven validation improves API reliability
 * - Centralized validation schemas promote consistency
 * - Custom validators can encode business rules
 * - Proper error handling improves user experience
 */

const { z } = require('zod');

/**
 * 🔧 Common Validation Helpers
 * 
 * Reusable validation patterns that can be composed into larger schemas
 */

// MongoDB ObjectId pattern
const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// Password validation with security requirements
const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters long')
  .max(128, 'Password must not exceed 128 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, 
    'Password must contain at least one lowercase letter, one uppercase letter, one number, and one special character');

// Email validation with custom error message
const emailSchema = z.string()
  .email('Please provide a valid email address')
  .max(254, 'Email address is too long');

// MongoDB ObjectId validation
const mongoIdSchema = z.string()
  .regex(objectIdRegex, 'Invalid ID format');

// Username validation
const usernameSchema = z.string()
  .min(3, 'Username must be at least 3 characters long')
  .max(30, 'Username must not exceed 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only contain letters, numbers, underscores, and hyphens');

/**
 * 📊 PAGINATION SCHEMA
 */
const paginationSchema = z.object({
  page: z.coerce.number().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().min(1, 'Limit must be at least 1').max(100, 'Limit cannot exceed 100').default(20),
  offset: z.coerce.number().min(0, 'Offset must be at least 0').optional()
});

/**
 * � AUTHENTICATION SCHEMAS
 */

// User registration schema
const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string()
    .min(2, 'Display name must be at least 2 characters long')
    .max(50, 'Display name must not exceed 50 characters')
    .optional(),
  role: z.enum(['reader', 'writer']).default('reader'),
  bio: z.string()
    .max(500, 'Bio must not exceed 500 characters')
    .optional(),
  location: z.string()
    .max(100, 'Location must not exceed 100 characters')
    .optional()
});

// Login schema
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required')
});

// Refresh token schema
const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required')
});

// Password reset request schema
const forgotPasswordSchema = z.object({
  email: emailSchema
});

// Password reset schema
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: passwordSchema
});

// Change password schema
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema
});

// Email verification schema
const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required')
});

// 2FA schemas
const enable2FASchema = z.object({
  password: z.string().min(1, 'Password is required for 2FA setup')
});

const disable2FASchema = z.object({
  password: z.string().min(1, 'Password is required to disable 2FA')
});

const verify2FASchema = z.object({
  token: z.string()
    .length(6, '2FA token must be 6 digits')
    .regex(/^\d{6}$/, '2FA token must contain only digits'),
  email: emailSchema
});

// Session management schemas
const revokeSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required')
});

/**
 * � USER SCHEMAS
 */

// User update schema
const userUpdateSchema = z.object({
  displayName: z.string()
    .min(2, 'Display name must be at least 2 characters')
    .max(50, 'Display name must be at most 50 characters')
    .optional(),
  
  bio: z.string()
    .max(500, 'Bio must be at most 500 characters')
    .optional(),
  
  location: z.string()
    .max(100, 'Location must be at most 100 characters')
    .optional(),
  
  website: z.string()
    .url('Must be a valid URL')
    .optional()
    .or(z.literal('')),
  
  avatar: z.string()
    .url('Avatar must be a valid URL')
    .optional()
    .or(z.literal('')),
  
  coverImage: z.string()
    .url('Cover image must be a valid URL')
    .optional()
    .or(z.literal('')),
  
  socialLinks: z.object({
    twitter: z.string().url().optional().or(z.literal('')),
    instagram: z.string().url().optional().or(z.literal('')),
    linkedin: z.string().url().optional().or(z.literal('')),
    github: z.string().url().optional().or(z.literal('')),
    website: z.string().url().optional().or(z.literal(''))
  }).optional(),
  
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'auto']).optional(),
    language: z.string().length(2).optional(),
    notifications: z.object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      newFollower: z.boolean().optional(),
      newComment: z.boolean().optional(),
      newLike: z.boolean().optional()
    }).optional(),
    contentPreferences: z.object({
      showMatureContent: z.boolean().optional(),
      autoplayVideos: z.boolean().optional()
    }).optional()
  }).optional(),
  
  privacy: z.object({
    profileVisibility: z.enum(['public', 'private']).optional(),
    showEmail: z.boolean().optional(),
    showLastActive: z.boolean().optional(),
    showFollowers: z.boolean().optional(),
    showFollowing: z.boolean().optional(),
    allowMessagesFrom: z.enum(['everyone', 'followers', 'none']).optional()
  }).optional()
});

// User search schema
const userSearchSchema = z.object({
  search: z.string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term must be at most 100 characters')
    .optional(),
  
  role: z.enum(['reader', 'writer', 'admin']).optional(),
  
  isVerified: z.string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .optional(),
  
  sortBy: z.enum(['createdAt', 'username', 'displayName', 'followerCount'])
    .default('createdAt'),
  
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

/**
 * � POST SCHEMAS
 */

// Post creation schema
const postCreateSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters'),
  
  content: z.string()
    .min(50, 'Content must be at least 50 characters')
    .max(100000, 'Content must be at most 100,000 characters'),
  
  excerpt: z.string()
    .max(500, 'Excerpt must be at most 500 characters')
    .optional(),
  
  category: z.string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category must be at most 50 characters')
    .optional(),
  
  tags: z.array(
    z.string()
      .min(2, 'Tag must be at least 2 characters')
      .max(30, 'Tag must be at most 30 characters')
      .regex(/^[a-zA-Z0-9\s-]+$/, 'Tags can only contain letters, numbers, spaces, and hyphens')
  )
    .max(10, 'Cannot have more than 10 tags')
    .optional()
    .default([]),
  
  status: z.enum(['draft', 'published', 'private'])
    .default('draft'),
  
  featured: z.boolean()
    .default(false),
  
  allowComments: z.boolean()
    .default(true),
  
  media: z.array(
    z.object({
      type: z.enum(['image', 'video', 'audio', 'document']),
      url: z.string().url('Media URL must be valid'),
      filename: z.string().optional(),
      size: z.number().positive().optional(),
      alt: z.string().max(200).optional()
    })
  )
    .max(10, 'Cannot have more than 10 media attachments')
    .optional()
    .default([]),
  
  seo: z.object({
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
    keywords: z.array(z.string()).max(20).optional(),
    canonicalUrl: z.string().url().optional()
  }).optional(),
  
  publishedAt: z.string()
    .datetime()
    .optional()
    .transform(val => val ? new Date(val) : undefined)
});

// Post update schema
const postUpdateSchema = z.object({
  title: z.string()
    .min(5, 'Title must be at least 5 characters')
    .max(200, 'Title must be at most 200 characters')
    .optional(),
  
  content: z.string()
    .min(50, 'Content must be at least 50 characters')
    .max(100000, 'Content must be at most 100,000 characters')
    .optional(),
  
  excerpt: z.string()
    .max(500, 'Excerpt must be at most 500 characters')
    .optional(),
  
  category: z.string()
    .min(2, 'Category must be at least 2 characters')
    .max(50, 'Category must be at most 50 characters')
    .optional(),
  
  tags: z.array(
    z.string()
      .min(2, 'Tag must be at least 2 characters')
      .max(30, 'Tag must be at most 30 characters')
      .regex(/^[a-zA-Z0-9\s-]+$/, 'Tags can only contain letters, numbers, spaces, and hyphens')
  )
    .max(10, 'Cannot have more than 10 tags')
    .optional(),
  
  status: z.enum(['draft', 'published', 'private'])
    .optional(),
  
  featured: z.boolean()
    .optional(),
  
  allowComments: z.boolean()
    .optional(),
  
  media: z.array(
    z.object({
      type: z.enum(['image', 'video', 'audio', 'document']),
      url: z.string().url('Media URL must be valid'),
      filename: z.string().optional(),
      size: z.number().positive().optional(),
      alt: z.string().max(200).optional()
    })
  )
    .max(10, 'Cannot have more than 10 media attachments')
    .optional(),
  
  seo: z.object({
    metaTitle: z.string().max(60).optional(),
    metaDescription: z.string().max(160).optional(),
    keywords: z.array(z.string()).max(20).optional(),
    canonicalUrl: z.string().url().optional()
  }).optional()
});

// Post query schema
const postQuerySchema = z.object({
  author: mongoIdSchema.optional(),
  
  category: z.string()
    .min(1, 'Category cannot be empty')
    .max(50, 'Category must be at most 50 characters')
    .optional(),
  
  tags: z.union([
    z.string(), // Single tag
    z.array(z.string()) // Multiple tags
  ])
    .optional()
    .transform(val => {
      if (typeof val === 'string') return [val];
      return val;
    }),
  
  status: z.union([
    z.enum(['draft', 'published', 'private', 'deleted']),
    z.array(z.enum(['draft', 'published', 'private', 'deleted']))
  ])
    .default('published'),
  
  search: z.string()
    .min(1, 'Search term must be at least 1 character')
    .max(100, 'Search term must be at most 100 characters')
    .optional(),
  
  featured: z.string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .optional(),
  
  sortBy: z.enum(['createdAt', 'updatedAt', 'publishedAt', 'title', 'likeCount', 'viewCount', 'commentCount'])
    .default('createdAt'),
  
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  
  dateFrom: z.string()
    .datetime()
    .optional()
    .transform(val => val ? new Date(val) : undefined),
  
  dateTo: z.string()
    .datetime()
    .optional()
    .transform(val => val ? new Date(val) : undefined)
});

/**
 * 💬 COMMENT SCHEMAS
 */

// Comment creation schema
const commentCreateSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment must be at most 2000 characters'),
  
  parentComment: mongoIdSchema.optional(), // For nested comments
  
  mentions: z.array(mongoIdSchema)
    .max(10, 'Cannot mention more than 10 users')
    .optional()
    .default([])
});

// Comment update schema
const commentUpdateSchema = z.object({
  content: z.string()
    .min(1, 'Comment cannot be empty')
    .max(2000, 'Comment must be at most 2000 characters')
});

// Comment query schema
const commentQuerySchema = z.object({
  post: mongoIdSchema.optional(),
  author: mongoIdSchema.optional(),
  parentComment: mongoIdSchema.optional(),
  
  sortBy: z.enum(['createdAt', 'updatedAt', 'likeCount'])
    .default('createdAt'),
  
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

/**
 * 🤝 INTERACTION SCHEMAS
 */

// Toggle like schema (for posts and comments)
const toggleLikeSchema = z.object({
  params: z.object({
    postId: mongoIdSchema.optional(),
    commentId: mongoIdSchema.optional()
  })
});

// Toggle bookmark schema
const toggleBookmarkSchema = z.object({
  params: z.object({
    postId: mongoIdSchema
  })
});

// Share post schema
const sharePostSchema = z.object({
  params: z.object({
    postId: mongoIdSchema
  }),
  body: z.object({
    platform: z.enum(['twitter', 'facebook', 'linkedin', 'email', 'copy-link']).optional(),
    customMessage: z.string().max(280, 'Custom message must be at most 280 characters').optional()
  })
});

// Get paginated likes schema
const getPaginatedLikesSchema = z.object({
  params: z.object({
    postId: mongoIdSchema.optional(),
    commentId: mongoIdSchema.optional()
  }),
  query: paginationSchema
});

// Get bookmarks schema
const getBookmarksSchema = z.object({
  query: paginationSchema.extend({
    category: z.string().optional(),
    tags: z.string().optional(), // comma-separated tags
    sortBy: z.enum(['createdAt', 'title', 'publishedAt']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
});

// Get like history schema
const getLikeHistorySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(['posts', 'comments', 'all']).default('all'),
    sortBy: z.enum(['createdAt', 'title']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
});

// Bulk operations schemas
const bulkLikeSchema = z.object({
  body: z.object({
    postIds: z.array(mongoIdSchema).max(50, 'Cannot like more than 50 posts at once').default([]),
    commentIds: z.array(mongoIdSchema).max(50, 'Cannot like more than 50 comments at once').default([])
  })
});

const bulkBookmarkSchema = z.object({
  body: z.object({
    postIds: z.array(mongoIdSchema).min(1, 'At least one post ID is required').max(50, 'Cannot bookmark more than 50 posts at once')
  })
});

const bulkUnlikeSchema = z.object({
  body: z.object({
    postIds: z.array(mongoIdSchema).max(50, 'Cannot unlike more than 50 posts at once').default([]),
    commentIds: z.array(mongoIdSchema).max(50, 'Cannot unlike more than 50 comments at once').default([])
  })
});

const bulkUnbookmarkSchema = z.object({
  body: z.object({
    postIds: z.array(mongoIdSchema).min(1, 'At least one post ID is required').max(50, 'Cannot unbookmark more than 50 posts at once')
  })
});

// Analytics schemas
const getAnalyticsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
    contentType: z.enum(['posts', 'comments', 'all']).default('all')
  })
});

const getTrendingSchema = z.object({
  query: paginationSchema.extend({
    timeframe: z.enum(['1h', '24h', '7d', '30d']).default('24h'),
    contentType: z.enum(['posts', 'comments']).default('posts'),
    category: z.string().optional()
  })
});

/**
 * 📊 ADMIN SCHEMAS
 */

// Admin analytics schema
const adminAnalyticsSchema = z.object({
  query: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    groupBy: z.enum(['day', 'week', 'month']).default('day'),
    metrics: z.string().optional() // comma-separated metrics
  })
});

// User management schemas
const adminUserUpdateSchema = z.object({
  body: z.object({
    role: z.enum(['reader', 'writer', 'admin']).optional(),
    isActive: z.boolean().optional(),
    isVerified: z.boolean().optional(),
    permissions: z.array(z.string()).optional()
  })
});

// Content moderation schemas
const moderateContentSchema = z.object({
  body: z.object({
    action: z.enum(['approve', 'reject', 'flag', 'remove']),
    reason: z.string().max(500, 'Reason must be at most 500 characters').optional(),
    notify: z.boolean().default(true)
  })
});

/**
 * 🔔 NOTIFICATION SCHEMAS
 */

// Create notification schema
const createNotificationSchema = z.object({
  body: z.object({
    type: z.enum(['like', 'comment', 'follow', 'mention', 'system']),
    message: z.string().min(1, 'Message is required').max(500, 'Message must be at most 500 characters'),
    recipientId: mongoIdSchema,
    relatedId: mongoIdSchema.optional(), // Related post, comment, etc.
    metadata: z.record(z.any()).optional()
  })
});

// Update notification schema
const updateNotificationSchema = z.object({
  body: z.object({
    isRead: z.boolean().optional(),
    isArchived: z.boolean().optional()
  })
});

// Notification query schema
const notificationQuerySchema = z.object({
  query: paginationSchema.extend({
    type: z.enum(['like', 'comment', 'follow', 'mention', 'system']).optional(),
    isRead: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
    isArchived: z.string().transform(val => val === 'true').pipe(z.boolean()).optional(),
    sortBy: z.enum(['createdAt', 'type']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc')
  })
});

// Bulk notification operations
const bulkNotificationUpdateSchema = z.object({
  body: z.object({
    notificationIds: z.array(mongoIdSchema).min(1, 'At least one notification ID is required').max(100, 'Cannot update more than 100 notifications at once'),
    isRead: z.boolean().optional(),
    isArchived: z.boolean().optional()
  })
});

// Export all schemas for use across the application
module.exports = {
  // Authentication schemas
  authSchemas: {
    register: { body: registerSchema },
    login: { body: loginSchema },
    refreshToken: { body: refreshTokenSchema },
    forgotPassword: { body: forgotPasswordSchema },
    resetPassword: { body: resetPasswordSchema },
    changePassword: { body: changePasswordSchema },
    verifyEmail: { body: verifyEmailSchema },
    enable2FA: { body: enable2FASchema },
    disable2FA: { body: disable2FASchema },
    verify2FA: { body: verify2FASchema },
    revokeSession: { params: revokeSessionSchema }
  },
  
  // User schemas
  userSchemas: {
    update: { body: userUpdateSchema },
    search: { query: userSearchSchema },
    getById: { params: z.object({ userId: mongoIdSchema }) },
    follow: { params: z.object({ userId: mongoIdSchema }) }
  },
  
  // Post schemas
  postSchemas: {
    create: { body: postCreateSchema },
    update: { body: postUpdateSchema },
    getById: { params: z.object({ postId: mongoIdSchema }) },
    search: { query: postQuerySchema },
    getBySlug: { params: z.object({ slug: z.string() }) }
  },
  
  // Comment schemas
  commentSchemas: {
    create: { body: commentCreateSchema, params: z.object({ postId: mongoIdSchema }) },
    update: { body: commentUpdateSchema, params: z.object({ commentId: mongoIdSchema }) },
    getById: { params: z.object({ commentId: mongoIdSchema }) },
    search: { query: commentQuerySchema }
  },
  
  // Interaction schemas
  interactionSchemas: {
    toggleLike: toggleLikeSchema,
    toggleBookmark: toggleBookmarkSchema,
    sharePost: sharePostSchema,
    getPaginatedLikes: getPaginatedLikesSchema,
    getBookmarks: getBookmarksSchema,
    getLikeHistory: getLikeHistorySchema,
    bulkLike: bulkLikeSchema,
    bulkBookmark: bulkBookmarkSchema,
    bulkUnlike: bulkUnlikeSchema,
    bulkUnbookmark: bulkUnbookmarkSchema,
    getAnalytics: getAnalyticsSchema,
    getTrending: getTrendingSchema
  },
  
  // Admin schemas
  adminSchemas: {
    analytics: adminAnalyticsSchema,
    userUpdate: adminUserUpdateSchema,
    moderateContent: moderateContentSchema,
    getUsers: { query: paginationSchema.extend({ role: z.enum(['reader', 'writer', 'admin']).optional() }) },
    getPosts: { query: paginationSchema.extend({ status: z.enum(['draft', 'published', 'archived']).optional() }) }
  },
  
  // Notification schemas
  notificationSchemas: {
    create: createNotificationSchema,
    update: updateNotificationSchema,
    query: notificationQuerySchema,
    bulkUpdate: bulkNotificationUpdateSchema,
    getById: { params: z.object({ notificationId: mongoIdSchema }) }
  },
  
  // Common schemas (backward compatibility)
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  resetPasswordSchema,
  userUpdateSchema,
  userSearchSchema,
  postCreateSchema,
  postUpdateSchema,
  postQuerySchema,
  commentCreateSchema,
  commentUpdateSchema,
  commentQuerySchema,
  
  // Validation utilities
  mongoIdSchema,
  emailSchema,
  usernameSchema,
  passwordSchema,
  
  // Common patterns
  paginationSchema
};
