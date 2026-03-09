/**
 * MCP 서버 통합 검증 테스트 (v2)
 *
 * Figma MCP에서 추출한 실제 디자인 데이터를 기반으로
 * 새로운 검증 파이프라인(픽셀 diff + 요소별 9항목 + 에셋)을 테스트합니다.
 */
import { describe, it, expect } from '@jest/globals';
import { traverseNode, countNodes } from '../../src/figma/traverser.js';
import { verifyAllElements, type VerifyElement } from '../../src/verifier/element-verifier.js';
import { verifyAllAssets, type AssetToVerify } from '../../src/verifier/asset-verifier.js';
import { calculateCoverage, formatCoverageReport } from '../../src/verifier/coverage-calculator.js';
import { identifyComponents } from '../../src/figma/parser.js';
import type { FigmaAPINode, PixelDiffResult } from '../../src/types.js';

// ─── Figma MCP에서 추출한 실제 디자인 데이터 ─────────────────────────

const figmaHeader: FigmaAPINode = {
  id: '536:17025',
  name: 'GNB&LNB/1440/1. Before Login - Default',
  type: 'FRAME',
  visible: true,
  absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 122 },
  layoutMode: 'VERTICAL',
  children: [
    {
      id: '536:17026', name: 'GNB&LNB', type: 'FRAME', visible: true,
      absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 122 },
      children: [
        { id: '536:17027', name: 'Divider', type: 'RECTANGLE', visible: true,
          absoluteBoundingBox: { x: 0, y: 121, width: 1440, height: 1 },
          fills: [{ type: 'SOLID', color: { r: 0.87, g: 0.89, b: 0.9, a: 1 } }] },
        { id: '536:17028', name: 'LNB', type: 'FRAME', visible: true,
          absoluteBoundingBox: { x: 0, y: 72, width: 1440, height: 50 },
          layoutMode: 'HORIZONTAL', itemSpacing: 0,
          children: [
            { id: '536:17032', name: 'Tab/항공권 ON', type: 'FRAME', visible: true,
              absoluteBoundingBox: { x: 372, y: 82, width: 75, height: 40 },
              children: [
                { id: '536:17033', name: '항공권', type: 'TEXT', visible: true,
                  characters: '항공권',
                  style: { fontSize: 16, fontWeight: 700, fontFamily: 'Apple SD Gothic Neo', lineHeightPx: 24 },
                  absoluteBoundingBox: { x: 376, y: 82, width: 67, height: 24 } },
              ] },
          ] },
        { id: '536:17054', name: 'GNB', type: 'FRAME', visible: true,
          absoluteBoundingBox: { x: 0, y: 0, width: 1440, height: 72 },
          layoutMode: 'HORIZONTAL',
          children: [
            { id: '536:17066', name: 'Logo/Color', type: 'FRAME', visible: true,
              absoluteBoundingBox: { x: 190, y: 13, width: 128, height: 30 } },
            { id: '536:17091', name: 'SearchBar', type: 'FRAME', visible: true,
              absoluteBoundingBox: { x: 342, y: 12, width: 342, height: 48 },
              cornerRadius: 4,
              children: [
                { id: '536:17098', name: '검색 플레이스홀더', type: 'TEXT', visible: true,
                  characters: '여행지나 상품을 검색해보세요!',
                  style: { fontSize: 15, fontWeight: 500, fontFamily: 'Apple SD Gothic Neo' },
                  absoluteBoundingBox: { x: 390, y: 24, width: 284, height: 24 } },
              ] },
          ] },
      ],
    },
  ],
};

// ─── Phase 1: Extract ─────────────────────────────────────────

describe('Phase 1: Extract — Figma 데이터 추출', () => {
  it('GNB&LNB 헤더를 ExtractedNode로 변환한다', () => {
    const extracted = traverseNode(figmaHeader);
    expect(extracted.id).toBe('536:17025');
    expect(extracted.size.width).toBe(1440);
    expect(extracted.children.length).toBeGreaterThan(0);
    expect(countNodes(extracted)).toBeGreaterThanOrEqual(8);
  });
});

// ─── Phase 2: Analyze ─────────────────────────────────────────

describe('Phase 2: Analyze — 컴포넌트 분석', () => {
  it('identifyComponents가 동작한다', () => {
    const fileData = {
      fileName: 'Test', totalPages: 1, totalNodes: 10,
      extractedAt: new Date().toISOString(),
      pages: [{
        pageId: '1:2', pageName: 'Page', totalNodeCount: 10,
        leafNodeCount: 5, maxDepth: 5,
        layers: [traverseNode(figmaHeader)],
      }],
    };
    const candidates = identifyComponents(fileData);
    expect(Array.isArray(candidates)).toBe(true);
  });
});

// ─── Phase 5 (v2): 요소별 검증 ─────────────────────────────────

describe('Phase 5 (v2) — 요소별 9항목 검증', () => {
  it('모든 요소가 일치하면 accuracy=100', () => {
    const elements: VerifyElement[] = [
      {
        name: '로고',
        figmaNodeId: '536:17066',
        figmaProps: { exists: true, size: { width: 128, height: 30 } },
        renderedProps: { exists: true, size: { width: 128, height: 30 } },
      },
      {
        name: '검색바',
        figmaNodeId: '536:17091',
        figmaProps: {
          exists: true,
          size: { width: 342, height: 48 },
          border: { radius: 4, style: 'solid' },
        },
        renderedProps: {
          exists: true,
          size: { width: 342, height: 48 },
          border: { radius: 4, style: 'solid' },
        },
      },
      {
        name: '항공권 탭',
        figmaNodeId: '536:17033',
        figmaProps: {
          exists: true,
          typography: { fontSize: 16, fontWeight: 700, lineHeight: 24 },
        },
        renderedProps: {
          exists: true,
          typography: { fontSize: 16, fontWeight: 700, lineHeight: 24 },
        },
      },
    ];

    const report = verifyAllElements('536:17025', 'GNB Header', elements);
    expect(report.accuracy).toBe(100);
    expect(report.totalPass).toBe(report.totalChecks);
  });

  it('요소 누락을 정확히 감지한다', () => {
    const elements: VerifyElement[] = [
      {
        name: '로고',
        figmaNodeId: '536:17066',
        figmaProps: { exists: true },
        renderedProps: { exists: true },
      },
      {
        name: 'Divider',
        figmaNodeId: '536:17027',
        figmaProps: { exists: true },
        renderedProps: { exists: false }, // 누락
      },
    ];

    const report = verifyAllElements('536:17025', 'GNB Header', elements);
    expect(report.accuracy).toBe(50);
    const missingElement = report.elements.find(e => e.elementName === 'Divider');
    expect(missingElement?.passCount).toBe(0);
  });

  it('border style 불일치를 감지한다 (dashed vs solid)', () => {
    const elements: VerifyElement[] = [
      {
        name: '카드 테두리',
        figmaNodeId: '1:1',
        figmaProps: {
          exists: true,
          border: { width: 1, radius: 8, style: 'dashed' },
        },
        renderedProps: {
          exists: true,
          border: { width: 1, radius: 8, style: 'solid' },
        },
      },
    ];

    const report = verifyAllElements('1:1', 'Card', elements);
    expect(report.accuracy).toBeLessThan(100);
    const borderFail = report.elements[0].checks.find(c => c.category === 'border');
    expect(borderFail?.passed).toBe(false);
  });

  it('잘못된 아이콘을 감지한다', () => {
    const elements: VerifyElement[] = [
      {
        name: '체크 아이콘',
        figmaNodeId: '1:1',
        figmaProps: {
          exists: true,
          icon: { name: 'check-circle', containerSize: { width: 28, height: 28 }, shapeSize: { width: 18, height: 18 } },
        },
        renderedProps: {
          exists: true,
          icon: { name: 'close', containerSize: { width: 28, height: 28 }, shapeSize: { width: 18, height: 18 } },
        },
      },
    ];

    const report = verifyAllElements('1:1', 'IconTest', elements);
    const iconFail = report.elements[0].checks.find(c => c.category === 'icon');
    expect(iconFail?.passed).toBe(false);
  });
});

// ─── Phase 5 (v2): 에셋 검증 ────────────────────────────────────

describe('Phase 5 (v2) — 에셋 검증', () => {
  it('에셋이 없으면 allPassed=true', () => {
    const report = verifyAllAssets('1:1', [], '');
    expect(report.allPassed).toBe(true);
  });

  it('다운로드되지 않은 에셋을 감지한다', () => {
    const assets: AssetToVerify[] = [{
      assetName: 'check-icon',
      assetType: 'icon',
      figmaNodeId: '2:1',
      figmaAssetName: 'check-circle',
      expectedFilePath: '/nonexistent/check-circle.svg',
      codeReference: 'check-circle.svg',
    }];

    const report = verifyAllAssets('1:1', assets, 'import icon from "./icons/other.svg"');
    expect(report.allPassed).toBe(false);
    expect(report.missingCount).toBe(1);
    expect(report.assets[0].downloaded).toBe(false);
    expect(report.assets[0].correctRef).toBe(false);
  });
});

// ─── Phase 5 (v2): 커버리지 종합 ─────────────────────────────────

describe('Phase 5 (v2) — 커버리지 종합 계산', () => {
  it('모두 통과하면 overall=100, passed=true', () => {
    const pixelDiff: PixelDiffResult = {
      mismatchedPixels: 100, totalPixels: 1000000, mismatchPercentage: 0.01,
      diffImagePath: '/tmp/diff.png', passed: true,
    };

    const elements: VerifyElement[] = [
      { name: 'Logo', figmaNodeId: '1:1', figmaProps: { exists: true }, renderedProps: { exists: true } },
      { name: 'Search', figmaNodeId: '1:2', figmaProps: { exists: true }, renderedProps: { exists: true } },
    ];
    const elementReport = verifyAllElements('1:1', 'Header', elements);
    const assetReport = verifyAllAssets('1:1', [], '');

    const coverage = calculateCoverage(pixelDiff, elementReport, assetReport);

    console.log('\n' + formatCoverageReport(coverage));

    expect(coverage.overall).toBe(100);
    expect(coverage.passed).toBe(true);
    expect(coverage.failItems.length).toBe(0);
  });

  it('에셋 누락 시 최대 90%로 제한된다', () => {
    const pixelDiff: PixelDiffResult = {
      mismatchedPixels: 0, totalPixels: 1000000, mismatchPercentage: 0,
      diffImagePath: '/tmp/diff.png', passed: true,
    };

    const elements: VerifyElement[] = [
      { name: 'Logo', figmaNodeId: '1:1', figmaProps: { exists: true }, renderedProps: { exists: true } },
    ];
    const elementReport = verifyAllElements('1:1', 'Header', elements);
    const assetReport = verifyAllAssets('1:1', [{
      assetName: 'missing-icon', assetType: 'icon', figmaNodeId: '2:1',
      figmaAssetName: 'icon', expectedFilePath: '/nonexistent.svg', codeReference: 'icon.svg',
    }], '');

    const coverage = calculateCoverage(pixelDiff, elementReport, assetReport);
    expect(coverage.overall).toBe(90);
    expect(coverage.passed).toBe(false);
  });

  it('요소 불일치가 있으면 정확도가 낮아진다', () => {
    const pixelDiff: PixelDiffResult = {
      mismatchedPixels: 50000, totalPixels: 1000000, mismatchPercentage: 5,
      diffImagePath: '/tmp/diff.png', passed: true,
    };

    const elements: VerifyElement[] = [
      {
        name: 'Button',
        figmaNodeId: '1:1',
        figmaProps: { exists: true, color: { background: '#ff0000' } },
        renderedProps: { exists: true, color: { background: '#00ff00' } },
      },
      {
        name: 'Missing Element',
        figmaNodeId: '1:2',
        figmaProps: { exists: true },
        renderedProps: { exists: false },
      },
    ];
    const elementReport = verifyAllElements('1:1', 'Test', elements);
    const assetReport = verifyAllAssets('1:1', [], '');

    const coverage = calculateCoverage(pixelDiff, elementReport, assetReport);

    console.log('\n' + formatCoverageReport(coverage));

    expect(coverage.overall).toBeLessThan(99);
    expect(coverage.passed).toBe(false);
    expect(coverage.failItems.length).toBeGreaterThan(0);
    expect(coverage.recommendations.length).toBeGreaterThan(0);
  });
});
