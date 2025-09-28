/**
 * AutoMem MCP Integration Demo
 * Demonstrates how to use AutoMem through Code Mode's sandbox
 */

import { LocalRuntimeManager } from '../src/runtime-manager.js';

async function runAutoMemDemo() {
  console.log('🚀 Starting AutoMem MCP Integration Demo...\n');

  const runtimeManager = new LocalRuntimeManager();

  try {
    // Initialize the runtime manager
    console.log('📦 Initializing runtime manager...');
    await runtimeManager.initialize();

    // Check MCP server status
    const mcpStatus = runtimeManager.getMCPStatus();
    console.log('🔗 MCP Server Status:', mcpStatus);

    // Test 1: Store a memory
    console.log('\n📝 Test 1: Storing a memory...');
    const storeCode = `
      const memoryContent = "Code Mode can now communicate with AutoMem! " +
                           "This demonstrates secure sandbox-to-MCP integration.";

      const result = await automem.store_memory(
        memoryContent,
        0.8, // High importance
        ["integration", "demo", "code-mode", "mcp"]
      );

      console.log("Memory stored:", result);
      return result;
    `;

    const storeResult = await runtimeManager.execute({
      runtime: 'typescript',
      code: storeCode,
      timeout: 10000
    });

    console.log('✅ Store Result:', {
      success: storeResult.success,
      output: storeResult.output,
      toolsCalled: storeResult.metadata.toolsCalled,
      executionTime: storeResult.executionTime + 'ms'
    });

    // Test 2: Recall memories
    console.log('\n🔍 Test 2: Recalling memories...');
    const recallCode = `
      const memories = await automem.recall("integration demo", 3);

      console.log("Found memories:", memories);
      return memories;
    `;

    const recallResult = await runtimeManager.execute({
      runtime: 'typescript',
      code: recallCode,
      timeout: 10000
    });

    console.log('✅ Recall Result:', {
      success: recallResult.success,
      output: recallResult.output,
      toolsCalled: recallResult.metadata.toolsCalled,
      executionTime: recallResult.executionTime + 'ms'
    });

    // Test 3: Complex workflow
    console.log('\n⚙️ Test 3: Complex workflow...');
    const workflowCode = `
      // Multi-step workflow demonstrating MCP integration
      const timestamp = new Date().toISOString();

      // Store multiple related memories
      const step1 = await automem.store_memory(
        \`Workflow started at \${timestamp}\`,
        0.6,
        ["workflow", "timestamp", "start"]
      );

      // Recall previous workflows
      const previousWorkflows = await automem.recall("workflow", 5);

      // Store analysis result
      const step2 = await automem.store_memory(
        \`Found \${previousWorkflows?.length || 0} previous workflows\`,
        0.7,
        ["workflow", "analysis", "count"]
      );

      return {
        started: step1,
        previous: previousWorkflows,
        analysis: step2,
        timestamp
      };
    `;

    const workflowResult = await runtimeManager.execute({
      runtime: 'typescript',
      code: workflowCode,
      timeout: 15000
    });

    console.log('✅ Workflow Result:', {
      success: workflowResult.success,
      output: workflowResult.output,
      toolsCalled: workflowResult.metadata.toolsCalled,
      executionTime: workflowResult.executionTime + 'ms'
    });

    // Test 4: Error handling
    console.log('\n⚠️ Test 4: Error handling...');
    const errorCode = `
      try {
        // This should trigger security validation
        const largeContent = "x".repeat(1000); // Not too large for this test

        const result = await automem.store_memory(
          \`Error handling test: \${largeContent}\`,
          0.1,
          ["error-test", "validation"]
        );

        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    `;

    const errorResult = await runtimeManager.execute({
      runtime: 'typescript',
      code: errorCode,
      timeout: 5000
    });

    console.log('✅ Error Handling Result:', {
      success: errorResult.success,
      output: errorResult.output,
      toolsCalled: errorResult.metadata.toolsCalled
    });

    // Display security audit
    console.log('\n🛡️ Security Audit Log:');
    const auditLog = runtimeManager.getSecurityAuditLog();
    auditLog.slice(-5).forEach((entry, i) => {
      console.log(`  ${i + 1}. ${entry.serverName}.${entry.toolName} - ${entry.result} (${entry.timestamp.toLocaleTimeString()})`);
    });

  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await runtimeManager.cleanup();
    console.log('✨ Demo completed!\n');
  }
}

// Check if AutoMem server is available
async function checkPrerequisites(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8001/health');
    if (response.ok) {
      console.log('✅ AutoMem server is running at http://localhost:8001');
      return true;
    } else {
      console.log('⚠️ AutoMem server responded but not healthy');
      return false;
    }
  } catch {
    console.log('⚠️ AutoMem server not detected at http://localhost:8001');
    console.log('   Demo will use mock responses for fallback testing');
    return false;
  }
}

// Run the demo
if (require.main === module) {
  console.log('🎯 AutoMem MCP Integration Demo');
  console.log('=====================================');

  checkPrerequisites().then(serverAvailable => {
    if (serverAvailable) {
      console.log('🔥 Running with REAL AutoMem server connection!\n');
    } else {
      console.log('🎭 Running with MOCK responses (fallback mode)\n');
    }

    return runAutoMemDemo();
  }).catch(error => {
    console.error('💥 Demo startup failed:', error);
    process.exit(1);
  });
}

export { runAutoMemDemo };