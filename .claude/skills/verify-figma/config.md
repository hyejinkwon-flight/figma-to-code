# 프로젝트 검증 설정

이 파일은 프로젝트별 검증 커스터마이징 파일입니다.
update-skills.sh 실행 시에도 이 파일은 보존됩니다.
rules.md와 충돌하는 설정이 있으면 이 파일이 우선합니다.

## 허용 오차

- spacing: ±1px
- size: ±2px
- color: 정확 일치
- font-size: 정확 일치
- border-radius: 정확 일치

## 검증 제외 항목

<!-- 검증에서 제외할 항목을 나열하세요 -->
<!-- 예시:
- 반응형 레이아웃 (모바일 뷰 제외)
- 애니메이션/트랜지션
- hover/active 상태
-->

## 렌더링 환경

- storybook_url: http://localhost:6006
- vite_dev_url: http://localhost:5173
- default_viewport: 390x844

## 스크린샷 설정

- screenshot_dir: /tmp/figma-verify
- pixel_diff_threshold: 0.1
- pixel_diff_pass_percentage: 5

## 필수 MCP 서버

- Figma MCP: get_screenshot, get_design_context
- Playwright MCP: @playwright/mcp (headless 모드)
- figma-to-code MCP: verify_pixel_diff, verify_elements, verify_assets, calculate_coverage, cleanup_verification

## 빌드/린트 명령어

<!-- 프로젝트의 검증 명령어를 지정하세요 -->
- lint: (예시) npm run lint
- typecheck: (예시) npx tsc --noEmit
- build: (예시) npm run build

## 커스텀 검증 규칙

<!-- rules.md를 오버라이드할 프로젝트별 검증 규칙을 여기에 작성하세요 -->
