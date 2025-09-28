import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { LocalRuntimeManager } from './runtime-manager.js';
import { MCPConfigParser } from './mcp-parser.js';
import { ExecutionRequest, ExecutionResult } from './types.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Initialize managers
const runtimeManager = new LocalRuntimeManager();
const mcpParser = new MCPConfigParser();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'CompanyKit Local Code Mode',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    runtimes: ['typescript', 'python', 'javascript', 'bash']
  });
});

// Introspection endpoint - Get available tools and type definitions
app.get('/introspect', async (req, res) => {
  try {
    const runtime = req.query.runtime as string || 'typescript';

    const tools = mcpParser.getToolDefinitions(runtime);
    const mcpServers = Array.from(mcpParser.getMCPServers().keys());

    let typeDefinitions = '';
    if (runtime === 'typescript') {
      typeDefinitions = mcpParser.generateTypeScriptDefinitions();
    }

    res.json({
      success: true,
      runtime,
      tools,
      mcpServers,
      typeDefinitions,
      examples: {
        typescript: `// Complex workflow example
async function analyzeUrgentTickets() {
  // Parallel data fetching
  const [inboxes, recentTickets, siteInfo] = await Promise.all([
    helpscout.searchInboxes("support"),
    helpscout.searchConversations({
      status: "active",
      createdAfter: new Date(Date.now() - 24*60*60*1000).toISOString()
    }),
    wordpress.getSiteInfo()
  ]);

  // Filter urgent tickets
  const urgentTickets = recentTickets.conversations.filter(ticket =>
    ticket.tags.some(tag => tag.name.includes('urgent')) ||
    ticket.subject?.toLowerCase().includes('urgent')
  );

  // Store analysis results
  await automem.storeMemory(JSON.stringify({
    timestamp: new Date().toISOString(),
    urgentTickets: urgentTickets.length,
    totalTickets: recentTickets.conversations.length,
    inboxCount: inboxes.inboxes.length,
    siteUsers: siteInfo.users
  }), {
    tags: ["daily-analysis", "helpscout", "urgent"],
    importance: 0.8
  });

  return {
    urgentTickets,
    summary: {
      urgent: urgentTickets.length,
      total: recentTickets.conversations.length,
      urgencyRate: urgentTickets.length / recentTickets.conversations.length
    }
  };
}`,
        python: `# Data analysis example
import json
from datetime import datetime, timedelta

def analyze_support_metrics():
    """Analyze support ticket metrics using parallel requests"""

    # Get recent tickets
    yesterday = (datetime.now() - timedelta(days=1)).isoformat()
    tickets = helpscout_search_conversations({
        'status': 'active',
        'createdAfter': yesterday
    })

    # Get site information
    site_info = wordpress_get_site_info()

    # Calculate metrics
    urgent_count = len([t for t in tickets['conversations']
                       if 'urgent' in t.get('subject', '').lower()])

    metrics = {
        'timestamp': datetime.now().isoformat(),
        'total_tickets': len(tickets['conversations']),
        'urgent_tickets': urgent_count,
        'urgency_rate': urgent_count / len(tickets['conversations']) if tickets['conversations'] else 0,
        'site_users': site_info['users']
    }

    # Store results
    automem_store_memory(
        json.dumps(metrics),
        tags=['python-analysis', 'metrics'],
        importance=0.7
    )

    return metrics`,
        bash: `#!/bin/bash
# System health check example

check_system_health() {
    echo "=== CompanyKit System Health Check ==="

    # Check data freshness
    echo "Checking data freshness..."
    if [ -f "./data/edd/last_sync.txt" ]; then
        last_sync=$(cat ./data/edd/last_sync.txt)
        echo "Last EDD sync: $last_sync"
    fi

    # Check MCP server connectivity
    echo "Testing MCP server connectivity..."
    curl -s http://localhost:8001/health > /dev/null && echo "✅ AutoMem: Online" || echo "❌ AutoMem: Offline"
    curl -s http://localhost:12008/health > /dev/null && echo "✅ WordPress API: Online" || echo "❌ WordPress API: Offline"

    # Check disk space
    echo "Disk usage:"
    du -sh ./data/*

    echo "Health check complete."
}`
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Execute code endpoint
app.post('/execute', async (req, res) => {
  try {
    const request: ExecutionRequest = req.body;

    // Validate request
    if (!request.code || !request.runtime) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: code and runtime'
      });
    }

    // Execute the code
    const result: ExecutionResult = await runtimeManager.execute(request);

    res.json({
      success: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Streaming execution endpoint
app.post('/execute/stream', async (req, res) => {
  try {
    const request: ExecutionRequest = req.body;

    // Set up Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Starting execution...' })}\n\n`);

    try {
      const result = await runtimeManager.execute(request);
      res.write(`data: ${JSON.stringify({ type: 'result', data: result })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
    res.end();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// Get runtime information
app.get('/runtimes', async (req, res) => {
  try {
    const tools = await runtimeManager.introspect();

    res.json({
      success: true,
      runtimes: {
        typescript: {
          name: 'TypeScript Runtime',
          description: 'Secure TypeScript execution with tool bindings',
          features: ['async/await', 'Promise.all', 'tool orchestration', 'type safety']
        },
        python: {
          name: 'Python Data Analysis',
          description: 'Python runtime with pandas, numpy for data analysis',
          features: ['data analysis', 'pandas', 'numpy', 'csv processing']
        },
        javascript: {
          name: 'JavaScript Runtime',
          description: 'Fast JavaScript execution environment',
          features: ['async operations', 'JSON processing', 'web APIs']
        },
        bash: {
          name: 'Bash Script Runtime',
          description: 'Secure bash script execution',
          features: ['file operations', 'system commands', 'pipeline processing']
        }
      },
      availableTools: tools.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

// WebSocket handling for real-time execution
wss.on('connection', (ws) => {
  console.log('Client connected to WebSocket');

  ws.on('message', async (message) => {
    try {
      const request = JSON.parse(message.toString()) as ExecutionRequest;

      ws.send(JSON.stringify({ type: 'status', message: 'Execution started' }));

      const result = await runtimeManager.execute(request);

      ws.send(JSON.stringify({
        type: 'result',
        data: result
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected from WebSocket');
  });
});

// Initialize and start server
async function initialize() {
  try {
    console.log('🚀 Initializing CompanyKit Code Mode...');

    // Initialize runtime manager
    await runtimeManager.initialize();
    console.log('✅ Runtime manager initialized');

    // Load MCP configuration
    const mcpConfigPath = path.join(process.cwd(), '../../.mcp.json');
    await mcpParser.loadConfiguration(mcpConfigPath);
    console.log('✅ MCP configuration loaded');

    const port = process.env.CODE_MODE_PORT || 3001;
    server.listen(port, () => {
      console.log(`🎯 Code Mode API server running on port ${port}`);
      console.log(`📡 Health check: http://localhost:${port}/health`);
      console.log(`🔍 Introspection: http://localhost:${port}/introspect`);
      console.log(`⚡ Execute: POST http://localhost:${port}/execute`);
      console.log(`🌐 WebSocket: ws://localhost:${port}`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize Code Mode:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Code Mode...');
  await runtimeManager.cleanup();
  server.close(() => {
    console.log('✅ Code Mode shut down gracefully');
    process.exit(0);
  });
});

// Start the server
initialize().catch(console.error);