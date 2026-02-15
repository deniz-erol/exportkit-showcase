import { S3Client } from "@aws-sdk/client-s3";

/**
 * Cloudflare R2 S3-compatible client configuration
 *
 * R2 provides S3-compatible object storage with zero egress fees.
 * Endpoint format: https://{accountId}.r2.cloudflarestorage.com
 *
 * Required environment variables:
 * - R2_ACCOUNT_ID: Cloudflare account ID
 * - R2_ACCESS_KEY_ID: R2 API token access key ID
 * - R2_SECRET_ACCESS_KEY: R2 API token secret access key
 */

function getRequiredEnvVar(name: string): string {
  // Skip validation if using local storage driver
  if (process.env.STORAGE_DRIVER === 'local') {
    return process.env[name] || "mock-value-for-local-dev";
  }

  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
        `Please set ${name} in your .env file. ` +
        `Get this from Cloudflare Dashboard -> R2.`
    );
  }
  return value;
}

const accountId = getRequiredEnvVar("R2_ACCOUNT_ID");
const accessKeyId = getRequiredEnvVar("R2_ACCESS_KEY_ID");
const secretAccessKey = getRequiredEnvVar("R2_SECRET_ACCESS_KEY");

/**
 * S3Client configured for Cloudflare R2
 *
 * - Region is set to "auto" (R2 doesn't use regions but SDK requires it)
 * - Virtual-hosted style URLs work with R2
 * - Endpoint uses account-specific R2 URL
 */
export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});
