#!/usr/bin/env node

/**
 * Test MCP Integration with AutoMem
 * This tests the runtime manager's ability to connect to and use MCP servers
 */

import { LocalRuntimeManager } from './dist/runtime-manager.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPIntegration() {
  console.log('🚀 Testing MCP Integration with AutoMem...\n');

  const runtimeManager = new LocalRuntimeManager();

  try {
    // Initialize the runtime manager
    console.log('1. Initializing runtime manager...');
    await runtimeManager.initialize();
    console.log('✅ Runtime manager initialized\n');

    // Check MCP server status
    console.log('2. Checking MCP server status...');
    const mcpStatus = runtimeManager.getMCPStatus();
    console.log('MCP Server Status:', JSON.stringify(mcpStatus, null, 2));
    console.log('');

    // Test tool introspection
    console.log('3. Getting available tools...');
    const tools = await runtimeManager.introspect();
    console.log(`Found ${tools.length} tools available`);
    console.log('Tools:', tools.map(t => `${t.mcpServer}.${t.name}`).join(', '));
    console.log('');

    // Test a simple AutoMem operation
    console.log('4. Testing AutoMem store_memory operation...');
    const testRequest = {
      runtime: 'typescript',
      code: `
        // Test storing a memory in AutoMem
        (async () => {
          const result = await automem.store_memory('Test memory from MCP integration', 0.8, ['test', 'integration']);
          console.log('Store memory result:', result);
          return result;
        })();
      `,
      timeout: 10000,
      inputs: {},
      context: {
        workingDirectory: process.cwd(),
        environmentVars: {},
        availableTools: ['automem.store_memory'],
        permissions: {
          fileSystem: {
            read: ['./data'],
            write: ['./temp'],
            execute: []
          },
          network: {
            allowedHosts: ['localhost', '127.0.0.1'],
            allowedPorts: [8001]
          },
          system: {
            allowedCommands: [],
            maxProcesses: 1
          }
        }
      }
    };

    const result = await runtimeManager.execute(testRequest);
    console.log('Execution result:', JSON.stringify(result, null, 2));
    console.log('');

    // Test AutoMem recall operation
    console.log('5. Testing AutoMem recall operation...');
    const recallRequest = {
      runtime: 'typescript',
      code: `
        // Test recalling memories from AutoMem
        (async () => {
          const result = await automem.recall('test integration', 5);
          console.log('Recall result:', result);
          return result;
        })();
      `,
      timeout: 10000,
      inputs: {},
      context: testRequest.context
    };

    const recallResult = await runtimeManager.execute(recallRequest);
    console.log('Recall result:', JSON.stringify(recallResult, null, 2));
    console.log('');

    // Get security audit log
    console.log('6. Checking security audit log...');
    const auditLog = runtimeManager.getSecurityAuditLog();
    console.log(`Security audit log contains ${auditLog.length} entries`);
    if (auditLog.length > 0) {
      console.log('Recent entries:', auditLog.slice(-3));
    }
    console.log('');

    console.log('✅ MCP Integration test completed successfully!');

  } catch (error) {
    console.error('❌ MCP Integration test failed:', error);
    console.error('Stack:', error.stack);
  } finally {
    // Cleanup
    await runtimeManager.cleanup();
    console.log('🧹 Cleanup completed');
  }
}

// Run the test
testMCPIntegration().catch(console.error);