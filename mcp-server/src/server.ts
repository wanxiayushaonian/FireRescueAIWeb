import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

export function createMcpServer(): Server {
  const server = new Server(
    { name: 'firerescue-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'ping',
        description: '健康检查,原样回显 message',
        inputSchema: {
          type: 'object',
          properties: { message: { type: 'string' } },
          required: ['message'],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name === 'ping') {
      const message = String((args as { message?: string })?.message ?? '');
      return { content: [{ type: 'text', text: `pong: ${message}` }] };
    }
    throw new Error(`unknown tool: ${name}`);
  });

  return server;
}
