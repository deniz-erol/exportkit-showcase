import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "./auth.js";
import type { ApiErrorResponse } from "../../types/index.js";
import ipaddr from "ipaddr.js";

/**
 * Checks whether a given IP address falls within a CIDR range.
 *
 * Handles both IPv4 and IPv6 addresses, including IPv4-mapped IPv6 addresses
 * (e.g., "::ffff:192.168.1.1"). Single IPs without a CIDR suffix are treated
 * as /32 (IPv4) or /128 (IPv6).
 *
 * @param ip - The request IP address to check
 * @param cidr - A CIDR range string (e.g., "192.168.1.0/24" or "2001:db8::/32")
 * @returns True if the IP falls within the CIDR range
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  try {
    let parsedIp = ipaddr.process(ip);
    let network: ipaddr.IPv4 | ipaddr.IPv6;
    let prefixLength: number;

    if (cidr.includes("/")) {
      const [net, bits] = ipaddr.parseCIDR(cidr);
      network = net;
      prefixLength = bits;
    } else {
      // Single IP — treat as /32 or /128
      network = ipaddr.process(cidr);
      prefixLength = network.kind() === "ipv4" ? 32 : 128;
    }

    // Normalize: if one is IPv4 and the other IPv6-mapped, convert to IPv4
    if (parsedIp.kind() !== network.kind()) {
      if (
        parsedIp.kind() === "ipv6" &&
        (parsedIp as ipaddr.IPv6).isIPv4MappedAddress()
      ) {
        parsedIp = (parsedIp as ipaddr.IPv6).toIPv4Address();
      } else if (
        network.kind() === "ipv6" &&
        (network as ipaddr.IPv6).isIPv4MappedAddress()
      ) {
        network = (network as ipaddr.IPv6).toIPv4Address();
        prefixLength = Math.max(0, prefixLength - 96);
      } else {
        // Incompatible address families
        return false;
      }
    }

    return parsedIp.match(network, prefixLength);
  } catch {
    return false;
  }
}

/**
 * Express middleware that enforces IP allowlisting for API keys.
 *
 * Must run AFTER the auth middleware so that `req.apiKey` is populated.
 * If the API key has an `allowedIps` array with entries, the request IP
 * is checked against each CIDR range. If the IP is not in any range,
 * the request is rejected with 403.
 *
 * When the allowlist is empty (or the key has no allowedIps), all IPs
 * are permitted. Supports both IPv4 and IPv6 CIDR notation, as well as
 * IPv4-mapped IPv6 addresses.
 *
 * @param req - Express request with authenticated API key
 * @param res - Express response object
 * @param next - Express next function
 */
export function checkIpAllowlist(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const apiKey = req.apiKey;

  // If no apiKey is set, skip IP check (auth middleware handles 401)
  if (!apiKey) {
    next();
    return;
  }

  const allowedIps = apiKey.allowedIps;

  // Empty allowlist means all IPs are allowed
  if (!allowedIps || allowedIps.length === 0) {
    next();
    return;
  }

  const requestIp = req.ip;

  // If we can't determine the request IP, reject
  if (!requestIp) {
    const errorResponse: ApiErrorResponse = {
      error: "IP address not allowed",
      code: "IP_NOT_ALLOWED",
    };
    res.status(403).json(errorResponse);
    return;
  }

  const isAllowed = allowedIps.some((cidr) => isIpInCidr(requestIp, cidr));

  if (!isAllowed) {
    const errorResponse: ApiErrorResponse = {
      error: "IP address not allowed",
      code: "IP_NOT_ALLOWED",
    };
    res.status(403).json(errorResponse);
    return;
  }

  next();
}
