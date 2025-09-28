/**
 * MCP Client Manager
 * Manages connections to MCP servers and provides secure tool proxy integration
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import {
  MCPServerConfig,
  ToolDefinition,
  MCPClientConfig,
  MCPRequest,
  MCPResponse,
  MCPConnection
} from './types.js';

export interface MCPServerInstance {
  name: string;
  config: MCPServerConfig;
  process?: ChildProcess;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  tools: Map<string, ToolDefinition>;
  lastHeartbeat: Date;
  requestQueue: Array<{
    id: string;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
}

export class MCPClientManager extends EventEmitter {
  private servers: Map<string, MCPServerInstance> = new Map();
  private config: MCPClientConfig;
  private requestCounter = 0;
  private initialized = false;

  constructor(config: Partial<MCPClientConfig> = {}) {
    super();
    this.config = {
      timeout: 30000,
      retryAttempts: 3,
      fallbackToMock: true,
      securityEnabled: true,
      connectionTimeout: 10000,
      ...config
    };
  }

  /**
   * Initialize MCP client manager with server configurations
   */
  async initialize(serverConfigs: Record<string, MCPServerConfig>): Promise<void> {
    if (this.initialized) return;

    console.log('[MCP] Initializing MCP Client Manager...');

    // Initialize each server
    for (const [name, config] of Object.entries(serverConfigs)) {
      try {
        await this.initializeServer(name, config);
      } catch (error) {
        console.error(`[MCP] Failed to initialize server ${name}:`, error);
        if (!this.config.fallbackToMock) {
          throw error;
        }
      }
    }

    this.initialized = true;
    console.log('[MCP] Client Manager initialized successfully');
  }

  /**
   * Initialize a single MCP server
   */
  private async initializeServer(name: string, config: MCPServerConfig): Promise<void> {
    const server: MCPServerInstance = {
      name,
      config,
      status: 'starting',
      tools: new Map(),
      lastHeartbeat: new Date(),
      requestQueue: []
    };

    this.servers.set(name, server);

    try {
      if (config.type === 'stdio') {
        await this.startStdioServer(server);
      } else if (config.type === 'http') {
        await this.startHttpServer(server);
      } else {
        // Default to stdio
        await this.startStdioServer(server);
      }

      // Note: Tool discovery happens after successful handshake in startStdioServer
      server.status = 'ready';
      console.log(`[MCP] Server ${name} ready with ${server.tools.size} tools`);
    } catch (error) {
      server.status = 'error';
      console.error(`[MCP] Server ${name} failed to start:`, error);
      throw error;
    }
  }

  /**
   * Start stdio-based MCP server
   */
  private async startStdioServer(server: MCPServerInstance): Promise<void> {
    return new Promise((resolve, reject) => {
      const { command, args = [], env = {} } = server.config;

      console.log(`[MCP] Starting stdio server ${server.name}`);
      console.log(`[MCP] Command: ${command}`);
      console.log(`[MCP] Args:`, args);
      console.log(`[MCP] Env vars:`, Object.keys(env));

      server.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
        cwd: process.cwd()
      });

      if (!server.process.stdout || !server.process.stdin) {
        reject(new Error('Failed to establish stdio communication'));
        return;
      }

      let initBuffer = '';
      const onData = (data: Buffer) => {
        initBuffer += data.toString();
        if (initBuffer.includes('\n')) {
          server.process!.stdout!.off('data', onData);
          resolve();
        }
      };

      server.process.stdout.on('data', onData);

      server.process.on('error', (error) => {
        console.error(`[MCP] Server ${server.name} process error:`, error);
        reject(new Error(`Server process error: ${error.message}`));
      });

      server.process.on('exit', (code) => {
        console.log(`[MCP] Server ${server.name} exited with code ${code}`);
        if (code !== 0) {
          server.status = 'error';
          console.error(`[MCP] Server ${server.name} failed with exit code ${code}`);
        }
      });

      // Log stderr output for debugging
      server.process.stderr?.on('data', (data) => {
        console.error(`[MCP] ${server.name} stderr:`, data.toString());
      });

      // Send initialization handshake and wait for response
      const initRequest = {
        jsonrpc: '2.0',
        id: this.generateRequestId(),
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          clientInfo: {
            name: 'CompanyKit-CodeMode',
            version: '1.0.0'
          }
        }
      };

      // Set up response handler for initialization
      const initTimeout = setTimeout(() => {
        if (server.status === 'starting') {
          reject(new Error('Server initialization timeout'));
        }
      }, this.config.timeout);

      const initResponseHandler = (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          if (response.id === initRequest.id) {
            clearTimeout(initTimeout);
            server.process!.stdout!.off('data', initResponseHandler);

            // Send initialized notification
            this.sendStdioMessage(server, {
              jsonrpc: '2.0',
              method: 'notifications/initialized'
            });

            // Now discover tools after handshake is complete
            // Give server a moment to fully initialize before tool discovery
            setTimeout(() => {
              this.discoverServerTools(server).then(() => {
                console.log(`[MCP] Tool discovery completed for ${server.name}`);
              }).catch(error => {
                console.warn(`[MCP] Tool discovery failed for ${server.name}:`, error);
              });
            }, 1000); // Wait 1 second for server to be fully ready

            resolve();
          }
        } catch (error) {
          // Ignore parse errors
        }
      };

      server.process.stdout.on('data', initResponseHandler);
      this.sendStdioMessage(server, initRequest);
    });
  }

  /**
   * Start HTTP-based MCP server (placeholder for future implementation)
   */
  private async startHttpServer(server: MCPServerInstance): Promise<void> {
    // For HTTP servers, we assume they're already running
    // and we just need to validate connectivity
    console.log(`[MCP] HTTP server ${server.name} - assuming already running`);
  }

  /**
   * Discover tools available on a server
   */
  private async discoverServerTools(server: MCPServerInstance): Promise<void> {
    try {
      console.log(`[MCP] Discovering tools for ${server.name}...`);
      const response = await this.sendRequest(server.name, 'tools/list');
      console.log(`[MCP] Tools response for ${server.name}:`, JSON.stringify(response, null, 2));

      if (response.result?.tools) {
        console.log(`[MCP] Found ${response.result.tools.length} tools for ${server.name}`);
        for (const tool of response.result.tools) {
          const toolDef: ToolDefinition = {
            name: tool.name,
            description: tool.description || '',
            runtime: ['typescript', 'javascript', 'python'],
            parameters: tool.inputSchema || {},
            returns: {},
            examples: [],
            mcpServer: server.name
          };

          server.tools.set(tool.name, toolDef);
          console.log(`[MCP] Added tool: ${tool.name} from ${server.name}`);
        }
      } else {
        console.log(`[MCP] No tools found in response for ${server.name}:`, response);
      }
    } catch (error) {
      console.warn(`[MCP] Failed to discover tools for ${server.name}:`, error);
    }
  }

  /**
   * Send request to MCP server
   */
  async sendRequest(serverName: string, method: string, params?: Record<string, any>): Promise<MCPResponse> {
    const server = this.servers.get(serverName);
    if (!server) {
      throw new Error(`Server ${serverName} not found`);
    }

    if (server.status !== 'ready') {
      if (this.config.fallbackToMock) {
        return this.generateMockResponse(method, params);
      }
      throw new Error(`Server ${serverName} not ready (status: ${server.status})`);
    }

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method,
      params
    };

    if (server.config.type === 'http') {
      return this.sendHttpRequest(server, request);
    } else {
      return this.sendStdioRequest(server, request);
    }
  }

  /**
   * Send stdio request to MCP server
   */
  private async sendStdioRequest(server: MCPServerInstance, request: MCPRequest): Promise<MCPResponse> {
    return new Promise((resolve, reject) => {
      if (!server.process?.stdin || !server.process?.stdout) {
        reject(new Error('Server process not available'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, this.config.timeout);

      const queueItem = {
        id: request.id,
        resolve: (value: MCPResponse) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout
      };

      server.requestQueue.push(queueItem);

      // Set up response handler if not already set
      if (!server.process.stdout.listenerCount('data')) {
        server.process.stdout.on('data', (data) => {
          this.handleStdioResponse(server, data);
        });
      }

      // Send request
      this.sendStdioMessage(server, request);
    });
  }

  /**
   * Handle stdio response from MCP server
   */
  private handleStdioResponse(server: MCPServerInstance, data: Buffer): void {
    const response = data.toString().trim();
    if (!response) return;

    try {
      const parsed: MCPResponse = JSON.parse(response);

      // Find corresponding request in queue
      const queueIndex = server.requestQueue.findIndex(item => item.id === parsed.id);
      if (queueIndex >= 0) {
        const queueItem = server.requestQueue.splice(queueIndex, 1)[0];

        if (parsed.error) {
          queueItem.reject(new Error(`MCP Error: ${parsed.error.message}`));
        } else {
          queueItem.resolve(parsed);
        }
      }
    } catch (error) {
      console.error(`[MCP] Failed to parse response from ${server.name}:`, error);
    }
  }

  /**
   * Send HTTP request to MCP server (placeholder)
   */
  private async sendHttpRequest(server: MCPServerInstance, request: MCPRequest): Promise<MCPResponse> {
    // Implement HTTP MCP communication when needed
    throw new Error('HTTP MCP servers not yet implemented');
  }

  /**
   * Send message to stdio server
   */
  private sendStdioMessage(server: MCPServerInstance, message: MCPRequest | { jsonrpc: '2.0'; method: string; params?: any }): void {
    if (!server.process?.stdin) {
      throw new Error('Server stdin not available');
    }

    const data = JSON.stringify(message) + '\n';
    server.process.stdin.write(data);
  }

  /**
   * Generate mock response for fallback
   */
  private generateMockResponse(method: string, params?: Record<string, any>): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      result: {
        mock: true,
        method,
        params,
        message: 'Mock response - MCP server not available'
      }
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${++this.requestCounter}_${Date.now()}`;
  }

  /**
   * Get all available tools across servers
   */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const server of this.servers.values()) {
      tools.push(...Array.from(server.tools.values()));
    }
    return tools;
  }

  /**
   * Get tools from specific server
   */
  getServerTools(serverName: string): ToolDefinition[] {
    const server = this.servers.get(serverName);
    return server ? Array.from(server.tools.values()) : [];
  }

  /**
   * Check if server is available
   */
  isServerAvailable(serverName: string): boolean {
    const server = this.servers.get(serverName);
    return server?.status === 'ready';
  }

  /**
   * Cleanup all servers
   */
  async cleanup(): Promise<void> {
    for (const server of this.servers.values()) {
      if (server.process) {
        server.process.kill();
      }
    }
    this.servers.clear();
    this.initialized = false;
  }
}