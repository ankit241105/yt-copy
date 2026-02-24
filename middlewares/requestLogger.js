import { randomUUID } from "crypto";
import logger from "../utils/logger.js";
import { recordRequestMetric } from "../utils/monitoringStore.js";

const getClientIp = (req) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
    return forwardedFor.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "unknown";
};

const getSlowRequestThreshold = () => {
  const raw = Number(process.env.SLOW_REQUEST_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 1200;
};

const sanitizePathForLogging = (pathValue) => {
  const hiddenAdminPath = process.env.ADMIN_AUTH_BASE_PATH;

  if (hiddenAdminPath && pathValue.startsWith(hiddenAdminPath)) {
    return "/hidden-admin-auth/**";
  }

  return pathValue;
};

export const attachRequestId = (req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
};

export const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const slowRequestThreshold = getSlowRequestThreshold();

  const baseMeta = {
    requestId: req.requestId,
    method: req.method,
    path: sanitizePathForLogging(req.originalUrl),
    ip: getClientIp(req),
    userAgent: req.get("user-agent"),
  };

  logger.http("Request started", baseMeta);

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const statusCode = res.statusCode;
    const isSlow = durationMs >= slowRequestThreshold;

    const finalMeta = {
      ...baseMeta,
      statusCode,
      durationMs,
      userId: req.user?.id || null,
      role: req.user?.role || null,
      responseBytes: Number(res.getHeader("content-length")) || 0,
    };

    recordRequestMetric({ statusCode, durationMs, isSlow });

    if (statusCode >= 500) {
      logger.error("Request completed with server error", finalMeta);
    } else if (statusCode >= 400) {
      logger.warn("Request completed with client error", finalMeta);
    } else {
      logger.http("Request completed", finalMeta);
    }

    if (isSlow) {
      logger.warn("Slow request detected", {
        requestId: req.requestId,
        method: req.method,
        path: sanitizePathForLogging(req.originalUrl),
        durationMs,
        thresholdMs: slowRequestThreshold,
      });
    }
  });

  next();
};
