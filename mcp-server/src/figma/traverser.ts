// 재귀 탐색 엔진 — Figma 노드를 ExtractedNode로 변환
import type {
  FigmaAPINode,
  FigmaFileResponse,
  ExtractedNode,
  FigmaNodeType,
  PageData,
  FigmaFileData,
  TraversalOptions,
} from '../types.js';

/** 단일 Figma API 노드를 정규화된 ExtractedNode로 변환한다 */
export function traverseNode(
  node: FigmaAPINode,
  depth: number = 0,
  parentId: string | null = null,
  options: TraversalOptions = {}
): ExtractedNode {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;

  const extracted: ExtractedNode = {
    id: node.id,
    name: node.name,
    type: node.type as FigmaNodeType,
    visible: node.visible !== false,
    locked: node.locked === true,
    depth,
    parentId,
    childCount: hasChildren ? node.children!.length : 0,
    isLeaf: !hasChildren,
    absolutePosition: {
      x: node.absoluteBoundingBox?.x ?? 0,
      y: node.absoluteBoundingBox?.y ?? 0,
    },
    size: {
      width: node.absoluteBoundingBox?.width ?? 0,
      height: node.absoluteBoundingBox?.height ?? 0,
    },
    children: [],
  };

  // 타입별 추가 정보
  if (node.type === 'TEXT') {
    extracted.characters = node.characters;
    extracted.style = node.style;
  }
  if (node.type === 'INSTANCE') {
    extracted.componentId = node.componentId;
  }
  if (node.type === 'COMPONENT') {
    extracted.componentName = node.name;
  }

  // 공통 속성
  extracted.fills = node.fills;
  extracted.strokes = node.strokes;
  extracted.effects = node.effects;
  extracted.opacity = node.opacity;
  extracted.blendMode = node.blendMode;
  extracted.cornerRadius = node.cornerRadius ?? node.rectangleCornerRadii;
  extracted.layoutMode = node.layoutMode;
  extracted.constraints = node.constraints;
  extracted.itemSpacing = node.itemSpacing;

  if (node.paddingLeft != null) {
    extracted.padding = {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    };
  }

  // 숨겨진 노드 필터링 옵션
  const includeHidden = options.includeHidden !== false;

  // 자식 재귀 탐색
  if (hasChildren) {
    const withinDepthLimit = options.maxDepth === undefined || depth < options.maxDepth;
    if (withinDepthLimit) {
      extracted.children = node.children!
        .filter(child => includeHidden || child.visible !== false)
        .map(child => traverseNode(child, depth + 1, node.id, options));
      extracted.childCount = extracted.children.length;
      extracted.isLeaf = extracted.children.length === 0;
    }
  }

  return extracted;
}

/** 노드 트리 내 총 노드 수를 센다 */
export function countNodes(node: ExtractedNode): number {
  let count = 1;
  for (const child of node.children) {
    count += countNodes(child);
  }
  return count;
}

/** Figma 파일의 모든 페이지에서 레이어를 추출한다 */
export function extractAllPages(
  fileData: FigmaFileResponse,
  options?: TraversalOptions
): FigmaFileData {
  const pages: PageData[] = [];
  let totalNodes = 0;

  const filteredPages = options?.pageFilter?.length
    ? fileData.document.children.filter(page =>
        options.pageFilter!.some(filter =>
          page.name.toLowerCase().includes(filter.toLowerCase())
        )
      )
    : fileData.document.children;

  for (const page of filteredPages) {
    let pageNodeCount = 0;
    let leafNodeCount = 0;
    let maxPageDepth = 0;

    /** 노드 통계를 집계한다 */
    function aggregateStats(node: ExtractedNode) {
      pageNodeCount++;
      totalNodes++;
      if (node.isLeaf) leafNodeCount++;
      if (node.depth > maxPageDepth) maxPageDepth = node.depth;
      node.children.forEach(aggregateStats);
    }

    const layers = (page.children ?? []).map(layer =>
      traverseNode(layer, 0, page.id, options)
    );
    layers.forEach(aggregateStats);

    pages.push({
      pageId: page.id,
      pageName: page.name,
      totalNodeCount: pageNodeCount,
      leafNodeCount,
      maxDepth: maxPageDepth,
      layers,
    });
  }

  return {
    fileName: fileData.name,
    totalPages: pages.length,
    totalNodes,
    extractedAt: new Date().toISOString(),
    pages,
  };
}
