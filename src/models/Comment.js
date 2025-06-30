/**
 * 💬 COMMENT MODEL
 * 
 * This model implements a nested comment system for posts with features like
 * threading, likes, moderation, and social interactions.
 * 
 * Key Features:
 * - Nested/threaded comments (replies to comments)
 * - Like system for comments
 * - Content moderation
 * - Soft delete functionality
 * - Performance optimization with proper indexing
 * - Social interaction tracking
 * 
 * Learning Points:
 * - Nested documents vs. separate collections trade-offs
 * - Tree structures in MongoDB
 * - Comment threading depth management
 * - Performance considerations for nested queries
 */

import mongoose from 'mongoose';
import { appLogger } from '../utils/logger.js';

/**
 * 📋 Comment Schema Definition
 */
const commentSchema = new mongoose.Schema({
  // Content
  content: {
    type: String,
    required: [true, 'Comment content is required'],
    trim: true,
    minlength: [1, 'Comment cannot be empty'],
    maxlength: [1000, 'Comment must not exceed 1000 characters'],
  },
  
  // Author Information
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Comment author is required'],
    index: true,
  },
  
  // Post Reference
  post: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Post',
    required: [true, 'Post reference is required'],
    index: true,
  },
  
  // Threading System
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
    index: true,
  },
  
  // Thread depth (for performance optimization)
  depth: {
    type: Number,
    default: 0,
    min: 0,
    max: 5, // Limit nesting depth to prevent infinite threading
  },
  
  // Comment path for efficient tree queries
  path: {
    type: String,
    index: true,
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
  
  // Moderation
  isApproved: {
    type: Boolean,
    default: true, // Auto-approve by default, can be changed based on settings
  },
  
  moderationStatus: {
    type: String,
    enum: ['approved', 'pending', 'flagged', 'rejected'],
    default: 'approved',
    index: true,
  },
  
  flaggedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: {
      type: String,
      enum: ['spam', 'inappropriate', 'harassment', 'off-topic', 'other'],
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
  
  // Statistics
  stats: {
    likesCount: {
      type: Number,
      default: 0,
    },
    repliesCount: {
      type: Number,
      default: 0,
    },
  },
  
  // Mentions (users mentioned in the comment)
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  
  // Edit History
  editHistory: [{
    content: String,
    editedAt: {
      type: Date,
      default: Date.now,
    }
  }],
  
  isEdited: {
    type: Boolean,
    default: false,
  },
  
  lastEditedAt: {
    type: Date,
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

// Check if comment is liked by a specific user
commentSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(like => like.user.toString() === userId.toString());
};

// Check if comment is a reply
commentSchema.virtual('isReply').get(function() {
  return this.parentComment !== null;
});

// Check if comment is a root comment
commentSchema.virtual('isRoot').get(function() {
  return this.parentComment === null;
});

/**
 * 🔗 Indexes for Performance
 */
commentSchema.index({ post: 1, createdAt: -1 });
commentSchema.index({ author: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1, createdAt: 1 });
commentSchema.index({ path: 1 });
commentSchema.index({ post: 1, parentComment: 1, createdAt: 1 });
commentSchema.index({ moderationStatus: 1 });
commentSchema.index({ deletedAt: 1 });

// Compound index for threaded comment queries
commentSchema.index({ 
  post: 1, 
  parentComment: 1, 
  moderationStatus: 1, 
  deletedAt: 1,
  createdAt: -1 
});

/**
 * 🔒 Pre-save Middleware
 */
commentSchema.pre('save', async function(next) {
  try {
    // Update stats
    this.stats.likesCount = this.likes.length;
    
    // Handle threading and path generation
    if (this.isNew) {
      if (this.parentComment) {
        // Get parent comment to determine depth and path
        const parentComment = await this.constructor.findById(this.parentComment);
        if (!parentComment) {
          throw new Error('Parent comment not found');
        }
        
        // Check depth limit
        if (parentComment.depth >= 5) {
          throw new Error('Maximum comment nesting depth exceeded');
        }
        
        this.depth = parentComment.depth + 1;
        this.path = parentComment.path ? `${parentComment.path}/${this._id}` : `${this._id}`;
        
        // Update parent's reply count
        await this.constructor.findByIdAndUpdate(this.parentComment, {
          $inc: { 'stats.repliesCount': 1 }
        });
        
      } else {
        // Root comment
        this.depth = 0;
        this.path = `${this._id}`;
      }
    }
    
    // Handle edit tracking
    if (this.isModified('content') && !this.isNew) {
      // Save edit history
      this.editHistory.push({
        content: this.content,
      });
      
      this.isEdited = true;
      this.lastEditedAt = new Date();
      
      // Limit edit history to last 10 edits
      if (this.editHistory.length > 10) {
        this.editHistory = this.editHistory.slice(-10);
      }
    }
    
    // Extract mentions from content
    if (this.isModified('content')) {
      const mentionRegex = /@(\w+)/g;
      const mentions = [];
      let match;
      
      while ((match = mentionRegex.exec(this.content)) !== null) {
        mentions.push(match[1]);
      }
      
      if (mentions.length > 0) {
        // Find users by username/penName
        const mentionedUsers = await mongoose.model('User').find({
          $or: [
            { fullName: { $in: mentions } },
            { penName: { $in: mentions } }
          ]
        }).select('_id');
        
        this.mentions = mentionedUsers.map(user => user._id);
      }
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * 🔒 Post-save Middleware
 */
commentSchema.post('save', async function(doc) {
  try {
    // Update post's comment count
    if (doc.isNew) {
      await mongoose.model('Post').findByIdAndUpdate(doc.post, {
        $inc: { 'stats.commentsCount': 1 }
      });
      
      // Update author's comment stats
      const post = await mongoose.model('Post').findById(doc.post);
      if (post) {
        await mongoose.model('User').findByIdAndUpdate(post.author, {
          $inc: { 'stats.commentsReceived': 1 }
        });
      }
      
      // Log business event
      appLogger.logBusiness('comment_created', {
        commentId: doc._id,
        postId: doc.post,
        authorId: doc.author,
        isReply: !!doc.parentComment,
        depth: doc.depth,
      });
    }
  } catch (error) {
    appLogger.error('Error in comment post-save middleware', { error: error.message });
  }
});

/**
 * 🔐 Instance Methods
 */

// Like a comment
commentSchema.methods.likeComment = async function(userId) {
  // Check if already liked
  const existingLike = this.likes.find(like => like.user.toString() === userId.toString());
  if (existingLike) {
    throw new Error('Comment already liked');
  }
  
  // Add like
  this.likes.push({ user: userId });
  await this.save();
  
  appLogger.logBusiness('comment_liked', {
    commentId: this._id,
    userId,
    postId: this.post,
  });
  
  return this;
};

// Unlike a comment
commentSchema.methods.unlikeComment = async function(userId) {
  // Find and remove like
  const likeIndex = this.likes.findIndex(like => like.user.toString() === userId.toString());
  if (likeIndex === -1) {
    throw new Error('Comment not liked');
  }
  
  this.likes.splice(likeIndex, 1);
  await this.save();
  
  appLogger.logBusiness('comment_unliked', {
    commentId: this._id,
    userId,
    postId: this.post,
  });
  
  return this;
};

// Flag comment for moderation
commentSchema.methods.flagComment = async function(userId, reason, description = '') {
  // Check if already flagged by this user
  const existingFlag = this.flaggedBy.find(flag => flag.user.toString() === userId.toString());
  if (existingFlag) {
    throw new Error('Comment already flagged by this user');
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
  
  appLogger.logSecurity('comment_flagged', 'medium', {
    commentId: this._id,
    userId,
    reason,
    flagCount: this.flaggedBy.length,
  });
  
  return this;
};

// Moderate comment (admin action)
commentSchema.methods.moderateComment = async function(adminId, status, notes = '') {
  this.moderationStatus = status;
  this.moderatedBy = adminId;
  this.moderatedAt = new Date();
  this.moderationNotes = notes;
  
  await this.save();
  
  appLogger.logSecurity('comment_moderated', 'medium', {
    commentId: this._id,
    adminId,
    status,
    notes,
  });
  
  return this;
};

// Get comment replies
commentSchema.methods.getReplies = function(options = {}) {
  const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 1 } = options;
  const skip = (page - 1) * limit;
  
  return this.constructor.find({
    parentComment: this._id,
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  })
  .populate('author', 'fullName penName avatar')
  .sort({ [sortBy]: sortOrder })
  .skip(skip)
  .limit(limit);
};

// Soft delete comment
commentSchema.methods.softDelete = async function(deletedBy) {
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  await this.save();
  
  // Update post's comment count
  await mongoose.model('Post').findByIdAndUpdate(this.post, {
    $inc: { 'stats.commentsCount': -1 }
  });
  
  // Update parent's reply count if this is a reply
  if (this.parentComment) {
    await this.constructor.findByIdAndUpdate(this.parentComment, {
      $inc: { 'stats.repliesCount': -1 }
    });
  }
  
  appLogger.logBusiness('comment_deleted', {
    commentId: this._id,
    deletedBy,
    postId: this.post,
  });
  
  return this;
};

/**
 * 🔍 Static Methods
 */

// Find approved comments
commentSchema.statics.findApproved = function(filter = {}) {
  return this.find({
    ...filter,
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  });
};

// Get comments for a post with threading
commentSchema.statics.getPostComments = function(postId, options = {}) {
  const {
    page = 1,
    limit = 20,
    sortBy = 'createdAt',
    sortOrder = 1,
    includeReplies = true,
    maxDepth = 3
  } = options;
  
  const skip = (page - 1) * limit;
  
  const filter = {
    post: postId,
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  };
  
  if (!includeReplies) {
    filter.parentComment = null;
  } else {
    filter.depth = { $lte: maxDepth };
  }
  
  return this.find(filter)
    .populate('author', 'fullName penName avatar role')
    .populate('parentComment', 'author content')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit);
};

// Get threaded comments (hierarchical structure)
commentSchema.statics.getThreadedComments = async function(postId, options = {}) {
  const { maxDepth = 3, sortBy = 'createdAt', sortOrder = 1 } = options;
  
  // Get all comments for the post
  const comments = await this.find({
    post: postId,
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] },
    depth: { $lte: maxDepth }
  })
  .populate('author', 'fullName penName avatar role')
  .sort({ [sortBy]: sortOrder })
  .lean();
  
  // Build threaded structure
  const commentMap = new Map();
  const rootComments = [];
  
  // First pass: create comment map
  comments.forEach(comment => {
    comment.replies = [];
    commentMap.set(comment._id.toString(), comment);
  });
  
  // Second pass: build tree structure
  comments.forEach(comment => {
    if (comment.parentComment) {
      const parent = commentMap.get(comment.parentComment.toString());
      if (parent) {
        parent.replies.push(comment);
      }
    } else {
      rootComments.push(comment);
    }
  });
  
  return rootComments;
};

// Get user's comments
commentSchema.statics.getUserComments = function(userId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = -1,
    includeDeleted = false
  } = options;
  
  const skip = (page - 1) * limit;
  
  const filter = {
    author: userId,
    moderationStatus: { $in: ['approved', 'pending'] }
  };
  
  if (!includeDeleted) {
    filter.deletedAt = null;
  }
  
  return this.find(filter)
    .populate('post', 'title slug author')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit);
};

// Get comment statistics
commentSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalComments: { $sum: 1 },
        approvedComments: { $sum: { $cond: [{ $eq: ['$moderationStatus', 'approved'] }, 1, 0] } },
        flaggedComments: { $sum: { $cond: [{ $eq: ['$moderationStatus', 'flagged'] }, 1, 0] } },
        deletedComments: { $sum: { $cond: [{ $ne: ['$deletedAt', null] }, 1, 0] } },
        totalLikes: { $sum: '$stats.likesCount' },
        avgDepth: { $avg: '$depth' },
      }
    }
  ]);
  
  return stats[0] || {};
};

// Search comments
commentSchema.statics.searchComments = function(query, options = {}) {
  const {
    postId,
    authorId,
    sortBy = 'createdAt',
    sortOrder = -1,
    page = 1,
    limit = 10,
  } = options;
  
  const filter = {
    content: { $regex: query, $options: 'i' },
    deletedAt: null,
    moderationStatus: { $in: ['approved', 'pending'] }
  };
  
  if (postId) filter.post = postId;
  if (authorId) filter.author = authorId;
  
  const skip = (page - 1) * limit;
  
  return this.find(filter)
    .populate('author', 'fullName penName avatar')
    .populate('post', 'title slug')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(limit);
};

// Create the Comment model
const Comment = mongoose.model('Comment', commentSchema);

export default Comment;
