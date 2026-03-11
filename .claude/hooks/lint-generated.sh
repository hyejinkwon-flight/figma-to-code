#!/bin/bash
# Figma → Code 생성 코드 린트 Hook
# PostToolUse (Write|Edit) 시 실행되어 금지 패턴을 검출한다.
# exit 2 + stderr → Claude에 피드백으로 전달

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# 파일 경로가 없으면 종료
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# .tsx, .jsx, .ts, .js 파일만 검사
if ! [[ "$FILE_PATH" =~ \.(tsx?|jsx?)$ ]]; then
  exit 0
fi

# 설정 파일, 테스트 파일, node_modules, 린터/검증 소스 제외
if [[ "$FILE_PATH" =~ (config|\.config\.|\.test\.|\.spec\.|node_modules|tailwind|postcss|verifier/|code-linter) ]]; then
  exit 0
fi

# 파일이 존재하지 않으면 종료 (삭제된 경우)
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

VIOLATIONS=()

# Rule 1: hex/rgb 하드코딩 검사
# className 내부의 Tailwind 임의값 bg-[#xxx]은 허용, 순수 hex 하드코딩만 검출
# CSS-in-JS style 객체 내 #xxx, rgb() 검출
HEX_MATCHES=$(grep -n 'color:.*#[0-9a-fA-F]\{3,8\}\b\|background:.*#[0-9a-fA-F]\{3,8\}\b\|style=.*#[0-9a-fA-F]\{3,8\}\b\|: ["'\''"]#[0-9a-fA-F]\{3,8\}\b\|rgb([0-9]' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$HEX_MATCHES" ]; then
  VIOLATIONS+=("❌ [no-hardcoded-color] hex/rgb 하드코딩 감지 — Tailwind 토큰을 사용하세요:")
  VIOLATIONS+=("$HEX_MATCHES")
fi

# Rule 2: inline SVG 직접 작성 검사
# import 문의 .svg는 허용, JSX 내 <svg> 태그만 검출
# ⚠️ grep -E 사용 — basic grep의 \s는 whitespace를 매칭하지 못함
SVG_MATCHES=$(grep -En '<svg[[:space:]>]|<path[[:space:]]|<circle[[:space:]]|<rect[[:space:]]|<polygon[[:space:]]|<polyline[[:space:]]|<ellipse[[:space:]]' "$FILE_PATH" 2>/dev/null | grep -v 'import\|require\|from' || true)
if [ -n "$SVG_MATCHES" ]; then
  VIOLATIONS+=("❌ [no-inline-svg] SVG를 JSX에 직접 작성하지 마세요 — Figma에서 SVG를 다운로드하여 import하세요:")
  VIOLATIONS+=("$SVG_MATCHES")
fi

# Rule 2b: SVG path data (d="M...") 직접 작성 검사
# <svg> 태그 없이 path data만 문자열로 넣는 케이스도 검출
SVG_PATH_DATA=$(grep -En 'd="M[0-9]|d="m[0-9]' "$FILE_PATH" 2>/dev/null | grep -v 'import\|require\|from\|\.svg' || true)
if [ -n "$SVG_PATH_DATA" ]; then
  VIOLATIONS+=("❌ [no-svg-path-data] SVG path data를 코드에 직접 작성하지 마세요 — Figma에서 SVG 파일을 다운로드하세요:")
  VIOLATIONS+=("$SVG_PATH_DATA")
fi

# Rule 3: 아이콘 라이브러리 import 검사
ICON_LIB_MATCHES=$(grep -n "from ['\"].*\(lucide\|heroicons\|react-icons\|@fortawesome\|ionicons\|feather-icons\)" "$FILE_PATH" 2>/dev/null || true)
if [ -n "$ICON_LIB_MATCHES" ]; then
  VIOLATIONS+=("❌ [no-icon-library] 아이콘 라이브러리 import 금지 — Figma에서 SVG를 export하세요:")
  VIOLATIONS+=("$ICON_LIB_MATCHES")
fi

# Rule 4: 외부 이미지 URL 검사
EXT_IMG_MATCHES=$(grep -n 'placeholder\.com\|unsplash\.com\|picsum\.photos\|via\.placeholder\|placehold\.co\|lorempixel' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$EXT_IMG_MATCHES" ]; then
  VIOLATIONS+=("❌ [no-external-placeholder] 외부 placeholder 이미지 URL 금지 — Figma에서 이미지를 export하세요:")
  VIOLATIONS+=("$EXT_IMG_MATCHES")
fi

# Rule 5: placeholder 텍스트 검사
PLACEHOLDER_MATCHES=$(grep -n 'Lorem ipsum\|dolor sit amet\|placeholder text' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$PLACEHOLDER_MATCHES" ]; then
  VIOLATIONS+=("❌ [no-placeholder-text] placeholder 텍스트 금지 — Figma의 원본 텍스트를 사용하세요:")
  VIOLATIONS+=("$PLACEHOLDER_MATCHES")
fi

# Rule 6: CSS로 아이콘/도형 흉내 검사
# 6a: border + rotate로 화살표 흉내
CSS_ICON_ARROW=$(grep -n 'border-[rtbl].*rotate\|transform.*rotate.*border\|border-r-2.*border-b-2.*rotate' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$CSS_ICON_ARROW" ]; then
  VIOLATIONS+=("❌ [no-css-icon] CSS border+rotate로 아이콘을 흉내내지 마세요 — Figma export SVG를 사용하세요:")
  VIOLATIONS+=("$CSS_ICON_ARROW")
fi

# 6b: 작은 rounded-full + bg-color로 원형 아이콘/도트 흉내
# w-1~w-6 (단독 토큰) + rounded-full + bg- 조합 검출
# w-10, w-12 등 큰 크기는 아이콘 흉내가 아니므로 제외
CSS_ICON_DOT=$(grep -En '(w-[1-6][^0-9]|w-\[[0-9]+(px|rem)\]).*rounded-full.*bg-|rounded-full.*(w-[1-6][^0-9]|w-\[[0-9]+(px|rem)\]).*bg-|bg-.*rounded-full.*(w-[1-6][^0-9]|w-\[[0-9]+(px|rem)\])' "$FILE_PATH" 2>/dev/null | grep -v 'avatar\|profile\|thumb\|logo\|img' || true)
if [ -n "$CSS_ICON_DOT" ]; then
  VIOLATIONS+=("❌ [no-css-icon-dot] 작은 rounded-full + bg 조합으로 아이콘/도형을 흉내내지 마세요 — Figma export SVG를 사용하세요:")
  VIOLATIONS+=("$CSS_ICON_DOT")
fi

# 6c: border-transparent로 삼각형 흉내
CSS_ICON_TRIANGLE=$(grep -n 'border-transparent' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$CSS_ICON_TRIANGLE" ]; then
  VIOLATIONS+=("❌ [no-css-icon-triangle] CSS border-transparent로 삼각형을 흉내내지 마세요 — Figma export SVG를 사용하세요:")
  VIOLATIONS+=("$CSS_ICON_TRIANGLE")
fi

# 6d: clip-path로 도형 흉내
CSS_ICON_CLIP=$(grep -n 'clip-path\|clipPath' "$FILE_PATH" 2>/dev/null | grep -v 'import\|require\|\.svg' || true)
if [ -n "$CSS_ICON_CLIP" ]; then
  VIOLATIONS+=("❌ [no-css-icon-clip] clip-path로 도형을 흉내내지 마세요 — Figma export SVG를 사용하세요:")
  VIOLATIONS+=("$CSS_ICON_CLIP")
fi

# Rule 7: <img> 태그에 alt 속성 누락 검사
IMG_NO_ALT=$(grep -n '<img ' "$FILE_PATH" 2>/dev/null | grep -v 'alt=' || true)
if [ -n "$IMG_NO_ALT" ]; then
  VIOLATIONS+=("❌ [img-alt-required] <img>에 alt 속성 필수 — 장식용이면 alt=\"\" aria-hidden=\"true\" 추가:")
  VIOLATIONS+=("$IMG_NO_ALT")
fi

# Rule 8: line-clamp에 overflow-hidden 동반 검사
LINE_CLAMP_LINES=$(grep -n 'line-clamp-[0-9]' "$FILE_PATH" 2>/dev/null || true)
if [ -n "$LINE_CLAMP_LINES" ]; then
  while IFS= read -r match; do
    line_num=$(echo "$match" | cut -d: -f1)
    line_content=$(sed -n "${line_num}p" "$FILE_PATH")
    if ! echo "$line_content" | grep -q 'overflow-hidden'; then
      VIOLATIONS+=("❌ [line-clamp-overflow] line-clamp에는 overflow-hidden이 필요합니다 (line $line_num):")
      VIOLATIONS+=("  $line_content")
    fi
  done <<< "$LINE_CLAMP_LINES"
fi

# Rule 9: 인라인 style에 px 하드코딩 검사
INLINE_PX=$(grep -n 'style={{' "$FILE_PATH" 2>/dev/null | grep '[0-9]\+px\|"[0-9]\+"' || true)
if [ -n "$INLINE_PX" ]; then
  VIOLATIONS+=("⚠️ [prefer-tailwind-sizing] 인라인 style에 px 하드코딩 — Tailwind 클래스를 우선 사용하세요:")
  VIOLATIONS+=("$INLINE_PX")
fi

# Rule 10: object-fit 없는 <img> + className에 w/h가 모두 있는 경우 (이미지 찌그러짐 위험)
IMG_WITH_SIZE=$(grep -n '<img ' "$FILE_PATH" 2>/dev/null | grep 'w-\[.*\].*h-\[\|h-\[.*\].*w-\[' | grep -v 'object-' || true)
if [ -n "$IMG_WITH_SIZE" ]; then
  VIOLATIONS+=("⚠️ [img-object-fit] 고정 w/h가 지정된 <img>에 object-fit(cover/contain)이 없습니다 — 이미지 찌그러짐 위험:")
  VIOLATIONS+=("$IMG_WITH_SIZE")
fi

# Rule 11: fills 기반 요소(bg-)에 border-dashed/dotted 혼용 검사
# fills만 있고 strokes 없는 구분선에 border-dashed를 사용하면 FAIL
BG_BORDER_MIX=$(grep -n 'bg-.*border-dashed\|bg-.*border-dotted\|border-dashed.*bg-\|border-dotted.*bg-' "$FILE_PATH" 2>/dev/null | grep -v 'border-[trbl]' || true)
if [ -n "$BG_BORDER_MIX" ]; then
  VIOLATIONS+=("⚠️ [bg-border-mix] bg-{color}와 border-dashed/dotted 혼용 — fills 기반 구분선이면 bg만 사용, stroke 기반이면 border만 사용:")
  VIOLATIONS+=("$BG_BORDER_MIX")
fi

# Rule 12: SVG를 <img>로 import하면서 w-/h- 크기 없음
SVG_IMG_NO_SIZE=$(grep -n '<img.*\.svg' "$FILE_PATH" 2>/dev/null | grep -v 'w-\|h-\|width\|height' || true)
if [ -n "$SVG_IMG_NO_SIZE" ]; then
  VIOLATIONS+=("⚠️ [svg-no-size] SVG를 <img>로 사용하면서 크기(w-/h-)가 없습니다 — 아이콘 크기를 명시하세요:")
  VIOLATIONS+=("$SVG_IMG_NO_SIZE")
fi

# Rule 13: 캐시 기반 Figma 속성값 대조 (캐시 존재 시에만 실행)
# /tmp/figma-cache/*/design-context/*.json의 속성값과 코드를 자동 대조한다.
# verify-figma-props.sh의 체크를 PostToolUse로 통합하여 Write/Edit 시 즉시 검출.
CACHE_DIRS=(/tmp/figma-cache/*/design-context)
if [ -d "${CACHE_DIRS[0]:-__none__}" ] && command -v jq &>/dev/null; then
  CODE=$(cat "$FILE_PATH")

  # px → Tailwind spacing scale 매핑
  px_to_tw() {
    case "$1" in
      0) echo "0" ;; 1) echo "px" ;; 2) echo "0.5" ;; 4) echo "1" ;;
      6) echo "1.5" ;; 8) echo "2" ;; 10) echo "2.5" ;; 12) echo "3" ;;
      14) echo "3.5" ;; 16) echo "4" ;; 20) echo "5" ;; 24) echo "6" ;;
      28) echo "7" ;; 32) echo "8" ;; 36) echo "9" ;; 40) echo "10" ;;
      48) echo "12" ;; 56) echo "14" ;; 64) echo "16" ;; 80) echo "20" ;; 96) echo "24" ;;
      *) echo "[${1}px]" ;;
    esac
  }

  # 코드에서 Tailwind 클래스 존재 확인
  has_class() { echo "$CODE" | grep -q "$1"; }

  DC_COUNT=0
  for DC_FILE in /tmp/figma-cache/*/design-context/*.json; do
    [ -f "$DC_FILE" ] || continue
    ((DC_COUNT++))
    [ $DC_COUNT -gt 30 ] && break  # 성능 제한

    NODE_ID=$(basename "$DC_FILE" .json)
    NODE_TYPE=$(jq -r '.type // empty' "$DC_FILE" 2>/dev/null)

    # ── 13a~c: TEXT 노드 (fontSize, fontWeight, fills 색상) ──
    if [ "$NODE_TYPE" = "TEXT" ]; then
      # 13a: fontSize
      FIGMA_FS=$(jq -r '.style.fontSize // empty' "$DC_FILE" 2>/dev/null)
      if [ -n "$FIGMA_FS" ] && [ "$FIGMA_FS" != "null" ]; then
        FS_INT=${FIGMA_FS%.*}
        case "$FS_INT" in
          12) TW_TEXT="text-xs" ;; 14) TW_TEXT="text-sm" ;; 16) TW_TEXT="text-base" ;;
          18) TW_TEXT="text-lg" ;; 20) TW_TEXT="text-xl" ;; 24) TW_TEXT="text-2xl" ;;
          30) TW_TEXT="text-3xl" ;; 36) TW_TEXT="text-4xl" ;; *) TW_TEXT="text-\[${FS_INT}px\]" ;;
        esac
        if ! has_class "${TW_TEXT}\|text-\[${FS_INT}px\]\|fontSize.*${FS_INT}"; then
          VIOLATIONS+=("❌ [figma-fontSize] 노드 ${NODE_ID}: fontSize=${FS_INT}px → ${TW_TEXT} 필요")
        fi
      fi

      # 13b: fontWeight
      FIGMA_FW=$(jq -r '.style.fontWeight // empty' "$DC_FILE" 2>/dev/null)
      if [ -n "$FIGMA_FW" ] && [ "$FIGMA_FW" != "null" ]; then
        FW_INT=${FIGMA_FW%.*}
        case "$FW_INT" in
          100) TW_FW="font-thin" ;; 200) TW_FW="font-extralight" ;; 300) TW_FW="font-light" ;;
          400) TW_FW="font-normal" ;; 500) TW_FW="font-medium" ;; 600) TW_FW="font-semibold" ;;
          700) TW_FW="font-bold" ;; 800) TW_FW="font-extrabold" ;; 900) TW_FW="font-black" ;;
          *) TW_FW="font-\[${FW_INT}\]" ;;
        esac
        if ! has_class "${TW_FW}\|font-\[${FW_INT}\]\|fontWeight.*${FW_INT}"; then
          VIOLATIONS+=("⚠️ [figma-fontWeight] 노드 ${NODE_ID}: fontWeight=${FW_INT} → ${TW_FW} 필요")
        fi
      fi

      # 13c: TEXT fills 색상 (검정/흰색 제외)
      TEXT_R=$(jq -r '(.fills // [])[0].color.r // empty' "$DC_FILE" 2>/dev/null)
      if [ -n "$TEXT_R" ] && [ "$TEXT_R" != "null" ]; then
        TEXT_G=$(jq -r '(.fills // [])[0].color.g // empty' "$DC_FILE" 2>/dev/null)
        TEXT_B=$(jq -r '(.fills // [])[0].color.b // empty' "$DC_FILE" 2>/dev/null)
        IS_BW=$(echo "($TEXT_R < 0.1 && $TEXT_G < 0.1 && $TEXT_B < 0.1) || ($TEXT_R > 0.95 && $TEXT_G > 0.95 && $TEXT_B > 0.95)" | bc -l 2>/dev/null || echo "0")
        if [ "$IS_BW" != "1" ]; then
          if ! has_class 'text-\(gray\|red\|blue\|green\|yellow\|orange\|purple\|pink\|indigo\|teal\|cyan\|emerald\|violet\|rose\|amber\|lime\|sky\|fuchsia\|slate\|zinc\|neutral\|stone\)'; then
            VIOLATIONS+=("⚠️ [figma-textColor] 노드 ${NODE_ID}: TEXT fills 색상 있으나 text-{color} 클래스 없음")
          fi
        fi
      fi
    fi

    # ── 13d: 아이콘 노드 크기 (VECTOR/BOOLEAN_OPERATION) ──
    if [ "$NODE_TYPE" = "VECTOR" ] || [ "$NODE_TYPE" = "BOOLEAN_OPERATION" ]; then
      ICON_W=$(jq -r '.absoluteBoundingBox.width // empty' "$DC_FILE" 2>/dev/null)
      if [ -n "$ICON_W" ] && [ "$ICON_W" != "null" ]; then
        IW=${ICON_W%.*}
        if ! has_class "w-${IW}\b\|w-\[${IW}px\]\|size-\[${IW}px\]\|width.*${IW}"; then
          VIOLATIONS+=("⚠️ [figma-iconSize] 노드 ${NODE_ID}: 아이콘 width=${IW}px — 크기 클래스 없음")
        fi
      fi
    fi

    # ── 13e: padding 대조 ──
    PL=$(jq -r '.paddingLeft // empty' "$DC_FILE" 2>/dev/null)
    if [ -n "$PL" ] && [ "$PL" != "0" ] && [ "$PL" != "null" ]; then
      PL_INT=${PL%.*}
      TW_P=$(px_to_tw "$PL_INT")
      if ! has_class "p-${TW_P}\b\|px-${TW_P}\b\|pl-${TW_P}\b\|p-\[${PL_INT}px\]\|pl-\[${PL_INT}px\]"; then
        VIOLATIONS+=("⚠️ [figma-padding] 노드 ${NODE_ID}: paddingLeft=${PL_INT}px → p-${TW_P} 또는 pl-${TW_P} 필요")
      fi
    fi
    PT=$(jq -r '.paddingTop // empty' "$DC_FILE" 2>/dev/null)
    if [ -n "$PT" ] && [ "$PT" != "0" ] && [ "$PT" != "null" ]; then
      PT_INT=${PT%.*}
      TW_PT=$(px_to_tw "$PT_INT")
      if ! has_class "p-${TW_PT}\b\|py-${TW_PT}\b\|pt-${TW_PT}\b\|p-\[${PT_INT}px\]\|pt-\[${PT_INT}px\]"; then
        VIOLATIONS+=("⚠️ [figma-padding] 노드 ${NODE_ID}: paddingTop=${PT_INT}px → p-${TW_PT} 또는 pt-${TW_PT} 필요")
      fi
    fi

    # ── 13f: gap (itemSpacing) 대조 ──
    GAP=$(jq -r '.itemSpacing // empty' "$DC_FILE" 2>/dev/null)
    LM=$(jq -r '.layoutMode // empty' "$DC_FILE" 2>/dev/null)
    if [ -n "$GAP" ] && [ "$GAP" != "0" ] && [ "$GAP" != "null" ] && [ -n "$LM" ] && [ "$LM" != "null" ]; then
      GAP_INT=${GAP%.*}
      TW_GAP=$(px_to_tw "$GAP_INT")
      if ! has_class "gap-${TW_GAP}\b\|gap-x-${TW_GAP}\b\|gap-y-${TW_GAP}\b\|gap-\[${GAP_INT}px\]"; then
        VIOLATIONS+=("⚠️ [figma-gap] 노드 ${NODE_ID}: itemSpacing=${GAP_INT}px → gap-${TW_GAP} 필요")
      fi
    fi

    # ── 13g: layoutMode (flex-direction) 대조 ──
    if [ -n "$LM" ] && [ "$LM" != "null" ]; then
      if [ "$LM" = "VERTICAL" ] && ! has_class 'flex-col'; then
        VIOLATIONS+=("⚠️ [figma-layout] 노드 ${NODE_ID}: layoutMode=VERTICAL → flex-col 필요")
      fi
    fi

    # ── 13h: rotation 대조 ──
    ROT=$(jq -r '.rotation // 0' "$DC_FILE" 2>/dev/null)
    if [ -n "$ROT" ] && [ "$ROT" != "0" ] && [ "$ROT" != "null" ]; then
      if ! has_class 'rotate-\|rotate(\|-rotate-'; then
        VIOLATIONS+=("⚠️ [figma-rotation] 노드 ${NODE_ID}: rotation=${ROT}° → rotate 클래스 필요")
      fi
    fi

    # ── 13i: clipsContent (overflow) 대조 ──
    CLIPS=$(jq -r '.clipsContent // false' "$DC_FILE" 2>/dev/null)
    if [ "$CLIPS" = "true" ]; then
      if ! has_class 'overflow-hidden\|overflow-auto\|overflow-scroll'; then
        VIOLATIONS+=("⚠️ [figma-overflow] 노드 ${NODE_ID}: clipsContent=true → overflow-hidden 필요")
      fi
    fi

    # ── 13j: layoutSizing 대조 ──
    SH=$(jq -r '.layoutSizingHorizontal // empty' "$DC_FILE" 2>/dev/null)
    SV=$(jq -r '.layoutSizingVertical // empty' "$DC_FILE" 2>/dev/null)
    if [ "$SH" = "FILL" ] && ! has_class 'flex-1\|w-full\|grow'; then
      VIOLATIONS+=("⚠️ [figma-sizing] 노드 ${NODE_ID}: layoutSizingHorizontal=FILL → flex-1 또는 w-full 필요")
    fi
    if [ "$SV" = "FILL" ] && ! has_class 'flex-1\|h-full\|grow'; then
      VIOLATIONS+=("⚠️ [figma-sizing] 노드 ${NODE_ID}: layoutSizingVertical=FILL → flex-1 또는 h-full 필요")
    fi

    # ── 13k: strokeDashes (border-style) 대조 ──
    HAS_STROKES=$(jq -r 'if (.strokes // [] | length) > 0 then "yes" else "no" end' "$DC_FILE" 2>/dev/null)
    HAS_FILLS=$(jq -r 'if (.fills // [] | length) > 0 then "yes" else "no" end' "$DC_FILE" 2>/dev/null)
    if [ "$HAS_STROKES" = "no" ] && [ "$HAS_FILLS" = "yes" ]; then
      if has_class 'border-dashed\|border-dotted'; then
        VIOLATIONS+=("⚠️ [figma-divider] 노드 ${NODE_ID}: fills 기반(strokes 없음)인데 border-dashed/dotted 사용 — bg-{color}로 구현")
      fi
    fi
    if [ "$HAS_STROKES" = "yes" ]; then
      SD=$(jq -r '.strokeDashes // "[]"' "$DC_FILE" 2>/dev/null)
      if [ -n "$SD" ] && [ "$SD" != "[]" ] && [ "$SD" != "null" ]; then
        if has_class 'border-solid' && ! has_class 'border-dashed\|border-dotted'; then
          VIOLATIONS+=("⚠️ [figma-divider] 노드 ${NODE_ID}: strokeDashes=${SD} → border-dashed 또는 border-dotted 필요")
        fi
      fi
    fi

  done
fi

# 위반 사항이 있으면 exit 2로 Claude에 피드백
if [ ${#VIOLATIONS[@]} -gt 0 ]; then
  {
    echo ""
    echo "🔍 lint-generated: $(basename "$FILE_PATH")에서 위반 사항 발견"
    echo "────────────────────────────────────────"
    printf '%s\n' "${VIOLATIONS[@]}"
    echo "────────────────────────────────────────"
    echo "위 항목을 수정한 후 다시 저장하세요."
    echo ""
  } >&2
  exit 2
fi

exit 0
