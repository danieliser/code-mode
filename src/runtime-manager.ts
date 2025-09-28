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
  SecurityPermissions
} from './types.js';

export class LocalRuntimeManager implements RuntimeManager {
  private runtimes: Map<string, RuntimeConfig> = new Map();
  private activeExecutions: Map<string, ChildProcess> = new Map();
  private toolRegistry: ToolDefinition[] = [];

  async initialize(): Promise<void> {
    // Load runtime configurations
    const configPath = path.join(process.cwd(), 'config', 'runtimes.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf-8'));

    for (const [name, runtime] of Object.entries(config.runtimes)) {
      this.runtimes.set(name, runtime as RuntimeConfig);
    }

    // Initialize tool registry from MCP servers
    await this.loadMCPTools();
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
      // Tool bindings
      helpscout: this.createToolProxy('helpscout', toolsCalled),
      wordpress: this.createToolProxy('wordpress', toolsCalled),
      serena: this.createToolProxy('serena', toolsCalled),
      automem: this.createToolProxy('automem', toolsCalled),
      // Utility functions
      fetch: this.createSecureFetch(runtime.permissions),
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

  private createToolProxy(serverName: string, toolsCalled: string[]): any {
    // This will be populated with actual MCP tool bindings
    return new Proxy({}, {
      get: (target, prop) => {
        return async (...args: any[]) => {
          toolsCalled.push(`${serverName}.${String(prop)}`);
          // TODO: Implement actual MCP server communication
          console.log(`Called ${serverName}.${String(prop)} with args:`, args);
          return { mock: true, server: serverName, method: prop, args };
        };
      }
    });
  }

  private createSecureFetch(permissions: SecurityPermissions): typeof fetch {
    return async (url: string | URL, options?: RequestInit) => {
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
      return fetch(url, options);
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

# Tool proxy functions
def helpscout_search_inboxes(query, limit=50):
    """Search HelpScout inboxes"""
    print(f"[TOOL] helpscout.searchInboxes({query}, {limit})")
    return {"mock": True, "server": "helpscout", "method": "searchInboxes"}

def wordpress_get_site_info():
    """Get WordPress site information"""
    print("[TOOL] wordpress.getSiteInfo()")
    return {"mock": True, "server": "wordpress", "method": "getSiteInfo"}

# Add more Python tool bindings here
`;
  }

  private async loadMCPTools(): Promise<void> {
    // TODO: Parse actual MCP server configurations and create tool definitions
    this.toolRegistry = [
      {
        name: 'helpscout.searchInboxes',
        description: 'Search HelpScout inboxes',
        runtime: ['typescript', 'javascript', 'python'],
        parameters: {},
        returns: {},
        examples: []
      }
      // Add more tools...
    ];
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
  }
}