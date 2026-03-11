// MCP 서버 전역 타입 정의

export type FigmaNodeType =
  | 'DOCUMENT' | 'CANVAS' | 'FRAME' | 'GROUP' | 'SECTION'
  | 'COMPONENT' | 'COMPONENT_SET' | 'INSTANCE'
  | 'TEXT' | 'RECTANGLE' | 'ELLIPSE' | 'LINE'
  | 'VECTOR' | 'POLYGON' | 'STAR'
  | 'BOOLEAN_OPERATION' | 'SLICE'
  | 'CONNECTOR' | 'SHAPE_WITH_TEXT' | 'STICKY'
  | 'TABLE' | 'TABLE_CELL'
  | 'WIDGET' | 'EMBED' | 'LINK_UNFURL' | 'STAMP';

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface Paint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'IMAGE' | 'EMOJI';
  visible?: boolean;
  opacity?: number;
  color?: FigmaColor;
  /** IMAGE fill에서 이미지를 식별하는 참조 키 */
  imageRef?: string;
  /** IMAGE fill의 스케일 모드 — object-fit 변환에 사용 */
  scaleMode?: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  /** IMAGE fill의 이미지 변환 행렬 (CROP 모드에서 object-position 계산용) */
  imageTransform?: number[][];
}

export interface Effect {
  type: 'DROP_SHADOW' | 'INNER_SHADOW' | 'LAYER_BLUR' | 'BACKGROUND_BLUR';
  visible?: boolean;
  radius?: number;
  color?: FigmaColor;
  offset?: { x: number; y: number };
}

export interface LayoutConstraints {
  vertical: 'TOP' | 'BOTTOM' | 'CENTER' | 'TOP_BOTTOM' | 'SCALE';
  horizontal: 'LEFT' | 'RIGHT' | 'CENTER' | 'LEFT_RIGHT' | 'SCALE';
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextStyle {
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  lineHeightPx?: number;
  letterSpacing?: number;
  textAlignHorizontal?: 'LEFT' | 'CENTER' | 'RIGHT' | 'JUSTIFIED';
}

/** Figma REST API에서 반환하는 노드 */
export interface FigmaAPINode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  children?: FigmaAPINode[];
  absoluteBoundingBox?: BoundingBox;
  fills?: Paint[];
  strokes?: Paint[];
  effects?: Effect[];
  opacity?: number;
  blendMode?: string;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  itemSpacing?: number;
  constraints?: LayoutConstraints;
  characters?: string;
  style?: TextStyle;
  componentId?: string;
  /** 노드의 layoutSizing 모드 */
  layoutSizingHorizontal?: 'FIXED' | 'HUG' | 'FILL';
  layoutSizingVertical?: 'FIXED' | 'HUG' | 'FILL';
}

export interface FigmaFileResponse {
  name: string;
  document: {
    id: string;
    name: string;
    type: 'DOCUMENT';
    children: FigmaAPINode[];
  };
  components: Record<string, unknown>;
  styles: Record<string, unknown>;
}

/** 추출된 노드 (정규화된 구조) */
export interface ExtractedNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  visible: boolean;
  locked: boolean;
  depth: number;
  parentId: string | null;
  childCount: number;
  isLeaf: boolean;
  absolutePosition: { x: number; y: number };
  size: { width: number; height: number };
  children: ExtractedNode[];

  characters?: string;
  style?: TextStyle;
  fills?: Paint[];
  strokes?: Paint[];
  effects?: Effect[];
  cornerRadius?: number | number[];
  componentId?: string;
  componentName?: string;
  constraints?: LayoutConstraints;
  layoutMode?: 'NONE' | 'HORIZONTAL' | 'VERTICAL';
  padding?: { top: number; right: number; bottom: number; left: number };
  itemSpacing?: number;
  opacity?: number;
  blendMode?: string;
}

export interface PageData {
  pageId: string;
  pageName: string;
  totalNodeCount: number;
  leafNodeCount: number;
  maxDepth: number;
  layers: ExtractedNode[];
}

export interface FigmaFileData {
  fileName: string;
  totalPages: number;
  totalNodes: number;
  extractedAt: string;
  pages: PageData[];
}

export interface TraversalOptions {
  maxDepth?: number;
  includeHidden?: boolean;
  pageFilter?: string[];
}

/** UI 래퍼 패턴 유형 */
export type UIWrapperPattern =
  | 'bottom-sheet'
  | 'modal'
  | 'dialog'
  | 'drawer'
  | 'popup'
  | 'toast'
  | 'dropdown'
  | 'tooltip';

/** 래퍼 패턴 감지 결과 */
export interface WrapperPatternInfo {
  pattern: UIWrapperPattern;
  /** 래퍼 노드 ID (바텀시트 전체 등) */
  wrapperNodeId: string;
  /** 콘텐츠 노드 ID (내부 콘텐츠 영역) */
  contentNodeId: string;
  /** 래퍼에서 감지된 부가 요소들 */
  detectedParts: WrapperPart[];
  confidence: number;
}

/** 래퍼 내부에서 감지된 부가 요소 */
export interface WrapperPart {
  role: 'drag-handle' | 'close-button' | 'title' | 'overlay' | 'indicator' | 'divider';
  nodeId: string;
  nodeName: string;
}

/** 타겟 프로젝트의 기존 컴포넌트 정보 */
export interface ComponentRegistryEntry {
  /** 컴포넌트 이름 (예: BottomSheet) */
  componentName: string;
  /** import 경로 (예: @/components/BottomSheet) */
  importPath: string;
  /** 이 컴포넌트가 매핑되는 UI 패턴 */
  pattern: UIWrapperPattern;
  /** 지원하는 props */
  props?: Array<{
    name: string;
    type: string;
    required?: boolean;
  }>;
}

/** 컴포넌트 후보 */
export interface ComponentCandidate {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  pageName: string;
  depth: number;
  childStructure: string;
  instanceCount: number;
  hasVariants: boolean;
  variantProperties?: Record<string, string[]>;
  mdMapping?: {
    mdFile: string;
    componentName: string;
    confidence: number;
  };
  /** 래퍼 패턴 감지 결과 */
  wrapperPattern?: WrapperPatternInfo;
  /** 부모 노드 컨텍스트 (래퍼 패턴의 자식일 경우) */
  parentContext?: {
    parentNodeId: string;
    parentNodeName: string;
    parentWrapperPattern?: UIWrapperPattern;
  };
}

export interface MdComponentDef {
  fileName: string;
  componentName: string;
  props: string[];
  variants: string[];
  description: string;
}

/** 생성된 컴포넌트 */
export interface GeneratedComponent {
  componentName: string;
  nodeId: string;
  files: {
    component: string;
    types: string;
    index: string;
  };
}

export interface GenerateOptions {
  styleSystem: 'tailwind' | 'css-modules';
  outputDir: string;
  fileKey?: string;
  /** 타겟 프로젝트의 기존 컴포넌트 레지스트리 */
  componentRegistry?: ComponentRegistryEntry[];
}

export interface StoryOptions {
  storyType: 'component' | 'page' | 'docs';
  fileKey: string;
}

/** ── 검증 결과 (v2: 렌더링 기반 검증) ── */

/** 스크린샷 캡처 결과 */
export interface ScreenshotPair {
  figmaScreenshotPath: string;
  renderingScreenshotPath: string;
  captureMethod: 'storybook' | 'vite-dev' | 'user-provided';
  viewport: { width: number; height: number };
  nodeId: string;
  nodeName: string;
}

/** 픽셀 diff 결과 */
export interface PixelDiffResult {
  mismatchedPixels: number;
  totalPixels: number;
  mismatchPercentage: number;
  diffImagePath: string;
  passed: boolean;
}

/** 요소별 검증 항목 (9개 카테고리) */
export type ElementCheckCategory =
  | 'existence'    // 존재
  | 'layout'       // 배치
  | 'spacing'      // 간격
  | 'size'         // 크기
  | 'color'        // 색상
  | 'typography'   // 타이포
  | 'border'       // 테두리
  | 'effect'       // 효과
  | 'icon';        // 아이콘

export interface ElementCheckItem {
  category: ElementCheckCategory;
  passed: boolean;
  figmaValue: string;
  renderedValue: string;
  /** 해당 카테고리가 이 요소에 적용 불가하면 true (예: 텍스트 없는 요소의 타이포) */
  notApplicable?: boolean;
}

/** 단일 UI 요소의 검증 결과 */
export interface ElementVerificationResult {
  elementIndex: number;
  elementName: string;
  checks: ElementCheckItem[];
  passCount: number;
  totalCount: number;
}

/** 요소별 검증 전체 결과 */
export interface ElementVerificationReport {
  nodeId: string;
  nodeName: string;
  elements: ElementVerificationResult[];
  totalPass: number;
  totalChecks: number;
  accuracy: number;
}

/** 에셋(아이콘/이미지) 검증 결과 */
export interface AssetCheckResult {
  assetName: string;
  assetType: 'icon' | 'image';
  downloaded: boolean;
  correctRef: boolean;
  rendered: boolean;
  figmaNodeId: string;
  details: string;
}

export interface AssetVerificationReport {
  nodeId: string;
  assets: AssetCheckResult[];
  allPassed: boolean;
  missingCount: number;
}

/** 최종 커버리지 리포트 (v2) */
export interface CoverageReport {
  pixelDiff: {
    mismatchPercentage: number;
    passed: boolean;
  };
  elementVerification: {
    totalPass: number;
    totalChecks: number;
    accuracy: number;
  };
  assetVerification: {
    totalAssets: number;
    passedAssets: number;
    allPassed: boolean;
  };
  /** 요소별 pass/total 기반 최종 정확도 */
  overall: number;
  passed: boolean;
  failItems: Array<{
    elementName: string;
    category: ElementCheckCategory;
    figmaValue: string;
    renderedValue: string;
  }>;
  recommendations: string[];
}

/** IMAGE fill export 결과 */
export interface ImageFillExport {
  /** Figma 노드 ID */
  nodeId: string;
  /** 노드 이름 */
  nodeName: string;
  /** IMAGE fill의 scaleMode */
  scaleMode: 'FILL' | 'FIT' | 'CROP' | 'TILE';
  /** export된 이미지 URL (Figma CDN) */
  exportUrl: string;
  /** 로컬에 저장된 파일 경로 */
  savedPath: string;
  /** 노드의 원본 크기 */
  size: { width: number; height: number };
}

export interface PipelineOptions {
  fileKey: string;
  nodeIds: string[];
  mdDocsDir?: string;
  outputDir: string;
  renderingUrl: string;
  renderingType: 'storybook' | 'vite-dev';
  viewport?: { width: number; height: number };
  targetCoverage?: number;
  maxIterations?: number;
  styleSystem?: 'tailwind' | 'css-modules';
  /** 스크린샷 저장 디렉토리 */
  screenshotDir?: string;
  /** 타겟 프로젝트의 기존 컴포넌트 레지스트리 */
  componentRegistry?: ComponentRegistryEntry[];
}

export interface PipelineResult {
  finalCoverage: CoverageReport;
  iterations: number;
  passed: boolean;
}
