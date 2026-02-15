import {
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { r2Client } from "./client.js";

/**
 * Retention period in days for export files.
 * Files in the exports/ prefix are automatically deleted after this period.
 */
export const RETENTION_DAYS = 7;

/**
 * Configure R2 bucket lifecycle policy for automatic file deletion.
 *
 * This function sets up two lifecycle rules:
 * 1. Delete exports after 7 days - removes completed export files to manage storage costs
 * 2. Abort incomplete multipart uploads - cleans up failed multipart uploads after 1 day
 *
 * Note from R2 documentation: Lifecycle policies apply to NEW objects only after the rule
 * is created. Existing files are not retroactively deleted.
 *
 * @param bucketName - The R2 bucket name to configure
 * @returns Promise that resolves when configuration is complete
 * @throws Error if the configuration fails
 */
export async function configureRetentionPolicy(bucketName: string): Promise<void> {
  const rules: LifecycleRule[] = [
    {
      ID: "Delete exports after 7 days",
      Status: "Enabled",
      Filter: {
        Prefix: "exports/",
      },
      Expiration: {
        Days: RETENTION_DAYS,
      },
    },
    {
      ID: "Abort incomplete multipart uploads",
      Status: "Enabled",
      AbortIncompleteMultipartUpload: {
        DaysAfterInitiation: 1,
      },
    },
  ];

  const command = new PutBucketLifecycleConfigurationCommand({
    Bucket: bucketName,
    LifecycleConfiguration: {
      Rules: rules,
    },
  });

  await r2Client.send(command);
}

/**
 * Get the current lifecycle configuration for a bucket.
 *
 * @param bucketName - The R2 bucket name to query
 * @returns Array of lifecycle rules or null if no configuration exists
 * @throws Error if the request fails
 */
export async function getRetentionPolicy(
  bucketName: string
): Promise<LifecycleRule[] | null> {
  const command = new GetBucketLifecycleConfigurationCommand({
    Bucket: bucketName,
  });

  try {
    const response = await r2Client.send(command);
    return response.Rules || null;
  } catch (error) {
    // If no lifecycle configuration exists, R2 returns NoSuchLifecycleConfiguration
    if (error instanceof Error && error.name === "NoSuchLifecycleConfiguration") {
      return null;
    }
    throw error;
  }
}

/**
 * Check if the retention policy is configured correctly.
 *
 * @param bucketName - The R2 bucket name to check
 * @returns True if the 7-day export deletion rule is active
 */
export async function isRetentionPolicyConfigured(bucketName: string): Promise<boolean> {
  const rules = await getRetentionPolicy(bucketName);

  if (!rules) {
    return false;
  }

  const exportRule = rules.find(
    (rule) =>
      rule.ID === "Delete exports after 7 days" &&
      rule.Status === "Enabled" &&
      rule.Filter?.Prefix === "exports/" &&
      rule.Expiration?.Days === RETENTION_DAYS
  );

  return !!exportRule;
}
