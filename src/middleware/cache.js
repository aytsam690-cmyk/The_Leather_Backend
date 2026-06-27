const { createClient } = require('redis');

// Create Redis client (connects to local Redis server by default)
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));
redisClient.on('connect', () => console.log('Connected to Redis'));

// Attempt connection but don't crash if Redis is down (it will just bypass cache)
redisClient.connect().catch(console.error);

// Static key cache (for /api/settings, /api/banners)
const memCache = (key, ttlMs = 5 * 60 * 1000) => {
  return async (req, res, next) => {
    try {
      if (!redisClient.isReady) return next();

      const cached = await redisClient.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      // Override res.json to capture and cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        redisClient.setEx(key, Math.floor(ttlMs / 1000), JSON.stringify(data)).catch(console.error);
        return originalJson(data);
      };
      next();
    } catch (err) {
      console.error('Redis cache error:', err);
      next();
    }
  };
};

// Dynamic key cache (for /api/products?page=1...)
const dynamicMemCache = (prefix, ttlMs = 2 * 60 * 1000) => {
  return async (req, res, next) => {
    try {
      if (!redisClient.isReady) return next();

      const queryStr = new URLSearchParams(req.query).toString();
      const key = `${prefix}:${queryStr || 'default'}`;

      const cached = await redisClient.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }

      const originalJson = res.json.bind(res);
      res.json = (data) => {
        redisClient.setEx(key, Math.floor(ttlMs / 1000), JSON.stringify(data)).catch(console.error);
        return originalJson(data);
      };
      next();
    } catch (err) {
      console.error('Redis dynamic cache error:', err);
      next();
    }
  };
};

// Invalidate exact keys
const invalidateCache = async (...keys) => {
  if (!redisClient.isReady) return;
  try {
    if (keys.length === 0) {
      await redisClient.flushDb();
    } else {
      await redisClient.del(keys);
    }
  } catch (err) {
    console.error('Redis invalidation error:', err);
  }
};

// Invalidate all keys that start with a prefix (e.g. "products:*")
const invalidateByPrefix = async (...prefixes) => {
  if (!redisClient.isReady) return;
  try {
    for (const prefix of prefixes) {
      // Find all keys matching the prefix
      const keys = await redisClient.keys(`${prefix}*`);
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
    }
  } catch (err) {
    console.error('Redis prefix invalidation error:', err);
  }
};

module.exports = { memCache, dynamicMemCache, invalidateCache, invalidateByPrefix, redisClient };
