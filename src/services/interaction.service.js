/**
 * @fileoverview Interaction Service - Handles user interactions like likes, bookmarks, shares
 * 
 * This service manages all user interactions with content (posts, comments) and other users.
 * It provides a centralized way to handle likes, unlikes, bookmarks, shares, and tracks
 * interaction analytics.
 * 
 * Educational Notes:
 * - Interactions are fundamental to social platform engagement
 * - Consider implementing interaction rate limiting to prevent spam
 * - Track interaction analytics for content creators and platform insights
 * - Use atomic operations to prevent race conditions in concurrent interactions
 * - Consider caching popular interaction counts for performance
 */

const mongoose = require('mongoose');
const User = require('../models/user.model');
const Post = require('../models/post.model');
const Comment = require('../models/comment.model');
const notificationService = require('./notification.service');
const logger = require('../utils/logger');
const { AppError } = require('../middlewares/error.middleware');

/**
 * Interaction Types - Defines all possible interaction types
 */
const INTERACTION_TYPES = {
  LIKE: 'like',
  BOOKMARK: 'bookmark',
  SHARE: 'share',
  VIEW: 'view',
  REPORT: 'report'
};

/**
 * Target Types - Defines what can be interacted with
 */
const TARGET_TYPES = {
  POST: 'post',
  COMMENT: 'comment',
  USER: 'user'
};

class InteractionService {
  /**
   * Like or unlike a post
   * 
   * @param {string} userId - User performing the action
   * @param {string} postId - Post being liked/unliked
   * @returns {Promise<Object>} Result with action taken and updated counts
   */
  async togglePostLike(userId, postId) {
    try {
      // Validate inputs
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid user ID or post ID', 400);
      }

      const [user, post] = await Promise.all([
        User.findById(userId),
        Post.findById(postId).populate('author', 'username fullName')
      ]);

      if (!user) {
        throw new AppError('User not found', 404);
      }
      if (!post) {
        throw new AppError('Post not found', 404);
      }

      const isLiked = post.likes.includes(userId);
      let action, newLikeCount;

      if (isLiked) {
        // Unlike the post
        await Promise.all([
          Post.findByIdAndUpdate(postId, {
            $pull: { likes: userId },
            $inc: { likesCount: -1 }
          }),
          User.findByIdAndUpdate(userId, {
            $pull: { likedPosts: postId }
          })
        ]);
        
        action = 'unliked';
        newLikeCount = Math.max(0, post.likesCount - 1);
        
        logger.info(`User ${userId} unliked post ${postId}`);
      } else {
        // Like the post
        await Promise.all([
          Post.findByIdAndUpdate(postId, {
            $addToSet: { likes: userId }, // $addToSet prevents duplicates
            $inc: { likesCount: 1 }
          }),
          User.findByIdAndUpdate(userId, {
            $addToSet: { likedPosts: postId }
          })
        ]);
        
        action = 'liked';
        newLikeCount = post.likesCount + 1;
        
        // Create notification for post author (if not self-like)
        if (post.author._id.toString() !== userId) {
          await notificationService.createPostLikeNotification(
            userId,
            post.author._id,
            postId,
            post.title
          );
        }
        
        logger.info(`User ${userId} liked post ${postId}`);
      }

      return {
        action,
        isLiked: !isLiked,
        likesCount: newLikeCount,
        postId,
        userId
      };
    } catch (error) {
      logger.error('Error toggling post like:', error);
      throw error;
    }
  }

  /**
   * Like or unlike a comment
   * 
   * @param {string} userId - User performing the action
   * @param {string} commentId - Comment being liked/unliked
   * @returns {Promise<Object>} Result with action taken and updated counts
   */
  async toggleCommentLike(userId, commentId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(commentId)) {
        throw new AppError('Invalid user ID or comment ID', 400);
      }

      const [user, comment] = await Promise.all([
        User.findById(userId),
        Comment.findById(commentId).populate('author', 'username fullName')
      ]);

      if (!user) {
        throw new AppError('User not found', 404);
      }
      if (!comment) {
        throw new AppError('Comment not found', 404);
      }

      const isLiked = comment.likes.includes(userId);
      let action, newLikeCount;

      if (isLiked) {
        // Unlike the comment
        await Comment.findByIdAndUpdate(commentId, {
          $pull: { likes: userId },
          $inc: { likesCount: -1 }
        });
        
        action = 'unliked';
        newLikeCount = Math.max(0, comment.likesCount - 1);
        
        logger.info(`User ${userId} unliked comment ${commentId}`);
      } else {
        // Like the comment
        await Comment.findByIdAndUpdate(commentId, {
          $addToSet: { likes: userId },
          $inc: { likesCount: 1 }
        });
        
        action = 'liked';
        newLikeCount = comment.likesCount + 1;
        
        // Create notification for comment author (if not self-like)
        if (comment.author._id.toString() !== userId) {
          const liker = await User.findById(userId).select('username fullName');
          await notificationService.createNotification({
            recipientId: comment.author._id,
            type: 'like_comment',
            title: 'Comment Liked',
            message: `${liker.fullName || liker.username} liked your comment`,
            senderId: userId,
            relatedId: commentId,
            relatedType: 'comment'
          });
        }
        
        logger.info(`User ${userId} liked comment ${commentId}`);
      }

      return {
        action,
        isLiked: !isLiked,
        likesCount: newLikeCount,
        commentId,
        userId
      };
    } catch (error) {
      logger.error('Error toggling comment like:', error);
      throw error;
    }
  }

  /**
   * Bookmark or unbookmark a post
   * 
   * @param {string} userId - User performing the action
   * @param {string} postId - Post being bookmarked/unbookmarked
   * @returns {Promise<Object>} Result with action taken
   */
  async toggleBookmark(userId, postId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid user ID or post ID', 400);
      }

      const [user, post] = await Promise.all([
        User.findById(userId),
        Post.findById(postId)
      ]);

      if (!user) {
        throw new AppError('User not found', 404);
      }
      if (!post) {
        throw new AppError('Post not found', 404);
      }

      const isBookmarked = user.bookmarkedPosts.includes(postId);
      let action;

      if (isBookmarked) {
        // Remove bookmark
        await Promise.all([
          User.findByIdAndUpdate(userId, {
            $pull: { bookmarkedPosts: postId }
          }),
          Post.findByIdAndUpdate(postId, {
            $pull: { bookmarks: userId },
            $inc: { bookmarksCount: -1 }
          })
        ]);
        
        action = 'unbookmarked';
        logger.info(`User ${userId} unbookmarked post ${postId}`);
      } else {
        // Add bookmark
        await Promise.all([
          User.findByIdAndUpdate(userId, {
            $addToSet: { bookmarkedPosts: postId }
          }),
          Post.findByIdAndUpdate(postId, {
            $addToSet: { bookmarks: userId },
            $inc: { bookmarksCount: 1 }
          })
        ]);
        
        action = 'bookmarked';
        logger.info(`User ${userId} bookmarked post ${postId}`);
      }

      return {
        action,
        isBookmarked: !isBookmarked,
        postId,
        userId
      };
    } catch (error) {
      logger.error('Error toggling bookmark:', error);
      throw error;
    }
  }

  /**
   * Record a post share (for analytics)
   * 
   * @param {string} userId - User sharing the post
   * @param {string} postId - Post being shared
   * @param {string} platform - Platform where it's being shared (optional)
   * @returns {Promise<Object>} Share result
   */
  async sharePost(userId, postId, platform = 'unknown') {
    try {
      if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid user ID or post ID', 400);
      }

      const [user, post] = await Promise.all([
        User.findById(userId),
        Post.findById(postId).populate('author', 'username fullName')
      ]);

      if (!user) {
        throw new AppError('User not found', 404);
      }
      if (!post) {
        throw new AppError('Post not found', 404);
      }

      // Increment share count
      await Post.findByIdAndUpdate(postId, {
        $inc: { sharesCount: 1 },
        $push: {
          shares: {
            user: userId,
            platform,
            sharedAt: new Date()
          }
        }
      });

      // Add to user's shared posts
      await User.findByIdAndUpdate(userId, {
        $addToSet: { sharedPosts: postId }
      });

      // Create notification for post author (if not self-share)
      if (post.author._id.toString() !== userId) {
        const sharer = await User.findById(userId).select('username fullName');
        await notificationService.createNotification({
          recipientId: post.author._id,
          type: 'share',
          title: 'Post Shared',
          message: `${sharer.fullName || sharer.username} shared your post "${post.title}"`,
          senderId: userId,
          relatedId: postId,
          relatedType: 'post',
          metadata: { platform }
        });
      }

      logger.info(`User ${userId} shared post ${postId} on ${platform}`);

      return {
        action: 'shared',
        postId,
        userId,
        platform,
        sharesCount: post.sharesCount + 1
      };
    } catch (error) {
      logger.error('Error sharing post:', error);
      throw error;
    }
  }

  /**
   * Record a post view (for analytics)
   * 
   * @param {string} userId - User viewing the post (can be null for anonymous)
   * @param {string} postId - Post being viewed
   * @param {Object} metadata - Additional view metadata (IP, user agent, etc.)
   * @returns {Promise<Object>} View result
   */
  async recordPostView(userId, postId, metadata = {}) {
    try {
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
      }

      const post = await Post.findById(postId);
      if (!post) {
        throw new AppError('Post not found', 404);
      }

      // Don't count views from the post author
      if (userId && post.author.toString() === userId) {
        return { action: 'view_ignored', reason: 'self_view' };
      }

      // Increment view count
      await Post.findByIdAndUpdate(postId, {
        $inc: { viewsCount: 1 },
        $push: {
          views: {
            user: userId || null,
            viewedAt: new Date(),
            metadata
          }
        }
      });

      // Add to user's viewed posts (if user is logged in)
      if (userId) {
        await User.findByIdAndUpdate(userId, {
          $addToSet: { viewedPosts: postId }
        });
      }

      logger.info(`Post ${postId} viewed by ${userId || 'anonymous'}`);

      return {
        action: 'viewed',
        postId,
        userId: userId || null,
        viewsCount: post.viewsCount + 1
      };
    } catch (error) {
      logger.error('Error recording post view:', error);
      throw error;
    }
  }

  /**
   * Get user's interaction history with pagination
   * 
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @param {string} [options.type] - Filter by interaction type
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=20] - Items per page
   * @returns {Promise<Object>} Paginated interaction history
   */
  async getUserInteractions(userId, options = {}) {
    try {
      const { type, page = 1, limit = 20 } = options;

      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new AppError('Invalid user ID', 400);
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new AppError('User not found', 404);
      }

      const interactions = {
        liked: [],
        bookmarked: [],
        shared: [],
        viewed: []
      };

      // Populate liked posts
      if (!type || type === 'like') {
        interactions.liked = await Post.find({ _id: { $in: user.likedPosts } })
          .populate('author', 'username fullName profilePicture')
          .select('title slug content excerpt coverImage createdAt likesCount commentsCount')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit);
      }

      // Populate bookmarked posts
      if (!type || type === 'bookmark') {
        interactions.bookmarked = await Post.find({ _id: { $in: user.bookmarkedPosts } })
          .populate('author', 'username fullName profilePicture')
          .select('title slug content excerpt coverImage createdAt likesCount commentsCount')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit);
      }

      // Populate shared posts
      if (!type || type === 'share') {
        interactions.shared = await Post.find({ _id: { $in: user.sharedPosts } })
          .populate('author', 'username fullName profilePicture')
          .select('title slug content excerpt coverImage createdAt likesCount commentsCount')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit);
      }

      // Populate viewed posts
      if (!type || type === 'view') {
        interactions.viewed = await Post.find({ _id: { $in: user.viewedPosts } })
          .populate('author', 'username fullName profilePicture')
          .select('title slug content excerpt coverImage createdAt likesCount commentsCount')
          .sort({ createdAt: -1 })
          .limit(limit)
          .skip((page - 1) * limit);
      }

      return {
        interactions,
        pagination: {
          currentPage: page,
          limit,
          totalInteractions: {
            liked: user.likedPosts.length,
            bookmarked: user.bookmarkedPosts.length,
            shared: user.sharedPosts.length,
            viewed: user.viewedPosts.length
          }
        }
      };
    } catch (error) {
      logger.error('Error fetching user interactions:', error);
      throw error;
    }
  }

  /**
   * Get interaction statistics for a post
   * 
   * @param {string} postId - Post ID
   * @returns {Promise<Object>} Post interaction statistics
   */
  async getPostStats(postId) {
    try {
      if (!mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
      }

      const post = await Post.findById(postId)
        .populate('likes', 'username fullName profilePicture')
        .populate('bookmarks', 'username fullName profilePicture');

      if (!post) {
        throw new AppError('Post not found', 404);
      }

      // Calculate engagement rate (likes + comments + shares / views)
      const totalEngagements = post.likesCount + post.commentsCount + post.sharesCount;
      const engagementRate = post.viewsCount > 0 ? 
        ((totalEngagements / post.viewsCount) * 100).toFixed(2) : 0;

      return {
        postId,
        title: post.title,
        stats: {
          views: post.viewsCount || 0,
          likes: post.likesCount || 0,
          comments: post.commentsCount || 0,
          shares: post.sharesCount || 0,
          bookmarks: post.bookmarksCount || 0,
          engagementRate: parseFloat(engagementRate)
        },
        recentLikes: post.likes.slice(-10), // Last 10 users who liked
        recentBookmarks: post.bookmarks.slice(-5) // Last 5 users who bookmarked
      };
    } catch (error) {
      logger.error('Error fetching post statistics:', error);
      throw error;
    }
  }

  /**
   * Get trending posts based on recent interactions
   * 
   * @param {Object} options - Query options
   * @param {number} [options.limit=10] - Number of trending posts
   * @param {number} [options.hours=24] - Time window in hours
   * @returns {Promise<Array>} Trending posts
   */
  async getTrendingPosts(options = {}) {
    try {
      const { limit = 10, hours = 24 } = options;
      const timeWindow = new Date(Date.now() - (hours * 60 * 60 * 1000));

      // Aggregate posts by recent interaction activity
      const trendingPosts = await Post.aggregate([
        {
          $match: {
            status: 'published',
            createdAt: { $gte: timeWindow }
          }
        },
        {
          $addFields: {
            // Calculate trending score based on recent activity
            trendingScore: {
              $add: [
                { $multiply: ['$likesCount', 3] },
                { $multiply: ['$commentsCount', 5] },
                { $multiply: ['$sharesCount', 7] },
                { $multiply: ['$viewsCount', 1] }
              ]
            }
          }
        },
        {
          $sort: { trendingScore: -1 }
        },
        {
          $limit: limit
        },
        {
          $lookup: {
            from: 'users',
            localField: 'author',
            foreignField: '_id',
            as: 'authorInfo',
            pipeline: [
              { $project: { username: 1, fullName: 1, profilePicture: 1 } }
            ]
          }
        },
        {
          $unwind: '$authorInfo'
        },
        {
          $project: {
            title: 1,
            slug: 1,
            excerpt: 1,
            coverImage: 1,
            createdAt: 1,
            likesCount: 1,
            commentsCount: 1,
            sharesCount: 1,
            viewsCount: 1,
            trendingScore: 1,
            author: '$authorInfo'
          }
        }
      ]);

      return trendingPosts;
    } catch (error) {
      logger.error('Error fetching trending posts:', error);
      throw error;
    }
  }

  /**
   * Report content or user
   * 
   * @param {string} reporterId - User making the report
   * @param {string} targetId - ID of the content/user being reported
   * @param {string} targetType - Type of target (post, comment, user)
   * @param {string} reason - Reason for the report
   * @param {string} [description] - Additional description
   * @returns {Promise<Object>} Report result
   */
  async reportContent(reporterId, targetId, targetType, reason, description = '') {
    try {
      if (!mongoose.Types.ObjectId.isValid(reporterId) || 
          !mongoose.Types.ObjectId.isValid(targetId)) {
        throw new AppError('Invalid reporter ID or target ID', 400);
      }

      const reporter = await User.findById(reporterId);
      if (!reporter) {
        throw new AppError('Reporter not found', 404);
      }

      // Validate target exists
      let target;
      switch (targetType) {
        case TARGET_TYPES.POST:
          target = await Post.findById(targetId);
          break;
        case TARGET_TYPES.COMMENT:
          target = await Comment.findById(targetId);
          break;
        case TARGET_TYPES.USER:
          target = await User.findById(targetId);
          break;
        default:
          throw new AppError('Invalid target type', 400);
      }

      if (!target) {
        throw new AppError('Target not found', 404);
      }

      // Create report record (you might want to create a separate Report model)
      const report = {
        reporter: reporterId,
        target: targetId,
        targetType,
        reason,
        description,
        status: 'pending',
        createdAt: new Date()
      };

      // Add report to target's reports array
      await target.constructor.findByIdAndUpdate(targetId, {
        $push: { reports: report }
      });

      logger.info(`Content reported by ${reporterId}`, {
        targetId,
        targetType,
        reason
      });

      return {
        success: true,
        message: 'Report submitted successfully',
        reportId: report._id
      };
    } catch (error) {
      logger.error('Error reporting content:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new InteractionService();
module.exports.INTERACTION_TYPES = INTERACTION_TYPES;
module.exports.TARGET_TYPES = TARGET_TYPES;
