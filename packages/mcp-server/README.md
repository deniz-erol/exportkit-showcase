# @exportkit/mcp-server

Model Context Protocol (MCP) server for ExportKit API integration. Enables AI assistants like Claude to create and manage data exports through natural language.

## What is MCP?

The [Model Context Protocol](https://modelcontextprotocol.io) is an open standard that enables AI assistants to securely connect to external tools and data sources. This MCP server exposes ExportKit's export functionality to any MCP-compatible client.

## Features

- **Create Exports**: Generate CSV, JSON, or Excel exports with custom payloads
- **Check Status**: Monitor export job progress and completion
- **List Jobs**: View all export jobs with filtering and pagination
- **Download Files**: Get signed download URLs for completed exports
- **Type-Safe**: Full TypeScript support with Zod validation
- **Secure**: API key authentication with configurable base URL

## Installation

### NPM

```bash
npm install -g @exportkit/mcp-server
```

### From Source

```bash
# Navigate to the mcp-server package directory
cd packages/mcp-server
npm install
npm run build
npm link
```

## Configuration

### Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "exportkit": {
      "command": "npx",
      "args": ["-y", "@exportkit/mcp-server"],
      "env": {
        "EXPORTKIT_API_KEY": "your_api_key_here"
      }
    }
  }
}
```

### Other MCP Clients

For other MCP clients, configure the server with:

- **Command**: `npx -y @exportkit/mcp-server` (or `exportkit-mcp` if installed globally)
- **Environment Variables**:
  - `EXPORTKIT_API_KEY` (required): Your ExportKit API key
  - `EXPORTKIT_BASE_URL` (optional): Custom API base URL (default: `https://api.exportkit.dev`)

## Usage

Once configured, you can use natural language to interact with ExportKit through your AI assistant:

### Creating an Export

```
Create a CSV export with the payload: { "table": "users", "filters": { "status": "active" } }
```

The assistant will call the `create_export` tool and return the job ID.

### Checking Job Status

```
Check the status of export job job_abc123
```

The assistant will call the `get_job_status` tool and show the current progress.

### Listing Jobs

```
List all completed export jobs
```

The assistant will call the `list_jobs` tool with status filter.

### Downloading an Export

```
Get the download URL for job job_abc123
```

The assistant will call the `download_export` tool and provide a signed URL.

## Available Tools

### create_export

Create a new data export job.

**Parameters:**
- `type` (required): Export format - `csv`, `json`, or `xlsx`
- `payload` (optional): Custom payload object for the export

**Example:**
```json
{
  "type": "csv",
  "payload": {
    "table": "orders",
    "filters": {
      "date_from": "2024-01-01",
      "status": "completed"
    }
  }
}
```

**Returns:**
```json
{
  "success": true,
  "jobId": "job_abc123",
  "bullmqId": "bull:123",
  "status": "QUEUED",
  "message": "Export job created successfully. Job ID: job_abc123"
}
```

### get_job_status

Get the current status of an export job.

**Parameters:**
- `jobId` (required): Job ID to retrieve status for

**Example:**
```json
{
  "jobId": "job_abc123"
}
```

**Returns:**
```json
{
  "success": true,
  "job": {
    "id": "job_abc123",
    "status": "COMPLETED",
    "type": "csv",
    "progress": 100,
    "createdAt": "2024-01-15T09:00:00Z",
    "updatedAt": "2024-01-15T09:05:00Z",
    "result": {
      "downloadUrl": "https://r2.exportkit.dev/exports/job_abc123.csv",
      "expiresAt": "2024-01-15T10:00:00Z",
      "recordCount": 1500,
      "fileSize": 45000,
      "format": "csv",
      "key": "exports/job_abc123.csv"
    }
  }
}
```

### list_jobs

List export jobs with optional filtering and pagination.

**Parameters:**
- `status` (optional): Filter by status - `QUEUED`, `PROCESSING`, `COMPLETED`, or `FAILED`
- `limit` (optional): Number of jobs to return (default: 20, max: 100)
- `offset` (optional): Number of jobs to skip (default: 0)

**Example:**
```json
{
  "status": "COMPLETED",
  "limit": 10,
  "offset": 0
}
```

**Returns:**
```json
{
  "success": true,
  "jobs": [
    {
      "id": "job_abc123",
      "status": "COMPLETED",
      "type": "csv",
      "progress": 100,
      "createdAt": "2024-01-15T09:00:00Z",
      "updatedAt": "2024-01-15T09:05:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "offset": 0,
    "limit": 10,
    "hasMore": true
  }
}
```

### download_export

Generate a fresh signed download URL for a completed export.

**Parameters:**
- `jobId` (required): Job ID to generate download URL for

**Example:**
```json
{
  "jobId": "job_abc123"
}
```

**Returns:**
```json
{
  "success": true,
  "downloadUrl": "https://r2.exportkit.dev/exports/job_abc123.csv?X-Amz-Algorithm=...",
  "expiresAt": "2024-01-15T10:30:00Z",
  "fileExpiresAt": "2024-01-22T10:00:00Z",
  "message": "Download URL generated successfully. The URL expires in 1 hour."
}
```

## Error Handling

All tools return structured error responses:

```json
{
  "success": false,
  "error": "ExportKit API error (404): Job not found"
}
```

Common error scenarios:
- **401 Unauthorized**: Invalid or missing API key
- **404 Not Found**: Job doesn't exist or doesn't belong to your account
- **410 Gone**: Export file has expired and been deleted
- **429 Too Many Requests**: Rate limit exceeded or usage cap reached
- **500 Internal Error**: Server error

## Development

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Running Tests

```bash
npm test
```

### Watch Mode

```bash
npm run dev
```

## API Reference

For complete API documentation, visit [https://docs.exportkit.dev](https://docs.exportkit.dev)

## Support

- **Documentation**: [https://docs.exportkit.dev](https://docs.exportkit.dev)
- **Email**: support@exportkit.dev

## License

MIT
