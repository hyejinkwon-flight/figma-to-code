# 병렬 구현 규칙

## 매니페스트 (.figma-manifest.json)

매니페스트는 Scout(Phase 1)에서만 생성한다. Agent가 수정하거나 매니페스트에 없는 컴포넌트를 임의 생성하지 않는다.

## 매니페스트 스키마

```typescript
interface FigmaManifest {
  fileKey: string;
  generatedAt: string;
  cache: {
    basePath: string;       // "/tmp/figma-cache/{fileKey}"
    populatedAt: string;    // ISO 8601
    entries: {
      metadata: string[];       // 캐시된 nodeId 목록
      screenshots: string[];    // 캐시된 nodeId 목록
      designContext: string[];   // 캐시된 nodeId 목록
      variables: string[];      // 캐시된 nodeId 목록 (get_variable_defs)
      codeConnect: boolean;     // code-connect.json 존재 여부
      assets: string[];         // 캐시된 파일명 목록 ("nodeId.svg" 등)
    };
  };
  projectContext: {
    componentsPath: string;
    stylesPath: string;
    existingComponents: string[];
  };
  designTokens: {
    new: Array<{ name: string; value: string; source: string }>;
  };
  components: Array<{
    id: string;
    name: string;
    figmaNodeId: string;
    source: "existing" | "new";       // 코드베이스에 이미 있는가?
    scope: "shared" | "unique";       // 디자인 내 여러 노드가 참조하는가?
    existingMatch?: {                  // source: "existing"일 때만
      matchedBy: "code-connect" | "name-exact" | "name-fuzzy" | "file-scan" | "props-similarity";
      componentPath: string;
      confidence: "high" | "medium";
      action: "reuse" | "extend-variant" | "add-props" | "update-style" | "wrap" | "rewrite";
      reason?: string;                // action 선택 근거 (예: "props 3/4 일치, size variant 추가 필요")
      diff?: {                        // 매칭 후 변경사항 검출 결과
        hasChanges: boolean;
        variants?: {
          added: string[];            // Figma에 있고 코드에 없는 variant 값
          removed: string[];          // 코드에 있고 Figma에 없는 variant 값
        };
        props?: {
          added: string[];            // Figma에 있고 코드에 없는 props
          removed: string[];          // 코드에 있고 Figma에 없는 props
          typeChanged: Array<{        // 타입이 달라진 props
            name: string;
            codeType: string;
            figmaType: string;
          }>;
        };
        style?: {
          changed: Array<{            // 스타일 변경 사항
            property: string;         // 예: "borderRadius", "padding", "backgroundColor"
            codeValue: string;
            figmaValue: string;
          }>;
        };
      };
    };
    atomicLevel: "atom" | "molecule" | "organism";
    compositionPattern: "props" | "children" | "namedProps" | "arrayProps" | "booleanProps";
    subComponents?: string[];  // 하위 컴포넌트 ID 목록
    assignedAgent: number;
    referencedByNodes: string[];
    props: string[];
    outputPath: string;
  }>;
  nodes: Array<{
    nodeId: string;
    name: string;
    priority: "high" | "medium" | "low";
    sizeType: "small" | "large";
    assignedAgent: number;
    requiredComponents: string[];
    outputPath: string;
    designContext: { screenshotRef: boolean; boundaryNodes: string[] };
  }>;
  agents: Array<{
    id: number;
    assignedComponents: string[];
    assignedNodes: string[];
    totalWork: number;
  }>;
  agentCount: number;
}
```

## action 값 의미

| action | 의미 | Agent 동작 |
|--------|------|-----------|
| `reuse` | 변경 없음, 그대로 import | import만 추가 |
| `extend-variant` | 기존 variant에 새 값 추가 | 기존 파일에 variant 값 추가 |
| `add-props` | 새 props 추가 필요 | 기존 파일에 props/타입 추가 |
| `update-style` | 스타일만 변경 | 기존 파일의 Tailwind 클래스 수정 |
| `wrap` | 기존 컴포넌트를 감싸는 래퍼 | 새 래퍼 파일 생성 |
| `rewrite` | 변경이 너무 커서 새로 작성 | 기존 파일 대체 (사용자 확인 필수) |

## Agent 수 결정

```
agentCount = Math.min(Math.max(3, Math.ceil(nodeCount / 10)), 10)
```

## 할당 전략

1. **컴포넌트 할당**: shared → unique 순으로 라운드로빈 분배
2. **노드 할당**: high 우선순위 먼저 라운드로빈 분배

## Agent 격리

모든 agent는 worktree 격리 환경에서 실행한다. 자기 할당분만 파일을 생성하고, 다른 agent 할당분이나 매니페스트를 수정하지 않는다. 디자인 토큰 파일은 예외로 모든 agent가 추가 가능하다 (merge 시 중복 제거).

## 팀 기반 조정 (Team Coordination)

agent 간 상태 공유와 조정은 Claude Code의 **Team 기능**(TaskList, SendMessage)을 사용한다. 매니페스트는 초기 할당용이고, 런타임 조정은 팀 기능이 담당한다.

### 팀 구성

Scout(Phase 1) 완료 후 `TeamCreate`로 팀을 생성한다.

```
팀 이름: figma-impl-{fileKey 앞 8자}
멤버:
  - scout (team lead) — 매니페스트 생성, 태스크 할당, merge 조정
  - agent-0 ~ agent-N — 컴포넌트/노드 구현
```

### 태스크 생명주기

Scout가 매니페스트 기반으로 `TaskCreate`를 호출하여 태스크를 생성한다.

```
매니페스트 components[] → TaskCreate (컴포넌트 구현 태스크)
매니페스트 nodes[]      → TaskCreate (노드 구현 태스크)

태스크 상태 흐름:
  pending → in_progress → completed
```

| 시점 | 주체 | 액션 |
|------|------|------|
| 태스크 생성 | Scout | `TaskCreate` — subject에 컴포넌트/노드명, description에 figmaNodeId·outputPath·requiredComponents 포함 |
| 태스크 할당 | Scout | `TaskUpdate` — owner를 agent 이름으로 설정, 매니페스트 assignedAgent와 일치 |
| 작업 시작 | Agent | `TaskUpdate` — status를 `in_progress`로 변경 |
| 드릴다운 발생 | Agent | `SendMessage` — Scout에게 새 캐시 항목 알림 (nodeId + 캐시 경로) |
| 작업 완료 | Agent | `TaskUpdate` — status를 `completed`로 변경 |
| 다음 작업 탐색 | Agent | `TaskList` — 본인 소유의 pending 태스크 확인 후 다음 작업 시작 |

### 의존성 관리

shared 컴포넌트는 이를 사용하는 노드보다 먼저 완료되어야 한다. `TaskUpdate`의 `addBlockedBy`로 의존성을 설정한다.

```
예시:
  Button (shared, agent-0) ← TaskCreate
  LoginForm (node, agent-1, requiredComponents: [Button]) ← TaskCreate + addBlockedBy: [Button 태스크 ID]

agent-1은 Button 태스크가 completed 될 때까지 LoginForm 작업을 시작하지 않는다.
TaskList에서 blockedBy가 비어있는 태스크만 작업 가능.
```

### 드릴다운 캐시 조정

Agent가 구현 중 하위 노드를 추가로 MCP 호출해야 할 때:

```
1. 자기 할당 노드의 하위만 드릴다운 가능 (다른 agent 할당 노드의 하위 접근 금지)
2. 새 캐시 항목 저장 후 Scout에게 SendMessage:
   "[cache-add] agent-{id}: {nodeId} → /tmp/figma-cache/{fileKey}/{type}/{nodeId}.json"
3. Scout는 메시지를 수신하여 매니페스트 cache.entries에 기록 (선택적)
4. 같은 노드를 다른 agent가 이미 캐시했을 수 있으므로 캐시 파일 존재 여부를 먼저 확인
```

### Agent 간 메시지 프로토콜

| 메시지 유형 | 발신 | 수신 | 내용 |
|------------|------|------|------|
| `[cache-add]` | Agent | Scout | 드릴다운으로 새 캐시 항목 추가됨 |
| `[blocked]` | Agent | Scout | 의존 컴포넌트 미완성으로 작업 불가 |
| `[component-ready]` | Agent | Scout | shared 컴포넌트 구현 완료, 의존 태스크 unblock 가능 |
| `[need-context]` | Agent | Scout | 매니페스트에 없는 노드의 디자인 컨텍스트 필요 |
| `[merge-ready]` | Agent | Scout | 할당된 모든 태스크 완료, merge 대기 |

Scout는 `[component-ready]` 수신 시 해당 컴포넌트에 의존하는 태스크의 `blockedBy`를 해제한다.

### 팀 종료

모든 태스크가 completed이면:
1. Scout가 각 agent에게 `shutdown_request` 전송
2. Agent는 `shutdown_response`로 승인
3. Merge 진행 후 `TeamDelete`로 정리

## Merge

자동 merge 금지 — 반드시 사용자 확인 후 진행한다.
- merge 순서: agent 0 → 1 → ... → N (순차)
- 디자인 토큰 충돌: 양쪽 토큰 모두 유지 (union merge)
- 컴포넌트 파일 충돌: 할당 규칙상 발생 불가 → 발생 시 사용자 알림
- merge 후 모든 import가 실제 파일을 가리키는지 검증
