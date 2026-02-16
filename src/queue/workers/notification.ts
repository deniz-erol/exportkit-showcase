import { Worker, Job } from "bullmq";
import { redisConnectionOptions } from "../connection.js";
import { type EmailJobData } from "../notification.js";
import { Resend } from "resend";
import { render } from "@react-email/render";
import ExportCompleted from "../../emails/ExportCompleted.js";
import ExportFailed from "../../emails/ExportFailed.js";
import UsageAlert from "../../emails/UsageAlert.js";
import EmailVerification from "../../emails/EmailVerification.js";
import Welcome from "../../emails/Welcome.js";
import DeletionConfirmation from "../../emails/DeletionConfirmation.js";
import TeamInvitation from "../../emails/TeamInvitation.js";
import SubProcessorChangeEmail from "../../emails/SubProcessorChange.js";
import * as React from "react";
import prisma from "../../db/client.js";
import pinoLogger, { createJobLogger } from "../../lib/logger.js";

/**
 * Email types classified as marketing.
 * These require the customer's `marketingEmails` consent flag to be true.
 * Transactional emails (export_completed, export_failed, email_verification,
 * deletion_confirmation, team_invitation, sub-processor-change) are always sent.
 */
const MARKETING_EMAIL_TYPES: ReadonlySet<EmailJobData["type"]> = new Set([
  "usage_alert",
  "welcome",
]);

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const logger = pinoLogger.child({ component: "notification-worker" });

/**
 * Process email notification jobs.
 */
async function processNotificationJob(job: Job<EmailJobData>): Promise<void> {
  const { type, to, payload = {}, customerId } = job.data;
  const jobId = job.id ?? "unknown";
  const jobLog = createJobLogger(jobId, customerId ?? "unknown");

  jobLog.info({ msg: "Starting notification job", type, to });

  try {
    // Check marketing consent before sending marketing emails
    if (MARKETING_EMAIL_TYPES.has(type) && customerId) {
      const consent = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { marketingEmails: true },
      });

      if (consent && !consent.marketingEmails) {
        jobLog.info({
          msg: "Skipping marketing email — customer has not opted in",
          type,
          to,
          customerId,
        });
        return;
      }
    }

    // Fetch customer branding if available
    let branding = undefined;
    if (customerId) {
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          name: true,
          brandColor: true,
          brandLogo: true,
          brandFooter: true,
        },
      });

      if (customer) {
        branding = {
          companyName: customer.name,
          brandColor: customer.brandColor || undefined,
          logoUrl: customer.brandLogo || undefined,
          footerText: customer.brandFooter || undefined,
        };
      }
    }

    let emailHtml: string;
    let subject: string;

    // Render email template based on type
    switch (type) {
      case "export_completed":
        emailHtml = await render(
          React.createElement(ExportCompleted, {
            downloadUrl: payload.downloadUrl as string,
            expiresAt: payload.expiresAt as string,
            recordCount: payload.recordCount as number,
            fileSize: payload.fileSize as number,
            format: payload.format as string,
            branding,
          })
        );
        subject = "Your export is ready";
        break;

      case "export_failed":
        emailHtml = await render(
          React.createElement(ExportFailed, {
            error: payload.error as string,
            jobId: payload.jobId as string,
            branding,
          })
        );
        subject = "Export failed";
        break;

      case "usage_alert":
        emailHtml = await render(
          React.createElement(UsageAlert, {
            threshold: payload.threshold as number,
            totalRows: payload.totalRows as number,
            limit: payload.limit as number,
            percentUsed: payload.percentUsed as number,
            planName: payload.planName as string,
            billingPeriod: payload.billingPeriod as string,
            branding,
          })
        );
        subject = (payload.threshold as number) >= 100
          ? "Usage limit reached — upgrade your plan"
          : `You've used ${payload.percentUsed}% of your export limit`;
        break;

      case "email_verification": {
        const token = job.data.token as string;
        const baseUrl = process.env.API_BASE_URL || "http://localhost:3000";
        const verificationUrl = `${baseUrl}/api/auth/verify-email?token=${token}`;
        
        emailHtml = await render(
          React.createElement(EmailVerification, {
            verificationUrl,
            email: to,
            branding,
          })
        );
        subject = "Verify your email address";
        break;
      }

      case "welcome": {
        const dashboardUrl = process.env.DASHBOARD_URL || "http://localhost:3001";
        const docsUrl = process.env.DOCS_URL || "https://docs.exportkit.dev";

        emailHtml = await render(
          React.createElement(Welcome, {
            dashboardUrl,
            docsUrl,
            branding,
          })
        );
        subject = "Welcome to ExportKit — here's how to get started";
        break;
      }

      case "deletion_confirmation": {
        emailHtml = await render(
          React.createElement(DeletionConfirmation, {
            customerName: (payload.customerName as string) || "Customer",
            deletedAt: (payload.deletedAt as string) || new Date().toISOString(),
          })
        );
        subject = "Your ExportKit account has been deleted";
        break;
      }

      case "team_invitation": {
        emailHtml = await render(
          React.createElement(TeamInvitation, {
            inviteUrl: payload.inviteUrl as string,
            organizationName: payload.organizationName as string,
            role: payload.role as string,
            branding,
          })
        );
        subject = `You've been invited to join ${payload.organizationName as string} on ExportKit`;
        break;
      }

      case "sub-processor-change": {
        emailHtml = await render(
          React.createElement(SubProcessorChangeEmail, {
            customerName: payload.customerName as string,
            changeDescription: payload.changeDescription as string,
            effectiveDate: payload.effectiveDate as string,
            branding: payload.branding as any,
          })
        );
        subject = "Important: Sub-Processor Change Notification";
        break;
      }

      default:
        throw new Error(`Unknown notification type: ${type}`);
    }

    // Send email using Resend
    // Skip sending if no API key (dev mode)
    if (!process.env.RESEND_API_KEY) {
      jobLog.info({ msg: "[DEV] Skipping email send (no API key)", to, subject, type });
      return;
    }

    const data = await getResend().emails.send({
      from: process.env.EMAIL_FROM || "ExportKit <notifications@exportkit.dev>",
      to,
      subject,
      html: emailHtml,
      tags: [
        { name: "customer_id", value: customerId || "unknown" },
        { name: "notification_type", value: type },
      ],
    });

    jobLog.info({
      msg: "Email sent successfully",
      emailId: data.data?.id,
      to,
      type,
    });
  } catch (error) {
    jobLog.error({
      msg: "Failed to send email",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export const notificationWorker = new Worker<EmailJobData>(
  "email-notifications",
  processNotificationJob,
  {
    connection: redisConnectionOptions,
    concurrency: 5,
  }
);

notificationWorker.on("completed", (job) => {
  logger.info({ msg: "Notification job completed", jobId: job.id });
});

notificationWorker.on("failed", (job, err) => {
  logger.error({ err, msg: "Notification job failed", jobId: job?.id });
});

export default notificationWorker;
