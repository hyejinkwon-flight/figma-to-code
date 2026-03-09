// 노드 트리 분석기 — 컴포넌트 후보 식별, 래퍼 패턴 감지, MD 문서 매핑
import type {
  ExtractedNode,
  FigmaFileData,
  ComponentCandidate,
  MdComponentDef,
  UIWrapperPattern,
  WrapperPatternInfo,
  WrapperPart,
} from '../types.js';

/** 노드의 자식 구조를 시그니처 문자열로 변환한다 */
export function getStructureSignature(node: ExtractedNode): string {
  return node.children
    .map(c => `${c.type}:${c.childCount}`)
    .join('|');
}

/** 두 문자열 사이의 유사도를 계산한다 (0~1, Levenshtein 기반) */
export function calculateSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().replace(/[\s_-]+/g, '');
  const normB = b.toLowerCase().replace(/[\s_-]+/g, '');

  if (normA === normB) return 1;
  if (normA.length === 0 || normB.length === 0) return 0;

  // includes 체크 — 포함 관계면 높은 점수
  if (normA.includes(normB) || normB.includes(normA)) {
    const shorter = Math.min(normA.length, normB.length);
    const longer = Math.max(normA.length, normB.length);
    return shorter / longer;
  }

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= normA.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= normB.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= normA.length; i++) {
    for (let j = 1; j <= normB.length; j++) {
      const cost = normA[i - 1] === normB[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(normA.length, normB.length);
  return 1 - matrix[normA.length][normB.length] / maxLen;
}

/** 파일 데이터에서 모든 INSTANCE 노드의 재사용 빈도를 집계한다 */
function buildInstanceMap(fileData: FigmaFileData): Map<string, number> {
  const instanceMap = new Map<string, number>();

  function countInstances(node: ExtractedNode) {
    if (node.type === 'INSTANCE' && node.componentId) {
      instanceMap.set(node.componentId, (instanceMap.get(node.componentId) ?? 0) + 1);
    }
    node.children.forEach(countInstances);
  }

  for (const page of fileData.pages) {
    page.layers.forEach(countInstances);
  }

  return instanceMap;
}

/** 반복되는 FRAME 패턴을 감지한다 (동일 구조 3회 이상) */
function findRepeatedFramePatterns(fileData: FigmaFileData): Map<string, ExtractedNode[]> {
  const signatureMap = new Map<string, ExtractedNode[]>();

  function scanFrames(node: ExtractedNode) {
    if (node.type === 'FRAME' && node.children.length > 0) {
      const sig = getStructureSignature(node);
      if (sig) {
        const existing = signatureMap.get(sig) ?? [];
        existing.push(node);
        signatureMap.set(sig, existing);
      }
    }
    node.children.forEach(scanFrames);
  }

  for (const page of fileData.pages) {
    page.layers.forEach(scanFrames);
  }

  // 3회 이상 반복되는 패턴만 반환
  const repeated = new Map<string, ExtractedNode[]>();
  for (const [sig, nodes] of signatureMap) {
    if (nodes.length >= 3) {
      repeated.set(sig, nodes);
    }
  }
  return repeated;
}

// ─── 래퍼 패턴 감지 ─────────────────────────────────────────

/** 노드 이름에서 UI 래퍼 패턴을 추론한다 */
const WRAPPER_NAME_PATTERNS: Array<{ pattern: RegExp; type: UIWrapperPattern }> = [
  { pattern: /bottom[\s_-]?sheet/i, type: 'bottom-sheet' },
  { pattern: /modal/i, type: 'modal' },
  { pattern: /dialog/i, type: 'dialog' },
  { pattern: /drawer/i, type: 'drawer' },
  { pattern: /popup/i, type: 'popup' },
  { pattern: /toast/i, type: 'toast' },
  { pattern: /dropdown/i, type: 'dropdown' },
  { pattern: /tooltip/i, type: 'tooltip' },
];

/** 노드 이름에서 래퍼 부가 요소 역할을 추론한다 */
const PART_NAME_PATTERNS: Array<{ pattern: RegExp; role: WrapperPart['role'] }> = [
  { pattern: /drag[\s_-]?handle|grabber|grip|handle[\s_-]?bar/i, role: 'drag-handle' },
  { pattern: /close[\s_-]?(button|btn|icon)|x[\s_-]?btn|dismiss/i, role: 'close-button' },
  { pattern: /title|header[\s_-]?text|heading/i, role: 'title' },
  { pattern: /overlay|backdrop|dim|scrim/i, role: 'overlay' },
  { pattern: /indicator|home[\s_-]?bar/i, role: 'indicator' },
  { pattern: /divider|separator|line/i, role: 'divider' },
];

/** 노드 이름 기반으로 래퍼 패턴 유형을 감지한다 */
function matchWrapperPatternByName(name: string): UIWrapperPattern | null {
  for (const { pattern, type } of WRAPPER_NAME_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return null;
}

/** 자식 노드에서 래퍼 부가 요소(drag handle, close button 등)를 탐색한다 */
function detectWrapperParts(node: ExtractedNode): WrapperPart[] {
  const parts: WrapperPart[] = [];

  function scan(n: ExtractedNode, maxDepth: number) {
    if (maxDepth <= 0) return;
    for (const { pattern, role } of PART_NAME_PATTERNS) {
      if (pattern.test(n.name)) {
        parts.push({ role, nodeId: n.id, nodeName: n.name });
        break;
      }
    }
    for (const child of n.children) {
      scan(child, maxDepth - 1);
    }
  }

  // 2단계 깊이까지만 탐색 (래퍼 부가 요소는 보통 얕은 위치)
  for (const child of node.children) {
    scan(child, 2);
  }
  return parts;
}

/**
 * 구조적 특성으로 바텀시트/모달 패턴을 감지한다.
 * 이름에 패턴이 없더라도, 구조로 추론할 수 있는 경우:
 * - drag handle + close button + 콘텐츠 영역이 있으면 bottom-sheet
 * - close button + overlay + 콘텐츠 영역이 있으면 modal/dialog
 */
function inferPatternByStructure(parts: WrapperPart[]): UIWrapperPattern | null {
  const roles = new Set(parts.map(p => p.role));

  if (roles.has('drag-handle') && (roles.has('close-button') || roles.has('title'))) {
    return 'bottom-sheet';
  }
  if (roles.has('overlay') && roles.has('close-button')) {
    return 'modal';
  }
  if (roles.has('close-button') && roles.has('title') && parts.length >= 2) {
    return 'dialog';
  }
  return null;
}

/** FRAME 노드에서 래퍼 패턴을 감지한다 */
export function detectWrapperPattern(node: ExtractedNode): WrapperPatternInfo | null {
  // 1차: 이름 기반 감지
  let pattern = matchWrapperPatternByName(node.name);

  // 2차: 자식 노드에서 부가 요소 감지
  const parts = detectWrapperParts(node);

  // 이름에서 패턴을 못 찾았으면 구조로 추론
  if (!pattern) {
    pattern = inferPatternByStructure(parts);
  }

  if (!pattern) return null;

  // 콘텐츠 노드 식별: 부가 요소가 아닌 가장 큰 자식
  const partNodeIds = new Set(parts.map(p => p.nodeId));
  const contentCandidates = node.children.filter(c => !partNodeIds.has(c.id));

  // 콘텐츠 영역 = 부가 요소 제외 후 가장 자식이 많거나 면적이 큰 노드
  const contentNode = contentCandidates.sort((a, b) => {
    const areaA = a.size.width * a.size.height;
    const areaB = b.size.width * b.size.height;
    return areaB - areaA;
  })[0];

  const confidence = calculatePatternConfidence(pattern, parts, node);

  return {
    pattern,
    wrapperNodeId: node.id,
    contentNodeId: contentNode?.id ?? node.id,
    detectedParts: parts,
    confidence,
  };
}

/** 패턴 감지 신뢰도를 계산한다 */
function calculatePatternConfidence(
  pattern: UIWrapperPattern,
  parts: WrapperPart[],
  node: ExtractedNode
): number {
  let score = 0;
  const nameMatched = matchWrapperPatternByName(node.name) !== null;

  // 이름이 직접 매칭되면 높은 기본점수
  if (nameMatched) score += 0.5;

  // 부가 요소 개수에 따른 가산점
  const roles = new Set(parts.map(p => p.role));
  if (pattern === 'bottom-sheet') {
    if (roles.has('drag-handle')) score += 0.2;
    if (roles.has('close-button')) score += 0.15;
    if (roles.has('title')) score += 0.1;
    if (roles.has('indicator')) score += 0.05;
  } else if (pattern === 'modal' || pattern === 'dialog') {
    if (roles.has('close-button')) score += 0.2;
    if (roles.has('overlay')) score += 0.2;
    if (roles.has('title')) score += 0.1;
  }

  return Math.min(score, 1);
}

// ─── 컴포넌트 후보 식별 ─────────────────────────────────────

/** 파일 데이터에서 컴포넌트 후보를 식별한다 (래퍼 패턴 포함) */
export function identifyComponents(fileData: FigmaFileData): ComponentCandidate[] {
  const candidates: ComponentCandidate[] = [];
  const instanceMap = buildInstanceMap(fileData);
  /** 래퍼로 이미 잡힌 노드 ID → 중복 방지 */
  const wrappedNodeIds = new Set<string>();

  // 1단계: 래퍼 패턴이 있는 FRAME 노드 우선 탐색
  function findWrapperFrames(node: ExtractedNode, pageName: string) {
    if (node.type === 'FRAME' && node.children.length > 0) {
      const wrapperInfo = detectWrapperPattern(node);
      if (wrapperInfo && wrapperInfo.confidence >= 0.3) {
        candidates.push({
          nodeId: node.id,
          nodeName: node.name,
          nodeType: node.type,
          pageName,
          depth: node.depth,
          childStructure: getStructureSignature(node),
          instanceCount: instanceMap.get(node.id) ?? 0,
          hasVariants: false,
          wrapperPattern: wrapperInfo,
        });
        wrappedNodeIds.add(node.id);
        // 래퍼의 직계 자식도 마킹 (중복 후보 방지)
        for (const child of node.children) {
          wrappedNodeIds.add(child.id);
        }
      }
    }
    node.children.forEach(child => findWrapperFrames(child, pageName));
  }

  for (const page of fileData.pages) {
    page.layers.forEach(layer => findWrapperFrames(layer, page.pageName));
  }

  // 2단계: COMPONENT/COMPONENT_SET 노드 탐색
  function findComponents(node: ExtractedNode, pageName: string, parentNode?: ExtractedNode) {
    if (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET') {
      const candidate: ComponentCandidate = {
        nodeId: node.id,
        nodeName: node.name,
        nodeType: node.type,
        pageName,
        depth: node.depth,
        childStructure: getStructureSignature(node),
        instanceCount: instanceMap.get(node.id) ?? 0,
        hasVariants: node.type === 'COMPONENT_SET',
      };

      // 부모가 래퍼 패턴에 해당하면 parentContext 추가
      if (parentNode && wrappedNodeIds.has(parentNode.id)) {
        const parentWrapper = candidates.find(c => c.nodeId === parentNode.id);
        candidate.parentContext = {
          parentNodeId: parentNode.id,
          parentNodeName: parentNode.name,
          parentWrapperPattern: parentWrapper?.wrapperPattern?.pattern,
        };
      }

      candidates.push(candidate);
    }
    node.children.forEach(child => findComponents(child, pageName, node));
  }

  for (const page of fileData.pages) {
    page.layers.forEach(layer => findComponents(layer, page.pageName));
  }

  // 3단계: 반복 FRAME 패턴 추가 (래퍼로 이미 잡힌 것 제외)
  const repeatedPatterns = findRepeatedFramePatterns(fileData);
  for (const [, nodes] of repeatedPatterns) {
    const representative = nodes[0];
    if (wrappedNodeIds.has(representative.id)) continue;

    candidates.push({
      nodeId: representative.id,
      nodeName: representative.name,
      nodeType: 'FRAME',
      pageName: fileData.pages.find(p =>
        p.layers.some(l => containsNode(l, representative.id))
      )?.pageName ?? 'unknown',
      depth: representative.depth,
      childStructure: getStructureSignature(representative),
      instanceCount: nodes.length,
      hasVariants: false,
    });
  }

  return candidates;
}

/** 노드 트리에 특정 ID의 노드가 포함되어 있는지 확인한다 */
function containsNode(root: ExtractedNode, targetId: string): boolean {
  if (root.id === targetId) return true;
  return root.children.some(child => containsNode(child, targetId));
}

/** 컴포넌트 후보를 MD 문서 정의와 매핑한다 */
export function mapToMdDocs(
  candidates: ComponentCandidate[],
  mdDefs: MdComponentDef[]
): ComponentCandidate[] {
  return candidates.map(candidate => {
    if (mdDefs.length === 0) return candidate;

    const matches = mdDefs
      .map(def => ({
        def,
        score: calculateSimilarity(candidate.nodeName, def.componentName),
      }))
      .sort((a, b) => b.score - a.score);

    const bestMatch = matches[0];
    if (bestMatch && bestMatch.score > 0.6) {
      return {
        ...candidate,
        mdMapping: {
          mdFile: bestMatch.def.fileName,
          componentName: bestMatch.def.componentName,
          confidence: bestMatch.score,
        },
      };
    }

    return candidate;
  });
}

/** MD 파일 내용을 파싱하여 컴포넌트 정의를 추출한다 */
export function parseMdContent(content: string, fileName: string): MdComponentDef[] {
  const defs: MdComponentDef[] = [];
  const headingRegex = /^#+\s+(.+)$/gm;
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const componentName = match[1].trim();

    // Props 추출: | prop | 형태의 테이블 행
    const propsRegex = /\|\s*`?(\w+)`?\s*\|/g;
    const props: string[] = [];
    let propMatch;
    while ((propMatch = propsRegex.exec(content)) !== null) {
      if (propMatch[1] !== 'prop' && propMatch[1] !== 'Prop') {
        props.push(propMatch[1]);
      }
    }

    // Variant 추출
    const variantRegex = /variant[s]?:\s*(.+)/gi;
    const variants: string[] = [];
    let variantMatch;
    while ((variantMatch = variantRegex.exec(content)) !== null) {
      variants.push(...variantMatch[1].split(/[,|]/).map(v => v.trim()));
    }

    defs.push({
      fileName,
      componentName,
      props: [...new Set(props)],
      variants: [...new Set(variants)],
      description: '',
    });
  }

  return defs;
}
