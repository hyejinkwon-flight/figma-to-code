import { describe, it, expect } from 'vitest';
import { traverseNode, extractAllPages, countNodes } from '../../src/figma/traverser.js';
import type { FigmaAPINode, FigmaFileResponse } from '../../src/types.js';

/** 테스트용 Figma API 노드를 생성한다 */
function createApiNode(overrides: Partial<FigmaAPINode> = {}): FigmaAPINode {
  return {
    id: '1:1',
    name: 'TestNode',
    type: 'FRAME',
    visible: true,
    ...overrides,
  };
}

function createFileResponse(pages: FigmaAPINode[] = []): FigmaFileResponse {
  return {
    name: 'Test File',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: pages,
    },
    components: {},
    styles: {},
  };
}

describe('traverseNode', () => {
  it('기본 노드를 변환한다', () => {
    const apiNode = createApiNode();
    const result = traverseNode(apiNode);

    expect(result.id).toBe('1:1');
    expect(result.name).toBe('TestNode');
    expect(result.type).toBe('FRAME');
    expect(result.visible).toBe(true);
    expect(result.locked).toBe(false);
    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
    expect(result.isLeaf).toBe(true);
    expect(result.children).toEqual([]);
  });

  it('자식 노드를 재귀적으로 탐색한다', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({ id: '2:1', name: 'Child1', type: 'TEXT', characters: 'Hello' }),
        createApiNode({ id: '2:2', name: 'Child2', type: 'RECTANGLE' }),
      ],
    });

    const result = traverseNode(apiNode);
    expect(result.isLeaf).toBe(false);
    expect(result.childCount).toBe(2);
    expect(result.children[0].depth).toBe(1);
    expect(result.children[0].parentId).toBe('1:1');
  });

  it('TEXT 노드에서 characters와 style을 추출한다', () => {
    const apiNode = createApiNode({
      type: 'TEXT',
      characters: 'Hello World',
      style: { fontSize: 16, fontWeight: 700 },
    });

    const result = traverseNode(apiNode);
    expect(result.characters).toBe('Hello World');
    expect(result.style?.fontSize).toBe(16);
  });

  it('INSTANCE 노드에서 componentId를 추출한다', () => {
    const apiNode = createApiNode({
      type: 'INSTANCE',
      componentId: 'comp:1',
    });

    const result = traverseNode(apiNode);
    expect(result.componentId).toBe('comp:1');
  });

  it('COMPONENT 노드에서 componentName을 설정한다', () => {
    const apiNode = createApiNode({
      type: 'COMPONENT',
      name: 'MyButton',
    });

    const result = traverseNode(apiNode);
    expect(result.componentName).toBe('MyButton');
  });

  it('공통 속성들을 추출한다', () => {
    const apiNode = createApiNode({
      absoluteBoundingBox: { x: 10, y: 20, width: 300, height: 200 },
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
      strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0, a: 1 } }],
      effects: [{ type: 'DROP_SHADOW', radius: 4 }],
      opacity: 0.8,
      blendMode: 'NORMAL',
      cornerRadius: 8,
      layoutMode: 'HORIZONTAL',
      itemSpacing: 12,
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    });

    const result = traverseNode(apiNode);
    expect(result.absolutePosition).toEqual({ x: 10, y: 20 });
    expect(result.size).toEqual({ width: 300, height: 200 });
    expect(result.fills?.length).toBe(1);
    expect(result.strokes?.length).toBe(1);
    expect(result.effects?.length).toBe(1);
    expect(result.opacity).toBe(0.8);
    expect(result.cornerRadius).toBe(8);
    expect(result.layoutMode).toBe('HORIZONTAL');
    expect(result.itemSpacing).toBe(12);
    expect(result.padding).toEqual({ top: 8, right: 16, bottom: 8, left: 16 });
  });

  it('rectangleCornerRadii를 fallback으로 사용한다', () => {
    const apiNode = createApiNode({
      rectangleCornerRadii: [4, 8, 4, 8],
    });

    const result = traverseNode(apiNode);
    expect(result.cornerRadius).toEqual([4, 8, 4, 8]);
  });

  it('absoluteBoundingBox가 없으면 기본값 0을 사용한다', () => {
    const apiNode = createApiNode({ absoluteBoundingBox: undefined });
    const result = traverseNode(apiNode);
    expect(result.absolutePosition).toEqual({ x: 0, y: 0 });
    expect(result.size).toEqual({ width: 0, height: 0 });
  });

  it('maxDepth 옵션을 적용한다', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({
          id: '2:1',
          children: [createApiNode({ id: '3:1' })],
        }),
      ],
    });

    const result = traverseNode(apiNode, 0, null, { maxDepth: 1 });
    expect(result.children.length).toBe(1);
    expect(result.children[0].children.length).toBe(0);
  });

  it('includeHidden=false 시 숨겨진 노드를 제외한다', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({ id: '2:1', name: 'Visible', visible: true }),
        createApiNode({ id: '2:2', name: 'Hidden', visible: false }),
      ],
    });

    const result = traverseNode(apiNode, 0, null, { includeHidden: false });
    expect(result.children.length).toBe(1);
    expect(result.children[0].name).toBe('Visible');
  });

  it('includeHidden=false이고 자식이 모두 숨겨진 경우 isLeaf=true', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({ id: '2:1', visible: false }),
        createApiNode({ id: '2:2', visible: false }),
      ],
    });

    const result = traverseNode(apiNode, 0, null, { includeHidden: false });
    expect(result.children.length).toBe(0);
    expect(result.isLeaf).toBe(true);
    expect(result.childCount).toBe(0);
  });

  it('maxDepth에 도달하면 자식을 탐색하지 않지만 hasChildren 상태는 유지한다', () => {
    const apiNode = createApiNode({
      children: [createApiNode({ id: '2:1' })],
    });

    // maxDepth=0이면 depth=0에서 자식을 탐색하지 않음
    const result = traverseNode(apiNode, 0, null, { maxDepth: 0 });
    expect(result.children.length).toBe(0);
    // 자식이 존재하지만 탐색하지 않았으므로 isLeaf=false, childCount=1 유지
    expect(result.isLeaf).toBe(false);
    expect(result.childCount).toBe(1);
  });

  it('includeHidden 기본값(true)이면 숨겨진 노드도 포함한다', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({ id: '2:1', visible: true }),
        createApiNode({ id: '2:2', visible: false }),
      ],
    });

    const result = traverseNode(apiNode);
    expect(result.children.length).toBe(2);
  });

  it('visible이 undefined이면 true로 취급한다', () => {
    const apiNode = createApiNode({ visible: undefined });
    const result = traverseNode(apiNode);
    expect(result.visible).toBe(true);
  });

  it('locked가 undefined이면 false로 취급한다', () => {
    const apiNode = createApiNode({ locked: undefined });
    const result = traverseNode(apiNode);
    expect(result.locked).toBe(false);
  });

  it('padding - paddingLeft가 null이면 padding을 설정하지 않는다', () => {
    const apiNode = createApiNode({ paddingLeft: undefined, paddingTop: 10 });
    const result = traverseNode(apiNode);
    expect(result.padding).toBeUndefined();
  });

  it('padding - 일부 패딩만 있으면 나머지는 0으로 설정한다', () => {
    const apiNode = createApiNode({
      paddingLeft: 10,
      paddingTop: undefined,
      paddingRight: undefined,
      paddingBottom: undefined,
    });
    const result = traverseNode(apiNode);
    expect(result.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 10 });
  });

  it('padding - paddingTop만 undefined인 경우', () => {
    const apiNode = createApiNode({
      paddingLeft: 5,
      paddingTop: undefined,
      paddingRight: 10,
      paddingBottom: 15,
    });
    const result = traverseNode(apiNode);
    expect(result.padding).toEqual({ top: 0, right: 10, bottom: 15, left: 5 });
  });

  it('padding - paddingBottom만 undefined인 경우 ?? 0 fallback', () => {
    const apiNode = createApiNode({
      paddingLeft: 5,
      paddingTop: 10,
      paddingRight: 8,
      paddingBottom: undefined,
    });
    const result = traverseNode(apiNode);
    expect(result.padding).toEqual({ top: 10, right: 8, bottom: 0, left: 5 });
  });
});

describe('countNodes', () => {
  it('단일 노드는 1을 반환한다', () => {
    const node = traverseNode(createApiNode());
    expect(countNodes(node)).toBe(1);
  });

  it('자식 포함한 총 노드 수를 반환한다', () => {
    const apiNode = createApiNode({
      children: [
        createApiNode({ id: '2:1', children: [createApiNode({ id: '3:1' })] }),
        createApiNode({ id: '2:2' }),
      ],
    });
    const node = traverseNode(apiNode);
    expect(countNodes(node)).toBe(4);
  });
});

describe('extractAllPages', () => {
  it('빈 파일 데이터를 처리한다', () => {
    const fileData = createFileResponse();
    const result = extractAllPages(fileData);

    expect(result.fileName).toBe('Test File');
    expect(result.totalPages).toBe(0);
    expect(result.totalNodes).toBe(0);
    expect(result.extractedAt).toBeDefined();
  });

  it('여러 페이지를 추출한다', () => {
    const fileData = createFileResponse([
      createApiNode({
        id: 'page:1',
        name: 'Page 1',
        type: 'CANVAS',
        children: [
          createApiNode({ id: '1:1', children: [createApiNode({ id: '2:1' })] }),
        ],
      }),
      createApiNode({
        id: 'page:2',
        name: 'Page 2',
        type: 'CANVAS',
        children: [createApiNode({ id: '3:1' })],
      }),
    ]);

    const result = extractAllPages(fileData);
    expect(result.totalPages).toBe(2);
    expect(result.totalNodes).toBe(3);
    expect(result.pages[0].pageName).toBe('Page 1');
    expect(result.pages[0].totalNodeCount).toBe(2);
    expect(result.pages[0].leafNodeCount).toBe(1);
    expect(result.pages[0].maxDepth).toBe(1);
    expect(result.pages[1].totalNodeCount).toBe(1);
  });

  it('pageFilter로 특정 페이지만 추출한다', () => {
    const fileData = createFileResponse([
      createApiNode({ id: 'page:1', name: 'Home', type: 'CANVAS', children: [] }),
      createApiNode({ id: 'page:2', name: 'Settings', type: 'CANVAS', children: [] }),
    ]);

    const result = extractAllPages(fileData, { pageFilter: ['home'] });
    expect(result.totalPages).toBe(1);
    expect(result.pages[0].pageName).toBe('Home');
  });

  it('pageFilter가 빈 배열이면 모든 페이지를 추출한다', () => {
    const fileData = createFileResponse([
      createApiNode({ id: 'page:1', name: 'A', type: 'CANVAS', children: [] }),
      createApiNode({ id: 'page:2', name: 'B', type: 'CANVAS', children: [] }),
    ]);

    const result = extractAllPages(fileData, { pageFilter: [] });
    expect(result.totalPages).toBe(2);
  });

  it('children이 없는 페이지를 처리한다', () => {
    const fileData = createFileResponse([
      createApiNode({ id: 'page:1', name: 'Empty', type: 'CANVAS' }),
    ]);

    const result = extractAllPages(fileData);
    expect(result.pages[0].totalNodeCount).toBe(0);
    expect(result.pages[0].layers).toEqual([]);
  });
});
