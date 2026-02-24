import mongoose from "mongoose";
import asyncHandler from "../utils/asyncHandler.js";
import { getMonitoringSnapshot } from "../utils/monitoringStore.js";

const dbStateMap = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
};

export const getHealth = asyncHandler(async (_req, res) => {
  const state = mongoose.connection.readyState;

  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Number(process.uptime().toFixed(2)),
    environment: process.env.NODE_ENV || "development",
    database: {
      state: dbStateMap[state] || "unknown",
    },
  });
}, "getHealth");

export const getMetrics = asyncHandler(async (_req, res) => {
  res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    process: {
      pid: process.pid,
      uptimeSeconds: Number(process.uptime().toFixed(2)),
      memory: process.memoryUsage(),
    },
    app: getMonitoringSnapshot(),
  });
}, "getMetrics");
