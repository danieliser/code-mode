#!/usr/bin/env node

/**
 * Direct AutoMem MCP Test
 * Tests AutoMem connection without full runtime manager
 */

import { MCPClientManager } from './dist/mcp-client-manager.js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function testAutoMemDirect() {
  console.log('🧪 Testing AutoMem MCP Connection Directly...\n');

  const mcpClient = new MCPClientManager({
    fallbackToMock: false,
    securityEnabled: false,
    timeout: 10000
  });

  try {
    // Load just AutoMem config
    const mcpConfigPath = join(process.cwd(), '..', '..', '.mcp.json');
    const mcpConfig = JSON.parse(readFileSync(mcpConfigPath, 'utf-8'));
    
    const autoMemConfig = {
      automem: {
        name: 'automem',
        command: mcpConfig.mcpServers.automem.command,
        args: mcpConfig.mcpServers.automem.args,
        env: mcpConfig.mcpServers.automem.env,
        type: 'stdio'
      }
    };

    console.log('AutoMem Config:', JSON.stringify(autoMemConfig, null, 2));

    await mcpClient.initialize(autoMemConfig);
    
    console.log('AutoMem available:', mcpClient.isServerAvailable('automem'));
    
    if (mcpClient.isServerAvailable('automem')) {
      const tools = mcpClient.getServerTools('automem');
      console.log('AutoMem tools:', tools.map(t => t.name));
      
      const response = await mcpClient.sendRequest('automem', 'tools/call', {
        name: 'store_memory',
        arguments: {
          content: 'Direct MCP test memory',
          importance: 0.5,
          tags: ['test']
        }
      });
      
      console.log('Store memory response:', response);
    }

  } catch (error) {
    console.error('AutoMem test failed:', error);
  } finally {
    await mcpClient.cleanup();
  }
}

testAutoMemDirect().catch(console.error);
