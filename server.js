import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import connectDB from "./config/connectDB.js";
import authRoutes from "./routes/authRoutes.js";
import adminAuthRoutes from "./routes/adminAuthRoutes.js";
import adminVideoRoutes from "./routes/adminVideoRoutes.js";
import monitoringRoutes from "./routes/monitoringRoutes.js";
import { errorHandler, notFound } from "./middlewares/errorHandler.js";
import { attachRequestId, requestLogger } from "./middlewares/requestLogger.js";
import logger from "./utils/logger.js";

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const ADMIN_AUTH_BASE_PATH =
  process.env.ADMIN_AUTH_BASE_PATH || "/api/secure-admin-auth-portal-7f31";
const TRUST_PROXY = (process.env.TRUST_PROXY || "true").toLowerCase() === "true";

if (TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(attachRequestId);
app.use(requestLogger);

app.use(
  cors({
    origin: CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api/auth", authRoutes);
app.use(ADMIN_AUTH_BASE_PATH, adminAuthRoutes);
app.use(ADMIN_AUTH_BASE_PATH, adminVideoRoutes);
app.use("/api/monitoring", monitoringRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  logger.info("Server started", {
    port: Number(PORT),
    environment: process.env.NODE_ENV || "development",
  });
});

server.on("error", (error) => {
  logger.error("Server failed to start", { error });
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", {
    reason: reason instanceof Error ? reason : String(reason),
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  process.exit(1);
});
