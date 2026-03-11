---
name: implement-figma
description: figma-targets.md 기반으로 Figma 디자인을 React 코드로 구현합니다. Use when user says "/implement-figma", "피그마 구현", "디자인 구현해줘", "figma-targets 실행", or wants to run the full Figma-to-code pipeline with component matching, manifest generation, and parallel agent execution. Requires figma-targets.md in project root.
---

# Figma 디자인 구현 스킬

대상 프로젝트의 `figma-targets.md` 파일을 읽고 Figma 디자인을 React 코드로 구현합니다.

## 설정 로딩

1. `config.md` → 프로젝트별 설정 (우선)
2. `rules.md` → 공통 변환 규칙
3. `rules-component.md` → 컴포넌트 분해/합성 규칙
4. `rules-parallel.md` → 병렬 구현 규칙 (매니페스트, 팀 조정, Merge)
5. 충돌 시 config.md 우선

---

## Phase 0: 입력 파싱 및 사전 확인

각 Phase 시작 시 `echo "[Phase N] 단계명"` 형식으로 진행 상태를 출력한다.

### 0-1. figma-targets.md 파싱

대상 프로젝트 루트의 `figma-targets.md`를 읽는다. 없으면 안내 후 중단.

- URL에서 fileKey 추출 (branch URL → branchKey를 fileKey로 사용)
- 대상 노드 테이블 파싱: Node ID(`-`→`:`), 이름, 우선순위(high→medium→low)
- fileKey 또는 대상 노드가 없으면 에러

### 0-2. 프로젝트 컨텍스트 및 기존 컴포넌트 레지스트리 구축

1. config.md에서 프로젝트 설정, CLAUDE.md, 디자인 토큰 확인
2. **기존 컴포넌트 자동 수집**:

```
A. 파일 스캔: config.md의 components 경로에서 **/*.tsx → 컴포넌트명 추출
   (index.tsx → 상위 폴더명 사용)
B. Props 추출: interface/type *Props 패턴에서 props 이름 + union type 값 추출
C. config.md 수동 목록과 병합 (union)
D. 레지스트리 형태: { name, path, source, props[], variants{} }
```

---

## Phase 1: Scout — 디자인 정찰 및 매니페스트 생성

**노드 1~2개 → Phase 1S(단일 모드)로 분기. 3개 이상 → 아래 실행.**

### 1-0. 캐시 초기화

```bash
CACHE_DIR="/tmp/figma-cache/${FILE_KEY}"
mkdir -p "$CACHE_DIR"/{metadata,screenshots,design-context,variables,assets}
```

### 1-1. 전체 노드 데이터 수집

각 대상 노드에 대해 아래를 순서대로 실행하고 캐시에 저장한다:

| # | MCP 호출 | 캐시 경로 | 비고 |
|---|----------|----------|------|
| 1 | `get_metadata` | `metadata/{nodeId}.json` | 규모 판단: ≤50노드·depth≤5 → 소형, 그 외 → 대형 |
| 2 | `get_screenshot` | `screenshots/{nodeId}.png` | |
| 3 | `get_design_context` | `design-context/{nodeId}.json` | 소형: 1회, 대형: 경계 노드별 개별 호출 |
| 4 | `get_code_connect_map` | `code-connect.json` | 파일 단위 1회 |
| 5 | `get_variable_defs` | `variables/{nodeId}.json` | |
| 6 | `getImages` (SVG/PNG) | `assets/{nodeId}.{format}` | VECTOR/BOOLEAN_OP/INSTANCE(아이콘)/IMAGE fill |

### 1-2. 컴포넌트 분석

**A. 노드 분류 및 컴포넌트 경계 식별**

1. **타입 분류**: COMPONENT/COMPONENT_SET → 정의, INSTANCE → 재사용 후보, FRAME → 컨테이너, TEXT/VECTOR/IMAGE → 리프
2. **경계 식별**: COMPONENT 정의, INSTANCE 2회+ 반복, COMPONENT_SET(Variants), 독립 UI 섹션명
3. **Atomic 레벨**: Atom(하위 컴포넌트 없음) / Molecule(Atom 2+조합) / Organism(독립 비즈니스 의미)
4. **합성 방식**: Variants→Props, Instance Swap 1개→children, 2개+→Named Props, 반복→배열, Boolean→boolean Props

**B. 기존 컴포넌트 매칭 — 5단계 파이프라인**

각 Figma COMPONENT/COMPONENT_SET에 대해 순서대로 시도, **첫 매칭에서 중단**:

| Step | 방법 | confidence | 동작 |
|------|------|-----------|------|
| 1 | Code Connect | high | code-connect.json에서 componentId→코드 경로 매핑 |
| 2 | 정확한 이름 | high | Figma 이름 정규화 후 레지스트리와 대조 |
| 3 | 퍼지 이름 | medium | 접두사/접미사 제거 비교 → **사용자 확인** |
| 4 | Props 유사도 | medium | Figma Variant/Property→props 변환 후 유사도≥50% → **사용자 확인** (extend/wrap/new 선택) |
| 5 | 매칭 없음 | — | source: "new" |

이름 정규화: `Button/Primary`→`Button`, `Icon/Arrow/Right`→`ArrowRightIcon`, `Card/Product/Horizontal`→`ProductCard`

**D. 기존 컴포넌트 변경사항 검출** (source: "existing"만)

매칭된 각 기존 컴포넌트에 대해 3축 diff를 검출한다:

| Diff 축 | 비교 내용 | 결과 기록 |
|---------|----------|----------|
| **Variant/Props** | Figma COMPONENT_SET의 Variant 속성 vs 레지스트리 variants, Figma Property→props 변환 vs 기존 props | `diff.variants.added/removed`, `diff.props.added/removed/typeChanged` |
| **구조** | Figma 자식 구조 vs 기존 JSX 구조 (새 영역/제거된 영역) | 새 영역 → `diff.props.added`에 반영 |
| **스타일** | Figma cornerRadius/fills/padding/gap/fontSize vs 기존 Tailwind 클래스 파싱 | `diff.style.changed[{property, codeValue, figmaValue}]` |

**Action 자동 결정:**

| diff 결과 | action | 비고 |
|-----------|--------|------|
| 변경 없음 | `reuse` | |
| variants.added만 | `extend-variant` | |
| props.added만 | `add-props` | |
| style.changed만 | `update-style` | |
| 2축 이상 복합 변경 | **사용자에게 확인**: (1) 기존 파일 수정 (2) rewrite (3) wrap | |
| 구조 완전 변경 (props 50%+ 불일치 + 새 영역 2+) | `rewrite` | 사용자 확인 필수 |

**C. 공유(shared) / 고유(unique) 판정**

```
shared (하나라도 해당):
  - 서로 다른 대상 노드 2개+에서 INSTANCE로 참조
  - COMPONENT_SET (Variants 포함)
  - config.md "공유 컴포넌트"에 명시

unique: 위에 해당하지 않음
```

> source와 scope는 직교: existing+shared, existing+unique, new+shared, new+unique 모두 가능

### 1-3. 매니페스트 생성

- Agent 수: `Math.min(Math.max(3, Math.ceil(NODE_COUNT / 10)), 10)`
- 할당: 컴포넌트(shared→unique) 라운드로빈, 노드 high 우선 라운드로빈
- `.figma-manifest.json`에 저장 (스키마는 rules.md 참조)
- **매니페스트를 사용자에게 보여주고 확인을 받는다**

매니페스트 핵심 구조:
```json
{
  "fileKey": "...",
  "cache": { "basePath": "/tmp/figma-cache/{fileKey}", "entries": {...} },
  "projectContext": { "componentsPath": "...", "existingComponents": [...] },
  "designTokens": { "new": [...] },
  "components": [{ "id", "name", "figmaNodeId", "source", "scope", "existingMatch?", "atomicLevel", "compositionPattern", "assignedAgent", "props", "outputPath" }],
  "nodes": [{ "nodeId", "name", "priority", "sizeType", "assignedAgent", "requiredComponents", "outputPath", "designContext" }],
  "agents": [{ "id", "assignedComponents", "assignedNodes", "totalWork" }],
  "agentCount": 3
}
```

---

## Phase 1S: 단일 모드 (노드 1~2개)

병렬화 오버헤드가 크므로 순차 실행:

1. Phase 1-1과 동일한 데이터 수집 (메타데이터/스크린샷/디자인 컨텍스트/에셋)
2. Phase 1-2와 동일한 컴포넌트 분석 (매칭/diff/shared 판정)
3. **SVG/이미지 에셋 export** (⛔ 생략 금지) — VECTOR/BOOLEAN_OP/INSTANCE(아이콘)/IMAGE fill 모두 식별 → `getImages` export → 프로젝트 에셋 디렉토리에 파일 저장
4. 구현 실행: 토큰 → 컴포넌트(action별 분기) → 페이지 조립 (rules.md 규칙 준수)

완료 후 `/verify-figma` 안내.

---

## Phase 2: 병렬 구현 (worktree agent × N)

매니페스트의 각 agent에 대해 `Task(subagent_type: "general-purpose", isolation: "worktree")`를 **단일 메시지에서 병렬 호출**.

### Agent 프롬프트 템플릿

```
너는 Figma 디자인 구현 Agent ${AGENT_ID}이다.

## 매니페스트 & 캐시
- .figma-manifest.json을 읽어라. 너의 할당: agents[${AGENT_ID}]
- 캐시: ${CACHE_DIR} (매니페스트의 cache.basePath)
- ⛔ 캐시 파일 존재 시 MCP 호출 금지. 캐시 미스인 하위 노드만 신규 호출 허용.

## 설정
- config.md → 프로젝트 컨벤션
- rules.md → 변환 규칙 (필수 확인 속성, 캐시 경로 포맷 포함)
- rules-component.md → 컴포넌트 분해/합성 규칙

## 실행 순서

### Step 1: 디자인 토큰 추가
designTokens.new → config.md의 styles 경로에 추가 (중복 가능 — merge 시 해결)

### Step 2: 할당된 컴포넌트 생성 (action별 분기)

**source: "new"** → 캐시에서 디자인 컨텍스트/스크린샷/에셋 확보 → rules.md 준수하여 생성
  - SVG/이미지 에셋 생략 금지, JSX에 <svg>/<path> 직접 작성 금지

**source: "existing", action: "reuse"**
  → 파일 생성 안 함. import 경로만 확인.

**source: "existing", action: "extend-variant"**
  → 기존 파일 읽기 → diff.variants.added를 타입/구현에 추가 → Figma 스타일 적용

**source: "existing", action: "add-props"**
  → 기존 파일 읽기 → diff.props.added를 타입/구현에 추가 → 기존 코드 패턴 따름

**source: "existing", action: "update-style"**
  → 기존 파일 읽기 → diff.style.changed의 Tailwind 클래스 업데이트 → ⚠ 다른 variant 스타일 유지

**source: "existing", action: "wrap"**
  → 기존 컴포넌트 import → 래퍼 컴포넌트 새로 생성

**source: "existing", action: "rewrite"**
  → 기존 파일 백업(.bak) → 새로 작성 → 기존 export/import 인터페이스 유지

### Step 3: 할당된 노드 조립
requiredComponents는 생성 완료로 간주하고 import (merge 후 존재).

### Step 4: 구현 결과 보고
완료 파일 목록 + 역할 요약 + 신규 MCP 호출 횟수(캐시 미스)
```

---

## Phase 3: Merge 및 확인

### 3-1. 결과 요약
각 worktree(agent)의 작업 결과(파일 목록, branch명)를 사용자에게 제시.

### 3-2. 사용자 확인 (⛔ 자동 merge 금지)

옵션: (1) 전체 merge (2) 선택 merge (3) 검토 후 결정 (4) 취소

### 3-3. Merge 실행
- 순서: agent 0 → 1 → ... → N
- 충돌 발생 시 사용자에게 충돌 파일 안내
- 디자인 토큰 충돌: union merge

### 3-4. 후처리
- `.figma-manifest.json` 유지 (verify-figma에서 참조)
- 미사용 worktree 정리
- 완료 후 `/verify-figma` 안내
