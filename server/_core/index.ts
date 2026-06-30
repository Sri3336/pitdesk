import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerGoogleAuthRoutes } from "./googleAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { intradayScanHandler } from "../scheduledIntradayScan";
import { extensionSyncHandler } from "../extensionSync";
import { weeklyBriefingHandler } from "../scheduledWeeklyBriefing";
import { postMarketDebriefHandler } from "../scheduledPostMarketDebrief";
import { schwabRouter } from "../schwabRoutes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // Cookie parser — required for reading session JWT cookies in req.cookies
  app.use(cookieParser());

  // Domain redirect: trading.akulaz.ai -> www.pitdesk.ai (301 permanent)
  app.use((req, res, next) => {
    const host = (req.hostname || req.headers.host || "").split(":")[0];
    if (host === "trading.akulaz.ai") {
      return res.redirect(301, `https://www.pitdesk.ai${req.originalUrl}`);
    }
    next();
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerGoogleAuthRoutes(app);
  // Scheduled heartbeat handlers — must be before tRPC and Vite fallthrough
  // Chrome extension sync endpoint — REST (not tRPC) to avoid batch format issues
  app.options("/api/extension/sync", extensionSyncHandler);
  app.post("/api/extension/sync", extensionSyncHandler);
  app.post("/api/scheduled/intraday-scan", intradayScanHandler);
  app.post("/api/scheduled/weekly-briefing", weeklyBriefingHandler);
  app.post("/api/scheduled/post-market-debrief", postMarketDebriefHandler);
  // Schwab OAuth routes
  app.use("/api/schwab", schwabRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
