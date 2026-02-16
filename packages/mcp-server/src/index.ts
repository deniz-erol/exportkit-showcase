#!/usr/bin/env node

/**
 * ExportKit MCP Server
 *
 * Model Context Protocol server for ExportKit API integration.
 * Exposes tools for creating exports, checking job status, listing jobs, and downloading exports.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ExportKitClient } from './client.js';
import { createExport, getJobStatus, listJobs, downloadExport } from './tools.js';
import type { ExportKitConfig } from './types.js';

/**
 * Get configuration from environment variables.
 */
function getConfig(): ExportKitConfig {
  const apiKey = process.env.EXPORTKIT_API_KEY;
  if (!apiKey) {
    throw new Error(
      'EXPORTKIT_API_KEY environment variable is required. ' +
        'Set it in your MCP client configuration.'
    );
  }

  return {
    apiKey,
    baseUrl: process.env.EXPORTKIT_BASE_URL || 'https://api.exportkit.dev',
  };
}

/**
 * Main server function.
 */
async function main() {
  // Get configuration
  const config = getConfig();
  const client = new ExportKitClient(config.apiKey, config.baseUrl);

  // Create MCP server
  const server = new Server(
    {
      name: 'exportkit-mcp-server',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'create_export',
          description:
            'Create a new data export job in CSV, JSON, or Excel format. ' +
            'The job will be queued and processed asynchronously. ' +
            'Returns a job ID that can be used to check status and download the result.',
          inputSchema: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['csv', 'json', 'xlsx'],
                description: 'Export format type',
              },
              payload: {
                type: 'object',
                description:
                  'Custom payload for the export (e.g., filters, table name, query parameters)',
                additionalProperties: true,
              },
            },
            required: ['type'],
          },
        },
        {
          name: 'get_job_status',
          description:
            'Get the current status of an export job by ID. ' +
            'Returns job details including status (QUEUED, PROCESSING, COMPLETED, FAILED), ' +
            'progress percentage, and download URL if completed.',
          inputSchema: {
            type: 'object',
            properties: {
              jobId: {
                type: 'string',
                description: 'Job ID to retrieve status for',
              },
            },
            required: ['jobId'],
          },
        },
        {
          name: 'list_jobs',
          description:
            'List export jobs with optional filtering by status and pagination. ' +
            'Returns a list of jobs with their current status and metadata.',
          inputSchema: {
            type: 'object',
            properties: {
              status: {
                type: 'string',
                enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'],
                description: 'Filter by job status (optional)',
              },
              limit: {
                type: 'number',
                description: 'Number of jobs to return (default: 20, max: 100)',
                minimum: 1,
                maximum: 100,
              },
              offset: {
                type: 'number',
                description: 'Number of jobs to skip for pagination (default: 0)',
                minimum: 0,
              },
            },
          },
        },
        {
          name: 'download_export',
          description:
            'Generate a fresh signed download URL for a completed export job. ' +
            'The URL expires after 1 hour. Returns 410 Gone if the file has expired ' +
            'and been deleted per the retention policy.',
          inputSchema: {
            type: 'object',
            properties: {
              jobId: {
                type: 'string',
                description: 'Job ID to generate download URL for',
              },
            },
            required: ['jobId'],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params;

      let result: string;
      switch (name) {
        case 'create_export':
          result = await createExport(client, args);
          break;
        case 'get_job_status':
          result = await getJobStatus(client, args);
          break;
        case 'list_jobs':
          result = await listJobs(client, args);
          break;
        case 'download_export':
          result = await downloadExport(client, args);
          break;
        default:
          throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: false,
                error: errorMessage,
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (to stderr so it doesn't interfere with MCP protocol)
  console.error('ExportKit MCP server running on stdio');
}

// Run the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
