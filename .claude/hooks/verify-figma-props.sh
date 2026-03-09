#!/bin/bash
# verify-figma-props.sh
# 캐시된 design-context JSON과 생성된 코드를 대조하여 속성 불일치를 검출한다.
#
# 사용법:
#   verify-figma-props.sh <code-file> <cache-dir> [nodeId1 nodeId2 ...]
#   verify-figma-props.sh src/components/Card.tsx /tmp/figma-cache/abc123 1:2 3:4
#
# 종료 코드:
#   0 = 모든 검사 통과
#   1 = 불일치 발견 (stderr에 상세 출력)
#   2 = 인자 오류

set -euo pipefail

CODE_FILE="${1:-}"
CACHE_DIR="${2:-}"
shift 2 2>/dev/null || true
NODE_IDS=("$@")

# ─── 인자 검증 ───
if [ -z "$CODE_FILE" ] || [ -z "$CACHE_DIR" ]; then
  echo "Usage: verify-figma-props.sh <code-file> <cache-dir> [nodeId1 ...]" >&2
  exit 2
fi

if [ ! -f "$CODE_FILE" ]; then
  echo "❌ 코드 파일 없음: $CODE_FILE" >&2
  exit 2
fi

if [ ! -d "$CACHE_DIR/design-context" ]; then
  echo "⚠️ 캐시 디렉토리 없음: $CACHE_DIR/design-context — 스킵" >&2
  exit 0
fi

# jq 필수
if ! command -v jq &>/dev/null; then
  echo "⚠️ jq가 설치되지 않아 속성 대조 검증을 건너뜁니다." >&2
  exit 0
fi

CODE=$(cat "$CODE_FILE")
VIOLATIONS=()
WARNINGS=()

# ─── nodeId 목록 결정 ───
if [ ${#NODE_IDS[@]} -eq 0 ]; then
  # nodeId가 주어지지 않으면 캐시 디렉토리의 모든 JSON 사용
  for f in "$CACHE_DIR"/design-context/*.json; do
    [ -f "$f" ] || continue
    nid=$(basename "$f" .json)
    NODE_IDS+=("$nid")
  done
fi

# ─── 유틸 함수 ───

# Figma px → Tailwind spacing scale 매핑 (4px 기준)
px_to_tw() {
  local px=$1
  case "$px" in
    0) echo "0" ;;
    1) echo "px" ;;
    2) echo "0.5" ;;
    4) echo "1" ;;
    6) echo "1.5" ;;
    8) echo "2" ;;
    10) echo "2.5" ;;
    12) echo "3" ;;
    14) echo "3.5" ;;
    16) echo "4" ;;
    20) echo "5" ;;
    24) echo "6" ;;
    28) echo "7" ;;
    32) echo "8" ;;
    36) echo "9" ;;
    40) echo "10" ;;
    44) echo "11" ;;
    48) echo "12" ;;
    56) echo "14" ;;
    64) echo "16" ;;
    80) echo "20" ;;
    96) echo "24" ;;
    *) echo "[${px}px]" ;;
  esac
}

# 코드에서 특정 Tailwind 클래스 패턴이 있는지 확인
has_class() {
  echo "$CODE" | grep -q "$1"
}

# ─── 각 nodeId에 대해 검증 ───
for NODE_ID in "${NODE_IDS[@]}"; do
  DC_FILE="$CACHE_DIR/design-context/${NODE_ID}.json"
  [ -f "$DC_FILE" ] || continue

  DC=$(cat "$DC_FILE")

  # ── 1. padding 검증 ──
  PL=$(echo "$DC" | jq -r '.paddingLeft // empty' 2>/dev/null)
  PR=$(echo "$DC" | jq -r '.paddingRight // empty' 2>/dev/null)
  PT=$(echo "$DC" | jq -r '.paddingTop // empty' 2>/dev/null)
  PB=$(echo "$DC" | jq -r '.paddingBottom // empty' 2>/dev/null)

  if [ -n "$PL" ] && [ "$PL" != "0" ] && [ "$PL" != "null" ]; then
    TW=$(px_to_tw "${PL%.*}")
    # p-{tw}, px-{tw}, pl-{tw}, padding 관련 클래스 확인
    if ! has_class "p-${TW}\b\|px-${TW}\b\|pl-${TW}\b\|p-\[${PL%.*}px\]\|pl-\[${PL%.*}px\]"; then
      VIOLATIONS+=("❌ [padding] 노드 ${NODE_ID}: paddingLeft=${PL}px → p-${TW} 또는 pl-${TW} 필요")
    fi
  fi

  if [ -n "$PT" ] && [ "$PT" != "0" ] && [ "$PT" != "null" ]; then
    TW=$(px_to_tw "${PT%.*}")
    if ! has_class "p-${TW}\b\|py-${TW}\b\|pt-${TW}\b\|p-\[${PT%.*}px\]\|pt-\[${PT%.*}px\]"; then
      VIOLATIONS+=("❌ [padding] 노드 ${NODE_ID}: paddingTop=${PT}px → p-${TW} 또는 pt-${TW} 필요")
    fi
  fi

  # ── 2. gap (itemSpacing) 검증 ──
  GAP=$(echo "$DC" | jq -r '.itemSpacing // empty' 2>/dev/null)
  LAYOUT_MODE=$(echo "$DC" | jq -r '.layoutMode // empty' 2>/dev/null)

  if [ -n "$GAP" ] && [ "$GAP" != "0" ] && [ "$GAP" != "null" ] && [ -n "$LAYOUT_MODE" ]; then
    TW=$(px_to_tw "${GAP%.*}")
    if ! has_class "gap-${TW}\b\|gap-x-${TW}\b\|gap-y-${TW}\b\|gap-\[${GAP%.*}px\]"; then
      VIOLATIONS+=("❌ [gap] 노드 ${NODE_ID}: itemSpacing=${GAP}px → gap-${TW} 필요")
    fi
  fi

  # ── 3. layoutMode (flex-direction) 검증 ──
  if [ -n "$LAYOUT_MODE" ] && [ "$LAYOUT_MODE" != "null" ]; then
    case "$LAYOUT_MODE" in
      HORIZONTAL)
        if ! has_class 'flex-row\|flex '; then
          WARNINGS+=("⚠️ [layout] 노드 ${NODE_ID}: layoutMode=HORIZONTAL → flex-row 필요")
        fi
        ;;
      VERTICAL)
        if ! has_class 'flex-col'; then
          VIOLATIONS+=("❌ [layout] 노드 ${NODE_ID}: layoutMode=VERTICAL → flex-col 필요")
        fi
        ;;
    esac
  fi

  # ── 4. strokeDashes (border-style) 검증 ──
  STROKE_DASHES=$(echo "$DC" | jq -r '.strokeDashes // empty' 2>/dev/null)
  HAS_STROKES=$(echo "$DC" | jq -r 'if (.strokes // [] | length) > 0 then "yes" else "no" end' 2>/dev/null)
  HAS_FILLS=$(echo "$DC" | jq -r 'if (.fills // [] | length) > 0 then "yes" else "no" end' 2>/dev/null)

  # fills만 있고 strokes 없는데 border-dashed/dotted 사용 → FAIL
  if [ "$HAS_STROKES" = "no" ] && [ "$HAS_FILLS" = "yes" ]; then
    if has_class 'border-dashed\|border-dotted'; then
      VIOLATIONS+=("❌ [divider] 노드 ${NODE_ID}: fills 기반(strokes 없음)인데 border-dashed/dotted 사용 — bg-{color}로 구현해야 합니다")
    fi
  fi

  # strokes 있고 strokeDashes 있는데 border-solid 사용 → 확인 필요
  if [ "$HAS_STROKES" = "yes" ] && [ -n "$STROKE_DASHES" ] && [ "$STROKE_DASHES" != "[]" ] && [ "$STROKE_DASHES" != "null" ]; then
    if has_class 'border-solid' && ! has_class 'border-dashed\|border-dotted'; then
      VIOLATIONS+=("❌ [divider] 노드 ${NODE_ID}: strokeDashes=${STROKE_DASHES} → border-dashed 또는 border-dotted 필요 (border-solid 사용됨)")
    fi
  fi

  # ── 5. rotation 검증 ──
  ROTATION=$(echo "$DC" | jq -r '.rotation // 0' 2>/dev/null)
  if [ -n "$ROTATION" ] && [ "$ROTATION" != "0" ] && [ "$ROTATION" != "null" ]; then
    if ! has_class 'rotate-\|rotate(\|-rotate-'; then
      VIOLATIONS+=("❌ [rotation] 노드 ${NODE_ID}: rotation=${ROTATION}° → rotate-[-${ROTATION}deg] 필요")
    fi
  fi

  # ── 6. clipsContent (overflow) 검증 ──
  CLIPS=$(echo "$DC" | jq -r '.clipsContent // false' 2>/dev/null)
  if [ "$CLIPS" = "true" ]; then
    if ! has_class 'overflow-hidden\|overflow-auto\|overflow-scroll'; then
      VIOLATIONS+=("❌ [overflow] 노드 ${NODE_ID}: clipsContent=true → overflow-hidden 필요")
    fi
  fi

  # ── 7. layoutSizing 검증 ──
  SIZING_H=$(echo "$DC" | jq -r '.layoutSizingHorizontal // empty' 2>/dev/null)
  SIZING_V=$(echo "$DC" | jq -r '.layoutSizingVertical // empty' 2>/dev/null)

  if [ "$SIZING_H" = "FILL" ]; then
    if ! has_class 'flex-1\|w-full\|grow'; then
      WARNINGS+=("⚠️ [sizing] 노드 ${NODE_ID}: layoutSizingHorizontal=FILL → flex-1 또는 w-full 필요")
    fi
  fi
  if [ "$SIZING_V" = "FILL" ]; then
    if ! has_class 'flex-1\|h-full\|grow'; then
      WARNINGS+=("⚠️ [sizing] 노드 ${NODE_ID}: layoutSizingVertical=FILL → flex-1 또는 h-full 필요")
    fi
  fi

  # ── 8. 아이콘 SVG fill 대조 ──
  NODE_TYPE=$(echo "$DC" | jq -r '.type // empty' 2>/dev/null)
  if [ "$NODE_TYPE" = "VECTOR" ] || [ "$NODE_TYPE" = "BOOLEAN_OPERATION" ]; then
    FIGMA_FILL_COLOR=$(echo "$DC" | jq -r '(.fills // [])[0].color // empty' 2>/dev/null)

    SVG_FILE="$CACHE_DIR/assets/${NODE_ID}.svg"
    if [ -f "$SVG_FILE" ] && [ -n "$FIGMA_FILL_COLOR" ] && [ "$FIGMA_FILL_COLOR" != "null" ]; then
      SVG_FILL=$(grep -oP 'fill="([^"]*)"' "$SVG_FILE" 2>/dev/null | head -1 | sed 's/fill="//;s/"//' || true)

      if [ "$SVG_FILL" = "none" ] || [ -z "$SVG_FILL" ]; then
        # fill="none" SVG를 <img>로 로드하면 색상 미표시
        if has_class "src=.*$(basename "$SVG_FILE")" || has_class "import.*$(basename "$SVG_FILE" .svg)"; then
          if has_class '<img.*src='; then
            WARNINGS+=("⚠️ [svg-fill] 노드 ${NODE_ID}: SVG fill=\"none\" → <img>로 로드 시 색상 미표시 — React SVG 컴포넌트 또는 인라인 사용 권장")
          fi
        fi
      else
        # Figma RGB → hex 변환 후 SVG fill hex와 비교
        FIGMA_R=$(echo "$FIGMA_FILL_COLOR" | jq -r '.r // 0' 2>/dev/null)
        FIGMA_G=$(echo "$FIGMA_FILL_COLOR" | jq -r '.g // 0' 2>/dev/null)
        FIGMA_B=$(echo "$FIGMA_FILL_COLOR" | jq -r '.b // 0' 2>/dev/null)
        if [ -n "$FIGMA_R" ] && [ "$FIGMA_R" != "null" ]; then
          FIGMA_HEX=$(printf '#%02x%02x%02x' \
            "$(echo "($FIGMA_R * 255 + 0.5) / 1" | bc)" \
            "$(echo "($FIGMA_G * 255 + 0.5) / 1" | bc)" \
            "$(echo "($FIGMA_B * 255 + 0.5) / 1" | bc)")
          SVG_FILL_LOWER=$(echo "$SVG_FILL" | tr '[:upper:]' '[:lower:]')
          FIGMA_HEX_LOWER=$(echo "$FIGMA_HEX" | tr '[:upper:]' '[:lower:]')
          if [ "$SVG_FILL_LOWER" != "$FIGMA_HEX_LOWER" ] && [ "$SVG_FILL" != "currentColor" ]; then
            WARNINGS+=("⚠️ [svg-fill-color] 노드 ${NODE_ID}: SVG fill=${SVG_FILL} ≠ Figma fill=${FIGMA_HEX} — 색상 불일치")
          fi
        fi
      fi
    fi
  fi

  # ── 9. 아이콘 노드 rotation 코드 반영 확인 ──
  ICON_ROTATION=$(echo "$DC" | jq -r '.rotation // 0' 2>/dev/null)
  if [ "$NODE_TYPE" = "VECTOR" ] || [ "$NODE_TYPE" = "BOOLEAN_OPERATION" ]; then
    if [ -n "$ICON_ROTATION" ] && [ "$ICON_ROTATION" != "0" ] && [ "$ICON_ROTATION" != "null" ]; then
      if ! has_class 'rotate-\|rotate(\|-rotate-'; then
        WARNINGS+=("⚠️ [icon-rotation] 노드 ${NODE_ID}: 아이콘 rotation=${ICON_ROTATION}° → 코드에 rotate 클래스 없음")
      fi
    fi
  fi

  # ── 10. 아이콘 노드 크기 코드 반영 확인 ──
  if [ "$NODE_TYPE" = "VECTOR" ] || [ "$NODE_TYPE" = "BOOLEAN_OPERATION" ]; then
    ICON_W=$(echo "$DC" | jq -r '.absoluteBoundingBox.width // empty' 2>/dev/null)
    ICON_H=$(echo "$DC" | jq -r '.absoluteBoundingBox.height // empty' 2>/dev/null)
    if [ -n "$ICON_W" ] && [ "$ICON_W" != "null" ] && [ -n "$ICON_H" ] && [ "$ICON_H" != "null" ]; then
      ICON_W_INT=${ICON_W%.*}
      ICON_H_INT=${ICON_H%.*}
      TW_W=$(px_to_tw "$ICON_W_INT")
      TW_H=$(px_to_tw "$ICON_H_INT")
      if ! has_class "w-${TW_W}\b\|w-\[${ICON_W_INT}px\]\|size-${TW_W}\b\|size-\[${ICON_W_INT}px\]"; then
        WARNINGS+=("⚠️ [icon-size] 노드 ${NODE_ID}: 아이콘 width=${ICON_W_INT}px → w-${TW_W} 또는 w-[${ICON_W_INT}px] 필요")
      fi
      if ! has_class "h-${TW_H}\b\|h-\[${ICON_H_INT}px\]\|size-${TW_H}\b\|size-\[${ICON_H_INT}px\]"; then
        WARNINGS+=("⚠️ [icon-size] 노드 ${NODE_ID}: 아이콘 height=${ICON_H_INT}px → h-${TW_H} 또는 h-[${ICON_H_INT}px] 필요")
      fi
    fi
  fi

done

# ─── 결과 출력 ───
TOTAL_ISSUES=$(( ${#VIOLATIONS[@]} + ${#WARNINGS[@]} ))

if [ $TOTAL_ISSUES -eq 0 ]; then
  echo "✅ verify-figma-props: 속성 대조 검증 통과 (${#NODE_IDS[@]}개 노드)"
  exit 0
fi

{
  echo ""
  echo "🔍 verify-figma-props: 속성 대조 검증 결과"
  echo "════════════════════════════════════════════"
  echo "파일: $(basename "$CODE_FILE")"
  echo "검사 노드: ${#NODE_IDS[@]}개"
  echo ""

  if [ ${#VIOLATIONS[@]} -gt 0 ]; then
    echo "── 오류 (${#VIOLATIONS[@]}개) ──"
    printf '%s\n' "${VIOLATIONS[@]}"
    echo ""
  fi

  if [ ${#WARNINGS[@]} -gt 0 ]; then
    echo "── 경고 (${#WARNINGS[@]}개) ──"
    printf '%s\n' "${WARNINGS[@]}"
    echo ""
  fi

  echo "════════════════════════════════════════════"
} >&2

# 오류가 있으면 exit 1, 경고만이면 exit 0
if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  exit 1
else
  exit 0
fi
