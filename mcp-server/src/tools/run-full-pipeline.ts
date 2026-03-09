// MCP Tool: run_full_pipeline — 전체 파이프라인 오케스트레이터 (v2)
import type {
  PipelineOptions,
  PipelineResult,
  CoverageReport,
  FigmaFileData,
  ExtractedNode,
  ComponentCandidate,
  GeneratedComponent,
  PixelDiffResult,
  ElementVerificationReport,
  AssetVerificationReport,
} from '../types.js';
import { FigmaClient } from '../figma/client.js';
import { extractAllPages } from '../figma/traverser.js';
import { identifyComponents, mapToMdDocs } from '../figma/parser.js';
import { generateComponent } from '../generator/component-generator.js';
import { generateStory } from '../generator/story-generator.js';
import { calculateCoverage, formatCoverageReport } from '../verifier/coverage-calculator.js';
import { cleanupAll } from '../verifier/cleanup.js';

export const runFullPipelineToolDef = {
  name: 'run_full_pipeline',
  description: '추출 → 분석 → 생성 → 검증 전체 파이프라인을 실행합니다. 검증은 Figma 스크린샷 vs 렌더링 스크린샷 기반으로 수행됩니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file_key: { type: 'string', description: 'Figma 파일 키' },
      node_ids: { type: 'array', items: { type: 'string' }, description: '검증 대상 노드 ID 목록' },
      output_dir: { type: 'string', description: '출력 디렉토리' },
      rendering_url: { type: 'string', description: '렌더링 서버 URL (Storybook 또는 Vite dev)' },
      rendering_type: { type: 'string', enum: ['storybook', 'vite-dev'], description: '렌더링 환경 유형' },
      target_coverage: { type: 'number', description: '목표 커버리지 (기본: 99)' },
      max_iterations: { type: 'number', description: '최대 반복 횟수 (기본: 5)' },
      style_system: { type: 'string', enum: ['tailwind', 'css-modules'] },
      screenshot_dir: { type: 'string', description: '스크린샷 저장 디렉토리' },
      component_registry: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            componentName: { type: 'string' },
            importPath: { type: 'string' },
            pattern: { type: 'string' },
          },
          required: ['componentName', 'importPath', 'pattern'],
        },
        description: '타겟 프로젝트의 기존 컴포넌트 레지스트리 (래퍼 패턴 매핑용)',
      },
    },
    required: ['file_key', 'output_dir'],
  },
} as const;

/** 파이프라인 각 단계의 결과를 묶는 내부 타입 */
interface PipelineState {
  extracted: FigmaFileData;
  candidates: ComponentCandidate[];
  generated: GeneratedComponent[];
  pixelDiff: PixelDiffResult;
  elementReport: ElementVerificationReport;
  assetReport: AssetVerificationReport;
  coverage: CoverageReport;
}

/** 추출된 파일 데이터에서 첫 번째 레이어 루트 노드를 반환한다 */
function getFirstRootNode(fileData: FigmaFileData): ExtractedNode | null {
  for (const page of fileData.pages) {
    if (page.layers.length > 0) {
      return page.layers[0];
    }
  }
  return null;
}

/** 검증 결과 기본값 (실제 검증은 Claude가 MCP 도구를 개별 호출하여 수행) */
function createEmptyPixelDiff(): PixelDiffResult {
  return {
    mismatchedPixels: 0,
    totalPixels: 0,
    mismatchPercentage: 100,
    diffImagePath: '',
    passed: false,
  };
}

function createEmptyElementReport(nodeId: string): ElementVerificationReport {
  return {
    nodeId,
    nodeName: '',
    elements: [],
    totalPass: 0,
    totalChecks: 0,
    accuracy: 0,
  };
}

function createEmptyAssetReport(nodeId: string): AssetVerificationReport {
  return {
    nodeId,
    assets: [],
    allPassed: true,
    missingCount: 0,
  };
}

/**
 * 파이프라인 1회 반복을 실행한다.
 * NOTE: 이 함수는 추출+생성까지 자동 수행하고, 검증 결과는 플레이스홀더를 반환한다.
 * 실제 검증(스크린샷 캡처 → 픽셀 diff → 요소 검증)은 Claude가 개별 MCP 도구를 호출하여 수행한다.
 */
export async function executePipelineIteration(
  client: FigmaClient,
  options: PipelineOptions
): Promise<PipelineState> {
  // Step 1: 추출
  const fileData = await client.getFile(options.fileKey);
  const extracted = extractAllPages(fileData, { includeHidden: true });

  // Step 2: 분석
  let candidates = identifyComponents(extracted);
  candidates = mapToMdDocs(candidates, []);

  // Step 3: 컴포넌트 생성 (래퍼 패턴 + 기존 컴포넌트 레지스트리 반영)
  const generated: GeneratedComponent[] = [];
  for (const candidate of candidates) {
    const node = findNodeById(extracted, candidate.nodeId);
    if (node) {
      generated.push(
        generateComponent(node, {
          styleSystem: options.styleSystem ?? 'tailwind',
          outputDir: options.outputDir,
          fileKey: options.fileKey,
          componentRegistry: options.componentRegistry,
        }, candidate.wrapperPattern)
      );
    }
  }

  // Step 4: 스토리 생성
  for (const comp of generated) {
    const node = findNodeById(extracted, comp.nodeId);
    if (node) {
      generateStory(comp, node, {
        storyType: 'component',
        fileKey: options.fileKey,
      });
    }
  }

  // Step 5: 검증 플레이스홀더 (실제 검증은 개별 MCP 도구 호출로 수행)
  const rootNode = getFirstRootNode(extracted);
  const nodeId = rootNode?.id ?? '';

  const pixelDiff = createEmptyPixelDiff();
  const elementReport = createEmptyElementReport(nodeId);
  const assetReport = createEmptyAssetReport(nodeId);
  const coverage = calculateCoverage(pixelDiff, elementReport, assetReport);

  return { extracted, candidates, generated, pixelDiff, elementReport, assetReport, coverage };
}

/** 전체 파이프라인을 실행한다 */
export async function executeFullPipeline(
  client: FigmaClient,
  options: PipelineOptions
): Promise<PipelineResult> {
  const targetCoverage = options.targetCoverage ?? 99;
  const maxIterations = options.maxIterations ?? 5;
  const screenshotDir = options.screenshotDir ?? '/tmp/figma-verify';
  let iteration = 0;
  let lastState: PipelineState | null = null;

  do {
    iteration++;
    lastState = await executePipelineIteration(client, options);

    const report = formatCoverageReport(lastState.coverage);
    console.log(`\n=== Iteration ${iteration} ===\n${report}`);
    console.log('\n⚠ 실제 검증은 verify_pixel_diff, verify_elements, verify_assets 도구를 개별 호출하세요.');

    if (lastState.coverage.overall >= targetCoverage) break;
  } while (iteration < maxIterations);

  // 검증 완료 후 임시 파일 정리
  const cleanupResult = cleanupAll(screenshotDir);
  console.log(`\n${cleanupResult}`);

  return {
    finalCoverage: lastState!.coverage,
    iterations: iteration,
    passed: lastState!.coverage.passed,
  };
}

/** ExtractedNode 트리에서 특정 ID의 노드를 찾는다 */
function findNodeById(fileData: FigmaFileData, nodeId: string): ExtractedNode | null {
  for (const page of fileData.pages) {
    for (const layer of page.layers) {
      const found = searchNode(layer, nodeId);
      if (found) return found;
    }
  }
  return null;
}

function searchNode(node: ExtractedNode, id: string): ExtractedNode | null {
  if (node.id === id) return node;
  for (const child of node.children) {
    const found = searchNode(child, id);
    if (found) return found;
  }
  return null;
}
