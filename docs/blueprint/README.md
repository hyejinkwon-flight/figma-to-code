# MCP 서버 아키텍처

## 파이프라인 구조

```
Figma URL → extract_layers → analyze_tree → generate_component → verify → Coverage Report
```

## MCP 서버 소스

모든 구현은 `mcp-server/src/`에 위치합니다.

### Figma 연동
- REST API 클라이언트: [`mcp-server/src/figma/client.ts`](../../mcp-server/src/figma/client.ts)
- 재귀 탐색 엔진: [`mcp-server/src/figma/traverser.ts`](../../mcp-server/src/figma/traverser.ts)
- 노드 분석/매핑: [`mcp-server/src/figma/parser.ts`](../../mcp-server/src/figma/parser.ts)

### 코드 생성
- 컴포넌트 생성: [`mcp-server/src/generator/component-generator.ts`](../../mcp-server/src/generator/component-generator.ts)
- 스토리 생성: [`mcp-server/src/generator/story-generator.ts`](../../mcp-server/src/generator/story-generator.ts)

### 3-Layer 검증

```
┌──────────────────────────────────────────────────────────────────┐
│                    검증 파이프라인 (3단계)                         │
│                                                                    │
│  ┌───────────┐   ┌────────────┐   ┌────────────────────────┐    │
│  │ Level 1   │   │ Level 2    │   │ Level 3                │    │
│  │ 구조 검증 │──▶│ 라운드트립 │──▶│ 시각 검증 (VRT)        │    │
│  └───────────┘   └────────────┘   └────────────────────────┘    │
│       │                │                    │                     │
│       ▼                ▼                    ▼                     │
│  노드 구조 일치   속성 보존 확인    픽셀 레벨 시각 일치           │
│                                                                    │
│  커버리지 < 99% → 누락 분석 → 재추출 → 재검증                    │
└──────────────────────────────────────────────────────────────────┘
```

- Level 1: [`mcp-server/src/verifier/structural-verifier.ts`](../../mcp-server/src/verifier/structural-verifier.ts)
- Level 2: [`mcp-server/src/verifier/roundtrip-verifier.ts`](../../mcp-server/src/verifier/roundtrip-verifier.ts)
- Level 3: [`mcp-server/src/verifier/visual-verifier.ts`](../../mcp-server/src/verifier/visual-verifier.ts)
- 커버리지: [`mcp-server/src/verifier/coverage-calculator.ts`](../../mcp-server/src/verifier/coverage-calculator.ts)

## MCP Tool 목록

| Tool | 설명 | Phase |
|------|------|-------|
| `extract_layers` | Figma 파일의 모든 레이어/노드를 재귀 추출 | 1 |
| `analyze_tree` | 추출된 트리를 분석하고 컴포넌트 후보 식별 | 2 |
| `generate_component` | 단일 컴포넌트를 React 코드로 변환 | 3 |
| `generate_story` | Storybook 스토리 생성 | 4 |
| `verify_structure` | 구조적 검증 (API Diff) | 5 |
| `verify_roundtrip` | 라운드트립 검증 (속성 보존) | 5 |
| `verify_visual` | 시각적 검증 (VRT) | 5 |
| `run_full_pipeline` | 전체 파이프라인 (99% 커버리지까지 반복) | All |

## 환경 변수

```bash
FIGMA_ACCESS_TOKEN=figd_xxxxxxxxxxxxxxxxxxxxxxxxx
OUTPUT_DIR=./generated
STYLE_SYSTEM=tailwind  # tailwind | css-modules
```
