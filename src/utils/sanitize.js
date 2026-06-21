/**
 * Sanitize user input to prevent NoSQL injection.
 *
 * MongoDB operators like $gt, $regex, $ne etc. can be passed as JSON objects
 * through Express's body parser. This module provides helpers to ensure
 * values destined for database queries are safe plain strings.
 */

/**
 * Ensures a value is a plain string. Returns null if not.
 * Use this before passing user input into MongoDB queries like findOne({ email }).
 */
const ensureString = (value) => {
  if (typeof value !== 'string') return null;
  return value;
};

/**
 * Strips any keys starting with '$' from an object (shallow).
 * Useful for sanitizing entire req.body / req.query before use.
 */
const stripOperators = (obj) => {
  if (typeof obj !== 'object' || obj === null) return obj;
  const clean = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) continue;
    clean[key] = obj[key];
  }
  return clean;
};

/**
 * Express middleware: reject any request whose body contains
 * MongoDB operator keys at the top level.
 */
const noInjection = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    for (const key of Object.keys(req.body)) {
      const val = req.body[key];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        // Check for operator keys inside nested objects
        for (const nestedKey of Object.keys(val)) {
          if (nestedKey.startsWith('$')) {
            return res.status(400).json({ message: 'Invalid input detected' });
          }
        }
      }
    }
  }
  next();
};

module.exports = { ensureString, stripOperators, noInjection };
