#!/bin/bash
# Figma → Code 스킬 설치 스크립트
# 대상 프로젝트에서 실행: bash /path/to/figma-to-code/setup-skills.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_SKILLS="$SCRIPT_DIR/.claude/skills"
TARGET_DIR="$(pwd)/.claude/skills"

echo "============================================"
echo "Figma → Code 스킬 설치"
echo "============================================"
echo ""
echo "소스: $SOURCE_SKILLS"
echo "대상: $TARGET_DIR"
echo ""

# 1. 스킬 디렉토리 생성
mkdir -p "$TARGET_DIR/implement-figma"
mkdir -p "$TARGET_DIR/verify-figma"

# 2. 전체 파일 복사
echo "[1/4] implement-figma 스킬 복사 중..."
cp "$SOURCE_SKILLS/implement-figma/SKILL.md" "$TARGET_DIR/implement-figma/SKILL.md"
cp "$SOURCE_SKILLS/implement-figma/rules.md" "$TARGET_DIR/implement-figma/rules.md"
cp "$SOURCE_SKILLS/implement-figma/config.md" "$TARGET_DIR/implement-figma/config.md"

echo "[2/4] verify-figma 스킬 복사 중..."
cp "$SOURCE_SKILLS/verify-figma/SKILL.md" "$TARGET_DIR/verify-figma/SKILL.md"
cp "$SOURCE_SKILLS/verify-figma/rules.md" "$TARGET_DIR/verify-figma/rules.md"
cp "$SOURCE_SKILLS/verify-figma/config.md" "$TARGET_DIR/verify-figma/config.md"

# 3. figma-targets.example.md 복사
echo "[3/4] figma-targets.example.md 복사 중..."
if [ ! -f "$(pwd)/figma-targets.md" ]; then
  cp "$SCRIPT_DIR/figma-targets.example.md" "$(pwd)/figma-targets.example.md"
  echo "      figma-targets.example.md를 figma-targets.md로 복사 후 편집하세요."
else
  echo "      figma-targets.md가 이미 존재합니다. 건너뜁니다."
fi

# 4. Figma MCP 연결 안내
echo "[4/4] Figma MCP 연결 확인..."
if [ -f "$(pwd)/.mcp.json" ]; then
  echo "      .mcp.json이 이미 존재합니다."
else
  echo "      Figma MCP가 설정되지 않았습니다."
  echo "      아래 명령어 중 하나를 실행하세요:"
  echo ""
  echo "      # 공식 Figma Remote MCP (권장)"
  echo "      claude mcp add --transport http --scope project figma https://mcp.figma.com/mcp"
  echo ""
  echo "      # Figma Desktop MCP"
  echo "      claude mcp add --transport http --scope project figma-desktop http://127.0.0.1:3845/mcp"
fi

echo ""
echo "============================================"
echo "설치 완료"
echo "============================================"
echo ""
echo "다음 단계:"
echo "  1. .claude/skills/implement-figma/config.md 를 프로젝트에 맞게 수정"
echo "  2. .claude/skills/verify-figma/config.md 를 프로젝트에 맞게 수정"
echo "  3. figma-targets.md 작성 (또는 URL 직접 전달)"
echo "  4. Claude Code에서 /implement-figma 실행"
echo ""
echo "스킬 업데이트 시: bash $SCRIPT_DIR/update-skills.sh"
