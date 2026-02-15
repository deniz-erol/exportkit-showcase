import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client } from "./client.js";

/**
 * Default expiry time for signed URLs: 1 hour (3600 seconds)
 * Per INFRA-04 requirement for secure download URLs
 */
const DEFAULT_EXPIRY_SECONDS = 3600;

/**
 * Maximum allowed expiry time: 7 days (604800 seconds)
 * Security constraint to prevent overly long-lived URLs
 */
const MAX_EXPIRY_SECONDS = 604800;

/**
 * Generate a presigned URL for downloading an object from R2
 *
 * @param key - The object key (path) in the bucket
 * @param expiresInSeconds - Optional custom expiry time in seconds (default: 3600, max: 604800)
 * @returns Promise resolving to the presigned URL string
 * @throws Error if expiresInSeconds exceeds maximum or if URL generation fails
 *
 * @example
 * ```typescript
 * const url = await generateSignedUrl("exports/customer-123/job-456.csv");
 * // Returns: https://account.r2.cloudflarestorage.com/bucket/exports/...?X-Amz-Algorithm=...
 * ```
 */
export async function generateSignedUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_EXPIRY_SECONDS
): Promise<string> {
  if (expiresInSeconds > MAX_EXPIRY_SECONDS) {
    throw new Error(
      `Expiry time ${expiresInSeconds}s exceeds maximum allowed ${MAX_EXPIRY_SECONDS}s (7 days)`
    );
  }

  if (expiresInSeconds <= 0) {
    throw new Error(`Expiry time must be positive, got ${expiresInSeconds}s`);
  }

  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) {
    throw new Error(
      "Missing required environment variable: R2_BUCKET_NAME\n" +
        "Please set R2_BUCKET_NAME in your .env file."
    );
  }

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });

  try {
    const signedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: expiresInSeconds,
    });
    return signedUrl;
  } catch (error) {
    throw new Error(
      `Failed to generate signed URL for key "${key}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
