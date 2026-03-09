# verify-figma Skill

Figma 디자인 구현 결과를 렌더링 기반으로 검증하고 자동 수정하는 Claude Code 스킬.
99% 이상 정확도를 달성할 때까지 반복 검증 및 자동 수정을 수행합니다.

## 사용법

```bash
# implement-figma로 구현한 전체 노드 검증
/verify-figma

# 특정 노드만 검증
/verify-figma 1:2 3336:27168

# 수동 스크린샷으로 검증 (Playwright 캡처 불가 시)
/verify-figma --screenshot /path/to/screenshot.png
```

## 파일 구성

| 파일 | 역할 | 업데이트 시 |
|------|------|------------|
| `SKILL.md` | 스킬 실행 로직 (Phase V0~V7) | 덮어쓰기 |
| `rules.md` | 공통 검증 규칙 (허용 오차, 검증 카테고리 등) | 덮어쓰기 |
| `config.md` | 프로젝트별 설정 (렌더링 환경, 임계값 등) | **보존** |

## 실행 흐름

```
Phase V0: 렌더링 환경 확인
  ├── MCP 서버 확인 (Figma, Playwright, figma-to-code)
  ├── 렌더링 서버 확인 (Storybook 또는 Vite dev)
  └── 스크린샷 디렉토리 준비 (/tmp/figma-verify/)
      ↓
Phase V1: 스크린샷 캡처 & 픽셀 비교
  ├── Figma MCP → get_screenshot → figma-{nodeId}-r{round}.png (항상 자동)
  ├── 렌더링 스크린샷 캡처
  │     ├── 1순위: Playwright 자동 캡처
  │     └── 2순위: 수동 스크린샷 (--screenshot 또는 자동 캡처 실패 시)
  ├── pixelmatch → diff 이미지 생성 + 불일치율(%) 계산
  └── Figma 스크린샷에서 모든 UI 요소 개별 나열
      ↓
Phase V2: 요소별 검증 (9개 카테고리)
  ├── get_design_context → figmaProps 수집 (수치 기준)
  ├── 렌더링 스크린샷 → renderedProps 수집 (시각 기준)
  └── 요소별 9개 카테고리 pass/fail 판정
      ↓
Phase V3: 에셋 & 코드 품질 검사
  ├── 3-1. 에셋 검증 (SVG 다운로드, 참조, 유효성, 원본 보존)
  ├── 3-2. 코드 레벨 검증 (tsc, lint, build, import)
  └── 3-3. 토큰/품질 (hex 하드코딩 금지, DOM depth, 절대배치 확인)
      ↓
Phase V4: 커버리지 계산 & 검증 테이블 출력
  ├── 정확도 = (pass / total) × 100
  ├── 에셋 미비 시 최대 90%로 제한
  ├── 검증 테이블 출력 (아래 참조)
  └── 분기: ≥99% → Phase V6 / <99% → Phase V5
      ↓
Phase V5: 자동 수정 루프 (99% 미만 시 사용자 확인 없이 진행)
  ├── 14단계 수정 순서:
  │     1. 누락 요소 → 2. 배치 → 3. 간격 → 4. 크기 → 5. 색상
  │     → 6. 타이포 → 7. 테두리/효과 → 8. 아이콘 (SVG 재export)
  │     → 9. 에셋 미다운로드 → 10. 토큰 하드코딩
  │     → 11. 타입 에러 → 12. lint 에러 → 13. 빌드 에러 → 14. import 에러
  ├── 수동 스크린샷 사용 시: 수정 후에는 Playwright 자동 캡처로 전환
  └── V1~V4 반복 (최대 5라운드)
      ↓
Phase V6: 최종 렌더링 확인 (99% 달성 후에도 실행)
  ├── 모든 노드 렌더링 스크린샷 재촬영
  ├── Figma 스크린샷과 비교 + 픽셀 diff
  └── 시각적 차이 존재 시 → Phase V5로 복귀
      ↓
Phase V7: 정리
  ├── cleanup_verification 호출
  ├── 임시 스크린샷 삭제 (figma-*, rendering-*, diff-*)
  └── /tmp/figma-verify/ 디렉토리 정리
```

## 검증 시스템

### Layer 0: 콘텐츠 충실도 검증

Figma의 콘텐츠가 그대로 반영되었는지 확인합니다.

- **텍스트** → Figma TEXT 노드의 `characters` 값과 렌더링 텍스트 정확 일치 (placeholder 금지)
- **텍스트 스타일** → TEXT 노드의 `fills`(= 폰트 색상), `fontSize`, `fontWeight`, `lineHeight`이 렌더링에 정확히 반영되었는지 확인. 기본값(black)으로 렌더링되었는데 Figma 색상이 다르면 FAIL
- **이미지** → IMAGE fill 노드의 이미지가 Figma에서 export되어 렌더링에 표시되는지 확인
- **배경색/그라데이션** → `get_design_context` fills 속성과 렌더링 결과 일치
- **opacity** → 정확 반영 여부

### Layer 1: 픽셀 비교 (Pixel Diff)

`pixelmatch` 라이브러리로 Figma 스크린샷과 렌더링 스크린샷을 픽셀 단위로 비교합니다.

- **임계값**: config.md의 `pixel_diff_threshold` (기본값 0.1)
- **통과 기준**: config.md의 `pixel_diff_pass_percentage` (기본값 5%)
- **출력**: 차이점을 빨간색으로 표시한 diff 이미지

### Layer 2: 요소별 검증 (9개 카테고리)

**Figma 스크린샷 + `get_design_context`** 두 가지를 모두 사용하여 검증합니다.
- Figma 스크린샷: 시각적 참조 (요소 존재 여부, 아이콘 일치)
- `get_design_context`: 정확한 수치 (간격, 크기, 색상 등)

| 카테고리 | 검증 내용 | 허용 오차 |
|----------|----------|-----------|
| 존재 (existence) | 요소가 렌더링에 존재하는지 | - |
| 배치 (layout) | flex-direction, alignItems, justifyContent | 정확 일치 |
| 간격 (spacing) | padding, gap, margin | ±1px |
| 크기 (size) | width, height | ±2px |
| 색상 (color) | background, text, border 색상 | 정확 일치 |
| 타이포그래피 (typography) | font-size, fontWeight, lineHeight | 정확 일치 |
| 테두리 (border) | width, radius, style — `strokeDashes` 기준으로 solid/dashed/dotted 판정 | 정확 일치 |
| 효과 (effect) | shadow, opacity | 정확 일치 |
| 아이콘 (icon) | Figma export 원본 SVG와 동일한 아이콘 | 렌더링 스크린샷 기준 |

### 선 / 구분선 검증 규칙

**A. stroke 기반 노드** (LINE, VECTOR, strokes가 있는 FRAME):
- `strokeDashes: []` 또는 없음 → solid 확인
- `strokeDashes: [값, 값]` → dashed/dotted 확인
- 스크린샷만 보고 추측하지 않음

**B. fills 기반 노드** (FRAME/RECTANGLE, strokes 없음, fills만 있음):
- `bg-{color}`로 구현되었는지 확인
- fills만 있는 노드에 `border-dashed/dotted/solid`가 사용되면 FAIL

### Layer 3: SVG/에셋 검증

- Figma REST API에서 export한 원본 SVG가 프로젝트에 존재하는지 확인
- SVG의 viewBox, fill, stroke, path 등 속성이 보존되어 있는지 확인
- **SVG fill 속성 렌더링 검증**: SVG 내 `fill`, `stroke` 값이 렌더링에서 정확히 표시되는지 확인. `fill="none"` SVG가 `<img>`로 로드되어 색상 미표시 시 FAIL. `fill="currentColor"` SVG의 부모 `text-color` 확인
- import/src 경로 참조 정확성
- SVG 유효성 (`<svg>...</svg>` 구조 검사)
- 아이콘 라이브러리(lucide, heroicons 등) 대체 금지
- **SVG 직접 구현 금지**: JSX에 `<svg>/<path>/<circle>` 직접 작성, CSS border/background로 아이콘 형태를 흉내낸 것 모두 FAIL 처리
- 이미지 파일 크기 > 0 확인
- 에셋 미비 시 정확도 최대 90%로 제한

### Layer 4: 코드 레벨 검증

- TypeScript 타입 검사 통과 (`npx tsc --noEmit` 또는 config.md의 typecheck 명령)
- lint 규칙 통과 (config.md의 lint 명령)
- 빌드 에러 없음 (config.md의 build 명령)
- import 경로가 실제 파일을 가리키는지 확인
- 미사용 import/변수 없음 확인
- 절대 배치 노드의 position/constraints 적용 여부 확인

## 검증 테이블 출력 형식

매 라운드마다 아래 형식의 검증 테이블을 출력합니다.

```
[검증 테이블] 라운드 {ROUND} — 노드: {NODE_NAME}
검증 방법: Figma 스크린샷 vs 렌더링 스크린샷 ({CAPTURE_METHOD})
픽셀 diff: {MISMATCH}% 불일치 (diff 이미지: {DIFF_PATH})

| # | 요소     | 존재 | 배치 | 간격 | 크기 | 색상 | 타이포 | 테두리 | 효과 | 아이콘 | pass/total |
|---|----------|------|------|------|------|------|--------|--------|------|--------|------------|
| 1 | X 닫기   | ✓    | ✓    | -    | ✓    | ✓    | -      | -      | -    | -      | 4/4        |
| 2 | 구분선   | ✗    | -    | -    | -    | -    | -      | -      | -    | -      | 0/1        |
| 합계 |       |      |      |      |      |      |        |        |      |        | 4/5        |

[에셋 검증] ✅ 아이콘 3/3, 이미지 0/0
[토큰/품질] fail 0개
[코드 레벨] tsc ✓, lint ✓, build ✓

정확도: 80.0% (4/5) — 99% 미만, 자동 수정 진행
```

## 종료 조건

### 성공 (정상 종료)

```
[완료] 정확도 {ACCURACY}% ({PASS}/{TOTAL}) — 목표 달성
[완료] 렌더링 최종 확인 통과 ✓
[완료] 임시 파일 정리 완료 ({CLEANED_COUNT}개 삭제)
검증 라운드: {ROUND}회
총 수정: {TOTAL_FIXED}개
```

### 폴백 (최대 5라운드 도달)

사용자에게 선택지 제시:
1. 계속 수정 (5라운드 추가)
2. 실패 항목만 수동 수정
3. 현재 상태로 완료

### 수정 불가 항목 (3라운드 이상 동일 실패)

- 분모에서 제외 처리
- 전체의 5% 초과 시 사용자에게 경고

## ⛔ 절대 규칙

1. 정확도 99% 미만에서 검증을 종료하지 않는다
2. 코드만 보고 "시각적으로 일치한다"고 판정하지 않는다 — 렌더링 스크린샷이 최종 판단 기준이다
3. 렌더링 스크린샷 없이 시각적 검증을 통과시키지 않는다
4. 노드 단위로 뭉뚱그려 검증하지 않는다 — 모든 UI 요소를 개별 나열한다
5. 추출 데이터를 자기 자신과 비교하여 검증하지 않는다
6. Figma 스크린샷은 Figma MCP `get_screenshot`으로 자동 캡처한다 (수동 불가)
7. 99% 미만이면 모든 fail을 수정하고 재검증한다 — 일부만 수정하고 건너뛰지 않는다

## 사용하는 MCP 도구

| 도구 | 출처 | 용도 |
|------|------|------|
| `get_screenshot` | Figma MCP | Figma 디자인 스크린샷 캡처 |
| `get_design_context` | Figma MCP | 요소별 디자인 속성 추출 |
| `browser_navigate` | Playwright MCP | 렌더링 페이지 이동 |
| `browser_take_screenshot` | Playwright MCP | 렌더링 결과 스크린샷 캡처 |
| `verify_pixel_diff` | figma-to-code MCP | 픽셀 단위 이미지 비교 |
| `verify_elements` | figma-to-code MCP | 9개 카테고리 요소 검증 |
| `verify_assets` | figma-to-code MCP | 에셋 다운로드/참조 검증 |
| `calculate_coverage` | figma-to-code MCP | 전체 정확도 계산 |
| `cleanup_verification` | figma-to-code MCP | 임시 파일 정리 |

## MCP 서버 소스 (mcp-server/)

스킬이 사용하는 figma-to-code MCP 서버의 검증 관련 구조입니다.

```
mcp-server/src/verifier/
├── pixel-diff-verifier.ts  # pixelmatch 기반 스크린샷 비교
│                             normalizeImageSizes (sharp로 리사이징)
│                             compareScreenshots → PixelDiffResult
├── element-verifier.ts     # 9개 카테고리 요소별 검증
│                             checkExistence, checkLayout, checkSpacing,
│                             checkSize, checkColor, checkTypography,
│                             checkBorder, checkEffect, checkIcon
│                             verifyAllElements → ElementVerificationReport
│                             formatVerificationTable → 마크다운 테이블
├── asset-verifier.ts       # 에셋 검증 (downloaded, correctRef, rendered)
│                             verifyAsset, verifyAllAssets → AssetVerificationReport
├── coverage-calculator.ts  # 커버리지 종합 계산
│                             calculateCoverage → CoverageReport
│                             buildRecommendations (카테고리별 수정 제안)
├── screenshot-capture.ts   # 스크린샷 캡처 요청 구조화
│                             buildStorybookUrl, buildViteDevUrl,
│                             getScreenshotPaths, buildCaptureInstructions
└── cleanup.ts              # 임시 파일 정리
                              cleanupScreenshots, cleanupAll
```

### 허용 오차 (element-verifier.ts)

| 카테고리 | 허용 오차 |
|----------|-----------|
| spacing (padding, gap) | ±1px |
| size (width, height) | ±2px |
| 나머지 (color, typography, border 등) | 정확 일치 |

## config.md 설정 항목

프로젝트별로 커스터마이징할 수 있는 항목:

```markdown
## 허용 오차
- spacing: ±1px
- size: ±2px
- color: 정확 일치
- font-size: 정확 일치
- border-radius: 정확 일치

## 렌더링 환경
- storybook_url: http://localhost:6006
- vite_dev_url: http://localhost:5173
- default_viewport: 390x844
- screenshot_dir: /tmp/figma-verify
- pixel_diff_threshold: 0.1
- pixel_diff_pass_percentage: 5

## 검증 제외 항목
- 애니메이션/트랜지션
- Hover/Active 상태
- 반응형 레이아웃 (별도 지정 시)

## 빌드/린트 명령어
- lint: npm run lint
- typecheck: npx tsc --noEmit
- build: npm run build
```
