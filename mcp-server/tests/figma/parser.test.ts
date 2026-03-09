import { describe, it, expect } from 'vitest';
import {
  getStructureSignature,
  calculateSimilarity,
  identifyComponents,
  mapToMdDocs,
  parseMdContent,
} from '../../src/figma/parser.js';
import type { ExtractedNode, FigmaFileData, MdComponentDef } from '../../src/types.js';

/** 테스트용 ExtractedNode를 생성한다 */
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

function createFileData(pages: FigmaFileData['pages'] = []): FigmaFileData {
  return {
    fileName: 'Test',
    totalPages: pages.length,
    totalNodes: 0,
    extractedAt: new Date().toISOString(),
    pages,
  };
}

describe('getStructureSignature', () => {
  it('자식이 없으면 빈 문자열을 반환한다', () => {
    const node = createNode();
    expect(getStructureSignature(node)).toBe('');
  });

  it('자식 구조를 시그니처 문자열로 변환한다', () => {
    const node = createNode({
      children: [
        createNode({ type: 'TEXT', childCount: 0 }),
        createNode({ type: 'RECTANGLE', childCount: 2 }),
      ],
    });
    expect(getStructureSignature(node)).toBe('TEXT:0|RECTANGLE:2');
  });
});

describe('calculateSimilarity', () => {
  it('동일한 문자열이면 1을 반환한다', () => {
    expect(calculateSimilarity('Button', 'Button')).toBe(1);
  });

  it('대소문자/공백/하이픈을 정규화한 뒤 비교한다', () => {
    expect(calculateSimilarity('My-Button', 'my button')).toBe(1);
    expect(calculateSimilarity('search_form', 'SearchForm')).toBe(1);
  });

  it('빈 문자열이면 0을 반환한다', () => {
    expect(calculateSimilarity('', 'Button')).toBe(0);
    expect(calculateSimilarity('Button', '')).toBe(0);
  });

  it('포함 관계면 높은 점수를 반환한다', () => {
    const score = calculateSimilarity('Button', 'PrimaryButton');
    expect(score).toBeGreaterThan(0.4);
  });

  it('완전히 다른 문자열이면 낮은 점수를 반환한다', () => {
    const score = calculateSimilarity('xyz', 'abc');
    expect(score).toBeLessThan(0.5);
  });
});

describe('identifyComponents', () => {
  it('COMPONENT 노드를 후보로 식별한다', () => {
    const fileData = createFileData([{
      pageId: 'p:1',
      pageName: 'Page 1',
      totalNodeCount: 2,
      leafNodeCount: 1,
      maxDepth: 1,
      layers: [
        createNode({
          id: '1:1',
          type: 'COMPONENT',
          name: 'Button',
          isLeaf: false,
          children: [createNode({ id: '2:1', type: 'TEXT' })],
        }),
      ],
    }]);

    const candidates = identifyComponents(fileData);
    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].nodeName).toBe('Button');
    expect(candidates[0].nodeType).toBe('COMPONENT');
  });

  it('COMPONENT_SET 노드를 variant로 식별한다', () => {
    const fileData = createFileData([{
      pageId: 'p:1',
      pageName: 'Page 1',
      totalNodeCount: 1,
      leafNodeCount: 0,
      maxDepth: 1,
      layers: [
        createNode({
          id: '1:1',
          type: 'COMPONENT_SET',
          name: 'ButtonSet',
          isLeaf: false,
          children: [createNode({ id: '2:1', type: 'COMPONENT', name: 'Primary' })],
        }),
      ],
    }]);

    const candidates = identifyComponents(fileData);
    const setCandidate = candidates.find(c => c.nodeType === 'COMPONENT_SET');
    expect(setCandidate?.hasVariants).toBe(true);
  });

  it('INSTANCE 재사용 횟수를 집계한다', () => {
    const fileData = createFileData([{
      pageId: 'p:1',
      pageName: 'Page 1',
      totalNodeCount: 4,
      leafNodeCount: 2,
      maxDepth: 1,
      layers: [
        createNode({
          id: 'comp:1',
          type: 'COMPONENT',
          name: 'Icon',
          isLeaf: false,
          children: [],
        }),
        createNode({
          id: '3:1',
          type: 'INSTANCE',
          componentId: 'comp:1',
          isLeaf: true,
        }),
        createNode({
          id: '3:2',
          type: 'INSTANCE',
          componentId: 'comp:1',
          isLeaf: true,
        }),
      ],
    }]);

    const candidates = identifyComponents(fileData);
    const iconCandidate = candidates.find(c => c.nodeName === 'Icon');
    expect(iconCandidate?.instanceCount).toBe(2);
  });

  it('깊이 있는 COMPONENT도 식별한다 (containsNode 재귀)', () => {
    const fileData = createFileData([{
      pageId: 'p:1',
      pageName: 'Page 1',
      totalNodeCount: 3,
      leafNodeCount: 1,
      maxDepth: 2,
      layers: [
        createNode({
          id: '1:1',
          type: 'FRAME',
          name: 'Wrapper',
          isLeaf: false,
          children: [
            createNode({
              id: '2:1',
              type: 'FRAME',
              name: 'Inner',
              isLeaf: false,
              children: [
                createNode({ id: '3:1', type: 'COMPONENT', name: 'DeepButton' }),
              ],
            }),
          ],
        }),
      ],
    }]);

    const candidates = identifyComponents(fileData);
    expect(candidates.some(c => c.nodeName === 'DeepButton')).toBe(true);
  });

  it('반복되는 FRAME 패턴(3회 이상)을 후보로 추가한다', () => {
    const makeFrame = (id: string) => createNode({
      id,
      name: `Card-${id}`,
      type: 'FRAME',
      isLeaf: false,
      children: [
        createNode({ id: `${id}-text`, type: 'TEXT', childCount: 0 }),
        createNode({ id: `${id}-img`, type: 'RECTANGLE', childCount: 0 }),
      ],
    });

    const fileData = createFileData([{
      pageId: 'p:1',
      pageName: 'Page 1',
      totalNodeCount: 9,
      leafNodeCount: 6,
      maxDepth: 1,
      layers: [makeFrame('f:1'), makeFrame('f:2'), makeFrame('f:3')],
    }]);

    const candidates = identifyComponents(fileData);
    const frameCandidates = candidates.filter(c => c.nodeType === 'FRAME');
    expect(frameCandidates.length).toBeGreaterThanOrEqual(1);
  });
});

describe('mapToMdDocs', () => {
  it('매핑할 MD 정의가 없으면 원본을 반환한다', () => {
    const candidates = [{ nodeId: '1:1', nodeName: 'Button', nodeType: 'COMPONENT', pageName: 'P', depth: 0, childStructure: '', instanceCount: 0, hasVariants: false }];
    const result = mapToMdDocs(candidates, []);
    expect(result[0].mdMapping).toBeUndefined();
  });

  it('이름 유사도 0.6 이상이면 매핑한다', () => {
    const candidates = [{ nodeId: '1:1', nodeName: 'MyButton', nodeType: 'COMPONENT', pageName: 'P', depth: 0, childStructure: '', instanceCount: 0, hasVariants: false }];
    const mdDefs: MdComponentDef[] = [{ fileName: 'Button.md', componentName: 'Button', props: [], variants: [], description: '' }];

    const result = mapToMdDocs(candidates, mdDefs);
    expect(result[0].mdMapping).toBeDefined();
    expect(result[0].mdMapping!.componentName).toBe('Button');
    expect(result[0].mdMapping!.confidence).toBeGreaterThan(0.6);
  });

  it('유사도가 0.6 미만이면 매핑하지 않는다', () => {
    const candidates = [{ nodeId: '1:1', nodeName: 'XyzComponent', nodeType: 'COMPONENT', pageName: 'P', depth: 0, childStructure: '', instanceCount: 0, hasVariants: false }];
    const mdDefs: MdComponentDef[] = [{ fileName: 'Button.md', componentName: 'Button', props: [], variants: [], description: '' }];

    const result = mapToMdDocs(candidates, mdDefs);
    expect(result[0].mdMapping).toBeUndefined();
  });
});

describe('parseMdContent', () => {
  it('헤딩을 컴포넌트 이름으로 파싱한다', () => {
    const content = '# Button\n\nA button component.\n\n## Input\n\nAnother section.';
    const defs = parseMdContent(content, 'Button.md');
    expect(defs.length).toBeGreaterThanOrEqual(1);
    expect(defs[0].componentName).toBe('Button');
    expect(defs[0].fileName).toBe('Button.md');
  });

  it('빈 내용이면 빈 배열을 반환한다', () => {
    const defs = parseMdContent('', 'empty.md');
    expect(defs).toEqual([]);
  });

  it('variant 정보를 추출한다', () => {
    const content = '# Card\n\nvariants: default, outlined, elevated\n';
    const defs = parseMdContent(content, 'Card.md');
    expect(defs[0].variants.length).toBeGreaterThan(0);
  });

  it('Props 테이블을 파싱한다', () => {
    const content = '# Button\n\n| `label` | string |\n| `size` | string |\n| Prop | Type |\n';
    const defs = parseMdContent(content, 'Button.md');
    expect(defs[0].props).toContain('label');
    expect(defs[0].props).toContain('size');
    expect(defs[0].props).not.toContain('Prop');
  });

  it('prop 소문자도 제외한다', () => {
    const content = '# Input\n\n| prop | type |\n| value | string |\n';
    const defs = parseMdContent(content, 'Input.md');
    expect(defs[0].props).not.toContain('prop');
    expect(defs[0].props).toContain('value');
  });
});
