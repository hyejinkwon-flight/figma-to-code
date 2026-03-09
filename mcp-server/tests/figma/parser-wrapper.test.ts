import { describe, it, expect } from 'vitest';
import { detectWrapperPattern, identifyComponents } from '../../src/figma/parser.js';
import type { ExtractedNode, FigmaFileData } from '../../src/types.js';

function makeNode(overrides: Partial<ExtractedNode> = {}): ExtractedNode {
  return {
    id: '1:1', name: 'Node', type: 'FRAME', visible: true, locked: false,
    depth: 0, parentId: null, childCount: 0, isLeaf: true,
    absolutePosition: { x: 0, y: 0 }, size: { width: 100, height: 50 },
    children: [], ...overrides,
  };
}

describe('detectWrapperPattern', () => {
  it('이름에 "Bottom Sheet"가 포함된 FRAME을 바텀시트로 감지한다', () => {
    const node = makeNode({
      name: 'Bottom Sheet / 판매자 정보',
      children: [
        makeNode({ id: '2:1', name: 'Handle', type: 'FRAME', size: { width: 40, height: 4 } }),
        makeNode({ id: '2:2', name: 'Close Button', type: 'FRAME', size: { width: 24, height: 24 } }),
        makeNode({ id: '2:3', name: 'Content', type: 'FRAME', size: { width: 375, height: 400 } }),
      ],
      childCount: 3, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('bottom-sheet');
    expect(result!.wrapperNodeId).toBe('1:1');
    expect(result!.contentNodeId).toBe('2:3');
  });

  it('이름에 "modal"이 포함된 FRAME을 모달로 감지한다', () => {
    const node = makeNode({
      name: 'Modal/Confirmation',
      children: [
        makeNode({ id: '2:1', name: 'Overlay', type: 'RECTANGLE', size: { width: 375, height: 812 } }),
        makeNode({ id: '2:2', name: 'Dialog Content', type: 'FRAME', size: { width: 320, height: 200 } }),
      ],
      childCount: 2, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('modal');
  });

  it('drag handle + close button 구조로 바텀시트를 추론한다 (이름 매칭 없이)', () => {
    const node = makeNode({
      name: 'SellerInfoView',
      children: [
        makeNode({ id: '2:1', name: 'Grabber', type: 'FRAME', size: { width: 40, height: 4 } }),
        makeNode({ id: '2:2', name: 'Header', type: 'FRAME', children: [
          makeNode({ id: '3:1', name: 'Title Text', type: 'TEXT', characters: '판매자 정보', size: { width: 100, height: 24 } }),
          makeNode({ id: '3:2', name: 'Dismiss Button', type: 'FRAME', size: { width: 24, height: 24 } }),
        ], childCount: 2, isLeaf: false, size: { width: 375, height: 48 } }),
        makeNode({ id: '2:3', name: 'InfoTable', type: 'FRAME', size: { width: 375, height: 300 } }),
      ],
      childCount: 3, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('bottom-sheet');
    // drag handle + close button + title 감지
    const roles = result!.detectedParts.map(p => p.role);
    expect(roles).toContain('drag-handle');
    expect(roles).toContain('close-button');
    expect(roles).toContain('title');
  });

  it('overlay + close button 구조로 모달을 추론한다', () => {
    const node = makeNode({
      name: 'PaymentConfirm',
      children: [
        makeNode({ id: '2:1', name: 'Backdrop Dim', type: 'RECTANGLE', size: { width: 375, height: 812 } }),
        makeNode({ id: '2:2', name: 'Close Icon', type: 'FRAME', size: { width: 24, height: 24 } }),
        makeNode({ id: '2:3', name: 'ConfirmContent', type: 'FRAME', size: { width: 300, height: 200 } }),
      ],
      childCount: 3, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).not.toBeNull();
    expect(result!.pattern).toBe('modal');
  });

  it('래퍼 패턴이 없는 일반 FRAME은 null을 반환한다', () => {
    const node = makeNode({
      name: 'CardList',
      children: [
        makeNode({ id: '2:1', name: 'Card1', type: 'FRAME' }),
        makeNode({ id: '2:2', name: 'Card2', type: 'FRAME' }),
      ],
      childCount: 2, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).toBeNull();
  });

  it('콘텐츠 노드를 면적 기준으로 올바르게 식별한다', () => {
    const node = makeNode({
      name: 'BottomSheet/Order',
      children: [
        makeNode({ id: '2:1', name: 'Handle Bar', type: 'FRAME', size: { width: 40, height: 4 } }),
        makeNode({ id: '2:2', name: 'SmallHeader', type: 'FRAME', size: { width: 375, height: 48 } }),
        makeNode({ id: '2:3', name: 'OrderContent', type: 'FRAME', size: { width: 375, height: 600 } }),
      ],
      childCount: 3, isLeaf: false,
    });

    const result = detectWrapperPattern(node);
    expect(result).not.toBeNull();
    // 가장 큰 면적의 OrderContent가 콘텐츠 노드로 식별
    expect(result!.contentNodeId).toBe('2:3');
  });
});

describe('identifyComponents — 래퍼 패턴 통합', () => {
  it('바텀시트 FRAME을 후보에 포함한다', () => {
    const fileData: FigmaFileData = {
      fileName: 'Test', totalPages: 1, totalNodes: 5,
      extractedAt: '',
      pages: [{
        pageId: 'p:1', pageName: 'Page', totalNodeCount: 5,
        leafNodeCount: 2, maxDepth: 2,
        layers: [
          makeNode({
            id: '1:1', name: 'Bottom Sheet / SellerInfo', type: 'FRAME',
            children: [
              makeNode({ id: '2:1', name: 'Drag Handle', type: 'FRAME', size: { width: 40, height: 4 } }),
              makeNode({ id: '2:2', name: 'Close Btn', type: 'FRAME', size: { width: 24, height: 24 } }),
              makeNode({ id: '2:3', name: 'InfoContent', type: 'COMPONENT', size: { width: 375, height: 300 } }),
            ],
            childCount: 3, isLeaf: false,
          }),
        ],
      }],
    };

    const candidates = identifyComponents(fileData);

    // 바텀시트 FRAME이 래퍼 패턴 후보로 잡혀야 함
    const wrapperCandidate = candidates.find(c => c.wrapperPattern?.pattern === 'bottom-sheet');
    expect(wrapperCandidate).toBeDefined();
    expect(wrapperCandidate!.nodeId).toBe('1:1');

    // COMPONENT 자식도 별도 후보로 잡히고, parentContext가 있어야 함
    const componentCandidate = candidates.find(c => c.nodeType === 'COMPONENT');
    expect(componentCandidate).toBeDefined();
    expect(componentCandidate!.parentContext?.parentWrapperPattern).toBe('bottom-sheet');
  });

  it('래퍼 패턴이 없는 파일은 기존 로직대로 동작한다', () => {
    const fileData: FigmaFileData = {
      fileName: 'Test', totalPages: 1, totalNodes: 2,
      extractedAt: '',
      pages: [{
        pageId: 'p:1', pageName: 'Page', totalNodeCount: 2,
        leafNodeCount: 1, maxDepth: 1,
        layers: [
          makeNode({ id: '1:1', name: 'Button', type: 'COMPONENT' }),
        ],
      }],
    };

    const candidates = identifyComponents(fileData);
    expect(candidates.length).toBe(1);
    expect(candidates[0].wrapperPattern).toBeUndefined();
    expect(candidates[0].nodeType).toBe('COMPONENT');
  });
});
