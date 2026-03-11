// MCP Tool: export_images — IMAGE fill 노드에서 래스터 이미지를 export하여 저장
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import type { FigmaClient } from '../figma/client.js';
import type { ExtractedNode, Paint, ImageFillExport } from '../types.js';

export const exportImagesToolDef = {
  name: 'export_images',
  description:
    'Figma 노드에서 IMAGE fill(래스터 이미지/사진/배경)을 감지하고 PNG로 export하여 로컬에 저장합니다. ' +
    'SVG 벡터 아이콘이 아닌 사진, 배경 이미지, 일러스트 등 래스터 이미지를 처리합니다.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      file_key: {
        type: 'string',
        description: 'Figma 파일 키',
      },
      node_ids: {
        type: 'array',
        items: { type: 'string' },
        description:
          'IMAGE fill이 있는 노드 ID 배열. 비어있으면 design_context_json 또는 extracted_nodes에서 자동 감지한다.',
      },
      extracted_nodes: {
        type: 'array',
        items: { type: 'object' },
        description:
          'ExtractedNode 배열 — node_ids가 비어있을 때 IMAGE fill을 자동 감지하는 데 사용 (extract_layers 결과)',
      },
      design_context_json: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
            nodeName: { type: 'string' },
            data: { type: 'object' },
          },
        },
        description:
          'get_design_context 캐시 JSON 배열 — implement-figma에서 Figma MCP로 수집한 디자인 컨텍스트. ' +
          '각 항목의 data 내 fills 배열에서 type:"IMAGE"를 자동 감지한다.',
      },
      output_dir: {
        type: 'string',
        description: '이미지 저장 디렉토리 경로 (예: src/assets/images)',
      },
      scale: {
        type: 'number',
        description: 'export 배율 (기본: 2, Retina 대응)',
      },
      cache_dir: {
        type: 'string',
        description: '캐시 디렉토리 (기본: /tmp/figma-cache/{fileKey}/assets)',
      },
    },
    required: ['file_key', 'output_dir'],
  },
} as const;

/** get_design_context 캐시 항목 */
interface DesignContextEntry {
  nodeId: string;
  nodeName?: string;
  data: Record<string, unknown>;
}

export interface ExportImagesInput {
  file_key: string;
  node_ids?: string[];
  extracted_nodes?: ExtractedNode[];
  design_context_json?: DesignContextEntry[];
  output_dir: string;
  scale?: number;
  cache_dir?: string;
}

/** 노드 트리에서 IMAGE fill이 있는 노드를 재귀적으로 찾는다 (ExtractedNode용) */
function findImageFillNodes(
  node: ExtractedNode,
  result: Array<{ nodeId: string; nodeName: string; fill: Paint; size: { width: number; height: number } }> = []
): typeof result {
  if (node.fills) {
    for (const fill of node.fills) {
      if (fill.type === 'IMAGE' && fill.visible !== false) {
        result.push({
          nodeId: node.id,
          nodeName: node.name,
          fill,
          size: node.size,
        });
        break; // 한 노드에서 첫 번째 IMAGE fill만 처리
      }
    }
  }

  for (const child of node.children) {
    findImageFillNodes(child, result);
  }

  return result;
}

/** design_context JSON에서 IMAGE fill 노드를 재귀적으로 찾는다 */
function findImageFillsFromDesignContext(
  entries: DesignContextEntry[]
): Array<{ nodeId: string; nodeName: string; scaleMode: string; size: { width: number; height: number } }> {
  const results: Array<{ nodeId: string; nodeName: string; scaleMode: string; size: { width: number; height: number } }> = [];

  for (const entry of entries) {
    searchNode(entry.nodeId, entry.nodeName ?? entry.nodeId, entry.data);
  }

  /** 재귀적으로 노드 데이터에서 IMAGE fill을 찾는다 */
  function searchNode(nodeId: string, nodeName: string, data: Record<string, unknown>) {
    // fills 배열 확인
    const fills = data.fills as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(fills)) {
      for (const fill of fills) {
        if (fill.type === 'IMAGE' && fill.visible !== false) {
          const bbox = data.absoluteBoundingBox as { width?: number; height?: number } | undefined;
          results.push({
            nodeId,
            nodeName,
            scaleMode: (fill.scaleMode as string) ?? 'FILL',
            size: {
              width: bbox?.width ?? (data.width as number) ?? 0,
              height: bbox?.height ?? (data.height as number) ?? 0,
            },
          });
          break;
        }
      }
    }

    // children 재귀
    const children = data.children as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(children)) {
      for (const child of children) {
        const childId = (child.id as string) ?? nodeId;
        const childName = (child.name as string) ?? childId;
        searchNode(childId, childName, child);
      }
    }
  }

  return results;
}

/** 노드 ID를 파일명에 안전한 문자열로 변환한다 */
function sanitizeNodeId(nodeId: string): string {
  return nodeId.replace(/[^a-zA-Z0-9]/g, '-');
}

/** export_images 도구를 실행한다 */
export async function executeExportImages(
  input: ExportImagesInput,
  client: FigmaClient
): Promise<{
  exported: ImageFillExport[];
  skipped: Array<{ nodeId: string; reason: string }>;
  summary: string;
}> {
  const { file_key, output_dir, scale } = input;
  const cacheDir = input.cache_dir ?? `/tmp/figma-cache/${file_key}/assets`;

  // 1. IMAGE fill 노드 목록 결정 (3가지 입력 경로)
  let targetNodeIds: string[] = input.node_ids?.filter(id => id.length > 0) ?? [];
  const nodeMetaMap = new Map<string, { name: string; scaleMode: string; size: { width: number; height: number } }>();

  // 경로 A: node_ids가 명시적으로 주어진 경우 — 그대로 사용
  if (targetNodeIds.length > 0) {
    // nodeMetaMap은 비어있음 — 반환값에서 nodeName/scaleMode가 nodeId로 폴백됨
  }
  // 경로 B: design_context_json에서 자동 감지 (implement-figma 흐름)
  else if (input.design_context_json && input.design_context_json.length > 0) {
    const found = findImageFillsFromDesignContext(input.design_context_json);
    targetNodeIds = found.map(n => n.nodeId);
    for (const n of found) {
      nodeMetaMap.set(n.nodeId, { name: n.nodeName, scaleMode: n.scaleMode, size: n.size });
    }
  }
  // 경로 C: extracted_nodes에서 자동 감지 (extract_layers 흐름)
  else if (input.extracted_nodes && input.extracted_nodes.length > 0) {
    const imageFillNodes: Array<{ nodeId: string; nodeName: string; fill: Paint; size: { width: number; height: number } }> = [];
    for (const node of input.extracted_nodes) {
      findImageFillNodes(node, imageFillNodes);
    }
    targetNodeIds = imageFillNodes.map(n => n.nodeId);
    for (const n of imageFillNodes) {
      nodeMetaMap.set(n.nodeId, {
        name: n.nodeName,
        scaleMode: (n.fill.scaleMode as string) ?? 'FILL',
        size: n.size,
      });
    }
  }

  if (targetNodeIds.length === 0) {
    return {
      exported: [],
      skipped: [],
      summary: 'IMAGE fill 노드가 없습니다.',
    };
  }

  // 2. 디렉토리 생성
  await mkdir(output_dir, { recursive: true });
  await mkdir(cacheDir, { recursive: true });

  // 3. Figma API로 PNG export URL 획득 + 다운로드
  const exported: ImageFillExport[] = [];
  const skipped: Array<{ nodeId: string; reason: string }> = [];

  let downloadResults: Record<string, { url: string; buffer: Buffer }>;
  try {
    downloadResults = await client.exportAndDownloadPngs(file_key, targetNodeIds, { scale });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      exported: [],
      skipped: targetNodeIds.map(id => ({ nodeId: id, reason: `API 호출 실패: ${message}` })),
      summary: `Figma API 호출 실패: ${message}`,
    };
  }

  // 4. 각 노드의 PNG를 캐시 + 출력 디렉토리에 저장
  for (const nodeId of targetNodeIds) {
    const downloadResult = downloadResults[nodeId];
    if (!downloadResult || !downloadResult.buffer.length) {
      skipped.push({ nodeId, reason: 'Figma API가 이미지 URL을 반환하지 않았거나 다운로드 실패' });
      continue;
    }

    const safeName = sanitizeNodeId(nodeId);
    const fileName = `${safeName}.png`;
    const cachePath = join(cacheDir, fileName);
    const outputPath = join(output_dir, fileName);

    try {
      // 캐시에 저장 (다른 agent/verify에서 재사용)
      await writeFile(cachePath, downloadResult.buffer);
      // 프로젝트 출력 디렉토리에 저장
      await writeFile(outputPath, downloadResult.buffer);

      const meta = nodeMetaMap.get(nodeId);
      exported.push({
        nodeId,
        nodeName: meta?.name ?? nodeId,
        scaleMode: (meta?.scaleMode as 'FILL' | 'FIT' | 'CROP' | 'TILE') ?? 'FILL',
        exportUrl: downloadResult.url,
        savedPath: outputPath,
        size: meta?.size ?? { width: 0, height: 0 },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      skipped.push({ nodeId, reason: `파일 저장 실패: ${message}` });
    }
  }

  const summary = [
    `IMAGE fill export 완료: ${exported.length}개 성공, ${skipped.length}개 실패`,
    ...exported.map(e => `  ✅ ${e.nodeName} (${e.nodeId}) → ${basename(e.savedPath)} [${e.scaleMode}]`),
    ...skipped.map(s => `  ❌ ${s.nodeId}: ${s.reason}`),
  ].join('\n');

  return { exported, skipped, summary };
}
