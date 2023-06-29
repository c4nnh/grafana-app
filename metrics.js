const { register, Counter, Histogram, Gauge } = require("prom-client");

const cpuUsageMetric = new Counter({
  name: "node_cpu_usage",
  help: "CPU usage per request",
  labelNames: ["method", "path"],
  registers: [register],
});

function cpuUsageMetricMiddleware(req, res, next) {
  const startCpuUsage = process.cpuUsage();

  res.on("finish", () => {
    const endCpuUsage = process.cpuUsage(startCpuUsage);
    const cpuUsageMicros = endCpuUsage.user + endCpuUsage.system;
    cpuUsageMetric.labels(req.method, req.path).inc(cpuUsageMicros);
  });

  next();
}

const memoryUsageMetric = new Counter({
  name: "node_memory_usage",
  help: "Memory usage per request",
  labelNames: ["method", "path"],
  registers: [register],
});

function memoryUsageMetricMiddleware(req, res, next) {
  const memoryUsage = process.memoryUsage().rss;

  res.on("finish", () => {
    memoryUsageMetric.labels(req.method, req.path).inc(memoryUsage);
  });

  next();
}

const responseTimeMetric = new Histogram({
  name: "http_response_time_seconds",
  help: "Duration of HTTP response time in seconds",
  labelNames: ["method", "path"],
  // buckets: [0.1, 0.5, 1, 5, 10],
  registers: [register],
});

function responseTimeMetricMiddleware(req, res, next) {
  const startTime = process.hrtime();

  res.on("finish", () => {
    const duration = process.hrtime(startTime);
    const responseTime = duration[0] + duration[1] / 1e9;

    responseTimeMetric.labels(req.method, req.path).observe(responseTime);
  });

  next();
}

const httpRequestCountMetric = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "path", "status_code"],
  registers: [register],
});

function requestCountMetricMiddleware(req, res, next) {
  httpRequestCountMetric.labels(req.method, req.path, res.statusCode).inc();

  next();
}

const requestSizeMetric = new Gauge({
  name: "http_request_size_bytes",
  help: "Size of HTTP request in bytes",
  labelNames: ["method", "path"],
  registers: [register],
});

function requestSizeMetricMiddleware(req, res, next) {
  // Get the request size in bytes
  const requestSize = req.socket.bytesRead;
  // Set the metrics values
  requestSizeMetric.labels(req.method, req.path).set(requestSize);

  next();
}

const requestPayloadMetric = new Gauge({
  name: "http_request_payload_bytes",
  help: "Size of HTTP request payload in bytes",
  labelNames: ["method", "path"],
  registers: [register],
});

function requestPayloadSizeMetricMiddleware(req, res, next) {
  // Get the request payload size in bytes (if applicable)
  const requestPayloadSize = req.headers["content-length"] || 0;
  // Set the metrics values
  requestPayloadMetric.labels(req.method, req.path).set(requestPayloadSize);

  next();
}

const requestRateMetric = new Counter({
  name: "http_request_rate",
  help: "Number of HTTP requests per second",
  labelNames: ["method", "path"],
});

function requestRateMetricMiddleware(req, res, next) {
  requestRateMetric.labels(req.method, req.path).inc();

  next();
}

const requestThroughputMetric = new Gauge({
  name: "http_request_throughput",
  help: "Number of concurrent HTTP requests",
});

function requestThroughputMetricMiddleware(req, res, next) {
  requestThroughputMetric.inc();
  res.on("finish", () => {
    requestThroughputMetric.dec();
  });

  next();
}

module.exports = {
  cpuUsageMetricMiddleware,
  memoryUsageMetricMiddleware,
  responseTimeMetricMiddleware,
  requestCountMetricMiddleware,
  requestSizeMetricMiddleware,
  requestPayloadSizeMetricMiddleware,
  requestRateMetricMiddleware,
  requestThroughputMetricMiddleware,
};
