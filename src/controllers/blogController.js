// BLOG FEATURE — PATCH 2 — ROUTES
const asyncHandler = require('express-async-handler');
const BlogPost = require('../models/BlogPost');
const BlogCategory = require('../models/BlogCategory');
const BlogNewsletterSubscriber = require('../models/BlogNewsletterSubscriber');
const Product = require('../models/Product');

// --- PUBLIC ROUTES ---

// @desc    Get published posts
// @route   GET /api/blog
// @access  Public
const getPosts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const filter = { status: 'published' };

  if (req.query.category) {
    const category = await BlogCategory.findOne({ slug: req.query.category });
    if (category) filter.category = category._id;
  }

  if (req.query.tag) {
    filter.tags = req.query.tag;
  }

  if (req.query.search) {
    filter.title = { $regex: req.query.search, $options: 'i' };
  }

  const count = await BlogPost.countDocuments(filter);
  const posts = await BlogPost.find(filter)
    .populate('author', 'name avatar')
    .populate('category', 'name slug')
    .sort({ publishedAt: -1, createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ posts, page, pages: Math.ceil(count / limit), limit, total: count });
});

// @desc    Get featured post
// @route   GET /api/blog/featured
// @access  Public
const getFeaturedPost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findOne({ isPinned: true, status: 'published' })
    .populate('author', 'name avatar')
    .populate('category', 'name slug')
    .lean();
    
  res.json(post);
});

// @desc    Get all categories
// @route   GET /api/blog/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await BlogCategory.find({}).lean();
  res.json(categories);
});

// @desc    Get published posts by category slug
// @route   GET /api/blog/category/:slug
// @access  Public
const getPostsByCategory = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  
  const category = await BlogCategory.findOne({ slug: req.params.slug });
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  const count = await BlogPost.countDocuments({ status: 'published', category: category._id });
  const posts = await BlogPost.find({ status: 'published', category: category._id })
    .populate('author', 'name avatar')
    .populate('category', 'name slug')
    .sort({ publishedAt: -1, createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ posts, page, pages: Math.ceil(count / limit), limit, total: count });
});

// @desc    Get single post by slug
// @route   GET /api/blog/:slug
// @access  Public
const getPostBySlug = asyncHandler(async (req, res) => {
  const post = await BlogPost.findOneAndUpdate(
    { slug: req.params.slug, status: 'published' },
    { $inc: { views: 1 } },
    { new: true }
  )
    .populate('author', 'name avatar bio')
    .populate('category', 'name slug')
    .populate('linkedProducts', 'name price images slug')
    .lean();

  if (!post) {
    res.status(404);
    throw new Error('Post not found');
  }

  res.json(post);
});

// @desc    Subscribe to newsletter
// @route   POST /api/blog/newsletter
// @access  Public
const subscribeNewsletter = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) {
    res.status(400);
    throw new Error('Email is required');
  }

  const existing = await BlogNewsletterSubscriber.findOne({ email: email.toLowerCase() });
  
  if (existing) {
    if (existing.isActive) {
      return res.json({ message: 'already subscribed' });
    } else {
      existing.isActive = true;
      existing.subscribedAt = new Date();
      await existing.save();
      return res.json({ message: 'Subscription reactivated' });
    }
  }

  await BlogNewsletterSubscriber.create({ email: email.toLowerCase() });
  res.status(201).json({ message: 'Successfully subscribed' });
});

// --- ADMIN ROUTES ---

// @desc    Get all posts (Admin)
// @route   GET /api/admin/blog
// @access  Private/Admin
const adminGetPosts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };

  const count = await BlogPost.countDocuments(filter);
  const posts = await BlogPost.find(filter)
    .populate('author', 'name avatar')
    .populate('category', 'name slug')
    .sort({ createdAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ posts, page, pages: Math.ceil(count / limit), limit, total: count });
});

// @desc    Create a post (Admin)
// @route   POST /api/admin/blog
// @access  Private/Admin
const createPost = asyncHandler(async (req, res) => {
  const post = new BlogPost(req.body);
  if (!post.author) {
    post.author = req.user._id;
  }
  const createdPost = await post.save();
  res.status(201).json(createdPost);
});

// @desc    Update a post (Admin)
// @route   PUT /api/admin/blog/:id
// @access  Private/Admin
const updatePost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    Object.assign(post, req.body);
    const updatedPost = await post.save();
    res.json(updatedPost);
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

// @desc    Hard delete a post (Admin)
// @route   DELETE /api/admin/blog/:id
// @access  Private/Admin
const deletePost = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    await post.deleteOne();
    res.json({ message: 'Post removed' });
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

// @desc    Update post status (Admin)
// @route   PATCH /api/admin/blog/:id/status
// @access  Private/Admin
const updatePostStatus = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    post.status = req.body.status;
    const updatedPost = await post.save();
    res.json(updatedPost);
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

// @desc    Toggle post isPinned (Admin)
// @route   PATCH /api/admin/blog/:id/pin
// @access  Private/Admin
const togglePostPin = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (post) {
    post.isPinned = !post.isPinned;
    const updatedPost = await post.save();
    res.json(updatedPost);
  } else {
    res.status(404);
    throw new Error('Post not found');
  }
});

// @desc    Create a category (Admin)
// @route   POST /api/admin/blog/categories
// @access  Private/Admin
const createCategory = asyncHandler(async (req, res) => {
  const category = new BlogCategory(req.body);
  const createdCategory = await category.save();
  res.status(201).json(createdCategory);
});

// @desc    Update a category (Admin)
// @route   PUT /api/admin/blog/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.findById(req.params.id);
  if (category) {
    Object.assign(category, req.body);
    const updatedCategory = await category.save();
    res.json(updatedCategory);
  } else {
    res.status(404);
    throw new Error('Category not found');
  }
});

// @desc    Delete a category (Admin)
// @route   DELETE /api/admin/blog/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await BlogCategory.findById(req.params.id);
  if (!category) {
    res.status(404);
    throw new Error('Category not found');
  }

  const postsCount = await BlogPost.countDocuments({ category: category._id });
  if (postsCount > 0 && !req.body.force) {
    res.status(400);
    throw new Error(`Cannot delete category. It is used by ${postsCount} post(s). Use force: true to delete anyway.`);
  }

  await category.deleteOne();
  res.json({ message: 'Category removed' });
});

// @desc    Search products for linking (Admin)
// @route   GET /api/admin/blog/products/search
// @access  Private/Admin
const searchBlogProducts = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const q = req.query.q || '';
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  const products = await Product.find({
    isActive: true,
    name: { $regex: escapeRegex(q), $options: 'i' }
  })
    .select('_id name price images slug')
    .limit(limit)
    .lean();
    
  const formattedProducts = products.map(p => ({
    id: p._id,
    name: p.name,
    price: p.price,
    slug: p.slug,
    images: p.images && p.images.length > 0 ? [p.images[0]] : []
  }));

  res.json(formattedProducts);
});

// @desc    Get subscribers (Admin)
// @route   GET /api/admin/blog/subscribers
// @access  Private/Admin
const getSubscribers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const count = await BlogNewsletterSubscriber.countDocuments({});
  const subscribers = await BlogNewsletterSubscriber.find({})
    .sort({ subscribedAt: -1 })
    .skip(limit * (page - 1))
    .limit(limit)
    .lean();

  res.json({ subscribers, page, pages: Math.ceil(count / limit), limit, total: count });
});

// @desc    Export subscribers CSV (Admin)
// @route   GET /api/admin/blog/subscribers/export
// @access  Private/Admin
const exportSubscribers = asyncHandler(async (req, res) => {
  const subscribers = await BlogNewsletterSubscriber.find({}).sort({ subscribedAt: -1 }).lean();
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="subscribers.csv"');
  
  let csv = 'email,subscribedAt,isActive\n';
  subscribers.forEach(sub => {
    csv += `${sub.email},${sub.subscribedAt.toISOString()},${sub.isActive}\n`;
  });
  
  res.send(csv);
});

module.exports = {
  getPosts,
  getFeaturedPost,
  getCategories,
  getPostsByCategory,
  getPostBySlug,
  subscribeNewsletter,
  adminGetPosts,
  createPost,
  updatePost,
  deletePost,
  updatePostStatus,
  togglePostPin,
  createCategory,
  updateCategory,
  deleteCategory,
  searchBlogProducts,
  getSubscribers,
  exportSubscribers
};
