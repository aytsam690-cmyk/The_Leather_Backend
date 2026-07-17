const asyncHandler = require('express-async-handler');
const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const BlogTag = require('../models/BlogTag');
const { deleteImageFromCloudinary } = require('../utils/cloudinaryUtils');

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    List published posts (paginated, filterable by category/tag)
// @route   GET /api/blog/posts
// @access  Public
const getPosts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Number(req.query.limit) || 9);

  const filter = BlogPost.publicFilter();

  if (req.query.category) {
    const category = await BlogCategory.findOne({ slug: req.query.category }).select('_id').lean();
    // Unknown category slug → no matches (rather than ignoring the filter)
    filter.category = category ? category._id : null;
  }

  if (req.query.tag) {
    const tag = await BlogTag.findOne({ slug: req.query.tag }).select('_id').lean();
    filter.tags = tag ? tag._id : null;
  }

  const count = await BlogPost.countDocuments(filter);
  const posts = await BlogPost.find(filter)
    .select('title slug excerpt featuredImage category tags author publishedAt createdAt')
    .populate('author', 'name')
    .populate('category', 'name slug')
    .populate('tags', 'name slug')
    .sort({ publishedAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ posts, page, pages: Math.ceil(count / limit) || 1, limit, total: count });
});

// @desc    Get a single published post by slug (404 for drafts/missing/future)
// @route   GET /api/blog/posts/:slug
// @access  Public
const getPostBySlug = asyncHandler(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, ...BlogPost.publicFilter() })
    .populate('author', 'name')
    .populate('category', 'name slug')
    .populate('tags', 'name slug')
    .lean();

  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  // Related posts: same category, published, excluding this one
  let related = [];
  if (post.category) {
    related = await BlogPost.find({
      ...BlogPost.publicFilter(),
      category: post.category._id,
      _id: { $ne: post._id },
    })
      .select('title slug excerpt featuredImage publishedAt')
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean();
  }

  res.json({ post, related });
});

// @desc    List all blog categories (public)
// @route   GET /api/blog/categories
// @access  Public
const getPublicCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find({}).sort('name').lean();
  res.json(categories);
});

// @desc    List all blog tags (public)
// @route   GET /api/blog/tags
// @access  Public
const getPublicTags = asyncHandler(async (req, res) => {
  const tags = await BlogTag.find({}).sort('name').lean();
  res.json(tags);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — POSTS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    List all posts incl. drafts (paginated, search, status filter)
// @route   GET /api/blog/admin/posts
// @access  Private/Admin
const adminGetPosts = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Number(req.query.limit) || 20);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) {
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.title = { $regex: escapeRegex(req.query.search), $options: 'i' };
  }

  const count = await BlogPost.countDocuments(filter);
  const posts = await BlogPost.find(filter)
    .populate('author', 'name')
    .populate('category', 'name slug')
    .populate('tags', 'name slug')
    .sort({ createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ posts, page, pages: Math.ceil(count / limit) || 1, limit, total: count });
});

// @desc    Get a single post by id (admin — any status)
// @route   GET /api/blog/admin/posts/:id
// @access  Private/Admin
const adminGetPost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id)
    .populate('author', 'name')
    .populate('category', 'name slug')
    .populate('tags', 'name slug')
    .lean();

  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }
  res.json(post);
});

// @desc    Create a post
// @route   POST /api/blog/admin/posts
// @access  Private/Admin
const createPost = asyncHandler(async (req, res) => {
  const post = new BlogPost(req.body);
  if (!post.author) post.author = req.user._id;
  const created = await post.save();
  res.status(201).json(created);
});

// @desc    Update a post
// @route   PUT /api/blog/admin/posts/:id
// @access  Private/Admin
const updatePost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  // Clean up a replaced featured image from Cloudinary
  if (
    req.body.featuredImage !== undefined &&
    post.featuredImage &&
    req.body.featuredImage !== post.featuredImage
  ) {
    await deleteImageFromCloudinary(post.featuredImage);
  }

  Object.assign(post, req.body);
  const updated = await post.save();
  res.json(updated);
});

// @desc    Delete a post (and its featured image)
// @route   DELETE /api/blog/admin/posts/:id
// @access  Private/Admin
const deletePost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }
  if (post.featuredImage) {
    await deleteImageFromCloudinary(post.featuredImage);
  }
  await post.deleteOne();
  res.json({ message: 'Post removed' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — CATEGORIES
// ─────────────────────────────────────────────────────────────────────────────

// @desc    List categories with post counts (admin)
// @route   GET /api/blog/admin/categories
// @access  Private/Admin
const adminGetCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find({}).sort('name').lean();
  const counts = await BlogPost.aggregate([
    { $match: { category: { $ne: null } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const withCounts = categories.map((c) => {
    const found = counts.find((x) => x._id && x._id.toString() === c._id.toString());
    return { ...c, postCount: found ? found.count : 0 };
  });
  res.json(withCounts);
});

// @desc    Create a category
// @route   POST /api/blog/admin/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.create(req.body);
  res.status(201).json(category);
});

// @desc    Update a category
// @route   PUT /api/blog/admin/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }
  Object.assign(category, req.body);
  const updated = await category.save();
  res.json(updated);
});

// @desc    Delete a category — posts referencing it fall back to "uncategorized"
// @route   DELETE /api/blog/admin/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }
  // Fallback: unset the category on affected posts (null renders as "Uncategorized")
  await BlogPost.updateMany({ category: category._id }, { $set: { category: null } });
  await category.deleteOne();
  res.json({ message: 'Category removed; affected posts set to uncategorized' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — TAGS
// ─────────────────────────────────────────────────────────────────────────────

// @desc    List tags with post counts (admin)
// @route   GET /api/blog/admin/tags
// @access  Private/Admin
const adminGetTags = asyncHandler(async (req, res) => {
  const tags = await BlogTag.find({}).sort('name').lean();
  const counts = await BlogPost.aggregate([
    { $unwind: '$tags' },
    { $group: { _id: '$tags', count: { $sum: 1 } } },
  ]);
  const withCounts = tags.map((t) => {
    const found = counts.find((x) => x._id && x._id.toString() === t._id.toString());
    return { ...t, postCount: found ? found.count : 0 };
  });
  res.json(withCounts);
});

// @desc    Create a tag
// @route   POST /api/blog/admin/tags
// @access  Private/Admin
const createTag = asyncHandler(async (req, res) => {
  const tag = await BlogTag.create(req.body);
  res.status(201).json(tag);
});

// @desc    Update a tag
// @route   PUT /api/blog/admin/tags/:id
// @access  Private/Admin
const updateTag = asyncHandler(async (req, res) => {
  const tag = await BlogTag.findById(req.params.id);
  if (!tag) {
    res.status(404);
    throw new Error('Tag not found');
  }
  Object.assign(tag, req.body);
  const updated = await tag.save();
  res.json(updated);
});

// @desc    Delete a tag — silently dropped from posts referencing it
// @route   DELETE /api/blog/admin/tags/:id
// @access  Private/Admin
const deleteTag = asyncHandler(async (req, res) => {
  const tag = await BlogTag.findById(req.params.id);
  if (!tag) {
    res.status(404);
    throw new Error('Tag not found');
  }
  // Fallback: pull the tag from every post that references it
  await BlogPost.updateMany({ tags: tag._id }, { $pull: { tags: tag._id } });
  await tag.deleteOne();
  res.json({ message: 'Tag removed and dropped from all posts' });
});

module.exports = {
  // public
  getPosts,
  getPostBySlug,
  getPublicCategories,
  getPublicTags,
  // admin posts
  adminGetPosts,
  adminGetPost,
  createPost,
  updatePost,
  deletePost,
  // admin categories
  adminGetCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  // admin tags
  adminGetTags,
  createTag,
  updateTag,
  deleteTag,
};
