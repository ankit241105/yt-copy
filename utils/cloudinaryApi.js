import crypto from "crypto";
import { openAsBlob } from "node:fs";
import AppError from "./AppError.js";

const CLOUDINARY_TIMEOUT_MS = Number(process.env.CLOUDINARY_TIMEOUT_MS) || 120000;

export const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const videoFolder = process.env.CLOUDINARY_VIDEO_FOLDER || "yt/videos";
  const thumbnailFolder = process.env.CLOUDINARY_THUMBNAIL_FOLDER || "yt/thumbnails";

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(500, "Cloudinary is not configured. Missing cloud name, key or secret.");
  }

  return {
    cloudName,
    apiKey,
    apiSecret,
    videoFolder,
    thumbnailFolder,
  };
};

const buildSignature = (params, apiSecret) => {
  const paramString = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return crypto.createHash("sha1").update(`${paramString}${apiSecret}`).digest("hex");
};

const parseCloudinaryError = async (response) => {
  let responseBody = null;

  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  return (
    responseBody?.error?.message ||
    responseBody?.message ||
    `Cloudinary request failed with status ${response.status}.`
  );
};

export const uploadFileToCloudinary = async ({
  filePath,
  resourceType,
  folder,
  publicId,
  apiConfig,
}) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    folder,
    public_id: publicId,
    timestamp,
  };

  const signature = buildSignature(paramsToSign, apiConfig.apiSecret);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${apiConfig.cloudName}/${resourceType}/upload`;
  const fileBlob = await openAsBlob(filePath);
  const formData = new FormData();

  formData.append("file", fileBlob);
  formData.append("api_key", apiConfig.apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("folder", folder);
  formData.append("public_id", publicId);
  formData.append("signature", signature);

  const response = await fetch(uploadUrl, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const message = await parseCloudinaryError(response);
    throw new AppError(502, message);
  }

  return response.json();
};

export const destroyCloudinaryAsset = async ({
  publicId,
  resourceType,
  apiConfig,
}) => {
  if (!publicId) {
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const paramsToSign = {
    public_id: publicId,
    timestamp,
  };

  const signature = buildSignature(paramsToSign, apiConfig.apiSecret);
  const destroyUrl = `https://api.cloudinary.com/v1_1/${apiConfig.cloudName}/${resourceType}/destroy`;
  const formData = new FormData();

  formData.append("public_id", publicId);
  formData.append("api_key", apiConfig.apiKey);
  formData.append("timestamp", String(timestamp));
  formData.append("signature", signature);

  const response = await fetch(destroyUrl, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(CLOUDINARY_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Failed to delete Cloudinary asset: ${publicId}`);
  }
};

export const buildFirstFrameThumbnailUrl = ({ cloudName, videoPublicId }) => {
  return `https://res.cloudinary.com/${cloudName}/video/upload/so_0/${videoPublicId}.jpg`;
};
