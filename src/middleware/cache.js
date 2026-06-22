// Simple in-memory cache with TTL
// Used for rarely-changing data: settings, categories, banners
const cache = new Map();

const memCache = (key, ttlMs = 5 * 60 * 1000) => {
  return (req, res, next) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttlMs) {
      return res.json(cached.data);
    }

    // Override res.json to capture and cache the response
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(key, { data, timestamp: Date.now() });
      return originalJson(data);
    };
    next();
  };
};

const invalidateCache = (...keys) => {
  if (keys.length === 0) {
    cache.clear();
  } else {
    keys.forEach(k => cache.delete(k));
  }
};

module.exports = { memCache, invalidateCache };
