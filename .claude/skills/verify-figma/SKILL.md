---
name: verify-figma
description: Verify implemented code against Figma designs using rendering-based comparison, auto-fixing until 99% accuracy. Use when user says "/verify-figma", "검증해줘", "피그마 비교", "디자인 확인", "pixel diff", "디자인 QA", "구현 결과 확인", "스크린샷 비교", or wants to compare rendered output with Figma original. Also trigger when the user asks if their implementation matches the design, wants quality assurance on UI code, or mentions checking visual fidelity of components.
---

# Figma 디자인 검증 스킬 (v2)

## ⛔ 절대 규칙 — 이 섹션이 verify-figma의 절대 규칙 원본이다 (rules.md에서도 이 섹션을 참조)

1. **정확도 99% 이상이 될 때까지 멈추지 않는다.** — 1%의 시각적 오차도 사용자에게 "덜 완성된" 느낌을 주고, 수동 수정 비용을 유발한다.
2. **정확도는 추정하지 않는다.** 반드시 항목을 세어 정확한 숫자를 계산한다 — "~97%"같은 추정은 실제 80%일 수 있다.
3. **99% 미만이면 사용자에게 묻지 않는다.** 자동으로 수정하고 재검증한다 — 사용자 개입을 줄여야 자동화의 가치가 있다.
4. **코드만 보고 "시각적으로 일치한다"고 판정하지 않는다.** — `flex-row`가 코드에 있어도 부모 context에 따라 세로로 렌더링될 수 있다.
5. **노드 단위가 아니라 요소 단위로 검증한다.** — 노드 단위 뭉뚱그림은 X 버튼, 구분선 등 작은 요소의 누락을 감춘다.
6. **매 라운드마다 요소별 검증 테이블을 출력한다.** (단, 라운드 2+에서는 변경된 항목만 출력하고 전체 테이블은 파일로 저장 — 컨텍스트 절약)
7. **렌더링 스크린샷은 자동 캡처를 우선한다.** 자동 캡처 실패 또는 사용자 명시 지정(`--screenshot`) 시에만 수동 스크린샷을 허용한다.
8. **검증 완료 후 반드시 임시 파일(스크린샷, diff 이미지)을 정리한다.** — 수십 MB의 임시 이미지가 누적되면 디스크를 낭비한다.
9. **불확실할 때 가정하지 않고 원본을 확인한다.** — 속성값, 색상, 크기, pass/fail 판정 등 확신이 없으면 캐시된 `get_design_context`/`get_metadata`를 다시 조회하거나 렌더링 스크린샷을 재캡처한다. "아마 맞을 것이다"라는 추측이 잘못된 pass 판정을 만든다.

### 실패 사례 — 절대 반복하지 않는다

```
❌ 실패 1: "최종 정확도: ~97%" → 추정 금지
❌ 실패 2: 아이콘이 전혀 다른데 노드 구조만 보고 pass
❌ 실패 3: border가 dashed인데 solid로 렌더링되어도 pass
❌ 실패 4: 에셋 미다운로드인데 구조 검증만 통과해서 99%
❌ 실패 5: 코드 flex-direction만 보고 "레이아웃 OK" → 실제 렌더링은 다름
❌ 실패 6: 추출 데이터를 자기 자신과 비교해서 100% 달성
❌ 실패 7: 스크린샷 캡처 없이 코드만 읽고 "일치" 판정
❌ 실패 8: 검증 완료 후 임시 스크린샷/diff 파일을 남겨둠
```

---

`/implement-figma`로 구현된 결과를 Figma 원본과 비교 검증합니다.
인자가 주어지면 특정 노드만 검증합니다: $ARGUMENTS

## 설정 로딩 (우선순위)

1. 먼저 이 디렉토리의 `config.md`를 읽는다 — 프로젝트별 설정
2. 다음 `rules.md`를 읽는다 — 공통 검증 규칙
3. **config.md의 설정이 rules.md와 충돌하면 config.md가 우선한다**

---

## 검증 아키텍처 (v2)

### 이전 방식 (폐기됨)
```
❌ 추출 데이터 ↔ Figma API 데이터 (자기 검증 — 의미 없음)
❌ 추출 속성 ↔ 재생성 속성 (자기 비교 — 100% 당연)
❌ 시각 비교 유틸만 존재 (캡처 파이프라인 없음)
```

### 현재 방식
```
✅ Figma 스크린샷 ↔ 렌더링 스크린샷 (픽셀 diff)
✅ Figma 디자인 속성 ↔ 실제 렌더링 요소 속성 (요소별 9항목)
✅ Figma 에셋 ↔ 다운로드/참조/렌더링 확인 (에셋 검증)
```

### MCP 도구 매핑

| 단계 | MCP 도구 | 설명 |
|------|----------|------|
| Figma 스크린샷 | `get_screenshot` (Figma MCP) | Figma 디자인 원본 캡처 |
| 렌더링 스크린샷 | Playwright MCP `browser_navigate` + `browser_take_screenshot` | Storybook/Vite 렌더링 캡처 |
| 픽셀 diff | `verify_pixel_diff` (figma-to-code MCP) | 두 스크린샷 비교, diff 이미지 생성 |
| 요소 검증 | `verify_elements` (figma-to-code MCP) | 9항목 상세 검증 |
| 에셋 검증 | `verify_assets` (figma-to-code MCP) | 아이콘/이미지 다운로드 확인 |
| 커버리지 | `calculate_coverage` (figma-to-code MCP) | 종합 정확도 계산 |
| 임시 파일 정리 | `cleanup_verification` (figma-to-code MCP) | 스크린샷/diff 파일 삭제 |

### 필수 MCP 서버

이 스킬은 아래 MCP 서버가 모두 연결되어 있어야 한다:

1. **Figma MCP** — `get_screenshot`, `get_design_context` 호출
2. **Playwright MCP** (`@playwright/mcp`) — 렌더링 스크린샷 자동 캡처
3. **figma-to-code MCP** — 검증 도구 (`verify_pixel_diff`, `verify_elements`, `verify_assets`, `calculate_coverage`, `cleanup_verification`)

`.mcp.json`에 Playwright MCP가 없으면 검증 시작 전 사용자에게 설치를 안내한다:
```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "env": {}
    }
  }
}
```

---

## 실행 프로세스

### Phase V0: 렌더링 환경 준비

렌더링 검증을 위해 환경을 확인한다.

#### 0-1. MCP 서버 확인

Figma MCP, Playwright MCP, figma-to-code MCP가 모두 연결되어 있는지 확인한다.

**폴백 경로 (일부 MCP 미가용 시):**

| 미가용 MCP | 폴백 | 제한 사항 |
|-----------|------|----------|
| **figma-to-code MCP** | Figma 스크린샷 vs 렌더링 스크린샷을 직접 시각 비교 + 수동 요소별 대조 | `verify_pixel_diff` 자동 계산 불가, 정확도는 요소 수 기반 수동 계산 |
| **Playwright MCP** | 사용자에게 렌더링 스크린샷을 직접 제공받음 (`--screenshot <경로>`) | 자동 수정 루프에서 재캡처 불가 — 수정 후 사용자에게 재캡처 요청 |
| **Figma MCP** | `/tmp/figma-cache/` 캐시된 스크린샷/디자인 컨텍스트 사용 | 캐시 미스 시 검증 불가 — implement 단계를 먼저 실행해야 함 |

모든 MCP가 연결된 환경이 최적이지만, 폴백 경로로도 기본 검증은 가능하다. 단, **정확도 자동 계산과 자동 수정 루프는 전체 MCP가 필요**하다.

#### 0-2. 렌더링 서버 확인

```bash
# Storybook 또는 Vite dev 서버가 실행 중인지 확인
curl -s http://localhost:6006 > /dev/null 2>&1  # Storybook
curl -s http://localhost:5173 > /dev/null 2>&1  # Vite dev
```

- 실행 중이면 → 계속 진행
- 실행 중이 아니면 → 백그라운드로 시작 시도
- 아무것도 안 되면 → 사용자에게 안내

#### 0-3. 스크린샷 디렉토리 준비

```bash
mkdir -p /tmp/figma-verify
```

### Phase V1: 스크린샷 캡처 및 픽셀 diff

각 노드에 대해:

#### 1-1. Figma 스크린샷 확보 (캐시 우선)

**Figma 원본은 세션 내 불변이므로 한 번만 캡처한다.**

```
캐시 확인: /tmp/figma-cache/{fileKey}/screenshots/{nodeId}.png
  ├─ 존재 → 캐시에서 복사: cp → /tmp/figma-verify/figma-{nodeId}-r{round}.png
  └─ 미존재 → Figma MCP get_screenshot 호출 → 캐시 + verify 디렉토리에 모두 저장
```

⛔ **라운드 2+ 에서는 Figma 스크린샷을 다시 호출하지 않는다.** 라운드 1의 Figma 스크린샷을 재사용한다.
(`/tmp/figma-verify/figma-{nodeId}-r1.png`을 이후 라운드에서도 참조)

#### 1-2. 렌더링 스크린샷 캡처

렌더링 스크린샷은 **자동 캡처 우선**, 폴백으로 수동 스크린샷을 허용한다.

**1순위: 자동 캡처 (Playwright MCP)**

```
1. Playwright MCP: browser_navigate → Storybook iframe URL 또는 Vite dev URL
2. Playwright MCP: browser_take_screenshot → PNG 저장
```

**Storybook URL 패턴:**
```
http://localhost:6006/iframe.html?id={storyId}&viewMode=story
```

**Vite dev URL 패턴:**
```
http://localhost:5173/{pagePath}
```

**2순위: 수동 스크린샷 (폴백)**

자동 캡처 실패 또는 사용자가 `--screenshot <경로>` 인자로 명시 지정한 경우:
1. 사용자 제공 이미지를 `/tmp/figma-verify/rendering-{nodeId}-r{round}.png`로 복사
2. 검증 테이블의 `CAPTURE_METHOD`에 `수동 스크린샷`으로 표기
3. **수정 루프(Phase V5) 진입 시 자동 캡처로 전환** — 코드 수정 후에는 Playwright로 재캡처해야 수정 반영을 확인할 수 있으므로, 수동 스크린샷은 첫 라운드에만 유효

저장 위치: `/tmp/figma-verify/rendering-{nodeId}-r{round}.png`

#### 1-3. 픽셀 diff 실행

figma-to-code MCP `verify_pixel_diff` 호출:
```json
{
  "figma_screenshot_path": "/tmp/figma-verify/figma-{nodeId}-r{round}.png",
  "rendering_screenshot_path": "/tmp/figma-verify/rendering-{nodeId}-r{round}.png",
  "diff_output_path": "/tmp/figma-verify/diff-{nodeId}-r{round}.png"
}
```

→ diff 이미지 생성, mismatch 비율 확인.

#### 1-4. 스크린샷 비교 및 요소 추출

Figma 스크린샷과 렌더링 스크린샷을 **나란히 보고** 차이점을 찾는다.
diff 이미지를 참고하여 불일치 영역을 확인한다.

**Figma 스크린샷**에서 모든 UI 요소를 개별 나열한다:
- 닫기(X) 버튼, 구분선, 아이콘, 배지, 라디오/체크박스+라벨 등 작은 요소도 모두 나열
- "기타" 등으로 뭉뚱그리지 않는다

각 요소가 **렌더링 스크린샷에도 존재하는지** 대조한다.

### Phase V2: 요소별 상세 검증

#### 2-1. 디자인 컨텍스트 확보 (캐시 우선)

```
캐시 확인: /tmp/figma-cache/{fileKey}/design-context/{nodeId}.json
  ├─ 존재 → 캐시 파일을 읽어서 정확한 수치를 확보
  └─ 미존재 → Figma MCP get_design_context 호출 → 캐시에 저장 후 사용
```

⛔ implement 단계에서 이미 캐시된 디자인 컨텍스트가 있으면 MCP를 다시 호출하지 않는다.

#### 2-2. 요소별 9항목 검증

figma-to-code MCP `verify_elements` 호출:

각 요소에 대해 Figma 속성(`figmaProps`)과 렌더링 결과(`renderedProps`)를 비교:

| 카테고리 | 검사 내용 | Figma 속성 (캐시에서 확인) | 기준 |
|----------|----------|--------------------------|------|
| 존재 | 요소가 있는가 | 노드 존재 여부 | Figma에 있으면 렌더링에도 있어야 함 |
| 배치 | direction, align, justify | `layoutMode`, `primaryAxisAlignItems`, `counterAxisAlignItems` | 렌더링 스크린샷 기준 |
| 간격 | padding, gap, margin | `paddingLeft/Right/Top/Bottom`, `itemSpacing`, `counterAxisSpacing` | ±1px |
| 크기 | width, height | `width`, `height`, `layoutSizingHorizontal/Vertical` | ±2px |
| 색상 | bg, text, border color | `fills`, `strokes`, TEXT의 `fills` | 정확 일치 (토큰) |
| 타이포 | font-size, weight, line-height | `fontSize`, `fontWeight`, `lineHeightPx`, `letterSpacing` | 정확 일치 |
| 테두리 | border-width, radius, style(solid/dashed) | `strokeWeight`, `cornerRadius`, `strokeDashes` | 정확 일치 |
| 효과 | shadow, opacity | `effects`, `opacity` | 정확 일치 |
| 아이콘 | SVG 다운로드 + fill 색상 + rotation + size | 에셋 캐시, 노드의 `fills`, `rotation`, `width`, `height` | 렌더링 스크린샷 기준 |

**핵심: 렌더링 스크린샷이 최종 판단 기준이다.** 코드에 올바른 값이 있어도 렌더링이 다르면 fail.

**캐시 드릴다운**: 부모 캐시에 자식 속성이 없으면 해당 자식의 `get_design_context`를 호출 → 캐시 추가. "MCP 재호출 금지"는 이미 캐시된 동일 nodeId에만 적용.

**자동 검출**: 위 항목 중 간격, 테두리, 아이콘은 `verify-figma-props.sh`가 design-context JSON과 코드를 대조하여 자동 검출한다 (Phase V3에서 실행).

### Phase V3: 에셋 및 코드 품질 검증

#### 3-1. 에셋 검증

figma-to-code MCP `verify_assets` 호출:
- 아이콘/이미지가 Figma REST API에서 export되어 프로젝트에 존재하는가
- 코드에서 올바른 경로로 참조(import/src)하는가
- SVG가 유효한가 (빈 파일, 손상 파일 검출, `<svg>...</svg>` 구조)
- SVG가 Figma 원본과 동일한가 (아이콘 라이브러리 대체 금지)
- SVG의 viewBox, fill, stroke, path 등 속성이 보존되어 있는가

**추가 아이콘 속성 검증** (캐시된 design-context에서 확인):
- **fill 색상 대조**: 아이콘 노드의 `fills[0].color`와 SVG 파일 내 fill 속성이 일치하는가. 렌더링에서 정확한 색상으로 표시되는가
- **rotation**: 아이콘 노드의 `rotation`이 0이 아니면, 코드에 `rotate-[값]`이 적용되어 렌더링에서 회전되어 있는가
- **size**: 아이콘 노드의 `width`, `height`와 렌더링된 아이콘 크기가 일치하는가 (±1px)
- **opacity**: 아이콘 노드의 `opacity`가 1이 아니면 렌더링에서 투명도가 반영되는가
- **import 방식**: SVG의 fill 속성에 따라 올바른 import 방식(`<img>` vs 인라인 vs React 컴포넌트)인가 (rules.md 참조)

**에셋 누락이 있으면 정확도 최대 90% 제한.**

#### 3-2. 속성 대조 검증 (PostToolUse 자동 실행)

`lint-generated.sh` hook이 코드 Write/Edit 시마다 캐시 기반 속성 대조를 자동 수행한다 (Rule 13a~k).
수정 단계(Phase V5)에서 코드를 수정할 때도 자동으로 재검출되므로 별도 스크립트 호출이 불필요하다.

검출 항목: fontSize, fontWeight, textColor, iconSize, padding, gap, layoutMode, rotation, clipsContent, layoutSizing, strokeDashes
→ 상세는 `rules.md "코드 레벨 검증"` 참조

#### 3-3. 코드 레벨 검증

1. **TypeScript 타입 검사**: `npx tsc --noEmit` (또는 config.md의 typecheck 명령) — 타입 에러 없음 확인
2. **lint 검사**: config.md의 lint 명령 실행 — lint 에러 없음 확인
3. **빌드 검사**: config.md의 build 명령 실행 — 빌드 에러 없음 확인
4. **import 검증**: 모든 import 경로가 실제 파일을 가리키는지, 미사용 import/변수 없는지 확인

#### 3-4. 토큰/코드 품질

`lint-generated.sh` hook이 코드 작성 시 자동 검출 (Rule 1~12: 패턴 검사 + Rule 13a~k: 캐시 기반 속성 대조).
→ 상세는 `rules.md "코드 레벨 검증"` 참조

추가 수동 확인:
1. DOM depth → 3~4단계 이내
2. 절대 배치 노드 → `position: absolute` + constraints 적용 확인

### Phase V4: 정확도 판정

#### 4-1. 커버리지 계산

figma-to-code MCP `calculate_coverage` 호출:
- 주 지표: 요소별 검증 `(pass / total) × 100`
- 보조 지표: 픽셀 diff mismatch 비율
- 에셋 누락 시 최대 90% 제한

#### 4-2. 검증 테이블 출력 (필수)

**반드시 아래 형식으로 출력한다. 이 테이블 없이 정확도를 말할 수 없다.**

```
[검증 테이블] 라운드 {ROUND} — 노드: {NODE_NAME}
검증 방법: Figma 스크린샷 vs 렌더링 스크린샷 ({CAPTURE_METHOD})
픽셀 diff: {MISMATCH}% 불일치 (diff 이미지: {DIFF_PATH})

| # | 요소 | 존재 | 배치 | 간격 | 크기 | 색상 | 타이포 | 테두리 | 효과 | 아이콘 | pass/total |
|---|------|------|------|------|------|------|--------|--------|------|--------|------------|
| 1 | 드래그 핸들 | ✓ | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | - | 6/6 |
| 2 | X 닫기 버튼 | ✗ | - | - | - | - | - | - | - | - | 0/1 |
| 합계 | | | | | | | | | | | 6/7 |

[에셋 검증] ✅ 아이콘 3/3, 이미지 0/0
[토큰/품질] fail 0개

정확도: 85.7% (6/7) — 99% 미만, 자동 수정 진행
```

**라운드 2+ 컨텍스트 절약:**
- 전체 테이블은 `/tmp/figma-verify/table-{nodeId}-r{round}.md`에 저장
- 화면에는 **변경된 항목(이전 라운드 대비 pass↔fail 전환)만** 출력
- 요약 행(합계, 정확도, 에셋, 토큰)은 매 라운드 출력

#### 4-3. 분기

- **정확도 >= 99%** → Phase V6 (렌더링 최종 확인)
- **정확도 < 99%** → 즉시 Phase V5 자동 진입

⛔ **정확도 < 99%일 때 사용자에게 묻거나 종료하지 않는다.**

### Phase V5: 자동 수정 및 재검증

#### 5-1. 수정 순서 (모든 fail을 수정한다)

1. **누락 요소** (존재 fail) → 요소 추가
2. **배치 오류** → flex-direction, align, justify 수정
3. **간격 오류** → padding, gap, margin 수정
4. **크기 오류** → width, height 수정
5. **색상 오류** → 색상값/토큰 수정
6. **타이포 오류** → font-size, weight, line-height 수정
7. **테두리/효과** → border, border-radius, shadow, style(solid/dashed) 수정
8. **아이콘** → 아래 순서로 수정:
   - SVG 미다운로드 → Figma REST API `getImages(format: 'svg')`로 export 후 다운로드
   - SVG fill 색상 불일치 → 아이콘 노드의 `fills[0].color`와 SVG 파일 내 fill 비교 → SVG fill 수정 또는 import 방식 변경
   - rotation 미적용 → 아이콘 노드의 `rotation` 확인 → 컨테이너에 `rotate-[값]` 추가
   - size 불일치 → 아이콘 노드의 `width/height` 확인 → `w-[값] h-[값]` 수정
   - opacity 미적용 → 아이콘 노드의 `opacity` 확인 → `opacity-[값]` 추가
   - 잘못된 import 방식 → SVG fill 속성에 따라 `<img>` vs 인라인 vs React 컴포넌트 변경 (rules.md 참조)
9. **이미지** → IMAGE fill 노드의 이미지 파일 export + `scaleMode` → `object-fit` 적용
10. **토큰 하드코딩** → hex/rgb → Tailwind 토큰 교체
11. **타입 에러** → TypeScript 타입 검사 에러 수정
12. **lint 에러** → lint 규칙 위반 수정
13. **빌드 에러** → 빌드 실패 원인 수정
14. **import 에러** → 잘못된 경로, 미사용 import/변수 정리

수정 시 반드시:
1. **캐시된** `get_design_context`의 정확한 수치 참조
   - 캐시에 해당 노드가 없으면 → `get_design_context` 신규 호출 → 캐시에 추가 후 사용
   - ⛔ "MCP 재호출 금지"는 **이미 캐시에 있는 동일 nodeId**에만 적용된다
2. **캐시된** `get_screenshot`의 시각적 레이아웃 참조 (라운드 1 스크린샷 재사용)
3. diff 이미지의 **불일치 영역** 참조
4. 수정 후 `verify-figma-props.sh`를 재실행하여 속성 불일치가 해소되었는지 확인

#### 5-2. 재검증 루프

수정 후 **Phase V1으로 돌아간다:**
- 렌더링 스크린샷을 다시 캡처 (수정 반영 확인)
- 픽셀 diff 재실행
- 요소별 검증 재실행
- 검증 테이블 재출력

### Phase V6: 렌더링 최종 확인 (99% 이상)

코드 검증에서 99% 이상을 달성해도, **렌더링 스크린샷으로 최종 확인**한다.

1. 모든 노드의 **렌더링** 스크린샷을 다시 캡처 (Playwright — 코드 최종 상태 반영)
2. **캐시된 Figma 스크린샷**과 나란히 비교 (⛔ Figma MCP 재호출 금지)
3. 픽셀 diff 최종 실행
4. 시각적 차이가 있으면 → Phase V5로 돌아가 수정

**렌더링 확인까지 통과해야 최종 완료이다.**

### Phase V7: 임시 파일 정리

검증이 완전히 완료된 후 임시 파일을 정리한다.

figma-to-code MCP `cleanup_verification` 호출:
```json
{
  "screenshot_dir": "/tmp/figma-verify"
}
```

이 단계에서 삭제되는 파일:
- `/tmp/figma-verify/` — Figma/렌더링/diff 스크린샷 전체
- `/tmp/figma-cache/{fileKey}/` — Figma MCP 캐시 전체
- 빈 디렉토리

**⛔ 검증 중간에 정리하지 않는다. 최종 완료 후에만 정리한다.**
**⛔ 캐시 디렉토리(`/tmp/figma-cache/`)는 verify 완료 후에만 삭제한다.** implement → verify 사이에 삭제하면 verify에서 MCP를 재호출해야 한다.

---

## 종료 조건

### 1. 정확도 99% + 렌더링 확인 + 임시 파일 정리 (정상 종료)

```
[완료] 정확도 {ACCURACY}% ({PASS}/{TOTAL}) — 목표 달성
[완료] 렌더링 최종 확인 통과 ✓
[완료] 임시 파일 정리 완료 ({CLEANED_COUNT}개 삭제)
검증 라운드: {ROUND}회
총 수정: {TOTAL_FIXED}개
```

### 2. 최대 5라운드 도달 (안전장치)

5라운드 도달 시에만 사용자에게 선택:
```
1. 계속 수정 (5라운드 추가)
2. 실패 항목만 수동 수정
3. 현재 상태로 완료
```

임시 파일 정리는 어떤 종료 조건이든 반드시 실행한다.

### 3. 수정 불가 판정

같은 요소의 같은 항목이 3라운드 연속 fail → "수정 불가" — 3회 시도는 다른 접근법을 모두 소진했음을 의미하며, 이 시점에서는 디자인 원본 오류이거나 브라우저 렌더링 한계일 가능성이 높다:
- 분모에서 제외
- 전체의 5% 초과 시 사용자에게 **디자인 원본 확인을 요청** (Figma 디자인 자체의 오류, 브라우저 렌더링 한계, 또는 Figma↔웹 간 본질적 차이일 수 있음)
- 10% 초과 시 검증을 일시 중단하고 사용자와 원인을 논의

---

## 검증 상태 추적

```
라운드 1: 68.2% (15/22), 픽셀 diff 23.4%, 에셋 2/3, fail 7개, 수정 7개
라운드 2: 90.9% (20/22), 픽셀 diff 8.1%, 에셋 3/3, fail 2개, 수정 2개
라운드 3: 100% (22/22), 픽셀 diff 1.2%, 에셋 3/3, fail 0개
렌더링 최종 확인: ✓ 통과
임시 파일 정리: ✓ 12개 삭제
```
