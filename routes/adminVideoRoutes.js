import express from "express";
import {
  getAdminUploadStatus,
  uploadVideoByAdmin,
} from "../controllers/adminVideoController.js";
import { requireAuth, requireMiniOrSuperAdmin } from "../middlewares/authMiddleware.js";
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
router.get("/videos/upload-status/:uploadId", requireAuth, requireMiniOrSuperAdmin, getAdminUploadStatus);

export default router;
