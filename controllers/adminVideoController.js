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

const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
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
      cloudinaryVideoPublicId: videoUploadResponse.public_id,
      thumbnailUrl,
      cloudinaryThumbnailPublicId: thumbnailPublicId,
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

export const listAdminVideos = asyncHandler(async (req, res, next) => {
  const { page, limit, skip } = parsePagination(req.query);
  const publishStatus = req.query?.publishStatus
    ? sanitizePublishStatus(req.query.publishStatus)
    : null;
  const search = req.query?.search ? String(req.query.search).trim() : "";

  if (req.query?.publishStatus && !publishStatus) {
    return next(new AppError(400, "Invalid publishStatus filter."));
  }

  const query = {};

  if (req.user.role === "MINI_ADMIN") {
    query.uploadedBy = req.user.id;
  }

  if (publishStatus) {
    query.publishStatus = publishStatus;
  }

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: "i" } },
      { tags: { $elemMatch: { $regex: search, $options: "i" } } },
    ];
  }

  const [videos, total] = await Promise.all([
    Video.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Video.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: videos,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}, "listAdminVideos");

export const getAdminDashboardStats = asyncHandler(async (req, res) => {
  const query = req.user.role === "MINI_ADMIN" ? { uploadedBy: req.user.id } : {};
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalVideos, publishedVideos, draftVideos, recentVideos, uploadsLast7Days, uploadsLast30Days] = await Promise.all([
    Video.countDocuments(query),
    Video.countDocuments({ ...query, publishStatus: "PUBLISHED" }),
    Video.countDocuments({ ...query, publishStatus: "DRAFT" }),
    Video.find(query, {
      title: 1,
      thumbnailUrl: 1,
      publishStatus: 1,
      uploadDate: 1,
      viewCount: 1,
    })
      .sort({ uploadDate: -1, _id: -1 })
      .limit(6)
      .lean(),
    Video.countDocuments({ ...query, uploadDate: { $gte: sevenDaysAgo } }),
    Video.countDocuments({ ...query, uploadDate: { $gte: thirtyDaysAgo } }),
  ]);

  const publishRatio = totalVideos > 0 ? Number(((publishedVideos / totalVideos) * 100).toFixed(2)) : 0;

  res.status(200).json({
    success: true,
    stats: {
      totalVideos,
      publishedVideos,
      draftVideos,
      publishRatio,
      uploadsLast7Days,
      uploadsLast30Days,
    },
    recentVideos,
  });
}, "getAdminDashboardStats");

export const updateVideoPublishStatus = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;
  const publishStatus = sanitizePublishStatus(req.body?.publishStatus);

  if (!publishStatus) {
    return next(new AppError(400, "publishStatus must be DRAFT or PUBLISHED."));
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return next(new AppError(404, "Video not found."));
  }

  if (req.user.role === "MINI_ADMIN" && video.uploadedBy.toString() !== req.user.id) {
    return next(new AppError(403, "Mini admin can update only own videos."));
  }

  video.publishStatus = publishStatus;
  await video.save();

  res.status(200).json({
    success: true,
    message: "Video publish status updated successfully.",
    video,
  });
}, "updateVideoPublishStatus");

export const updateVideoBySuperAdmin = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;
  const video = await Video.findById(videoId);

  if (!video) {
    return next(new AppError(404, "Video not found."));
  }

  const updates = {};

  if (req.body?.title !== undefined) {
    const title = String(req.body.title).trim();
    if (!title) {
      return next(new AppError(400, "Title cannot be empty."));
    }
    updates.title = title;
  }

  if (req.body?.tags !== undefined) {
    const tagsInput = req.body.tags;
    const tags = Array.isArray(tagsInput)
      ? tagsInput
      : String(tagsInput)
          .split(",")
          .map((tag) => tag.trim());

    const normalizedTags = [...new Set(tags.map((tag) => String(tag).toLowerCase()).filter(Boolean))];
    if (!normalizedTags.length) {
      return next(new AppError(400, "At least one tag is required."));
    }
    updates.tags = normalizedTags;
  }

  if (req.body?.thumbnailUrl !== undefined) {
    const thumbnailUrl = String(req.body.thumbnailUrl || "").trim();
    updates.thumbnailUrl = thumbnailUrl || null;
  }

  if (req.body?.publishStatus !== undefined) {
    const publishStatus = sanitizePublishStatus(req.body.publishStatus);
    if (!publishStatus) {
      return next(new AppError(400, "publishStatus must be DRAFT or PUBLISHED."));
    }
    updates.publishStatus = publishStatus;
  }

  if (!Object.keys(updates).length) {
    return next(new AppError(400, "No valid fields provided for update."));
  }

  Object.assign(video, updates);
  await video.save();

  res.status(200).json({
    success: true,
    message: "Video updated successfully.",
    video,
  });
}, "updateVideoBySuperAdmin");

export const deleteVideoBySuperAdmin = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;
  const video = await Video.findById(videoId);

  if (!video) {
    return next(new AppError(404, "Video not found."));
  }

  const apiConfig = getCloudinaryConfig();

  const cleanupTasks = [];
  if (video.cloudinaryVideoPublicId) {
    cleanupTasks.push(
      destroyCloudinaryAsset({
        publicId: video.cloudinaryVideoPublicId,
        resourceType: "video",
        apiConfig,
      })
    );
  }
  if (video.cloudinaryThumbnailPublicId) {
    cleanupTasks.push(
      destroyCloudinaryAsset({
        publicId: video.cloudinaryThumbnailPublicId,
        resourceType: "image",
        apiConfig,
      })
    );
  }
  await Promise.allSettled(cleanupTasks);

  await video.deleteOne();

  res.status(200).json({
    success: true,
    message: "Video deleted successfully.",
  });
}, "deleteVideoBySuperAdmin");
