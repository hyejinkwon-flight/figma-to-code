# Figma → Code 검증 규칙 (v4)

이 파일은 공통 검증 규칙입니다. 업데이트 시 덮어쓰기됩니다.
프로젝트별 커스터마이징은 config.md에서 합니다.

## ⛔ 절대 규칙

1. 정확도 99% 미만에서 검증을 종료하지 않는다
2. 코드만 보고 "시각적으로 일치한다"고 판정하지 않는다 — 렌더링 스크린샷이 최종 판단 기준이다
3. 렌더링 스크린샷 없이 시각적 검증을 통과시키지 않는다
4. 노드 단위로 뭉뚱그려 검증하지 않는다 — 모든 UI 요소를 개별 나열한다
5. 추출 데이터를 자기 자신과 비교하여 검증하지 않는다
6. Figma 스크린샷은 Figma MCP `get_screenshot`으로 자동 캡처한다 (수동 불가)
7. 99% 미만이면 모든 fail을 수정하고 재검증한다 — 일부만 수정하고 건너뛰지 않는다

## Figma MCP 캐시 규칙

Figma 원본은 세션 내 불변이다. 캐시 히트 시 MCP를 재호출하지 않는다.

| 규칙 | 설명 |
|------|------|
| 캐시 우선 | MCP 호출 전 `/tmp/figma-cache/{fileKey}/`에서 캐시 확인 |
| 스크린샷 1회 | `get_screenshot`은 라운드 1에서만 캡처, 이후 재사용 |
| 디자인 컨텍스트 재사용 | implement 캐시의 `get_design_context` 결과를 먼저 참조 |
| 드릴다운 허용 | 캐시에 없는 **하위 노드**는 신규 호출 → 캐시 추가 |
| 캐시 보존 | 검증 도중 `/tmp/figma-cache/` 삭제 금지 |

## 렌더링 검증 원칙

코드에 `flex-row`가 있어도 실제 렌더링에서 세로로 보일 수 있다.
**코드 검증 ≠ 시각적 검증이다.** 렌더링 스크린샷이 최종 판단 기준이다.

검증 흐름:
1. Figma 스크린샷 (`get_screenshot`) — 원본 디자인
2. 렌더링 스크린샷 (Playwright MCP 자동 캡처) — 실제 구현 결과
3. 픽셀 diff (`verify_pixel_diff`) — 불일치 영역 시각화
4. 세 가지를 종합하여 요소별 판정

### 스크린샷 캡처

**Figma 스크린샷**: `get_screenshot(fileKey, nodeId)` — 항상 자동 캡처

**렌더링 스크린샷** (우선순위):
1. **자동**: Playwright MCP `browser_navigate` + `browser_take_screenshot`
2. **수동 폴백**: 자동 캡처 실패 시 또는 `--screenshot <경로>` 명시 지정 시
   - `rendering-{nodeId}-r{round}.png`로 복사하여 사용
   - 검증 테이블에 `수동 스크린샷`으로 표기
   - 수정 루프(Phase V5) 진입 시에는 Playwright 자동 캡처로 전환 (수동은 첫 라운드만 유효)

### 임시 파일

- 저장 위치: `/tmp/figma-verify/` (config.md의 screenshot_dir)
- 파일명: `{type}-{nodeId}-r{round}.png` (figma/rendering/diff)
- 검증 중간에 삭제하지 않는다 — 이전 라운드 참조 가능
- 최종 완료 후 `cleanup_verification` 호출

## 요소 단위 검증

Figma 스크린샷에서 눈에 보이는 모든 요소를 개별 나열한다. 코드에서 나열하지 않는다.
"기타", "나머지"로 뭉뚱그리지 않는다.

반드시 개별 나열할 요소:
- 닫기(X) 버튼, 뒤로가기 버튼
- 구분선 (divider/separator)
- 각 리스트 아이템
- 아이콘, 배지, 태그
- 라디오/체크박스 + 라벨 조합

```
❌ 노드 "정렬 모달": 구조 100%, 속성 99%, 시각 N/A → 99.7%

✅ 요소 "X 닫기 버튼": 존재 ✗ → FAIL
✅ 요소 "라디오 아이콘": 아이콘 ✗ (잘못된 아이콘) → FAIL
✅ 요소 "카드 테두리": 테두리 ✗ (solid → dashed) → FAIL
   실제 정확도: 62%
```

## 콘텐츠 검증

### 텍스트

Figma TEXT 노드의 `characters` 값과 렌더링된 텍스트가 정확히 일치해야 한다.
placeholder("Lorem ipsum", "텍스트", "제목")나 의역/요약은 FAIL이다.

### 텍스트 스타일

TEXT 노드의 `fills` = 텍스트 색상이다. `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`가 `get_design_context` 속성과 일치해야 한다.

- 텍스트 색상이 기본 black인데 Figma에서는 다른 색상이면 FAIL
- "내용이 같으므로 pass"로 스타일 누락을 묵인하지 않는다

### 텍스트 속성 매핑

| Figma 속성 | 검증 대상 | FAIL 조건 |
|-----------|----------|----------|
| `textAlignHorizontal` CENTER/RIGHT/JUSTIFIED | 렌더링 텍스트 정렬 | 정렬 불일치 |
| `maxLines: N` | `line-clamp-{N}` + `overflow-hidden` | 누락 (hook Rule 8 자동 검출) |
| `textTruncation: "ENDING"` | `truncate` 클래스 | 말줄임 미적용 |
| `letterSpacing` ≠ 0 | `tracking-` 클래스 | 자간 미반영 |
| `textDecoration` | `underline` / `line-through` | 장식 미적용 |
| `characterStyleOverrides` | `<span>` 분리 + 개별 스타일 | 혼합 스타일을 단일 처리 |

### 이미지 / 배경

IMAGE fill이 있는 노드의 이미지가 Figma에서 export되어 프로젝트에 존재해야 한다.
렌더링 스크린샷에서 배경 이미지가 표시되어야 한다.
placeholder(빈 div, bg-gray, 외부 URL)는 FAIL이다.

### 이미지 scaleMode 매핑

| Figma scaleMode | 검증 대상 | FAIL 조건 |
|----------------|----------|----------|
| `FILL` | `object-cover` | 미적용 시 이미지 찌그러짐 |
| `FIT` | `object-contain` | 미적용 |
| `CROP` | `object-cover` + `object-position` | 미적용 |
| (모든 `<img>`) | `alt` 속성 | 누락 (hook Rule 7 자동 검출) |

### 색상 / opacity

fills(배경색, 그라데이션)가 `get_design_context` 속성값과 일치해야 한다.
opacity 값이 정확히 반영되어야 한다. 색상/opacity를 추측으로 판정하지 않는다.

## SVG/에셋 검증

### 파일 존재 + 참조 + 유효성

아이콘/이미지가 Figma REST API에서 export되어 프로젝트에 존재하고, 코드에서 올바른 경로로 참조하며, SVG가 유효(`<svg>...</svg>` 구조)해야 한다.
에셋 누락 시 정확도 최대 90% 제한.

### SVG 원본 일치

Figma export 원본 SVG를 그대로 사용해야 한다. viewBox, fill, stroke, path 속성이 보존되어야 한다.
렌더링 스크린샷에서 Figma 스크린샷과 동일하게 표시되어야 한다.

허용하지 않는 것:
- 아이콘 라이브러리(lucide, heroicons 등)로 대체
- placeholder SVG나 빈 아이콘
- SVG 색상/크기를 Tailwind로 재구성

### SVG fill 렌더링

SVG 파일 내 `fill`, `stroke` 속성값이 렌더링에서 정확히 표시되어야 한다.
아이콘이 다운로드되었다는 이유만으로 색상 검증을 생략하지 않는다.

| SVG fill 값 | import 방식 | FAIL 조건 |
|------------|-----------|----------|
| `fill="none"` 또는 없음 | React SVG 컴포넌트 / 인라인 | `<img>`로 로드 → 색상 미표시 |
| `fill="#hex"` 고정 | `<img src={...}>` 가능 | 색상 불일치 |
| `fill="currentColor"` | 부모에 `text-{color}` 필수 | text-color 누락 |

### 아이콘 노드 속성 검증

SVG 파일 다운로드 여부만으로 pass하지 않는다. 아이콘 노드의 Figma 속성도 대조한다.

| Figma 속성 | 검증 대상 | FAIL 조건 |
|-----------|----------|----------|
| `fills[0].color` | SVG fill + 렌더링 색상 | 색상 불일치 |
| `rotation` ≠ 0 | `rotate-[값]` | 회전 미적용 (verify-figma-props.sh 자동 검출) |
| `width`, `height` | `w-[값] h-[값]` | 크기 불일치 (hook Rule 12: SVG 크기 누락 자동 검출) |
| `opacity` ≠ 1 | `opacity-[값]` | 투명도 미적용 |

```
❌ 아이콘 "화살표": SVG 존재 ✓ → pass (색상/회전 미검증)
✅ 아이콘 "화살표": SVG ✓, fill ✗ (#000 vs #6B7280), rotation ✗ (0° vs -45°) → FAIL
```

### SVG 직접 구현 금지

아이콘/벡터는 Figma export된 SVG 파일을 import해야 한다.
JSX에 `<svg>`, `<path>`, `<circle>` 직접 작성이나 CSS로 아이콘 형태를 흉내낸 것은 FAIL이다.
단순한 도형(원, 삼각형)이라도 CSS 대체는 FAIL이다.

## 토큰 검증

hook `lint-generated.sh`가 자동 검출하는 항목:
- hex/rgb 하드코딩 (Rule 1)
- 인라인 style px 하드코딩 (Rule 9)
- 아이콘 라이브러리 import (Rule 3)

추가로 확인:
- 색상값을 디자인 토큰 파일 @theme과 대조한다

## 선 / 구분선 검증

모든 시각적 선이 Figma 노드의 타입과 속성에 맞는 CSS로 구현되었는지 검증한다.

**A. stroke 기반** (LINE, VECTOR, strokes가 있는 FRAME):

| `strokeDashes` 값 | CSS | 비고 |
|-------------------|-----|------|
| `[]` 또는 없음 | `border-solid` | verify-figma-props.sh 자동 검출 |
| `[값, 값]` | `border-dashed` 또는 `border-dotted` | verify-figma-props.sh 자동 검출 |

`get_design_context`의 `strokeDashes` 속성을 기준으로 판정한다. 스크린샷만 보고 추측하지 않는다.

**B. fills 기반** (FRAME/RECTANGLE, strokes 없음, fills만 있음):

`bg-{color}`로 구현. `border-dashed/dotted/solid` 사용 시 FAIL (hook Rule 11 + verify-figma-props.sh 자동 검출).

캐시 미스 시 해당 선 요소의 `get_design_context`를 개별 호출하여 판정한다.

## 레이아웃 검증

**Auto Layout**: `get_design_context`의 원본 속성과 렌더링 결과를 비교. 좌표에서 padding/gap을 역산하지 않는다.

| Figma 속성 | CSS | 허용 오차 | 자동 검출 |
|-----------|-----|---------|----------|
| `paddingLeft/Right/Top/Bottom` | `p-`, `px-`, `py-`, `pl-` 등 | ±1px | verify-figma-props.sh |
| `itemSpacing` | `gap-` | ±1px | verify-figma-props.sh |
| `counterAxisSpacing` | wrap gap | ±1px | - |
| `layoutMode` | `flex-row` / `flex-col` | - | verify-figma-props.sh |
| `primaryAxisAlignItems` | `justify-` | - | - |
| `counterAxisAlignItems` | `items-` | - | - |

캐시 미스 시 해당 노드의 `get_design_context`를 개별 호출하여 캐시 추가 후 검증한다.

**절대 배치**: constraints + position이 올바르게 CSS로 변환되었는지 검증한다.
- `layoutPositioning: "ABSOLUTE"` → `position: absolute`
- 부모 `position: relative`
- 좌표를 padding/gap으로 변환한 것은 FAIL

## 레이아웃 사이징 검증

| Figma 속성 | CSS | FAIL 조건 | 자동 검출 |
|-----------|-----|----------|----------|
| `layoutSizingHorizontal/Vertical: FILL` | `flex-1` 또는 `w/h-full` | 고정 크기 부여 | verify-figma-props.sh |
| `HUG` | 크기 미지정 | 고정 width/height 부여 | - |
| `minWidth/maxWidth` | `min-w-`/`max-w-` | 누락 | - |
| `minHeight/maxHeight` | `min-h-`/`max-h-` | 누락 | - |

## 오버플로우 / 클리핑 검증

| Figma 속성 | CSS | FAIL 조건 | 자동 검출 |
|-----------|-----|----------|----------|
| `clipsContent: true` | `overflow-hidden` (또는 `-auto`) | 미적용 → 자식 넘침 | verify-figma-props.sh |

## 변환 / 레이어 순서 검증

| Figma 속성 | CSS | FAIL 조건 | 자동 검출 |
|-----------|-----|----------|----------|
| `rotation` ≠ 0 | `rotate-[-값deg]` (부호 반전) | 미적용 | verify-figma-props.sh |
| children 순서 | DOM 순서 / `z-index` | 레이어 순서 불일치 | - |

## 절대 배치 + Auto Layout 혼합 검증

부모가 Auto Layout이면서 자식 중 `layoutPositioning: "ABSOLUTE"`인 경우:
- 부모에 `relative` 필수
- 절대 배치 자식은 flex 흐름에서 벗어남 → 형제 레이아웃에 영향 없어야 함
- `relative` 누락으로 기준이 어긋나면 FAIL

## 코드 레벨 검증

### 자동 검증 (코드 작성 시 hook이 실행)

`lint-generated.sh` (PostToolUse hook)가 아래를 자동 검출:

| Rule | 검사 내용 |
|------|----------|
| 1 | hex/rgb 하드코딩 |
| 2 | inline SVG 직접 작성 |
| 3 | 아이콘 라이브러리 import |
| 4 | 외부 placeholder 이미지 URL |
| 5 | placeholder 텍스트 |
| 6 | CSS border로 아이콘 흉내 |
| 7 | `<img>` alt 속성 누락 |
| 8 | line-clamp에 overflow-hidden 동반 |
| 9 | 인라인 style px 하드코딩 |
| 10 | `<img>` 고정 w/h에 object-fit 누락 |
| 11 | fills 기반 요소에 border-dashed/dotted 혼용 |
| 12 | SVG `<img>`에 크기(w-/h-) 누락 |

### 캐시 대조 검증 (verify Phase V3에서 실행)

`verify-figma-props.sh <code-file> <cache-dir> [nodeIds...]`가 아래를 자동 검출:

| 검사 | 대조 데이터 |
|------|-----------|
| padding 누락/불일치 | design-context `paddingLeft/Right/Top/Bottom` |
| gap 누락/불일치 | design-context `itemSpacing` |
| flex-direction 불일치 | design-context `layoutMode` |
| border-style 불일치 | design-context `strokeDashes` + `strokes`/`fills` |
| rotation 미적용 | design-context `rotation` |
| overflow-hidden 누락 | design-context `clipsContent` |
| layoutSizing 불일치 | design-context `layoutSizingHorizontal/Vertical` |
| SVG fill 색상 불일치 | design-context `fills` + SVG 파일 fill 속성 |

### 빌드/타입 검증

config.md에 정의된 명령으로 코드 품질을 검증한다.
- TypeScript 타입 검사 (`npx tsc --noEmit` 또는 config.md의 typecheck 명령)
- lint 규칙 통과 (config.md의 lint 명령)
- 빌드 에러 없음 (config.md의 build 명령)

빌드/타입 에러가 있으면 렌더링이 통과했더라도 검증 완료가 아니다.
