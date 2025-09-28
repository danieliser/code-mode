/**
 * Security Manager for MCP Integration
 * Provides security boundaries and validation for sandbox→MCP communication
 */

import {
  SecurityPermissions,
  SecurityContext,
  SecurityValidation,
  SecurityAuditEntry
} from './types.js';


export interface SecurityPolicy {
  allowedServers: string[];
  allowedTools: {
    [serverName: string]: string[] | '*';
  };
  rateLimits: {
    [serverName: string]: {
      requestsPerMinute: number;
      maxConcurrent: number;
    };
  };
  dataValidation: {
    maxPayloadSize: number;
    allowedDataTypes: string[];
    sanitizeInputs: boolean;
  };
  auditLogging: boolean;
}

export interface AuditLogEntry {
  timestamp: Date;
  runtime: string;
  serverName: string;
  toolName: string;
  params: Record<string, any>;
  result: 'success' | 'denied' | 'error';
  reason?: string;
  duration?: number;
}

export class SecurityManager {
  private policy: SecurityPolicy;
  private rateLimitCounters: Map<string, { count: number; window: Date }> = new Map();
  private concurrentRequests: Map<string, number> = new Map();
  private auditLog: AuditLogEntry[] = [];

  constructor(policy: Partial<SecurityPolicy> = {}) {
    this.policy = {
      allowedServers: ['automem', 'serena', 'helpscout', 'wordpress'],
      allowedTools: {
        automem: ['store_memory', 'recall', 'associate', 'analyze'],
        serena: ['get_symbols_overview', 'search_for_pattern'],
        helpscout: ['searchConversations', 'getConversationSummary'],
        wordpress: ['get_site_info', 'wp_feature_query-posts']
      },
      rateLimits: {
        default: { requestsPerMinute: 60, maxConcurrent: 5 },
        automem: { requestsPerMinute: 100, maxConcurrent: 10 },
        serena: { requestsPerMinute: 30, maxConcurrent: 3 },
        helpscout: { requestsPerMinute: 20, maxConcurrent: 2 },
        wordpress: { requestsPerMinute: 30, maxConcurrent: 3 }
      },
      dataValidation: {
        maxPayloadSize: 1024 * 1024, // 1MB
        allowedDataTypes: ['string', 'number', 'boolean', 'object', 'array'],
        sanitizeInputs: true
      },
      auditLogging: true,
      ...policy
    };
  }

  /**
   * Validate if a tool call is allowed
   */
  async validateToolCall(
    context: SecurityContext,
    serverName: string,
    toolName: string,
    params: Record<string, any>
  ): Promise<SecurityValidation> {
    const validationResult = this.performSecurityChecks(context, serverName, toolName, params);

    if (this.policy.auditLogging) {
      this.logAuditEntry({
        timestamp: new Date(),
        runtime: context.runtime,
        serverName,
        toolName,
        params: this.sanitizeForLogging(params),
        result: validationResult.allowed ? 'success' : 'denied',
        reason: validationResult.reason
      });
    }

    return validationResult;
  }

  /**
   * Perform comprehensive security checks
   */
  private performSecurityChecks(
    context: SecurityContext,
    serverName: string,
    toolName: string,
    params: Record<string, any>
  ): SecurityValidation {
    // Check if server is allowed
    if (!this.policy.allowedServers.includes(serverName)) {
      return { allowed: false, reason: `Server ${serverName} not in allowed list` };
    }

    // Check if tool is allowed on this server
    const allowedTools = this.policy.allowedTools[serverName];
    if (allowedTools !== '*' && (!allowedTools || !allowedTools.includes(toolName))) {
      return { allowed: false, reason: `Tool ${toolName} not allowed on server ${serverName}` };
    }

    // Check runtime permissions
    if (!this.checkRuntimePermissions(context, serverName, toolName)) {
      return { allowed: false, reason: 'Insufficient runtime permissions' };
    }

    // Check rate limits
    if (!this.checkRateLimits(serverName)) {
      return { allowed: false, reason: 'Rate limit exceeded' };
    }

    // Validate payload size and structure
    const payloadValidation = this.validatePayload(params);
    if (!payloadValidation.valid) {
      return { allowed: false, reason: payloadValidation.reason };
    }

    // All checks passed
    return { allowed: true };
  }

  /**
   * Check if runtime has permission for this operation
   */
  private checkRuntimePermissions(context: SecurityContext, serverName: string, toolName: string): boolean {
    const { permissions } = context;

    // Check network permissions for external servers
    if (['helpscout', 'wordpress'].includes(serverName)) {
      // These servers require network access
      if (!permissions.network.allowedHosts.length) {
        return false;
      }
    }

    // Check file system permissions for local operations
    if (['serena', 'automem'].includes(serverName)) {
      // These may need local file access
      if (toolName.includes('file') || toolName.includes('read') || toolName.includes('write')) {
        if (!permissions.fileSystem.read.length && !permissions.fileSystem.write.length) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Check rate limits for server
   */
  private checkRateLimits(serverName: string): boolean {
    const limits = this.policy.rateLimits[serverName] || this.policy.rateLimits.default;
    const now = new Date();
    const key = `${serverName}:${now.getMinutes()}`;

    // Check requests per minute
    const counter = this.rateLimitCounters.get(key);
    if (counter) {
      if (counter.count >= limits.requestsPerMinute) {
        return false;
      }
      counter.count++;
    } else {
      this.rateLimitCounters.set(key, { count: 1, window: now });
    }

    // Check concurrent requests
    const concurrent = this.concurrentRequests.get(serverName) || 0;
    if (concurrent >= limits.maxConcurrent) {
      return false;
    }

    // Cleanup old rate limit entries
    this.cleanupRateLimitCounters();

    return true;
  }

  /**
   * Validate payload size and structure
   */
  private validatePayload(params: Record<string, any>): { valid: boolean; reason?: string } {
    try {
      const serialized = JSON.stringify(params);

      if (serialized.length > this.policy.dataValidation.maxPayloadSize) {
        return { valid: false, reason: 'Payload exceeds maximum size limit' };
      }

      if (this.policy.dataValidation.sanitizeInputs) {
        const sanitized = this.sanitizeInputs(params);
        if (JSON.stringify(sanitized) !== serialized) {
          return { valid: false, reason: 'Payload contains potentially unsafe content' };
        }
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, reason: 'Invalid payload structure' };
    }
  }

  /**
   * Sanitize inputs to prevent injection attacks
   */
  private sanitizeInputs(params: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous characters/patterns
        sanitized[key] = value
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/data:/gi, '')
          .replace(/vbscript:/gi, '')
          .replace(/onload|onerror|onclick/gi, '');
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = Array.isArray(value)
          ? value.map(item => typeof item === 'object' ? this.sanitizeInputs(item) : item)
          : this.sanitizeInputs(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Track concurrent requests
   */
  trackRequestStart(serverName: string): void {
    const current = this.concurrentRequests.get(serverName) || 0;
    this.concurrentRequests.set(serverName, current + 1);
  }

  /**
   * Track request completion
   */
  trackRequestEnd(serverName: string): void {
    const current = this.concurrentRequests.get(serverName) || 0;
    this.concurrentRequests.set(serverName, Math.max(0, current - 1));
  }

  /**
   * Clean up old rate limit counters
   */
  private cleanupRateLimitCounters(): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 2 * 60 * 1000); // 2 minutes ago

    for (const [key, counter] of this.rateLimitCounters.entries()) {
      if (counter.window < cutoff) {
        this.rateLimitCounters.delete(key);
      }
    }
  }

  /**
   * Sanitize data for logging (remove sensitive information)
   */
  private sanitizeForLogging(params: Record<string, any>): Record<string, any> {
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth', 'credential'];
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeForLogging(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Log audit entry
   */
  private logAuditEntry(entry: AuditLogEntry): void {
    this.auditLog.push(entry);

    // Keep only last 1000 entries
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[AUDIT] ${entry.result.toUpperCase()}: ${entry.serverName}.${entry.toolName}`,
        entry.reason ? `(${entry.reason})` : '');
    }
  }

  /**
   * Get audit log entries
   */
  getAuditLog(filter?: {
    serverName?: string;
    result?: 'success' | 'denied' | 'error';
    since?: Date;
  }): AuditLogEntry[] {
    let filtered = this.auditLog;

    if (filter) {
      filtered = filtered.filter(entry => {
        if (filter.serverName && entry.serverName !== filter.serverName) return false;
        if (filter.result && entry.result !== filter.result) return false;
        if (filter.since && entry.timestamp < filter.since) return false;
        return true;
      });
    }

    return filtered.slice(-100); // Return last 100 entries
  }

  /**
   * Update security policy
   */
  updatePolicy(updates: Partial<SecurityPolicy>): void {
    this.policy = { ...this.policy, ...updates };
  }

  /**
   * Get current security policy
   */
  getPolicy(): SecurityPolicy {
    return { ...this.policy };
  }
}