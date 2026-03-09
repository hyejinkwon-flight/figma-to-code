// MCP Tool: verify_pixel_diff, verify_elements, verify_assets, calculate_coverage, cleanup_verification
import type {
  PixelDiffResult,
  ElementVerificationReport,
  AssetVerificationReport,
  CoverageReport,
} from '../types.js';
import { compareScreenshots, formatPixelDiffResult, type PixelDiffOptions } from '../verifier/pixel-diff-verifier.js';
import {
  verifyAllElements,
  formatVerificationTable,
  type VerifyElement,
} from '../verifier/element-verifier.js';
import {
  verifyAllAssets,
  formatAssetReport,
  type AssetToVerify,
} from '../verifier/asset-verifier.js';
import { calculateCoverage, formatCoverageReport } from '../verifier/coverage-calculator.js';
import { cleanupAll } from '../verifier/cleanup.js';
import {
  lintGeneratedCode,
  lintSvgFillUsage,
  lintAssetImports,
  formatLintResult,
  type LintResult,
  type LintViolation,
} from '../verifier/code-linter.js';

// ── Tool 정의 ──

export const verifyPixelDiffToolDef = {
  name: 'verify_pixel_diff',
  description: 'Figma 스크린샷과 렌더링 스크린샷의 픽셀 diff를 수행합니다. diff 이미지를 생성하여 불일치 영역을 시각화합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      figma_screenshot_path: { type: 'string', description: 'Figma 스크린샷 PNG 경로' },
      rendering_screenshot_path: { type: 'string', description: '렌더링 스크린샷 PNG 경로' },
      diff_output_path: { type: 'string', description: 'diff 이미지 출력 경로' },
      threshold: { type: 'number', description: '픽셀 색상 차이 임계값 (0~1, 기본: 0.1)' },
      pass_percentage: { type: 'number', description: 'mismatch 비율 허용 한계 (기본: 5%)' },
    },
    required: ['figma_screenshot_path', 'rendering_screenshot_path', 'diff_output_path'],
  },
} as const;

export const verifyElementsToolDef = {
  name: 'verify_elements',
  description: '요소별 9항목 상세 검증을 수행합니다 (존재/배치/간격/크기/색상/타이포/테두리/효과/아이콘). Figma 스크린샷과 렌더링 스크린샷을 비교하여 각 요소의 일치 여부를 판정합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      node_id: { type: 'string', description: '검증 대상 Figma 노드 ID' },
      node_name: { type: 'string', description: '노드 이름' },
      elements: {
        type: 'array',
        description: '검증 대상 요소 목록 (Figma 스크린샷에서 추출)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            figmaNodeId: { type: 'string' },
            figmaProps: { type: 'object', description: 'Figma 디자인 속성' },
            renderedProps: { type: 'object', description: '렌더링 결과 속성' },
          },
          required: ['name', 'figmaNodeId', 'figmaProps', 'renderedProps'],
        },
      },
      round: { type: 'number', description: '현재 검증 라운드' },
      capture_method: { type: 'string', description: '스크린샷 캡처 방법' },
    },
    required: ['node_id', 'node_name', 'elements', 'round', 'capture_method'],
  },
} as const;

export const verifyAssetsToolDef = {
  name: 'verify_assets',
  description: '에셋(아이콘/이미지)이 다운로드되어 올바르게 참조되는지 검증합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      node_id: { type: 'string', description: '검증 대상 노드 ID' },
      assets: {
        type: 'array',
        description: '검증 대상 에셋 목록',
        items: {
          type: 'object',
          properties: {
            assetName: { type: 'string' },
            assetType: { type: 'string', enum: ['icon', 'image'] },
            figmaNodeId: { type: 'string' },
            figmaAssetName: { type: 'string' },
            expectedFilePath: { type: 'string' },
            codeReference: { type: 'string' },
          },
          required: ['assetName', 'assetType', 'figmaNodeId', 'expectedFilePath', 'codeReference'],
        },
      },
      generated_code_content: { type: 'string', description: '생성된 코드 내용' },
    },
    required: ['node_id', 'assets', 'generated_code_content'],
  },
} as const;

export const calculateCoverageToolDef = {
  name: 'calculate_coverage',
  description: '픽셀 diff + 요소별 검증 + 에셋 검증 결과를 종합하여 최종 커버리지를 계산합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      pixel_diff: { type: 'object', description: '픽셀 diff 결과' },
      element_report: { type: 'object', description: '요소별 검증 결과' },
      asset_report: { type: 'object', description: '에셋 검증 결과' },
    },
    required: ['pixel_diff', 'element_report', 'asset_report'],
  },
} as const;

export const cleanupVerificationToolDef = {
  name: 'cleanup_verification',
  description: '검증 완료 후 임시 스크린샷/diff 파일을 정리합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      screenshot_dir: { type: 'string', description: '스크린샷 디렉토리 경로' },
    },
    required: ['screenshot_dir'],
  },
} as const;

export const lintGeneratedCodeToolDef = {
  name: 'lint_generated_code',
  description: '생성된 코드 파일을 정적 분석하여 금지 패턴(hex 하드코딩, inline SVG, 아이콘 라이브러리, placeholder 등)을 검출합니다. SVG fill 속성과 import 방식 일치, 에셋 파일 존재 여부도 검증합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file_paths: {
        type: 'array',
        description: '검사할 코드 파일 경로 목록 (.tsx, .jsx, .ts, .js)',
        items: { type: 'string' },
      },
      svg_checks: {
        type: 'array',
        description: 'SVG fill + import 방식 일치 검증 목록 (선택)',
        items: {
          type: 'object',
          properties: {
            svg_file_path: { type: 'string', description: 'SVG 파일 경로' },
            code_file_path: { type: 'string', description: 'SVG를 사용하는 코드 파일 경로' },
            import_name: { type: 'string', description: 'SVG import 변수명 (예: CloseIcon)' },
          },
          required: ['svg_file_path', 'code_file_path', 'import_name'],
        },
      },
    },
    required: ['file_paths'],
  },
} as const;

// ── Tool 실행 함수 ──

/** 픽셀 diff를 실행한다 */
export async function executeVerifyPixelDiff(
  figmaScreenshotPath: string,
  renderingScreenshotPath: string,
  diffOutputPath: string,
  options?: PixelDiffOptions
): Promise<{ result: PixelDiffResult; formatted: string }> {
  const result = await compareScreenshots(
    figmaScreenshotPath,
    renderingScreenshotPath,
    diffOutputPath,
    options
  );
  return { result, formatted: formatPixelDiffResult(result) };
}

/** 요소별 검증을 실행한다 */
export function executeVerifyElements(
  nodeId: string,
  nodeName: string,
  elements: VerifyElement[],
  round: number,
  captureMethod: string
): { report: ElementVerificationReport; formatted: string } {
  const report = verifyAllElements(nodeId, nodeName, elements);
  const formatted = formatVerificationTable(report, round, captureMethod);
  return { report, formatted };
}

/** 에셋 검증을 실행한다 */
export function executeVerifyAssets(
  nodeId: string,
  assets: AssetToVerify[],
  generatedCodeContent: string
): { report: AssetVerificationReport; formatted: string } {
  const report = verifyAllAssets(nodeId, assets, generatedCodeContent);
  const formatted = formatAssetReport(report);
  return { report, formatted };
}

/** 전체 커버리지를 계산한다 */
export function executeCalculateCoverage(
  pixelDiff: PixelDiffResult,
  elementReport: ElementVerificationReport,
  assetReport: AssetVerificationReport
): { report: CoverageReport; formatted: string } {
  const report = calculateCoverage(pixelDiff, elementReport, assetReport);
  const formatted = formatCoverageReport(report);
  return { report, formatted };
}

/** 임시 파일을 정리한다 */
export function executeCleanupVerification(
  screenshotDir: string
): string {
  return cleanupAll(screenshotDir);
}

/** 생성된 코드를 린트한다 */
export function executeLintGeneratedCode(
  filePaths: string[],
  svgChecks?: Array<{ svg_file_path: string; code_file_path: string; import_name: string }>,
): { results: LintResult[]; summary: string } {
  const results: LintResult[] = [];

  // 각 파일에 대해 기본 린트 + 에셋 import 검증
  for (const fp of filePaths) {
    const basicResult = lintGeneratedCode(fp);
    const assetViolations = lintAssetImports(fp);
    basicResult.violations.push(...assetViolations);
    basicResult.passed = basicResult.violations.length === 0;
    results.push(basicResult);
  }

  // SVG fill + import 방식 일치 검증
  if (svgChecks) {
    for (const check of svgChecks) {
      const svgViolations = lintSvgFillUsage(
        check.svg_file_path,
        check.code_file_path,
        check.import_name,
      );
      if (svgViolations.length > 0) {
        // 해당 코드 파일의 결과에 추가
        const existing = results.find(r => r.filePath === check.code_file_path);
        if (existing) {
          existing.violations.push(...svgViolations);
          existing.passed = false;
        } else {
          results.push({
            filePath: check.code_file_path,
            violations: svgViolations,
            passed: false,
          });
        }
      }
    }
  }

  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const passedFiles = results.filter(r => r.passed).length;
  const summary = [
    `린트 결과: ${passedFiles}/${results.length} 파일 통과, ${totalViolations}개 위반`,
    '',
    ...results.map(formatLintResult),
  ].join('\n');

  return { results, summary };
}
