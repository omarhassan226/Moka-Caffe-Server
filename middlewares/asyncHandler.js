/**
 * Wraps async route handlers and controller functions to automatically
 * forward unhandled errors to the next(err) middleware.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
