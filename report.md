# Figma → Code 스킬 규칙 최적화 보고서

## 1. 현황 분석

### 1.1 규칙 수 현황

| 파일 | NEVER | ALWAYS | IMPORTANT | 합계 |
|------|-------|--------|-----------|------|
| implement-figma/rules.md | 0 | 0 | 55 | 55 |
| verify-figma/rules.md | 26 | 26 | 0 | 72* |
| **합계** | | | | **127** |

> *verify-figma는 NEVER/ALWAYS를 구분하여 사용하고, implement-figma는 IMPORTANT로 통일

### 1.2 Claude가 처리하는 총 지시문 수

| 소스 | 예상 지시문 수 |
|------|--------------|
| Claude Code 시스템 프롬프트 | ~50개 |
| 사용자 CLAUDE.md (글로벌 + 프로젝트) | ~30개 |
| implement-figma/rules.md | 55개 |
| verify-figma/rules.md | 72개 |
| SKILL.md (실행 절차) | ~40개 |
| **합계** | **~250개** |

### 1.3 문제점

IFScale 연구(arxiv 2507.11538)에 따른 프론티어 모델의 지시문 준수율:

| 지시문 수 | 준수율 |
|----------|--------|
| 10개 | 94~100% |
| 100개 | 27~98% |
| 150~200개 | **급격한 하락 시작 (임계점)** |
| 500개 | 51~69% |

현재 총 ~250개 지시문으로 **임계점(150~200개)을 초과**하고 있다.
뒤쪽 규칙이 먼저 무시되는 Primacy Bias도 150~200개 근처에서 가장 강하게 나타난다.

---

## 2. 근거: 공식 문서 및 연구

### 2.1 Anthropic 공식 권고

**Claude Code Best Practices** (code.claude.com/docs/en/best-practices):

> "Keep it concise. For each line, ask: 'Would removing this cause Claude to make mistakes?' If not, cut it."

> "If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long and the rule is getting lost."

> "Bloated CLAUDE.md files cause Claude to ignore your actual instructions!"

**Claude 4 Prompt Engineering** (platform.claude.com):

> "Where you might have said 'CRITICAL: You MUST use this tool when...', you can use more normal prompting like 'Use this tool when...'"

Claude 4.x는 대문자 강조보다 맥락과 논리를 우선시한다.

### 2.2 IMPORTANT/NEVER 남발의 역효과

Anthropic 자체 시스템 프롬프트 분석(PromptHub) 결과, Anthropic 내부에서도:
- **MUST**: 비타협적 안전 규칙에**만** 사용
- **NEVER**: 절대적 금지에**만** 사용

현재 rules.md는 모든 규칙에 IMPORTANT/NEVER를 부여하여 **강도 구분이 없는 상태**.
모든 것이 IMPORTANT이면 아무것도 IMPORTANT가 아닌 것과 같다.

### 2.3 효과적인 기법 순위

| 순위 | 기법 | 준수 보장 수준 | 비고 |
|------|------|--------------|------|
| 1 | **Hook** (결정적 실행) | 100% | 코드로 강제, advisory 아님 |
| 2 | **검증 도구** (린트/테스트) | 높음 | Claude가 결과를 보고 스스로 수정 |
| 3 | **규칙 수 축소** | 높음 | 적을수록 준수율 높음 |
| 4 | **이유 설명 + 예시** | 중간~높음 | "왜"를 알면 더 잘 지킴 |
| 5 | **구조화/계층화** | 중간 (~20% 향상) | DAT 프레임워크 연구 결과 |
| 6 | **IMPORTANT 키워드** | 낮음 | 가장 효과가 낮은 기법 |

출처:
- Anthropic 공식 "Effective Context Engineering for AI Agents" 블로그
- IFScale 논문 (arxiv 2507.11538)
- DAT 프레임워크 연구 (arxiv 2510.05134)
- Claude Code Best Practices 공식 문서

### 2.4 부정문 대신 긍정문

Anthropic 공식 권고:
```
# 덜 효과적
Do not use markdown in your response

# 더 효과적
Your response should be composed of smoothly flowing prose paragraphs.
```

"~하지 마라"보다 "~하라" 형태가 준수율이 높다.

---

## 3. 규칙 분류 (127개 → 5개 버킷)

### 3.1 분류 기준

| 버킷 | 기준 | 처리 방법 |
|------|------|----------|
| A. Hook 전환 | 패턴 매칭 가능 + 절대 위반 불가 | PostToolUse Hook으로 자동 검사 |
| B. 린트 도구 | 패턴 매칭 가능 + 검증 시 확인 | MCP tool `lint_generated_code`로 구현 |
| C. 예시로 대체 | 코드 예시가 규칙보다 명확 | good/bad 예시만 남기고 규칙 문장 삭제 |
| D. 삭제 | Claude가 이미 알거나, 도구가 알려주는 것 | 삭제 |
| E. 텍스트 유지 | 맥락 의존적, 코드화 불가 | 이유 설명 추가, 간결하게 유지 |

### 3.2 implement-figma/rules.md 분류 (55개)

#### A. Hook 전환 (~5개)
- hex/rgb 하드코딩 감지 → `/#[0-9a-fA-F]{3,8}/`, `/rgb\(/` 패턴
- `<svg>`, `<path>`, `<circle>` 직접 작성 감지
- `lucide`, `heroicons` 등 아이콘 패키지 import 감지
- `placeholder.com`, `unsplash` 등 외부 이미지 URL 감지

#### B. 린트 도구 (~5개)
- SVG fill 속성과 import 방식 일치 검증
- import 경로 유효성 (실제 파일 존재 여부)
- 에셋 파일 존재 여부 (SVG, PNG 등)

#### C. 예시로 대체 (~20개)
- 텍스트 스타일 적용 (fills → text-color) — 예시 1개로 충분
- 선/구분선 변환 (stroke vs fills) — 판별 흐름도 + 예시로 충분
- SVG export/import 방식 — 예시 코드로 충분
- 배경색/채움/그림자 변환 — 흐름도로 충분
- 절대 배치 변환 — 매핑 테이블로 충분

#### D. 삭제 (~10개)
- "import 경로가 실제 파일을 가리키는지 확인" — TypeScript 컴파일러가 알려줌
- "사용하지 않는 import/변수 없음" — ESLint가 알려줌
- "placeholder SVG 생성 금지" — SVG export 규칙과 중복
- "원본 SVG의 시각적 결과를 변경하지 않는 범위에서만 사용" — SVG fill 규칙과 중복
- 기타 중복/자명한 규칙

#### E. 텍스트 유지 (~15개)
- MCP 호출 흐름 (1~8단계) — 절차적이므로 텍스트 유지
- 탐색 전략 (소형/대형 판단) — 맥락 의존적
- 콘텐츠 충실도 원칙 — Figma 데이터 대조 필요
- 속성 우선 원칙 — AI 행동 지시
- 병렬 구현/매니페스트 규칙 — 절차적

### 3.3 verify-figma/rules.md 분류 (72개)

#### A. Hook 전환 (~3개)
- hex/rgb 하드코딩 감지 (토큰 검증)
- inline SVG 직접 작성 감지
- 아이콘 라이브러리 import 감지

#### B. 린트 도구 (~5개)
- SVG fill 속성 렌더링 검증 — SVG 파일 내용 + 코드 참조 방식 대조
- 에셋 파일 존재/참조/유효성 — `verify_assets` 이미 존재
- import 경로 유효성

#### C. 예시로 대체 (~15개)
- 요소 단위 검증 방식 — good/bad 예시가 이미 있어 규칙 문장 삭제 가능
- 선/구분선 검증 (A/B 구분) — 매핑 테이블로 충분
- SVG 원본 일치 검증 — 체크리스트로 충분

#### D. 삭제 (~15개)
- "TypeScript 타입 검사 통과 확인" — config.md의 typecheck 명령 실행으로 충분
- "lint 규칙 통과 확인" — config.md의 lint 명령 실행으로 충분
- "빌드 에러 없음 확인" — config.md의 build 명령 실행으로 충분
- verify-figma 절대 규칙 중 중복/자명한 항목들
- 에셋 검증에서 `verify_assets` 도구와 중복되는 규칙들

#### E. 텍스트 유지 (~34개 → 이유 설명 추가 후 ~20개로 압축)
- 절대 규칙 (핵심 7~8개만 유지)
- 렌더링 검증 원칙 — "코드 검증 ≠ 시각적 검증" 핵심 개념
- 스크린샷 캡처 방법 — 절차적
- 콘텐츠 충실도 검증 — Figma 대조 필요
- 레이아웃 속성 검증 — Figma 대조 필요

### 3.4 분류 결과 요약

| 버킷 | implement | verify | 합계 | 처리 |
|------|----------|--------|------|------|
| A. Hook | 5 | 3 | 8 | 코드로 100% 강제 |
| B. 린트 도구 | 5 | 5 | 10 | MCP tool로 검증 |
| C. 예시 대체 | 20 | 15 | 35 | 예시만 남김 |
| D. 삭제 | 10 | 15 | 25 | 제거 |
| E. 텍스트 유지 | 15 | 20* | 35* | 간결하게 재작성 |
| **합계** | 55 | 72* | 127 | |

> *verify의 텍스트 유지 34개를 이유 설명 추가 + 문장 합치기로 ~20개로 압축

**최종 텍스트 규칙: implement ~15개 + verify ~20개 = 약 35개** (127개 → 35개, 72% 감소)

---

## 4. 개선 실행 계획

### 4.1 Phase 1: rules.md 리팩토링 (즉시 실행)

**원칙:**
1. IMPORTANT/NEVER/ALWAYS 키워드를 최소화 (절대 규칙 5~8개에만 사용)
2. 나머지는 평문 설명 + 코드 예시
3. "~하지 마라" 대신 "~하라" 긍정문 우선
4. 이유를 함께 설명
5. 중복/자명한 규칙 삭제

**implement-figma/rules.md 구조:**
```
⛔ 절대 규칙 (5개)
MCP 호출 흐름 (절차, 번호 매김)
탐색 전략 (흐름도)
콘텐츠 충실도 (평문 + 예시)
코드 변환 (평문 + 흐름도 + 예시)
SVG/에셋 (평문 + 예시)
레이아웃 (매핑 테이블)
병렬 구현 (절차)
```

**verify-figma/rules.md 구조:**
```
⛔ 절대 규칙 (7개)
렌더링 검증 원칙 (평문)
스크린샷 캡처 (절차)
요소 단위 검증 (예시)
콘텐츠/스타일 검증 (체크리스트)
SVG/에셋 검증 (체크리스트)
선/구분선 검증 (매핑 테이블)
```

### 4.2 Phase 2: Hook 설정 ✅ 완료

`.claude/hooks/lint-generated.sh` + `.claude/settings.json` 생성 완료.

PostToolUse (Write|Edit) 시 자동 실행되어 위반 시 exit 2 + stderr로 Claude에 피드백.

검사 항목 (6개 규칙):
- `no-hardcoded-color` — hex/rgb 하드코딩 (style 객체 내)
- `no-inline-svg` — `<svg>`, `<path>` 등 JSX 직접 작성
- `no-icon-library` — lucide, heroicons, react-icons 등 import
- `no-external-placeholder` — placeholder.com, unsplash.com 등
- `no-placeholder-text` — Lorem ipsum 등
- `no-css-icon` — CSS border로 아이콘 흉내

### 4.3 Phase 3: MCP 린트 도구 ✅ 완료

`lint_generated_code` MCP tool 구현 완료 (`mcp-server/src/verifier/code-linter.ts`).

기능:
- 기본 코드 린트 (Hook과 동일한 6개 규칙)
- SVG fill 속성 + import 방식 일치 검증 (`lintSvgFillUsage`)
  - fill="none" SVG를 `<img>`로 사용 시 FAIL
  - fill="currentColor" SVG의 부모 text-{color} 확인
- 에셋 import 경로 존재 확인 (`lintAssetImports`)
- 결과를 마크다운 테이블로 포맷

### 4.4 기대 효과

| 지표 | 현재 | 개선 후 |
|------|------|---------|
| 텍스트 규칙 수 | 127개 | ~35개 |
| 총 지시문 수 (추정) | ~250개 | ~155개 |
| 임계점 대비 | 초과 (250 > 200) | 근접 (155 < 200) |
| Hook 강제 규칙 | 0개 | 8개 (100% 준수) |
| 린트 도구 검증 | 0개 | 10개 (자동 검증) |

---

## 5. 참고 자료

- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) — Anthropic 공식
- [Claude 4 Prompt Engineering](https://platform.claude.com/docs/en/docs/build-with-claude/prompt-engineering/claude-4-best-practices) — Anthropic 공식
- [Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — Anthropic 공식 블로그
- [Manage Claude's memory](https://code.claude.com/docs/en/memory) — Anthropic 공식
- [IFScale: How Many Instructions Can LLMs Follow?](https://arxiv.org/html/2507.11538v1) — 학술 연구
- [DAT Framework for Structured Reasoning](https://arxiv.org/html/2510.05134) — 학술 연구
- [Analysis of Claude 4 System Prompt](https://www.prompthub.us/blog/an-analysis-of-the-claude-4-system-prompt) — PromptHub
- [Writing a good CLAUDE.md](https://www.humanlayer.dev/blog/writing-a-good-claude-md) — HumanLayer
