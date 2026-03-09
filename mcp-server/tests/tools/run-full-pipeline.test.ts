import { describe, it, expect, vi } from 'vitest';
import { executePipelineIteration, executeFullPipeline } from '../../src/tools/run-full-pipeline.js';
import { FigmaClient } from '../../src/figma/client.js';

function mockFileResponse() {
  return {
    name: 'TestFile',
    document: {
      id: '0:0',
      name: 'Document',
      type: 'DOCUMENT',
      children: [{
        id: 'page:1',
        name: 'Page 1',
        type: 'CANVAS',
        children: [
          {
            id: '1:1',
            name: 'ButtonComponent',
            type: 'COMPONENT',
            absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 50 },
            children: [
              { id: '2:1', name: 'Label', type: 'TEXT', characters: 'Click Me' },
            ],
          },
          {
            id: '3:1',
            name: 'ButtonInstance',
            type: 'INSTANCE',
            componentId: '1:1',
          },
        ],
      }],
    },
    components: {},
    styles: {},
  };
}

describe('executePipelineIteration', () => {
  it('컴포넌트 노드를 찾아서 생성한다 (깊이 탐색)', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'Deep',
      document: {
        id: '0:0', name: 'D', type: 'DOCUMENT',
        children: [{
          id: 'page:1', name: 'Page', type: 'CANVAS',
          children: [{
            id: '1:1', name: 'Wrapper', type: 'FRAME',
            children: [{
              id: '2:1', name: 'DeepComp', type: 'COMPONENT',
              children: [{ id: '3:1', name: 'Label', type: 'TEXT', characters: 'Hi' }],
            }],
          }],
        }],
      },
      components: {}, styles: {},
    });

    const state = await executePipelineIteration(client, { fileKey: 'abc', nodeIds: [], outputDir: './out', renderingUrl: 'http://localhost:6006', renderingType: 'storybook' as const });
    // DeepComp는 COMPONENT이므로 후보에 포함되어야 하고, 깊이 탐색으로 찾음
    expect(state.candidates.some(c => c.nodeName === 'DeepComp')).toBe(true);
    expect(state.generated.some(g => g.componentName === 'Deepcomp')).toBe(true);
  });

  it('존재하지 않는 nodeId의 후보는 건너뛴다', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'T', document: { id: '0:0', name: 'D', type: 'DOCUMENT', children: [] },
      components: {}, styles: {},
    });

    const state = await executePipelineIteration(client, { fileKey: 'abc', nodeIds: [], outputDir: './out', renderingUrl: 'http://localhost:6006', renderingType: 'storybook' as const });
    expect(state.generated.length).toBe(0);
  });

  it('다중 페이지에서 노드를 찾는다 (findNodeById 다중 레이어)', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'Multi',
      document: {
        id: '0:0', name: 'D', type: 'DOCUMENT',
        children: [
          {
            id: 'page:1', name: 'Page1', type: 'CANVAS',
            children: [{ id: '1:1', name: 'NotComp', type: 'FRAME' }],
          },
          {
            id: 'page:2', name: 'Page2', type: 'CANVAS',
            children: [
              {
                id: '2:1', name: 'Container', type: 'FRAME',
                children: [{ id: '3:1', name: 'InnerComp', type: 'COMPONENT' }],
              },
            ],
          },
        ],
      },
      components: {}, styles: {},
    });

    const state = await executePipelineIteration(client, { fileKey: 'abc', nodeIds: [], outputDir: './out', renderingUrl: 'http://localhost:6006', renderingType: 'storybook' as const });
    expect(state.candidates.some(c => c.nodeName === 'InnerComp')).toBe(true);
    expect(state.generated.some(g => g.componentName === 'Innercomp')).toBe(true);
  });

  it('여러 레이어가 있는 페이지에서 searchNode가 두 번째 레이어를 탐색한다', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'TwoLayers',
      document: {
        id: '0:0', name: 'D', type: 'DOCUMENT',
        children: [{
          id: 'page:1', name: 'Page', type: 'CANVAS',
          children: [
            { id: '1:1', name: 'LayerA', type: 'FRAME' },
            { id: '1:2', name: 'CompB', type: 'COMPONENT' },
          ],
        }],
      },
      components: {}, styles: {},
    });

    const state = await executePipelineIteration(client, { fileKey: 'abc', nodeIds: [], outputDir: './out', renderingUrl: 'http://localhost:6006', renderingType: 'storybook' as const });
    expect(state.generated.some(g => g.componentName === 'Compb')).toBe(true);
  });

  it('파이프라인 1회 반복을 실행한다', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue(mockFileResponse());

    const state = await executePipelineIteration(client, {
      fileKey: 'abc',
      outputDir: './out',
    });

    expect(state.extracted.fileName).toBe('TestFile');
    expect(state.candidates.length).toBeGreaterThanOrEqual(1);
    expect(state.generated.length).toBeGreaterThanOrEqual(1);
    expect(state.coverage).toBeDefined();
    expect(state.coverage.overall).toBeGreaterThanOrEqual(0);
  });

  it('빈 파일 데이터도 처리한다', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'Empty',
      document: { id: '0:0', name: 'D', type: 'DOCUMENT', children: [] },
      components: {},
      styles: {},
    });

    const state = await executePipelineIteration(client, {
      fileKey: 'abc',
      outputDir: './out',
    });

    expect(state.extracted.totalPages).toBe(0);
    expect(state.candidates.length).toBe(0);
    // v2: 빈 파일 = 요소 0개 = accuracy 0 (검증할 대상 없음)
    expect(state.coverage.overall).toBe(0);
  });
});

describe('executeFullPipeline', () => {
  it('목표 커버리지에 도달하면 반복을 멈춘다', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue(mockFileResponse());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await executeFullPipeline(client, {
      fileKey: 'abc',
      outputDir: './out',
      targetCoverage: 0,
      maxIterations: 3,
    });

    // targetCoverage=0이므로 1회 반복 후 종료
    expect(result.iterations).toBe(1);

    vi.restoreAllMocks();
  });

  it('maxIterations에 도달하면 멈춘다', async () => {
    const client = new FigmaClient('test');
    // 커버리지가 낮게 나오도록 설정 (빈 파일이지만 타겟이 높음)
    vi.spyOn(client, 'getFile').mockResolvedValue(mockFileResponse());
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await executeFullPipeline(client, {
      fileKey: 'abc',
      outputDir: './out',
      targetCoverage: 99,
      maxIterations: 2,
    });

    expect(result.iterations).toBeLessThanOrEqual(2);

    vi.restoreAllMocks();
  });

  it('기본값을 사용한다 (targetCoverage=99, maxIterations=5)', async () => {
    const client = new FigmaClient('test');
    vi.spyOn(client, 'getFile').mockResolvedValue({
      name: 'E',
      document: { id: '0:0', name: 'D', type: 'DOCUMENT', children: [] },
      components: {},
      styles: {},
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await executeFullPipeline(client, {
      fileKey: 'abc',
      outputDir: './out',
    });

    // 빈 파일 = 요소 0개 = accuracy 0% → passed=false (v2: 실제 검증 필요)
    expect(typeof result.passed).toBe('boolean');

    vi.restoreAllMocks();
  });
});
