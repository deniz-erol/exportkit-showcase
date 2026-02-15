/**
 * /llms.txt route (AGENT-01)
 * Serves a plain-text file describing ExportKit's API for LLMs and AI agents.
 */

import { Router } from "express";
import type { Request, Response } from "express";

const router = Router();

/**
 * Generate the llms.txt content
 */
function generateLlmsTxt(full: boolean = false): string {
  const baseContent = `# ExportKit API

ExportKit is a SaaS API providing drop-in data export infrastructure. It enables streaming CSV, JSON, and Excel exports with progress tracking, webhook delivery, and email notifications.

## Service Description

ExportKit handles large-scale data exports asynchronously through a job queue system. Customers submit export requests via REST API, and the system processes them in the background, storing results in cloud storage with signed download URLs.

## Authentication

All API requests require an API key passed via the X-API-Key header.

Example:
X-API-Key: your-api-key-here

API keys can be created and managed through the Dashboard at https://exportkit.io/dashboard/settings/keys

## Base URL

Production: https://api.exportkit.io
API Version: v1

## Core Endpoints

### Create Export Job
POST /api/v1/jobs

Creates a new export job. The job is processed asynchronously.

Request body:
{
  "type": "csv" | "json" | "xlsx",
  "data": Array<Record<string, any>>,
  "options": {
    "filename": "export.csv" (optional),
    "columns": ["col1", "col2"] (optional, for CSV)
  }
}

Response:
{
  "id": "job_abc123",
  "status": "QUEUED",
  "type": "csv",
  "createdAt": "2026-02-15T10:00:00Z"
}

### Get Job Status
GET /api/v1/jobs/:id

Returns the current status and result of an export job.

Response:
{
  "id": "job_abc123",
  "status": "COMPLETED" | "QUEUED" | "PROCESSING" | "FAILED",
  "type": "csv",
  "progress": 100,
  "result": {
    "downloadUrl": "https://...",
    "fileSize": 1024000,
    "recordCount": 5000,
    "expiresAt": "2026-02-22T10:00:00Z"
  },
  "createdAt": "2026-02-15T10:00:00Z",
  "completedAt": "2026-02-15T10:05:00Z"
}

### List Jobs
GET /api/v1/jobs?page=1&pageSize=20

Returns a paginated list of export jobs for the authenticated customer.

Response:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "hasNextPage": true
  }
}

### Download Export File
GET /api/v1/jobs/:id/download

Returns a redirect to the signed download URL for the completed export file.

## Rate Limits

- Export creation: 10 requests/minute
- File downloads: 30 requests/minute
- Other endpoints: 100 requests/minute

Rate limit headers are included in all responses:
- X-RateLimit-Limit
- X-RateLimit-Remaining
- X-RateLimit-Reset

## Webhooks

ExportKit can send webhook notifications when jobs complete or fail.

Configure webhooks in the Dashboard at https://exportkit.io/dashboard/settings/webhooks

Webhook payload:
{
  "event": "export.completed" | "export.failed",
  "jobId": "job_abc123",
  "status": "COMPLETED" | "FAILED",
  "result": {...},
  "timestamp": "2026-02-15T10:05:00Z"
}

## Usage Limits

Free tier: 100,000 rows/month
Pro tier: 1,000,000 rows/month
Scale tier: 10,000,000 rows/month

Check current usage:
GET /api/v1/usage

## Example Workflow

1. Create an export job:
   POST /api/v1/jobs with your data

2. Poll for completion:
   GET /api/v1/jobs/:id every few seconds

3. Download the file:
   GET /api/v1/jobs/:id/download when status is COMPLETED

4. Or use webhooks for automatic notification

## Error Handling

All errors return JSON with:
{
  "error": "Human-readable message",
  "code": "ERROR_CODE"
}

Common error codes:
- UNAUTHORIZED: Invalid or missing API key
- RATE_LIMIT_EXCEEDED: Too many requests
- USAGE_CAP_EXCEEDED: Monthly usage limit reached
- INVALID_REQUEST: Malformed request body
- JOB_NOT_FOUND: Job ID does not exist

## Support

Documentation: https://docs.exportkit.io
Dashboard: https://exportkit.io/dashboard
Support: support@exportkit.io
`;

  if (!full) {
    return baseContent;
  }

  // Full version includes detailed schemas
  const fullContent = baseContent + `

## Detailed Request/Response Schemas

### Export Job Schema
{
  "id": "string (cuid)",
  "status": "QUEUED | PROCESSING | COMPLETED | FAILED",
  "type": "csv | json | xlsx",
  "payload": {
    "data": "Array<Record<string, any>>",
    "options": {
      "filename": "string (optional)",
      "columns": "string[] (optional, CSV only)",
      "sheetName": "string (optional, Excel only)"
    }
  },
  "result": {
    "downloadUrl": "string (signed URL, 24h expiry)",
    "fileKey": "string (R2 object key)",
    "fileSize": "number (bytes)",
    "recordCount": "number",
    "expiresAt": "ISO 8601 timestamp"
  },
  "error": {
    "message": "string",
    "code": "string"
  },
  "progress": "number (0-100)",
  "attemptsMade": "number",
  "createdAt": "ISO 8601 timestamp",
  "startedAt": "ISO 8601 timestamp",
  "completedAt": "ISO 8601 timestamp"
}

### API Key Scopes
- READ: GET requests only
- WRITE: GET and POST requests (default)
- ADMIN: All HTTP methods

### Supported Export Formats

CSV:
- Streaming generation for memory efficiency
- Automatic header row from object keys
- UTF-8 encoding
- Configurable column selection

JSON:
- Array of objects format
- Streaming generation
- Pretty-printed output

Excel (XLSX):
- Single worksheet per file
- Automatic column width adjustment
- Header row styling
- Streaming generation via ExcelJS

## Advanced Features

### Scheduled Exports
Create recurring exports with cron expressions (Pro/Scale plans only)
POST /api/v1/schedules

### Team Management
Invite team members with role-based access (Scale plan only)
POST /api/v1/team/invite

### Custom Branding
Apply your logo and colors to email notifications
PUT /api/v1/branding

### IP Allowlisting
Restrict API key usage to specific IP ranges
PUT /api/v1/keys/:id/allowed-ips

## OpenAPI Specification

Full OpenAPI 3.0 spec available at:
https://api.exportkit.io/openapi.json
`;

  return fullContent;
}

/**
 * GET /llms.txt
 * Returns a plain-text description of the API for LLMs
 */
router.get("/llms.txt", (_req: Request, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  });

/**
 * GET /llms-full.txt
 * Returns a detailed plain-text description with full schemas
 */
router.get("/llms-full.txt", (_req: Request, res: Response) => {
    // Handler implementation omitted for portfolio showcase
  });

export default router;
