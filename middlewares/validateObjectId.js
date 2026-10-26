const mongoose = require("mongoose");

/**
 * Validates that a route param (default 'id') is a valid MongoDB ObjectId.
 */
function validateObjectId(paramName = "id") {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid identifier format: '${id}' is not a valid ObjectId.`
      });
    }
    next();
  };
}

module.exports = validateObjectId;
