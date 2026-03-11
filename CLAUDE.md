# Figma → Code

Figma 디자인을 React 코드로 변환하는 도구 모음.
MCP 서버 + Claude Code 스킬로 구성되며, Figma REST API 기반 추출 → React + Tailwind 컴포넌트 생성 → 렌더링 기반 검증까지 자동화합니다.

## 구성 요소

```
figma-to-code/
├── mcp-server/                    # MCP 서버 (Figma API + 코드 생성 + 검증)
│   └── src/
│       ├── index.ts               # 엔트리포인트
│       ├── server.ts              # Tool 등록 및 라우팅
│       ├── types.ts               # 공통 타입 정의
│       ├── figma/                  # Figma REST API
│       │   ├── client.ts          #   API 클라이언트
│       │   ├── parser.ts          #   응답 파서
│       │   └── traverser.ts       #   노드 트리 탐색
│       ├── generator/             # 코드 생성
│       │   ├── component-generator.ts  # React 컴포넌트 생성
│       │   └── story-generator.ts      # Storybook 스토리 생성
│       ├── verifier/              # 검증 엔진
│       │   ├── pixel-diff-verifier.ts  # 픽셀 diff (Figma↔렌더링)
│       │   ├── element-verifier.ts     # 요소별 9항목 검증
│       │   ├── asset-verifier.ts       # 에셋(SVG/이미지) 검증
│       │   ├── coverage-calculator.ts  # 종합 커버리지 계산
│       │   ├── screenshot-capture.ts   # 스크린샷 캡처
│       │   ├── code-linter.ts          # 코드 품질 검사
│       │   └── cleanup.ts             # 임시 파일 정리
│       └── tools/                 # MCP Tool 정의
│           ├── extract-layers.ts
│           ├── analyze-tree.ts
│           ├── generate-component.ts
│           ├── generate-story.ts
│           ├── verify-all.ts
│           └── run-full-pipeline.ts
├── .claude/
│   ├── skills/
│   │   ├── implement-figma/       # /implement-figma 스킬
│   │   │   ├── SKILL.md           #   실행 프로세스 (Phase 0→1→2→3)
│   │   │   ├── rules.md           #   변환 규칙 + 캐시 전략
│   │   │   ├── rules-component.md #   컴포넌트 분해/합성 규칙 (Atomic 3레벨, 합성 방식 5종, Figma 시그널 매핑)
│   │   │   ├── rules-parallel.md  #   병렬 구현 규칙 (매니페스트 스키마, 팀 조정, Merge)
│   │   │   └── config.md          #   프로젝트별 설정 (사용자 편집)
│   │   └── verify-figma/          # /verify-figma 스킬
│   │       ├── SKILL.md           #   검증 프로세스 (Phase V0→V7)
│   │       ├── rules.md           #   검증 규칙
│   │       └── config.md          #   프로젝트별 검증 설정 (사용자 편집)
│   └── hooks/
│       ├── lint-generated.sh      # PostToolUse hook — 코드 작성 시 12개 Rule 자동 검사
│       └── verify-figma-props.sh  # 캐시 기반 Figma 속성↔코드 대조 (8개 Check)
├── .github/workflows/
│   └── design-fidelity.yml        # CI: 디자인 충실도 검증
└── docs/blueprint/                # 설정 예시
```

## 사용 방법

### 1. MCP 서버 등록

대상 프로젝트의 `.mcp.json`에 추가:
```json
{
  "mcpServers": {
    "figma-to-code": {
      "command": "npx",
      "args": ["tsx", "/path/to/figma-to-code/mcp-server/src/index.ts"],
      "env": {
        "FIGMA_ACCESS_TOKEN": "your-token",
        "OUTPUT_DIR": "./generated",
        "STYLE_SYSTEM": "tailwind"
      }
    }
  }
}
```

### 2. 스킬 실행

```
/implement-figma    # Figma 디자인 → React 코드 생성
/verify-figma       # 생성된 코드를 Figma 원본과 렌더링 기반 검증
```

## MCP Tools

| Tool | 설명 |
|------|------|
| `extract_layers` | Figma 파일에서 레이어/노드를 재귀 추출 |
| `analyze_tree` | 추출된 트리 분석, 컴포넌트 후보 식별, 래퍼 패턴 감지 |
| `generate_component` | 단일 노드를 React 컴포넌트 코드로 변환 |
| `generate_story` | Storybook 스토리 파일 생성 |
| `verify_pixel_diff` | Figma 스크린샷 vs 렌더링 스크린샷 픽셀 diff |
| `verify_elements` | 요소별 9항목 상세 검증 (존재/배치/간격/크기/색상/타이포/테두리/효과/아이콘) |
| `verify_assets` | 에셋(SVG/이미지) 다운로드 및 참조 검증 |
| `calculate_coverage` | 픽셀 diff + 요소 검증 + 에셋 검증 → 종합 커버리지 |
| `cleanup_verification` | 검증 후 임시 스크린샷/diff 파일 정리 |
| `run_full_pipeline` | 전체 파이프라인 (추출→분석→생성→검증, 99% 커버리지까지 반복) |

## 스킬 파이프라인

### /implement-figma

```
Phase 0: 입력 파싱 + 기존 컴포넌트 레지스트리 구축
Phase 1: Scout — Figma MCP 데이터 수집 → 컴포넌트 분석 → 기존 매칭(5단계) → Diff 검출 → 매니페스트 생성
Phase 2: 병렬 구현 — worktree agent × N (action별 분기: reuse/extend-variant/add-props/update-style/wrap/rewrite)
Phase 3: Merge 및 확인
```

- 노드 1~2개: Phase 1S(단일 모드) → 병렬화 생략, 순차 실행
- 노드 3개+: 매니페스트 기반 병렬 agent 실행
- 기존 컴포넌트 매칭: Code Connect → 이름(정확/퍼지) → Props 유사도 → 매칭 없음
- Diff 검출: Variant/Props, 구조, 스타일 3축 비교 → action 자동 결정
- 컴포넌트 분해(rules-component.md): Atomic 3레벨(Atom/Molecule/Organism), 재사용 범위(Core/Domain/Local), Figma 시그널→합성 방식 매핑(Props/children/Named Props/배열/boolean)

### /verify-figma

```
Phase V0: 렌더링 환경 준비 (Playwright MCP 필수)
Phase V1: Figma 스크린샷 vs 렌더링 스크린샷 + 픽셀 diff
Phase V2: 요소별 9항목 상세 검증
Phase V3: 에셋 + 속성 대조 + 코드 품질
Phase V4: 정확도 판정 (99% 미만 → 자동 수정)
Phase V5: 자동 수정 → Phase V1 재검증 루프
Phase V6: 렌더링 최종 확인
Phase V7: 임시 파일 정리
```

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `FIGMA_ACCESS_TOKEN` | Figma Personal Access Token | (필수) |
| `OUTPUT_DIR` | 생성 파일 출력 경로 | `./generated` |
| `STYLE_SYSTEM` | `tailwind` \| `css-modules` | `tailwind` |
| `STORYBOOK_URL` | Storybook 서버 URL | `http://localhost:6006` |

## Commands

```bash
cd mcp-server
npm install        # 의존성 설치
npm run build      # TypeScript 빌드
npm run dev        # 개발 모드 (tsx watch)
npm test           # 테스트 실행
```

## 자동 검출 (Hooks)

### lint-generated.sh (PostToolUse — Write/Edit 시)

hex/rgb 하드코딩, inline SVG, 아이콘 라이브러리, placeholder, CSS 아이콘, img alt, line-clamp overflow 등 12개 Rule 자동 검사. 위반 시 차단(❌) 또는 경고(⚠️).

### verify-figma-props.sh (검증 Phase V3)

캐시된 design-context JSON과 코드를 대조하여 padding/gap/flex-direction/border-style/rotation/overflow/layoutSizing/SVG fill 8개 항목 자동 검출.

## 핵심 설계 원칙

1. **Figma MCP 캐시**: 동일 nodeId에 대한 MCP 호출은 1회만 → `/tmp/figma-cache/{fileKey}/`에 캐시
2. **디자인 컨텍스트 기반**: 스크린샷 추측이 아닌 `get_design_context` 속성값으로 변환
3. **렌더링 기반 검증**: 코드 검증이 아닌 실제 렌더링 스크린샷 비교 (Playwright MCP)
4. **기존 컴포넌트 재사용**: 5단계 매칭 파이프라인 + 3축 Diff 검출로 기존 코드 활용 극대화
5. **병렬 agent**: 대규모 디자인은 매니페스트 기반 worktree 격리 병렬 구현
