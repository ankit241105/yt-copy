import jwt from "jsonwebtoken";

export const AUTH_COOKIE_NAME = "yt_auth_token";

const getCookieMaxAge = () => {
  const raw = Number(process.env.JWT_COOKIE_MAX_AGE_MS);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return 7 * 24 * 60 * 60 * 1000;
};

export const getAuthCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: getCookieMaxAge(),
    path: "/",
  };
};

export const signAuthToken = (payload) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured.");
  }

  const expiresIn = process.env.JWT_EXPIRES_IN || "7d";
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

export const setAuthCookie = (res, token) => {
  res.cookie(AUTH_COOKIE_NAME, token, getAuthCookieOptions());
};

export const clearAuthCookie = (res) => {
  const options = getAuthCookieOptions();
  delete options.maxAge;
  res.clearCookie(AUTH_COOKIE_NAME, options);
};

export const sanitizeUser = (userDoc) => {
  const user = userDoc?.toObject ? userDoc.toObject() : { ...userDoc };
  delete user.password;
  return user;
};
