// MCP 서버 엔트리포인트
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getToolDefinitions, handleToolCall, type ServerConfig } from './server.js';

const config: ServerConfig = {
  figmaToken: process.env.FIGMA_ACCESS_TOKEN ?? '',
  outputDir: process.env.OUTPUT_DIR ?? './generated',
  storybookUrl: process.env.STORYBOOK_URL ?? 'http://localhost:6006',
  styleSystem: (process.env.STYLE_SYSTEM as 'tailwind' | 'css-modules') ?? 'tailwind',
};

const server = new Server(
  { name: 'figma-to-code', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Tool 목록 응답
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getToolDefinitions(),
}));

// Tool 실행 응답
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleToolCall(name, args ?? {}, config);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
