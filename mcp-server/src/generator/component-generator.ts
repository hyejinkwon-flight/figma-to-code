// React 컴포넌트 코드 생성기
import type {
  ExtractedNode,
  GeneratedComponent,
  GenerateOptions,
  Paint,
  ComponentRegistryEntry,
  WrapperPatternInfo,
} from '../types.js';

/** 문자열을 PascalCase로 변환한다 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .split(/[\s_-]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

/** 문자열을 camelCase로 변환한다 */
export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export interface StyleMap {
  [className: string]: Record<string, string>;
}

/** ExtractedNode의 스타일을 CSS 속성 맵으로 추출한다 */
export function extractStyles(node: ExtractedNode): StyleMap {
  const styles: StyleMap = {};

  function processNode(n: ExtractedNode) {
    const cssProps: Record<string, string> = {};

    // 크기
    if (n.size.width) cssProps.width = `${n.size.width}px`;
    if (n.size.height) cssProps.height = `${n.size.height}px`;

    // Auto Layout → Flexbox
    if (n.layoutMode === 'HORIZONTAL') {
      cssProps.display = 'flex';
      cssProps.flexDirection = 'row';
      if (n.itemSpacing) cssProps.gap = `${n.itemSpacing}px`;
    } else if (n.layoutMode === 'VERTICAL') {
      cssProps.display = 'flex';
      cssProps.flexDirection = 'column';
      if (n.itemSpacing) cssProps.gap = `${n.itemSpacing}px`;
    }

    // 패딩
    if (n.padding) {
      const { top, right, bottom, left } = n.padding;
      cssProps.padding = `${top}px ${right}px ${bottom}px ${left}px`;
    }

    // 배경색
    if (n.fills?.length) {
      const solidFill = n.fills.find(
        (f: Paint) => f.type === 'SOLID' && f.visible !== false
      );
      if (solidFill?.color) {
        const { r, g, b } = solidFill.color;
        cssProps.backgroundColor = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      }
    }

    // 테두리 둥글기
    if (n.cornerRadius != null) {
      if (Array.isArray(n.cornerRadius)) {
        cssProps.borderRadius = n.cornerRadius.map(r => `${r}px`).join(' ');
      } else {
        cssProps.borderRadius = `${n.cornerRadius}px`;
      }
    }

    // 투명도
    if (n.opacity !== undefined && n.opacity < 1) {
      cssProps.opacity = String(n.opacity);
    }

    // 텍스트 스타일
    if (n.type === 'TEXT' && n.style) {
      if (n.style.fontSize) cssProps.fontSize = `${n.style.fontSize}px`;
      if (n.style.fontWeight) cssProps.fontWeight = String(n.style.fontWeight);
      if (n.style.fontFamily) cssProps.fontFamily = n.style.fontFamily;
      if (n.style.lineHeightPx) cssProps.lineHeight = `${n.style.lineHeightPx}px`;
      if (n.style.letterSpacing) cssProps.letterSpacing = `${n.style.letterSpacing}px`;
      if (n.style.textAlignHorizontal) {
        cssProps.textAlign = n.style.textAlignHorizontal.toLowerCase();
      }
    }

    const key = toCamelCase(n.name) || `node_${n.id.replace(/[^a-zA-Z0-9]/g, '_')}`;
    styles[key] = cssProps;
    n.children.forEach(processNode);
  }

  processNode(node);
  return styles;
}

/** 노드에서 Props 인터페이스를 추론한다 */
export function inferProps(node: ExtractedNode): Array<{ name: string; type: string; defaultValue?: string }> {
  const props: Array<{ name: string; type: string; defaultValue?: string }> = [];

  // TEXT 노드에서 label/text prop 추론
  function findTextNodes(n: ExtractedNode) {
    if (n.type === 'TEXT' && n.characters) {
      props.push({
        name: toCamelCase(n.name) || 'label',
        type: 'string',
        defaultValue: `'${n.characters.replace(/'/g, "\\'")}'`,
      });
    }
    n.children.forEach(findTextNodes);
  }

  findTextNodes(node);

  // 중복 제거
  const seen = new Set<string>();
  return props.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

/** 노드 트리를 JSX 문자열로 변환한다 */
export function nodeToJSX(node: ExtractedNode, indent: number = 2): string {
  const pad = ' '.repeat(indent);
  const className = toCamelCase(node.name) || `node_${node.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

  if (node.isLeaf) {
    if (node.type === 'TEXT' && node.characters) {
      return `${pad}<span className={styles.${className}}>{${toCamelCase(node.name) || 'label'}}</span>`;
    }
    return `${pad}<div className={styles.${className}} />`;
  }

  const childrenJSX = node.children
    .filter(c => c.visible)
    .map(c => nodeToJSX(c, indent + 2))
    .join('\n');

  const tag = node.type === 'TEXT' ? 'span' : 'div';
  return `${pad}<${tag} className={styles.${className}}>\n${childrenJSX}\n${pad}</${tag}>`;
}

/** 래퍼 패턴에 매핑되는 기존 컴포넌트를 찾는다 */
function findRegistryMatch(
  wrapperPattern: WrapperPatternInfo | undefined,
  registry: ComponentRegistryEntry[] | undefined
): ComponentRegistryEntry | null {
  if (!wrapperPattern || !registry || registry.length === 0) return null;

  return registry.find(entry => entry.pattern === wrapperPattern.pattern) ?? null;
}

/** 래퍼 부가 요소에서 title 텍스트 노드를 찾는다 */
function findTitleFromParts(
  wrapperPattern: WrapperPatternInfo,
  node: ExtractedNode
): string | null {
  const titlePart = wrapperPattern.detectedParts.find(p => p.role === 'title');
  if (!titlePart) return null;

  // 타이틀 노드에서 characters 추출
  function findText(n: ExtractedNode): string | null {
    if (n.id === titlePart!.nodeId && n.characters) return n.characters;
    if (n.id === titlePart!.nodeId) {
      // 타이틀 노드 자체가 TEXT가 아니면 자식 TEXT에서 찾기
      for (const child of n.children) {
        if (child.type === 'TEXT' && child.characters) return child.characters;
      }
    }
    for (const child of n.children) {
      const found = findText(child);
      if (found) return found;
    }
    return null;
  }

  return findText(node);
}

/** 래퍼 내부 콘텐츠 노드를 찾는다 */
function findContentNode(
  node: ExtractedNode,
  contentNodeId: string
): ExtractedNode | null {
  if (node.id === contentNodeId) return node;
  for (const child of node.children) {
    const found = findContentNode(child, contentNodeId);
    if (found) return found;
  }
  return null;
}

/** 기존 컴포넌트를 래퍼로 사용하는 합성 코드를 생성한다 */
function generateComposedComponent(
  node: ExtractedNode,
  wrapperPattern: WrapperPatternInfo,
  registryEntry: ComponentRegistryEntry,
  options: GenerateOptions
): GeneratedComponent {
  const contentNode = findContentNode(node, wrapperPattern.contentNodeId) ?? node;
  const contentName = toPascalCase(contentNode.name);
  const componentName = contentName + 'Page';

  // 콘텐츠 부분만 추출해서 inner 컴포넌트 생성
  const contentProps = inferProps(contentNode);
  const contentJSX = nodeToJSX(contentNode);
  const contentStyles = extractStyles(contentNode);

  const title = findTitleFromParts(wrapperPattern, node);

  // 래퍼 props 조합
  const wrapperProps: string[] = [];
  if (title) {
    wrapperProps.push(`title="${title}"`);
  }
  // 래퍼의 close-button이 있으면 onClose prop 추가
  const hasClose = wrapperPattern.detectedParts.some(p => p.role === 'close-button');
  if (hasClose) {
    wrapperProps.push('onClose={onClose}');
  }
  const wrapperPropsStr = wrapperProps.length > 0 ? ' ' + wrapperProps.join(' ') : '';

  // 콘텐츠 컴포넌트 Props
  const allProps = [...contentProps];
  if (hasClose) {
    allProps.push({ name: 'onClose', type: '() => void' });
  }

  const propsInterface = allProps.length > 0
    ? `interface ${componentName}Props {\n${allProps.map(p => `  ${p.name}?: ${p.type};`).join('\n')}\n}`
    : `interface ${componentName}Props {}`;

  const propsDestructuring = allProps.length > 0
    ? `{ ${allProps.map(p => {
        if (p.name === 'onClose') return 'onClose';
        return p.defaultValue ? `${p.name} = ${p.defaultValue}` : p.name;
      }).join(', ')} }: ${componentName}Props`
    : `_props: ${componentName}Props`;

  const componentCode = `import React from 'react';
import ${registryEntry.componentName} from '${registryEntry.importPath}';

${propsInterface}

const styles = ${JSON.stringify(contentStyles, null, 2)};

/** ${componentName} — ${registryEntry.componentName}로 래핑된 합성 컴포넌트 (Figma node ${node.id}) */
const ${componentName}: React.FC<${componentName}Props> = (${propsDestructuring}) => {
  return (
    <${registryEntry.componentName}${wrapperPropsStr}>
${contentJSX}
    </${registryEntry.componentName}>
  );
};

export default ${componentName};
export type { ${componentName}Props };
`;

  const typesCode = `export ${propsInterface}\n`;
  const indexCode = `export { default } from './${componentName}';\nexport type { ${componentName}Props } from './${componentName}';\n`;

  return {
    componentName,
    nodeId: node.id,
    files: {
      component: componentCode,
      types: typesCode,
      index: indexCode,
    },
  };
}

/** 컴포넌트 코드를 생성한다 */
export function generateComponent(
  node: ExtractedNode,
  options: GenerateOptions,
  wrapperPattern?: WrapperPatternInfo
): GeneratedComponent {
  // 래퍼 패턴 + 기존 컴포넌트 매핑이 있으면 합성 코드 생성
  const registryMatch = findRegistryMatch(wrapperPattern, options.componentRegistry);
  if (wrapperPattern && registryMatch) {
    return generateComposedComponent(node, wrapperPattern, registryMatch, options);
  }

  const componentName = toPascalCase(node.name);
  const props = inferProps(node);
  const jsxTree = nodeToJSX(node);
  const styles = extractStyles(node);

  const propsInterface = props.length > 0
    ? `interface ${componentName}Props {\n${props.map(p => `  ${p.name}?: ${p.type};`).join('\n')}\n}`
    : `interface ${componentName}Props {}`;

  const propsDestructuring = props.length > 0
    ? `{ ${props.map(p => p.defaultValue ? `${p.name} = ${p.defaultValue}` : p.name).join(', ')} }: ${componentName}Props`
    : `_props: ${componentName}Props`;

  const componentCode = `import React from 'react';

${propsInterface}

const styles = ${JSON.stringify(styles, null, 2)};

/** ${componentName} 컴포넌트 — Figma node ${node.id} 기반 자동 생성 */
const ${componentName}: React.FC<${componentName}Props> = (${propsDestructuring}) => {
  return (
${jsxTree}
  );
};

export default ${componentName};
export type { ${componentName}Props };
`;

  const typesCode = `export ${propsInterface}\n`;

  const indexCode = `export { default } from './${componentName}';\nexport type { ${componentName}Props } from './${componentName}';\n`;

  return {
    componentName,
    nodeId: node.id,
    files: {
      component: componentCode,
      types: typesCode,
      index: indexCode,
    },
  };
}
