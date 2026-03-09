// MCP 서버 설정 및 Tool 등록
import { FigmaClient } from './figma/client.js';
import { extractLayersToolDef, executeExtractLayers, type ExtractLayersInput } from './tools/extract-layers.js';
import { analyzeTreeToolDef, executeAnalyzeTree, type AnalyzeTreeInput } from './tools/analyze-tree.js';
import { generateComponentToolDef, executeGenerateComponent, type GenerateComponentInput } from './tools/generate-component.js';
import { generateStoryToolDef, executeGenerateStory, type GenerateStoryInput } from './tools/generate-story.js';
import {
  verifyPixelDiffToolDef,
  verifyElementsToolDef,
  verifyAssetsToolDef,
  calculateCoverageToolDef,
  cleanupVerificationToolDef,
  lintGeneratedCodeToolDef,
  executeVerifyPixelDiff,
  executeVerifyElements,
  executeVerifyAssets,
  executeCalculateCoverage,
  executeCleanupVerification,
  executeLintGeneratedCode,
} from './tools/verify-all.js';
import { runFullPipelineToolDef, executeFullPipeline } from './tools/run-full-pipeline.js';
import type { VerifyElement } from './verifier/element-verifier.js';
import type { AssetToVerify } from './verifier/asset-verifier.js';
import type { PixelDiffResult, ElementVerificationReport, AssetVerificationReport } from './types.js';

export interface ServerConfig {
  figmaToken: string;
  outputDir: string;
  storybookUrl?: string;
  styleSystem?: 'tailwind' | 'css-modules';
}

/** 모든 MCP Tool 정의 목록을 반환한다 */
export function getToolDefinitions() {
  return [
    extractLayersToolDef,
    analyzeTreeToolDef,
    generateComponentToolDef,
    generateStoryToolDef,
    verifyPixelDiffToolDef,
    verifyElementsToolDef,
    verifyAssetsToolDef,
    calculateCoverageToolDef,
    cleanupVerificationToolDef,
    lintGeneratedCodeToolDef,
    runFullPipelineToolDef,
  ];
}

/** Tool 이름으로 핸들러를 실행한다 */
export async function handleToolCall(
  toolName: string,
  args: Record<string, unknown>,
  config: ServerConfig
): Promise<unknown> {
  const client = new FigmaClient(config.figmaToken);

  switch (toolName) {
    case 'extract_layers':
      return executeExtractLayers(args as unknown as ExtractLayersInput, client);

    case 'analyze_tree':
      return executeAnalyzeTree(args as unknown as AnalyzeTreeInput);

    case 'generate_component':
      return executeGenerateComponent(args as unknown as GenerateComponentInput);

    case 'generate_story':
      return executeGenerateStory(args as unknown as GenerateStoryInput);

    case 'verify_pixel_diff':
      return executeVerifyPixelDiff(
        args.figma_screenshot_path as string,
        args.rendering_screenshot_path as string,
        args.diff_output_path as string,
        {
          threshold: args.threshold as number | undefined,
          passPercentage: args.pass_percentage as number | undefined,
        }
      );

    case 'verify_elements':
      return executeVerifyElements(
        args.node_id as string,
        args.node_name as string,
        args.elements as VerifyElement[],
        args.round as number,
        args.capture_method as string
      );

    case 'verify_assets':
      return executeVerifyAssets(
        args.node_id as string,
        args.assets as AssetToVerify[],
        args.generated_code_content as string
      );

    case 'calculate_coverage':
      return executeCalculateCoverage(
        args.pixel_diff as PixelDiffResult,
        args.element_report as ElementVerificationReport,
        args.asset_report as AssetVerificationReport
      );

    case 'cleanup_verification':
      return executeCleanupVerification(
        args.screenshot_dir as string
      );

    case 'lint_generated_code':
      return executeLintGeneratedCode(
        args.file_paths as string[],
        args.svg_checks as Array<{ svg_file_path: string; code_file_path: string; import_name: string }> | undefined
      );

    case 'run_full_pipeline': {
      const registry = args.component_registry as import('./types.js').ComponentRegistryEntry[] | undefined;
      return executeFullPipeline(client, {
        fileKey: args.file_key as string,
        nodeIds: args.node_ids as string[] ?? [],
        outputDir: args.output_dir as string ?? config.outputDir,
        renderingUrl: args.rendering_url as string ?? config.storybookUrl ?? 'http://localhost:6006',
        renderingType: args.rendering_type as 'storybook' | 'vite-dev' ?? 'storybook',
        targetCoverage: args.target_coverage as number,
        maxIterations: args.max_iterations as number,
        styleSystem: (args.style_system as 'tailwind' | 'css-modules') ?? config.styleSystem,
        screenshotDir: args.screenshot_dir as string,
        componentRegistry: registry,
      });
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
