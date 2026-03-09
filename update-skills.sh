#!/bin/bash
# Figma → Code 스킬 업데이트 스크립트
# SKILL.md와 rules.md만 덮어쓰기, config.md는 보존
# 대상 프로젝트에서 실행: bash /path/to/figma-to-code/update-skills.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCE_SKILLS="$SCRIPT_DIR/.claude/skills"
TARGET_DIR="$(pwd)/.claude/skills"

echo "============================================"
echo "Figma → Code 스킬 업데이트"
echo "============================================"
echo ""

# 설치 여부 확인
if [ ! -d "$TARGET_DIR/implement-figma" ] || [ ! -d "$TARGET_DIR/verify-figma" ]; then
  echo "스킬이 설치되지 않았습니다. 먼저 setup-skills.sh를 실행하세요."
  echo "  bash $SCRIPT_DIR/setup-skills.sh"
  exit 1
fi

# implement-figma 업데이트
echo "[1/2] implement-figma 업데이트 중..."
cp "$SOURCE_SKILLS/implement-figma/SKILL.md" "$TARGET_DIR/implement-figma/SKILL.md"
cp "$SOURCE_SKILLS/implement-figma/rules.md" "$TARGET_DIR/implement-figma/rules.md"
echo "      SKILL.md ✓  rules.md ✓  config.md (보존)"

# verify-figma 업데이트
echo "[2/2] verify-figma 업데이트 중..."
cp "$SOURCE_SKILLS/verify-figma/SKILL.md" "$TARGET_DIR/verify-figma/SKILL.md"
cp "$SOURCE_SKILLS/verify-figma/rules.md" "$TARGET_DIR/verify-figma/rules.md"
echo "      SKILL.md ✓  rules.md ✓  config.md (보존)"

echo ""
echo "============================================"
echo "업데이트 완료"
echo "============================================"
echo ""
echo "config.md는 변경되지 않았습니다."
echo "새로운 config 옵션이 추가된 경우 아래 파일을 참고하세요:"
echo "  $SOURCE_SKILLS/implement-figma/config.md"
echo "  $SOURCE_SKILLS/verify-figma/config.md"
