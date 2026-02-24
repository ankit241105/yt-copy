import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";

export const notFound = (req, _res, next) => {
  next(new AppError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

export const errorHandler = (err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error.";
  let details = err.details || null;

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed.";
    details = Object.values(err.errors || {}).map((item) => item.message);
  }

  if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid value for ${err.path}.`;
  }

  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid authentication token.";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Session expired. Please login again.";
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "field";
    message = `${field} already exists.`;
  }

  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    statusCode = 400;
    message = "Invalid JSON payload.";
  }

  const response = {
    success: false,
    message,
  };

  if (details) {
    response.details = details;
  }

  if (process.env.NODE_ENV !== "production") {
    response.error = err.name;
  }

  const logMeta = {
    requestId: _req.requestId || null,
    method: _req.method,
    path: _req.originalUrl,
    statusCode,
    message,
  };

  if (statusCode >= 500) {
    logger.error("Unhandled request error", logMeta);
  } else {
    logger.warn("Handled request error", logMeta);
  }

  res.status(statusCode).json(response);
};
