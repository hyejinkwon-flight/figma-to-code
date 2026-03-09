// 커버리지 계산기 (v2) — 요소별 검증 주 지표 + 픽셀 diff 보조 지표
import type {
  PixelDiffResult,
  ElementVerificationReport,
  AssetVerificationReport,
  CoverageReport,
  ElementCheckCategory,
} from '../types.js';

/** 커버리지를 종합 계산한다 */
export function calculateCoverage(
  pixelDiff: PixelDiffResult,
  elementReport: ElementVerificationReport,
  assetReport: AssetVerificationReport
): CoverageReport {
  // 요소별 검증이 주 지표
  let accuracy = elementReport.accuracy;

  // 에셋 누락이 있으면 최대 90% 제한
  if (!assetReport.allPassed && accuracy > 90) {
    accuracy = 90;
  }

  // fail 항목 수집
  const failItems: CoverageReport['failItems'] = [];
  for (const element of elementReport.elements) {
    for (const check of element.checks) {
      if (!check.passed && !check.notApplicable) {
        failItems.push({
          elementName: element.elementName,
          category: check.category,
          figmaValue: check.figmaValue,
          renderedValue: check.renderedValue,
        });
      }
    }
  }

  // 권장 사항 생성
  const recommendations = buildRecommendations(failItems, pixelDiff, assetReport);

  return {
    pixelDiff: {
      mismatchPercentage: pixelDiff.mismatchPercentage,
      passed: pixelDiff.passed,
    },
    elementVerification: {
      totalPass: elementReport.totalPass,
      totalChecks: elementReport.totalChecks,
      accuracy: elementReport.accuracy,
    },
    assetVerification: {
      totalAssets: assetReport.assets.length,
      passedAssets: assetReport.assets.length - assetReport.missingCount,
      allPassed: assetReport.allPassed,
    },
    overall: Math.round(accuracy * 10) / 10,
    passed: accuracy >= 99,
    failItems,
    recommendations,
  };
}

/** 실패 항목 기반 권장 사항을 생성한다 */
function buildRecommendations(
  failItems: CoverageReport['failItems'],
  pixelDiff: PixelDiffResult,
  assetReport: AssetVerificationReport
): string[] {
  const recs: string[] = [];

  // 카테고리별 실패 수 집계
  const failByCategory = new Map<ElementCheckCategory, number>();
  for (const item of failItems) {
    failByCategory.set(item.category, (failByCategory.get(item.category) ?? 0) + 1);
  }

  if (failByCategory.has('existence')) {
    recs.push(`누락 요소 ${failByCategory.get('existence')}개 — Figma 스크린샷을 참고하여 요소를 추가하세요`);
  }
  if (failByCategory.has('layout')) {
    recs.push(`배치 오류 ${failByCategory.get('layout')}개 — flex-direction, align, justify를 Figma와 대조하세요`);
  }
  if (failByCategory.has('spacing')) {
    recs.push(`간격 오류 ${failByCategory.get('spacing')}개 — padding, gap, margin 수치를 get_design_context에서 확인하세요`);
  }
  if (failByCategory.has('size')) {
    recs.push(`크기 오류 ${failByCategory.get('size')}개 — width, height를 Figma 스펙과 대조하세요`);
  }
  if (failByCategory.has('color')) {
    recs.push(`색상 오류 ${failByCategory.get('color')}개 — Tailwind 토큰을 사용하고 있는지 확인하세요`);
  }
  if (failByCategory.has('typography')) {
    recs.push(`타이포 오류 ${failByCategory.get('typography')}개 — font-size, weight, line-height를 확인하세요`);
  }
  if (failByCategory.has('border')) {
    recs.push(`테두리 오류 ${failByCategory.get('border')}개 — border-width, radius, style(solid/dashed 등)을 확인하세요`);
  }
  if (failByCategory.has('icon')) {
    recs.push(`아이콘 오류 ${failByCategory.get('icon')}개 — 올바른 아이콘이 사용되었는지, Container/Shape 분리 패턴을 확인하세요`);
  }

  if (!assetReport.allPassed) {
    const missing = assetReport.assets.filter(a => !a.downloaded);
    if (missing.length > 0) {
      recs.push(`에셋 미다운로드 ${missing.length}개 — Figma에서 에셋을 다운로드하여 프로젝트에 추가하세요`);
    }
  }

  if (pixelDiff.mismatchPercentage > 10) {
    recs.push(`픽셀 불일치 ${pixelDiff.mismatchPercentage}% — diff 이미지(${pixelDiff.diffImagePath})를 확인하세요`);
  }

  return recs;
}

/** 커버리지 리포트를 포매팅한다 */
export function formatCoverageReport(report: CoverageReport): string {
  const lines: string[] = [
    '=== 검증 리포트 ===',
    '',
    `요소별 검증: ${report.elementVerification.accuracy}% (${report.elementVerification.totalPass}/${report.elementVerification.totalChecks})`,
    `픽셀 diff:   ${report.pixelDiff.mismatchPercentage}% 불일치 ${report.pixelDiff.passed ? '✅' : '⚠️'}`,
    `에셋 검증:   ${report.assetVerification.passedAssets}/${report.assetVerification.totalAssets} ${report.assetVerification.allPassed ? '✅' : '❌'}`,
    '',
    `최종 정확도: ${report.overall}%`,
    `상태:        ${report.passed ? '✅ PASSED (99% 이상)' : '❌ FAILED (99% 미만)'}`,
  ];

  if (report.failItems.length > 0) {
    lines.push('', '--- 실패 항목 ---');
    for (const item of report.failItems) {
      lines.push(`  ✗ ${item.elementName} [${item.category}]: Figma=${item.figmaValue} → 렌더링=${item.renderedValue}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('', '--- 수정 권장 ---');
    for (const rec of report.recommendations) {
      lines.push(`  → ${rec}`);
    }
  }

  return lines.join('\n');
}
