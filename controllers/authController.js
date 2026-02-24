import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import {
  clearAuthCookie,
  sanitizeUser,
  setAuthCookie,
  signAuthToken,
} from "../utils/authToken.js";

const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  MINI_ADMIN: "MINI_ADMIN",
  USER: "USER",
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateEmail = (value) => {
  return emailRegex.test(value);
};

const validatePassword = (value) => {
  if (typeof value !== "string") {
    return "Password is required.";
  }

  if (value.length < 8) {
    return "Password must be at least 8 characters long.";
  }

  return null;
};

const parseCredentials = (req) => {
  return {
    email: req.body?.email?.trim().toLowerCase(),
    password: req.body?.password,
  };
};

const loginWithRoleRules = async ({
  req,
  res,
  next,
  allowedRoles,
  roleErrorMessage,
  successMessage,
}) => {
  const { email, password } = parseCredentials(req);

  if (!email || !password) {
    return next(new AppError(400, "Email and password are required."));
  }

  if (!validateEmail(email)) {
    return next(new AppError(400, "Please provide a valid email address."));
  }

  const user = await User.findOne({ email });
  if (!user) {
    return next(new AppError(401, "Invalid email or password."));
  }

  if (!user.isActive) {
    return next(new AppError(403, "Account is inactive. Contact support."));
  }

  if (!allowedRoles.includes(user.role)) {
    return next(new AppError(403, roleErrorMessage));
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    return next(new AppError(401, "Invalid email or password."));
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = signAuthToken({ id: user._id.toString(), role: user.role });
  setAuthCookie(res, token);

  return res.status(200).json({
    success: true,
    message: successMessage,
    user: sanitizeUser(user),
  });
};

export const registerUser = asyncHandler(async (req, res, next) => {
  const name = req.body?.name?.trim();
  const email = req.body?.email?.trim().toLowerCase();
  const password = req.body?.password;

  if (!name) {
    return next(new AppError(400, "Name is required."));
  }

  if (!email) {
    return next(new AppError(400, "Email is required."));
  }

  if (!validateEmail(email)) {
    return next(new AppError(400, "Please provide a valid email address."));
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return next(new AppError(400, passwordError));
  }

  if (req.body?.role && req.body.role !== "USER") {
    return next(new AppError(403, "Role assignment is not allowed in registration."));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError(409, "Email is already registered."));
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: "USER",
  });

  const token = signAuthToken({ id: user._id.toString(), role: user.role });
  setAuthCookie(res, token);

  res.status(201).json({
    success: true,
    message: "Registration successful.",
    user: sanitizeUser(user),
  });
}, "registerUser");

export const loginUser = asyncHandler(async (req, res, next) => {
  return loginWithRoleRules({
    req,
    res,
    next,
    allowedRoles: [USER_ROLES.USER],
    roleErrorMessage: "This route is for regular users only.",
    successMessage: "Login successful.",
  });
}, "loginUser");

export const loginSuperAdmin = asyncHandler(async (req, res, next) => {
  return loginWithRoleRules({
    req,
    res,
    next,
    allowedRoles: [USER_ROLES.SUPER_ADMIN],
    roleErrorMessage: "Super admin access required.",
    successMessage: "Super admin login successful.",
  });
}, "loginSuperAdmin");

export const loginMiniAdmin = asyncHandler(async (req, res, next) => {
  return loginWithRoleRules({
    req,
    res,
    next,
    allowedRoles: [USER_ROLES.MINI_ADMIN],
    roleErrorMessage: "Mini admin access required.",
    successMessage: "Mini admin login successful.",
  });
}, "loginMiniAdmin");

export const logoutUser = asyncHandler(async (_req, res) => {
  clearAuthCookie(res);

  res.status(200).json({
    success: true,
    message: "Logout successful.",
  });
}, "logoutUser");

export const getCurrentUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id);

  if (!user || !user.isActive) {
    return next(new AppError(401, "Invalid session. Please login again."));
  }

  res.status(200).json({
    success: true,
    user: sanitizeUser(user),
  });
}, "getCurrentUser");
