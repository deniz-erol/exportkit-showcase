import { Router } from "express";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";
import mime from "mime-types";
import logger from "../../lib/logger.js";

const router = Router();

/**
 * Local storage proxy route.
 *
 * Serves files from the local-uploads directory when running with STORAGE_DRIVER='local'.
 * IMPORTANT: This should ONLY be enabled in development/testing environments.
 */
router.get("/*", async (req: Request, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  });

export default router;
