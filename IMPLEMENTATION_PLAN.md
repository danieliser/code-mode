# MCP Integration Implementation Plan

## Overview
This document outlines the implementation plan for integrating real MCP servers with Code Mode's sandbox tool proxies, starting with AutoMem and expanding incrementally.

## Phase 1: Core Infrastructure (✅ Complete)

### Completed Components
- **MCPClientManager**: Handles connections to MCP servers (stdio/http)
- **SecurityManager**: Provides security boundaries and validation
- **Enhanced RuntimeManager**: Integrates MCP client with existing sandbox

### Architecture Benefits
- **Graceful Degradation**: Falls back to mocks when MCP servers unavailable
- **Security First**: Comprehensive validation and rate limiting
- **Incremental Rollout**: Can enable/disable servers individually

## Phase 2: AutoMem Integration (Next)

### 2.1 AutoMem Server Validation
```bash
# Verify AutoMem server is running
curl http://localhost:8001/health

# Test basic memory operations
curl -X POST http://localhost:8001/memory \
  -H "Authorization: Bearer mem_7163ec31424b3e9d74b986811fd310aa" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test memory", "importance": 0.8}'
```

### 2.2 Runtime Configuration
Create `/config/runtimes.json`:
```json
{
  "runtimes": {
    "node": {
      "name": "node",
      "language": "typescript",
      "version": "18",
      "timeout": 30000,
      "memoryLimit": "512MB",
      "allowedModules": ["path", "fs"],
      "deniedOperations": ["eval", "Function"],
      "sandboxType": "vm2",
      "permissions": {
        "fileSystem": {
          "read": ["./data", "./config"],
          "write": ["./temp"],
          "execute": []
        },
        "network": {
          "allowedHosts": ["localhost", "127.0.0.1"],
          "allowedPorts": [8001, 6379, 6333]
        },
        "system": {
          "allowedCommands": [],
          "maxProcesses": 1
        }
      }
    }
  }
}
```

### 2.3 Test AutoMem Integration
```typescript
// Test code for sandbox execution
const result = await automem.store_memory(
  "Code execution test from sandbox",
  0.7,
  ["testing", "sandbox", "mcp"]
);

const memories = await automem.recall("sandbox test", 5);
console.log("Stored and recalled:", { result, memories });
```

### 2.4 Security Validation
- Rate limits: 100 requests/minute for AutoMem
- Payload validation: Max 1MB
- Input sanitization enabled
- Audit logging active

## Phase 3: Testing & Validation

### 3.1 Integration Tests
```bash
# Run in services/code-mode/
npm test -- --grep "MCP Integration"
```

### 3.2 Security Tests
- Verify rate limiting works
- Test malicious payload rejection
- Validate audit logging
- Check fallback behavior

### 3.3 Performance Tests
- Measure MCP vs mock latency
- Test concurrent request handling
- Validate memory usage

## Phase 4: Additional Servers (Future)

### 4.1 Serena Integration
- Enable stdio communication
- Add code analysis tools
- Configure project context

### 4.2 HelpScout Integration
- Verify API credentials
- Add conversation search tools
- Configure customer data access

### 4.3 WordPress Integration
- Test HTTP proxy connection
- Add site information tools
- Configure content management

## Deployment Strategy

### Quick Start (Recommended)
1. **Enable AutoMem Only**: Start with single server for safety
2. **Monitor Logs**: Watch for errors and performance issues
3. **Gradual Expansion**: Add servers one at a time
4. **Rollback Ready**: Keep mock fallback enabled

### Configuration Toggles
```typescript
// In runtime-manager.ts constructor
this.mcpClient = new MCPClientManager({
  fallbackToMock: true,        // Set false only when confident
  securityEnabled: true,       // Always keep enabled
  timeout: 30000              // Adjust based on server response times
});
```

### Environment Variables
```bash
# Optional: Override default timeouts
export MCP_CLIENT_TIMEOUT=45000
export MCP_SECURITY_ENABLED=true
export MCP_AUDIT_LOGGING=true
```

## Monitoring & Observability

### Key Metrics
- MCP request success rate
- Average response times
- Security denial rate
- Fallback usage percentage

### Logging Points
- Server connection status
- Tool call attempts
- Security validations
- Error conditions
- Performance metrics

### Health Checks
```typescript
// Check MCP server status
const status = runtimeManager.getMCPStatus();
console.log('MCP Status:', status);

// Review security audit
const audit = runtimeManager.getSecurityAuditLog();
console.log('Recent security events:', audit.slice(-10));
```

## Error Handling & Recovery

### Connection Failures
- Automatic retry with exponential backoff
- Graceful fallback to mock responses
- Server status monitoring
- Health check endpoints

### Security Violations
- Request blocking with clear error messages
- Audit logging for security review
- Rate limit enforcement
- Payload validation

### Performance Issues
- Request timeout handling
- Concurrent request limiting
- Memory usage monitoring
- Resource cleanup

## Success Criteria

### Phase 1 (Infrastructure) ✅
- [x] MCP client manager implemented
- [x] Security framework in place
- [x] Runtime manager updated
- [x] Graceful fallback working

### Phase 2 (AutoMem)
- [ ] AutoMem server communication working
- [ ] Memory storage/recall from sandbox
- [ ] Security validation passing
- [ ] Performance within acceptable limits

### Phase 3 (Validation)
- [ ] All tests passing
- [ ] Security audit clean
- [ ] Performance benchmarks met
- [ ] Error handling verified

### Phase 4 (Expansion)
- [ ] Additional servers integrated
- [ ] Multi-server coordination working
- [ ] Production deployment ready
- [ ] Monitoring dashboard active

## Risk Mitigation

### Technical Risks
- **Server Unavailability**: Graceful fallback to mocks
- **Performance Degradation**: Timeout controls and monitoring
- **Security Vulnerabilities**: Comprehensive validation framework
- **Memory Leaks**: Proper cleanup and resource management

### Operational Risks
- **Configuration Errors**: Validation and testing procedures
- **Deployment Issues**: Incremental rollout strategy
- **Monitoring Gaps**: Comprehensive logging and metrics
- **Team Knowledge**: Documentation and training materials

## Next Steps

1. **Immediate**: Test AutoMem integration in development
2. **Short-term**: Add comprehensive test coverage
3. **Medium-term**: Enable additional MCP servers
4. **Long-term**: Production deployment and optimization

This implementation provides a solid foundation for secure, scalable MCP integration while maintaining system reliability through graceful degradation and comprehensive security controls.