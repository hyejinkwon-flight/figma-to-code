// 스크린샷 캡처 모듈 — Figma MCP + Playwright MCP 연동
// 실제 캡처는 MCP 클라이언트(Claude)가 수행하며, 이 모듈은 캡처 요청/결과를 구조화한다
import type { ScreenshotPair } from '../types.js';

export interface CaptureRequest {
  figmaFileKey: string;
  figmaNodeId: string;
  figmaNodeName: string;
  renderingUrl: string;
  renderingType: 'storybook' | 'vite-dev';
  storyId?: string;
  pagePath?: string;
  viewport: { width: number; height: number };
  screenshotDir: string;
}

/** Storybook iframe URL을 생성한다 */
export function buildStorybookUrl(baseUrl: string, storyId: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  return `${normalizedBase}/iframe.html?id=${storyId}&viewMode=story`;
}

/** Vite dev 서버 URL을 생성한다 */
export function buildViteDevUrl(baseUrl: string, pagePath: string): string {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  return `${normalizedBase}${normalizedPath}`;
}

/** 스크린샷 파일 경로를 생성한다 */
export function getScreenshotPaths(
  screenshotDir: string,
  nodeId: string,
  round: number
): { figmaPath: string; renderingPath: string; diffPath: string } {
  const safeNodeId = nodeId.replace(/[:/]/g, '-');
  return {
    figmaPath: `${screenshotDir}/figma-${safeNodeId}-r${round}.png`,
    renderingPath: `${screenshotDir}/rendering-${safeNodeId}-r${round}.png`,
    diffPath: `${screenshotDir}/diff-${safeNodeId}-r${round}.png`,
  };
}

/**
 * 캡처 요청을 MCP 호출 가능한 형태로 변환한다.
 * 실제 호출은 Claude가 Figma MCP(get_screenshot)와 Playwright MCP(browser_take_screenshot)를 사용한다.
 */
export function buildCaptureInstructions(request: CaptureRequest, round: number): {
  figma: {
    tool: 'get_screenshot';
    params: { file_key: string; node_id: string };
    saveTo: string;
  };
  rendering: {
    tool: 'browser_navigate' | 'browser_take_screenshot';
    navigateUrl: string;
    viewport: { width: number; height: number };
    saveTo: string;
  };
} {
  const paths = getScreenshotPaths(request.screenshotDir, request.figmaNodeId, round);

  const navigateUrl = request.renderingType === 'storybook'
    ? buildStorybookUrl(request.renderingUrl, request.storyId ?? '')
    : buildViteDevUrl(request.renderingUrl, request.pagePath ?? '/');

  return {
    figma: {
      tool: 'get_screenshot',
      params: {
        file_key: request.figmaFileKey,
        node_id: request.figmaNodeId,
      },
      saveTo: paths.figmaPath,
    },
    rendering: {
      tool: 'browser_take_screenshot',
      navigateUrl,
      viewport: request.viewport,
      saveTo: paths.renderingPath,
    },
  };
}

/** 캡처 결과로 ScreenshotPair를 생성한다 */
export function createScreenshotPair(
  request: CaptureRequest,
  figmaScreenshotPath: string,
  renderingScreenshotPath: string
): ScreenshotPair {
  return {
    figmaScreenshotPath,
    renderingScreenshotPath,
    captureMethod: request.renderingType === 'storybook' ? 'storybook' : 'vite-dev',
    viewport: request.viewport,
    nodeId: request.figmaNodeId,
    nodeName: request.figmaNodeName,
  };
}
