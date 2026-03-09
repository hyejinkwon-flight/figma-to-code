// MCP Tool: extract_layers — Figma 파일에서 레이어를 추출
import type { FigmaFileData, TraversalOptions } from '../types.js';
import { FigmaClient } from '../figma/client.js';
import { extractAllPages } from '../figma/traverser.js';

export const extractLayersToolDef = {
  name: 'extract_layers',
  description: 'Figma 파일의 모든 페이지에서 모든 레이어와 노드를 리프 노드까지 재귀적으로 추출합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file_key: {
        type: 'string',
        description: 'Figma 파일 키 (URL에서 추출: figma.com/file/{FILE_KEY}/...)',
      },
      page_filter: {
        type: 'array',
        items: { type: 'string' },
        description: '특정 페이지만 추출 (비워두면 모든 페이지)',
      },
      include_hidden: {
        type: 'boolean',
        description: '숨겨진 레이어도 포함할지 여부 (기본: true)',
      },
      max_depth: {
        type: 'number',
        description: '최대 탐색 깊이 (기본: 무제한)',
      },
    },
    required: ['file_key'],
  },
} as const;

export interface ExtractLayersInput {
  file_key: string;
  page_filter?: string[];
  include_hidden?: boolean;
  max_depth?: number;
}

/** extract_layers 도구를 실행한다 */
export async function executeExtractLayers(
  input: ExtractLayersInput,
  client: FigmaClient
): Promise<FigmaFileData> {
  const options: TraversalOptions = {
    pageFilter: input.page_filter,
    includeHidden: input.include_hidden ?? true,
    maxDepth: input.max_depth,
  };

  const fileData = await client.getFile(input.file_key);
  return extractAllPages(fileData, options);
}
