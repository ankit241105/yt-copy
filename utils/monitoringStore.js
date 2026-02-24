const monitoringStore = {
  startedAt: new Date().toISOString(),
  totalRequests: 0,
  successfulRequests: 0,
  clientErrors: 0,
  serverErrors: 0,
  slowRequests: 0,
  totalResponseTimeMs: 0,
  lastRequestAt: null,
  controllers: {},
};

export const recordRequestMetric = ({ statusCode, durationMs, isSlow = false }) => {
  monitoringStore.totalRequests += 1;
  monitoringStore.totalResponseTimeMs += durationMs;
  monitoringStore.lastRequestAt = new Date().toISOString();

  if (statusCode >= 500) {
    monitoringStore.serverErrors += 1;
  } else if (statusCode >= 400) {
    monitoringStore.clientErrors += 1;
  } else {
    monitoringStore.successfulRequests += 1;
  }

  if (isSlow) {
    monitoringStore.slowRequests += 1;
  }
};

export const recordControllerMetric = ({ controllerName, durationMs, hasError = false }) => {
  if (!monitoringStore.controllers[controllerName]) {
    monitoringStore.controllers[controllerName] = {
      calls: 0,
      errors: 0,
      totalDurationMs: 0,
      lastCalledAt: null,
    };
  }

  const controller = monitoringStore.controllers[controllerName];
  controller.calls += 1;
  controller.totalDurationMs += durationMs;
  controller.lastCalledAt = new Date().toISOString();

  if (hasError) {
    controller.errors += 1;
  }
};

export const getMonitoringSnapshot = () => {
  const avgResponseTimeMs =
    monitoringStore.totalRequests > 0
      ? Number((monitoringStore.totalResponseTimeMs / monitoringStore.totalRequests).toFixed(2))
      : 0;

  const controllerMetrics = {};
  for (const [name, metric] of Object.entries(monitoringStore.controllers)) {
    controllerMetrics[name] = {
      calls: metric.calls,
      errors: metric.errors,
      avgDurationMs:
        metric.calls > 0 ? Number((metric.totalDurationMs / metric.calls).toFixed(2)) : 0,
      lastCalledAt: metric.lastCalledAt,
    };
  }

  return {
    startedAt: monitoringStore.startedAt,
    totalRequests: monitoringStore.totalRequests,
    successfulRequests: monitoringStore.successfulRequests,
    clientErrors: monitoringStore.clientErrors,
    serverErrors: monitoringStore.serverErrors,
    slowRequests: monitoringStore.slowRequests,
    avgResponseTimeMs,
    lastRequestAt: monitoringStore.lastRequestAt,
    controllers: controllerMetrics,
  };
};
