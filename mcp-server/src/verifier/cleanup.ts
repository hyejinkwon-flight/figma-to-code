// 검증 완료 후 임시 파일 정리
import { rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 스크린샷 디렉토리 내 임시 파일을 정리한다 */
export function cleanupScreenshots(screenshotDir: string): { removed: string[]; errors: string[] } {
  const removed: string[] = [];
  const errors: string[] = [];

  if (!existsSync(screenshotDir)) return { removed, errors };

  try {
    const files = readdirSync(screenshotDir);
    for (const file of files) {
      const filePath = join(screenshotDir, file);
      // 스크린샷/diff 이미지만 삭제 (PNG 파일)
      if (file.endsWith('.png') && isVerificationTempFile(file)) {
        try {
          rmSync(filePath);
          removed.push(filePath);
        } catch (err) {
          errors.push(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // 디렉토리가 비었으면 디렉토리도 삭제
    const remaining = readdirSync(screenshotDir);
    if (remaining.length === 0) {
      rmSync(screenshotDir, { recursive: true });
      removed.push(screenshotDir);
    }
  } catch (err) {
    errors.push(`디렉토리 읽기 실패: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { removed, errors };
}

/** 검증 과정에서 생성된 임시 파일인지 확인한다 */
function isVerificationTempFile(fileName: string): boolean {
  return (
    fileName.startsWith('figma-') ||
    fileName.startsWith('rendering-') ||
    fileName.startsWith('diff-')
  );
}

/** 검증 완료 후 모든 임시 리소스를 정리한다 */
export function cleanupAll(screenshotDir: string): string {
  const { removed, errors } = cleanupScreenshots(screenshotDir);

  const lines: string[] = ['[정리] 임시 파일 정리 완료'];
  if (removed.length > 0) {
    lines.push(`  삭제: ${removed.length}개 파일`);
  }
  if (errors.length > 0) {
    lines.push(`  오류: ${errors.length}개`);
    for (const err of errors) {
      lines.push(`    - ${err}`);
    }
  }
  if (removed.length === 0 && errors.length === 0) {
    lines.push('  정리할 파일 없음');
  }

  return lines.join('\n');
}
