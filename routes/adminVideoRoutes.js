import express from "express";
import {
  getAdminUploadStatus,
  getAdminDashboardStats,
  listAdminVideos,
  updateVideoPublishStatus,
  updateVideoBySuperAdmin,
  deleteVideoBySuperAdmin,
  uploadVideoByAdmin,
} from "../controllers/adminVideoController.js";
import {
  requireAuth,
  requireMiniOrSuperAdmin,
  requireSuperAdmin,
} from "../middlewares/authMiddleware.js";
import { requireAdminRouteKey } from "../middlewares/adminRouteGuard.js";
import {
  handleVideoUploadMultipart,
  validateUploadFileSizes,
} from "../middlewares/uploadMiddleware.js";

const router = express.Router();

router.use(requireAdminRouteKey);

router.post(
  "/videos/upload",
  requireAuth,
  requireMiniOrSuperAdmin,
  handleVideoUploadMultipart,
  validateUploadFileSizes,
  uploadVideoByAdmin
);
router.get(
  "/videos/upload-status/:uploadId",
  requireAuth,
  requireMiniOrSuperAdmin,
  getAdminUploadStatus
);
router.get("/videos", requireAuth, requireMiniOrSuperAdmin, listAdminVideos);
router.get("/dashboard/stats", requireAuth, requireMiniOrSuperAdmin, getAdminDashboardStats);
router.patch(
  "/videos/:videoId/publish-status",
  requireAuth,
  requireMiniOrSuperAdmin,
  updateVideoPublishStatus
);
router.patch("/videos/:videoId", requireAuth, requireSuperAdmin, updateVideoBySuperAdmin);
router.delete("/videos/:videoId", requireAuth, requireSuperAdmin, deleteVideoBySuperAdmin);

export default router;
