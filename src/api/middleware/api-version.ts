import type { Request, Response, NextFunction } from "express";

/**
 * Latest stable API version.
 * Used as the default when no version is specified in the URL path.
 */
export const LATEST_STABLE_VERSION = "v1";

/**
 * Set of all supported API versions.
 */
export const SUPPORTED_VERSIONS = new Set(["v1"]);

/**
 * Deprecation metadata for API versions that are scheduled for removal.
 * Maps a version string to its sunset date and the date it was deprecated.
 *
 * - `sunsetDate`: ISO 8601 date string (YYYY-MM-DD) when the version will be removed.
 * - `deprecatedSince`: ISO 8601 date string (YYYY-MM-DD) when the version was deprecated.
 *
 * When a request uses a deprecated version, the middleware adds:
 * - `Sunset` header with the sunset date in RFC 7231 HTTP-date format
 * - `Deprecation: true` header
 * - `Link` header pointing to the latest version docs with `rel="successor-version"`
 */
export const DEPRECATED_VERSIONS = new Map<
  string,
  { sunsetDate: string; deprecatedSince: string }
>();

/**
 * Regex to extract the version prefix from the request path.
 * Matches `/api/v1/...` and captures `v1`.
 */
const VERSION_PATH_REGEX = /^\/api\/(v\d+)\//;

/**
 * Converts an ISO 8601 date string (YYYY-MM-DD) to an RFC 7231 HTTP-date.
 *
 * @param isoDate - Date string in YYYY-MM-DD format
 * @returns HTTP-date string (e.g., "Sun, 06 Nov 1994 08:49:37 GMT")
 */
export function toHttpDate(isoDate: string): string {
  return new Date(isoDate).toUTCString();
}

/**
 * Express middleware that negotiates the API version for each request.
 *
 * Detection logic:
 * 1. Checks the URL path for an explicit version prefix (e.g., `/api/v1/jobs`)
 * 2. When no version is found (e.g., `/api/jobs`), defaults to the latest stable version
 *
 * Sets `req.apiVersion` for downstream handlers and adds an `X-API-Version`
 * response header so clients always know which version served their request.
 *
 * When the resolved version is in the {@link DEPRECATED_VERSIONS} map, the
 * middleware also sets `Sunset`, `Deprecation`, and `Link` headers to inform
 * clients about the upcoming removal.
 *
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export function apiVersionMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const match = req.originalUrl.match(VERSION_PATH_REGEX);
  const version = match ? match[1] : LATEST_STABLE_VERSION;

  req.apiVersion = version;
  res.setHeader("X-API-Version", version);

  const deprecation = DEPRECATED_VERSIONS.get(version);
  if (deprecation) {
    res.setHeader("Sunset", toHttpDate(deprecation.sunsetDate));
    res.setHeader("Deprecation", "true");
    res.setHeader(
      "Link",
      `</api/${LATEST_STABLE_VERSION}>; rel="successor-version"`
    );
  }

  next();
}
