// MCP Tool: generate_story — 컴포넌트의 Storybook 스토리를 생성
import type { GeneratedComponent, ExtractedNode, StoryOptions } from '../types.js';
import { generateStory } from '../generator/story-generator.js';

export const generateStoryToolDef = {
  name: 'generate_story',
  description: '생성된 컴포넌트의 Storybook 스토리를 작성합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      component: {
        type: 'object',
        description: 'GeneratedComponent 데이터',
      },
      figma_node: {
        type: 'object',
        description: 'Figma ExtractedNode 데이터',
      },
      story_type: {
        type: 'string',
        enum: ['component', 'page', 'docs'],
        description: '스토리 종류',
      },
      file_key: {
        type: 'string',
        description: 'Figma 파일 키',
      },
    },
    required: ['component', 'figma_node', 'file_key'],
  },
} as const;

export interface GenerateStoryInput {
  component: GeneratedComponent;
  figma_node: ExtractedNode;
  story_type?: 'component' | 'page' | 'docs';
  file_key: string;
}

/** generate_story 도구를 실행한다 */
export function executeGenerateStory(input: GenerateStoryInput): string {
  const options: StoryOptions = {
    storyType: input.story_type ?? 'component',
    fileKey: input.file_key,
  };

  return generateStory(input.component, input.figma_node, options);
}
