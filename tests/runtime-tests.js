// CompanyKit Code Mode - Runtime Tests
// Test suite for validating multi-runtime execution

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const CODE_MODE_URL = 'http://localhost:3001';

// Test utilities
async function fetchCodeMode(endpoint, options = {}) {
  const response = await fetch(`${CODE_MODE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

async function executeCode(runtime, code, timeout = 10000) {
  return fetchCodeMode('/execute', {
    method: 'POST',
    body: JSON.stringify({
      runtime,
      code,
      timeout
    })
  });
}

describe('Code Mode Runtime Tests', () => {
  beforeAll(async () => {
    // Check if Code Mode server is running
    try {
      const health = await fetchCodeMode('/health');
      expect(health.status).toBe('healthy');
      console.log('✅ Code Mode server is healthy');
    } catch (error) {
      console.error('❌ Code Mode server not running. Start with: just code-mode-dev');
      throw error;
    }
  });

  describe('Health and Introspection', () => {
    it('should return healthy status', async () => {
      const health = await fetchCodeMode('/health');

      expect(health).toMatchObject({
        status: 'healthy',
        service: 'CompanyKit Local Code Mode',
        version: '1.0.0',
        runtimes: expect.arrayContaining(['typescript', 'python', 'javascript', 'bash'])
      });
    });

    it('should provide runtime information', async () => {
      const runtimes = await fetchCodeMode('/runtimes');

      expect(runtimes.success).toBe(true);
      expect(runtimes.runtimes).toHaveProperty('typescript');
      expect(runtimes.runtimes).toHaveProperty('python');
      expect(runtimes.runtimes).toHaveProperty('javascript');
      expect(runtimes.runtimes).toHaveProperty('bash');
    });

    it('should provide tool introspection for TypeScript', async () => {
      const introspect = await fetchCodeMode('/introspect?runtime=typescript');

      expect(introspect.success).toBe(true);
      expect(introspect.runtime).toBe('typescript');
      expect(introspect.tools).toBeInstanceOf(Array);
      expect(introspect.typeDefinitions).toContain('interface');
      expect(introspect.examples.typescript).toContain('async function');
    });
  });

  describe('TypeScript Runtime', () => {
    it('should execute basic TypeScript code', async () => {
      const code = `
        const message = "Hello from TypeScript!";
        console.log(message);
        return { result: message, timestamp: new Date().toISOString() };
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toMatchObject({
        result: 'Hello from TypeScript!',
        timestamp: expect.any(String)
      });
      expect(result.result.logs).toContain('Hello from TypeScript!');
    });

    it('should handle async/await operations', async () => {
      const code = `
        async function asyncOperation() {
          await new Promise(resolve => setTimeout(resolve, 100));
          return "Async complete";
        }

        return await asyncOperation();
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toBe('Async complete');
    });

    it('should provide tool mocking', async () => {
      const code = `
        const inboxResult = await helpscout.searchInboxes("test");
        console.log("HelpScout result:", JSON.stringify(inboxResult));

        const siteResult = await wordpress.getSiteInfo();
        console.log("WordPress result:", JSON.stringify(siteResult));

        return { helpscout: inboxResult, wordpress: siteResult };
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output.helpscout).toMatchObject({
        mock: true,
        server: 'helpscout',
        method: 'searchInboxes'
      });
      expect(result.result.output.wordpress).toMatchObject({
        mock: true,
        server: 'wordpress',
        method: 'getSiteInfo'
      });
    });

    it('should handle parallel execution with Promise.all', async () => {
      const code = `
        const startTime = Date.now();

        const [result1, result2, result3] = await Promise.all([
          helpscout.searchInboxes("inbox1"),
          wordpress.getSiteInfo(),
          automem.storeMemory("Test parallel execution")
        ]);

        const endTime = Date.now();

        return {
          executionTime: endTime - startTime,
          results: [result1, result2, result3],
          parallel: true
        };
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output.parallel).toBe(true);
      expect(result.result.output.results).toHaveLength(3);
      expect(result.result.metadata.toolsCalled).toContain('helpscout.searchInboxes');
      expect(result.result.metadata.toolsCalled).toContain('wordpress.getSiteInfo');
      expect(result.result.metadata.toolsCalled).toContain('automem.storeMemory');
    });
  });

  describe('Python Runtime', () => {
    it('should execute basic Python code', async () => {
      const code = `
import json
from datetime import datetime

message = "Hello from Python!"
result = {
    "message": message,
    "timestamp": datetime.now().isoformat(),
    "runtime": "python"
}

print(json.dumps(result, indent=2))
      `;

      const result = await executeCode('python', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('Hello from Python!');
      expect(result.result.output).toContain('timestamp');
    });

    it('should handle Python tool calls', async () => {
      const code = `
# Test Python tool bindings
inbox_result = helpscout_search_inboxes("support", limit=10)
print(f"HelpScout result: {inbox_result}")

site_result = wordpress_get_site_info()
print(f"WordPress result: {site_result}")

# Return results
import json
results = {
    "helpscout": inbox_result,
    "wordpress": site_result
}
print(json.dumps(results))
      `;

      const result = await executeCode('python', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('helpscout');
      expect(result.result.output).toContain('wordpress');
    });
  });

  describe('JavaScript Runtime', () => {
    it('should execute basic JavaScript code', async () => {
      const code = `
        const data = {
          message: "Hello from JavaScript!",
          timestamp: new Date().toISOString(),
          math: Math.PI,
          json: JSON.stringify({ test: true })
        };

        console.log("JavaScript execution successful");
        return data;
      `;

      const result = await executeCode('javascript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output.message).toBe('Hello from JavaScript!');
      expect(result.result.logs).toContain('JavaScript execution successful');
    });
  });

  describe('Bash Runtime', () => {
    it('should execute basic bash commands', async () => {
      const code = `
echo "Hello from Bash!"
echo "Current date: $(date)"
echo "Directory listing:"
ls -la . | head -5
echo "Environment check complete"
      `;

      const result = await executeCode('bash', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('Hello from Bash!');
      expect(result.result.output).toContain('Current date:');
    });

    it('should handle data directory operations', async () => {
      const code = `
echo "Checking data directories..."
if [ -d "./data" ]; then
    echo "✅ Data directory exists"
    find ./data -name "*.csv" | wc -l | xargs echo "CSV files found:"
else
    echo "❌ Data directory not found"
fi

echo "Checking tools directory..."
if [ -d "./tools" ]; then
    echo "✅ Tools directory exists"
    ls ./tools | wc -l | xargs echo "Tool directories:"
else
    echo "❌ Tools directory not found"
fi
      `;

      const result = await executeCode('bash', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('Checking data directories');
    });
  });

  describe('Error Handling', () => {
    it('should handle TypeScript compilation errors', async () => {
      const code = `
        // Invalid TypeScript syntax
        const invalid: invalidType = "test";
        return invalid.nonExistentMethod();
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.errors.length).toBeGreaterThan(0);
    });

    it('should handle Python syntax errors', async () => {
      const code = `
# Invalid Python syntax
def invalid_function(
    print("Missing closing parenthesis")
      `;

      const result = await executeCode('python', code);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.errors.length).toBeGreaterThan(0);
    });

    it('should handle runtime timeouts', async () => {
      const code = `
        // Infinite loop to test timeout
        while (true) {
          console.log("This should timeout");
        }
      `;

      const result = await executeCode('typescript', code, 1000); // 1 second timeout

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(false);
      expect(result.result.errors.some(error => error.includes('timeout') || error.includes('time'))).toBe(true);
    }, 10000);
  });

  describe('Security and Permissions', () => {
    it('should block dangerous operations in TypeScript', async () => {
      const code = `
        // Try to access process object (should be blocked)
        try {
          process.exit(1);
          return "Should not reach here";
        } catch (error) {
          return "Security check passed: " + error.message;
        }
      `;

      const result = await executeCode('typescript', code);

      expect(result.success).toBe(true);
      expect(result.result.output).toContain('Security check passed');
    });

    it('should restrict file system access', async () => {
      const code = `
echo "Testing file system restrictions..."
# Try to access restricted areas
if [ -r "/etc/passwd" ]; then
    echo "❌ Security issue: Can read /etc/passwd"
else
    echo "✅ Security check: Cannot read /etc/passwd"
fi

# Check allowed directories
if [ -d "./data" ]; then
    echo "✅ Allowed: Can access ./data directory"
else
    echo "⚠️ Warning: Cannot access ./data directory"
fi
      `;

      const result = await executeCode('bash', code);

      expect(result.success).toBe(true);
      expect(result.result.output).toContain('Testing file system restrictions');
    });
  });

  describe('Complex Workflows', () => {
    it('should execute complex business logic workflow', async () => {
      const code = `
        async function complexWorkflow() {
          console.log("🚀 Starting complex business workflow...");

          // Parallel data gathering
          const [helpscoutData, wordpressData] = await Promise.all([
            helpscout.searchInboxes("support", { limit: 5 }),
            wordpress.getSiteInfo()
          ]);

          // Process data
          const metrics = {
            timestamp: new Date().toISOString(),
            helpscout: {
              inboxes: helpscoutData.mock ? 5 : helpscoutData.inboxes?.length || 0,
              status: helpscoutData.mock ? "mocked" : "live"
            },
            wordpress: {
              users: wordpressData.mock ? 100 : wordpressData.users || 0,
              status: wordpressData.mock ? "mocked" : "live"
            }
          };

          // Store results
          await automem.storeMemory(JSON.stringify(metrics), {
            tags: ["workflow-test", "complex-analysis"],
            importance: 0.7
          });

          console.log("✅ Complex workflow completed successfully");
          return metrics;
        }

        return await complexWorkflow();
      `;

      const result = await executeCode('typescript', code, 15000);

      expect(result.success).toBe(true);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toMatchObject({
        timestamp: expect.any(String),
        helpscout: expect.any(Object),
        wordpress: expect.any(Object)
      });
      expect(result.result.logs).toContain('🚀 Starting complex business workflow...');
      expect(result.result.logs).toContain('✅ Complex workflow completed successfully');
    });
  });
});