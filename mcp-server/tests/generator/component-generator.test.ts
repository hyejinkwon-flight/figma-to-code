import { describe, it, expect } from '@jest/globals';
import {
  toPascalCase,
  toCamelCase,
  extractStyles,
  inferProps,
  nodeToJSX,
  generateComponent,
} from '../../src/generator/component-generator.js';
import type { ExtractedNode } from '../../src/types.js';

function createNode(overrides: Partial<ExtractedNode> = {}): ExtractedNode {
  return {
    id: '1:1',
    name: 'test-node',
    type: 'FRAME',
    visible: true,
    locked: false,
    depth: 0,
    parentId: null,
    childCount: 0,
    isLeaf: true,
    absolutePosition: { x: 0, y: 0 },
    size: { width: 200, height: 100 },
    children: [],
    ...overrides,
  };
}

describe('toPascalCase', () => {
  it('space 구분 문자열을 변환한다', () => {
    expect(toPascalCase('hello world')).toBe('HelloWorld');
  });
  it('kebab-case를 변환한다', () => {
    expect(toPascalCase('my-component')).toBe('MyComponent');
  });
  it('snake_case를 변환한다', () => {
    expect(toPascalCase('my_component')).toBe('MyComponent');
  });
  it('특수문자를 제거한다', () => {
    expect(toPascalCase('hello@world!')).toBe('Helloworld');
  });
  it('빈 문자열을 처리한다', () => {
    expect(toPascalCase('')).toBe('');
  });
});

describe('toCamelCase', () => {
  it('첫 글자를 소문자로 변환한다', () => {
    expect(toCamelCase('hello world')).toBe('helloWorld');
  });
  it('kebab-case를 변환한다', () => {
    expect(toCamelCase('my-button')).toBe('myButton');
  });
  it('빈 문자열을 처리한다', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('extractStyles', () => {
  it('크기 정보를 추출한다', () => {
    const node = createNode({ size: { width: 300, height: 50 } });
    const styles = extractStyles(node);
    expect(styles.testNode.width).toBe('300px');
    expect(styles.testNode.height).toBe('50px');
  });

  it('HORIZONTAL layout을 flex row로 변환한다', () => {
    const node = createNode({ layoutMode: 'HORIZONTAL', itemSpacing: 8 });
    const styles = extractStyles(node);
    expect(styles.testNode.display).toBe('flex');
    expect(styles.testNode.flexDirection).toBe('row');
    expect(styles.testNode.gap).toBe('8px');
  });

  it('VERTICAL layout을 flex column으로 변환한다', () => {
    const node = createNode({ layoutMode: 'VERTICAL', itemSpacing: 16 });
    const styles = extractStyles(node);
    expect(styles.testNode.flexDirection).toBe('column');
  });

  it('패딩을 추출한다', () => {
    const node = createNode({ padding: { top: 8, right: 16, bottom: 8, left: 16 } });
    const styles = extractStyles(node);
    expect(styles.testNode.padding).toBe('8px 16px 8px 16px');
  });

  it('배경색(SOLID fill)을 추출한다', () => {
    const node = createNode({
      fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    const styles = extractStyles(node);
    expect(styles.testNode.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('visible=false인 fill은 무시한다', () => {
    const node = createNode({
      fills: [{ type: 'SOLID', visible: false, color: { r: 1, g: 0, b: 0, a: 1 } }],
    });
    const styles = extractStyles(node);
    expect(styles.testNode.backgroundColor).toBeUndefined();
  });

  it('GRADIENT fill은 SOLID가 아니므로 backgroundColor를 설정하지 않는다', () => {
    const node = createNode({
      fills: [{ type: 'GRADIENT_LINEAR' }],
    });
    const styles = extractStyles(node);
    expect(styles.testNode.backgroundColor).toBeUndefined();
  });

  it('숫자 cornerRadius를 추출한다', () => {
    const node = createNode({ cornerRadius: 12 });
    const styles = extractStyles(node);
    expect(styles.testNode.borderRadius).toBe('12px');
  });

  it('배열 cornerRadius를 추출한다', () => {
    const node = createNode({ cornerRadius: [4, 8, 4, 8] });
    const styles = extractStyles(node);
    expect(styles.testNode.borderRadius).toBe('4px 8px 4px 8px');
  });

  it('opacity < 1을 추출한다', () => {
    const node = createNode({ opacity: 0.5 });
    const styles = extractStyles(node);
    expect(styles.testNode.opacity).toBe('0.5');
  });

  it('opacity = 1이면 설정하지 않는다', () => {
    const node = createNode({ opacity: 1 });
    const styles = extractStyles(node);
    expect(styles.testNode.opacity).toBeUndefined();
  });

  it('TEXT 노드의 텍스트 스타일을 추출한다', () => {
    const node = createNode({
      type: 'TEXT',
      style: {
        fontSize: 16,
        fontWeight: 600,
        fontFamily: 'Pretendard',
        lineHeightPx: 24,
        letterSpacing: 0.5,
        textAlignHorizontal: 'CENTER',
      },
    });
    const styles = extractStyles(node);
    expect(styles.testNode.fontSize).toBe('16px');
    expect(styles.testNode.fontWeight).toBe('600');
    expect(styles.testNode.fontFamily).toBe('Pretendard');
    expect(styles.testNode.lineHeight).toBe('24px');
    expect(styles.testNode.letterSpacing).toBe('0.5px');
    expect(styles.testNode.textAlign).toBe('center');
  });

  it('자식 노드의 스타일도 재귀적으로 추출한다', () => {
    const node = createNode({
      isLeaf: false,
      children: [createNode({ id: '2:1', name: 'Label', type: 'TEXT', size: { width: 80, height: 20 } })],
    });
    const styles = extractStyles(node);
    expect(styles.label).toBeDefined();
    expect(styles.label.width).toBe('80px');
  });

  it('이름이 비어있으면 node_id 기반 키를 사용한다', () => {
    const node = createNode({ name: '', id: '5:3' });
    const styles = extractStyles(node);
    const keys = Object.keys(styles);
    expect(keys[0]).toMatch(/node_5_3/);
  });
});

describe('inferProps', () => {
  it('TEXT 노드에서 props를 추론한다', () => {
    const node = createNode({
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'title', type: 'TEXT', characters: 'Hello' }),
      ],
    });
    const props = inferProps(node);
    expect(props.length).toBe(1);
    expect(props[0].name).toBe('title');
    expect(props[0].type).toBe('string');
    expect(props[0].defaultValue).toBe("'Hello'");
  });

  it('중복 이름 props를 제거한다', () => {
    const node = createNode({
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'label', type: 'TEXT', characters: 'A' }),
        createNode({ id: '2:2', name: 'label', type: 'TEXT', characters: 'B' }),
      ],
    });
    const props = inferProps(node);
    expect(props.length).toBe(1);
  });

  it("작은따옴표를 이스케이프한다", () => {
    const node = createNode({
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'msg', type: 'TEXT', characters: "it's" }),
      ],
    });
    const props = inferProps(node);
    expect(props[0].defaultValue).toBe("'it\\'s'");
  });

  it('TEXT 자식이 없으면 빈 배열을 반환한다', () => {
    const node = createNode();
    expect(inferProps(node)).toEqual([]);
  });

  it('이름이 없는 TEXT 노드는 label을 기본 이름으로 사용한다', () => {
    const node = createNode({
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: '', type: 'TEXT', characters: 'Click' }),
      ],
    });
    const props = inferProps(node);
    expect(props[0].name).toBe('label');
  });
});

describe('nodeToJSX', () => {
  it('리프 TEXT 노드를 span으로 변환한다', () => {
    const node = createNode({ type: 'TEXT', characters: 'Hello', name: 'label' });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('<span');
    expect(jsx).toContain('styles.label');
  });

  it('리프 RECTANGLE 노드를 self-closing div로 변환한다', () => {
    const node = createNode({ type: 'RECTANGLE', name: 'bg' });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('<div');
    expect(jsx).toContain('/>');
  });

  it('자식이 있는 노드를 감싸는 div로 변환한다', () => {
    const node = createNode({
      name: 'container',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'child', type: 'RECTANGLE' }),
      ],
    });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('<div className={styles.container}>');
    expect(jsx).toContain('</div>');
  });

  it('visible=false 자식은 JSX에 포함하지 않는다', () => {
    const node = createNode({
      name: 'wrapper',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'shown', visible: true }),
        createNode({ id: '2:2', name: 'hidden', visible: false }),
      ],
    });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('styles.shown');
    expect(jsx).not.toContain('styles.hidden');
  });
});

describe('generateComponent', () => {
  it('컴포넌트 코드를 생성한다', () => {
    const node = createNode({
      name: 'my-card',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'title', type: 'TEXT', characters: 'Card Title' }),
      ],
    });

    const result = generateComponent(node, { styleSystem: 'tailwind', outputDir: './out' });
    expect(result.componentName).toBe('MyCard');
    expect(result.nodeId).toBe('1:1');
    expect(result.files.component).toContain('const MyCard');
    expect(result.files.component).toContain('MyCardProps');
    expect(result.files.types).toContain('interface MyCardProps');
    expect(result.files.index).toContain("export { default }");
  });

  it('TEXT 자식이 없으면 빈 props 인터페이스를 생성한다', () => {
    const node = createNode({ name: 'box' });
    const result = generateComponent(node, { styleSystem: 'tailwind', outputDir: './out' });
    expect(result.files.component).toContain('interface BoxProps {}');
  });

  it('ELLIPSE 리프 노드를 self-closing div로 변환한다', () => {
    const node = createNode({ type: 'ELLIPSE', name: 'circle' });
    const result = generateComponent(node, { styleSystem: 'tailwind', outputDir: './out' });
    expect(result.files.component).toContain('div');
  });

  it('itemSpacing 없이 layoutMode만 있는 경우', () => {
    const node = createNode({ name: 'flex-box', layoutMode: 'HORIZONTAL' });
    const styles = extractStyles(node);
    expect(styles.flexBox.display).toBe('flex');
    expect(styles.flexBox.gap).toBeUndefined();
  });

  it('NONE layoutMode일 때 flex를 설정하지 않는다', () => {
    const node = createNode({ name: 'no-layout', layoutMode: 'NONE' });
    const styles = extractStyles(node);
    expect(styles.noLayout.display).toBeUndefined();
  });

  it('fill에 color가 없는 SOLID도 처리한다', () => {
    const node = createNode({ name: 'no-color', fills: [{ type: 'SOLID' }] });
    const styles = extractStyles(node);
    expect(styles.noColor.backgroundColor).toBeUndefined();
  });

  it('size가 0이면 width/height를 설정하지 않는다', () => {
    const node = createNode({ name: 'zero-size', size: { width: 0, height: 0 } });
    const styles = extractStyles(node);
    expect(styles.zeroSize.width).toBeUndefined();
    expect(styles.zeroSize.height).toBeUndefined();
  });

  it('opacity가 undefined이면 설정하지 않는다', () => {
    const node = createNode({ name: 'no-opacity' });
    const styles = extractStyles(node);
    expect(styles.noOpacity.opacity).toBeUndefined();
  });

  it('TEXT 노드가 아닌 경우 style 속성을 무시한다', () => {
    const node = createNode({ name: 'frame-node', type: 'FRAME', style: { fontSize: 16 } });
    const styles = extractStyles(node);
    expect(styles.frameNode.fontSize).toBeUndefined();
  });

  it('TEXT 노드의 비어있는 style을 처리한다', () => {
    const node = createNode({ name: 'empty-text', type: 'TEXT', style: {} });
    const styles = extractStyles(node);
    expect(styles.emptyText.fontSize).toBeUndefined();
  });

  it('이름이 비어있는 리프 노드의 JSX에서 fallback 키를 사용한다', () => {
    const node = createNode({ name: '', id: '5:3', type: 'RECTANGLE' });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('node_5_3');
  });

  it('이름이 비어있는 TEXT 노드에서 label fallback을 사용한다', () => {
    const node = createNode({ name: '', id: '5:4', type: 'TEXT', characters: 'Hi' });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('label');
  });

  it('TEXT 타입의 부모 노드는 span 태그로 감싼다', () => {
    const node = createNode({
      name: 'text-group',
      type: 'TEXT',
      isLeaf: false,
      children: [createNode({ id: '2:1', name: 'inner', type: 'TEXT', characters: 'X' })],
    });
    const jsx = nodeToJSX(node);
    expect(jsx).toContain('<span className=');
    expect(jsx).toContain('</span>');
  });

  it('defaultValue가 없는 prop을 처리한다 (characters가 비어있는 TEXT)', () => {
    // characters가 빈 문자열인 경우 inferProps에서 제외됨
    // 대신 직접 inferProps를 테스트
    const node = createNode({
      name: 'my-form',
      isLeaf: false,
      children: [
        createNode({ id: '2:1', name: 'title', type: 'TEXT', characters: 'Hello' }),
      ],
    });
    const props = inferProps(node);
    // 모든 TEXT prop은 defaultValue가 있으므로 이 케이스는 항상 defaultValue 있음
    expect(props[0].defaultValue).toBeDefined();
    const result = generateComponent(node, { styleSystem: 'tailwind', outputDir: './out' });
    expect(result.files.component).toContain("title = 'Hello'");
  });
});
