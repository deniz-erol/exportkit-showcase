/**
 * HMAC-SHA256 webhook signature utilities.
 *
 * Provides secure signing and verification of webhook payloads using
 * HMAC-SHA256 with timing-safe comparison to prevent timing attacks.
 *
 * Security considerations:
 * - Always use timingSafeEqual for signature comparison
 * - Include timestamp in signed payload for replay protection
 * - Use v1= prefix for signature version (future-proofing)
 * - Never log webhook secrets
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Result of signing a webhook payload.
 */
export interface SignPayloadResult {
  /** HMAC-SHA256 signature (hex encoded) */
  signature: string;
  /** Unix timestamp when signature was generated */
  timestamp: string;
  /** JSON stringified payload */
  body: string;
}

/**
 * Sign a webhook payload with HMAC-SHA256.
 *
 * Creates a signed payload in the format: `${timestamp}.${body}`
 * where body is the JSON stringified payload. This format provides
 * replay protection via the timestamp.
 *
 * @param secret - The webhook secret (HMAC key)
 * @param payload - The payload object to sign
 * @returns SignPayloadResult with signature, timestamp, and body
 *
 * @example
 * ```typescript
 * const { signature, timestamp, body } = signPayload(secret, {
 *   event: 'export.completed',
 *   jobId: '123',
 *   status: 'COMPLETED'
 * });
 *
 * // Send in headers:
 * // X-Webhook-Signature: v1=${signature}
 * // X-Webhook-Timestamp: ${timestamp}
 * ```
 */
export function signPayload(
  secret: string,
  payload: Record<string, unknown>
): SignPayloadResult {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${body}`;

  const signature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return { signature, timestamp, body };
}

/**
 * Verify a webhook signature using timing-safe comparison.
 *
 * Uses crypto.timingSafeEqual to prevent timing attacks that could
 * leak information about the correct signature.
 *
 * @param secret - The webhook secret (HMAC key)
 * @param signature - The signature to verify (hex encoded, without v1= prefix)
 * @param timestamp - The timestamp from the webhook request
 * @param body - The raw request body (JSON string)
 * @returns true if signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * const isValid = verifySignature(
 *   secret,
 *   signature,      // From X-Webhook-Signature header (remove v1= prefix)
 *   timestamp,      // From X-Webhook-Timestamp header
 *   rawBody         // Raw request body as string
 * );
 *
 * if (!isValid) {
 *   throw new Error('Invalid webhook signature');
 * }
 * ```
 */
export function verifySignature(
  secret: string,
  signature: string,
  timestamp: string,
  body: string
): boolean {
  try {
    // Reconstruct the signed payload
    const signedPayload = `${timestamp}.${body}`;

    // Compute expected signature
    const expectedSignature = createHmac("sha256", secret)
      .update(signedPayload)
      .digest("hex");

    // Use timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    // Ensure buffers are same length before comparison
    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    // Any error (invalid hex, etc.) means verification failed
    return false;
  }
}

/**
 * Extract signature version and value from header.
 *
 * Handles the v1= prefix format for future versioning.
 *
 * @param header - The X-Webhook-Signature header value
 * @returns The signature value without version prefix, or null if invalid
 *
 * @example
 * ```typescript
 * const signature = extractSignature('v1=abc123');
 * // signature === 'abc123'
 * ```
 */
export function extractSignature(header: string): string | null {
  // Handle v1= prefix format
  if (header.startsWith("v1=")) {
    return header.slice(3);
  }

  // If no prefix, assume it's the raw signature (for backwards compatibility)
  return header;
}

/**
 * Create webhook request headers.
 *
 * Convenience function to generate all required webhook headers
 * including the signature with proper formatting.
 *
 * @param secret - The webhook secret
 * @param payload - The payload to sign
 * @param event - The event type
 * @param deliveryId - The webhook delivery ID
 * @returns Object with all required headers
 *
 * @example
 * ```typescript
 * const headers = createWebhookHeaders(
 *   secret,
 *   { jobId: '123', status: 'COMPLETED' },
 *   'export.completed',
 *   'delivery_456'
 * );
 *
 * // Returns:
 * // {
 * //   'Content-Type': 'application/json',
 * //   'X-Webhook-Signature': 'v1=abc123...',
 * //   'X-Webhook-Timestamp': '1234567890',
 * //   'X-Webhook-Event': 'export.completed',
 * //   'X-Webhook-ID': 'delivery_456'
 * // }
 * ```
 */
export function createWebhookHeaders(
  secret: string,
  payload: Record<string, unknown>,
  event: string,
  deliveryId: string
): Record<string, string> {
  const { signature, timestamp, body } = signPayload(secret, payload);

  return {
    "Content-Type": "application/json",
    "X-Webhook-Signature": `v1=${signature}`,
    "X-Webhook-Timestamp": timestamp,
    "X-Webhook-Event": event,
    "X-Webhook-ID": deliveryId,
  };
}
