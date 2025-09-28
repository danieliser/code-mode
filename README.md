# Code Mode

> **Revolutionary AI-driven TypeScript orchestration system** - Built before Cloudflare could deliver theirs! 🚀

## What This Is

Code Mode is a **game-changing alternative** to Cloudflare's locked Code Mode that allows AI agents to write actual **TypeScript/Python/JavaScript/Bash code** that orchestrates multiple tools in parallel, rather than making sequential tool calls.

## Why This Matters

### Traditional AI Tool Calling
```
AI → Tool Call → Wait → Tool Call → Wait → Tool Call → Result
```

### Code Mode Revolution
```typescript
AI → Write Algorithm → Parallel Execution → Complex Logic → Rich Results

// AI writes sophisticated code like this:
const [urgent, content, health] = await Promise.all([
  analyzeUrgentTickets(),
  analyzeContentPerformance(),
  checkDataSyncHealth()
]);
```

## Key Advantages

- ✅ **No Beta Dependencies** - Works today, no waiting for Cloudflare
- ✅ **Local Control** - Complete ownership and customization
- ✅ **MCP Native** - Direct integration with MCP ecosystem
- ✅ **Multi-Runtime** - TypeScript, Python, JavaScript, Bash support
- ✅ **Production Ready** - Security, testing, monitoring included
- ✅ **Type Safety** - Full TypeScript definitions and compile-time checking

## Architecture

### Multi-Runtime Support
- **TypeScript** - Primary runtime with vm2 sandbox, async/await, Promise.all
- **Python** - Data analysis with pandas/numpy patterns, subprocess execution
- **JavaScript** - Fast execution environment with security restrictions
- **Bash** - System operations with command whitelisting

### Security Model
- **Resource Limits** - Memory (512MB), timeout (30s), process quotas
- **Module Whitelisting** - Only approved libraries/commands allowed
- **File System Control** - Read/write permissions per directory
- **Network Security** - Host/port restrictions for external calls

### MCP Integration
All  MCP servers converted to runtime-specific interfaces:
- **HelpScout** - Search inboxes, conversations, comprehensive analysis
- **WordPress** - Site info, posts, users, content management
- **Serena** - File operations, symbol search, code analysis
- **AutoMem** - Memory storage and retrieval with metadata

## Quick Start

### 1. Install Dependencies
```bash
cd tools/code-mode
npm install
```

### 2. Start Development Server
```bash
just code-mode-dev
# Or: npm run dev
```

### 3. Test Health
```bash
just code-mode-health
# Should return: {"status": "healthy", ...}
```

### 4. Connect Claude
Point Claude to `http://localhost:3001` and watch it write orchestration algorithms!

## API Endpoints

### Core Endpoints
- **`GET /health`** - Service health and runtime status
- **`GET /introspect?runtime=typescript`** - Get tool schemas and TypeScript definitions
- **`POST /execute`** - Submit code for execution with full error handling
- **`POST /execute/stream`** - Server-sent events for long-running operations
- **`GET /runtimes`** - Runtime capabilities and feature matrix

### WebSocket Support
- **`ws://localhost:3001`** - Real-time execution with progress updates

## Example Usage

### TypeScript Business Intelligence
```typescript
async function businessIntelligenceReport() {
  // Parallel data fetching
  const [urgentAnalysis, contentAnalysis, healthCheck] = await Promise.all([
    analyzeUrgentTickets(),
    analyzeContentPerformance(),
    checkDataSyncHealth()
  ]);

  // Complex correlation analysis
  const insights = {
    urgentTicketRate: urgentAnalysis.urgencyRate,
    contentProductivity: contentAnalysis.publishingFrequency,
    systemHealth: healthCheck.syncStatus.recommendedAction,
    recommendations: generateInsights(urgentAnalysis, contentAnalysis)
  };

  // Store comprehensive results
  await automem.storeMemory(JSON.stringify(insights), {
    tags: ["business-intelligence", "daily-report"],
    importance: 0.9
  });

  return insights;
}
```

### Python Data Analysis
```python
def comprehensive_business_report():
    """Generate business intelligence with statistical analysis"""

    # Multi-source data gathering
    support_metrics = analyze_support_metrics()
    content_performance = wordpress_content_analysis()
    quality_assessment = data_quality_assessment()

    # Statistical correlations
    correlation_analysis = {
        'support_content_ratio': support_metrics['total_tickets'] / content_performance['total_posts'],
        'quality_score': quality_assessment['overall_score'],
        'productivity_index': calculate_productivity_index(support_metrics, content_performance)
    }

    return generate_executive_summary(correlation_analysis)
```

## Justfile Commands

```bash
# Development
just code-mode-dev              # Start development server
just code-mode-build            # Build for production
just code-mode-start            # Start production server

# Management
just code-mode-health           # Check service health
just code-mode-introspect       # Get TypeScript tools
just code-mode-stop             # Clean shutdown

# Testing
just code-mode-execute "console.log('Hello!')"  # Execute TypeScript
```

## Testing

Comprehensive test suite covering all runtimes:

```bash
npm test
```

**Test Coverage:**
- ✅ All 4 runtimes with real code execution
- ✅ Tool mocking and parallel execution patterns
- ✅ Security restriction validation
- ✅ Error handling and timeout scenarios
- ✅ Complex business workflow simulations

## Configuration

### Runtime Configuration
See `config/runtimes.json` for runtime-specific settings:
- Memory limits and timeout configurations
- Allowed modules and denied operations
- File system and network permissions
- Security policies per runtime

### MCP Tool Mappings
See `src/mcp-parser.ts` for tool definitions:
- TypeScript interfaces generated from MCP schemas
- Runtime-specific bindings and implementations
- Example code patterns for each tool

## Examples

Check the `examples/` directory for:
- **`typescript-examples.ts`** - Complex business workflows
- **`python-examples.py`** - Statistical analysis patterns
- **`runtime-tests.js`** - Comprehensive test scenarios

## Production Deployment

### Environment Variables
```bash
CODE_MODE_PORT=3001              # API server port
NODE_ENV=production              # Production mode
```

### Security Considerations
- All code execution is sandboxed with strict resource limits
- File system access is restricted to approved directories
- Network access is limited to whitelisted hosts/ports
- Module loading is restricted to approved libraries

## Roadmap

### Phase 1: Core Implementation ✅
- [x] Multi-runtime architecture (TypeScript, Python, JavaScript, Bash)
- [x] MCP server integration with tool proxying
- [x] Security and permission system
- [x] API endpoints with streaming support
- [x] Comprehensive testing suite

### Phase 2: Advanced Features (Future)
- [ ] Code generation assistance and auto-completion
- [ ] Performance profiling and optimization
- [ ] Distributed execution across multiple nodes
- [ ] Advanced caching and memoization
- [ ] Visual debugging interface

### Phase 3: Open Source (Future)
- [ ] Extract to dedicated repository
- [ ] Publish as `@danieliser/code-mode` npm package
- [ ] Community contribution guidelines
- [ ] Documentation site and tutorials

## Contributing

This is currently an internal tool. For issues or feature requests, use the project's issue tracker.

## License

MIT

---

**🎯 Mission Accomplished**: Built a revolutionary Code Mode system that enables AI agents to write sophisticated algorithms for tool orchestration - and we did it before Cloudflare could deliver theirs!