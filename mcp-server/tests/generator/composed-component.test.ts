import { describe, it, expect } from '@jest/globals';
import { generateComponent } from '../../src/generator/component-generator.js';
import type { ExtractedNode, ComponentRegistryEntry, WrapperPatternInfo, GenerateOptions } from '../../src/types.js';

function makeNode(overrides: Partial<ExtractedNode> = {}): ExtractedNode {
  return {
    id: '1:1', name: 'Node', type: 'FRAME', visible: true, locked: false,
    depth: 0, parentId: null, childCount: 0, isLeaf: true,
    absolutePosition: { x: 0, y: 0 }, size: { width: 100, height: 50 },
    children: [], ...overrides,
  };
}

const baseOptions: GenerateOptions = {
  styleSystem: 'tailwind',
  outputDir: './out',
};

describe('generateComponent — 합성 코드 생성', () => {
  it('래퍼 패턴 + 레지스트리 매핑이 있으면 합성 코드를 생성한다', () => {
    const node = makeNode({
      id: '1:1', name: 'BottomSheet SellerInfo',
      children: [
        makeNode({ id: '2:1', name: 'DragHandle', type: 'FRAME', size: { width: 40, height: 4 } }),
        makeNode({ id: '2:2', name: 'Header', type: 'FRAME', children: [
          makeNode({ id: '3:1', name: '판매자 정보', type: 'TEXT', characters: '판매자 정보', size: { width: 100, height: 24 } }),
          makeNode({ id: '3:2', name: 'CloseButton', type: 'FRAME', size: { width: 24, height: 24 } }),
        ], childCount: 2, isLeaf: false, size: { width: 375, height: 48 } }),
        makeNode({ id: '2:3', name: 'InfoContent', type: 'FRAME', size: { width: 375, height: 300 },
          children: [
            makeNode({ id: '4:1', name: '사업자등록번호', type: 'TEXT', characters: '123-45-67890' }),
          ], childCount: 1, isLeaf: false,
        }),
      ],
      childCount: 3, isLeaf: false,
    });

    const wrapperPattern: WrapperPatternInfo = {
      pattern: 'bottom-sheet',
      wrapperNodeId: '1:1',
      contentNodeId: '2:3',
      detectedParts: [
        { role: 'drag-handle', nodeId: '2:1', nodeName: 'DragHandle' },
        { role: 'close-button', nodeId: '3:2', nodeName: 'CloseButton' },
        { role: 'title', nodeId: '3:1', nodeName: '판매자 정보' },
      ],
      confidence: 0.85,
    };

    const registry: ComponentRegistryEntry[] = [{
      componentName: 'BottomSheet',
      importPath: '@/components/BottomSheet',
      pattern: 'bottom-sheet',
    }];

    const result = generateComponent(node, { ...baseOptions, componentRegistry: registry }, wrapperPattern);

    // 합성 컴포넌트 이름은 콘텐츠 + Page
    expect(result.componentName).toBe('InfocontentPage');
    // BottomSheet import가 있어야 함
    expect(result.files.component).toContain("import BottomSheet from '@/components/BottomSheet'");
    // BottomSheet 태그로 래핑되어야 함
    expect(result.files.component).toContain('<BottomSheet');
    expect(result.files.component).toContain('</BottomSheet>');
    // title prop이 전달되어야 함
    expect(result.files.component).toContain('title="판매자 정보"');
    // onClose prop이 있어야 함
    expect(result.files.component).toContain('onClose={onClose}');
  });

  it('래퍼 패턴이 있지만 레지스트리 매핑이 없으면 일반 코드를 생성한다', () => {
    const node = makeNode({
      id: '1:1', name: 'BottomSheet SellerInfo',
      children: [
        makeNode({ id: '2:1', name: 'Content', type: 'FRAME' }),
      ],
      childCount: 1, isLeaf: false,
    });

    const wrapperPattern: WrapperPatternInfo = {
      pattern: 'bottom-sheet',
      wrapperNodeId: '1:1',
      contentNodeId: '2:1',
      detectedParts: [],
      confidence: 0.5,
    };

    // 레지스트리 없음
    const result = generateComponent(node, baseOptions, wrapperPattern);

    // 일반 컴포넌트로 생성 (합성 아님)
    expect(result.componentName).toBe('BottomsheetSellerinfo');
    expect(result.files.component).not.toContain('import BottomSheet');
  });

  it('래퍼 패턴 없이 호출하면 기존 로직대로 동작한다', () => {
    const node = makeNode({ name: 'SimpleCard' });
    const result = generateComponent(node, baseOptions);

    expect(result.componentName).toBe('Simplecard');
    expect(result.files.component).toContain('const Simplecard');
  });

  it('모달 패턴 + 레지스트리 매핑도 동작한다', () => {
    const node = makeNode({
      id: '1:1', name: 'ConfirmModal',
      children: [
        makeNode({ id: '2:1', name: 'Overlay', type: 'RECTANGLE', size: { width: 375, height: 812 } }),
        makeNode({ id: '2:2', name: 'DialogBox', type: 'FRAME', size: { width: 320, height: 200 },
          children: [
            makeNode({ id: '3:1', name: 'Message', type: 'TEXT', characters: '확인하시겠습니까?' }),
          ], childCount: 1, isLeaf: false,
        }),
      ],
      childCount: 2, isLeaf: false,
    });

    const wrapperPattern: WrapperPatternInfo = {
      pattern: 'modal',
      wrapperNodeId: '1:1',
      contentNodeId: '2:2',
      detectedParts: [
        { role: 'overlay', nodeId: '2:1', nodeName: 'Overlay' },
      ],
      confidence: 0.7,
    };

    const registry: ComponentRegistryEntry[] = [{
      componentName: 'Modal',
      importPath: '@/components/Modal',
      pattern: 'modal',
    }];

    const result = generateComponent(node, { ...baseOptions, componentRegistry: registry }, wrapperPattern);

    expect(result.files.component).toContain("import Modal from '@/components/Modal'");
    expect(result.files.component).toContain('<Modal');
  });
});
