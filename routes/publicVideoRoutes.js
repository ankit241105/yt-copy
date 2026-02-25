import express from "express";
import {
  getHomeFeed,
  getPublicVideoById,
  getUpNextVideos,
  incrementVideoView,
  searchPublicVideos,
} from "../controllers/publicVideoController.js";

const router = express.Router();

router.get("/home", getHomeFeed);
router.get("/search", searchPublicVideos);
router.get("/:videoId/up-next", getUpNextVideos);
router.post("/:videoId/view", incrementVideoView);
router.get("/:videoId", getPublicVideoById);

export default router;
