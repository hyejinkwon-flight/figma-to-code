# Figma → Code 변환 규칙

이 파일은 공통 변환 규칙입니다. 업데이트 시 덮어쓰기됩니다.
프로젝트별 커스터마이징은 config.md에서 합니다.

## ⛔ 절대 규칙

1. 디자인 컨텍스트(`get_design_context`) 없이 추측으로 구현하지 않는다
2. 스크린샷 비교 없이 섹션 구현을 완료 처리하지 않는다
3. SVG/이미지 에셋은 반드시 Figma REST API로 export한다 — 추측 생성, 아이콘 라이브러리 대체, CSS 흉내 금지
4. Figma 텍스트를 임의로 변경하거나 placeholder로 대체하지 않는다
5. 스크린샷에서 "~처럼 보인다"로 CSS를 결정하지 않는다 — 반드시 `get_design_context` 속성값을 기준으로 변환한다

## Figma MCP 캐시 전략

Figma 원본은 세션 내에서 변하지 않는다. **동일 nodeId에 대한 MCP 호출은 1회만 실행하고 캐시를 재사용**한다.

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

## 병렬 구현 규칙

### 매니페스트 (.figma-manifest.json)

매니페스트는 Scout(Phase 1)에서만 생성한다. Agent가 수정하거나 매니페스트에 없는 컴포넌트를 임의 생성하지 않는다.

### 매니페스트 스키마

```typescript
interface FigmaManifest {
  fileKey: string;
  generatedAt: string;
  cache: {
    basePath: string;       // "/tmp/figma-cache/{fileKey}"
    populatedAt: string;    // ISO 8601
    entries: {
      metadata: string[];       // 캐시된 nodeId 목록
      screenshots: string[];    // 캐시된 nodeId 목록
      designContext: string[];   // 캐시된 nodeId 목록
      variables: string[];      // 캐시된 nodeId 목록 (get_variable_defs)
      codeConnect: boolean;     // code-connect.json 존재 여부
      assets: string[];         // 캐시된 파일명 목록 ("nodeId.svg" 등)
    };
  };
  projectContext: {
    componentsPath: string;
    stylesPath: string;
    existingComponents: string[];
  };
  designTokens: {
    new: Array<{ name: string; value: string; source: string }>;
  };
  components: Array<{
    id: string;
    name: string;
    figmaNodeId: string;
    source: "existing" | "new";       // 코드베이스에 이미 있는가?
    scope: "shared" | "unique";       // 디자인 내 여러 노드가 참조하는가?
    existingMatch?: {                  // source: "existing"일 때만
      matchedBy: "code-connect" | "name-exact" | "name-fuzzy" | "file-scan" | "props-similarity";
      componentPath: string;
      confidence: "high" | "medium";
      action: "reuse" | "extend-variant" | "add-props" | "update-style" | "wrap" | "rewrite";
      reason?: string;                // action 선택 근거 (예: "props 3/4 일치, size variant 추가 필요")
      diff?: {                        // 매칭 후 변경사항 검출 결과
        hasChanges: boolean;
        variants?: {
          added: string[];            // Figma에 있고 코드에 없는 variant 값
          removed: string[];          // 코드에 있고 Figma에 없는 variant 값
        };
        props?: {
          added: string[];            // Figma에 있고 코드에 없는 props
          removed: string[];          // 코드에 있고 Figma에 없는 props
          typeChanged: Array<{        // 타입이 달라진 props
            name: string;
            codeType: string;
            figmaType: string;
          }>;
        };
        style?: {
          changed: Array<{            // 스타일 변경 사항
            property: string;         // 예: "borderRadius", "padding", "backgroundColor"
            codeValue: string;
            figmaValue: string;
          }>;
        };
      };
    };
    atomicLevel: "atom" | "molecule" | "organism";
    compositionPattern: "props" | "children" | "namedProps" | "arrayProps" | "booleanProps";
    subComponents?: string[];  // 하위 컴포넌트 ID 목록
    assignedAgent: number;
    referencedByNodes: string[];
    props: string[];
    outputPath: string;
  }>;
  nodes: Array<{
    nodeId: string;
    name: string;
    priority: "high" | "medium" | "low";
    sizeType: "small" | "large";
    assignedAgent: number;
    requiredComponents: string[];
    outputPath: string;
    designContext: { screenshotRef: boolean; boundaryNodes: string[] };
  }>;
  agents: Array<{
    id: number;
    assignedComponents: string[];
    assignedNodes: string[];
    totalWork: number;
  }>;
  agentCount: number;
}
```

### action 값 의미

| action | 의미 | Agent 동작 |
|--------|------|-----------|
| `reuse` | 변경 없음, 그대로 import | import만 추가 |
| `extend-variant` | 기존 variant에 새 값 추가 | 기존 파일에 variant 값 추가 |
| `add-props` | 새 props 추가 필요 | 기존 파일에 props/타입 추가 |
| `update-style` | 스타일만 변경 | 기존 파일의 Tailwind 클래스 수정 |
| `wrap` | 기존 컴포넌트를 감싸는 래퍼 | 새 래퍼 파일 생성 |
| `rewrite` | 변경이 너무 커서 새로 작성 | 기존 파일 대체 (사용자 확인 필수) |

### Agent 수 결정

```
agentCount = Math.min(Math.max(3, Math.ceil(nodeCount / 10)), 10)
```

### 할당 전략

1. **컴포넌트 할당**: shared → unique 순으로 라운드로빈 분배
2. **노드 할당**: high 우선순위 먼저 라운드로빈 분배

### Agent 격리

모든 agent는 worktree 격리 환경에서 실행한다. 자기 할당분만 파일을 생성하고, 다른 agent 할당분이나 매니페스트를 수정하지 않는다. 디자인 토큰 파일은 예외로 모든 agent가 추가 가능하다 (merge 시 중복 제거).

### 팀 기반 조정 (Team Coordination)

agent 간 상태 공유와 조정은 Claude Code의 **Team 기능**(TaskList, SendMessage)을 사용한다. 매니페스트는 초기 할당용이고, 런타임 조정은 팀 기능이 담당한다.

#### 팀 구성

Scout(Phase 1) 완료 후 `TeamCreate`로 팀을 생성한다.

```
팀 이름: figma-impl-{fileKey 앞 8자}
멤버:
  - scout (team lead) — 매니페스트 생성, 태스크 할당, merge 조정
  - agent-0 ~ agent-N — 컴포넌트/노드 구현
```

#### 태스크 생명주기

Scout가 매니페스트 기반으로 `TaskCreate`를 호출하여 태스크를 생성한다.

```
매니페스트 components[] → TaskCreate (컴포넌트 구현 태스크)
매니페스트 nodes[]      → TaskCreate (노드 구현 태스크)

태스크 상태 흐름:
  pending → in_progress → completed
```

| 시점 | 주체 | 액션 |
|------|------|------|
| 태스크 생성 | Scout | `TaskCreate` — subject에 컴포넌트/노드명, description에 figmaNodeId·outputPath·requiredComponents 포함 |
| 태스크 할당 | Scout | `TaskUpdate` — owner를 agent 이름으로 설정, 매니페스트 assignedAgent와 일치 |
| 작업 시작 | Agent | `TaskUpdate` — status를 `in_progress`로 변경 |
| 드릴다운 발생 | Agent | `SendMessage` — Scout에게 새 캐시 항목 알림 (nodeId + 캐시 경로) |
| 작업 완료 | Agent | `TaskUpdate` — status를 `completed`로 변경 |
| 다음 작업 탐색 | Agent | `TaskList` — 본인 소유의 pending 태스크 확인 후 다음 작업 시작 |

#### 의존성 관리

shared 컴포넌트는 이를 사용하는 노드보다 먼저 완료되어야 한다. `TaskUpdate`의 `addBlockedBy`로 의존성을 설정한다.

```
예시:
  Button (shared, agent-0) ← TaskCreate
  LoginForm (node, agent-1, requiredComponents: [Button]) ← TaskCreate + addBlockedBy: [Button 태스크 ID]

agent-1은 Button 태스크가 completed 될 때까지 LoginForm 작업을 시작하지 않는다.
TaskList에서 blockedBy가 비어있는 태스크만 작업 가능.
```

#### 드릴다운 캐시 조정

Agent가 구현 중 하위 노드를 추가로 MCP 호출해야 할 때:

```
1. 자기 할당 노드의 하위만 드릴다운 가능 (다른 agent 할당 노드의 하위 접근 금지)
2. 새 캐시 항목 저장 후 Scout에게 SendMessage:
   "[cache-add] agent-{id}: {nodeId} → /tmp/figma-cache/{fileKey}/{type}/{nodeId}.json"
3. Scout는 메시지를 수신하여 매니페스트 cache.entries에 기록 (선택적)
4. 같은 노드를 다른 agent가 이미 캐시했을 수 있으므로 캐시 파일 존재 여부를 먼저 확인
```

#### Agent 간 메시지 프로토콜

| 메시지 유형 | 발신 | 수신 | 내용 |
|------------|------|------|------|
| `[cache-add]` | Agent | Scout | 드릴다운으로 새 캐시 항목 추가됨 |
| `[blocked]` | Agent | Scout | 의존 컴포넌트 미완성으로 작업 불가 |
| `[component-ready]` | Agent | Scout | shared 컴포넌트 구현 완료, 의존 태스크 unblock 가능 |
| `[need-context]` | Agent | Scout | 매니페스트에 없는 노드의 디자인 컨텍스트 필요 |
| `[merge-ready]` | Agent | Scout | 할당된 모든 태스크 완료, merge 대기 |

Scout는 `[component-ready]` 수신 시 해당 컴포넌트에 의존하는 태스크의 `blockedBy`를 해제한다.

#### 팀 종료

모든 태스크가 completed이면:
1. Scout가 각 agent에게 `shutdown_request` 전송
2. Agent는 `shutdown_response`로 승인
3. Merge 진행 후 `TeamDelete`로 정리

### Merge

자동 merge 금지 — 반드시 사용자 확인 후 진행한다.
- merge 순서: agent 0 → 1 → ... → N (순차)
- 디자인 토큰 충돌: 양쪽 토큰 모두 유지 (union merge)
- 컴포넌트 파일 충돌: 할당 규칙상 발생 불가 → 발생 시 사용자 알림
- merge 후 모든 import가 실제 파일을 가리키는지 검증

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

### Script (verify-figma-props.sh) — 캐시 기반 속성 대조

| Check | Figma 속성 → 코드 대조 |
|-------|----------------------|
| 1 | `paddingLeft/Top` → `p-`/`px-`/`pl-`/`pt-` |
| 2 | `itemSpacing` → `gap-` |
| 3 | `layoutMode` → `flex-row`/`flex-col` |
| 4 | `strokeDashes` + `strokes`/`fills` → border-style |
| 5 | `rotation` → `rotate-` |
| 6 | `clipsContent` → `overflow-hidden` |
| 7 | `layoutSizingH/V` → `flex-1`/`w-full`/`h-full` |
| 8 | SVG fill 색상 → `<img>` vs 인라인 SVG 판정 |

---

## 컴포넌트 분해 / 합성 규칙

Figma 디자인을 React 코드로 변환할 때, **하나의 거대한 컴포넌트가 아닌 적절한 단위로 분해**하여 구현한다.

### 계층 모델: Atomic 3레벨

| 레벨 | 정의 | 예시 | Figma 대응 |
|------|------|------|-----------|
| **Atoms** | 더 이상 쪼갤 수 없는 최소 UI 단위 | `Button`, `Input`, `Icon`, `Badge` | Base Components |
| **Molecules** | Atom 2개 이상의 기능 조합 | `SearchBar`, `FormField`, `LabeledInput` | Composite Components |
| **Organisms** | 독립적 UI 섹션 | `Header`, `ProductCard`, `LoginForm` | Section Components |

> 라벨(atoms/molecules)은 멘탈 모델이지 엄격한 규칙이 아니다. 분류 논쟁에 시간을 쓰지 않는다.

#### Atomic 레벨 수치 기준

이름과 구조를 종합 판단하되, 애매하면 아래 수치 기준을 따른다.

```
Atom:
  - 하위 COMPONENT/INSTANCE 자식 0개
  - 하위가 TEXT, VECTOR, RECTANGLE 등 리프 노드만 포함
  - 노드 총 개수 ≤ 10

Molecule:
  - 하위 INSTANCE 자식 1개 이상 (Atom을 조합)
  - 노드 총 개수 11~50
  - COMPONENT_SET이 아닌 단독 COMPONENT

Organism:
  - 하위 INSTANCE 자식 2개 이상 (Molecule 포함)
  - 노드 총 개수 > 50 또는 depth > 3
  - COMPONENT_SET이거나, 독립적 UI 섹션 이름 (Header, Card, Form, List 등)
```

### 재사용 범위에 따른 배치

컴포넌트는 **가장 좁은 범위(Local)에서 시작**하고, 재사용 필요가 확인되면 승격시킨다.

| 계층 | 설명 | 배치 위치 |
|------|------|----------|
| **Core** | 프로젝트 전체 범용. 비즈니스 로직 없음 | `shared/ui/atoms/` 또는 `shared/ui/molecules/` |
| **Domain** | 특정 도메인 내 공유 | `features/{domain}/components/` |
| **Local** | 특정 화면에서만 사용. 재사용 의도 없음 | 해당 페이지/기능 폴더 내 |

### 분리 판단 경험적 수치

| 항목 | 경고 수준 | 분리 강력 권장 | 액션 |
|------|----------|-------------|------|
| Props 개수 | 5~6개 | 7개 이상 | 컴포넌트 분리 또는 Named Props 구조 전환 |
| 파일 라인 수 | 200줄 | 300줄 이상 | 하위 컴포넌트 / 커스텀 훅 추출 |
| JSX 깊이 | 3단 중첩 | 4단 이상 | 하위 컴포넌트 추출 |
| useState 개수 | 3~4개 | 5개 이상 | useReducer 또는 커스텀 훅 |
| useEffect 개수 | 2개 | 3개 이상 | 각 effect를 커스텀 훅으로 분리 |

> 절대 기준이 아닌 경험적 참고치. 컨텍스트에 따라 유연하게 적용.

### 분리해야 할 때 (YES 2개 이상이면 분리 검토)

- 컴포넌트 설명에 "그리고(and)"가 들어가는가?
- Props가 6개를 초과하는가?
- 관련 없는 state가 3개 이상 공존하는가?
- 같은 UI/로직이 3곳 이상에서 반복되는가?
- 디자인 변경과 로직 변경이 다른 시점에 발생하는가?
- 특정 부분만 격리 테스트하기 어려운가?
- 컴포넌트가 200줄을 크게 초과하는가?
- JSX 중첩이 4단 이상인가?

### ⛔ 분리하지 말아야 할 때 (YES 1개라도 있으면 보류)

- 분리 후 props 수가 오히려 증가하는가?
- 추출한 컴포넌트의 이름을 짓기 어려운가?
- 1~2곳에서만 사용되고 사용 맥락이 다른가?
- 분리 후 코드 흐름 추적이 더 어려워지는가?
- 자식이 부모 없이는 의미가 없는가? (1:1 종속)
- "나중에 쓸지도 몰라"는 추측에 기반한 분리인가?

### Figma 시그널 → React 합성 방식 매핑

| Figma 시그널 | React 합성 방식 | 판단 근거 |
|-------------|----------------|----------|
| Variants가 있는 컴포넌트 | **Props** | Enum/Boolean → union type / boolean prop |
| Instance Swap 1개 | **children** | 교체 가능한 단일 영역 |
| Instance Swap 2개 이상 | **Named Props** | 각 영역을 별도 prop으로 전달 |
| 동일 구조 자식 반복 | **배열 Props** | `items.map()`으로 렌더링 |
| Boolean Property (show/hide) | **boolean Props** | `showIcon?: boolean` |
| 레이어 이름에 `/`가 있음 | **Named Props** 조합 | `Card/Header` → header prop |
| 고정 영역 + 가변 영역 | **Named Props + children** | header, footer는 Named Props, 본문은 children |

#### 합성 방식 우선순위 (중첩 시)

여러 Figma 시그널이 중첩될 때 아래 우선순위로 **주 패턴**을 결정한다. 공존 가능한 패턴은 함께 적용한다.

```
우선순위 (공존 가능, 상위가 기본 패턴):
  1. COMPONENT_SET (Variants) → Props union type (기본 패턴)
  2. Instance Swap 2개+ → Named Props (1번과 공존)
  3. Instance Swap 1개 → children (1번과 공존)
  4. 동일 구조 반복 → 배열 Props
  5. Boolean Property → boolean Props (모든 패턴에 추가 적용)

중첩 예시:
  Card: Variants(featured/normal) + Instance Swap(header, content)
  → compositionPattern: "namedProps" (주 패턴)
  → props: variant + header + children
```

### 합성 방식 5가지

| 방식 | 사용 시점 | 예시 |
|------|----------|------|
| **Props** | Variant, 크기, 상태 등 값 전달 | `<Button variant="primary" size="md">` |
| **children** | 내부 콘텐츠 영역 1개 | `<Card>{children}</Card>` |
| **Named Props** | 내부 콘텐츠 영역 2개 이상 | `<Card header={..} footer={..}>{children}</Card>` |
| **배열 Props** | 동일 구조 반복 | `<List items={[...]} />` |
| **boolean Props** | 요소 표시/숨김 제어 | `<Input showIcon hasCloseButton />` |

### Props Drilling 방지

| Props 전달 깊이 | 권장 방식 |
|----------------|----------|
| 1단계 (부모→자식) | Props 직접 전달 |
| 2단계 (부모→손자) | children으로 중간 레이어 제거 |
| 3단계 이상 | Zustand 또는 Context |

### 분리 방법 우선순위

| 우선순위 | 방법 | 사용 시점 |
|---------|------|----------|
| 1 | **Custom Hook 추출** | 로직만 분리 (가장 가벼움) |
| 2 | **하위 컴포넌트 추출** | UI 일부를 별도 컴포넌트로 분리 |
| 3 | **Named Props 구조** | 여러 영역을 유연하게 조합할 때 |
| 4 | **Context / Zustand** | 깊은 트리에서 상태 공유 필요 시 |

### Custom Hook 추출 기준

**추출해야 할 때:**
- 동일 로직이 2개 이상 컴포넌트에서 사용
- 복잡한 로직을 단순 인터페이스 뒤에 숨길 수 있음
- useEffect를 hook으로 감싸면 더 명확

**추출하지 않아야 할 때:**
- useState 하나를 감싸는 수준
- 명확한 이름을 짓기 어려움 → 아직 시기 아님

### 컴포넌트 분해 의사결정 플로우

```
Figma 컴포넌트를 코드로 변환할 때:

1) 이 UI가 다른 곳에서도 쓰이는가?
   ├─ 3곳 이상 → shared 컴포넌트 (atoms/molecules/organisms)
   ├─ 같은 도메인 내 → domain 컴포넌트
   └─ 1곳만 → 해당 페이지/기능 폴더에 local 컴포넌트

2) Figma에서 Variants가 있는가?
   ├─ YES → Props union type으로 매핑
   └─ NO  → 단일 컴포넌트

3) Instance Swap / 빈 영역(Slot)이 있는가?
   ├─ 1개 → children
   ├─ 2개 이상 → Named Props (header, content, footer)
   └─ 없음 → 고정 레이아웃

4) Props가 6개를 초과하는가?
   ├─ YES → Named Props 구조로 리팩토링 또는 하위 컴포넌트 분리
   └─ NO  → 현재 구조 유지

5) 비즈니스 로직이 섞여 있는가?
   ├─ YES → Custom Hook으로 로직 추출
   └─ NO  → 순수 UI 컴포넌트 유지
```

### Figma 네이밍 → React 네이밍

| Figma (슬래시 구분) | React (PascalCase) | 파일명 |
|--------------------|-------------------|--------|
| `Button/Primary` | `<Button variant="primary">` | `Button.tsx` |
| `Card/Product/Horizontal` | `<ProductCard layout="horizontal">` | `ProductCard.tsx` |
| `Icon/Arrow/Right` | `<ArrowRightIcon />` | `ArrowRightIcon.tsx` |

### Figma Variant → React Props 매핑

| Figma 속성 | React 매핑 |
|-----------|-----------|
| Boolean Variant (Yes/No) | `boolean` prop |
| Enum Variant (Primary/Secondary) | `string` union type |
| Text Property | `string` prop |
| Instance Swap | `ReactNode` prop |

### 공유 용어 사전

| Figma 용어 | 코드 용어 |
|-----------|----------|
| Size: S / M / L | `size: 'sm' \| 'md' \| 'lg'` |
| Type: Primary / Secondary | `variant: 'primary' \| 'secondary'` |
| State: Default / Hover / Disabled | 이벤트 핸들러 + `disabled` prop |
