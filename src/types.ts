// Core runtime and execution types

export interface RuntimeConfig {
  name: string;
  language: 'typescript' | 'python' | 'javascript' | 'bash';
  version: string;
  timeout: number;
  memoryLimit: string;
  allowedModules: string[];
  deniedOperations: string[];
  sandboxType: 'vm2' | 'docker' | 'worker' | 'subprocess';
  permissions?: SecurityPermissions;
}

export interface ExecutionRequest {
  runtime: string;
  code: string;
  timeout?: number;
  inputs?: Record<string, any>;
  context?: ExecutionContext;
}

export interface ExecutionContext {
  workingDirectory: string;
  environmentVars: Record<string, string>;
  availableTools: string[];
  permissions: SecurityPermissions;
}

export interface SecurityPermissions {
  fileSystem: {
    read: string[];
    write: string[];
    execute: string[];
  };
  network: {
    allowedHosts: string[];
    allowedPorts: number[];
  };
  system: {
    allowedCommands: string[];
    maxProcesses: number;
  };
}

export interface ExecutionResult {
  success: boolean;
  output: any;
  logs: string[];
  errors: string[];
  executionTime: number;
  memoryUsed: number;
  metadata: {
    runtime: string;
    toolsCalled: string[];
    resourceUsage: ResourceUsage;
  };
}

export interface ResourceUsage {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
}

export interface ToolDefinition {
  name: string;
  description: string;
  runtime: string[];
  parameters: any; // JSON Schema
  returns: any;
  examples: CodeExample[];
  mcpServer?: string;
}

export interface CodeExample {
  language: string;
  code: string;
  description: string;
  expectedOutput?: any;
}

export interface RuntimeManager {
  initialize(): Promise<void>;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  introspect(): Promise<ToolDefinition[]>;
  cleanup(): Promise<void>;
}

// MCP Integration Types
export interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  type?: 'stdio' | 'http';
}

export interface MCPToolMapping {
  mcpServer: string;
  mcpTool: string;
  runtimeBindings: {
    [runtime: string]: {
      functionName: string;
      interface: string;
      implementation: string;
    };
  };
}

// Security types
export interface SecurityContext {
  runtime: string;
  permissions: SecurityPermissions;
  userContext?: Record<string, any>;
}

export interface SecurityValidation {
  allowed: boolean;
  reason?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

// MCP Client types
export interface MCPClientConfig {
  fallbackToMock?: boolean;
  securityEnabled?: boolean;
  timeout?: number;
  retryAttempts?: number;
  connectionTimeout?: number;
}

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params?: Record<string, any>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export interface MCPConnection {
  serverId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  lastPing?: number;
  errorCount: number;
  process?: any;
}

// Rate limiting types
export interface RateLimit {
  windowMs: number;
  maxRequests: number;
  currentCount: number;
  windowStart: number;
}

export interface SecurityAuditEntry {
  timestamp: number;
  serverName: string;
  toolName: string;
  allowed: boolean;
  reason?: string;
  userContext?: Record<string, any>;
}