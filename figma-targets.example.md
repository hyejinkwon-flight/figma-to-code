# Figma 구현 대상 목록

> 이 파일을 대상 프로젝트 루트에 `figma-targets.md`로 복사하여 사용합니다.
> `/implement-figma` 스킬이 이 파일을 읽어 구현 대상 노드를 결정합니다.
> **전체 레이어 탐색 없이, 이 파일에 명시된 노드만 구현 대상이 됩니다.**

## Figma 파일 정보

- **URL**: https://www.figma.com/design/{FILE_KEY}/{FILE_NAME}
- **File Key**: {FILE_KEY}

## 구현 대상 노드

> Figma에서 구현할 노드를 직접 지정합니다.
> Node ID는 Figma URL의 `?node-id=` 파라미터에서 확인할 수 있습니다 (`-`는 `:`로 변환).
> 우선순위(high → medium → low) 순서로 구현이 진행됩니다.

| 순서 | Node ID | 이름 | 설명 | 우선순위 |
|------|---------|------|------|----------|
| 1 | 1:2 | 메인 페이지 | 항공 메인 화면 전체 | high |
| 2 | 3577:49688 | 검색 폼 | 항공권 검색 영역 | high |
| 3 | 3336:27168 | 최저가 리스트 | 최저가 항공권 카드 목록 | medium |

## 참고사항

- 기존 컴포넌트 재사용: src/components/ui/ 하위 확인
- 디자인 토큰: src/styles/globals.css @theme 섹션 참조
- 특이사항: (프로젝트별 메모)
