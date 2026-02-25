import express from "express";
import {
  getHomeFeed,
  getPublicVideoById,
  getUpNextVideos,
  incrementVideoView,
  searchPublicVideos,
} from "../controllers/publicVideoController.js";
import {
  cachePublicDetail,
  cachePublicFeed,
  cachePublicSearch,
} from "../middlewares/cacheHeaders.js";

const router = express.Router();

router.get("/home", cachePublicFeed, getHomeFeed);
router.get("/search", cachePublicSearch, searchPublicVideos);
router.get("/:videoId/up-next", cachePublicFeed, getUpNextVideos);
router.post("/:videoId/view", incrementVideoView);
router.get("/:videoId", cachePublicDetail, getPublicVideoById);

export default router;
