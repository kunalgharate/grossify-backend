const { AppError } = require('../errors');
const config = require('../config');

/**
 * Global error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Default to 500 if no statusCode
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal Server Error';

  // Log error
  if (statusCode >= 500) {
    console.error(`[ERROR] ${req.method} ${req.path}`, {
      statusCode,
      message: err.message,
      stack: err.stack,
    });
  }

  const response = {
    error: err.code || 'INTERNAL_ERROR',
    message,
  };

  // Include validation errors if present
  if (err.errors) {
    response.errors = err.errors;
  }

  // Include stack trace in development
  if (config.nodeEnv !== 'production') {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
};

module.exports = { errorHandler, notFoundHandler };
