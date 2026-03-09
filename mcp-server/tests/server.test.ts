import { describe, it, expect, vi } from 'vitest';
import { getToolDefinitions, handleToolCall, type ServerConfig } from '../src/server.js';

const config: ServerConfig = {
  figmaToken: 'test-token',
  outputDir: './generated',
  storybookUrl: 'http://localhost:6006',
  styleSystem: 'tailwind',
};

describe('getToolDefinitions', () => {
  it('모든 Tool 정의를 반환한다', () => {
    const tools = getToolDefinitions();
    expect(tools.length).toBe(10);

    const names = tools.map(t => t.name);
    expect(names).toContain('extract_layers');
    expect(names).toContain('analyze_tree');
    expect(names).toContain('generate_component');
    expect(names).toContain('generate_story');
    expect(names).toContain('verify_pixel_diff');
    expect(names).toContain('verify_elements');
    expect(names).toContain('verify_assets');
    expect(names).toContain('calculate_coverage');
    expect(names).toContain('cleanup_verification');
    expect(names).toContain('run_full_pipeline');
  });

  it('각 Tool에 name, description, inputSchema가 있다', () => {
    const tools = getToolDefinitions();
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

describe('handleToolCall', () => {
  it('analyze_tree를 실행한다', async () => {
    const result = await handleToolCall('analyze_tree', {
      extracted_data: {
        fileName: 'Test',
        totalPages: 1,
        totalNodes: 1,
        extractedAt: '',
        pages: [{
          pageId: 'p:1', pageName: 'Page', totalNodeCount: 1, leafNodeCount: 1, maxDepth: 0,
          layers: [{
            id: '1:1', name: 'Button', type: 'COMPONENT', visible: true, locked: false,
            depth: 0, parentId: null, childCount: 0, isLeaf: true,
            absolutePosition: { x: 0, y: 0 }, size: { width: 100, height: 50 },
            children: [],
          }],
        }],
      },
    }, config);

    const typed = result as { totalCandidates: number };
    expect(typed.totalCandidates).toBeGreaterThanOrEqual(1);
  });

  it('generate_component를 실행한다', async () => {
    const result = await handleToolCall('generate_component', {
      node: {
        id: '1:1', name: 'card', type: 'FRAME', visible: true, locked: false,
        depth: 0, parentId: null, childCount: 0, isLeaf: true,
        absolutePosition: { x: 0, y: 0 }, size: { width: 200, height: 100 },
        children: [],
      },
      output_dir: './out',
    }, config);

    const typed = result as { componentName: string };
    expect(typed.componentName).toBe('Card');
  });

  it('verify_elements를 실행한다', async () => {
    const result = await handleToolCall('verify_elements', {
      node_id: '1:1',
      node_name: 'TestNode',
      elements: [
        {
          name: 'Button',
          figmaNodeId: '2:1',
          figmaProps: { exists: true },
          renderedProps: { exists: true },
        },
      ],
      round: 1,
      capture_method: 'Storybook',
    }, config);

    const typed = result as { report: { accuracy: number } };
    expect(typed.report.accuracy).toBe(100);
  });

  it('verify_assets를 실행한다', async () => {
    const result = await handleToolCall('verify_assets', {
      node_id: '1:1',
      assets: [],
      generated_code_content: '',
    }, config);

    const typed = result as { report: { allPassed: boolean } };
    expect(typed.report.allPassed).toBe(true);
  });

  it('cleanup_verification을 실행한다', async () => {
    const result = await handleToolCall('cleanup_verification', {
      screenshot_dir: '/tmp/nonexistent-dir',
    }, config);

    expect(typeof result).toBe('string');
  });

  it('알 수 없는 Tool이면 에러를 던진다', async () => {
    await expect(
      handleToolCall('unknown_tool', {}, config)
    ).rejects.toThrow('Unknown tool: unknown_tool');
  });

  it('run_full_pipeline을 실행한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        name: 'File',
        document: {
          id: '0:0', name: 'D', type: 'DOCUMENT',
          children: [{
            id: 'page:1', name: 'Page', type: 'CANVAS',
            children: [{ id: '1:1', name: 'Frame', type: 'FRAME' }],
          }],
        },
        components: {},
        styles: {},
      }),
    } as Response);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await handleToolCall('run_full_pipeline', {
      file_key: 'abc',
      output_dir: './out',
      target_coverage: 99,
      max_iterations: 1,
    }, config);

    const typed = result as { passed: boolean; iterations: number };
    expect(typed.iterations).toBe(1);
    expect(typeof typed.passed).toBe('boolean');

    vi.restoreAllMocks();
  });
});
