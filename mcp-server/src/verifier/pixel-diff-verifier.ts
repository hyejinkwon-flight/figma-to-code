// 픽셀 diff 검증기 — pixelmatch 기반 두 스크린샷 비교
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';
import type { PixelDiffResult } from '../types.js';

export interface PixelDiffOptions {
  /** 픽셀 색상 차이 허용 임계값 (0~1, 기본: 0.1) */
  threshold?: number;
  /** mismatch 비율이 이 값 이하면 pass (기본: 5%) */
  passPercentage?: number;
}

/** 두 이미지를 동일 크기로 리사이즈한다 */
async function normalizeImageSizes(
  imgAPath: string,
  imgBPath: string
): Promise<{ imgA: PNG; imgB: PNG }> {
  const metaA = await sharp(imgAPath).metadata();
  const metaB = await sharp(imgBPath).metadata();

  const targetWidth = Math.min(metaA.width ?? 0, metaB.width ?? 0);
  const targetHeight = Math.min(metaA.height ?? 0, metaB.height ?? 0);

  if (targetWidth === 0 || targetHeight === 0) {
    throw new Error('이미지 크기를 읽을 수 없습니다');
  }

  const bufA = await sharp(imgAPath)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  const bufB = await sharp(imgBPath)
    .resize(targetWidth, targetHeight, { fit: 'fill' })
    .png()
    .toBuffer();

  return {
    imgA: PNG.sync.read(bufA),
    imgB: PNG.sync.read(bufB),
  };
}

/** 두 스크린샷의 픽셀 diff를 수행하고 diff 이미지를 생성한다 */
export async function compareScreenshots(
  figmaScreenshotPath: string,
  renderingScreenshotPath: string,
  diffOutputPath: string,
  options: PixelDiffOptions = {}
): Promise<PixelDiffResult> {
  const threshold = options.threshold ?? 0.1;
  const passPercentage = options.passPercentage ?? 5;

  const { imgA, imgB } = await normalizeImageSizes(
    figmaScreenshotPath,
    renderingScreenshotPath
  );

  const { width, height } = imgA;
  const diff = new PNG({ width, height });

  const mismatchedPixels = pixelmatch(
    imgA.data,
    imgB.data,
    diff.data,
    width,
    height,
    { threshold }
  );

  const totalPixels = width * height;
  const mismatchPercentage = totalPixels > 0
    ? (mismatchedPixels / totalPixels) * 100
    : 0;

  // diff 이미지 저장
  mkdirSync(dirname(diffOutputPath), { recursive: true });
  writeFileSync(diffOutputPath, PNG.sync.write(diff));

  return {
    mismatchedPixels,
    totalPixels,
    mismatchPercentage: Math.round(mismatchPercentage * 100) / 100,
    diffImagePath: diffOutputPath,
    passed: mismatchPercentage <= passPercentage,
  };
}

/** 픽셀 diff 결과를 사람이 읽기 좋은 문자열로 포매팅한다 */
export function formatPixelDiffResult(result: PixelDiffResult): string {
  const status = result.passed ? '✅ PASS' : '❌ FAIL';
  return [
    `[픽셀 diff] ${status}`,
    `  불일치: ${result.mismatchPercentage}% (${result.mismatchedPixels.toLocaleString()}/${result.totalPixels.toLocaleString()} 픽셀)`,
    `  diff 이미지: ${result.diffImagePath}`,
  ].join('\n');
}
