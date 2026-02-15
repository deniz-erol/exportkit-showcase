import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import type { CircuitBreakerConfig } from "../../lib/circuit-breaker/counter.js";
import { computePayloadHash } from "../../lib/circuit-breaker/payload-hash.js";
import { incrementAndCheck } from "../../lib/circuit-breaker/counter.js";
import redis from "../../queue/connection.js";
import logger from "../../lib/logger.js";

/**
 * Creates a circuit breaker middleware that detects and blocks runaway agent loops.
 *
 * Tracks identical-payload job creation requests per API key using Redis counters.
 * When the count exceeds the configured threshold within the time window, the
 * middleware returns a 429 response. Fails open on Redis errors to avoid blocking
 * legitimate exports during infrastructure issues.
 *
 * @param config - Optional threshold and window overrides
 * @returns Express middleware function
 */
export function createCircuitBreaker(
  config?: Partial<CircuitBreakerConfig>,
): (req: AuthenticatedRequest, res: Response, next: NextFunction) => Promise<void> {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apiKeyId = req.apiKey?.id;
      if (!apiKeyId) {
        next();
        return;
      }

      const payload = (req.body ?? {}) as Record<string, unknown>;
      const payloadHash = computePayloadHash(payload);
      const result = await incrementAndCheck(redis, apiKeyId, payloadHash, config);

      if (result.blocked) {
        res.status(429).json({
          error: "Runaway Agent Detected. Loop protection enabled.",
          code: "CIRCUIT_BREAKER",
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "Circuit breaker Redis error, failing open");
      next();
    }
  };
}
