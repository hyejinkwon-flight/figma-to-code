# 컴포넌트 분해 / 합성 규칙

Figma 디자인을 React 코드로 변환할 때, **하나의 거대한 컴포넌트가 아닌 적절한 단위로 분해**하여 구현한다.

## 계층 모델: Atomic 3레벨

| 레벨 | 정의 | 예시 | Figma 대응 |
|------|------|------|-----------|
| **Atoms** | 더 이상 쪼갤 수 없는 최소 UI 단위 | `Button`, `Input`, `Icon`, `Badge` | Base Components |
| **Molecules** | Atom 2개 이상의 기능 조합 | `SearchBar`, `FormField`, `LabeledInput` | Composite Components |
| **Organisms** | 독립적 UI 섹션 | `Header`, `ProductCard`, `LoginForm` | Section Components |

> 라벨(atoms/molecules)은 멘탈 모델이지 엄격한 규칙이 아니다. 분류 논쟁에 시간을 쓰지 않는다.

## 재사용 범위에 따른 배치

컴포넌트는 **가장 좁은 범위(Local)에서 시작**하고, 재사용 필요가 확인되면 승격시킨다.

| 계층 | 설명 | 배치 위치 |
|------|------|----------|
| **Core** | 프로젝트 전체 범용. 비즈니스 로직 없음 | `shared/ui/atoms/` 또는 `shared/ui/molecules/` |
| **Domain** | 특정 도메인 내 공유 | `features/{domain}/components/` |
| **Local** | 특정 화면에서만 사용. 재사용 의도 없음 | 해당 페이지/기능 폴더 내 |

## 분리 판단 기준

### 체크리스트 (YES 2개 이상이면 분리 검토)

1. 컴포넌트 설명에 "그리고(and)"가 들어가는가? (**SRP**: 단일 책임 위반)
2. Props가 6개를 초과하는가?
3. 관련 없는 state가 3개 이상 공존하는가?
4. 같은 UI/로직이 3곳 이상에서 반복되는가? (**Rule of Three / AHA**: 3번째 반복에서 추출)
5. 디자인 변경과 로직 변경이 다른 시점에 발생하는가? (변경 빈도 분리)
6. 특정 부분만 격리 테스트하기 어려운가?
7. 컴포넌트가 200줄을 크게 초과하는가?
8. JSX 중첩이 4단 이상인가?

### 추가 시그널 (해당 시 분리 강화)

- **성능**: 불필요한 리렌더링이 발생하는 영역이 분리 가능
- **협업**: 같은 파일을 여러 사람이 동시 수정
- **서드파티**: 외부 라이브러리 연동 로직이 UI와 혼재
- **명령형 API**: useRef + imperative handle이 필요한 영역

### 경험적 수치

| 항목 | 경고 수준 | 분리 강력 권장 | 액션 |
|------|----------|-------------|------|
| Props 개수 | 5~6개 | 7개 이상 | 컴포넌트 분리 또는 Named Props 구조 전환 |
| 파일 라인 수 | 200줄 | 300줄 이상 | 하위 컴포넌트 / 커스텀 훅 추출 |
| JSX 깊이 | 3단 중첩 | 4단 이상 | 하위 컴포넌트 추출 |
| useState 개수 | 3~4개 | 5개 이상 | useReducer 또는 커스텀 훅 |
| useEffect 개수 | 2개 | 3개 이상 | 각 effect를 커스텀 훅으로 분리 |

> 절대 기준이 아닌 경험적 참고치. 컨텍스트에 따라 유연하게 적용.

### ⛔ 분리하지 말아야 할 때 (YES 1개라도 있으면 보류)

- 분리 후 props 수가 오히려 증가하는가?
- 추출한 컴포넌트의 이름을 짓기 어려운가?
- 1~2곳에서만 사용되고 사용 맥락이 다른가?
- 분리 후 코드 흐름 추적이 더 어려워지는가?
- 자식이 부모 없이는 의미가 없는가? (1:1 종속)
- "나중에 쓸지도 몰라"는 추측에 기반한 분리인가?

## Figma 시그널 → React 합성 방식 매핑

| Figma 시그널 | React 합성 방식 | 판단 근거 |
|-------------|----------------|----------|
| Variants가 있는 컴포넌트 | **Props** | Enum/Boolean → union type / boolean prop |
| Instance Swap 1개 | **children** | 교체 가능한 단일 영역 |
| Instance Swap 2개 이상 | **Named Props** | 각 영역을 별도 prop으로 전달 |
| 동일 구조 자식 반복 | **배열 Props** | `items.map()`으로 렌더링 |
| Boolean Property (show/hide) | **boolean Props** | `showIcon?: boolean` |
| 레이어 이름에 `/`가 있음 | **Named Props** 조합 | `Card/Header` → header prop |
| 고정 영역 + 가변 영역 | **Named Props + children** | header, footer는 Named Props, 본문은 children |

## 합성 방식 5가지

| 방식 | 사용 시점 | 예시 |
|------|----------|------|
| **Props** | Variant, 크기, 상태 등 값 전달 | `<Button variant="primary" size="md">` |
| **children** | 내부 콘텐츠 영역 1개 | `<Card>{children}</Card>` |
| **Named Props** | 내부 콘텐츠 영역 2개 이상 | `<Card header={..} footer={..}>{children}</Card>` |
| **배열 Props** | 동일 구조 반복 | `<List items={[...]} />` |
| **boolean Props** | 요소 표시/숨김 제어 | `<Input showIcon hasCloseButton />` |

## Props Drilling 방지

| Props 전달 깊이 | 권장 방식 |
|----------------|----------|
| 1단계 (부모→자식) | Props 직접 전달 |
| 2단계 (부모→손자) | children으로 중간 레이어 제거 |
| 3단계 이상 | Zustand 또는 Context |

## 분리 방법 우선순위

| 우선순위 | 방법 | 사용 시점 |
|---------|------|----------|
| 1 | **Custom Hook 추출** | 로직만 분리 (가장 가벼움) |
| 2 | **하위 컴포넌트 추출** | UI 일부를 별도 컴포넌트로 분리 |
| 3 | **Named Props 구조** | 여러 영역을 유연하게 조합할 때 |
| 4 | **Context / Zustand** | 깊은 트리에서 상태 공유 필요 시 |

### Custom Hook 추출 기준

**추출해야 할 때:**
- 동일 로직이 2개 이상 컴포넌트에서 사용
- 복잡한 로직을 단순 인터페이스 뒤에 숨길 수 있음
- useEffect를 hook으로 감싸면 더 명확

**추출하지 않아야 할 때:**
- useState 하나를 감싸는 수준
- 명확한 이름을 짓기 어려움 → 아직 시기 아님

## 컴포넌트 분해 의사결정 플로우

```
Figma 컴포넌트를 코드로 변환할 때:

1) 이 UI가 다른 곳에서도 쓰이는가?
   ├─ 3곳 이상 → shared 컴포넌트 (atoms/molecules/organisms)
   ├─ 같은 도메인 내 → domain 컴포넌트
   └─ 1곳만 → 해당 페이지/기능 폴더에 local 컴포넌트

1.5) 하위 요소들이 상태를 공유하는가?
   ├─ YES → 하나의 컴포넌트로 유지 (내부에서 state 관리)
   │   └─ 상태 로직이 복잡하면 → Custom Hook으로 추출
   └─ NO  → 각 하위 요소를 독립 컴포넌트로 분리 가능

2) Figma에서 Variants가 있는가?
   ├─ YES → Props union type으로 매핑
   └─ NO  → 단일 컴포넌트

3) Instance Swap / 빈 영역(Slot)이 있는가?
   ├─ 1개 → children
   ├─ 2개 이상 → Named Props (header, content, footer)
   └─ 없음 → 고정 레이아웃

4) Props가 6개를 초과하는가?
   ├─ YES → Named Props 구조로 리팩토링 또는 하위 컴포넌트 분리
   └─ NO  → 현재 구조 유지

5) 비즈니스 로직이 섞여 있는가?
   ├─ YES → Custom Hook으로 로직 추출
   └─ NO  → 순수 UI 컴포넌트 유지
```

## Figma → React 매핑

### 네이밍

| Figma (슬래시 구분) | React (PascalCase) | 파일명 |
|--------------------|-------------------|--------|
| `Button/Primary` | `<Button variant="primary">` | `Button.tsx` |
| `Card/Product/Horizontal` | `<ProductCard layout="horizontal">` | `ProductCard.tsx` |
| `Icon/Arrow/Right` | `<ArrowRightIcon />` | `ArrowRightIcon.tsx` |

### Variant → Props 매핑

| Figma 속성 | React 매핑 |
|-----------|-----------|
| Boolean Variant (Yes/No) | `boolean` prop |
| Enum Variant (Primary/Secondary) | `string` union type |
| Text Property | `string` prop |
| Instance Swap | `ReactNode` prop |

### 용어 사전

| Figma 용어 | 코드 용어 |
|-----------|----------|
| Size: S / M / L | `size: 'sm' \| 'md' \| 'lg'` |
| Type: Primary / Secondary | `variant: 'primary' \| 'secondary'` |
| State: Default / Hover / Disabled | 이벤트 핸들러 + `disabled` prop |

### 요소 매핑 치트시트

| Figma 요소 | React/HTML | 비고 |
|-----------|-----------|------|
| Frame (Auto Layout) | `<div>` + flex/grid | layoutMode로 방향 결정 |
| Frame (절대 배치) | `<div>` + absolute | constraints → position |
| Component | React Component | PascalCase 파일 |
| Component Set (Variants) | 단일 컴포넌트 + Props union | variant/size/state → props |
| Instance | 컴포넌트 사용 (`<Button />`) | 오버라이드 → props |
| Instance Swap | `ReactNode` prop / children | Slot 패턴 |
| Text | `<span>` / `<p>` / `<h1>`~`<h6>` | 의미에 따라 태그 선택 |
| Vector / Boolean Op | SVG 파일 import | Figma export → `<img>` |
| Rectangle | `<div>` | fills/strokes → bg/border |
| Ellipse | `<div>` + `rounded-full` | |
| Image fill | `<img>` / `background-image` | scaleMode → object-fit |
| Group | 래퍼 불필요 (흡수) | 스타일 없으면 DOM에 추가하지 않음 |
| Section | 시맨틱 `<section>` | |
| Boolean Property | `boolean` prop | `showIcon?: boolean` |
| Text Property | `string` prop | 동적 텍스트 |
