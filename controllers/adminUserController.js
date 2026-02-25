import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { sanitizeUser } from "../utils/authToken.js";

const ADMIN_ROLES = new Set(["SUPER_ADMIN", "MINI_ADMIN"]);
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const parsePagination = (query) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const validateEmail = (email) => emailRegex.test(email);

const validatePassword = (password) => {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  return null;
};

export const setupFirstSuperAdmin = asyncHandler(async (req, res, next) => {
  const setupKey = req.get("x-setup-key");
  const expectedSetupKey = process.env.SUPER_ADMIN_SETUP_KEY;

  if (!expectedSetupKey) {
    return next(new AppError(500, "SUPER_ADMIN_SETUP_KEY is not configured."));
  }

  if (!setupKey || setupKey !== expectedSetupKey) {
    return next(new AppError(403, "Invalid setup key."));
  }

  const existingSuperAdmin = await User.exists({ role: "SUPER_ADMIN" });
  if (existingSuperAdmin) {
    return next(new AppError(409, "Super admin already exists."));
  }

  const name = req.body?.name?.trim();
  const email = req.body?.email?.trim().toLowerCase();
  const password = req.body?.password;

  if (!name) {
    return next(new AppError(400, "Name is required."));
  }

  if (!email || !validateEmail(email)) {
    return next(new AppError(400, "Valid email is required."));
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return next(new AppError(400, passwordError));
  }

  const duplicateUser = await User.findOne({ email });
  if (duplicateUser) {
    return next(new AppError(409, "Email is already in use."));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role: "SUPER_ADMIN",
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: "First super admin created successfully.",
    admin: sanitizeUser(user),
  });
}, "setupFirstSuperAdmin");

export const createAdminUser = asyncHandler(async (req, res, next) => {
  const name = req.body?.name?.trim();
  const email = req.body?.email?.trim().toLowerCase();
  const password = req.body?.password;
  const role = String(req.body?.role || "").trim().toUpperCase();

  if (!name) {
    return next(new AppError(400, "Name is required."));
  }

  if (!email || !validateEmail(email)) {
    return next(new AppError(400, "Valid email is required."));
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return next(new AppError(400, passwordError));
  }

  if (!ADMIN_ROLES.has(role)) {
    return next(new AppError(400, "Role must be SUPER_ADMIN or MINI_ADMIN."));
  }

  const duplicateUser = await User.findOne({ email });
  if (duplicateUser) {
    return next(new AppError(409, "Email is already in use."));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    password: hashedPassword,
    role,
    isActive: true,
  });

  res.status(201).json({
    success: true,
    message: `${role} account created successfully.`,
    admin: sanitizeUser(user),
  });
}, "createAdminUser");

export const listAdminUsers = asyncHandler(async (req, res, next) => {
  const roleFilter = req.query?.role ? String(req.query.role).trim().toUpperCase() : null;
  const activeFilter = req.query?.isActive;
  const { page, limit, skip } = parsePagination(req.query);

  if (roleFilter && !ADMIN_ROLES.has(roleFilter)) {
    return next(new AppError(400, "Invalid role filter."));
  }

  const query = {
    role: roleFilter || { $in: Array.from(ADMIN_ROLES) },
  };

  if (activeFilter !== undefined) {
    if (activeFilter !== "true" && activeFilter !== "false") {
      return next(new AppError(400, "isActive must be true or false."));
    }
    query.isActive = activeFilter === "true";
  }

  const [admins, total] = await Promise.all([
    User.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select("-password"),
    User.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    data: admins.map((admin) => sanitizeUser(admin)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}, "listAdminUsers");

export const updateAdminStatus = asyncHandler(async (req, res, next) => {
  const { adminId } = req.params;
  const { isActive } = req.body || {};

  if (typeof isActive !== "boolean") {
    return next(new AppError(400, "isActive must be a boolean."));
  }

  const admin = await User.findOne({
    _id: adminId,
    role: { $in: Array.from(ADMIN_ROLES) },
  });

  if (!admin) {
    return next(new AppError(404, "Admin user not found."));
  }

  if (!isActive && admin._id.toString() === req.user.id) {
    return next(new AppError(400, "You cannot deactivate your own account."));
  }

  if (!isActive && admin.role === "SUPER_ADMIN") {
    const activeSuperAdminCount = await User.countDocuments({
      role: "SUPER_ADMIN",
      isActive: true,
    });

    if (activeSuperAdminCount <= 1) {
      return next(new AppError(400, "At least one active super admin is required."));
    }
  }

  admin.isActive = isActive;
  await admin.save();

  res.status(200).json({
    success: true,
    message: "Admin status updated successfully.",
    admin: sanitizeUser(admin),
  });
}, "updateAdminStatus");
