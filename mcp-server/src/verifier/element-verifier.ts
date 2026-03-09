// 요소별 검증기 — Figma 디자인 컨텍스트 기반 9항목 검증
import type {
  ElementCheckCategory,
  ElementCheckItem,
  ElementVerificationResult,
  ElementVerificationReport,
  ExtractedNode,
} from '../types.js';

/** 검증 대상 요소 정의 (Figma 스크린샷에서 추출) */
export interface VerifyElement {
  name: string;
  figmaNodeId: string;
  /** Figma get_design_context에서 가져온 디자인 속성 */
  figmaProps: FigmaElementProps;
  /** 렌더링 결과에서 확인한 속성 */
  renderedProps: RenderedElementProps;
}

/** Figma 디자인에서 추출한 요소 속성 */
export interface FigmaElementProps {
  exists: boolean;
  layout?: {
    direction?: 'row' | 'column';
    alignItems?: string;
    justifyContent?: string;
  };
  spacing?: {
    padding?: { top: number; right: number; bottom: number; left: number };
    gap?: number;
    margin?: { top: number; right: number; bottom: number; left: number };
  };
  size?: { width: number; height: number };
  color?: {
    background?: string;
    text?: string;
    border?: string;
  };
  typography?: {
    fontSize?: number;
    fontWeight?: number;
    lineHeight?: number;
  };
  border?: {
    width?: number;
    radius?: number | number[];
    style?: 'solid' | 'dashed' | 'dotted' | 'none';
  };
  effect?: {
    shadow?: string;
    opacity?: number;
  };
  icon?: {
    name?: string;
    containerSize?: { width: number; height: number };
    shapeSize?: { width: number; height: number };
    /** 아이콘 SVG 소스 경로 또는 컴포넌트명 */
    source?: string;
    /** Figma fills[0].color → hex 변환값 */
    fillColor?: string;
    /** Figma rotation (degree) */
    rotation?: number;
    /** Figma opacity */
    opacity?: number;
  };
}

/** 실제 렌더링 결과에서 확인한 요소 속성 */
export interface RenderedElementProps {
  exists: boolean;
  layout?: FigmaElementProps['layout'];
  spacing?: FigmaElementProps['spacing'];
  size?: FigmaElementProps['size'];
  color?: FigmaElementProps['color'];
  typography?: FigmaElementProps['typography'];
  border?: FigmaElementProps['border'];
  effect?: FigmaElementProps['effect'];
  icon?: FigmaElementProps['icon'];
}

const SPACING_TOLERANCE = 1; // ±1px
const SIZE_TOLERANCE = 2;    // ±2px

/** 숫자 비교 (허용 오차 포함) */
function numClose(a: number | undefined, b: number | undefined, tolerance: number): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) <= tolerance;
}

/** 문자열 비교 (대소문자 무시) */
function strMatch(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.toLowerCase() === b.toLowerCase();
}

/** 존재 여부 검증 */
function checkExistence(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  return {
    category: 'existence',
    passed: figma.exists && rendered.exists,
    figmaValue: figma.exists ? '있음' : '없음',
    renderedValue: rendered.exists ? '있음' : '없음',
  };
}

/** 배치 검증 */
function checkLayout(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.layout) {
    return { category: 'layout', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const dirMatch = strMatch(figma.layout.direction, rendered.layout?.direction);
  const alignMatch = strMatch(figma.layout.alignItems, rendered.layout?.alignItems);
  const justifyMatch = strMatch(figma.layout.justifyContent, rendered.layout?.justifyContent);
  const passed = dirMatch && alignMatch && justifyMatch;

  return {
    category: 'layout',
    passed,
    figmaValue: `${figma.layout.direction ?? '-'}, align=${figma.layout.alignItems ?? '-'}, justify=${figma.layout.justifyContent ?? '-'}`,
    renderedValue: `${rendered.layout?.direction ?? '-'}, align=${rendered.layout?.alignItems ?? '-'}, justify=${rendered.layout?.justifyContent ?? '-'}`,
  };
}

/** 간격 검증 */
function checkSpacing(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.spacing) {
    return { category: 'spacing', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const gapMatch = numClose(figma.spacing.gap, rendered.spacing?.gap, SPACING_TOLERANCE);
  const padMatch = figma.spacing.padding && rendered.spacing?.padding
    ? numClose(figma.spacing.padding.top, rendered.spacing.padding.top, SPACING_TOLERANCE)
      && numClose(figma.spacing.padding.right, rendered.spacing.padding.right, SPACING_TOLERANCE)
      && numClose(figma.spacing.padding.bottom, rendered.spacing.padding.bottom, SPACING_TOLERANCE)
      && numClose(figma.spacing.padding.left, rendered.spacing.padding.left, SPACING_TOLERANCE)
    : figma.spacing.padding === undefined;

  const passed = gapMatch && padMatch;

  return {
    category: 'spacing',
    passed,
    figmaValue: formatSpacing(figma.spacing),
    renderedValue: formatSpacing(rendered.spacing),
  };
}

function formatSpacing(s: FigmaElementProps['spacing']): string {
  if (!s) return '-';
  const parts: string[] = [];
  if (s.gap !== undefined) parts.push(`gap=${s.gap}px`);
  if (s.padding) parts.push(`pad=${s.padding.top}/${s.padding.right}/${s.padding.bottom}/${s.padding.left}`);
  return parts.join(', ') || '-';
}

/** 크기 검증 */
function checkSize(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.size) {
    return { category: 'size', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const wMatch = numClose(figma.size.width, rendered.size?.width, SIZE_TOLERANCE);
  const hMatch = numClose(figma.size.height, rendered.size?.height, SIZE_TOLERANCE);

  return {
    category: 'size',
    passed: wMatch && hMatch,
    figmaValue: `${figma.size.width}×${figma.size.height}`,
    renderedValue: rendered.size ? `${rendered.size.width}×${rendered.size.height}` : '없음',
  };
}

/** 색상 검증 */
function checkColor(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.color) {
    return { category: 'color', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const bgMatch = strMatch(figma.color.background, rendered.color?.background);
  const textMatch = strMatch(figma.color.text, rendered.color?.text);
  const borderMatch = strMatch(figma.color.border, rendered.color?.border);

  return {
    category: 'color',
    passed: bgMatch && textMatch && borderMatch,
    figmaValue: `bg=${figma.color.background ?? '-'}, text=${figma.color.text ?? '-'}, border=${figma.color.border ?? '-'}`,
    renderedValue: `bg=${rendered.color?.background ?? '-'}, text=${rendered.color?.text ?? '-'}, border=${rendered.color?.border ?? '-'}`,
  };
}

/** 타이포그래피 검증 */
function checkTypography(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.typography) {
    return { category: 'typography', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const sizeMatch = figma.typography.fontSize === rendered.typography?.fontSize;
  const weightMatch = figma.typography.fontWeight === rendered.typography?.fontWeight;
  const lhMatch = numClose(figma.typography.lineHeight, rendered.typography?.lineHeight, 0.5);

  return {
    category: 'typography',
    passed: sizeMatch && weightMatch && lhMatch,
    figmaValue: `${figma.typography.fontSize}px/${figma.typography.fontWeight}/${figma.typography.lineHeight ?? '-'}`,
    renderedValue: `${rendered.typography?.fontSize ?? '-'}px/${rendered.typography?.fontWeight ?? '-'}/${rendered.typography?.lineHeight ?? '-'}`,
  };
}

/** 테두리 검증 */
function checkBorder(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.border) {
    return { category: 'border', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const widthMatch = figma.border.width === rendered.border?.width;
  const styleMatch = strMatch(figma.border.style, rendered.border?.style);
  const radiusMatch = Array.isArray(figma.border.radius) && Array.isArray(rendered.border?.radius)
    ? figma.border.radius.every((v, i) => v === (rendered.border?.radius as number[])?.[i])
    : figma.border.radius === rendered.border?.radius;

  return {
    category: 'border',
    passed: widthMatch && styleMatch && radiusMatch,
    figmaValue: `w=${figma.border.width ?? '-'}, r=${JSON.stringify(figma.border.radius ?? '-')}, style=${figma.border.style ?? '-'}`,
    renderedValue: `w=${rendered.border?.width ?? '-'}, r=${JSON.stringify(rendered.border?.radius ?? '-')}, style=${rendered.border?.style ?? '-'}`,
  };
}

/** 효과(shadow, opacity) 검증 */
function checkEffect(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.effect) {
    return { category: 'effect', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  const shadowMatch = strMatch(figma.effect.shadow, rendered.effect?.shadow);
  const opacityMatch = figma.effect.opacity === rendered.effect?.opacity;

  return {
    category: 'effect',
    passed: shadowMatch && opacityMatch,
    figmaValue: `shadow=${figma.effect.shadow ?? '-'}, opacity=${figma.effect.opacity ?? '-'}`,
    renderedValue: `shadow=${rendered.effect?.shadow ?? '-'}, opacity=${rendered.effect?.opacity ?? '-'}`,
  };
}

const ROTATION_TOLERANCE = 1; // ±1°
const OPACITY_TOLERANCE = 0.01;

/** 아이콘 검증 */
function checkIcon(figma: FigmaElementProps, rendered: RenderedElementProps): ElementCheckItem {
  if (!figma.icon) {
    return { category: 'icon', passed: true, figmaValue: '-', renderedValue: '-', notApplicable: true };
  }

  // 아이콘 식별: name 또는 source 중 하나 이상이 정의되어 있어야 비교 가능
  const hasNameToCompare = figma.icon.name !== undefined || figma.icon.source !== undefined;
  const nameMatch = figma.icon.name !== undefined && strMatch(figma.icon.name, rendered.icon?.name);
  const sourceMatch = figma.icon.source !== undefined && strMatch(figma.icon.source, rendered.icon?.source);
  const identityMatch = hasNameToCompare ? (nameMatch || sourceMatch) : true;

  const containerMatch = figma.icon.containerSize && rendered.icon?.containerSize
    ? numClose(figma.icon.containerSize.width, rendered.icon.containerSize.width, SIZE_TOLERANCE)
      && numClose(figma.icon.containerSize.height, rendered.icon.containerSize.height, SIZE_TOLERANCE)
    : true;
  const shapeMatch = figma.icon.shapeSize && rendered.icon?.shapeSize
    ? numClose(figma.icon.shapeSize.width, rendered.icon.shapeSize.width, SIZE_TOLERANCE)
      && numClose(figma.icon.shapeSize.height, rendered.icon.shapeSize.height, SIZE_TOLERANCE)
    : true;

  // fill 색상 비교
  const fillMatch = figma.icon.fillColor !== undefined
    ? strMatch(figma.icon.fillColor, rendered.icon?.fillColor)
    : true;

  // rotation 비교 (±1° 허용)
  const rotationMatch = figma.icon.rotation !== undefined
    ? numClose(figma.icon.rotation, rendered.icon?.rotation, ROTATION_TOLERANCE)
    : true;

  // opacity 비교
  const opacityMatch = figma.icon.opacity !== undefined
    ? numClose(figma.icon.opacity, rendered.icon?.opacity, OPACITY_TOLERANCE)
    : true;

  const allPassed = identityMatch && containerMatch && shapeMatch && fillMatch && rotationMatch && opacityMatch;

  const figmaExtra = [
    figma.icon.fillColor ? `fill=${figma.icon.fillColor}` : null,
    figma.icon.rotation ? `rot=${figma.icon.rotation}°` : null,
    figma.icon.opacity !== undefined ? `op=${figma.icon.opacity}` : null,
  ].filter(Boolean).join(', ');

  const renderedExtra = [
    rendered.icon?.fillColor ? `fill=${rendered.icon.fillColor}` : null,
    rendered.icon?.rotation ? `rot=${rendered.icon.rotation}°` : null,
    rendered.icon?.opacity !== undefined ? `op=${rendered.icon.opacity}` : null,
  ].filter(Boolean).join(', ');

  return {
    category: 'icon',
    passed: allPassed,
    figmaValue: `${figma.icon.name ?? figma.icon.source ?? '-'} (${figma.icon.containerSize?.width ?? '?'}×${figma.icon.containerSize?.height ?? '?'} / ${figma.icon.shapeSize?.width ?? '?'}×${figma.icon.shapeSize?.height ?? '?'}${figmaExtra ? ` | ${figmaExtra}` : ''})`,
    renderedValue: `${rendered.icon?.name ?? rendered.icon?.source ?? '-'} (${rendered.icon?.containerSize?.width ?? '?'}×${rendered.icon?.containerSize?.height ?? '?'} / ${rendered.icon?.shapeSize?.width ?? '?'}×${rendered.icon?.shapeSize?.height ?? '?'}${renderedExtra ? ` | ${renderedExtra}` : ''})`,
  };
}

/** 단일 요소를 9개 항목으로 검증한다 */
export function verifyElement(
  element: VerifyElement,
  index: number
): ElementVerificationResult {
  const { figmaProps, renderedProps } = element;

  const existenceCheck = checkExistence(figmaProps, renderedProps);

  // 존재하지 않으면 나머지 항목은 검증 불가
  if (!existenceCheck.passed) {
    return {
      elementIndex: index,
      elementName: element.name,
      checks: [existenceCheck],
      passCount: 0,
      totalCount: 1,
    };
  }

  const checks: ElementCheckItem[] = [
    existenceCheck,
    checkLayout(figmaProps, renderedProps),
    checkSpacing(figmaProps, renderedProps),
    checkSize(figmaProps, renderedProps),
    checkColor(figmaProps, renderedProps),
    checkTypography(figmaProps, renderedProps),
    checkBorder(figmaProps, renderedProps),
    checkEffect(figmaProps, renderedProps),
    checkIcon(figmaProps, renderedProps),
  ];

  // notApplicable인 항목은 분모에서 제외
  const applicableChecks = checks.filter(c => !c.notApplicable);
  const passCount = applicableChecks.filter(c => c.passed).length;

  return {
    elementIndex: index,
    elementName: element.name,
    checks,
    passCount,
    totalCount: applicableChecks.length,
  };
}

/** 전체 요소 목록에 대해 검증을 수행한다 */
export function verifyAllElements(
  nodeId: string,
  nodeName: string,
  elements: VerifyElement[]
): ElementVerificationReport {
  const results = elements.map((el, i) => verifyElement(el, i + 1));

  const totalPass = results.reduce((sum, r) => sum + r.passCount, 0);
  const totalChecks = results.reduce((sum, r) => sum + r.totalCount, 0);
  const accuracy = totalChecks > 0 ? (totalPass / totalChecks) * 100 : 0;

  return {
    nodeId,
    nodeName,
    elements: results,
    totalPass,
    totalChecks,
    accuracy: Math.round(accuracy * 10) / 10,
  };
}

/** 검증 결과를 테이블 문자열로 포매팅한다 */
export function formatVerificationTable(
  report: ElementVerificationReport,
  round: number,
  captureMethod: string
): string {
  const header = [
    `[검증 테이블] 라운드 ${round} — 노드: ${report.nodeName}`,
    `검증 방법: Figma 스크린샷 vs 렌더링 스크린샷 (${captureMethod})`,
    '',
    '| # | 요소 | 존재 | 배치 | 간격 | 크기 | 색상 | 타이포 | 테두리 | 효과 | 아이콘 | pass/total |',
    '|---|------|------|------|------|------|------|--------|--------|------|--------|------------|',
  ];

  const categoryOrder: ElementCheckCategory[] = [
    'existence', 'layout', 'spacing', 'size', 'color', 'typography', 'border', 'effect', 'icon',
  ];

  const rows = report.elements.map(el => {
    const cells = categoryOrder.map(cat => {
      const check = el.checks.find(c => c.category === cat);
      if (!check) return '-';
      if (check.notApplicable) return '-';
      return check.passed ? '✓' : '✗';
    });
    return `| ${el.elementIndex} | ${el.elementName} | ${cells.join(' | ')} | ${el.passCount}/${el.totalCount} |`;
  });

  const footer = [
    `| 합계 | | | | | | | | | | | ${report.totalPass}/${report.totalChecks} |`,
    '',
    `정확도: ${report.accuracy}% (${report.totalPass}/${report.totalChecks})${report.accuracy >= 99 ? ' — ✅ 목표 달성' : ' — 99% 미만, 자동 수정 진행'}`,
  ];

  return [...header, ...rows, ...footer].join('\n');
}
