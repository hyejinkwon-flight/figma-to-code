// MCP Tool: generate_component — 단일 컴포넌트를 React 코드로 변환
import type { ExtractedNode, GeneratedComponent, GenerateOptions, ComponentRegistryEntry, WrapperPatternInfo } from '../types.js';
import { generateComponent } from '../generator/component-generator.js';

export const generateComponentToolDef = {
  name: 'generate_component',
  description: '단일 컴포넌트를 React 코드로 변환합니다. 래퍼 패턴이 감지되고 기존 컴포넌트가 있으면 합성 코드를 생성합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      node: {
        type: 'object',
        description: 'ExtractedNode 데이터',
      },
      style_system: {
        type: 'string',
        enum: ['tailwind', 'css-modules'],
        description: '스타일 시스템 (기본: tailwind)',
      },
      output_dir: {
        type: 'string',
        description: '출력 디렉토리 경로',
      },
      component_registry: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            componentName: { type: 'string' },
            importPath: { type: 'string' },
            pattern: { type: 'string' },
          },
          required: ['componentName', 'importPath', 'pattern'],
        },
        description: '타겟 프로젝트의 기존 컴포넌트 레지스트리',
      },
      wrapper_pattern: {
        type: 'object',
        description: '래퍼 패턴 정보 (analyze_tree에서 감지된 결과)',
      },
    },
    required: ['node', 'output_dir'],
  },
} as const;

export interface GenerateComponentInput {
  node: ExtractedNode;
  style_system?: 'tailwind' | 'css-modules';
  output_dir: string;
  file_key?: string;
  component_registry?: ComponentRegistryEntry[];
  wrapper_pattern?: WrapperPatternInfo;
}

/** generate_component 도구를 실행한다 */
export function executeGenerateComponent(input: GenerateComponentInput): GeneratedComponent {
  const options: GenerateOptions = {
    styleSystem: input.style_system ?? 'tailwind',
    outputDir: input.output_dir,
    fileKey: input.file_key,
    componentRegistry: input.component_registry,
  };

  return generateComponent(input.node, options, input.wrapper_pattern);
}
