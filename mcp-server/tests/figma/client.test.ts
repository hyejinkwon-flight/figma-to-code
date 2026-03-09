import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FigmaClient } from '../../src/figma/client.js';

describe('FigmaClient', () => {
  let client: FigmaClient;

  beforeEach(() => {
    client = new FigmaClient('test-token');
    vi.restoreAllMocks();
  });

  it('토큰 없이 생성하면 에러를 던진다', () => {
    expect(() => new FigmaClient('')).toThrow('Figma access token is required');
  });

  it('getFile - 성공 시 파일 데이터를 반환한다', async () => {
    const mockData = { name: 'Test File', document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] }, components: {}, styles: {} };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    } as Response);

    const result = await client.getFile('abc123');
    expect(result.name).toBe('Test File');
    expect(fetch).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/abc123',
      { headers: { 'X-Figma-Token': 'test-token' } }
    );
  });

  it('getFile - options를 쿼리 파라미터로 전달한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as Response);

    await client.getFile('abc', { depth: 2, geometry: 'paths', pluginData: 'shared' });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('depth=2'),
      expect.any(Object)
    );
  });

  it('getFile - API 에러 시 예외를 던진다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    } as Response);

    await expect(client.getFile('bad-key')).rejects.toThrow('Figma API error 403: Forbidden');
  });

  it('getFile - text() 실패 시에도 에러 메시지를 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error('parse fail')),
    } as Response);

    await expect(client.getFile('bad')).rejects.toThrow('Figma API error 500:');
  });

  it('getFileNodes - 노드 데이터를 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ nodes: {} }),
    } as Response);

    const result = await client.getFileNodes('abc', ['1:1', '2:2']);
    expect(result).toEqual({ nodes: {} });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('ids=1:1,2:2'),
      expect.any(Object)
    );
  });

  it('getFileNodes - 빈 배열이면 에러를 던진다', async () => {
    await expect(client.getFileNodes('abc', [])).rejects.toThrow('At least one node ID');
  });

  it('getImages - 이미지 URL 맵을 반환한다', async () => {
    const mockImages = { '1:1': 'https://img.url/1.png' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: mockImages }),
    } as Response);

    const result = await client.getImages('abc', ['1:1']);
    expect(result).toEqual(mockImages);
  });

  it('getImages - 옵션을 전달한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ images: {} }),
    } as Response);

    await client.getImages('abc', ['1:1'], { format: 'svg', scale: 3 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('format=svg&scale=3'),
      expect.any(Object)
    );
  });

  it('getImages - 빈 배열이면 에러를 던진다', async () => {
    await expect(client.getImages('abc', [])).rejects.toThrow('At least one node ID');
  });

  it('getComponents - 컴포넌트 목록을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ meta: { components: [] } }),
    } as Response);

    const result = await client.getComponents('abc');
    expect(result).toBeDefined();
  });

  it('getComponentSets - 컴포넌트 세트 목록을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ meta: { component_sets: [] } }),
    } as Response);

    const result = await client.getComponentSets('abc');
    expect(result).toBeDefined();
  });

  it('getStyles - 스타일 목록을 반환한다', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ meta: { styles: [] } }),
    } as Response);

    const result = await client.getStyles('abc');
    expect(result).toBeDefined();
  });
});
