const {
  collectDefaultMetrics,
  register,
  Histogram,
  Counter,
} = require("prom-client");
const path = require("path");

const { createRequestHandler } = require("@remix-run/express");
const { installGlobals } = require("@remix-run/node");
const compression = require("compression");
const express = require("express");
const morgan = require("morgan");
const responseTime = require("response-time");

collectDefaultMetrics();

installGlobals();

const BUILD_DIR = path.join(process.cwd(), "build");

const app = express();

app.use(compression());

// http://expressjs.com/en/advanced/best-practice-security.html#at-a-minimum-disable-x-powered-by-header
app.disable("x-powered-by");

// Remix fingerprints its assets so we can cache forever.
app.use(
  "/build",
  express.static("public/build", { immutable: true, maxAge: "1y" })
);

const restResponseTimeHistorgram = new Histogram({
  name: "rest_response_time_duration_seconds",
  help: "REST API response time in secords",
  labelNames: ["method", "route", "status_code"],
});

const cpuUsageMetric = new Counter({
  name: "node_cpu_usage",
  help: "CPU usage per request",
  labelNames: ["method", "path"],
  registers: [register],
});

const memoryUsageMetric = new Counter({
  name: "node_memory_usage",
  help: "Memory usage per request",
  labelNames: ["method", "path"],
  registers: [register],
});

app.use(
  responseTime((req, res, time) => {
    if (req?.route?.path) {
      restResponseTimeHistorgram.observe(
        {
          method: req.method,
          route: req.route.path,
          status_code: req.statusCode,
        },
        time * 1000
      );
    }
  })
);

app.use((req, res, next) => {
  const startCpuUsage = process.cpuUsage();
  const memoryUsage = process.memoryUsage().rss;

  res.on("finish", () => {
    const endCpuUsage = process.cpuUsage(startCpuUsage);
    const cpuUsageMicros = endCpuUsage.user + endCpuUsage.system;

    // Increment the CPU usage metric
    cpuUsageMetric.labels(req.method, req.path).inc(cpuUsageMicros);
    memoryUsageMetric.labels(req.method, req.path).inc(memoryUsage);
  });

  next();
});

app.get("/fast", async (_req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 300));
  res.send("Fast API");
});

app.get("/slow", async (_req, res) => {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  res.send("Slow API");
});

app.get("/metrics", async (_req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    res.status(500).end(err);
  }
});

// Everything else (like favicon.ico) is cached for an hour. You may want to be
// more aggressive with this caching.
app.use(express.static("public", { maxAge: "1h" }));

app.use(morgan("tiny"));

app.all(
  "*",
  process.env.NODE_ENV === "development"
    ? (req, res, next) => {
        purgeRequireCache();

        return createRequestHandler({
          build: require(BUILD_DIR),
          mode: process.env.NODE_ENV,
        })(req, res, next);
      }
    : createRequestHandler({
        build: require(BUILD_DIR),
        mode: process.env.NODE_ENV,
      })
);
const port = process.env.PORT || 8080;

app.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});

function purgeRequireCache() {
  // purge require cache on requests for "server side HMR" this won't let
  // you have in-memory objects between requests in development,
  // alternatively you can set up nodemon/pm2-dev to restart the server on
  // file changes, but then you'll have to reconnect to databases/etc on each
  // change. We prefer the DX of this, so we've included it for you by default
  for (const key in require.cache) {
    if (key.startsWith(BUILD_DIR)) {
      delete require.cache[key];
    }
  }
}
