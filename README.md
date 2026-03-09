# Figma → Code Skills

Figma 디자인을 React 코드로 구현하는 Claude Code 스킬 패키지입니다.
`/implement-figma`로 구현하고, `/verify-figma`로 검증하는 2단계 워크플로우를 제공합니다.

## 특징

- **Figma MCP 캐시**: 동일 nodeId 호출 1회만 → `/tmp/figma-cache/`에 캐시, agent 간 공유
- **기존 컴포넌트 재사용**: 5단계 매칭 파이프라인 + 3축 Diff 검출 → 기존 코드 활용 극대화
- **컴포넌트 분해**: Atomic 3레벨 + Figma 시그널 기반 합성 방식 자동 결정
- **병렬 agent**: 노드 3개+ 시 매니페스트 기반 worktree 격리 병렬 구현
- **렌더링 기반 검증**: Playwright MCP로 실제 렌더링 스크린샷 vs Figma 원본 비교
- **자동 수정 루프**: 99% 정확도까지 자동 수정 → 재검증 반복
- **코드 자동 검출**: PostToolUse hook(12 Rule) + 캐시 기반 속성 대조(8 Check)

## 스킬 구조

```
.claude/skills/
├── implement-figma/
│   ├── SKILL.md           # 구현 프로세스 (Phase 0→1→2→3)
│   ├── rules.md           # 변환 규칙 + 매니페스트 스키마 + 캐시 전략
│   ├── rules-component.md # 컴포넌트 분해/합성 규칙 (Atomic 3레벨, 합성 방식 5종, Figma 시그널 매핑)
│   └── config.md          # 프로젝트별 설정 (업데이트 시 보존)
└── verify-figma/
    ├── SKILL.md           # 검증 프로세스 (Phase V0→V7)
    ├── rules.md           # 검증 규칙
    └── config.md          # 프로젝트별 검증 설정 (업데이트 시 보존)
```

### 파일 역할

| 파일 | 역할 | 업데이트 시 |
|------|------|-----------|
| `SKILL.md` | 실행 프로세스 정의 | 덮어쓰기 |
| `rules.md` | 공통 변환/검증 규칙 | 덮어쓰기 |
| `rules-component.md` | 컴포넌트 분해/합성 규칙 | 덮어쓰기 |
| `config.md` | 프로젝트별 설정 | **보존** |

### 설정 우선순위

`config.md > rules.md` — config.md의 설정이 rules.md와 충돌하면 config.md가 우선합니다.

## 다른 프로젝트에서 사용하기

### 1. 이 레포 클론

```bash
git clone <this-repo-url> ~/figma-to-code
```

### 2. 대상 프로젝트에 스킬 설치

```bash
cd ~/my-project
bash ~/figma-to-code/setup-skills.sh
```

설치되는 것:
- `.claude/skills/implement-figma/` (SKILL.md, rules.md, rules-component.md, config.md)
- `.claude/skills/verify-figma/` (SKILL.md, rules.md, config.md)
- `.claude/hooks/` (lint-generated.sh, verify-figma-props.sh)
- `figma-targets.example.md` (figma-targets.md가 없을 때만)

### 3. 프로젝트 설정 커스터마이징

```bash
# 구현 설정
vi .claude/skills/implement-figma/config.md

# 검증 설정
vi .claude/skills/verify-figma/config.md
```

config.md에서 설정하는 것:
- 스택 (framework, bundler, styling)
- 경로 (components, pages, styles, assets)
- 디자인 토큰 체계
- 기존 재사용 컴포넌트 목록
- rules.md를 오버라이드할 커스텀 규칙

### 4. Figma MCP 연결

```bash
# 공식 Figma Remote MCP (권장)
claude mcp add --transport http --scope project figma https://mcp.figma.com/mcp

# 또는 Figma Desktop MCP
claude mcp add --transport http --scope project figma-desktop http://127.0.0.1:3845/mcp
```

### 5. 구현 대상 작성

`figma-targets.example.md`를 참고하여 `figma-targets.md`를 작성합니다:

```markdown
## Figma 파일 정보
- **URL**: https://www.figma.com/design/{FILE_KEY}/{FILE_NAME}
- **File Key**: {FILE_KEY}

## 구현 대상 노드
| 순서 | Node ID | 이름 | 설명 | 우선순위 |
|------|---------|------|------|----------|
| 1 | 1:2 | 메인 페이지 | 전체 화면 | high |
| 2 | 3577:49688 | 검색 폼 | 검색 영역 | high |
```

### 6. 스킬 실행

```bash
# Claude Code에서
/implement-figma              # figma-targets.md 기반 구현
/verify-figma                 # 구현 결과 검증
/verify-figma <node-id>       # 특정 노드만 검증
```

## 스킬 업데이트

rules.md나 SKILL.md가 업데이트된 경우, 대상 프로젝트에서:

```bash
bash ~/figma-to-code/update-skills.sh
```

- SKILL.md, rules.md, rules-component.md → 덮어쓰기
- config.md → **보존** (프로젝트 설정 유지)

## 워크플로우

### /implement-figma

```
Phase 0: 입력 파싱 + 기존 컴포넌트 레지스트리 구축
Phase 1: Scout — Figma MCP 데이터 수집 → 컴포넌트 분석
         A. 노드 분류 + 경계 식별 + Atomic 레벨 + 합성 방식
         B. 기존 매칭 (Code Connect → 이름 → Props 유사도)
         D. Diff 검출 (Variant/Props, 구조, 스타일 3축)
         C. 공유/고유 판정 → 매니페스트 생성
Phase 2: 병렬 구현 — worktree agent × N (action별 분기)
Phase 3: Merge 및 확인 (사용자 승인 필수)
```

**기존 컴포넌트 action 분기:**

| action | 의미 | Agent 동작 |
|--------|------|-----------|
| `reuse` | 변경 없음 | import만 추가 |
| `extend-variant` | 새 variant 추가 | 기존 파일에 variant 값 추가 |
| `add-props` | 새 props 추가 | 기존 파일에 props/타입 추가 |
| `update-style` | 스타일 변경 | 기존 파일의 Tailwind 클래스 수정 |
| `wrap` | 래퍼 필요 | 새 래퍼 파일 생성 |
| `rewrite` | 구조 변경 큼 | 기존 파일 대체 (사용자 확인) |

**컴포넌트 분해 (rules-component.md):**

| 개념 | 내용 |
|------|------|
| Atomic 3레벨 | Atom(Button, Icon) → Molecule(SearchBar, FormField) → Organism(ProductCard, LoginForm) |
| 재사용 범위 | Core(전체 범용) → Domain(도메인 내) → Local(화면 단위) |
| 합성 방식 | Variants→Props, Instance Swap 1개→children, 2개+→Named Props, 반복→배열, Boolean→boolean |
| 분리 기준 | Props 7+, 파일 300줄+, JSX 4단 중첩+, useState 5+ → 분리 권장 |

### /verify-figma

```
Phase V0: 렌더링 환경 준비 (Figma MCP + Playwright MCP + figma-to-code MCP)
Phase V1: Figma 스크린샷 vs 렌더링 스크린샷 + 픽셀 diff
Phase V2: 요소별 9항목 상세 검증 (존재/배치/간격/크기/색상/타이포/테두리/효과/아이콘)
Phase V3: 에셋 검증 + 속성 대조(hook) + 코드 품질
Phase V4: 정확도 판정 → 99% 미만이면 자동 수정
Phase V5: 자동 수정 → Phase V1 재검증 루프
Phase V6: 렌더링 최종 확인
Phase V7: 임시 파일 정리
```

## 자동 검출 (Hooks)

### lint-generated.sh (PostToolUse — Write/Edit 시)

| 차단(❌) | 경고(⚠️) |
|----------|----------|
| hex/rgb 하드코딩, inline SVG, 아이콘 라이브러리, placeholder 이미지/텍스트, CSS 아이콘, img alt 누락, line-clamp overflow 누락 | 인라인 px, object-fit 누락, bg+border 혼용, SVG img 크기 누락 |

### verify-figma-props.sh (검증 Phase V3)

캐시된 design-context JSON과 코드를 대조: padding/gap, flex-direction, border-style, rotation, overflow, layoutSizing, SVG fill 8항목 자동 검출.

## MCP Server

이 레포에는 자체 MCP 서버도 포함되어 있습니다. 공식 Figma MCP와 함께 사용합니다.

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

| Tool | 설명 |
|------|------|
| `extract_layers` | Figma 파일에서 레이어/노드 재귀 추출 |
| `analyze_tree` | 트리 분석, 컴포넌트 후보 식별, 래퍼 패턴 감지 |
| `generate_component` | React + Tailwind 컴포넌트 변환 |
| `generate_story` | Storybook 스토리 생성 |
| `verify_pixel_diff` | Figma vs 렌더링 픽셀 diff |
| `verify_elements` | 요소별 9항목 상세 검증 |
| `verify_assets` | 에셋(SVG/이미지) 다운로드 및 참조 검증 |
| `calculate_coverage` | 종합 커버리지 계산 |
| `cleanup_verification` | 임시 스크린샷/diff 파일 정리 |
| `run_full_pipeline` | 전체 파이프라인 (99% 커버리지까지 반복) |

## 개발

```bash
cd mcp-server
npm install        # 의존성 설치
npm run build      # TypeScript 빌드
npm run dev        # 개발 모드 (tsx watch)
npm test           # 테스트 실행
```
