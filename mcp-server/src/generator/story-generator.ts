// Storybook 스토리 코드 생성기
import type { GeneratedComponent, ExtractedNode, StoryOptions } from '../types.js';
import { toPascalCase } from './component-generator.js';

interface VariantInfo {
  name: string;
  args: Record<string, unknown>;
}

/** COMPONENT_SET 노드에서 variant 정보를 추출한다 */
export function extractVariants(node: ExtractedNode): VariantInfo[] {
  if (node.type !== 'COMPONENT_SET') return [];

  return node.children
    .filter(child => child.type === 'COMPONENT')
    .map(child => {
      const args: Record<string, unknown> = {};

      // Figma variant 이름 파싱: "Property1=Value1, Property2=Value2"
      const parts = child.name.split(',').map(p => p.trim());
      for (const part of parts) {
        const [key, value] = part.split('=').map(s => s.trim());
        if (key && value) {
          args[key] = value;
        }
      }

      return {
        name: child.name.replace(/[^a-zA-Z0-9]/g, '_'),
        args,
      };
    });
}

/** 단일 컴포넌트의 Storybook 스토리를 생성한다 */
export function generateStory(
  component: GeneratedComponent,
  figmaNode: ExtractedNode,
  options: StoryOptions
): string {
  const { componentName } = component;
  const variants = figmaNode.type === 'COMPONENT_SET'
    ? extractVariants(figmaNode)
    : [];

  const storyCategory = options.storyType === 'page' ? 'Pages' : 'Components';

  const variantStories = variants
    .map(v => {
      const storyName = toPascalCase(v.name);
      return `
export const ${storyName}: Story = {
  args: ${JSON.stringify(v.args, null, 4)},
};`;
    })
    .join('\n');

  return `import type { Meta, StoryObj } from '@storybook/react';
import ${componentName} from './${componentName}';

const meta: Meta<typeof ${componentName}> = {
  title: '${storyCategory}/${componentName}',
  component: ${componentName},
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/${options.fileKey}?node-id=${figmaNode.id}',
    },
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof ${componentName}>;

export const Default: Story = {
  args: {},
};
${variantStories}
`;
}

/** 페이지 레벨 스토리를 생성한다 */
export function generatePageStory(
  pageName: string,
  componentImports: Array<{ name: string; path: string }>,
  options: StoryOptions
): string {
  const pageComponentName = toPascalCase(pageName);

  const imports = componentImports
    .map(c => `import ${c.name} from '${c.path}';`)
    .join('\n');

  const componentUsage = componentImports
    .map(c => `      <${c.name} />`)
    .join('\n');

  return `import type { Meta, StoryObj } from '@storybook/react';
${imports}

/** ${pageComponentName} 페이지 컴포넌트 — Figma 페이지 기반 자동 생성 */
const ${pageComponentName} = () => (
  <div className="flex flex-col">
${componentUsage}
  </div>
);

const meta: Meta<typeof ${pageComponentName}> = {
  title: 'Pages/${pageComponentName}',
  component: ${pageComponentName},
  parameters: {
    design: {
      type: 'figma',
      url: 'https://www.figma.com/file/${options.fileKey}',
    },
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof ${pageComponentName}>;

export const Default: Story = {};
`;
}
