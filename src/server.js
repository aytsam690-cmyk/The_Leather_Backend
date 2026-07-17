const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const path = require('path');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const compression = require('compression');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Security: Trust Proxy is REQUIRED for rate limiters to work behind Vercel/Cloudflare
app.set('trust proxy', 1);

// Security: Global API Rate Limiter to prevent DDoS attacks
const rateLimit = require('express-rate-limit');
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per `window` (here, per 15 minutes)
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Security: HTTP headers with Content Security Policy
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
    },
  },
}));

// Security: CORS — allow frontend origins
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(u => u.trim());

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Security: Reject oversized requests before body parsing even starts
app.use((req, res, next) => {
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (contentLength && contentLength > 2 * 1024 * 1024) { // 2MB hard limit
    return res.status(413).json({ message: 'Payload too large' });
  }
  next();
});

// Body parsing with size limits
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Cookie parser for refresh tokens
app.use(cookieParser());

// Gzip compression — reduces response size by ~70%
app.use(compression());

// Security: NoSQL injection prevention (body only — Express 5 has read-only req.query)
app.use((req, res, next) => {
  if (req.body) {
    mongoSanitize.sanitize(req.body);
  }
  next();
});

// Security: Reject requests with nested MongoDB operators (e.g. $gt, $ne)
const { noInjection } = require('./utils/sanitize');
app.use(noInjection);

// Serve uploaded files as static (with 30-day Cache-Control/Expires headers)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads'), {
  maxAge: '30d',
  immutable: true
}));

// Basic route
app.get('/', (req, res) => {
  res.send('API is running...');
});

// ─── Dynamic Sitemap.xml ─────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const Product = require('./models/Product');
    const Category = require('./models/Category');
    const Settings = require('./models/Settings');

    const BlogPost = require('./models/BlogPost');

    const products = await Product.find({ isActive: { $ne: false } }).select('slug updatedAt images name').lean();
    const categories = await Category.find({}).select('name').lean();
    const blogs = await BlogPost.find(BlogPost.publicFilter()).select('slug updatedAt publishedAt featuredImage title').lean();
    const settings = await Settings.findOne({}).lean();

    // Use FRONTEND_URL as the site domain
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

    // Escape XML special characters to prevent injection
    const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';

    // Static pages
    const staticPages = [
      { path: '/',                  freq: 'daily',   priority: '1.0' },
      { path: '/products',          freq: 'weekly',  priority: '0.8' },
      { path: '/about',             freq: 'monthly', priority: '0.8' },
      { path: '/track-order',       freq: 'weekly',  priority: '0.8' },
      { path: '/contact',           freq: 'monthly', priority: '0.6' },
      { path: '/blogs',             freq: 'weekly',  priority: '0.7' },
      { path: '/privacy-policy',    freq: 'monthly', priority: '0.4' },
      { path: '/return-policy',     freq: 'monthly', priority: '0.4' },
      { path: '/terms-conditions',  freq: 'monthly', priority: '0.4' },
    ];
    const today = new Date().toISOString().split('T')[0];
    for (const page of staticPages) {
      xml += `  <url>\n    <loc>${frontendUrl}${page.path}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${page.freq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
    }

    // Product pages
    for (const p of products) {
      const slug = p.slug || p._id;
      const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : today;
      let imageXml = '';
      if (p.images && p.images.length > 0) {
        for (const img of p.images) {
          if (img.url) {
            imageXml += `\n    <image:image>\n      <image:loc>${escXml(img.url)}</image:loc>\n      <image:title>${escXml(p.name)}</image:title>\n    </image:image>`;
          }
        }
      }
      xml += `  <url>\n    <loc>${escXml(frontendUrl)}/products/${escXml(slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>${imageXml}\n  </url>\n`;
    }

    // Category pages
    for (const c of categories) {
      xml += `  <url>\n    <loc>${escXml(frontendUrl)}/products?category=${encodeURIComponent(c.name)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    // Blog post pages (published/scheduled-past only, via publicFilter)
    for (const b of blogs) {
      const lastmodSrc = b.updatedAt || b.publishedAt;
      const lastmod = lastmodSrc ? new Date(lastmodSrc).toISOString().split('T')[0] : today;
      let imageXml = '';
      if (b.featuredImage) {
        imageXml += `\n    <image:image>\n      <image:loc>${escXml(b.featuredImage)}</image:loc>\n      <image:title>${escXml(b.title)}</image:title>\n    </image:image>`;
      }
      xml += `  <url>\n    <loc>${escXml(frontendUrl)}/blog/${escXml(b.slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>${imageXml}\n  </url>\n`;
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
  }
});

// ─── robots.txt (points crawlers at the sitemap) ─────────────────────────────
app.get('/robots.txt', (req, res) => {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
  const body = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /aytsam-abdullah',
    `Sitemap: ${frontendUrl}/sitemap.xml`,
    '',
  ].join('\n');
  res.set('Content-Type', 'text/plain');
  res.send(body);
});

// ─── RSS 2.0 feed for the blog ───────────────────────────────────────────────
app.get('/rss.xml', async (req, res) => {
  try {
    const BlogPost = require('./models/BlogPost');
    const Settings = require('./models/Settings');

    const settings = await Settings.findOne({}).lean();
    const siteName = settings?.siteName || 'Store';
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

    const posts = await BlogPost.find(BlogPost.publicFilter())
      .select('title slug excerpt metaDescription publishedAt updatedAt')
      .sort({ publishedAt: -1 })
      .limit(50)
      .lean();

    const escXml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n';
    xml += `  <title>${escXml(siteName)} — Blog</title>\n`;
    xml += `  <link>${escXml(frontendUrl)}/blogs</link>\n`;
    xml += `  <description>${escXml(`Latest articles from ${siteName}`)}</description>\n`;
    xml += `  <atom:link href="${escXml(frontendUrl)}/rss.xml" rel="self" type="application/rss+xml" />\n`;
    for (const p of posts) {
      const link = `${frontendUrl}/blog/${p.slug}`;
      const desc = p.excerpt || p.metaDescription || '';
      const pubDate = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date(p.updatedAt).toUTCString();
      xml += '  <item>\n';
      xml += `    <title>${escXml(p.title)}</title>\n`;
      xml += `    <link>${escXml(link)}</link>\n`;
      xml += `    <guid isPermaLink="true">${escXml(link)}</guid>\n`;
      xml += `    <description>${escXml(desc)}</description>\n`;
      xml += `    <pubDate>${pubDate}</pubDate>\n`;
      xml += '  </item>\n';
    }
    xml += '</channel>\n</rss>';

    res.set('Content-Type', 'application/rss+xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error generating RSS feed');
  }
});

// ─── Social Share OG Endpoint ─────────────────────────────────────────────────
// Returns HTML with proper meta tags for WhatsApp/Facebook/Twitter crawlers
app.get('/share/product/:slug', async (req, res) => {
  try {
    const Product = require('./models/Product');
    const Settings = require('./models/Settings');

    const product = await Product.findOne({ slug: req.params.slug, isActive: { $ne: false } }).lean();
    const settings = await Settings.findOne({}).lean();

    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    const siteName = settings?.siteName || 'CRAFT HID';
    const productUrl = `${frontendUrl}/products/${req.params.slug}`;

    if (!product) {
      return res.redirect(productUrl);
    }

    const title = `${product.metaTitle || product.name} | ${siteName}`;
    const rawDesc = (product.metaDescription || product.description || `Buy ${product.name} at ${siteName}`).replace(/\n/g, ' ').slice(0, 155);
    const description = rawDesc;
    const image = (product.images?.[0]?.url) || (typeof product.images?.[0] === 'string' ? product.images[0] : '') || settings?.logo || '';
    const price = product.salePrice || product.price || 0;
    const currency = settings?.currency || 'PKR';

    const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta property="og:url" content="${esc(productUrl)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="${esc(siteName)}" />
  <meta property="product:price:amount" content="${price}" />
  <meta property="product:price:currency" content="${currency}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(image)}" />
  <meta http-equiv="refresh" content="0;url=${esc(productUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${esc(productUrl)}">${esc(product.name)}</a>...</p>
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();
    res.redirect(`${frontendUrl}/products/${req.params.slug}`);
  }
});

const { notFound, errorHandler } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const adminRoutes = require('./routes/adminRoutes');
const couponRoutes = require('./routes/couponRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const bannerRoutes = require('./routes/bannerRoutes');
const searchRoutes = require('./routes/searchRoutes');
const filterRoutes = require('./routes/filterRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const blogRoutes = require('./routes/blogRoutes');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/banners', bannerRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/filters', filterRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/blog', blogRoutes);

// ─── INDUSTRY-LEVEL DYNAMIC RENDERING FOR BOTS (SEO) ─────────────────────────
app.get(/^\/bot-render\/(.*)/, async (req, res) => {
  try {
    const Settings = require('./models/Settings');
    const Product = require('./models/Product');
    const settings = await Settings.findOne({}).lean();
    
    const siteName = settings?.siteName || 'Craft Hid';
    const frontendUrl = (process.env.FRONTEND_URL || 'https://www.crafthid.com').split(',')[0].trim();
    const fullPath = req.params[0] || '';
    const canonicalUrl = `${frontendUrl}/${fullPath}`;
    
    let title = siteName;
    let description = settings?.metaTags?.description || `Welcome to ${siteName}`;
    let image = settings?.metaTags?.ogImage || settings?.logo || '';
    let contentHtml = `<h1>${siteName}</h1><p>${description}</p>`;
    let jsonLd = null;
    let statusCode = 200;

    // Route: Product Page
    if (fullPath.startsWith('products/')) {
      const slug = fullPath.split('/')[1];
      if (slug) {
        const product = await Product.findOne({ $or: [{ slug }, { _id: slug.length === 24 ? slug : null }] }).select('name slug description images price stock ratings SKU').lean();
        if (product) {
          title = `${product.name} | ${siteName}`;
          description = product.description || description;
          image = (product.images && product.images.length > 0) ? product.images[0].url : image;
          
          contentHtml = `
            <h1>${product.name}</h1>
            ${image ? `<img src="${image}" alt="${product.name}" />` : ''}
            <p>${product.description}</p>
            <p><strong>Price:</strong> Rs. ${product.price}</p>
          `;

          // Generate Google Rich Results Structured Data
          jsonLd = {
            "@context": "https://schema.org/",
            "@type": "Product",
            "name": product.name,
            "image": product.images?.map(img => img.url) || [image],
            "description": product.description,
            "sku": product.SKU || product._id.toString(),
            "brand": {
              "@type": "Brand",
              "name": siteName
            },
            ...(product.ratings?.count > 0 ? {
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": product.ratings.average,
                "reviewCount": product.ratings.count
              }
            } : {}),
            "offers": {
              "@type": "Offer",
              "url": canonicalUrl,
              "priceCurrency": "PKR",
              "price": product.price,
              "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
              "seller": {
                "@type": "Organization",
                "name": siteName
              }
            }
          };
        } else {
          // IMPORTANT: Return 404 if product is not in database. Prevents Soft 404 penalties.
          statusCode = 404;
          title = `Product Not Found | ${siteName}`;
          contentHtml = `<h1>404 - Product Not Found</h1><p>The product you are looking for does not exist.</p>`;
        }
      }
    } 
    // Route: Products Listing
    else if (fullPath === 'products') {
      title = `All Products | ${siteName}`;
      description = `Browse our extensive collection of premium products at ${siteName}.`;
      contentHtml = `<h1>All Products</h1><p>${description}</p>`;
    }
    // Route: Home Page
    else if (fullPath === '') {
      title = `${siteName} - Premium Products`;
      description = settings?.metaTags?.description || `Discover premium products curated just for you at ${siteName}. Quality you can feel, style you can trust.`;
      contentHtml = `<h1>${siteName}</h1><p>${description}</p>`;
      jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": siteName,
        "url": frontendUrl,
        "description": `Discover premium products at ${siteName}.`
      };
    }
    // Route: About Page
    else if (fullPath.startsWith('about')) {
      title = `About Us | ${siteName}`;
      description = `Learn about ${siteName} — our story, values, and commitment to bringing you premium products with exceptional quality.`;
      contentHtml = `<h1>About Us</h1><p>${description}</p>`;
    }
    // Route: Contact
    else if (fullPath.startsWith('contact')) {
      title = `Contact Us | ${siteName}`;
      description = `Get in touch with ${siteName}. We're here to help with your orders and inquiries.`;
      contentHtml = `<h1>Contact Us</h1><p>${description}</p>`;
    }
    // Route: Track Order
    else if (fullPath.startsWith('track-order')) {
      title = `Track Order | ${siteName}`;
      description = `Track your orders by entering your phone number.`;
      contentHtml = `<h1>Track Order</h1><p>${description}</p>`;
    }
    // Route: Privacy Policy
    else if (fullPath.startsWith('privacy-policy')) {
      title = `Privacy Policy | ${siteName}`;
      description = `Privacy Policy for ${siteName}. Learn how we collect, use, and protect your data.`;
      contentHtml = `<h1>Privacy Policy</h1><p>${description}</p>`;
    }
    // Route: Terms Conditions
    else if (fullPath.startsWith('terms-conditions')) {
      title = `Terms & Conditions | ${siteName}`;
      description = `Terms and Conditions for ${siteName}. Read the rules and guidelines for using our website and purchasing our products.`;
      contentHtml = `<h1>Terms & Conditions</h1><p>${description}</p>`;
    }
    // Route: Return Policy
    else if (fullPath.startsWith('return-policy')) {
      title = `Return Policy | ${siteName}`;
      description = `Return Policy for ${siteName}. Learn about our 7-day return process.`;
      contentHtml = `<h1>Return Policy</h1><p>${description}</p>`;
    }

    // Escape basic HTML for meta content attributes
    const escapeHtml = (unsafe) => (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    const faviconTag = `<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png?v=3">\n    <link rel="icon" type="image/x-icon" href="/favicon.ico?v=3">`;
    const jsonLdScript = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonicalUrl}" />
    ${faviconTag}
    
    <!-- OpenGraph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:image" content="${image}">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${canonicalUrl}">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${image}">

    ${jsonLdScript}
</head>
<body>
    <div id="seo-content">
      ${contentHtml}
    </div>
</body>
</html>`;

    res.status(statusCode).send(html);
  } catch (error) {
    console.error('Error rendering bot HTML:', error);
    res.status(500).send('Internal Server Error');
  }
});

// Error handling middlewares
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
