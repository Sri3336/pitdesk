import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import net from "net";
import path from "path";
import { sql } from "drizzle-orm";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerGoogleAuthRoutes } from "./googleAuth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { getDb } from "../db";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { intradayScanHandler } from "../scheduledIntradayScan";
import { extensionSyncHandler } from "../extensionSync";
import { weeklyBriefingHandler } from "../scheduledWeeklyBriefing";
import { postMarketDebriefHandler } from "../scheduledPostMarketDebrief";
import { priceSyncHandler } from "../scheduledPriceSync";
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
  const externalHosting = process.env.PITDESK_EXTERNAL_HOST?.trim().toLowerCase() === "true";

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(cookieParser());

  // Railway readiness checks must verify that the app can reach its configured MySQL database.
  app.get("/health", async (_req, res) => {
    try {
      const db = await getDb();
      if (!db) throw new Error("Database client is unavailable");
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ status: "ok", service: "pitdesk", database: "ready" });
    } catch (error) {
      console.warn("[Health] Database probe failed", error instanceof Error ? error.message : error);
      res.status(503).json({ status: "unavailable", service: "pitdesk", database: "unavailable" });
    }
  });

  // Keep the Railway deployment independent of Manus storage for core branding.
  app.use("/brand-assets", express.static(path.join(process.cwd(), "brand-assets")));

  // Railway currently serves the apex custom domain; avoid routing legacy
  // traffic to the unattached www subdomain during the migration.
  app.use((req, res, next) => {
    const host = (req.hostname || req.headers.host || "").split(":")[0];
    if (host === "trading.akulaz.ai") {
      return res.redirect(301, `https://pitdesk.ai${req.originalUrl}`);
    }
    next();
  });

  registerStorageProxy(app);
  if (externalHosting) {
    console.info("[Auth] Legacy Manus OAuth routes disabled for external hosting");
  } else {
    const { registerOAuthRoutes } = await import("./oauth");
    registerOAuthRoutes(app);
  }
  registerGoogleAuthRoutes(app);

  app.options("/api/extension/sync", extensionSyncHandler);
  app.post("/api/extension/sync", extensionSyncHandler);
  app.post("/api/scheduled/intraday-scan", intradayScanHandler);
  app.post("/api/scheduled/weekly-briefing", weeklyBriefingHandler);
  app.post("/api/scheduled/post-market-debrief", postMarketDebriefHandler);
  app.post("/api/scheduled/price-sync", priceSyncHandler);
  app.use("/api/schwab", schwabRouter);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

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
