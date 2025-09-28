# Code Mode MCP Integration Architecture

## Overview

This document outlines the complete architecture for integrating real MCP (Model Context Protocol) servers with Code Mode's sandbox tool proxies. The solution provides secure, efficient, and scalable access to MCP servers while maintaining sandbox isolation and graceful fallback capabilities.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Code Mode Sandbox Environment                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐  │
│  │   User Code     │    │   Tool Proxies   │    │   VM2/Node  │  │
│  │                 │◄──►│                  │◄──►│   Sandbox   │  │
│  │ automem.store() │    │ createMCPProxy() │    │             │  │
│  └─────────────────┘    └──────────────────┘    └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Security & Orchestration Layer               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐  │
│  │ SecurityManager │    │ MCPClientManager │    │ RuntimeMgr  │  │
│  │                 │    │                  │    │             │  │
│  │ • Rate Limiting │    │ • Server Pool    │    │ • Execution │  │
│  │ • Validation    │    │ • Connection Mgr │    │ • Lifecycle │  │
│  │ • Audit Logging │    │ • Request Queue  │    │ • Cleanup   │  │
│  │ • Input Sanit.  │    │ • Health Checks  │    │ • Monitoring│  │
│  └─────────────────┘    └──────────────────┘    └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP Server Communications                  │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐  │
│  │   AutoMem       │    │    Serena        │    │  HelpScout  │  │
│  │   (HTTP)        │    │   (stdio)        │    │  (stdio)    │  │
│  │   localhost:8001│    │   uvx serena     │    │   npm help  │  │
│  │                 │    │                  │    │             │  │
│  │ • store_memory  │    │ • get_symbols    │    │ • search    │  │
│  │ • recall        │    │ • search_pattern │    │ • get_conv  │  │
│  │ • associate     │    │ • file_analysis  │    │ • summary   │  │
│  └─────────────────┘    └──────────────────┘    └─────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. MCPClientManager
**Purpose**: Manages connections to MCP servers and handles communication protocols.

**Key Features**:
- Support for stdio and HTTP MCP server types
- Connection pooling and health monitoring
- Request queuing and timeout management
- Automatic server discovery and tool introspection
- Graceful fallback to mock responses

**Example Usage**:
```typescript
const mcpClient = new MCPClientManager({
  fallbackToMock: true,
  securityEnabled: true,
  timeout: 30000
});

await mcpClient.initialize(serverConfigs);
const response = await mcpClient.sendRequest('automem', 'store_memory', params);
```

### 2. SecurityManager
**Purpose**: Provides comprehensive security boundaries for sandbox→MCP communication.

**Security Controls**:
- **Server Allowlisting**: Only approved servers can be accessed
- **Tool Validation**: Specific tools per server basis
- **Rate Limiting**: Configurable per-server request limits
- **Payload Validation**: Size limits and content sanitization
- **Audit Logging**: Complete trail of all tool calls
- **Input Sanitization**: XSS and injection prevention

**Security Policy Example**:
```typescript
const securityPolicy = {
  allowedServers: ['automem', 'serena', 'helpscout'],
  allowedTools: {
    automem: ['store_memory', 'recall', 'associate'],
    serena: ['get_symbols_overview', 'search_for_pattern']
  },
  rateLimits: {
    automem: { requestsPerMinute: 100, maxConcurrent: 10 }
  },
  dataValidation: {
    maxPayloadSize: 1024 * 1024, // 1MB
    sanitizeInputs: true
  }
};
```

### 3. Enhanced RuntimeManager
**Purpose**: Orchestrates sandbox execution with real MCP integration.

**Integration Points**:
- **Tool Proxy Creation**: Dynamic proxy objects for each MCP server
- **Security Integration**: Validates all tool calls before execution
- **Fallback Handling**: Seamless fallback to mocks when servers unavailable
- **Performance Monitoring**: Tracks execution times and resource usage
- **Error Recovery**: Graceful error handling with detailed logging

**Sandbox Integration**:
```typescript
// Tool proxies are injected into sandbox
const sandbox = {
  console: { log: (...args) => logs.push(...) },
  automem: this.createMCPToolProxy('automem', toolsCalled, securityContext),
  serena: this.createMCPToolProxy('serena', toolsCalled, securityContext),
  // ... other sandbox objects
};
```

## Communication Flow

### Successful MCP Call
1. **User Code** calls `automem.store_memory("content", 0.8)`
2. **Tool Proxy** intercepts call and formats parameters
3. **Security Manager** validates server access, rate limits, payload
4. **MCP Client** sends request to AutoMem server via HTTP/stdio
5. **AutoMem Server** processes request and returns response
6. **Response Formatting** converts MCP response to usable format
7. **User Code** receives result and continues execution

### Fallback to Mock
1. **User Code** calls `automem.store_memory("content", 0.8)`
2. **Tool Proxy** intercepts call and formats parameters
3. **Security Manager** validates (optional in mock mode)
4. **MCP Client** detects server unavailable
5. **Mock Response** generates appropriate fake response
6. **User Code** receives mock result (marked with `mock: true`)

### Security Denial
1. **User Code** calls forbidden tool or exceeds limits
2. **Tool Proxy** intercepts call and formats parameters
3. **Security Manager** validates and **DENIES** request
4. **Error Response** returns access denied with reason
5. **Audit Log** records security event for review
6. **User Code** receives error and can handle gracefully

## Error Handling Strategy

### Network Errors
- **Automatic Retry**: Exponential backoff for transient failures
- **Circuit Breaker**: Prevent cascade failures from one server
- **Graceful Degradation**: Fall back to mocks when servers unavailable
- **Health Monitoring**: Continuous health checks and status tracking

### Security Violations
- **Clear Error Messages**: Specific reason for denial
- **Audit Trail**: Complete logging for security review
- **Progressive Penalties**: Escalating rate limits for abuse
- **Safe Defaults**: Deny-by-default security posture

### Server Failures
- **Timeout Handling**: Configurable timeouts per server type
- **Resource Cleanup**: Proper cleanup of failed connections
- **Status Tracking**: Real-time server availability monitoring
- **Fallback Behavior**: Seamless mock responses when needed

## Performance Characteristics

### Latency Profile
- **Local Servers** (AutoMem, Serena): 10-50ms typical
- **Network Requests**: 100-500ms depending on server
- **Mock Responses**: 1-5ms (immediate)
- **Security Validation**: 1-2ms overhead

### Scalability Factors
- **Connection Pooling**: Reuse connections across requests
- **Request Queuing**: Handle burst traffic gracefully
- **Rate Limiting**: Prevent resource exhaustion
- **Concurrent Limits**: Control parallel request counts

### Resource Management
- **Memory Usage**: Bounded by VM2 sandbox limits
- **CPU Usage**: Minimal overhead for proxy layer
- **Network Connections**: Pooled and monitored
- **Cleanup**: Automatic resource cleanup on completion

## Configuration Management

### Runtime Configuration (`config/runtimes.json`)
```json
{
  "runtimes": {
    "typescript": {
      "language": "typescript",
      "timeout": 30000,
      "permissions": {
        "network": {
          "allowedHosts": ["localhost", "127.0.0.1"],
          "allowedPorts": [8001, 6379, 6333, 12008]
        }
      }
    }
  }
}
```

### MCP Server Configuration (`.mcp.json`)
```json
{
  "mcpServers": {
    "automem": {
      "command": "uvx",
      "args": ["mcp-proxy", "--transport", "http", "http://localhost:8001"],
      "env": {
        "AUTOMEM_API_TOKEN": "mem_7163ec31424b3e9d74b986811fd310aa"
      }
    }
  }
}
```

## Security Model

### Defense in Depth
1. **Sandbox Isolation**: VM2 prevents code escape
2. **Network Controls**: Limited host/port access
3. **Input Validation**: Comprehensive payload checking
4. **Rate Limiting**: Prevent resource exhaustion
5. **Audit Logging**: Complete activity trail
6. **Server Allowlisting**: Only approved servers accessible

### Threat Mitigation
- **Code Injection**: Input sanitization and VM2 isolation
- **Resource Exhaustion**: Rate limits and timeouts
- **Data Exfiltration**: Network controls and logging
- **Server Compromise**: Server isolation and validation
- **Privilege Escalation**: Minimal permissions and sandboxing

## Deployment Considerations

### Development Environment
- Mock fallback enabled by default
- Comprehensive logging for debugging
- Security validation in learning mode
- Performance profiling enabled

### Production Environment
- Real MCP servers with health monitoring
- Strict security enforcement
- Optimized performance settings
- Minimal logging for efficiency

### Monitoring & Observability
- **Health Dashboards**: Server status and performance metrics
- **Security Alerts**: Real-time security event notifications
- **Performance Tracking**: Latency and throughput monitoring
- **Error Analysis**: Detailed error categorization and trending

## Future Enhancements

### Short-term Improvements
- Enhanced tool discovery and schema validation
- HTTP MCP server support completion
- Advanced error recovery mechanisms
- Performance optimization and caching

### Long-term Vision
- Multi-region MCP server support
- Advanced security policies (RBAC)
- Intelligent load balancing
- Plugin architecture for custom servers

This architecture provides a robust, secure, and scalable foundation for MCP integration while maintaining the flexibility to evolve with future requirements.