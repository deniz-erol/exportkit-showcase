/**
 * API v1 router.
 *
 * Groups all versioned API routes under a single Express router
 * so they can be mounted at `/api/v1/` (and aliased at `/api/` for
 * backward compatibility).
 *
 * Route-specific rate limiters are applied here; the jobs router
 * handles its own per-endpoint limiters internally.
 */
import { Router } from "express";
import jobRoutes from "./jobs.js";
import keyRoutes from "./keys.js";
import brandingRoutes from "./branding.js";
import localStorageRoutes from "./local-storage.js";
import usageRoutes from "./usage.js";
import billingRoutes from "./billing.js";
import authRoutes from "./auth.js";
import auditLogsRoutes from "./audit-logs.js";
import accountRoutes from "./account.js";
import scheduleRoutes from "./schedules.js";
import teamRoutes from "./team.js";
import { generalLimiter, generalBurstLimiter } from "../middleware/rate-limit.js";

const v1Router = Router();

v1Router.use("/auth", generalLimiter, generalBurstLimiter, authRoutes);
v1Router.use("/jobs", jobRoutes); // Jobs route applies per-endpoint limiters internally
v1Router.use("/keys", generalLimiter, generalBurstLimiter, keyRoutes);
v1Router.use("/branding", generalLimiter, generalBurstLimiter, brandingRoutes);
v1Router.use("/local-storage", generalLimiter, generalBurstLimiter, localStorageRoutes);
v1Router.use("/usage", generalLimiter, generalBurstLimiter, usageRoutes);
v1Router.use("/billing", generalLimiter, generalBurstLimiter, billingRoutes);
v1Router.use("/audit-logs", generalLimiter, generalBurstLimiter, auditLogsRoutes);
v1Router.use("/account", generalLimiter, generalBurstLimiter, accountRoutes);
v1Router.use("/schedules", generalLimiter, generalBurstLimiter, scheduleRoutes);
v1Router.use("/team", generalLimiter, generalBurstLimiter, teamRoutes);

export default v1Router;
