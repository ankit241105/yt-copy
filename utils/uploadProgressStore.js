const uploads = new Map();

const DEFAULT_TTL_MS = Number(process.env.UPLOAD_STATUS_TTL_MS) || 30 * 60 * 1000;

const computeEta = (startedAt, progressPercent) => {
  if (!progressPercent || progressPercent <= 0 || progressPercent >= 100) {
    return progressPercent >= 100 ? 0 : null;
  }

  const elapsedMs = Date.now() - startedAt;
  const estimatedTotalMs = (elapsedMs / progressPercent) * 100;
  const remainingMs = Math.max(0, estimatedTotalMs - elapsedMs);

  return Math.ceil(remainingMs / 1000);
};

export const initializeUploadStatus = ({ uploadId, userId, fileBytes = 0 }) => {
  const startedAt = Date.now();
  uploads.set(uploadId, {
    uploadId,
    userId,
    status: "PROCESSING",
    progressPercent: 0,
    stage: "initialized",
    message: "Upload initialized.",
    fileBytes,
    estimatedSecondsLeft: null,
    createdAt: new Date(startedAt).toISOString(),
    updatedAt: new Date(startedAt).toISOString(),
    expiresAt: startedAt + DEFAULT_TTL_MS,
    result: null,
    error: null,
  });
};

export const updateUploadStatus = ({ uploadId, progressPercent, stage, message, extra = {} }) => {
  const existing = uploads.get(uploadId);
  if (!existing) {
    return;
  }

  const nextProgress = Math.max(0, Math.min(100, progressPercent));
  const now = Date.now();

  uploads.set(uploadId, {
    ...existing,
    ...extra,
    progressPercent: nextProgress,
    stage: stage || existing.stage,
    message: message || existing.message,
    estimatedSecondsLeft: computeEta(new Date(existing.createdAt).getTime(), nextProgress),
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
  });
};

export const markUploadCompleted = ({ uploadId, result }) => {
  const existing = uploads.get(uploadId);
  if (!existing) {
    return;
  }

  const now = Date.now();

  uploads.set(uploadId, {
    ...existing,
    status: "COMPLETED",
    progressPercent: 100,
    stage: "completed",
    message: "Upload completed.",
    estimatedSecondsLeft: 0,
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
    result,
    error: null,
  });
};

export const markUploadFailed = ({ uploadId, message, error }) => {
  const existing = uploads.get(uploadId);
  if (!existing) {
    return;
  }

  const now = Date.now();

  uploads.set(uploadId, {
    ...existing,
    status: "FAILED",
    stage: "failed",
    message: message || "Upload failed.",
    updatedAt: new Date(now).toISOString(),
    expiresAt: now + DEFAULT_TTL_MS,
    error: error || null,
  });
};

export const getUploadStatus = (uploadId) => {
  const current = uploads.get(uploadId);
  if (!current) {
    return null;
  }

  if (Date.now() > current.expiresAt) {
    uploads.delete(uploadId);
    return null;
  }

  return current;
};

export const cleanupExpiredUploadStatuses = () => {
  const now = Date.now();
  for (const [uploadId, value] of uploads.entries()) {
    if (now > value.expiresAt) {
      uploads.delete(uploadId);
    }
  }
};
