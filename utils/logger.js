import fs from "fs";
import path from "path";

const LEVEL_PRIORITY = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const LOGS_DIR = path.join(process.cwd(), "logs");
let logDirectoryReady = false;

const serializeError = (value) => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
};

const sanitizeMeta = (meta = {}) => {
  if (!meta || typeof meta !== "object") {
    return {};
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(meta)) {
    sanitized[key] = serializeError(value);
  }

  return sanitized;
};

const getConfig = () => {
  const levelFromEnv = (process.env.LOG_LEVEL || "info").toLowerCase();
  const activeLevel = Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, levelFromEnv)
    ? levelFromEnv
    : "info";

  const shouldLogToFile = (process.env.LOG_TO_FILE || "true").toLowerCase() !== "false";

  return {
    activeLevel,
    shouldLogToFile,
  };
};

const shouldLog = (level, activeLevel) => {
  return LEVEL_PRIORITY[level] <= LEVEL_PRIORITY[activeLevel];
};

const ensureLogDirectory = (shouldLogToFile) => {
  if (!shouldLogToFile || logDirectoryReady) {
    return;
  }

  fs.mkdirSync(LOGS_DIR, { recursive: true });
  logDirectoryReady = true;
};

const appendToFile = (filename, content, shouldLogToFile) => {
  if (!shouldLogToFile) {
    return;
  }

  ensureLogDirectory(shouldLogToFile);

  const filePath = path.join(LOGS_DIR, filename);
  fs.appendFile(filePath, `${content}\n`, (error) => {
    if (error) {
      console.error("[logger] Failed to write log file:", error.message);
    }
  });
};

const writeConsole = (level, message) => {
  if (level === "error") {
    console.error(message);
    return;
  }

  if (level === "warn") {
    console.warn(message);
    return;
  }

  console.log(message);
};

const log = (level, message, meta = {}) => {
  const { activeLevel, shouldLogToFile } = getConfig();

  if (!shouldLog(level, activeLevel)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "yt-backend",
    ...sanitizeMeta(meta),
  };

  const line = JSON.stringify(entry);
  writeConsole(level, line);

  appendToFile("app.log", line, shouldLogToFile);

  if (level === "error") {
    appendToFile("error.log", line, shouldLogToFile);
  }

  if (level === "http") {
    appendToFile("http.log", line, shouldLogToFile);
  }
};

const logger = {
  error: (message, meta) => log("error", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  info: (message, meta) => log("info", message, meta),
  http: (message, meta) => log("http", message, meta),
  debug: (message, meta) => log("debug", message, meta),
};

export default logger;
