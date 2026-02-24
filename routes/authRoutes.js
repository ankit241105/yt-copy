import express from "express";
import {
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
} from "../controllers/authController.js";
import {
  requireAuth,
  requireUserRole,
} from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get("/me", requireAuth, getCurrentUser);
router.get("/user/me", requireAuth, requireUserRole, getCurrentUser);

export default router;
