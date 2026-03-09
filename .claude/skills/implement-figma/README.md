# implement-figma Skill

Figma 디자인을 React + Tailwind 컴포넌트 코드로 변환하는 Claude Code 스킬.

## 사용법

```bash
# figma-targets.md에 정의된 노드 전체 구현
/implement-figma

# 특정 Figma URL 직접 지정
/implement-figma https://figma.com/design/{FILE_KEY}/{FILE_NAME}?node-id=1:2
```

## 파일 구성

| 파일 | 역할 | 업데이트 시 |
|------|------|------------|
| `SKILL.md` | 스킬 실행 로직 (Phase 0~3) | 덮어쓰기 |
| `rules.md` | 공통 변환 규칙 (API 호출 전략, 코드 생성 규칙 등) | 덮어쓰기 |
| `config.md` | 프로젝트별 설정 (스택, 경로, 기존 컴포넌트 등) | **보존** |

## 실행 흐름

```
Phase 0: 입력 파싱
  ├── figma-targets.md 또는 URL 인자 파싱
  ├── fileKey, nodeId 추출
  ├── config.md / rules.md 로드
  └── 대상 프로젝트 기존 코드 파악 (CLAUDE.md, 기존 컴포넌트, 디자인 토큰)
      ↓
Phase 1: Scout (정찰)
  ├── get_metadata → 노드 규모 판단 (소형/대형)
  ├── get_screenshot → 시각 참조 이미지
  ├── get_design_context → 디자인 데이터 추출
  │     ├── 소형 (≤50 노드, depth ≤5): 1회 호출
  │     └── 대형 (>50 노드 또는 depth >5): 경계 노드 감지 후 다중 호출
  ├── get_code_connect_map → 기존 컴포넌트 매핑 확인
  ├── 컴포넌트 분석 (기존 대조, 신규 도출, 공유 식별)
  └── .figma-manifest.json 생성 (3+ 노드 시)
      ↓
Phase 2: 병렬 구현
  ├── N개 에이전트를 worktree 격리 환경에서 생성 (isolation: "worktree")
  ├── 에이전트별 할당:
  │     Step 1: 디자인 토큰 등록
  │     Step 2: 할당된 컴포넌트 생성
  │     Step 3: SVG/이미지 에셋 export (⛔ 생략 금지)
  │     Step 4: 코드 생성 (에셋 import 사용)
  │     Step 5: 할당된 노드 조립
  └── 에이전트 수: ceil(노드 수 / 10), 최소 3, 최대 10
      ↓
Phase 3: 병합 & 정리
  ├── 에이전트 결과 수집 및 사용자에게 제시
  ├── 사용자 승인 후 순차 병합 (자동 병합 없음)
  │     ├── 전체 merge
  │     ├── 선택 merge (특정 agent만)
  │     ├── 검토 후 결정 (worktree 경로 안내)
  │     └── 취소 (모든 worktree 폐기)
  ├── 충돌 해결 (디자인 토큰은 union merge)
  └── worktree 정리
```

### 단일 모드 (Phase 1S)

노드 1~2개일 때는 manifest 생성을 건너뛰고 직접 구현합니다:

1. 메타데이터 스캔 + 스크린샷 확보
2. 규모 판단 → 디자인 컨텍스트 추출
3. **SVG/이미지 에셋 export** (⛔ 생략 금지)
4. 구현 계획 수립 (기존 컴포넌트 대조, 신규 토큰 도출)
5. 구현 실행 (토큰 → 컴포넌트 → 페이지 조립, 에셋 파일 import 사용)

### 대형 노드 섹션별 탐색

섹션 3개+ 또는 노드 100+ 시:

1. `get_metadata`로 children 확인 (depth 1~2) → 시각적 섹션 분할
2. 각 섹션마다 `get_screenshot` → `get_design_context` → 잘렸으면 재귀 드릴다운
3. 한 섹션 컨텍스트 확보 → 즉시 구현 → `get_screenshot` 비교 검증 → 다음 섹션

## 핵심 변환 규칙

### ⛔ 절대 규칙

1. 디자인 컨텍스트(`get_design_context`) 없이 추측으로 구현하지 않는다
2. 스크린샷 비교 없이 섹션 구현을 완료 처리하지 않는다
3. SVG/이미지 에셋은 반드시 Figma REST API로 export한다
4. Figma 텍스트를 임의로 변경하거나 placeholder로 대체하지 않는다
5. 스크린샷에서 "~처럼 보인다"로 CSS를 결정하지 않는다 — `get_design_context` 속성값 기준으로 변환한다

### API 호출 전략

| 조건 | 전략 |
|------|------|
| ≤50 노드, depth ≤5 | `get_design_context` 1회 호출 |
| >50 노드 또는 depth >5 | 경계 노드 감지 후 다중 호출 |
| 노드당 API 호출 | 최대 15회 (초과 시 현재 컨텍스트로 구현 시작) |

### 콘텐츠 충실도

Figma에 있는 모든 콘텐츠를 그대로 사용합니다.

- **텍스트**: TEXT 노드의 `characters` 값을 그대로 사용
- **텍스트 스타일**: `fills`(= 폰트 색상), `fontSize`, `fontWeight`, `lineHeight`, `letterSpacing`을 `get_design_context`에서 읽어 적용
- **이미지**: IMAGE fill 노드는 `getImages(format: 'png')`로 export하여 저장
- **배경색/그라데이션**: `get_design_context`의 fills 속성을 적용
- **opacity**: 1이 아니면 정확히 반영

### 코드 생성

- **Auto Layout** → Flexbox / CSS Grid
- **색상** → Tailwind 토큰 클래스 사용
- **간격** → Tailwind scale (p-4, gap-6 등)
- **DOM depth** → 최대 3~4 레벨 (단순 wrapper Frame은 CSS로 평탄화)
- **SVG/아이콘** → Figma REST API로 원본 SVG export 후 그대로 사용

### 디자인 토큰 완전성

- 새 섹션 구현 시 사용된 모든 색상값을 디자인 토큰 파일 `@theme`과 대조
- 누락된 색상이 있으면 구현 전에 토큰을 먼저 등록
- Gray 계열은 50 단위까지, Blue/Red 등도 Figma 사용 단계를 누락 없이 등록

### 시각적 요소별 변환 규칙

#### 선 / 구분선

스크린샷에서 선이 보이면 → `get_design_context`에서 노드 타입과 속성을 먼저 확인:

**A. stroke 기반** (LINE, VECTOR, strokes가 있는 노드):

| Figma 속성 | CSS |
|-----------|-----|
| `strokeDashes: []` 또는 없음 | `border-solid` 또는 `bg-{color}` (1px 선) |
| `strokeDashes: [길이, 간격]` | `border-dashed` |
| `strokeDashes: [짧은값, 짧은값]` | `border-dotted` |

**B. fills 기반** (FRAME/RECTANGLE, strokes 없음, fills만 있음):
- `width: 1` + `fills` → `w-px bg-{color}` (세로선)
- `height: 1` + `fills` → `h-px bg-{color}` (가로선)
- fills 기반 노드에 border-style을 부여하지 않는다

### SVG/아이콘 에셋 (⛔ 생략 금지)

아이콘/벡터 노드는 Figma REST API `getImages(format: 'svg')`로 원본 SVG를 export합니다.
SVG에 색상, viewBox, path 등 모든 시각 정보가 포함되어 있으므로 별도 Tailwind 변환이 불필요합니다.

1. `get_design_context`에서 VECTOR, BOOLEAN_OPERATION, INSTANCE(아이콘), IMAGE fill 노드 식별
2. `getImages(fileKey, nodeIds, { format: 'svg' })`로 export URL 획득
3. export URL에서 실제 SVG 다운로드 → 프로젝트 에셋 디렉토리에 저장
4. **SVG 파일 내 `fill`, `stroke` 속성값 확인** → import 방식 결정:
   - `fill` 고정 색상 → `<img src={...}>` 사용 가능
   - `fill="currentColor"` → 부모에 `text-{color}` 필수
   - `fill="none"` 또는 속성 없음 → 인라인 SVG 또는 React SVG 컴포넌트
5. SVG fill 속성이 Figma 디자인 색상과 불일치하면 SVG 파일 내 fill 값을 수정

**스크린샷에 아이콘이 보이더라도 반드시 파일로 다운로드해야 합니다.**

**SVG를 코드로 직접 그리지 않음**: JSX에 `<svg>/<path>` 직접 작성, CSS border/background로 아이콘 흉내 등 금지. 단순 도형이라도 반드시 Figma export SVG 파일을 사용

### 레이아웃 속성 적용

**Auto Layout 노드 (우선)**: `get_design_context`가 반환하는 속성을 직접 사용
- `paddingLeft/Right/Top/Bottom` → padding
- `itemSpacing` → gap
- `layoutMode` → flex-direction (HORIZONTAL → row, VERTICAL → column)
- `primaryAxisAlignItems` → justify-content
- `counterAxisAlignItems` → align-items
- `layoutWrap` → flex-wrap

**절대 배치 노드**: constraints + position으로 CSS 배치
- `layoutPositioning: "ABSOLUTE"` → `position: absolute`
- `constraints.horizontal/vertical` → left/right/top/bottom + offset
- 부모에 `position: relative` 설정
- 좌표(x, y)를 padding/gap으로 변환하지 않음

## Manifest 구조 (.figma-manifest.json)

Phase 1에서 생성되어 Phase 2 에이전트에 작업을 분배합니다.

```json
{
  "fileKey": "abc123",
  "generatedAt": "2026-02-26T12:00:00Z",
  "projectContext": {
    "componentsPath": "src/components/",
    "stylesPath": "src/styles/globals.css",
    "existingComponents": ["Button", "Card"]
  },
  "designTokens": {
    "new": [{ "name": "--color-blue-500", "value": "#3B82F6", "source": "nodeId:1:2" }]
  },
  "components": [
    {
      "id": "comp-1",
      "name": "SearchForm",
      "figmaNodeId": "3577:49688",
      "type": "shared",
      "assignedAgent": 0,
      "referencedByNodes": ["1:2", "3336:27168"],
      "props": ["onSearch", "defaultValue"],
      "outputPath": "src/components/SearchForm.tsx"
    }
  ],
  "nodes": [
    {
      "nodeId": "1:2",
      "name": "Main Page",
      "priority": "high",
      "sizeType": "large",
      "assignedAgent": 0,
      "requiredComponents": ["comp-1"],
      "outputPath": "src/pages/MainPage.tsx",
      "designContext": {
        "screenshotRef": true,
        "boundaryNodes": ["3577:49688"]
      }
    }
  ],
  "agents": [
    {
      "id": 0,
      "assignedComponents": ["comp-1"],
      "assignedNodes": ["1:2"],
      "totalWork": 2
    }
  ],
  "agentCount": 3
}
```

## 에이전트 분배 전략

- **에이전트 수**: `Math.max(3, Math.min(10, Math.ceil(nodeCount / 10)))`
- **분배 순서**: 공유 컴포넌트 → 고유 컴포넌트 → 노드 (우선순위 순, round-robin)
- **격리**: 각 에이전트는 별도 git worktree에서 실행 (`isolation: "worktree"`), 교차 파일 수정 없음
- **토큰 예외**: 디자인 토큰 파일은 모든 에이전트가 추가 가능 (merge 시 중복 제거)

## 사용하는 MCP 도구

| 도구 | 출처 | 용도 |
|------|------|------|
| `get_metadata` | Figma MCP | 노드 규모 확인 |
| `get_screenshot` | Figma MCP | 시각 참조 이미지 |
| `get_design_context` | Figma MCP | 디자인 데이터 추출 (코드 + 힌트) |
| `get_code_connect_map` | Figma MCP | 기존 컴포넌트 매핑 확인 |
| `getImages` | Figma REST API | SVG/이미지 에셋 export |
| `analyze_tree` | figma-to-code MCP | 컴포넌트 후보 / 래퍼 패턴 분석 |
| `generate_component` | figma-to-code MCP | React 컴포넌트 코드 생성 |
| `generate_story` | figma-to-code MCP | Storybook 스토리 생성 |

## MCP 서버 소스 (mcp-server/)

스킬이 사용하는 figma-to-code MCP 서버의 구조입니다.

```
mcp-server/
├── src/
│   ├── index.ts                    # MCP 서버 진입점 (stdio transport)
│   ├── server.ts                   # 서버 설정 & 10개 Tool 라우팅
│   ├── types.ts                    # 전역 타입 정의
│   │
│   ├── figma/                      # Figma 연동
│   │   ├── client.ts               # Figma REST API 클라이언트
│   │   │                             getFile, getFileNodes, getImages,
│   │   │                             getComponents, getComponentSets, getStyles
│   │   ├── traverser.ts            # 노드 트리 탐색 & 정규화
│   │   │                             traverseNode, countNodes, extractAllPages
│   │   └── parser.ts               # 트리 분석 & 컴포넌트 감지
│   │                                 identifyComponents, detectWrapperPattern,
│   │                                 mapToMdDocs
│   │
│   ├── generator/                  # 코드 생성
│   │   ├── component-generator.ts  # React 컴포넌트 코드 생성
│   │   │                             extractStyles, inferProps, nodeToJSX,
│   │   │                             generateComponent (일반 + Composed 모드)
│   │   └── story-generator.ts      # Storybook 스토리 생성
│   │                                 extractVariants, generateStory, generatePageStory
│   │
│   ├── tools/                      # MCP Tool 핸들러
│   │   ├── extract-layers.ts       # extract_layers: Figma 파일 레이어 추출
│   │   ├── analyze-tree.ts         # analyze_tree: 컴포넌트 후보 분석
│   │   ├── generate-component.ts   # generate_component: React 코드 생성
│   │   ├── generate-story.ts       # generate_story: Storybook 스토리 생성
│   │   ├── verify-all.ts           # verify_pixel_diff, verify_elements,
│   │   │                             verify_assets, calculate_coverage,
│   │   │                             cleanup_verification (5개 검증 도구)
│   │   └── run-full-pipeline.ts    # run_full_pipeline: 전체 파이프라인
│   │
│   └── verifier/                   # 검증 엔진
│       ├── pixel-diff-verifier.ts  # pixelmatch 기반 스크린샷 비교
│       ├── element-verifier.ts     # 9개 카테고리 요소별 검증
│       ├── asset-verifier.ts       # 에셋 다운로드/참조/유효성 검증
│       ├── coverage-calculator.ts  # 커버리지 종합 계산 & 리포트
│       ├── screenshot-capture.ts   # 스크린샷 캡처 요청 구조화
│       └── cleanup.ts              # 임시 파일 정리
│
├── package.json                    # 의존성 & 스크립트
├── tsconfig.json                   # TypeScript 설정 (ES2022, strict)
└── dist/                           # 빌드 결과물
```

### 주요 의존성

- `@modelcontextprotocol/sdk` — MCP 프로토콜 라이브러리
- `pixelmatch` — 픽셀 diff 비교
- `pngjs` — PNG 이미지 처리
- `sharp` — 이미지 리사이징

### 빌드 & 실행

```bash
cd mcp-server
npm install        # 의존성 설치
npm run build      # TypeScript 빌드 (tsc)
npm run dev        # 개발 모드 (tsx watch)
npm test           # 테스트 실행 (vitest)
```

## config.md 설정 항목

프로젝트별로 커스터마이징할 수 있는 항목:

- **스택**: 프레임워크, 번들러, 스타일링 시스템
- **경로**: 컴포넌트, 페이지, 스타일, 에셋 디렉토리
- **디자인 토큰**: 토큰 시스템 매핑
- **기존 컴포넌트**: 재사용 가능한 컴포넌트 목록
- **커스텀 규칙**: rules.md 오버라이드
