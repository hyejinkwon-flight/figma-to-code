import { describe, it, expect } from '@jest/globals';
import { extractVariants, generateStory, generatePageStory } from '../../src/generator/story-generator.js';
import type { ExtractedNode, GeneratedComponent } from '../../src/types.js';

function createNode(overrides: Partial<ExtractedNode> = {}): ExtractedNode {
  return {
    id: '1:1',
    name: 'TestNode',
    type: 'FRAME',
    visible: true,
    locked: false,
    depth: 0,
    parentId: null,
    childCount: 0,
    isLeaf: true,
    absolutePosition: { x: 0, y: 0 },
    size: { width: 100, height: 50 },
    children: [],
    ...overrides,
  };
}

function createComponent(name: string = 'Button'): GeneratedComponent {
  return {
    componentName: name,
    nodeId: '1:1',
    files: {
      component: '',
      types: '',
      index: '',
    },
  };
}

describe('extractVariants', () => {
  it('COMPONENT_SET이 아니면 빈 배열을 반환한다', () => {
    const node = createNode({ type: 'FRAME' });
    expect(extractVariants(node)).toEqual([]);
  });

  it('COMPONENT_SET에서 variant를 추출한다', () => {
    const node = createNode({
      type: 'COMPONENT_SET',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'Size=Small, Variant=Primary', type: 'COMPONENT' }),
        createNode({ id: '2:2', name: 'Size=Large, Variant=Secondary', type: 'COMPONENT' }),
      ],
    });

    const variants = extractVariants(node);
    expect(variants.length).toBe(2);
    expect(variants[0].args).toEqual({ Size: 'Small', Variant: 'Primary' });
    expect(variants[1].args).toEqual({ Size: 'Large', Variant: 'Secondary' });
  });

  it('COMPONENT가 아닌 자식은 무시한다', () => {
    const node = createNode({
      type: 'COMPONENT_SET',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'Size=Small', type: 'COMPONENT' }),
        createNode({ id: '2:2', name: 'Description', type: 'TEXT' }),
      ],
    });

    const variants = extractVariants(node);
    expect(variants.length).toBe(1);
  });

  it('= 없는 variant 이름을 처리한다', () => {
    const node = createNode({
      type: 'COMPONENT_SET',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'Default', type: 'COMPONENT' }),
      ],
    });

    const variants = extractVariants(node);
    expect(variants.length).toBe(1);
    expect(variants[0].args).toEqual({});
  });
});

describe('generateStory', () => {
  it('기본 스토리 코드를 생성한다', () => {
    const component = createComponent('Button');
    const node = createNode({ id: '1:1', name: 'Button' });

    const story = generateStory(component, node, { storyType: 'component', fileKey: 'abc123' });

    expect(story).toContain("import type { Meta, StoryObj }");
    expect(story).toContain("import Button from './Button'");
    expect(story).toContain("title: 'Components/Button'");
    expect(story).toContain("node-id=1:1");
    expect(story).toContain("tags: ['autodocs']");
    expect(story).toContain('export const Default: Story');
  });

  it('page 타입이면 Pages/ 카테고리를 사용한다', () => {
    const component = createComponent('HomePage');
    const node = createNode();

    const story = generateStory(component, node, { storyType: 'page', fileKey: 'abc' });
    expect(story).toContain("title: 'Pages/HomePage'");
  });

  it('COMPONENT_SET이면 variant 스토리를 추가한다', () => {
    const component = createComponent('Button');
    const node = createNode({
      type: 'COMPONENT_SET',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'Variant=Primary', type: 'COMPONENT' }),
        createNode({ id: '2:2', name: 'Variant=Secondary', type: 'COMPONENT' }),
      ],
    });

    const story = generateStory(component, node, { storyType: 'component', fileKey: 'abc' });
    expect(story).toContain('export const VariantPrimary: Story');
    expect(story).toContain('export const VariantSecondary: Story');
  });
});

describe('generatePageStory', () => {
  it('페이지 스토리 코드를 생성한다', () => {
    const imports = [
      { name: 'Header', path: '../components/Header' },
      { name: 'Footer', path: '../components/Footer' },
    ];

    const story = generatePageStory('home page', imports, { storyType: 'page', fileKey: 'xyz' });

    expect(story).toContain("import Header from '../components/Header'");
    expect(story).toContain("import Footer from '../components/Footer'");
    expect(story).toContain('<Header />');
    expect(story).toContain('<Footer />');
    expect(story).toContain("title: 'Pages/HomePage'");
    expect(story).toContain("layout: 'fullscreen'");
  });

  it('빈 import 목록도 처리한다', () => {
    const story = generatePageStory('empty', [], { storyType: 'page', fileKey: 'abc' });
    expect(story).toContain('const Empty');
    expect(story).toContain('export default meta');
  });
});
