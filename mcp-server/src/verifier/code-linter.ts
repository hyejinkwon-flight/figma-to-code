// 생성된 코드의 정적 린트 검증
// Hook(lint-generated.sh)이 Write/Edit 시점에 패턴을 검출하고,
// 이 모듈은 MCP tool로 더 정밀한 검증(SVG fill + import 방식, 에셋 존재 등)을 수행한다.

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

export interface LintViolation {
  rule: string;
  severity: 'error' | 'warning';
  line: number;
  message: string;
  suggestion?: string;
}

export interface LintResult {
  filePath: string;
  violations: LintViolation[];
  passed: boolean;
}

/** 생성된 코드 파일을 린트한다 */
export function lintGeneratedCode(filePath: string): LintResult {
  if (!existsSync(filePath)) {
    return {
      filePath,
      violations: [{
        rule: 'file-exists',
        severity: 'error',
        line: 0,
        message: `파일이 존재하지 않습니다: ${filePath}`,
      }],
      passed: false,
    };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: LintViolation[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Rule: no-hardcoded-hex — style 객체 내 hex/rgb 하드코딩
    if (/color:\s*['"]?#[0-9a-fA-F]{3,8}\b/.test(line) ||
        /background:\s*['"]?#[0-9a-fA-F]{3,8}\b/.test(line) ||
        /:\s*['"]#[0-9a-fA-F]{3,8}\b/.test(line) ||
        /rgb\(\s*\d/.test(line)) {
      // Tailwind 임의값 bg-[#xxx]은 제외
      if (!/className.*\[#/.test(line)) {
        violations.push({
          rule: 'no-hardcoded-hex',
          severity: 'error',
          line: lineNum,
          message: `hex/rgb 하드코딩 — Tailwind 토큰을 사용하세요`,
          suggestion: 'bg-{color}, text-{color} 등 Tailwind 토큰 클래스로 변환',
        });
      }
    }

    // Rule: no-inline-svg — JSX 내 SVG 태그 직접 작성
    if (/<svg[\s>]/.test(line) || /<path\s/.test(line) || /<circle\s/.test(line) ||
        /<rect\s/.test(line) || /<polygon\s/.test(line) || /<ellipse\s/.test(line)) {
      if (!/import|require|from/.test(line)) {
        violations.push({
          rule: 'no-inline-svg',
          severity: 'error',
          line: lineNum,
          message: `SVG를 JSX에 직접 작성 — Figma export SVG 파일을 import하세요`,
        });
      }
    }

    // Rule: no-icon-library — 아이콘 라이브러리 import
    if (/from\s+['"].*(?:lucide|heroicons|react-icons|@fortawesome|ionicons|feather-icons)/.test(line)) {
      violations.push({
        rule: 'no-icon-library',
        severity: 'error',
        line: lineNum,
        message: `아이콘 라이브러리 import 금지 — Figma에서 SVG를 export하세요`,
      });
    }

    // Rule: no-external-placeholder — 외부 placeholder 이미지
    if (/placeholder\.com|unsplash\.com|picsum\.photos|via\.placeholder|placehold\.co|lorempixel/.test(line)) {
      violations.push({
        rule: 'no-external-placeholder',
        severity: 'error',
        line: lineNum,
        message: `외부 placeholder 이미지 URL — Figma에서 이미지를 export하세요`,
      });
    }

    // Rule: no-placeholder-text
    if (/Lorem ipsum|dolor sit amet|placeholder text/i.test(line)) {
      violations.push({
        rule: 'no-placeholder-text',
        severity: 'error',
        line: lineNum,
        message: `placeholder 텍스트 — Figma의 원본 텍스트를 사용하세요`,
      });
    }
  }

  return {
    filePath,
    violations,
    passed: violations.length === 0,
  };
}

/** SVG fill 속성과 코드의 import 방식이 일치하는지 검증한다 */
export function lintSvgFillUsage(
  svgFilePath: string,
  codeFilePath: string,
  svgImportName: string,
  figmaFillHex?: string,
): LintViolation[] {
  const violations: LintViolation[] = [];

  if (!existsSync(svgFilePath)) {
    violations.push({
      rule: 'svg-file-exists',
      severity: 'error',
      line: 0,
      message: `SVG 파일이 존재하지 않습니다: ${svgFilePath}`,
    });
    return violations;
  }

  if (!existsSync(codeFilePath)) {
    return violations;
  }

  const svgContent = readFileSync(svgFilePath, 'utf-8');
  const codeContent = readFileSync(codeFilePath, 'utf-8');
  const codeLines = codeContent.split('\n');

  // SVG fill 속성 분석
  const hasFillNone = /fill\s*=\s*["']none["']/.test(svgContent) && !/fill\s*=\s*["'](?!none)[^"']+["']/.test(svgContent);
  const hasFillCurrentColor = /fill\s*=\s*["']currentColor["']/.test(svgContent);

  // SVG에서 고정 fill hex 추출
  const fixedFillMatch = svgContent.match(/fill\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/);
  const svgFillHex = fixedFillMatch ? fixedFillMatch[1].toLowerCase() : null;

  // 코드에서 <img src={svgImportName}> 패턴 찾기
  const imgUsageRegex = new RegExp(`<img[^>]*src=\\{${svgImportName}\\}`, 'g');

  if (hasFillNone || hasFillCurrentColor) {
    // fill="none" 또는 fill="currentColor" SVG를 <img>로 사용하면 색상이 안 보임
    for (let i = 0; i < codeLines.length; i++) {
      if (imgUsageRegex.test(codeLines[i])) {
        const fillType = hasFillNone ? 'fill="none"' : 'fill="currentColor"';
        violations.push({
          rule: 'svg-fill-import-mismatch',
          severity: 'error',
          line: i + 1,
          message: `${fillType} SVG를 <img>로 사용하면 색상이 표시되지 않습니다`,
          suggestion: '인라인 SVG 또는 React SVG 컴포넌트로 변경하세요',
        });
      }
    }
  }

  if (hasFillCurrentColor) {
    // fill="currentColor" SVG의 부모에 text-{color}가 있는지 확인
    for (let i = 0; i < codeLines.length; i++) {
      if (codeLines[i].includes(svgImportName) && !codeLines[i].includes('import')) {
        // 주변 5줄 내에 text-{color} 클래스가 있는지 확인
        const context = codeLines.slice(Math.max(0, i - 5), i + 5).join('\n');
        if (!/text-[a-z]+-\d+|text-black|text-white|text-current/.test(context)) {
          violations.push({
            rule: 'svg-currentcolor-no-parent-color',
            severity: 'warning',
            line: i + 1,
            message: `fill="currentColor" SVG의 부모에 text-{color}가 없습니다`,
            suggestion: '부모 요소에 text-gray-500 등 색상 클래스를 추가하세요',
          });
        }
      }
    }
  }

  // Figma fill 색상과 SVG fill hex 대조
  if (figmaFillHex && svgFillHex) {
    if (svgFillHex !== figmaFillHex.toLowerCase()) {
      violations.push({
        rule: 'svg-fill-color-mismatch',
        severity: 'warning',
        line: 0,
        message: `SVG fill 색상(${svgFillHex})이 Figma 디자인 색상(${figmaFillHex})과 불일치`,
        suggestion: `SVG fill을 ${figmaFillHex}로 수정하거나 Figma에서 재export 하세요`,
      });
    }
  }

  return violations;
}

/** 에셋 import 경로가 실제 파일을 가리키는지 검증한다 */
export function lintAssetImports(codeFilePath: string): LintViolation[] {
  if (!existsSync(codeFilePath)) return [];

  const content = readFileSync(codeFilePath, 'utf-8');
  const lines = content.split('\n');
  const violations: LintViolation[] = [];
  const codeDir = dirname(codeFilePath);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // import ... from './path/to/file.svg' 또는 .png, .jpg
    const match = line.match(/from\s+['"]([^'"]+\.(?:svg|png|jpg|jpeg|gif|webp))['"]/) ||
                  line.match(/import\s+['"]([^'"]+\.(?:svg|png|jpg|jpeg|gif|webp))['"]/) ||
                  line.match(/require\(['"]([^'"]+\.(?:svg|png|jpg|jpeg|gif|webp))['"]\)/);

    if (match) {
      const importPath = match[1];
      // 상대 경로만 검사 (@ alias는 프로젝트 설정에 따라 다름)
      if (importPath.startsWith('.')) {
        const resolved = resolve(codeDir, importPath);
        if (!existsSync(resolved)) {
          violations.push({
            rule: 'asset-import-missing',
            severity: 'error',
            line: i + 1,
            message: `에셋 파일이 존재하지 않습니다: ${importPath}`,
            suggestion: `Figma REST API에서 에셋을 export하여 ${resolved}에 저장하세요`,
          });
        }
      }
    }
  }

  return violations;
}

/** 린트 결과를 마크다운 테이블로 포맷한다 */
export function formatLintResult(result: LintResult): string {
  if (result.passed) {
    return `✅ ${result.filePath}: 위반 없음`;
  }

  const lines: string[] = [];
  lines.push(`❌ ${result.filePath}: ${result.violations.length}개 위반`);
  lines.push('');
  lines.push('| # | Rule | Line | Message | Suggestion |');
  lines.push('|---|------|------|---------|------------|');

  result.violations.forEach((v, idx) => {
    lines.push(`| ${idx + 1} | ${v.rule} | ${v.line} | ${v.message} | ${v.suggestion ?? '-'} |`);
  });

  return lines.join('\n');
}
