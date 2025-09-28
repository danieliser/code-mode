import fs from 'fs/promises';
import path from 'path';
import { MCPServerConfig, MCPToolMapping, ToolDefinition } from './types.js';

export class MCPConfigParser {
  private mcpServers: Map<string, MCPServerConfig> = new Map();
  private toolMappings: MCPToolMapping[] = [];

  async loadConfiguration(mcpConfigPath: string): Promise<void> {
    const configContent = await fs.readFile(mcpConfigPath, 'utf-8');
    const config = JSON.parse(configContent);

    // Parse MCP servers
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      this.mcpServers.set(serverName, {
        name: serverName,
        ...serverConfig as any
      });
    }

    // Load tool mappings
    await this.generateToolMappings();
  }

  private async generateToolMappings(): Promise<void> {
    // Define tool mappings for each MCP server
    const mappings: MCPToolMapping[] = [
      // HelpScout Tools
      {
        mcpServer: 'helpscout',
        mcpTool: 'searchInboxes',
        runtimeBindings: {
          typescript: {
            functionName: 'helpscout.searchInboxes',
            interface: `searchInboxes(query: string, options?: { limit?: number; cursor?: string }): Promise<{ inboxes: Inbox[]; hasMore: boolean }>`,
            implementation: `async (query, options = {}) => {
              const response = await mcpCall('helpscout', 'searchInboxes', { query, ...options });
              return response;
            }`
          },
          python: {
            functionName: 'helpscout_search_inboxes',
            interface: `def helpscout_search_inboxes(query: str, limit: int = 50) -> dict:`,
            implementation: `def helpscout_search_inboxes(query, limit=50):
              """Search HelpScout inboxes"""
              return mcp_call('helpscout', 'searchInboxes', {'query': query, 'limit': limit})`
          },
          bash: {
            functionName: 'helpscout_search_inboxes',
            interface: 'helpscout_search_inboxes <query> [limit]',
            implementation: 'helpscout_search_inboxes() {\n              local query="$1"\n              local limit="${2:-50}"\n              mcp_call helpscout searchInboxes "{\\"query\\": \\"$query\\", \\"limit\\": $limit}"\n            }'
          }
        }
      },
      {
        mcpServer: 'helpscout',
        mcpTool: 'searchConversations',
        runtimeBindings: {
          typescript: {
            functionName: 'helpscout.searchConversations',
            interface: `searchConversations(params: ConversationSearchParams): Promise<{ conversations: Conversation[]; pagination: PaginationInfo }>`,
            implementation: `async (params) => {
              return await mcpCall('helpscout', 'searchConversations', params);
            }`
          },
          python: {
            functionName: 'helpscout_search_conversations',
            interface: `def helpscout_search_conversations(params: dict) -> dict:`,
            implementation: `def helpscout_search_conversations(params):
              """Search HelpScout conversations"""
              return mcp_call('helpscout', 'searchConversations', params)`
          }
        }
      },
      // WordPress Tools
      {
        mcpServer: 'WordPressAPI',
        mcpTool: 'getSiteInfo',
        runtimeBindings: {
          typescript: {
            functionName: 'wordpress.getSiteInfo',
            interface: `getSiteInfo(): Promise<{ name: string; url: string; description: string; version: string; users: number; plugins: Plugin[]; themes: Theme[] }>`,
            implementation: `async () => {
              return await mcpCall('WordPressAPI', 'getSiteInfo', {});
            }`
          },
          python: {
            functionName: 'wordpress_get_site_info',
            interface: `def wordpress_get_site_info() -> dict:`,
            implementation: `def wordpress_get_site_info():
              """Get WordPress site information"""
              return mcp_call('WordPressAPI', 'getSiteInfo', {})`
          }
        }
      },
      {
        mcpServer: 'WordPressAPI',
        mcpTool: 'queryPosts',
        runtimeBindings: {
          typescript: {
            functionName: 'wordpress.queryPosts',
            interface: `queryPosts(params: PostQueryParams): Promise<{ posts: Post[]; pagination: PaginationInfo }>`,
            implementation: `async (params) => {
              return await mcpCall('WordPressAPI', 'queryPosts', params);
            }`
          },
          python: {
            functionName: 'wordpress_query_posts',
            interface: `def wordpress_query_posts(params: dict) -> dict:`,
            implementation: `def wordpress_query_posts(params):
              """Query WordPress posts"""
              return mcp_call('WordPressAPI', 'queryPosts', params)`
          }
        }
      },
      // Serena Tools
      {
        mcpServer: 'serena',
        mcpTool: 'listDir',
        runtimeBindings: {
          typescript: {
            functionName: 'serena.listDir',
            interface: `listDir(relativePath: string, recursive?: boolean): Promise<{ directories: string[]; files: string[] }>`,
            implementation: `async (relativePath, recursive = false) => {
              return await mcpCall('serena', 'listDir', { relativePath, recursive });
            }`
          },
          python: {
            functionName: 'serena_list_dir',
            interface: `def serena_list_dir(relative_path: str, recursive: bool = False) -> dict:`,
            implementation: `def serena_list_dir(relative_path, recursive=False):
              """List directory contents using Serena"""
              return mcp_call('serena', 'listDir', {'relativePath': relative_path, 'recursive': recursive})`
          }
        }
      },
      // AutoMem Tools
      {
        mcpServer: 'automem',
        mcpTool: 'storeMemory',
        runtimeBindings: {
          typescript: {
            functionName: 'automem.storeMemory',
            interface: `storeMemory(content: string, options?: { tags?: string[]; importance?: number; metadata?: any }): Promise<{ memoryId: string; message: string }>`,
            implementation: `async (content, options = {}) => {
              return await mcpCall('automem', 'storeMemory', { content, ...options });
            }`
          },
          python: {
            functionName: 'automem_store_memory',
            interface: `def automem_store_memory(content: str, tags: list = None, importance: float = 0.5) -> dict:`,
            implementation: `def automem_store_memory(content, tags=None, importance=0.5):
              """Store memory in AutoMem"""
              params = {'content': content, 'importance': importance}
              if tags:
                  params['tags'] = tags
              return mcp_call('automem', 'storeMemory', params)`
          }
        }
      }
    ];

    this.toolMappings = mappings;
  }

  getToolDefinitions(runtime: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];

    for (const mapping of this.toolMappings) {
      const binding = mapping.runtimeBindings[runtime];
      if (binding) {
        tools.push({
          name: binding.functionName,
          description: `${mapping.mcpServer} - ${mapping.mcpTool}`,
          runtime: [runtime],
          parameters: {}, // TODO: Extract from MCP schema
          returns: {}, // TODO: Extract from MCP schema
          examples: [
            {
              language: runtime,
              code: this.generateExampleCode(mapping, runtime),
              description: `Example usage of ${binding.functionName}`
            }
          ],
          mcpServer: mapping.mcpServer
        });
      }
    }

    return tools;
  }

  private generateExampleCode(mapping: MCPToolMapping, runtime: string): string {
    const binding = mapping.runtimeBindings[runtime];
    if (!binding) return '';

    switch (runtime) {
      case 'typescript':
        switch (mapping.mcpTool) {
          case 'searchInboxes':
            return `const inboxes = await helpscout.searchInboxes("support", { limit: 10 });
console.log("Found", inboxes.inboxes.length, "inboxes");`;
          case 'getSiteInfo':
            return `const siteInfo = await wordpress.getSiteInfo();
console.log("Site:", siteInfo.name, "Users:", siteInfo.users);`;
          case 'storeMemory':
            return `const result = await automem.storeMemory("Important finding", {
  tags: ["analysis", "urgent"],
  importance: 0.8
});
console.log("Stored memory:", result.memoryId);`;
        }
        break;
      case 'python':
        switch (mapping.mcpTool) {
          case 'searchInboxes':
            return `inboxes = helpscout_search_inboxes("support", limit=10)
print(f"Found {len(inboxes['inboxes'])} inboxes")`;
          case 'getSiteInfo':
            return `site_info = wordpress_get_site_info()
print(f"Site: {site_info['name']}, Users: {site_info['users']}")`;
        }
        break;
    }

    return `// Example for ${binding.functionName}`;
  }

  getMCPServers(): Map<string, MCPServerConfig> {
    return this.mcpServers;
  }

  getToolMappings(): MCPToolMapping[] {
    return this.toolMappings;
  }

  generateTypeScriptDefinitions(): string {
    const definitions: string[] = [];

    // Generate TypeScript interfaces for each tool group
    definitions.push(`// Generated TypeScript definitions for MCP tools

interface Inbox {
  id: number;
  name: string;
  slug: string;
  email: string;
  createdAt: string;
  modifiedAt: string;
}

interface Conversation {
  id: number;
  number: number;
  threadsCount: number;
  type: string;
  folderId: number;
  isDraft: boolean;
  state: string;
  owner?: any;
  mailbox: any;
  customer: any;
  threads: any[];
  tags: any[];
  createdAt: string;
  modifiedAt: string;
}

interface Post {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  excerpt: { rendered: string };
  date: string;
  modified: string;
  status: string;
  author: number;
  categories: number[];
  tags: number[];
}

interface PaginationInfo {
  total: number;
  pages: number;
  page: number;
  perPage: number;
}`);

    // Generate tool interfaces
    const tsTools = this.toolMappings
      .filter(m => m.runtimeBindings.typescript)
      .map(m => m.runtimeBindings.typescript);

    definitions.push(`
declare global {
  const helpscout: {
    ${tsTools.filter(t => t.functionName.startsWith('helpscout.')).map(t =>
      t.interface.replace('helpscout.', '') + ';'
    ).join('\n    ')}
  };

  const wordpress: {
    ${tsTools.filter(t => t.functionName.startsWith('wordpress.')).map(t =>
      t.interface.replace('wordpress.', '') + ';'
    ).join('\n    ')}
  };

  const serena: {
    ${tsTools.filter(t => t.functionName.startsWith('serena.')).map(t =>
      t.interface.replace('serena.', '') + ';'
    ).join('\n    ')}
  };

  const automem: {
    ${tsTools.filter(t => t.functionName.startsWith('automem.')).map(t =>
      t.interface.replace('automem.', '') + ';'
    ).join('\n    ')}
  };
}`);

    return definitions.join('\n');
  }
}