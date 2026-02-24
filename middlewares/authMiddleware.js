import jwt from "jsonwebtoken";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { AUTH_COOKIE_NAME } from "../utils/authToken.js";

export const USER_ROLES = Object.freeze({
  SUPER_ADMIN: "SUPER_ADMIN",
  MINI_ADMIN: "MINI_ADMIN",
  USER: "USER",
});

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[AUTH_COOKIE_NAME];

  if (!token) {
    return next(new AppError(401, "Authentication required."));
  }

  if (!process.env.JWT_SECRET) {
    return next(new AppError(500, "JWT configuration is missing."));
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.id);

  if (!user || !user.isActive) {
    return next(new AppError(401, "Invalid session. Please login again."));
  }

  req.user = {
    id: user._id.toString(),
    role: user.role,
  };

  next();
});

export const requireRoles = (...roles) => {
  return (req, _res, next) => {
    if (!roles.length) {
      return next(new AppError(500, "Role middleware misconfigured."));
    }

    if (!req.user) {
      return next(new AppError(401, "Authentication required."));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(403, "You are not allowed to access this resource."));
    }

    next();
  };
};

export const requireSuperAdmin = requireRoles(USER_ROLES.SUPER_ADMIN);
export const requireMiniOrSuperAdmin = requireRoles(
  USER_ROLES.MINI_ADMIN,
  USER_ROLES.SUPER_ADMIN
);
export const requireUserRole = requireRoles(USER_ROLES.USER);
