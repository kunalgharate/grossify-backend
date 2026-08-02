/**
 * Logger - uses console for now, can be swapped to Pino/Winston later
 */

const config = require('./config');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const logger = {
  error(message, meta = {}) {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, meta);
  },

  warn(message, meta = {}) {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, meta);
  },

  info(message, meta = {}) {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, meta);
  },

  debug(message, meta = {}) {
    if (config.nodeEnv === 'development') {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, meta);
    }
  },
};

module.exports = { logger };
