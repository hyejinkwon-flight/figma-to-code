import { describe, it, expect } from 'vitest';
import { calculateCoverage, formatCoverageReport } from '../../src/verifier/coverage-calculator.js';
import type { PixelDiffResult, ElementVerificationReport, AssetVerificationReport } from '../../src/types.js';

function createPixelDiff(overrides: Partial<PixelDiffResult> = {}): PixelDiffResult {
  return {
    mismatchedPixels: 0,
    totalPixels: 1000000,
    mismatchPercentage: 0,
    diffImagePath: '/tmp/diff.png',
    passed: true,
    ...overrides,
  };
}

function createElementReport(overrides: Partial<ElementVerificationReport> = {}): ElementVerificationReport {
  return {
    nodeId: '1:1',
    nodeName: 'TestNode',
    elements: [],
    totalPass: 20,
    totalChecks: 20,
    accuracy: 100,
    ...overrides,
  };
}

function createAssetReport(overrides: Partial<AssetVerificationReport> = {}): AssetVerificationReport {
  return {
    nodeId: '1:1',
    assets: [],
    allPassed: true,
    missingCount: 0,
    ...overrides,
  };
}

describe('calculateCoverage', () => {
  it('모두 통과하면 overall=100, passed=true', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport(),
      createAssetReport()
    );
    expect(report.overall).toBe(100);
    expect(report.passed).toBe(true);
    expect(report.failItems).toEqual([]);
  });

  it('요소별 정확도가 주 지표이다', () => {
    const report = calculateCoverage(
      createPixelDiff({ mismatchPercentage: 20, passed: false }),
      createElementReport({ accuracy: 95, totalPass: 19, totalChecks: 20 }),
      createAssetReport()
    );
    // 픽셀 diff가 나빠도 요소별 accuracy가 주 지표
    expect(report.overall).toBe(95);
    expect(report.passed).toBe(false);
  });

  it('에셋 누락 시 accuracy가 90%를 초과하면 90%로 제한', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport({ accuracy: 99 }),
      createAssetReport({ allPassed: false, missingCount: 1 })
    );
    expect(report.overall).toBe(90);
    expect(report.passed).toBe(false);
  });

  it('에셋 누락이어도 accuracy가 90% 이하면 그대로', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport({ accuracy: 70 }),
      createAssetReport({ allPassed: false, missingCount: 2 })
    );
    expect(report.overall).toBe(70);
  });

  it('fail 항목을 수집한다', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport({
        accuracy: 80,
        totalPass: 8,
        totalChecks: 10,
        elements: [{
          elementIndex: 1,
          elementName: 'X 닫기 버튼',
          checks: [
            { category: 'existence', passed: false, figmaValue: '있음', renderedValue: '없음' },
          ],
          passCount: 0,
          totalCount: 1,
        }],
      }),
      createAssetReport()
    );
    expect(report.failItems.length).toBe(1);
    expect(report.failItems[0].elementName).toBe('X 닫기 버튼');
    expect(report.failItems[0].category).toBe('existence');
  });

  it('recommendations에 카테고리별 권장 사항이 포함된다', () => {
    const report = calculateCoverage(
      createPixelDiff({ mismatchPercentage: 15 }),
      createElementReport({
        accuracy: 70,
        elements: [{
          elementIndex: 1,
          elementName: 'Border Element',
          checks: [
            { category: 'existence', passed: true, figmaValue: '있음', renderedValue: '있음' },
            { category: 'border', passed: false, figmaValue: 'dashed', renderedValue: 'solid' },
          ],
          passCount: 1,
          totalCount: 2,
        }],
      }),
      createAssetReport({ allPassed: false, missingCount: 1, assets: [
        { assetName: 'icon.svg', assetType: 'icon', downloaded: false, correctRef: false, rendered: false, figmaNodeId: '2:1', details: '' },
      ] })
    );
    expect(report.recommendations.some(r => r.includes('테두리'))).toBe(true);
    expect(report.recommendations.some(r => r.includes('에셋'))).toBe(true);
    expect(report.recommendations.some(r => r.includes('픽셀'))).toBe(true);
  });
});

describe('formatCoverageReport', () => {
  it('리포트 문자열을 생성한다', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport(),
      createAssetReport()
    );
    const formatted = formatCoverageReport(report);
    expect(formatted).toContain('검증 리포트');
    expect(formatted).toContain('요소별 검증');
    expect(formatted).toContain('픽셀 diff');
    expect(formatted).toContain('에셋 검증');
    expect(formatted).toContain('PASSED');
  });

  it('실패 시 FAILED를 표시한다', () => {
    const report = calculateCoverage(
      createPixelDiff(),
      createElementReport({ accuracy: 50 }),
      createAssetReport()
    );
    const formatted = formatCoverageReport(report);
    expect(formatted).toContain('FAILED');
  });
});
