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

    const products = await Product.find({ isActive: { $ne: false } }).select('slug updatedAt').lean();
    const categories = await Category.find({}).select('name').lean();
    const settings = await Settings.findOne({}).lean();

    // Use FRONTEND_URL as the site domain
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

    // Escape XML special characters to prevent injection
    const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Static pages
    const staticPages = ['/', '/products', '/about', '/track-order'];
    for (const page of staticPages) {
      xml += `  <url>\n    <loc>${frontendUrl}${page}</loc>\n    <changefreq>${page === '/' ? 'daily' : 'weekly'}</changefreq>\n    <priority>${page === '/' ? '1.0' : '0.8'}</priority>\n  </url>\n`;
    }

    // Product pages
    for (const p of products) {
      const slug = p.slug || p._id;
      const lastmod = p.updatedAt ? new Date(p.updatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
      xml += `  <url>\n    <loc>${escXml(frontendUrl)}/products/${escXml(slug)}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    }

    // Category pages
    for (const c of categories) {
      xml += `  <url>\n    <loc>${escXml(frontendUrl)}/products?category=${encodeURIComponent(c.name)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    xml += '</urlset>';

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Error generating sitemap');
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
        const product = await Product.findOne({ $or: [{ slug }, { _id: slug.length === 24 ? slug : null }] }).lean();
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
            "sku": product._id.toString(),
            "brand": {
              "@type": "Brand",
              "name": siteName
            },
            "offers": {
              "@type": "Offer",
              "url": canonicalUrl,
              "priceCurrency": "PKR",
              "price": product.price,
              "availability": product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock"
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
    // Route: About Page
    else if (fullPath.startsWith('about')) {
      title = `About Us | ${siteName}`;
      contentHtml = `<h1>About Us</h1><p>Learn more about ${siteName}</p>`;
    }

    // Escape basic HTML for meta content attributes
    const escapeHtml = (unsafe) => (unsafe || '').toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    const faviconTag = settings?.favicon ? `<link rel="icon" href="${settings.favicon}">` : `<link rel="icon" type="image/png" href="/favicon.png">`;
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
