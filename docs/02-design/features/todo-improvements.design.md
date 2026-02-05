# Phase 2: API Key (Agent) DB Persistence - Design

> Feature: todo-improvements (Phase 2)
> Created: 2026-02-05
> Status: Design
> Reference: [Plan](../../01-plan/features/todo-improvements.plan.md)

---

## 1. 현재 구조 분석 (As-Is)

### 문제점
- `quizAgents` = `Map<string, QuizAgent>` (메모리)
- 서버 재시작 시 모든 에이전트/토큰 소실
- 에이전트는 매번 재등록 + 퀴즈 재통과 필요

### 현재 데이터 흐름
```
Register → createAgent() → quizAgents.set() (메모리)
Quiz     → submitQuizAnswers() → agent.status = 'passed' (메모리)
Chat     → validateToken() → quizAgents 탐색 (메모리)
```

---

## 2. 목표 구조 (To-Be)

### 핵심 원칙
- **DB를 Primary, 메모리를 Cache로** 사용
- 서버 시작 시 DB에서 에이전트 목록 로드
- 에이전트 생성/상태변경 시 DB에 즉시 저장
- 기존 코드 변경을 최소화 (MariaDB 메시지 저장과 동일 패턴)

### 새로운 데이터 흐름
```
서버 시작  → DB에서 모든 에이전트 로드 → quizAgents Map에 캐시
Register  → createAgent() → DB 저장 + quizAgents.set()
Quiz Pass → submitQuizAnswers() → DB 업데이트 + agent.status 업데이트
Chat      → validateToken() → quizAgents에서 조회 (빠른 캐시)
```

---

## 3. DB 스키마

```sql
CREATE TABLE IF NOT EXISTS quiz_agents (
  id VARCHAR(36) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  status ENUM('idle', 'passed') DEFAULT 'idle',
  quiz_seed VARCHAR(32) NOT NULL,
  quiz_fetched_at BIGINT NULL,
  passed_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE INDEX idx_token_hash (token_hash),
  INDEX idx_status (status)
);
```

**컬럼 매핑**: `QuizAgent` 인터페이스 → DB 컬럼

| TypeScript | DB Column | 비고 |
|-----------|-----------|------|
| `id` | `id` | UUID |
| `displayName` | `display_name` | |
| `tokenHash` | `token_hash` | SHA-256 해시 (토큰 원문 저장 안 함) |
| `status` | `status` | ENUM |
| `quizSeed` | `quiz_seed` | 퀴즈 생성 시드 |
| `quizFetchedAt` | `quiz_fetched_at` | 퀴즈 가져온 시각 |
| `passedAt` | `passed_at` | 통과 시각 |
| `createdAt` | `created_at` | 등록 시각 |

---

## 4. 파일 변경 설계

### 4.1 신규 파일: `server/storage/mariadb-agent-store.ts`

MariaDB 메시지 저장소와 동일한 패턴으로 구현:

```typescript
export class MariaDBAgentStore {
  // 기존 MariaDB 커넥션 풀 재사용 (공유)

  async initialize(): Promise<void>
    // quiz_agents 테이블 생성

  async saveAgent(agent: QuizAgent): Promise<void>
    // INSERT INTO quiz_agents ...

  async updateAgentStatus(agentId: string, status: AgentStatus, passedAt: number | null): Promise<void>
    // UPDATE quiz_agents SET status=?, passed_at=? WHERE id=?

  async updateQuizFetch(agentId: string, quizSeed: string, quizFetchedAt: number): Promise<void>
    // UPDATE quiz_agents SET quiz_seed=?, quiz_fetched_at=? WHERE id=?

  async loadAllAgents(): Promise<QuizAgent[]>
    // SELECT * FROM quiz_agents

  async deleteAgent(agentId: string): Promise<void>
    // DELETE FROM quiz_agents WHERE id=?
}
```

**DB 풀 공유 전략**: `mariadb-message-store.ts`의 풀을 공유하여 중복 연결 방지.

### 4.2 수정 파일: `server/storage/mariadb-message-store.ts`

- DB 풀을 export하여 agent store에서 재사용 가능하도록 변경
- `getPool()` 함수 추가

### 4.3 수정 파일: `server/quiz-lounge.ts`

변경할 함수:

| 함수 | 변경 내용 |
|------|----------|
| `createAgent()` | DB 저장 추가 (async) |
| `validateToken()` | 변경 없음 (메모리 캐시 사용) |
| `markQuizFetched()` | DB 업데이트 추가 (async) |
| `submitQuizAnswers()` | DB 업데이트 추가 (async) |
| `deleteAgent()` | DB 삭제 추가 (async) |
| (신규) `loadAgentsFromDB()` | 서버 시작 시 DB에서 로드 |

### 4.4 수정 파일: `server/quiz-lounge-api.ts`

- `createAgent()` 호출을 `await`로 변경
- `submitQuizAnswers()` 호출을 `await`로 변경
- `markQuizFetched()` 호출을 `await`로 변경

### 4.5 수정 파일: `server/index.ts`

- 서버 시작 시 `loadAgentsFromDB()` 호출 추가

---

## 5. 구현 순서

```
1. mariadb-message-store.ts 수정 (풀 export)
2. mariadb-agent-store.ts 신규 생성
3. quiz-lounge.ts 수정 (async 함수들)
4. quiz-lounge-api.ts 수정 (await 추가)
5. index.ts 수정 (초기 로드)
6. 빌드 확인 (npm run build && npm run build:server)
```

---

## 6. 에러 처리 전략

| 시나리오 | 처리 |
|---------|------|
| DB 연결 실패 | 메모리 전용 모드로 폴백 (기존 동작 유지) |
| DB 저장 실패 (에이전트 생성) | 메모리에는 저장, DB 에러 로그 출력 |
| DB 업데이트 실패 (퀴즈 통과) | 메모리 상태는 업데이트, DB 에러 로그 출력 |
| DB 로드 실패 (서버 시작) | 빈 상태로 시작 (기존 동작) |

**원칙**: DB 오류가 서비스를 중단시키지 않음. 메모리 캐시가 항상 작동.

---

## 7. DDL 파일

`docs/db/schema.sql`에 추가:

```sql
CREATE TABLE IF NOT EXISTS quiz_agents (
  id VARCHAR(36) PRIMARY KEY,
  display_name VARCHAR(100) NOT NULL,
  token_hash VARCHAR(64) NOT NULL,
  status ENUM('idle', 'passed') DEFAULT 'idle',
  quiz_seed VARCHAR(32) NOT NULL,
  quiz_fetched_at BIGINT NULL,
  passed_at BIGINT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE INDEX idx_token_hash (token_hash),
  INDEX idx_status (status)
);
```

---

## 8. 검증 방법

1. **DB 저장 확인**: 에이전트 등록 후 `SELECT * FROM quiz_agents` 확인
2. **서버 재시작 테스트**: 에이전트 등록 → 퀴즈 통과 → 서버 재시작 → 기존 토큰으로 API 호출 → 성공
3. **폴백 확인**: DB 없이 서버 시작 → 기존 메모리 전용 동작 확인
4. **빌드 확인**: `npm run build && npm run build:server`

---

*작성일: 2026-02-05*
