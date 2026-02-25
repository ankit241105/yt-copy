import { randomUUID } from "crypto";
import fs from "fs";
import Video from "../models/Video.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import logger from "../utils/logger.js";
import {
  buildFirstFrameThumbnailUrl,
  destroyCloudinaryAsset,
  getCloudinaryConfig,
  uploadFileToCloudinary,
} from "../utils/cloudinaryApi.js";
import {
  cleanupExpiredUploadStatuses,
  getUploadStatus,
  initializeUploadStatus,
  markUploadCompleted,
  markUploadFailed,
  updateUploadStatus,
} from "../utils/uploadProgressStore.js";

const ALLOWED_PUBLISH_STATUS = new Set(["DRAFT", "PUBLISHED"]);
const ALLOWED_UPLOADER_ROLES = new Set(["SUPER_ADMIN", "MINI_ADMIN"]);

const parseTags = (rawTags) => {
  if (Array.isArray(rawTags)) {
    return [...new Set(rawTags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean))];
  }

  if (typeof rawTags === "string") {
    return [
      ...new Set(
        rawTags
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean)
      ),
    ];
  }

  return [];
};

const sanitizePublishStatus = (rawStatus) => {
  if (!rawStatus) {
    return "DRAFT";
  }

  const value = String(rawStatus).trim().toUpperCase();
  if (!ALLOWED_PUBLISH_STATUS.has(value)) {
    return null;
  }
  return value;
};

const cleanupTempFiles = async (files) => {
  const allFiles = Object.values(files || {}).flat();

  await Promise.all(
    allFiles.map(async (file) => {
      if (file?.path) {
        try {
          await fs.promises.unlink(file.path);
        } catch (error) {
          if (error.code !== "ENOENT") {
            throw error;
          }
        }
      }
    })
  );
};

export const uploadVideoByAdmin = asyncHandler(async (req, res, next) => {
  cleanupExpiredUploadStatuses();

  const uploadId = String(req.body?.uploadId || randomUUID()).trim();
  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];
  const totalBytes = (videoFile?.size || 0) + (thumbnailFile?.size || 0);

  initializeUploadStatus({
    uploadId,
    userId: req.user?.id || null,
    fileBytes: totalBytes,
  });

  updateUploadStatus({
    uploadId,
    progressPercent: 5,
    stage: "validating",
    message: "Validating upload request.",
  });

  const title = req.body?.title?.trim();
  const tags = parseTags(req.body?.tags);
  const publishStatus = sanitizePublishStatus(req.body?.publishStatus);

  let dbSaved = false;
  let videoPublicId = null;
  let thumbnailPublicId = null;
  let apiConfig = null;

  try {
    if (!title) {
      throw new AppError(400, "Title is required.");
    }

    if (tags.length === 0) {
      throw new AppError(400, "At least one tag is required.");
    }

    if (!publishStatus) {
      throw new AppError(400, "Invalid publish status. Use DRAFT or PUBLISHED.");
    }

    if (!videoFile) {
      throw new AppError(400, "Video file is required.");
    }

    if (!req.user?.role || !ALLOWED_UPLOADER_ROLES.has(req.user.role)) {
      throw new AppError(403, "Only admins can upload videos.");
    }

    apiConfig = getCloudinaryConfig();

    updateUploadStatus({
      uploadId,
      progressPercent: 12,
      stage: "validated",
      message: "Validation complete.",
    });

    updateUploadStatus({
      uploadId,
      progressPercent: 22,
      stage: "uploading_video",
      message: "Uploading video to Cloudinary.",
    });

    const videoUploadResponse = await uploadFileToCloudinary({
      filePath: videoFile.path,
      resourceType: "video",
      folder: apiConfig.videoFolder,
      publicId: `video-${uploadId}-${Date.now()}`,
      apiConfig,
    });

    videoPublicId = videoUploadResponse.public_id;

    updateUploadStatus({
      uploadId,
      progressPercent: 72,
      stage: "video_uploaded",
      message: "Video uploaded.",
      extra: {
        videoBytes: videoUploadResponse.bytes || videoFile.size,
      },
    });

    let thumbnailUrl = null;

    if (thumbnailFile) {
      updateUploadStatus({
        uploadId,
        progressPercent: 80,
        stage: "uploading_thumbnail",
        message: "Uploading custom thumbnail.",
      });

      const thumbnailUploadResponse = await uploadFileToCloudinary({
        filePath: thumbnailFile.path,
        resourceType: "image",
        folder: apiConfig.thumbnailFolder,
        publicId: `thumb-${uploadId}-${Date.now()}`,
        apiConfig,
      });

      thumbnailPublicId = thumbnailUploadResponse.public_id;
      thumbnailUrl = thumbnailUploadResponse.secure_url;
    } else {
      updateUploadStatus({
        uploadId,
        progressPercent: 84,
        stage: "thumbnail_generated",
        message: "Generating thumbnail from first frame.",
      });

      thumbnailUrl = buildFirstFrameThumbnailUrl({
        cloudName: apiConfig.cloudName,
        videoPublicId: videoUploadResponse.public_id,
      });
    }

    updateUploadStatus({
      uploadId,
      progressPercent: 92,
      stage: "saving_database",
      message: "Saving video metadata.",
    });

    const createdVideo = await Video.create({
      title,
      tags,
      videoUrl: videoUploadResponse.secure_url,
      thumbnailUrl,
      publishStatus,
      uploadedBy: req.user.id,
      uploadedByRole: req.user.role,
      uploadDate: new Date(),
    });

    dbSaved = true;
    markUploadCompleted({
      uploadId,
      result: {
        videoId: createdVideo._id.toString(),
        videoUrl: createdVideo.videoUrl,
        thumbnailUrl: createdVideo.thumbnailUrl,
      },
    });

    await cleanupTempFiles(req.files);

    res.status(201).json({
      success: true,
      message: "Video uploaded successfully.",
      uploadId,
      video: createdVideo,
    });
  } catch (error) {
    await cleanupTempFiles(req.files);

    if (!dbSaved) {
      const cleanupTasks = [];
      if (videoPublicId && apiConfig) {
        cleanupTasks.push(
          destroyCloudinaryAsset({
            publicId: videoPublicId,
            resourceType: "video",
            apiConfig,
          })
        );
      }
      if (thumbnailPublicId && apiConfig) {
        cleanupTasks.push(
          destroyCloudinaryAsset({
            publicId: thumbnailPublicId,
            resourceType: "image",
            apiConfig,
          })
        );
      }
      await Promise.allSettled(cleanupTasks);
    }

    markUploadFailed({
      uploadId,
      message: "Upload failed.",
      error: error.message,
    });

    logger.error("Admin video upload failed", {
      requestId: req.requestId || null,
      message: error.message,
      uploadId,
    });

    return next(error);
  }
}, "uploadVideoByAdmin");

export const getAdminUploadStatus = asyncHandler(async (req, res, next) => {
  cleanupExpiredUploadStatuses();

  const uploadId = req.params?.uploadId?.trim();
  if (!uploadId) {
    return next(new AppError(400, "uploadId is required."));
  }

  const status = getUploadStatus(uploadId);
  if (!status) {
    return next(new AppError(404, "Upload status not found."));
  }

  const isOwner = status.userId && status.userId === req.user.id;
  const isSuperAdmin = req.user.role === "SUPER_ADMIN";

  if (!isOwner && !isSuperAdmin) {
    return next(new AppError(403, "You cannot access this upload status."));
  }

  res.status(200).json({
    success: true,
    upload: status,
  });
}, "getAdminUploadStatus");
