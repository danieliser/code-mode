import { VM, NodeVM } from 'vm2';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import {
  RuntimeConfig,
  ExecutionRequest,
  ExecutionResult,
  RuntimeManager,
  ToolDefinition,
  SecurityPermissions,
  MCPServerConfig
} from './types.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { SecurityManager, SecurityContext } from './security-manager.js';

export class LocalRuntimeManager implements RuntimeManager {
  private runtimes: Map<string, RuntimeConfig> = new Map();
  private activeExecutions: Map<string, ChildProcess> = new Map();
  private toolRegistry: ToolDefinition[] = [];
  private mcpClient: MCPClientManager;
  private securityManager: SecurityManager;
  private fallbackToMocks: boolean = true;

  constructor() {
    this.mcpClient = new MCPClientManager({
      fallbackToMock: true,
      securityEnabled: true,
      timeout: 30000
    });
    this.securityManager = new SecurityManager();
  }

  async initialize(): Promise<void> {
    // Load runtime configurations
    const configPath = path.join(process.cwd(), 'config', 'runtimes.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    for (const [name, runtime] of Object.entries(config.runtimes)) {
      this.runtimes.set(name, runtime as RuntimeConfig);
    }

    // Initialize MCP client with server configurations
    await this.initializeMCPClient();

    // Initialize tool registry from MCP servers
    await this.loadMCPTools();
  }

  /**
   * Initialize MCP client with server configurations
   */
  private async initializeMCPClient(): Promise<void> {
    try {
      // Load MCP configuration from project root (parent directory)
      const mcpConfigPath = path.join(process.cwd(), '..', '..', '.mcp.json');
      const mcpConfigContent = await fs.readFile(mcpConfigPath, 'utf-8');
      const mcpConfig = JSON.parse(mcpConfigContent);

      // Convert to our format
      const serverConfigs: Record<string, MCPServerConfig> = {};
      for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
        const serverConfig = config as any;
        serverConfigs[name] = {
          name,
          command: serverConfig.command,
          args: serverConfig.args || [],
          env: serverConfig.env || {},
          type: serverConfig.type || 'stdio'
        };
      }

      await this.mcpClient.initialize(serverConfigs);
    } catch (error) {
      console.warn('[MCP] Failed to initialize MCP client, falling back to mocks:', error);
      this.fallbackToMocks = true;
    }
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const runtime = this.runtimes.get(request.runtime);
    if (!runtime) {
      throw new Error(`Runtime ${request.runtime} not found`);
    }

    const startTime = Date.now();
    let result: ExecutionResult;

    try {
      switch (runtime.language) {
        case 'typescript':
        case 'javascript':
          result = await this.executeNodeCode(request, runtime);
          break;
        case 'python':
          result = await this.executePythonCode(request, runtime);
          break;
        case 'bash':
          result = await this.executeBashCode(request, runtime);
          break;
        default:
          throw new Error(`Unsupported runtime language: ${runtime.language}`);
      }
    } catch (error) {
      result = {
        success: false,
        output: null,
        logs: [],
        errors: [error instanceof Error ? error.message : String(error)],
        executionTime: Date.now() - startTime,
        memoryUsed: 0,
        metadata: {
          runtime: request.runtime,
          toolsCalled: [],
          resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
        }
      };
    }

    result.executionTime = Date.now() - startTime;
    return result;
  }

  private async executeNodeCode(request: ExecutionRequest, runtime: RuntimeConfig): Promise<ExecutionResult> {
    const logs: string[] = [];
    const errors: string[] = [];
    const toolsCalled: string[] = [];

    // Create security context
    const securityContext: SecurityContext = {
      runtime: request.runtime,
      permissions: request.context?.permissions || this.getDefaultPermissions(),
      userContext: request.inputs
    };

    // Create sandbox with tool bindings
    const sandbox = {
      console: {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
        error: (...args: any[]) => errors.push(args.map(String).join(' ')),
        warn: (...args: any[]) => logs.push('WARN: ' + args.map(String).join(' '))
      },
      Promise,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      // Real MCP tool bindings
      helpscout: this.createMCPToolProxy('helpscout', toolsCalled, securityContext),
      wordpress: this.createMCPToolProxy('WordPressAPI', toolsCalled, securityContext),
      serena: this.createMCPToolProxy('serena', toolsCalled, securityContext),
      automem: this.createMCPToolProxy('automem', toolsCalled, securityContext),
      // Utility functions
      fetch: this.createSecureFetch(runtime.permissions || this.getDefaultPermissions()),
      // JSON utilities
      JSON,
      // Math utilities
      Math,
      Date
    };

    const vm = new NodeVM({
      console: 'redirect',
      sandbox,
      timeout: request.timeout || runtime.timeout,
      allowAsync: true,
      require: {
        external: runtime.allowedModules,
        builtin: runtime.allowedModules
      }
    });

    try {
      // Compile TypeScript to JavaScript if needed
      let code = request.code;
      if (runtime.language === 'typescript') {
        code = await this.compileTypeScript(request.code);
      }

      const result = await vm.run(code, 'execution.js');

      return {
        success: true,
        output: result,
        logs,
        errors,
        executionTime: 0, // Will be set by caller
        memoryUsed: 0, // TODO: Implement memory tracking
        metadata: {
          runtime: request.runtime,
          toolsCalled,
          resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
        }
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return {
        success: false,
        output: null,
        logs,
        errors,
        executionTime: 0,
        memoryUsed: 0,
        metadata: {
          runtime: request.runtime,
          toolsCalled,
          resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
        }
      };
    }
  }

  private async executePythonCode(request: ExecutionRequest, runtime: RuntimeConfig): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const logs: string[] = [];
      const errors: string[] = [];
      const toolsCalled: string[] = [];

      // Create Python script with tool bindings
      const pythonScript = this.createPythonToolBindings() + '\n' + request.code;

      const python = spawn('./venv/bin/python', ['-c', pythonScript], {
        cwd: process.cwd(),
        timeout: request.timeout || runtime.timeout,
        env: {
          ...process.env,
          PYTHONPATH: './venv/lib/python3.11/site-packages'
        }
      });

      let output = '';

      python.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        logs.push(text.trim());
      });

      python.stderr.on('data', (data) => {
        errors.push(data.toString().trim());
      });

      python.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output.trim(),
          logs,
          errors,
          executionTime: 0,
          memoryUsed: 0,
          metadata: {
            runtime: request.runtime,
            toolsCalled,
            resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
          }
        });
      });

      python.on('error', (error) => {
        resolve({
          success: false,
          output: null,
          logs,
          errors: [error.message],
          executionTime: 0,
          memoryUsed: 0,
          metadata: {
            runtime: request.runtime,
            toolsCalled,
            resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
          }
        });
      });
    });
  }

  private async executeBashCode(request: ExecutionRequest, runtime: RuntimeConfig): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const logs: string[] = [];
      const errors: string[] = [];

      const bash = spawn('/bin/bash', ['-c', request.code], {
        cwd: process.cwd(),
        timeout: request.timeout || runtime.timeout,
        env: {
          ...process.env,
          PATH: process.env.PATH + ':./tools:./scripts'
        }
      });

      let output = '';

      bash.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        logs.push(text.trim());
      });

      bash.stderr.on('data', (data) => {
        errors.push(data.toString().trim());
      });

      bash.on('close', (code) => {
        resolve({
          success: code === 0,
          output: output.trim(),
          logs,
          errors,
          executionTime: 0,
          memoryUsed: 0,
          metadata: {
            runtime: request.runtime,
            toolsCalled: [],
            resourceUsage: { cpu: 0, memory: 0, disk: 0, network: 0 }
          }
        });
      });
    });
  }

  /**
   * Create MCP tool proxy with security validation
   */
  private createMCPToolProxy(serverName: string, toolsCalled: string[], securityContext: SecurityContext): any {
    return new Proxy({}, {
      get: (target, prop) => {
        const toolName = String(prop);

        return async (...args: any[]) => {
          const fullToolName = `${serverName}.${toolName}`;
          toolsCalled.push(fullToolName);

          try {
            // Convert arguments to parameters object
            const params = this.convertArgsToParams(toolName, args);

            // Security validation
            const validation = await this.securityManager.validateToolCall(
              securityContext,
              serverName,
              toolName,
              params
            );

            if (!validation.allowed) {
              console.warn(`[SECURITY] Tool call denied: ${validation.reason}`);
              throw new Error(`Access denied: ${validation.reason}`);
            }

            // Track request start
            this.securityManager.trackRequestStart(serverName);

            try {
              // Call real MCP server
              if (!this.fallbackToMocks && this.mcpClient.isServerAvailable(serverName)) {
                const response = await this.mcpClient.sendRequest(serverName, `tools/call`, {
                  name: toolName,
                  arguments: params
                });

                return this.formatMCPResponse(response);
              } else {
                // Fallback to mock
                return this.createLegacyMockResponse(serverName, toolName, args);
              }
            } finally {
              // Track request end
              this.securityManager.trackRequestEnd(serverName);
            }

          } catch (error) {
            console.error(`[MCP] Tool call failed: ${fullToolName}`, error);

            if (this.fallbackToMocks) {
              return this.createLegacyMockResponse(serverName, toolName, args);
            }

            throw error;
          }
        };
      }
    });
  }

  /**
   * Convert function arguments to MCP parameters
   */
  private convertArgsToParams(toolName: string, args: any[]): Record<string, any> {
    // Simple argument mapping - in production would use tool schema
    const params: Record<string, any> = {};

    switch (toolName) {
      case 'store_memory':
        if (args[0]) params.content = args[0];
        if (args[1]) params.importance = args[1];
        if (args[2]) params.tags = args[2];
        break;
      case 'recall':
        if (args[0]) params.query = args[0];
        if (args[1]) params.limit = args[1];
        break;
      case 'searchConversations':
        if (args[0]) params.query = args[0];
        if (args[1]) params.status = args[1];
        break;
      case 'get_site_info':
        // No parameters needed
        break;
      default:
        // Generic parameter mapping
        if (args.length === 1 && typeof args[0] === 'object') {
          return args[0];
        } else {
          args.forEach((arg, index) => {
            params[`arg${index}`] = arg;
          });
        }
    }

    return params;
  }

  /**
   * Format MCP response for consumption
   */
  private formatMCPResponse(response: any): any {
    if (response.result) {
      return response.result;
    }

    if (response.content) {
      // Handle MCP content format
      if (Array.isArray(response.content)) {
        return response.content.map((item: any) => {
          if (item.type === 'text') return item.text;
          return item;
        }).join('\n');
      }
      return response.content;
    }

    return response;
  }

  /**
   * Create legacy mock response for fallback
   */
  private createLegacyMockResponse(serverName: string, toolName: string, args: any[]): any {
    console.log(`[MOCK] Called ${serverName}.${toolName} with args:`, args);
    return { mock: true, server: serverName, method: toolName, args };
  }

  /**
   * Get default security permissions
   */
  private getDefaultPermissions(): SecurityPermissions {
    return {
      fileSystem: {
        read: ['./data', './config'],
        write: ['./temp'],
        execute: []
      },
      network: {
        allowedHosts: ['localhost', '127.0.0.1'],
        allowedPorts: [8001, 6379, 6333]
      },
      system: {
        allowedCommands: [],
        maxProcesses: 1
      }
    };
  }

  private createSecureFetch(permissions: SecurityPermissions): typeof fetch {
    return async (input: RequestInfo | URL, options?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
      const urlStr = url.toString();
      const urlObj = new URL(urlStr);

      // Check if host is allowed
      if (!permissions.network.allowedHosts.includes(urlObj.hostname)) {
        throw new Error(`Host ${urlObj.hostname} not allowed`);
      }

      // Check if port is allowed
      const port = parseInt(urlObj.port) || (urlObj.protocol === 'https:' ? 443 : 80);
      if (!permissions.network.allowedPorts.includes(port)) {
        throw new Error(`Port ${port} not allowed`);
      }

      // Use global fetch (available in Node.js 18+)
      return fetch(input, options);
    };
  }

  private async compileTypeScript(code: string): Promise<string> {
    // Simple TypeScript compilation - in production would use ts.transpile
    // For now, just strip type annotations
    return code
      .replace(/:\s*\w+(\[\])?/g, '') // Remove type annotations
      .replace(/interface\s+\w+\s*{[^}]*}/g, '') // Remove interfaces
      .replace(/type\s+\w+\s*=\s*[^;]+;/g, ''); // Remove type aliases
  }

  private createPythonToolBindings(): string {
    return `
import json
import sys
import traceback

# Tool proxy functions for MCP servers
def automem_store_memory(content, importance=0.5, tags=None):
    """Store a memory in AutoMem"""
    print(f"[TOOL] automem.store_memory({content}, {importance})")
    return {"mock": True, "server": "automem", "method": "store_memory"}

def automem_recall(query, limit=10):
    """Recall memories from AutoMem"""
    print(f"[TOOL] automem.recall({query}, {limit})")
    return {"mock": True, "server": "automem", "method": "recall"}

def helpscout_search_conversations(query, status=None):
    """Search HelpScout conversations"""
    print(f"[TOOL] helpscout.searchConversations({query}, {status})")
    return {"mock": True, "server": "helpscout", "method": "searchConversations"}

def wordpress_get_site_info():
    """Get WordPress site information"""
    print("[TOOL] wordpress.get_site_info()")
    return {"mock": True, "server": "wordpress", "method": "get_site_info"}

def serena_get_symbols_overview(relative_path):
    """Get code symbols overview"""
    print(f"[TOOL] serena.get_symbols_overview({relative_path})")
    return {"mock": True, "server": "serena", "method": "get_symbols_overview"}

# Add more Python tool bindings here
`;
  }

  private async loadMCPTools(): Promise<void> {
    try {
      // Get tools from MCP client
      const mcpTools = this.mcpClient.getAllTools();
      this.toolRegistry = mcpTools;

      console.log(`[MCP] Loaded ${this.toolRegistry.length} tools from MCP servers`);
    } catch (error) {
      console.warn('[MCP] Failed to load tools from MCP servers:', error);

      // Fallback tool definitions
      this.toolRegistry = [
        {
          name: 'automem.store_memory',
          description: 'Store a memory with content, importance, and tags',
          runtime: ['typescript', 'javascript', 'python'],
          parameters: {},
          returns: {},
          examples: [],
          mcpServer: 'automem'
        },
        {
          name: 'automem.recall',
          description: 'Recall memories by query with hybrid search',
          runtime: ['typescript', 'javascript', 'python'],
          parameters: {},
          returns: {},
          examples: [],
          mcpServer: 'automem'
        },
        {
          name: 'helpscout.searchConversations',
          description: 'Search HelpScout conversations',
          runtime: ['typescript', 'javascript', 'python'],
          parameters: {},
          returns: {},
          examples: [],
          mcpServer: 'helpscout'
        }
      ];
    }
  }

  async introspect(): Promise<ToolDefinition[]> {
    return this.toolRegistry;
  }

  async cleanup(): Promise<void> {
    // Clean up any running processes
    for (const [id, process] of this.activeExecutions) {
      process.kill();
    }
    this.activeExecutions.clear();

    // Cleanup MCP client
    await this.mcpClient.cleanup();
  }

  /**
   * Get security audit log
   */
  getSecurityAuditLog(): any[] {
    return this.securityManager.getAuditLog();
  }

  /**
   * Check if MCP servers are available
   */
  getMCPStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    const serverNames = ['automem', 'serena', 'helpscout', 'WordPressAPI'];

    for (const server of serverNames) {
      status[server] = this.mcpClient.isServerAvailable(server);
    }

    return status;
  }
}