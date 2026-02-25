import Video from "../models/Video.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MIN_KEYWORD_LENGTH = 3;

const parseLimit = (rawLimit, fallback = DEFAULT_LIMIT) => {
  const parsed = Number(rawLimit) || fallback;
  return Math.min(MAX_LIMIT, Math.max(1, parsed));
};

const parsePage = (rawPage) => {
  const parsed = Number(rawPage) || 1;
  return Math.max(1, parsed);
};

const normalizeText = (value) => String(value || "").trim();

const pickPublicVideoFields = {
  title: 1,
  tags: 1,
  videoUrl: 1,
  thumbnailUrl: 1,
  uploadDate: 1,
  publishStatus: 1,
  uploadedByRole: 1,
  viewCount: 1,
  createdAt: 1,
  updatedAt: 1,
};

const getTitleKeywords = (title) => {
  return [
    ...new Set(
      normalizeText(title)
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((word) => word.trim())
        .filter((word) => word.length >= MIN_KEYWORD_LENGTH)
    ),
  ].slice(0, 8);
};

const basePublishedQuery = {
  publishStatus: "PUBLISHED",
};

const encodeCursor = (video) => {
  const payload = `${new Date(video.uploadDate).toISOString()}|${video._id.toString()}`;
  return Buffer.from(payload, "utf8").toString("base64url");
};

const decodeCursor = (cursor) => {
  try {
    const decoded = Buffer.from(String(cursor), "base64url").toString("utf8");
    const [dateIso, id] = decoded.split("|");
    if (!dateIso || !id) {
      return null;
    }
    const date = new Date(dateIso);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return { date, id };
  } catch {
    return null;
  }
};

export const getHomeFeed = asyncHandler(async (req, res) => {
  const page = parsePage(req.query?.page);
  const limit = parseLimit(req.query?.limit, DEFAULT_LIMIT);
  const skip = (page - 1) * limit;
  const cursor = normalizeText(req.query?.cursor);
  const sortBy = normalizeText(req.query?.sortBy || "latest").toLowerCase();
  const tag = normalizeText(req.query?.tag).toLowerCase();
  const useCursor = Boolean(cursor);

  const query = { ...basePublishedQuery };
  if (tag) {
    query.tags = tag;
  }

  if (useCursor && sortBy === "latest") {
    const parsed = decodeCursor(cursor);
    if (parsed) {
      query.$or = [
        { uploadDate: { $lt: parsed.date } },
        { uploadDate: parsed.date, _id: { $lt: parsed.id } },
      ];
    }
  }

  const sort =
    sortBy === "trending"
      ? { viewCount: -1, uploadDate: -1, _id: -1 }
      : { uploadDate: -1, _id: -1 };

  const videos = useCursor
    ? await Video.find(query, pickPublicVideoFields).sort(sort).limit(limit).lean()
    : await Video.find(query, pickPublicVideoFields).sort(sort).skip(skip).limit(limit).lean();

  let total = null;
  let totalPages = null;
  let hasMore = false;

  if (useCursor) {
    hasMore = videos.length === limit;
  } else {
    total = await Video.countDocuments(query);
    totalPages = Math.max(1, Math.ceil(total / limit));
    hasMore = skip + videos.length < total;
  }

  const nextCursor =
    useCursor && videos.length > 0 && sortBy === "latest"
      ? encodeCursor(videos[videos.length - 1])
      : null;

  res.status(200).json({
    success: true,
    feed: videos,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore,
      nextCursor,
      mode: useCursor ? "cursor" : "page",
    },
  });
}, "getHomeFeed");

export const searchPublicVideos = asyncHandler(async (req, res, next) => {
  const q = normalizeText(req.query?.q);
  const page = parsePage(req.query?.page);
  const limit = parseLimit(req.query?.limit, DEFAULT_LIMIT);
  const skip = (page - 1) * limit;

  if (!q) {
    return next(new AppError(400, "Search query 'q' is required."));
  }

  const query = {
    ...basePublishedQuery,
    $or: [
      { title: { $regex: q, $options: "i" } },
      { tags: { $elemMatch: { $regex: q, $options: "i" } } },
    ],
  };

  const [videos, total] = await Promise.all([
    Video.find(query, pickPublicVideoFields)
      .sort({ viewCount: -1, uploadDate: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Video.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    query: q,
    results: videos,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: skip + videos.length < total,
    },
  });
}, "searchPublicVideos");

export const getPublicVideoById = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;
  const video = await Video.findOne(
    {
      _id: videoId,
      ...basePublishedQuery,
    },
    pickPublicVideoFields
  ).lean();

  if (!video) {
    return next(new AppError(404, "Video not found."));
  }

  const frontendBaseUrl = normalizeText(process.env.FRONTEND_BASE_URL || "");
  const shareUrl = frontendBaseUrl ? `${frontendBaseUrl}/watch/${video._id}` : null;

  res.status(200).json({
    success: true,
    video,
    shareUrl,
  });
}, "getPublicVideoById");

export const getUpNextVideos = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;
  const limit = parseLimit(req.query?.limit, 10);

  const currentVideo = await Video.findOne({
    _id: videoId,
    ...basePublishedQuery,
  }).lean();

  if (!currentVideo) {
    return next(new AppError(404, "Video not found."));
  }

  const upNext = [];
  const pushedIds = new Set([currentVideo._id.toString()]);

  const pushUniqueVideos = (videos) => {
    for (const video of videos) {
      const id = video._id.toString();
      if (!pushedIds.has(id) && upNext.length < limit) {
        pushedIds.add(id);
        upNext.push(video);
      }
    }
  };

  if (currentVideo.tags?.length) {
    const byTags = await Video.find(
      {
        ...basePublishedQuery,
        _id: { $ne: currentVideo._id },
        tags: { $in: currentVideo.tags },
      },
      pickPublicVideoFields
    )
      .sort({ uploadDate: -1, _id: -1 })
      .limit(limit)
      .lean();

    pushUniqueVideos(byTags);
  }

  if (upNext.length < limit) {
    const keywords = getTitleKeywords(currentVideo.title);

    if (keywords.length) {
      const byTitleKeywords = await Video.find(
        {
          ...basePublishedQuery,
          _id: { $nin: Array.from(pushedIds) },
          $or: keywords.map((keyword) => ({
            title: { $regex: keyword, $options: "i" },
          })),
        },
        pickPublicVideoFields
      )
        .sort({ uploadDate: -1, _id: -1 })
        .limit(limit - upNext.length)
        .lean();

      pushUniqueVideos(byTitleKeywords);
    }
  }

  if (upNext.length < limit) {
    const recentFallback = await Video.find(
      {
        ...basePublishedQuery,
        _id: { $nin: Array.from(pushedIds) },
      },
      pickPublicVideoFields
    )
      .sort({ uploadDate: -1, _id: -1 })
      .limit(limit - upNext.length)
      .lean();

    pushUniqueVideos(recentFallback);
  }

  if (upNext.length < limit) {
    const trendingFallback = await Video.find(
      {
        ...basePublishedQuery,
        _id: { $nin: Array.from(pushedIds) },
      },
      pickPublicVideoFields
    )
      .sort({ viewCount: -1, uploadDate: -1, _id: -1 })
      .limit(limit - upNext.length)
      .lean();

    pushUniqueVideos(trendingFallback);
  }

  res.status(200).json({
    success: true,
    baseVideoId: videoId,
    upNext,
  });
}, "getUpNextVideos");

export const incrementVideoView = asyncHandler(async (req, res, next) => {
  const { videoId } = req.params;

  const updated = await Video.findOneAndUpdate(
    {
      _id: videoId,
      ...basePublishedQuery,
    },
    {
      $inc: { viewCount: 1 },
    },
    {
      new: true,
      projection: { _id: 1, viewCount: 1 },
    }
  );

  if (!updated) {
    return next(new AppError(404, "Video not found."));
  }

  res.status(200).json({
    success: true,
    videoId: updated._id,
    viewCount: updated.viewCount,
  });
}, "incrementVideoView");
