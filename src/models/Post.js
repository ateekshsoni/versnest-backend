/**
 * 📝 POST MODEL
 * 
 * This model represents stories/posts created by writers in the VerseNest platform.
 * It includes features for content management, social interactions, and moderation.
 * 
 * Key Features:
 * - Rich content with metadata
 * - Social interactions (likes, bookmarks, shares)
 * - Comment system integration
 * - Content moderation features
 * - SEO optimization
 * - Performance tracking
 * - Draft/published states
 * 
 * Learning Points:
 * - Content models need comprehensive metadata
 * - Social features require careful data structure design
 * - Search optimization requires proper indexing
 * - Performance metrics help writers improve
 */

import mongoose from 'mongoose';
import { appLogger } from '../utils/logger.js';

/**
 * 📋 Post Schema Definition
 */
const postSchema = new mongoose.Schema({
  // Basic Content Information
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    minlength: [3, 'Title must be at least 3 characters long'],
    maxlength: [200, 'Title must not exceed 200 characters'],
    index: true, // For search functionality
  },
  
  content: {
    type: String,
    required: [true, 'Post content is required'],
    minlength: [10, 'Content must be at least 10 characters long'],
    maxlength: [50000, 'Content must not exceed 50,000 characters'],
  },
  
  excerpt: {
    type: String,
    maxlength: [500, 'Excerpt must not exceed 500 characters'],
    trim: true,
  },
  
  // Author Information
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post author is required'],
    index: true, // For author-based queries
  },
  
  // Content Classification
  genre: {
    type: String,
    enum: [
      'Lyrical', 'Narrative', 'Sonnet', 'Haiku', 
      'Fantasy', 'Free Verse', 'Drama', 'Epic', 
      'Comedy', 'Romance', 'Mystery', 'Horror',
      'Science Fiction', 'Historical', 'Other'
    ],
    required: [true, 'Post genre is required'],
    index: true, // For genre-based filtering
  },
  
  tags: [{
    type: String,
    trim: true,
    minlength: [1, 'Tag cannot be empty'],
    maxlength: [30, 'Tag must not exceed 30 characters'],
  }],
  
  // Publication Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'deleted'],
    default: 'draft',
    index: true,
  },
  
  isPublished: {
    type: Boolean,
    default: false,
    index: true,
  },
  
  publishedAt: {
    type: Date,
    index: true,
  },
  
  // Content Settings
  allowComments: {
    type: Boolean,
    default: true,
  },
  
  isFeatured: {
    type: Boolean,
    default: false,
    index: true, // For featured posts queries
  },
  
  featuredAt: {
    type: Date,
  },
  
  // Media
  featuredImage: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Featured image must be a valid URL'
    }
  },
  
  // Social Interactions
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    likedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  bookmarks: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    bookmarkedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  shares: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    platform: {
      type: String,
      enum: ['twitter', 'facebook', 'linkedin', 'email', 'copy', 'other'],
      default: 'other',
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  // Performance Metrics
  metrics: {
    views: {
      type: Number,
      default: 0,
    },
    uniqueViews: {
      type: Number,
      default: 0,
    },
    readTime: {
      type: Number, // in minutes
      default: 0,
    },
    engagementRate: {
      type: Number,
      default: 0,
    },
    lastViewedAt: {
      type: Date,
    }
  },
  
  // SEO Optimization
  seo: {
    metaTitle: {
      type: String,
      maxlength: [60, 'Meta title must not exceed 60 characters'],
    },
    metaDescription: {
      type: String,
      maxlength: [160, 'Meta description must not exceed 160 characters'],
    },
    slug: {
      type: String,
      unique: true,
      sparse: true, // Allow null values to be non-unique
      index: true,
    },
    keywords: [{
      type: String,
      trim: true,
    }],
  },
  
  // Content Moderation
  moderationStatus: {
    type: String,
    enum: ['pending', 'approved', 'flagged', 'rejected'],
    default: 'pending',
    index: true,
  },
  
  flaggedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'copyright', 'harassment', 'other'],
    },
    description: String,
    flaggedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  moderatedAt: {
    type: Date,
  },
  
  moderationNotes: {
    type: String,
    maxlength: [500, 'Moderation notes must not exceed 500 characters'],
  },
  
  // Statistics (computed fields)
  stats: {
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    bookmarksCount: {
      type: Number,
      default: 0,
    },
    sharesCount: {
      type: Number,
      default: 0,
    },
  },
  
  // Soft Delete
  deletedAt: {
    type: Date,
    default: null,
  },
  
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
}, {
  timestamps: true, // createdAt, updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * 📊 Virtual Properties
 */

// Calculate reading time based on content length
postSchema.virtual('readingTime').get(function() {
  const wordsPerMinute = 200; // Average reading speed
  const wordCount = this.content.split(/\s+/).length;
  return Math.ceil(wordCount / wordsPerMinute);
});

// Check if post is liked by a specific user
postSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(like => like.user.toString() === userId.toString());
};

// Check if post is bookmarked by a specific user
postSchema.methods.isBookmarkedBy = function(userId) {
  return this.bookmarks.some(bookmark => bookmark.user.toString() === userId.toString());
};

// Get engagement score
postSchema.virtual('engagementScore').get(function() {
  const totalEngagements = this.stats.likesCount + this.stats.commentsCount + this.stats.sharesCount;
  return this.metrics.views > 0 ? (totalEngagements / this.metrics.views) * 100 : 0;
});

/**
 * 🔗 Indexes for Performance
 */
postSchema.index({ author: 1, status: 1 });
postSchema.index({ genre: 1, isPublished: 1 });
postSchema.index({ tags: 1 });
postSchema.index({ publishedAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ 'metrics.views': -1 });
postSchema.index({ 'stats.likesCount': -1 });
postSchema.index({ isFeatured: 1, featuredAt: -1 });
postSchema.index({ moderationStatus: 1 });

// Compound index for popular posts
postSchema.index({ isPublished: 1, 'stats.likesCount': -1, publishedAt: -1 });

// Text index for search functionality
postSchema.index({
  title: 'text',
  content: 'text',
  excerpt: 'text',
  tags: 'text'
}, {
  weights: {
    title: 10,
    excerpt: 5,
    tags: 3,
    content: 1
  }
});

/**
 * 🔒 Pre-save Middleware
 */
postSchema.pre('save', async function(next) {
  try {
    // Generate slug from title if not provided
    if (this.isModified('title') && !this.seo.slug) {
      this.seo.slug = this.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      
      // Ensure slug uniqueness
      let counter = 1;
      let baseSlug = this.seo.slug;
      while (await this.constructor.findOne({ 'seo.slug': this.seo.slug, _id: { $ne: this._id } })) {
        this.seo.slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }
    
    // Auto-generate excerpt if not provided
    if (this.isModified('content') && !this.excerpt) {
      this.excerpt = this.content.substring(0, 150) + '...';
    }
    
    // Set published date when publishing
    if (this.isModified('isPublished') && this.isPublished && !this.publishedAt) {
      this.publishedAt = new Date();
      this.status = 'published';
    }
    
    // Update reading time
    if (this.isModified('content')) {
      this.metrics.readTime = this.readingTime;
    }
    
    // Update stats counts
    this.stats.likesCount = this.likes.length;
    this.stats.bookmarksCount = this.bookmarks.length;
    this.stats.sharesCount = this.shares.length;
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * 🔐 Instance Methods
 */

// Like a post
postSchema.methods.likePost = async function(userId) {
  // Check if already liked
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  if (existingLike) {
    throw new Error('Post already liked');
  }
  
  // Add like
  this.likes.push({ user: userId });
  await this.save();
  
  // Update author's stats
  await mongoose.model('User').findByIdAndUpdate(this.author, {
    $inc: { 'stats.likesReceived': 1 }
  });
  
  appLogger.logBusiness('post_liked', {
    postId: this._id,
    userId,
    authorId: this.author,
  });
  
  return this;
};

// Unlike a post
postSchema.methods.unlikePost = async function(userId) {
  // Find and remove like
  const likeIndex = this.likes.findIndex(like => like.user.toString() === userId.toString());
  if (likeIndex === -1) {
    throw new Error('Post not liked');
  }
  
  this.likes.splice(likeIndex, 1);
  await this.save();
  
  // Update author's stats
  await mongoose.model('User').findByIdAndUpdate(this.author, {
    $inc: { 'stats.likesReceived': -1 }
  });
  
  appLogger.logBusiness('post_unliked', {
    postId: this._id,
    userId,
    authorId: this.author,
  });
  
  return this;
};

// Bookmark a post
postSchema.methods.bookmarkPost = async function(userId) {
  // Check if already bookmarked
  const existingBookmark = this.bookmarks.find(bookmark => bookmark.user.toString() === userId.toString());
  if (existingBookmark) {
    throw new Error('Post already bookmarked');
  }
  
  // Add bookmark
  this.bookmarks.push({ user: userId });
  await this.save();
  
  appLogger.logBusiness('post_bookmarked', {
    postId: this._id,
    userId,
  });
  
  return this;
};

// Remove bookmark
postSchema.methods.unbookmarkPost = async function(userId) {
  // Find and remove bookmark
  const bookmarkIndex = this.bookmarks.findIndex(bookmark => bookmark.user.toString() === userId.toString());
  if (bookmarkIndex === -1) {
    throw new Error('Post not bookmarked');
  }
  
  this.bookmarks.splice(bookmarkIndex, 1);
  await this.save();
  
  appLogger.logBusiness('post_unbookmarked', {
    postId: this._id,
    userId,
  });
  
  return this;
};

// Share a post
postSchema.methods.sharePost = async function(userId, platform = 'other') {
  // Add share record
  this.shares.push({ user: userId, platform });
  await this.save();
  
  appLogger.logBusiness('post_shared', {
    postId: this._id,
    userId,
    platform,
  });
  
  return this;
};

// Track post view
postSchema.methods.trackView = async function(userId = null) {
  // Increment view count
  this.metrics.views += 1;
  this.metrics.lastViewedAt = new Date();
  
  // Track unique views if user is provided
  if (userId) {
    // You might want to implement a separate ViewLog model for this
    // For now, we'll just increment unique views
    this.metrics.uniqueViews += 1;
  }
  
  await this.save();
  
  appLogger.logBusiness('post_viewed', {
    postId: this._id,
    userId,
    totalViews: this.metrics.views,
  });
  
  return this;
};

// Flag post for moderation
postSchema.methods.flagPost = async function(userId, reason, description = '') {
  // Check if already flagged by this user
  const existingFlag = this.flaggedBy.find(flag => flag.user.toString() === userId.toString());
  if (existingFlag) {
    throw new Error('Post already flagged by this user');
  }
  
  // Add flag
  this.flaggedBy.push({
    user: userId,
    reason,
    description,
  });
  
  // Update moderation status if this is the first flag
  if (this.flaggedBy.length === 1) {
    this.moderationStatus = 'flagged';
  }
  
  await this.save();
  
  appLogger.logSecurity('post_flagged', 'medium', {
    postId: this._id,
    userId,
    reason,
    flagCount: this.flaggedBy.length,
  });
  
  return this;
};

// Moderate post (admin action)
postSchema.methods.moderatePost = async function(adminId, status, notes = '') {
  this.moderationStatus = status;
  this.moderatedBy = adminId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  
  await this.save();
  
  appLogger.logSecurity('post_moderated', 'medium', {
    postId: this._id,
    adminId,
    status,
    notes,
  });
  
  return this;
};

/**
 * 🔍 Static Methods
 */

// Find published posts
postSchema.statics.findPublished = function(filter = {}) {
  return this.find({ 
    ...filter, 
    isPublished: true,
    status: 'published',
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  });
};

// Search posts
postSchema.statics.searchPosts = function(query, options = {}) {
  const {
    genre,
    tags,
    authorId,
    sortBy = 'publishedAt',
    sortOrder = -1,
    page = 1,
    limit = 10,
  } = options;
  
  const filter = {
    isPublished: true,
    status: 'published',
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  };
  
  if (query) {
    filter.$text = { $search: query };
  }
  
  if (genre) filter.genre = genre;
  if (tags && tags.length > 0) filter.tags = { $in: tags };
  if (authorId) filter.author = authorId;
  
  const sort = { [sortBy]: sortOrder };
  const skip = (page - 1) * limit;
  
  return this.find(filter)
    .populate('author', 'fullName penName avatar')
    .sort(sort)
    .skip(skip)
    .limit(limit);
};

// Get trending posts
postSchema.statics.getTrendingPosts = function(days = 7, limit = 10) {
  const dateThreshold = new Date();
  dateThreshold.setDate(dateThreshold.getDate() - days);
  
  return this.find({
    isPublished: true,
    status: 'published',
    publishedAt: { $gte: dateThreshold },
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  })
  .populate('author', 'fullName penName avatar')
  .sort({
    'stats.likesCount': -1,
    'metrics.views': -1,
    'stats.commentsCount': -1,
  })
  .limit(limit);
};

// Get posts by author
postSchema.statics.getPostsByAuthor = function(authorId, options = {}) {
  const {
    includeUnpublished = false,
    page = 1,
    limit = 10,
  } = options;
  
  const filter = {
    author: authorId,
    deletedAt: null,
  };
  
  if (!includeUnpublished) {
    filter.isPublished = true;
    filter.status = 'published';
  }
  
  const skip = (page - 1) * limit;
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Get post statistics
postSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalPosts: { $sum: 1 },
        publishedPosts: { $sum: { $cond: ['$isPublished', 1, 0] } },
        draftPosts: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
        flaggedPosts: { $sum: { $cond: [{ $eq: ['$moderationStatus', 'flagged'] }, 1, 0] } },
        totalViews: { $sum: '$metrics.views' },
        totalLikes: { $sum: '$stats.likesCount' },
        totalComments: { $sum: '$stats.commentsCount' },
      }
    }
  ]);
  
  return stats[0] || {};
};

// Create the Post model
const Post = mongoose.model('Post', postSchema);

export default Post;
