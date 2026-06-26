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

const hasOperatorKey = (obj) => {
  if (typeof obj !== 'object' || obj === null) return false;
  if (Array.isArray(obj)) return obj.some(hasOperatorKey);
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) return true;
    if (hasOperatorKey(obj[key])) return true;
  }
  return false;
};

/**
 * Express middleware: reject any request whose body, query, or params
 * contains MongoDB operator keys at any depth.
 */
const noInjection = (req, res, next) => {
  if (hasOperatorKey(req.body) || hasOperatorKey(req.query) || hasOperatorKey(req.params)) {
    return res.status(400).json({ message: 'Invalid input detected' });
  }
  next();
};

module.exports = { ensureString, stripOperators, noInjection };
