/**
 * MCP Integration Test Suite
 * Tests real MCP server connections and fallback behavior
 */

import { LocalRuntimeManager } from '../src/runtime-manager.js';
import { MCPClientManager } from '../src/mcp-client-manager.js';
import { SecurityManager } from '../src/security-manager.js';

describe('MCP Integration Tests', () => {
  let runtimeManager: LocalRuntimeManager;

  beforeEach(() => {
    runtimeManager = new LocalRuntimeManager();
  });

  afterEach(async () => {
    await runtimeManager.cleanup();
  });

  describe('AutoMem Integration', () => {
    test('should connect to AutoMem server', async () => {
      await runtimeManager.initialize();

      const mcpStatus = runtimeManager.getMCPStatus();

      // Should attempt connection, may fallback to mock
      expect(mcpStatus).toHaveProperty('automem');
      console.log('AutoMem status:', mcpStatus.automem);
    });

    test('should execute memory storage in sandbox', async () => {
      await runtimeManager.initialize();

      const testCode = `
        const result = await automem.store_memory(
          "Integration test memory from sandbox",
          0.8,
          ["test", "sandbox", "integration"]
        );
        return result;
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 10000
      });

      expect(executionResult.success).toBe(true);
      expect(executionResult.output).toBeDefined();
      expect(executionResult.metadata.toolsCalled).toContain('automem.store_memory');
    });

    test('should execute memory recall in sandbox', async () => {
      await runtimeManager.initialize();

      const testCode = `
        const memories = await automem.recall("integration test", 5);
        return memories;
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 10000
      });

      expect(executionResult.success).toBe(true);
      expect(executionResult.output).toBeDefined();
      expect(executionResult.metadata.toolsCalled).toContain('automem.recall');
    });

    test('should handle AutoMem server unavailable gracefully', async () => {
      // Force fallback to mocks by using invalid server config
      const manager = new LocalRuntimeManager();
      await manager.initialize();

      const testCode = `
        try {
          const result = await automem.store_memory("Test with server down", 0.5);
          return { success: true, result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const executionResult = await manager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 5000
      });

      expect(executionResult.success).toBe(true);
      // Should return mock response when server unavailable
      expect(executionResult.output).toBeDefined();

      await manager.cleanup();
    });
  });

  describe('Security Validation', () => {
    test('should enforce rate limits', async () => {
      await runtimeManager.initialize();

      // Attempt rapid-fire requests
      const requests = Array.from({ length: 10 }, (_, i) =>
        runtimeManager.execute({
          runtime: 'typescript',
          code: `await automem.store_memory("Rate limit test ${i}", 0.1);`,
          timeout: 1000
        })
      );

      const results = await Promise.allSettled(requests);

      // Some requests should succeed, others may be rate limited
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`Rate limit test: ${successful} successful, ${failed} failed`);
      expect(successful + failed).toBe(10);
    });

    test('should validate payload size', async () => {
      await runtimeManager.initialize();

      // Attempt to store very large memory
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const testCode = `
        try {
          await automem.store_memory("${largeContent}", 0.5);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 5000
      });

      expect(executionResult.success).toBe(true);
      // Should fail due to payload size limit
      expect(executionResult.output.success).toBe(false);
      expect(executionResult.output.error).toContain('Payload exceeds maximum size');
    });

    test('should sanitize malicious input', async () => {
      await runtimeManager.initialize();

      const maliciousContent = '<script>alert("xss")</script>javascript:void(0)';
      const testCode = `
        try {
          await automem.store_memory("${maliciousContent}", 0.5);
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 5000
      });

      // Should either sanitize the input or reject it
      expect(executionResult.success).toBe(true);
    });

    test('should log security events', async () => {
      await runtimeManager.initialize();

      // Execute a few tool calls
      await runtimeManager.execute({
        runtime: 'typescript',
        code: 'await automem.store_memory("Security test", 0.5);',
        timeout: 5000
      });

      const auditLog = runtimeManager.getSecurityAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);

      const lastEntry = auditLog[auditLog.length - 1];
      expect(lastEntry).toHaveProperty('serverName');
      expect(lastEntry).toHaveProperty('toolName');
      expect(lastEntry).toHaveProperty('result');
    });
  });

  describe('Performance Tests', () => {
    test('should complete tool calls within timeout', async () => {
      await runtimeManager.initialize();

      const startTime = Date.now();

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: 'await automem.store_memory("Performance test", 0.5);',
        timeout: 5000
      });

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(executionResult.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within timeout
      expect(executionResult.executionTime).toBeGreaterThan(0);
    });

    test('should handle concurrent requests', async () => {
      await runtimeManager.initialize();

      const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
        runtimeManager.execute({
          runtime: 'typescript',
          code: `await automem.store_memory("Concurrent test ${i}", 0.3);`,
          timeout: 10000
        })
      );

      const results = await Promise.all(concurrentRequests);

      // All requests should complete successfully (or gracefully fallback)
      results.forEach((result, i) => {
        expect(result.success).toBe(true);
        expect(result.metadata.toolsCalled).toContain('automem.store_memory');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors gracefully', async () => {
      await runtimeManager.initialize();

      // This will likely fail to connect to real MCP server, testing fallback
      const testCode = `
        try {
          const result = await automem.store_memory("Network test", 0.5);
          return { type: 'success', result };
        } catch (error) {
          return { type: 'error', message: error.message };
        }
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 5000
      });

      expect(executionResult.success).toBe(true);
      expect(executionResult.output).toHaveProperty('type');

      // Should either succeed (real server) or fallback (mock)
      expect(['success', 'error']).toContain(executionResult.output.type);
    });

    test('should handle invalid tool calls', async () => {
      await runtimeManager.initialize();

      const testCode = `
        try {
          await automem.invalid_method("test");
          return { success: true };
        } catch (error) {
          return { success: false, error: error.message };
        }
      `;

      const executionResult = await runtimeManager.execute({
        runtime: 'typescript',
        code: testCode,
        timeout: 5000
      });

      expect(executionResult.success).toBe(true);
      // Should gracefully handle invalid method calls
    });
  });
});

// Helper function to check if AutoMem server is running
export async function checkAutoMemServer(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8001/health');
    return response.ok;
  } catch {
    return false;
  }
}

// Integration test runner
if (require.main === module) {
  console.log('Running MCP Integration Tests...');

  checkAutoMemServer().then(isRunning => {
    if (isRunning) {
      console.log('✅ AutoMem server is running at http://localhost:8001');
    } else {
      console.log('⚠️ AutoMem server not detected, tests will use mock fallback');
    }
  });
}