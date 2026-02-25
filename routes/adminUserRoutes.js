import express from "express";
import {
  createAdminUser,
  listAdminUsers,
  setupFirstSuperAdmin,
  updateAdminStatus,
} from "../controllers/adminUserController.js";
import { requireAdminRouteKey } from "../middlewares/adminRouteGuard.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(requireAdminRouteKey);

router.post("/setup/super-admin", setupFirstSuperAdmin);
router.post("/admins", requireAuth, requireSuperAdmin, createAdminUser);
router.get("/admins", requireAuth, requireSuperAdmin, listAdminUsers);
router.patch("/admins/:adminId/status", requireAuth, requireSuperAdmin, updateAdminStatus);

export default router;
