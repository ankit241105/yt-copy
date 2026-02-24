import express from "express";
import { getHealth, getMetrics } from "../controllers/monitoringController.js";
import { requireAuth, requireSuperAdmin } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.get("/health", getHealth);
router.get("/metrics", requireAuth, requireSuperAdmin, getMetrics);

export default router;
