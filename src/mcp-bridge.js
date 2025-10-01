#!/usr/bin/env node

/**
 * MCP Bridge for Code Mode Service
 *
 * This bridge allows Claude Code to interact with the local Code Mode service
 * through the Model Context Protocol (MCP).
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

class CodeModeMCPBridge {
  constructor() {
    this.codeMode = process.env.CODE_MODE_ENDPOINT || 'http://localhost:3001';
    this.server = new Server(
      {
        name: 'code-mode-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const response = await fetch(`${this.codeMode}/introspect`);
        const introspection = await response.json();

        const tools = [
          {
            name: 'execute_code',
            description: 'Execute TypeScript/JavaScript code with access to all MCP servers (HelpScout, WordPress, Serena, AutoMem)',
            inputSchema: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'TypeScript/JavaScript code to execute. Has access to: helpscout, wordpress, serena, automem globals'
                },
                runtime: {
                  type: 'string',
                  enum: ['typescript', 'javascript'],
                  default: 'typescript',
                  description: 'Runtime environment for code execution'
                }
              },
              required: ['code']
            }
          },
          {
            name: 'get_available_tools',
            description: 'Get all available MCP tools and their TypeScript definitions',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'check_health',
            description: 'Check Code Mode service health and connected MCP servers',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          }
        ];

        return { tools };
      } catch (error) {
        console.error('Failed to fetch tools:', error);
        return { tools: [] };
      }
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'execute_code':
            return await this.executeCode(args.code, args.runtime || 'typescript');

          case 'get_available_tools':
            return await this.getAvailableTools();

          case 'check_health':
            return await this.checkHealth();

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error: ${error.message}`
          }],
          isError: true
        };
      }
    });
  }

  async executeCode(code, runtime = 'typescript') {
    const response = await fetch(`${this.codeMode}/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, runtime })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(`Execution failed: ${JSON.stringify(result)}`);
    }

    const execution = result.result;
    let output = [];

    // Add execution result
    if (execution.success) {
      output.push({
        type: 'text',
        text: `✅ Code executed successfully\n\nResult: ${JSON.stringify(execution.output, null, 2)}`
      });
    } else {
      output.push({
        type: 'text',
        text: `❌ Execution failed\n\nErrors: ${execution.errors.join('\n')}`
      });
    }

    // Add logs if any
    if (execution.logs && execution.logs.length > 0) {
      output.push({
        type: 'text',
        text: `\nLogs:\n${execution.logs.join('\n')}`
      });
    }

    // Add metadata
    output.push({
      type: 'text',
      text: `\nExecution Time: ${execution.executionTime}ms\nTools Called: ${execution.metadata.toolsCalled.length}`
    });

    return { content: output };
  }

  async getAvailableTools() {
    const response = await fetch(`${this.codeMode}/introspect`);
    const introspection = await response.json();

    const content = [{
      type: 'text',
      text: `# Available MCP Tools (${introspection.tools.length} total)\n\n## Connected Servers: ${introspection.mcpServers.join(', ')}\n\n## TypeScript Definitions\n\`\`\`typescript\n${introspection.typeDefinitions}\n\`\`\`\n\n## Available Tools\n${introspection.tools.map(tool => `- **${tool.name}**: ${tool.description}`).join('\n')}`
    }];

    return { content };
  }

  async checkHealth() {
    try {
      const healthResponse = await fetch(`${this.codeMode}/health`);
      const health = await healthResponse.json();

      const introspectResponse = await fetch(`${this.codeMode}/introspect`);
      const introspection = await introspectResponse.json();

      const content = [{
        type: 'text',
        text: `# Code Mode Health Check\n\n✅ Service: ${health.status}\n✅ Connected MCP Servers: ${introspection.mcpServers.length}/4\n✅ Available Tools: ${introspection.tools.length}\n\n## Servers:\n${introspection.mcpServers.map(server => `- ${server}`).join('\n')}\n\n## Supported Runtimes:\n${health.runtimes.map(runtime => `- ${runtime}`).join('\n')}`
      }];

      return { content };
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Code Mode MCP Bridge started');
  }
}

// Run the bridge
const bridge = new CodeModeMCPBridge();
bridge.run().catch(console.error);

export default CodeModeMCPBridge;