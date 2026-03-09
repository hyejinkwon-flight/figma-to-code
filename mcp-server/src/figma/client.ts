// Figma REST API 클라이언트
import type { FigmaFileResponse } from '../types.js';

interface GetFileOptions {
  depth?: number;
  geometry?: string;
  pluginData?: string;
}

interface GetImagesOptions {
  format?: 'jpg' | 'png' | 'svg' | 'pdf';
  scale?: number;
}

export class FigmaClient {
  private token: string;
  private baseUrl = 'https://api.figma.com/v1';

  constructor(token: string) {
    if (!token) {
      throw new Error('Figma access token is required');
    }
    this.token = token;
  }

  private get headers(): Record<string, string> {
    return { 'X-Figma-Token': this.token };
  }

  /** 공통 fetch 래퍼 — 에러 핸들링 포함 */
  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { headers: this.headers });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Figma API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  /** 파일 전체 데이터를 가져온다 */
  async getFile(fileKey: string, options?: GetFileOptions): Promise<FigmaFileResponse> {
    const params = new URLSearchParams();
    if (options?.depth) params.set('depth', String(options.depth));
    if (options?.geometry) params.set('geometry', options.geometry);
    if (options?.pluginData) params.set('plugin_data', options.pluginData);

    const query = params.toString();
    const path = `/files/${fileKey}${query ? `?${query}` : ''}`;
    return this.request<FigmaFileResponse>(path);
  }

  /** 특정 노드들의 데이터를 가져온다 */
  async getFileNodes(fileKey: string, nodeIds: string[]): Promise<Record<string, unknown>> {
    if (nodeIds.length === 0) {
      throw new Error('At least one node ID is required');
    }
    const ids = nodeIds.join(',');
    return this.request(`/files/${fileKey}/nodes?ids=${ids}`);
  }

  /** 노드 이미지 렌더링 URL을 가져온다 */
  async getImages(
    fileKey: string,
    nodeIds: string[],
    options?: GetImagesOptions
  ): Promise<Record<string, string>> {
    if (nodeIds.length === 0) {
      throw new Error('At least one node ID is required');
    }
    const ids = nodeIds.join(',');
    const format = options?.format ?? 'png';
    const scale = options?.scale ?? 2;
    const data = await this.request<{ images: Record<string, string> }>(
      `/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`
    );
    return data.images;
  }

  /** 파일의 컴포넌트 목록을 가져온다 */
  async getComponents(fileKey: string): Promise<Record<string, unknown>> {
    return this.request(`/files/${fileKey}/components`);
  }

  /** 파일의 컴포넌트 세트 목록을 가져온다 */
  async getComponentSets(fileKey: string): Promise<Record<string, unknown>> {
    return this.request(`/files/${fileKey}/component_sets`);
  }

  /** 파일의 스타일 목록을 가져온다 */
  async getStyles(fileKey: string): Promise<Record<string, unknown>> {
    return this.request(`/files/${fileKey}/styles`);
  }

  /** export URL에서 SVG 콘텐츠를 다운로드한다 */
  async downloadSvg(exportUrl: string): Promise<string> {
    const res = await fetch(exportUrl);

    if (!res.ok) {
      throw new Error(`SVG download failed ${res.status}: ${exportUrl}`);
    }

    return res.text();
  }

  /** nodeIds에 대해 SVG export → 다운로드 → 콘텐츠 반환을 한 번에 수행한다 */
  async exportAndDownloadSvgs(
    fileKey: string,
    nodeIds: string[]
  ): Promise<Record<string, { url: string; content: string }>> {
    const imageUrls = await this.getImages(fileKey, nodeIds, { format: 'svg' });
    const result: Record<string, { url: string; content: string }> = {};

    const entries = Object.entries(imageUrls).filter(([, url]) => url != null);
    const downloads = entries.map(async ([nodeId, url]) => {
      const content = await this.downloadSvg(url);
      result[nodeId] = { url, content };
    });

    await Promise.all(downloads);
    return result;
  }
}
