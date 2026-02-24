import AppError from "../utils/AppError.js";

export const requireAdminRouteKey = (req, _res, next) => {
  const adminRouteKey = process.env.ADMIN_ROUTE_KEY;

  if (!adminRouteKey) {
    return next(new AppError(500, "Admin route configuration is missing."));
  }

  const incomingKey = req.get("x-admin-route-key");

  if (!incomingKey || incomingKey !== adminRouteKey) {
    return next(new AppError(404, "Route not found."));
  }

  next();
};
