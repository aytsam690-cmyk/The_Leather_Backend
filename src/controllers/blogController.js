const asyncHandler = require('express-async-handler');
const Blog = require('../models/Blog');

// @desc    Create a new blog
// @route   POST /api/blogs
// @access  Private/Admin
const createBlog = asyncHandler(async (req, res) => {
  const { title, slug, metaDescription, content, coverImage, isActive, relatedProducts } = req.body;

  const blogExists = await Blog.findOne({ slug });
  if (blogExists) {
    res.status(400);
    throw new Error('Blog with this slug already exists');
  }

  const blog = await Blog.create({
    title,
    slug,
    metaDescription,
    content,
    coverImage,
    isActive,
    relatedProducts: relatedProducts || []
  });

  res.status(201).json(blog);
});

// @desc    Update a blog
// @route   PUT /api/blogs/:id
// @access  Private/Admin
const updateBlog = asyncHandler(async (req, res) => {
  const { title, slug, metaDescription, content, coverImage, isActive, relatedProducts } = req.body;

  const blog = await Blog.findById(req.params.id);

  if (blog) {
    // Check if slug is taken by another blog
    if (slug !== blog.slug) {
      const slugExists = await Blog.findOne({ slug });
      if (slugExists) {
        res.status(400);
        throw new Error('Slug is already in use by another blog');
      }
    }

    blog.title = title || blog.title;
    blog.slug = slug || blog.slug;
    blog.metaDescription = metaDescription || blog.metaDescription;
    blog.content = content || blog.content;
    blog.coverImage = coverImage || blog.coverImage;
    if (isActive !== undefined) blog.isActive = isActive;
    if (relatedProducts !== undefined) blog.relatedProducts = relatedProducts;

    const updatedBlog = await blog.save();
    res.json(updatedBlog);
  } else {
    res.status(404);
    throw new Error('Blog not found');
  }
});

// @desc    Delete a blog
// @route   DELETE /api/blogs/:id
// @access  Private/Admin
const deleteBlog = asyncHandler(async (req, res) => {
  const blog = await Blog.findById(req.params.id);

  if (blog) {
    await blog.deleteOne();
    res.json({ message: 'Blog removed' });
  } else {
    res.status(404);
    throw new Error('Blog not found');
  }
});

// @desc    Get all blogs (Admin gets all, public gets active)
// @route   GET /api/blogs
// @access  Public (with query)
const getBlogs = asyncHandler(async (req, res) => {
  // If user requests admin view, return all, otherwise only active
  const isAdmin = req.query.admin === 'true';
  const query = isAdmin ? {} : { isActive: true };
  
  const blogs = await Blog.find(query).sort({ createdAt: -1 });
  res.json(blogs);
});

// @desc    Get single blog by slug
// @route   GET /api/blogs/:slug
// @access  Public
const getBlogBySlug = asyncHandler(async (req, res) => {
  const blog = await Blog.findOne({ slug: req.params.slug, isActive: true })
    .populate('relatedProducts', 'name slug price compareAtPrice images category inStock isNewProduct');

  if (blog) {
    res.json(blog);
  } else {
    res.status(404);
    throw new Error('Blog not found');
  }
});

module.exports = {
  createBlog,
  updateBlog,
  deleteBlog,
  getBlogs,
  getBlogBySlug,
};
