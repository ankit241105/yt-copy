import logger from "./logger.js";
import { recordControllerMetric } from "./monitoringStore.js";

const asyncHandler = (fn, controllerName = fn.name || "anonymousController") => {
  return (req, res, next) => {
    const startTime = Date.now();
    let errorLogged = false;

    const wrappedNext = (error) => {
      if (error) {
        errorLogged = true;
        const durationMs = Date.now() - startTime;

        recordControllerMetric({ controllerName, durationMs, hasError: true });
        logger.error("Controller failed", {
          requestId: req.requestId || null,
          controller: controllerName,
          durationMs,
          message: error.message,
        });
      }

      return next(error);
    };

    Promise.resolve(fn(req, res, wrappedNext))
      .then(() => {
        if (!errorLogged) {
          const durationMs = Date.now() - startTime;

          recordControllerMetric({ controllerName, durationMs, hasError: false });
          logger.info("Controller completed", {
            requestId: req.requestId || null,
            controller: controllerName,
            durationMs,
            statusCode: res.statusCode,
          });
        }
      })
      .catch((error) => {
        if (!errorLogged) {
          const durationMs = Date.now() - startTime;

          recordControllerMetric({ controllerName, durationMs, hasError: true });
          logger.error("Controller crashed", {
            requestId: req.requestId || null,
            controller: controllerName,
            durationMs,
            message: error.message,
          });
        }

        next(error);
      });
  };
};

export default asyncHandler;
