#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
async function main() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    // Log status to stderr so stdio JSON-RPC protocol on stdout is not corrupted
    console.error('Bucharest Transit MCP server running on stdio');
}
main().catch((err) => {
    console.error('Fatal error starting Bucharest Transit MCP server:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map