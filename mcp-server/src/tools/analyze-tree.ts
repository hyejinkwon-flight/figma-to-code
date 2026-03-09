// MCP Tool: analyze_tree — 추출된 트리를 분석하고 컴포넌트 후보를 식별
import type { FigmaFileData, ComponentCandidate, MdComponentDef, ComponentRegistryEntry } from '../types.js';
import { identifyComponents, mapToMdDocs, parseMdContent } from '../figma/parser.js';

export const analyzeTreeToolDef = {
  name: 'analyze_tree',
  description: '추출된 노드 트리를 분석하여 컴포넌트 후보를 식별하고, 래퍼 패턴(바텀시트/모달 등)을 감지하며, MD 문서 정의 및 기존 컴포넌트와 매핑합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      extracted_data: {
        type: 'object',
        description: 'extract_layers로 생성된 데이터',
      },
      md_contents: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            fileName: { type: 'string' },
            content: { type: 'string' },
          },
        },
        description: 'MD 파일 내용 목록',
      },
      component_registry: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            componentName: { type: 'string', description: '컴포넌트 이름 (예: BottomSheet)' },
            importPath: { type: 'string', description: 'import 경로 (예: @/components/BottomSheet)' },
            pattern: { type: 'string', enum: ['bottom-sheet', 'modal', 'dialog', 'drawer', 'popup', 'toast', 'dropdown', 'tooltip'], description: '매핑되는 UI 패턴' },
            props: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  required: { type: 'boolean' },
                },
              },
              description: '지원하는 props 목록',
            },
          },
          required: ['componentName', 'importPath', 'pattern'],
        },
        description: '타겟 프로젝트의 기존 컴포넌트 레지스트리',
      },
      mapping_strategy: {
        type: 'string',
        enum: ['name_match', 'structure_match', 'hybrid'],
        description: '매핑 전략: 이름 기반, 구조 기반, 하이브리드',
      },
    },
    required: ['extracted_data'],
  },
} as const;

export interface AnalyzeTreeInput {
  extracted_data: FigmaFileData;
  md_contents?: Array<{ fileName: string; content: string }>;
  component_registry?: ComponentRegistryEntry[];
  mapping_strategy?: 'name_match' | 'structure_match' | 'hybrid';
}

export interface AnalyzeTreeResult {
  candidates: ComponentCandidate[];
  totalCandidates: number;
  mappedCount: number;
  unmappedCount: number;
  /** 감지된 래퍼 패턴 수 */
  wrapperPatternCount: number;
  /** 기존 컴포넌트 매핑 가능 수 */
  registryMatchCount: number;
}

/** analyze_tree 도구를 실행한다 */
export function executeAnalyzeTree(input: AnalyzeTreeInput): AnalyzeTreeResult {
  let candidates = identifyComponents(input.extracted_data);

  // MD 문서와 매핑
  if (input.md_contents && input.md_contents.length > 0) {
    const mdDefs: MdComponentDef[] = [];
    for (const md of input.md_contents) {
      mdDefs.push(...parseMdContent(md.content, md.fileName));
    }
    candidates = mapToMdDocs(candidates, mdDefs);
  }

  const mappedCount = candidates.filter(c => c.mdMapping).length;
  const wrapperPatternCount = candidates.filter(c => c.wrapperPattern).length;

  // 기존 컴포넌트 레지스트리 매핑 카운트
  let registryMatchCount = 0;
  if (input.component_registry && input.component_registry.length > 0) {
    for (const candidate of candidates) {
      if (candidate.wrapperPattern) {
        const match = input.component_registry.find(
          entry => entry.pattern === candidate.wrapperPattern!.pattern
        );
        if (match) registryMatchCount++;
      }
    }
  }

  return {
    candidates,
    totalCandidates: candidates.length,
    mappedCount,
    unmappedCount: candidates.length - mappedCount,
    wrapperPatternCount,
    registryMatchCount,
  };
}
