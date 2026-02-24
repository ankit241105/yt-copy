import express from "express";
import {
  getCurrentUser,
  loginMiniAdmin,
  loginSuperAdmin,
  logoutUser,
} from "../controllers/authController.js";
import {
  requireAuth,
  requireMiniOrSuperAdmin,
  requireSuperAdmin,
} from "../middlewares/authMiddleware.js";
import { requireAdminRouteKey } from "../middlewares/adminRouteGuard.js";

const router = express.Router();

router.use(requireAdminRouteKey);

router.post("/login/super", loginSuperAdmin);
router.post("/login/mini", loginMiniAdmin);
router.post("/logout", requireAuth, requireMiniOrSuperAdmin, logoutUser);
router.get("/me/super", requireAuth, requireSuperAdmin, getCurrentUser);
router.get("/me/mini", requireAuth, requireMiniOrSuperAdmin, getCurrentUser);

export default router;
