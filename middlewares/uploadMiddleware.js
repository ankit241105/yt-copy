import fs from "fs";
import path from "path";
import multer from "multer";
import AppError from "../utils/AppError.js";

const removeFileIfExists = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
};

const VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

const THUMBNAIL_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

const getUploadLimits = () => {
  const maxVideoSizeMb = Number(process.env.MAX_VIDEO_SIZE_MB) || 500;
  const maxThumbnailSizeMb = Number(process.env.MAX_THUMBNAIL_SIZE_MB) || 10;
  const fileSize = Math.max(maxVideoSizeMb, maxThumbnailSizeMb) * 1024 * 1024;

  return {
    maxVideoSizeBytes: maxVideoSizeMb * 1024 * 1024,
    maxThumbnailSizeBytes: maxThumbnailSizeMb * 1024 * 1024,
    fileSize,
  };
};

const tempDirectoryPath =
  process.env.TEMP_UPLOAD_DIR || path.join(process.cwd(), "storage", "tmp-uploads");

fs.mkdirSync(tempDirectoryPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, tempDirectoryPath);
  },
  filename: (_req, file, callback) => {
    const safeName = file.originalname.replace(/[^\w.\-]/g, "_");
    callback(null, `${Date.now()}-${safeName}`);
  },
});

const fileFilter = (req, file, callback) => {
  if (file.fieldname === "video") {
    if (!VIDEO_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new AppError(
          400,
          "Invalid video format. Allowed: mp4, webm, mov, mkv.",
          { mimetype: file.mimetype }
        )
      );
    }
    return callback(null, true);
  }

  if (file.fieldname === "thumbnail") {
    if (!THUMBNAIL_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new AppError(
          400,
          "Invalid thumbnail format. Allowed: jpg, png, webp.",
          { mimetype: file.mimetype }
        )
      );
    }
    return callback(null, true);
  }

  return callback(new AppError(400, `Unexpected file field: ${file.fieldname}`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: getUploadLimits(),
});

export const handleVideoUploadMultipart = upload.fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

export const validateUploadFileSizes = (req, _res, next) => {
  const { maxVideoSizeBytes, maxThumbnailSizeBytes } = getUploadLimits();
  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  if (videoFile && videoFile.size > maxVideoSizeBytes) {
    Promise.all([removeFileIfExists(videoFile.path), removeFileIfExists(thumbnailFile?.path)])
      .then(() => {
        next(
          new AppError(
            413,
            `Video exceeds max limit of ${Math.round(maxVideoSizeBytes / 1024 / 1024)}MB.`
          )
        );
      })
      .catch(next);
    return;
  }

  if (thumbnailFile && thumbnailFile.size > maxThumbnailSizeBytes) {
    Promise.all([removeFileIfExists(videoFile?.path), removeFileIfExists(thumbnailFile.path)])
      .then(() => {
        next(
          new AppError(
            413,
            `Thumbnail exceeds max limit of ${Math.round(maxThumbnailSizeBytes / 1024 / 1024)}MB.`
          )
        );
      })
      .catch(next);
    return;
  }

  next();
};

export const getUploadMimeTypes = () => {
  return {
    VIDEO_MIME_TYPES,
    THUMBNAIL_MIME_TYPES,
  };
};
