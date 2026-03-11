# Figma → Code 변환 규칙

이 파일은 공통 변환 규칙입니다. 업데이트 시 덮어쓰기됩니다.
프로젝트별 커스터마이징은 config.md에서 합니다.

## 목차

1. [⛔ 절대 규칙](#-절대-규칙)
2. [Figma MCP 캐시 전략](#figma-mcp-캐시-전략)
3. [MCP 호출 흐름](#mcp-호출-흐름)
4. [탐색 전략](#탐색-전략)
5. [속성 1:1 매핑](#속성-11-매핑)
6. [콘텐츠 충실도](#콘텐츠-충실도)
7. [코드 변환](#코드-변환)
8. [시각적 요소 변환](#시각적-요소-변환)
9. [SVG/아이콘 에셋](#svg아이콘-에셋)
10. [텍스트 속성 변환](#텍스트-속성-변환)
11. [레이아웃 속성](#레이아웃-속성)
12. [디자인 토큰](#디자인-토큰)
13. [코드 레벨 자동 검출](#코드-레벨-자동-검출)

---

## ⛔ 절대 규칙

1. 디자인 컨텍스트(`get_design_context`) 없이 추측으로 구현하지 않는다 — 스크린샷은 해상도/색상 프로파일에 따라 부정확할 수 있으므로, 구조화된 API 데이터가 유일한 신뢰 가능 소스이다
2. 스크린샷 비교 없이 섹션 구현을 완료 처리하지 않는다 — 코드에 올바른 값이 있어도 렌더링 결과가 다를 수 있으므로, 시각적 확인이 품질 보증의 마지막 관문이다
3. SVG/이미지 에셋은 반드시 Figma REST API로 export한다 — 추측 생성이나 아이콘 라이브러리 대체는 디자이너의 의도와 다른 결과를 만들고, CSS 흉내는 해상도/접근성에서 문제를 일으킨다
4. Figma 텍스트를 임의로 변경하거나 placeholder로 대체하지 않는다 — 텍스트는 디자인의 일부이고, 임의 변경은 디자이너/기획자의 검수 비용을 증가시킨다
5. 스크린샷에서 "~처럼 보인다"로 CSS를 결정하지 않는다 — 반드시 `get_design_context` 속성값을 기준으로 변환한다. 시각적 추론은 1~2px 오차로 축적되어 전체 레이아웃을 무너뜨린다
6. 불확실할 때 가정하지 않고 원본을 확인한다 — 속성값, 색상, 크기, 간격 등 어떤 값이든 확신이 없으면 `get_design_context`/`get_metadata`/캐시를 다시 조회한다. "아마 이 값일 것이다"라는 추측은 디버깅이 어려운 미세한 오차를 만든다

## Figma MCP 캐시 전략

Figma 원본은 세션 내에서 변하지 않는다. **동일 nodeId에 대한 MCP 호출은 1회만 실행하고 캐시를 재사용**한다. 이유: MCP 호출마다 네트워크 왕복 + Figma API rate limit을 소비하고, 디자인 원본이 세션 중 변하지 않으므로 재호출은 순수한 낭비이다.

### 캐시 위치

```
/tmp/figma-cache/{fileKey}/
├── metadata/{nodeId}.json        # get_metadata 결과
├── screenshots/{nodeId}.png      # get_screenshot 결과
├── design-context/{nodeId}.json  # get_design_context 결과
├── variables/{nodeId}.json       # get_variable_defs 결과
├── code-connect.json             # get_code_connect_map 결과 (파일 단위)
└── assets/
    ├── {nodeId}.svg              # getImages SVG export
    └── {nodeId}.png              # getImages PNG export
```

캐시는 `/tmp/` (worktree 밖)에 위치하여 모든 agent가 접근 가능하다.
Scout(Phase 1)이 생성하고, Agent/Verify는 읽기 전용으로 사용한다. 단, 하위 드릴다운으로 새 nodeId를 호출한 경우 캐시 **추가**는 허용된다.

### 캐시 호출 규칙

```
MCP 호출 전
  ├─ /tmp/figma-cache/{fileKey}/{type}/{nodeId}.json 존재?
  │   ├─ YES → 캐시 파일을 읽어 사용 (MCP 호출 생략)
  │   └─ NO  → MCP 호출 → 결과를 캐시에 저장 → 사용
  │
  └─ ⛔ 캐시 히트 시 MCP를 다시 호출하지 않는다
```

| MCP 도구 | 캐시 키 | 캐시 유효 기간 |
|----------|--------|---------------|
| `get_metadata` | `metadata/{nodeId}.json` | 세션 종료까지 |
| `get_screenshot` | `screenshots/{nodeId}.png` | 세션 종료까지 |
| `get_design_context` | `design-context/{nodeId}.json` | 세션 종료까지 |
| `get_variable_defs` | `variables/{nodeId}.json` | 세션 종료까지 |
| `get_code_connect_map` | `code-connect.json` | 세션 종료까지 |
| `getImages` (SVG/PNG) | `assets/{nodeId}.{format}` | 세션 종료까지 |

### 캐시 생명주기

1. **생성**: Scout(Phase 1)에서 `mkdir -p /tmp/figma-cache/{fileKey}/{하위디렉토리}` 후 저장
2. **공유**: Agent/Verify는 `/tmp/figma-cache/{fileKey}/` 경로로 직접 접근
3. **정리**: 최종 완료 후 `/tmp/figma-cache/{fileKey}/` 전체 삭제 (verify의 `cleanup_verification`과 함께)

### 매니페스트에 캐시 경로 기록

```json
{
  "cache": {
    "basePath": "/tmp/figma-cache/{fileKey}",
    "populatedAt": "2026-02-27T12:00:00Z",
    "entries": {
      "metadata": ["nodeId-1", "nodeId-2"],
      "screenshots": ["nodeId-1", "nodeId-2"],
      "designContext": ["nodeId-1", "nodeId-2"],
      "variables": ["nodeId-1", "nodeId-2"],
      "codeConnect": true,
      "assets": ["nodeId-3.svg", "nodeId-4.png"]
    }
  }
}
```

## MCP 호출 흐름

1. `figma-targets.md`에서 대상 노드 목록을 읽는다 (전체 레이어 탐색 금지)
2. 캐시 디렉토리 초기화: `mkdir -p /tmp/figma-cache/{fileKey}/{metadata,screenshots,design-context,assets}`
3. 각 대상 노드에 `get_metadata`로 규모를 판단한다 → **캐시 저장**
4. `get_screenshot`로 시각적 참조를 확보한다 → **캐시 저장**
5. `get_design_context`로 노드의 구조화된 표현을 가져온다 → **캐시 저장**
6. 응답이 잘리거나 너무 크면 경계 노드를 식별하여 하위 노드에 개별 `get_design_context` 호출 → **각각 캐시 저장**
7. 디자인 컨텍스트 + 스크린샷 확보 후에만 구현을 시작한다
8. MCP 출력(React + Tailwind)을 대상 프로젝트 컨벤션으로 변환한다
9. 최종 UI를 Figma 스크린샷과 대조하여 검증한다 — **캐시의 스크린샷 재사용**

## 탐색 전략

전체 파일의 모든 레이어를 탐색하지 않는다. `figma-targets.md`에 명시된 노드만 대상으로 한다.

**소형 (노드 ≤ 50, depth ≤ 5)**: 대상 노드에 `get_design_context` 1회 호출

**대형 (노드 > 50 또는 depth > 5)**:
- 최상위에 `get_design_context`를 호출하지 않는다
- `get_metadata` 결과(캐시)에서 경계 노드(COMPONENT, INSTANCE, 커스텀 이름)를 식별 → 개별 `get_design_context` 호출
- INSTANCE 도달 시 Code Connect 매핑 확인 (캐시된 `code-connect.json` 참조) → 기존 컴포넌트 재사용
- API 호출 누적 15회 초과 시 현재까지 수집된 컨텍스트로 구현 시작

**대형 노드 섹션별 탐색 (섹션 3개+ 또는 노드 100+)**:
1. `get_metadata` 결과(캐시)에서 children 확인 → 시각적 섹션 분할
2. 각 섹션마다 `get_screenshot`(캐시 확인) → `get_design_context`(캐시 확인) → 잘렸으면 재귀 드릴다운
3. 한 섹션 컨텍스트 확보 → 즉시 구현 → **캐시된 스크린샷으로** 비교 검증 → 다음 섹션으로

## 속성 1:1 매핑

SKILL.md에서 이 섹션을 참조한다. 각 요소의 캐시된 design-context 값을 그대로 적용하고 추측하지 않는다. 디자이너가 지정한 정확한 수치가 있는데 눈대중으로 결정하면 1~2px 오차가 축적되어 전체 레이아웃을 무너뜨리기 때문이다.

| 요소 타입 | Figma 속성 | 변환 대상 | 비고 |
|-----------|-----------|----------|------|
| **TEXT** | `fontSize`, `fontWeight`, `lineHeightPx`, `letterSpacing`, `fills[0].color` | 텍스트 스타일 + 색상 | |
| **FRAME** | `width`, `height`, `paddingLeft/Top/Right/Bottom`, `itemSpacing`, `layoutMode` | 레이아웃 | |
| **아이콘** | `get_metadata`의 `absoluteBoundingBox.width/height` | 크기 | `get_design_context`의 비율 계산값과 다를 수 있음 |
| **색상** | `fills`/`strokes` 원본값 | Tailwind 토큰 매핑 | 스크린샷에서 색상 추측 금지 |
| **크기 모드** | `layoutSizingHorizontal/Vertical` | FIXED→명시적 크기, FILL→flex-1/w-full, HUG→크기 미지정 | |

---

## 콘텐츠 충실도

Figma에 있는 모든 콘텐츠를 그대로 사용한다.

### 텍스트

TEXT 노드의 `characters` 값을 그대로 사용한다. 동적 데이터로 판단되는 텍스트는 props로 추출하되, Figma 텍스트를 기본값으로 설정한다.

### 텍스트 스타일

TEXT 노드의 `fills` 속성이 텍스트 색상이다. `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`를 `get_design_context`에서 읽어 적용한다. 스타일이 다른 구간은 `<span>`으로 분리한다.

```tsx
// ⛔ fills 누락 — 기본 black으로 렌더링됨
<p className="text-sm">항공권 검색</p>

// ✅ fills 속성값을 텍스트 색상으로 적용
<p className="text-sm text-gray-700 font-medium">항공권 검색</p>
```

### 이미지 / 배경

IMAGE fill이 있는 노드는 Figma REST API `getImages(fileKey, nodeIds, { format: 'png' })`로 export하여 프로젝트 에셋 디렉토리에 저장한다. 외부 URL(`unsplash`, `placeholder.com`)이나 빈 div placeholder를 사용하지 않는다.

### 색상 / 배경 / opacity

`get_design_context`에서 반환하는 fills, opacity를 정확히 적용한다. 색상을 추측하지 않는다.
- 단색 fill → Tailwind 토큰 매핑 또는 정확한 hex
- gradient fill → CSS linear-gradient/radial-gradient
- 다중 fill → 레이어 순서대로 적용
- opacity가 1이 아니면 정확히 반영, `visible: false`인 노드는 렌더링하지 않는다

## 코드 변환

MCP 출력의 React + Tailwind은 "디자인 의도의 표현"이지 최종 코드가 아니다. 대상 프로젝트의 기존 컴포넌트를 먼저 확인하고 재사용한다.

- 색상은 Tailwind 토큰 클래스 사용 (`primary-600`, `gray-300` 등) — hex/rgb 하드코딩하면 토큰 시스템이 무의미해진다
- spacing은 Tailwind spacing scale (`p-4`, `gap-6` 등)
- Figma depth ≠ DOM depth — 단순 래퍼 Frame은 CSS flex/grid로 흡수, 코드 DOM depth 3~4단계 이내
- 각 노드의 속성을 개별 확인한다. 주변 요소의 스타일에서 패턴을 유추하지 않는다

## 시각적 요소 변환

스크린샷에서 시각적 요소를 인식했을 때, CSS를 바로 결정하지 말고 `get_design_context`에서 노드 타입과 속성을 먼저 확인한다.

### 선 / 구분선

```
선이 보인다
  ├─ LINE / VECTOR → strokes + strokeDashes 확인 → [A. stroke 기반]
  ├─ FRAME / RECTANGLE → fills, size, strokes 확인 → [B. fills 기반] 또는 [A]
  └─ ⛔ "연결선이니까 border-dashed" 등 시각적 추론 금지
```

**A. stroke 기반** (strokes 배열이 있고 비어있지 않을 때):

| Figma 속성 | CSS |
|-----------|-----|
| `strokeDashes: []` 또는 없음 | `bg-{color}` (1px) 또는 `border-solid` |
| `strokeDashes: [길이, 간격]` | `border-dashed border-{color}` |
| `strokeDashes: [짧은값, 짧은값]` | `border-dotted border-{color}` |

**B. fills 기반** (strokes 없이 fills만 있을 때):
border 관련 CSS를 사용하지 않는다. `bg-{color}`로 구현한다.

```tsx
// FRAME, width=1, fills=[gray], strokes=[] → bg로 구현
<div className="w-px h-full bg-gray-200" />

// ⛔ fills만 있는데 border로 구현하면 안 됨
// <div className="w-px h-full border-l border-dashed border-gray-200" />
```

### 배경/채움, 테두리, 그림자

```
fills     → bg-{color} | bg-gradient-to-{dir} | background-image
strokes   → border-{style} border-{color} + cornerRadius → rounded-{value}
effects   → shadow-{token} | shadow-inner | blur-{value} | backdrop-blur-{value}
```

## SVG/아이콘 에셋

### export → 저장 → import

1. 벡터/아이콘 노드 감지 (VECTOR, BOOLEAN_OPERATION, INSTANCE)
2. Figma REST API `getImages(fileKey, nodeIds, { format: 'svg' })`로 export URL 획득
3. export URL에서 SVG 다운로드 → 프로젝트 에셋 디렉토리에 저장
4. SVG 파일을 열어 fill/stroke 속성을 확인하고, 아래 규칙에 따라 import

### SVG fill 확인 → import 방식 결정

SVG의 fill 속성에 따라 렌더링 방식이 달라진다. 잘못된 방식으로 import하면 색상이 표시되지 않는다.

```
SVG 파일 내용 확인
  ├─ fill="none" 또는 없음 → 인라인 SVG 또는 React SVG 컴포넌트 (색상 제어 필요)
  ├─ fill="#hex" 고정 색상 → <img src={...}> 사용 가능 (색상 자동 보존)
  ├─ fill="currentColor" → 부모에 text-{color} 필수
  └─ 여러 fill 혼합 → <img> 또는 인라인 SVG
```

```tsx
// fill 고정 SVG → <img>
<img src={CloseIcon} alt="" aria-hidden="true" className="h-6 w-6" />

// fill="currentColor" → 부모에 text-color 필수
<span className="text-gray-500">
  <img src={ArrowIcon} alt="" aria-hidden="true" className="h-4 w-4" />
</span>

// React SVG 컴포넌트 (SVGR 설정된 프로젝트)
<CheckIcon className="h-5 w-5 text-blue-500" />
```

SVG의 fill이 Figma 디자인 색상과 불일치하면 SVG 파일 내 fill 값을 수정한다.
viewBox는 올바른 크기를 담고 있으므로 Container/Shape 분리 계산이 불필요하다.

### 아이콘/텍스트 교차 검증

get_design_context의 비율 계산값이 실제와 다를 수 있다. 아래 교차 검증을 수행한다:

1. **아이콘 크기**: get_design_context의 inset 비율 계산값(A) vs get_metadata 직접 조회값(B) → A≠B이면 B 사용
2. **색상**: get_variable_defs의 토큰 색상(A) vs get_design_context의 인라인 색상(B) → A≠B이면 인스턴스 오버라이드로 판단, B 사용
3. **텍스트 크기/행간**: get_design_context의 fontSize/lineHeight 값을 get_metadata의 해당 TEXT 노드 속성과 대조 → 불일치 시 get_metadata 값 우선

### 아이콘 노드의 추가 속성 확인

SVG를 export한 후, 아이콘 **노드 자체**의 속성도 `get_design_context`에서 확인하여 컨테이너에 적용한다:

1. **fills 색상 대조**: 아이콘 노드의 `fills[0].color`와 export된 SVG 파일의 fill 속성을 비교한다. 불일치하면 SVG 파일 내 fill 값을 Figma 색상으로 수정한다.
2. **rotation**: 아이콘 노드의 `rotation`이 0이 아니면 아이콘 컨테이너에 `rotate-[값]` 적용 (Figma 반시계 양수 → CSS 시계 양수, 부호 반전)
3. **width/height**: 아이콘 노드의 `width`, `height` 값으로 `w-[값]`, `h-[값]` 또는 Tailwind size 토큰 적용
4. **opacity**: 아이콘 노드의 `opacity`가 1이 아니면 `opacity-[값]` 적용

```tsx
// ⛔ SVG export만 하고 노드 속성 무시
<img src={ArrowIcon} alt="" aria-hidden="true" />

// ✅ rotation + size + fills 색상까지 반영
<img src={ArrowIcon} alt="" aria-hidden="true"
  className="w-5 h-5 rotate-[-45deg]" />
```

### ⛔ SVG를 코드로 직접 그리지 않는다

아이콘/벡터는 반드시 Figma REST API로 SVG를 다운로드하여 파일로 저장 후 import한다.
JSX에 `<svg>`, `<path>`, `d="M..."` 등을 직접 작성하면 안 된다.

자동 검출: hook Rule 2 (inline SVG), Rule 2b (SVG path data), Rule 3 (아이콘 라이브러리), Rule 6 (CSS 아이콘), Rule 12 (SVG img 크기)

```tsx
// ⛔ JSX에 path 직접 작성
<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z" /></svg>

// ⛔ CSS로 아이콘 형태 흉내
<div className="w-3 h-3 rounded-full bg-red-500" />

// ✅ Figma export SVG 파일 import
import ArrowIcon from '@/assets/icons/arrow.svg';
<img src={ArrowIcon} alt="" aria-hidden="true" className="h-4 w-4" />
```

## 텍스트 속성 변환

스크린샷에서 텍스트를 인식했을 때, 콘텐츠뿐 아니라 **스타일 속성도 `get_design_context`에서 읽어 적용**한다.

### 텍스트 정렬 / 자동 리사이즈

| Figma 속성 | CSS |
|-----------|-----|
| `textAlignHorizontal: "CENTER"` | `text-center` |
| `textAlignHorizontal: "RIGHT"` | `text-right` |
| `textAlignHorizontal: "JUSTIFIED"` | `text-justify` |
| `textAlignVertical: "CENTER"` | flex 부모의 `items-center` |
| `textAlignVertical: "BOTTOM"` | flex 부모의 `items-end` |
| `textAutoResize: "TRUNCATE"` | 너비 고정 + `truncate` |

textAlignHorizontal 생략 시 기본 left가 적용되어 center/right 디자인이 깨질 수 있다.

### 텍스트 오버플로우 / 말줄임

| Figma 속성 | CSS |
|-----------|-----|
| `textTruncation: "ENDING"` | `truncate` |
| `maxLines: N` | `line-clamp-{N}` + `overflow-hidden` |

`maxLines` → `line-clamp-{N}` + `overflow-hidden` 필수 (자동 검출: hook Rule 8)

### 세부 타이포그래피

| Figma 속성 | CSS |
|-----------|-----|
| `letterSpacing` (≠ 0) | `tracking-{token}` 또는 `tracking-[값]` |
| `textDecoration: "UNDERLINE"` | `underline` |
| `textDecoration: "STRIKETHROUGH"` | `line-through` |
| `fontFamily` | `font-{token}` — config.md의 폰트 매핑 참조 |
| `lineHeightPx` / `lineHeightPercent` | `leading-{token}` |

`letterSpacing` ≠ 0이면 반드시 반영한다 (미세한 차이도 디자인 의도).

### 혼합 스타일 텍스트 (characterStyleOverrides)

하나의 TEXT 노드 안에 여러 스타일이 혼합된 경우:

1. `characterStyleOverrides` 배열과 `styleOverrideTable`을 확인
2. 스타일이 다른 구간을 `<span>`으로 분리
3. 각 `<span>`에 해당 스타일(font-weight, color, font-size 등)을 개별 적용

```tsx
// Figma: "총 3건의 결과" (3건 부분만 볼드+파란색)
<p className="text-sm text-gray-600">
  총 <span className="font-bold text-blue-600">3건</span>의 결과
</p>
```

`characterStyleOverrides`가 비어있으면 단일 스타일로 처리하고, 있으면 구간별 `<span>` 분리 필수.

## 이미지 fill scaleMode

IMAGE fill이 있는 노드의 `scaleMode`를 확인하여 CSS `object-fit`으로 변환한다:

| Figma scaleMode | CSS |
|----------------|-----|
| `FILL` | `object-fit: cover` (기본) |
| `FIT` | `object-fit: contain` |
| `CROP` | `object-fit: cover` + `object-position` (imageTransform 참조) |
| `TILE` | `background-repeat: repeat` + `background-size` |

scaleMode 생략 시 이미지 찌그러짐 위험 (자동 검출: hook Rule 10). `CROP`은 `imageTransform` offset으로 `object-position` 계산.
`<img>`에 `alt` 필수 — 장식용: `alt="" aria-hidden="true"` (자동 검출: hook Rule 7)

## 변환 / 레이어 순서

### rotation (회전)

노드의 `rotation` 값(degree)이 0이 아니면 CSS transform으로 변환한다.
Figma rotation은 **반시계 방향 양수** → CSS transform은 **시계 방향 양수**이므로 **부호를 반전**한다.

```tsx
// Figma rotation: 45 → CSS: -45deg
<div className="rotate-[-45deg]" />
```

회전된 노드의 width/height는 회전 전 원본 크기를 사용한다.

### z-index / 레이어 순서

- Figma children 배열의 순서가 레이어 순서이다 (뒤에 있을수록 위에 그려짐)
- 겹치는 요소가 있을 때 DOM 순서만으로 해결되지 않으면 `z-{index}` 적용
Figma children 순서와 DOM 순서를 일치시킨다.

## 레이아웃 속성

### Auto Layout 노드

`get_design_context`가 Auto Layout 속성을 반환하면 해당 값을 직접 사용한다. 좌표에서 역산하지 않는다.

| Figma 속성 | CSS |
|-----------|-----|
| `paddingLeft/Right/Top/Bottom` | padding |
| `itemSpacing` | gap |
| `layoutMode` HORIZONTAL/VERTICAL | flex-row / flex-col |
| `primaryAxisAlignItems` | justify-content |
| `counterAxisAlignItems` | align-items |
| `layoutWrap` | flex-wrap |
| `counterAxisSpacing` | wrap일 때 교차축 gap (예: `gap-x-4 gap-y-2`) |

#### Auto Layout 정렬 조합 매핑

| Figma primaryAxis / counterAxis | CSS |
|-------------------------------|-----|
| MIN / MIN | `justify-start items-start` |
| MIN / CENTER | `justify-start items-center` |
| MIN / MAX | `justify-start items-end` |
| CENTER / CENTER | `justify-center items-center` |
| MAX / MIN | `justify-end items-start` |
| MAX / MAX | `justify-end items-end` |
| SPACE_BETWEEN / CENTER | `justify-between items-center` |
| MIN / BASELINE | `justify-start items-baseline` |

> row/column 방향 모두 동일한 CSS 매핑 적용. `primaryAxisAlignItems` → justify-content, `counterAxisAlignItems` → align-items 누락 시 정렬이 깨진다.

### Grid 레이아웃

Figma Grid Layout이 감지되면 CSS Grid로 변환한다:

| Figma 속성 | CSS |
|-----------|-----|
| Grid columns (N) | `grid-cols-{N}` |
| Grid rows (N) | `grid-rows-{N}` |
| Column gap / Row gap | `gap-x-{n} gap-y-{n}` 또는 `gap-{n}` |
| Cell column span | `col-span-{n}` |
| Cell row span | `row-span-{n}` |
| Figma "Auto" 크기 | CSS `1fr` |
| Fixed 크기 열 | 명시적 px/rem 값 |

```tsx
// Figma: 3열 Grid, gap 16, Auto 크기
<div className="grid grid-cols-3 gap-4">
  <div>...</div>
  <div className="col-span-2">...</div> {/* 2열 차지 */}
</div>
```

Grid vs Flexbox 판단: 2차원 배치(행+열 동시)가 필요하면 Grid, 1차원 흐름이면 Flex.

### 절대 배치 노드

Auto Layout이 아닌 노드는 constraints + position으로 CSS를 결정한다. 좌표를 padding/gap으로 변환하지 않는다.

| Figma 속성 | CSS |
|-----------|-----|
| `layoutPositioning: "ABSOLUTE"` | `position: absolute` |
| `constraints.horizontal` LEFT/RIGHT/CENTER/LEFT_RIGHT | left / right / left:50%+translateX / left+right |
| `constraints.vertical` TOP/BOTTOM/CENTER/TOP_BOTTOM | top / bottom / top:50%+translateY / top+bottom |

부모 요소에 `position: relative`를 설정한다.

### 레이아웃 사이징 (layoutSizingHorizontal / layoutSizingVertical)

Auto Layout 자식 노드의 사이징 모드를 CSS로 변환한다:

| Figma 속성 | CSS |
|-----------|-----|
| `FIXED` | 명시적 `width` / `height` (Figma의 width/height 값 사용) |
| `HUG` | 크기 미지정 (`fit-content`) — 콘텐츠에 맞춤 |
| `FILL` | 주축: `flex-1` / 교차축: `w-full` 또는 `h-full` |

```
부모 layoutMode 확인
  ├─ HORIZONTAL (row)
  │   ├─ 자식 layoutSizingHorizontal: FILL → flex-1 (주축)
  │   └─ 자식 layoutSizingVertical: FILL → h-full (교차축)
  └─ VERTICAL (column)
      ├─ 자식 layoutSizingVertical: FILL → flex-1 (주축)
      └─ 자식 layoutSizingHorizontal: FILL → w-full (교차축)
```

`HUG` → 고정 크기 금지, `FILL` → flex-1/w-full/h-full 사용, 속성 없음 → `FIXED`로 간주 (자동 검출: script check 7)

### min/max 크기 제약

| Figma 속성 | CSS |
|-----------|-----|
| `minWidth` | `min-w-[값]` |
| `maxWidth` | `max-w-[값]` |
| `minHeight` | `min-h-[값]` |
| `maxHeight` | `max-h-[값]` |

min/max 속성 생략 시 반응형 동작이 깨진다.

### 오버플로우 / 클리핑

| Figma 속성 | CSS |
|-----------|-----|
| `clipsContent: true` | `overflow-hidden` |
| `clipsContent: false` 또는 없음 | overflow 제약 없음 |
| `clipsContent: true` + 자식이 부모보다 큼 | `overflow-auto` (스크롤 의도 판단) |

`clipsContent: true` 누락 시 자식 요소 넘침 (자동 검출: script check 6)

### 절대 배치 + Auto Layout 혼합

부모가 Auto Layout이면서 자식 중 일부가 `layoutPositioning: "ABSOLUTE"`인 경우:

- 부모: `position: relative` 추가 (flex와 공존)
- 절대 배치 자식: `position: absolute` + constraints 기반 배치
- 나머지 자식: 일반 flex 아이템으로 유지
절대 배치 자식은 flex 흐름에서 벗어나므로 형제 레이아웃에 영향 없음.

## 디자인 토큰

새 섹션 구현 시 사용된 모든 색상값을 디자인 토큰 파일 @theme과 대조한다.
누락된 색상이 있으면 구현 전에 토큰을 먼저 등록한다.

## 네이밍

- "Frame 123", "Group 15" 등 기본 이름 → 의미적 이름으로 변환
- 텍스트 콘텐츠, 위치, 스타일 기반으로 시맨틱 이름 유추
- 코드 주석으로 원본 Figma 노드 ID 기록

---

→ **rules-parallel.md** 참조 (매니페스트 스키마, action 값, Agent 할당/격리, 팀 조정, Merge 규칙)

---

## 코드 레벨 자동 검출

아래 항목은 PostToolUse hook과 verify script가 자동으로 검출한다. 위반 시 코드 저장이 차단되거나 경고가 출력된다.

### Hook (lint-generated.sh) — Write/Edit 시 즉시 검사

| Rule | 검출 대상 | 결과 |
|------|----------|------|
| 1 | hex/rgb 하드코딩 (style 객체 내) | ❌ 차단 |
| 2 | `<svg>`, `<path>` 등 인라인 SVG 태그 | ❌ 차단 |
| 2b | `d="M..."` SVG path data 직접 작성 | ❌ 차단 |
| 3 | lucide/heroicons 등 아이콘 라이브러리 import | ❌ 차단 |
| 4 | placeholder.com/unsplash 등 외부 이미지 URL | ❌ 차단 |
| 5 | Lorem ipsum 등 placeholder 텍스트 | ❌ 차단 |
| 6 | CSS border로 아이콘 흉내 (rotate+border) | ❌ 차단 |
| 7 | `<img>` alt 속성 누락 | ❌ 차단 |
| 8 | `line-clamp-N` + `overflow-hidden` 누락 | ❌ 차단 |
| 9 | 인라인 style에 px 하드코딩 | ⚠️ 경고 |
| 10 | `<img>` w/h 고정인데 object-fit 없음 | ⚠️ 경고 |
| 11 | bg-color + border-dashed/dotted 혼용 | ⚠️ 경고 |
| 12 | SVG를 `<img>`로 사용하면서 크기 없음 | ⚠️ 경고 |
| 13a | 캐시 TEXT `fontSize` → `text-*` | ❌ 차단 |
| 13b | 캐시 TEXT `fontWeight` → `font-*` | ⚠️ 경고 |
| 13c | 캐시 TEXT `fills` 색상 → `text-{color}` | ⚠️ 경고 |
| 13d | 캐시 아이콘 `width/height` → 크기 클래스 | ⚠️ 경고 |
| 13e | 캐시 `paddingLeft/Top` → `p-`/`px-`/`pl-`/`pt-` | ⚠️ 경고 |
| 13f | 캐시 `itemSpacing` → `gap-` | ⚠️ 경고 |
| 13g | 캐시 `layoutMode` VERTICAL → `flex-col` | ⚠️ 경고 |
| 13h | 캐시 `rotation` → `rotate-` | ⚠️ 경고 |
| 13i | 캐시 `clipsContent` → `overflow-hidden` | ⚠️ 경고 |
| 13j | 캐시 `layoutSizingH/V` FILL → `flex-1`/`w-full`/`h-full` | ⚠️ 경고 |
| 13k | 캐시 `strokeDashes` + `strokes`/`fills` → border-style | ⚠️ 경고 |

---

→ **rules-component.md** 참조 (Atomic 3레벨, 재사용 범위, 분리 판단, Figma 시그널 매핑, 합성 방식, Props Drilling, 의사결정 플로우, 네이밍/용어 사전)
