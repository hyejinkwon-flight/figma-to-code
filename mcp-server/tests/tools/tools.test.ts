import { describe, it, expect, jest } from '@jest/globals';
import { executeExtractLayers } from '../../src/tools/extract-layers.js';
import { executeAnalyzeTree } from '../../src/tools/analyze-tree.js';
import { executeGenerateComponent } from '../../src/tools/generate-component.js';
import { executeGenerateStory } from '../../src/tools/generate-story.js';
import {
  executeVerifyElements,
  executeVerifyAssets,
  executeCalculateCoverage,
  executeCleanupVerification,
} from '../../src/tools/verify-all.js';
import { FigmaClient } from '../../src/figma/client.js';
import type { ExtractedNode, FigmaFileData, PixelDiffResult, AssetVerificationReport } from '../../src/types.js';

function createNode(overrides: Partial<ExtractedNode> = {}): ExtractedNode {
  return {
    id: '1:1', name: 'Node', type: 'FRAME', visible: true, locked: false,
    depth: 0, parentId: null, childCount: 0, isLeaf: true,
    absolutePosition: { x: 0, y: 0 }, size: { width: 100, height: 50 },
    children: [], ...overrides,
  };
}

describe('executeExtractLayers', () => {
  it('Figma 파일에서 레이어를 추출한다', async () => {
    const client = new FigmaClient('test-token');
    jest.spyOn(client, 'getFile').mockResolvedValue({
      name: 'Test',
      document: {
        id: '0:0', name: 'Document', type: 'DOCUMENT',
        children: [{
          id: 'page:1', name: 'Page 1', type: 'CANVAS',
          children: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
        }],
      },
      components: {}, styles: {},
    });

    const result = await executeExtractLayers({ file_key: 'abc' }, client);
    expect(result.fileName).toBe('Test');
    expect(result.totalPages).toBe(1);
  });
});

describe('executeAnalyzeTree', () => {
  it('컴포넌트 후보를 식별한다', () => {
    const fileData: FigmaFileData = {
      fileName: 'Test',
      totalPages: 1,
      totalNodes: 1,
      extractedAt: '',
      pages: [{
        pageId: 'p:1', pageName: 'Page', totalNodeCount: 1, leafNodeCount: 0, maxDepth: 1,
        layers: [createNode({ type: 'COMPONENT', name: 'Button' })],
      }],
    };

    const result = executeAnalyzeTree({ extracted_data: fileData });
    expect(result.totalCandidates).toBeGreaterThanOrEqual(1);
  });
});

describe('executeGenerateComponent', () => {
  it('컴포넌트 코드를 생성한다', () => {
    const node = createNode({ name: 'card' });
    const result = executeGenerateComponent({ node, output_dir: './out' });
    expect(result.componentName).toBe('Card');
    expect(result.files.component).toContain('const Card');
  });
});

describe('executeGenerateStory', () => {
  it('스토리 코드를 생성한다', () => {
    const component = { componentName: 'Button', nodeId: '1:1', files: { component: '', types: '', index: '' } };
    const node = createNode({ name: 'Button' });

    const result = executeGenerateStory({
      component,
      figma_node: node,
      file_key: 'abc',
    });
    expect(result).toContain('Button');
    expect(result).toContain('Meta');
  });
});

describe('executeVerifyElements', () => {
  it('요소별 검증 결과를 반환한다', () => {
    const { report, formatted } = executeVerifyElements(
      '1:1',
      'TestNode',
      [{ name: 'Element A', figmaNodeId: '2:1', figmaProps: { exists: true }, renderedProps: { exists: true } }],
      1,
      'Storybook'
    );
    expect(report.accuracy).toBe(100);
    expect(formatted).toContain('검증 테이블');
  });

  it('존재하지 않는 요소를 감지한다', () => {
    const { report } = executeVerifyElements(
      '1:1',
      'TestNode',
      [{ name: 'Missing', figmaNodeId: '2:1', figmaProps: { exists: true }, renderedProps: { exists: false } }],
      1,
      'Storybook'
    );
    expect(report.accuracy).toBe(0);
    expect(report.totalPass).toBe(0);
  });
});

describe('executeVerifyAssets', () => {
  it('에셋 검증 결과를 반환한다', () => {
    const { report } = executeVerifyAssets('1:1', [], '');
    expect(report.allPassed).toBe(true);
    expect(report.missingCount).toBe(0);
  });
});

describe('executeCalculateCoverage', () => {
  it('전체 커버리지를 계산한다', () => {
    const pixelDiff: PixelDiffResult = {
      mismatchedPixels: 0, totalPixels: 1000000, mismatchPercentage: 0,
      diffImagePath: '/tmp/diff.png', passed: true,
    };
    const elementReport = {
      nodeId: '1:1', nodeName: 'Test', elements: [],
      totalPass: 10, totalChecks: 10, accuracy: 100,
    };
    const assetReport: AssetVerificationReport = {
      nodeId: '1:1', assets: [], allPassed: true, missingCount: 0,
    };

    const { report, formatted } = executeCalculateCoverage(pixelDiff, elementReport, assetReport);
    expect(report.overall).toBe(100);
    expect(report.passed).toBe(true);
    expect(formatted).toContain('검증 리포트');
  });
});

describe('executeCleanupVerification', () => {
  it('정리 결과를 반환한다', () => {
    const result = executeCleanupVerification('/tmp/nonexistent-dir');
    expect(result).toContain('정리');
  });
});
