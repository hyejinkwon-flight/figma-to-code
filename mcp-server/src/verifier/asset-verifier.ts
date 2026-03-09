// 에셋(아이콘/이미지) 검증기 — 다운로드 여부 및 올바른 참조 확인
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import type { AssetCheckResult, AssetVerificationReport } from '../types.js';

/** 검증 대상 에셋 정의 */
export interface AssetToVerify {
  assetName: string;
  assetType: 'icon' | 'image';
  figmaNodeId: string;
  /** Figma에서 확인된 에셋 이름/경로 */
  figmaAssetName: string;
  /** 생성된 코드에서 참조하는 경로 */
  expectedFilePath: string;
  /** 코드에서 import/src로 참조하는 문자열 */
  codeReference: string;
  /** Figma fills[0].color hex (예: #ff0000) */
  figmaFillColor?: string;
  /** Figma rotation (degree) */
  figmaRotation?: number;
  /** Figma 노드 크기 */
  figmaSize?: { width: number; height: number };
}

/** SVG 콘텐츠에서 첫 번째 fill 속성의 hex 값을 추출한다 */
function extractSvgFillHex(svgContent: string): string | null {
  const match = svgContent.match(/fill\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/);
  return match ? match[1].toLowerCase() : null;
}

/** 단일 에셋을 검증한다 */
export function verifyAsset(asset: AssetToVerify, generatedCodeContent: string): AssetCheckResult {
  // 1. 파일 존재 여부
  const downloaded = existsSync(asset.expectedFilePath);

  // 2. 코드에서 올바르게 참조하는지
  const correctRef = generatedCodeContent.includes(asset.codeReference);

  // 3. 아이콘의 경우 SVG 내용이 비어있지 않은지 확인
  let rendered = false;
  let svgContent = '';
  if (downloaded) {
    try {
      const content = readFileSync(asset.expectedFilePath, 'utf-8');
      if (asset.assetType === 'icon') {
        rendered = content.includes('<svg') && content.includes('</svg>');
        svgContent = content;
      } else {
        rendered = content.length > 0;
      }
    } catch {
      rendered = false;
    }
  }

  const issues = buildIssues(asset, downloaded, correctRef, rendered);

  // 4. SVG fill 색상 대조 (아이콘만)
  if (asset.assetType === 'icon' && rendered && svgContent && asset.figmaFillColor) {
    const svgFill = extractSvgFillHex(svgContent);
    if (svgFill && svgFill !== asset.figmaFillColor.toLowerCase()) {
      issues.push(
        `fill 불일치: SVG=${svgFill}, Figma=${asset.figmaFillColor}`
      );
    }
  }

  // 5. rotation 대조 (rotation ≠ 0일 때 코드에 rotate 클래스 확인)
  if (asset.figmaRotation && asset.figmaRotation !== 0) {
    const hasRotateClass = /rotate-|rotate\(|-rotate-/.test(generatedCodeContent);
    if (!hasRotateClass) {
      issues.push(
        `rotation 누락: Figma=${asset.figmaRotation}°인데 코드에 rotate 클래스 없음`
      );
    }
  }

  // 6. 크기 대조 (Figma 노드 크기 vs 코드의 w-/h- 클래스)
  if (asset.figmaSize) {
    const { width, height } = asset.figmaSize;
    const wPattern = new RegExp(`w-\\[${width}px\\]|w-${width / 4}(?:\\s|")|size-${width / 4}`);
    const hPattern = new RegExp(`h-\\[${height}px\\]|h-${height / 4}(?:\\s|")|size-${height / 4}`);
    if (!wPattern.test(generatedCodeContent)) {
      issues.push(`width 불일치: Figma=${width}px, 코드에 w-[${width}px] 없음`);
    }
    if (!hPattern.test(generatedCodeContent)) {
      issues.push(`height 불일치: Figma=${height}px, 코드에 h-[${height}px] 없음`);
    }
  }

  const details = issues.length > 0 ? issues.join(', ') : '정상';

  return {
    assetName: asset.assetName,
    assetType: asset.assetType,
    downloaded,
    correctRef,
    rendered,
    figmaNodeId: asset.figmaNodeId,
    details,
  };
}

function buildIssues(
  asset: AssetToVerify,
  downloaded: boolean,
  correctRef: boolean,
  rendered: boolean
): string[] {
  const issues: string[] = [];
  if (!downloaded) issues.push(`파일 없음: ${asset.expectedFilePath}`);
  if (!correctRef) issues.push(`코드 참조 없음: ${asset.codeReference}`);
  if (downloaded && !rendered) issues.push('파일이 있으나 유효하지 않음 (빈 파일 또는 손상)');
  return issues;
}

/** 전체 에셋 목록을 검증한다 */
export function verifyAllAssets(
  nodeId: string,
  assets: AssetToVerify[],
  generatedCodeContent: string
): AssetVerificationReport {
  const results = assets.map(asset => verifyAsset(asset, generatedCodeContent));
  const missingCount = results.filter(r => !r.downloaded || !r.correctRef || !r.rendered).length;

  return {
    nodeId,
    assets: results,
    allPassed: missingCount === 0,
    missingCount,
  };
}

/** 에셋 검증 결과를 포매팅한다 */
export function formatAssetReport(report: AssetVerificationReport): string {
  if (report.assets.length === 0) {
    return '[에셋 검증] 검증 대상 에셋 없음';
  }

  const lines = [
    `[에셋 검증] ${report.allPassed ? '✅ PASS' : `❌ FAIL (${report.missingCount}개 문제)`}`,
    '',
    '| 에셋 | 타입 | 다운로드 | 참조 | 렌더링 | 상세 |',
    '|------|------|----------|------|--------|------|',
  ];

  for (const r of report.assets) {
    lines.push(
      `| ${r.assetName} | ${r.assetType} | ${r.downloaded ? '✓' : '✗'} | ${r.correctRef ? '✓' : '✗'} | ${r.rendered ? '✓' : '✗'} | ${r.details} |`
    );
  }

  return lines.join('\n');
}
