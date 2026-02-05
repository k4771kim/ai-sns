# 🛠️ 개발자 가이드 (MVP Phase 1)

> **대상**: Backend, Frontend, Content 개발자
> **목적**: 각 분야별 상세한 구현 가이드

---

## 📋 목차

1. [Backend 개발자](#1-backend-개발자)
2. [Frontend 개발자](#2-frontend-개발자)
3. [Content 개발자](#3-content-개발자)
4. [QA 팀](#4-qa-팀)
5. [공통 주의사항](#5-공통-주의사항)

---

## 1. Backend 개발자

### 🎯 역할

- REST API 20개 엔드포인트 구현
- WebSocket 멀티플레이 동기화
- 데이터베이스 스키마 구현
- 게임 로직 (전투, 경험치, 보상)
- 인증 & 보안

### 📚 참고 문서

```
1. architecture.md
   └─ 시스템 다이어그램, API 목록, DB 스키마

2. multiplayer-protocol.md
   └─ WebSocket 메시지 형식, 동시 행동 처리, 에러 처리

3. BUG_SLAYER_GDD.md
   └─ 게임 규칙, Tech Debt 시스템, 경험치 곡선
```

### 🔧 구현 순서 (Priority)

**Week 1: 기본 API**
```
1. 인증 (POST /auth/register, POST /auth/login)
2. 사용자 정보 (GET /auth/me, PUT /user/profile)
3. 게임 시작 (POST /game/start)
4. 게임 상태 (GET /game/status)
```

**Week 2: 전투 API**
```
1. 전투 액션 (POST /combat/action) - REST 버전 먼저
2. 전투 상태 (GET /combat/state)
3. 결과 저장 (POST /combat/complete)
```

**Week 2-3: WebSocket 멀티플레이**
```
1. WebSocket 연결 (ws:// 핸드셰이크)
2. 파티 매칭 (POST /party/match)
3. 파티 로비 (GET /party/:id)
4. 멀티플레이 전투 동기화
```

**Week 3: 데이터 관리**
```
1. 인벤토리 (GET /inventory, POST /inventory/equip)
2. 저장 & 로드 (자동 저장)
3. 도감 (GET /data/bugs, GET /data/items)
```

### ⚠️ 주의사항

```
⚠️ Tech Debt 시스템
├─ 매 턴 +1 자동 증가 (서버 계산)
├─ 클라이언트가 조작할 수 없음
└─ 최종 보스 난이도에 영향

⚠️ 멀티플레이 타이밍
├─ 10초 타이머는 서버가 관리
├─ 클라이언트 시간으로 검증 (오차 ±2초)
└─ 타임 스탭 기반 공정성 보장

⚠️ 데이터 검증
├─ 스킬 MP 비용 검증 필수 (클라이언트가 거짓일 수 있음)
├─ HP 범위 검증 (0 ~ maxHP)
└─ 불가능한 액션 필터링 (없는 적 공격 방지)
```

### 🔐 보안 체크리스트

```
✅ JWT 토큰
├─ Access: 15분 유효
├─ Refresh: 7일 유효 (Redis)
└─ 타임스탭 검증

✅ SQL Injection 방지
├─ Parameterized Queries 사용
└─ ORM 사용 권장 (TypeORM, Prisma)

✅ API Rate Limiting
├─ 유저당 분당 60요청
├─ 같은 IP 분당 1000요청
└─ 의심 행동 탐지

✅ 입력 검증
├─ 스킬 ID 검증 (존재하는 스킬만)
├─ 타겟 검증 (적이 살아있나?)
└─ MP 검증 (충분한가?)
```

---

## 2. Frontend 개발자

### 🎯 역할

- 5개 핵심 화면 구현
- UI 컴포넌트 개발
- 상태 관리
- 실시간 동기화
- 게임 루프

### 📚 참고 문서

```
1. ui-mockups.md
   └─ 5개 화면 상세 레이아웃, 색상, 폰트

2. BUG_SLAYER_GDD.md
   └─ 게임 흐름, 턴 기반 시스템

3. multiplayer-protocol.md
   └─ WebSocket 메시지 처리
```

### 🔧 구현 순서 (Priority)

**Week 1: 로그인 & 캐릭터 선택**
```
1. 로그인 화면 (UI/UX)
2. 캐릭터 선택 화면
3. 클래스 정보 팝업
4. 인증 연동 (Backend API)
```

**Week 1-2: 메인 로비**
```
1. 플레이어 프로필 표시
2. 던전 선택 화면
3. 게임 시작 버튼
4. 버튼 → Backend 호출 연동
```

**Week 2: 전투 화면 (핵심)**
```
1. 적 정보 표시 (HP 바)
2. 파티 정보 표시 (HP, MP)
3. 스킬 선택 UI (8개 버튼)
4. 타이머 (10초 카운트다운)
5. 결과 화면
```

**Week 2-3: 멀티플레이**
```
1. 파티 매칭 UI
2. 파티 로비
3. WebSocket 연결
4. 실시간 동기화 (상대방 행동 표시)
```

**Week 3: 인벤토리 & 화면**
```
1. 인벤토리 UI
2. 도감
3. 설정 화면
```

### ⚠️ 주의사항

```
⚠️ 상태 관리
├─ Redux / Zustand / Context API 선택
└─ 게임 상태 (플레이어, 적, 턴 정보)는 반드시 서버와 동기화

⚠️ WebSocket 실시간 업데이트
├─ 메시지 수신 시 즉시 UI 업데이트
├─ 네트워크 지연 대비 (낙관적 업데이트 고려)
└─ 연결 끊김 시 자동 재연결

⚠️ 턴 타이머
├─ 서버 시간 기준 (클라이언트는 표시만)
├─ 10초 카운트다운 정확성 필요
└─ 시간 초과 시 자동 "방어" 선택

⚠️ 모바일 반응형
├─ 모든 화면이 터치 친화적
├─ 버튼 크기 최소 48px × 48px
└─ 화면 회전 지원 권장
```

### 🎨 디자인 가이드

```
색상:
├─ Primary: #4A90E2 (파란색)
├─ Accent: #00D4FF (밝은 파란색)
├─ Success: #4ECB71 (초록색)
├─ Warning: #FFB800 (주황색)
└─ Error: #FF4757 (빨강색)

폰트:
├─ 헤더: Space Grotesk (Google Fonts)
├─ 본문: Inter (Google Fonts)
└─ 모노스페이스: JetBrains Mono

아이콘:
└─ Feather Icons 또는 Material Icons 권장
```

---

## 3. Content 개발자

### 🎯 역할

- 게임 데이터 입력 (버그, 스킬, 아이템)
- 밸런싱 테스트
- 스토리/나레이션
- 사운드 기획 (선택사항)

### 📚 참고 문서

```
1. bosses-detailed.md
   └─ 20개 버그 상세 정보

2. skills-detail.md
   └─ 64개 스킬 (MP, 쿨타임, 효과)

3. items-loot.md
   └─ 아이템 & 드롭 테이블

4. class-balancing.md
   └─ 스탯 밸런싱 원칙
```

### 🔧 구현 순서 (Priority)

**Week 1-2: 버그 데이터**
```
JSON 포맷으로 변환:
{
  "id": "bug_001",
  "name": "NullPointer Exception",
  "chapter": 1,
  "hp": 30,
  "attacks": [...],
  "experience": 50,
  "gold": 25,
  "loot": [...]
}
```

**Week 2: 스킬 데이터**
```
{
  "id": "console_log",
  "name": "console.log 디버그",
  "class": "frontend_mage",
  "mp_cost": 5,
  "cooldown": 0,
  "effect": "weakened"
}
```

**Week 2: 아이템 데이터**
```
{
  "id": "item_001",
  "name": "초보자 검",
  "rarity": "common",
  "effect": "ATK +1",
  "price": 10
}
```

**Week 3: 테스트 & 조정**
```
1. 경험치 곡선 검증
2. 드롭율 테스트
3. 난이도 밸런싱
```

### 🎮 밸런싱 원칙

```
검증 체크리스트:

✅ 경험치 곡선
├─ Chapter 1 총합: 550 XP
├─ Chapter 2 총합: 825 XP (1.5배)
├─ Chapter 3 총합: 1320 XP (2배)
└─ Chapter 4 총합: 1870 XP (2.5배)

✅ 드롭율
├─ Common: 40-50%
├─ Rare: 10-20%
└─ Epic: 2-5%

✅ 난이도 곡선
├─ Chapter 1 HP: 25-100
├─ Chapter 2 HP: 60-150
├─ Chapter 3 HP: 85-200
└─ Chapter 4 HP: 110-350

✅ 스킬 밸런싱
├─ 모든 클래스: 총 28 포인트
├─ MP 비용: 5-25 범위
├─ 쿨타임: 0-5 턴 범위
└─ 효과: 명확하고 공정함
```

---

## 4. QA 팀

### 🎯 역할

- 기능 테스트
- 밸런싱 검증
- 멀티플레이 동기화 테스트
- 버그 리포팅

### 📋 테스트 체크리스트

**Week 3-4: 기능 테스트**
```
인증:
- [ ] 회원가입 성공
- [ ] 로그인 성공
- [ ] JWT 토큰 유효
- [ ] 로그아웃 성공

게임:
- [ ] 게임 시작 가능
- [ ] 턴 시스템 작동
- [ ] 스킬 실행 가능
- [ ] HP 감소 정확함
- [ ] 레벨업 작동
- [ ] 인벤토리 저장

멀티플레이:
- [ ] 파티 매칭 작동
- [ ] WebSocket 연결
- [ ] 턴 동기화 정확
- [ ] 시너지 보너스 적용
- [ ] 파티원 상태 동기화
```

**Week 4: 밸런싱 테스트**
```
경험치:
- [ ] 5시간 플레이 후 레벨 확인
- [ ] 엔딩별 경험치 차이 검증

난이도:
- [ ] 각 Chapter 난이도 적절
- [ ] Tech Debt 영향 확인
- [ ] 엔딩 분기 작동

협력 멀티플레이:
- [ ] 시너지 보너스 정확
- [ ] 스킬 조합 밸런스
```

---

## 5. 공통 주의사항

### 🚨 우선순위

```
🔴 높음 (필수)
├─ 인증 & 보안
├─ 전투 로직 (정확성)
├─ WebSocket 동기화
└─ 데이터 저장/로드

🟡 중간 (중요)
├─ UI/UX 완성도
├─ 밸런싱 미세 조정
├─ 에러 처리
└─ 로깅

🟢 낮음 (선택)
├─ 사운드/음악
├─ 특수 효과
├─ 고급 UI 애니메이션
└─ Phase 2 기능
```

### 📞 소통

```
주간 회의: 매주 월요일 (10:00)
└─ 진행 상황 공유, 문제점 해결

긴급 이슈: Slack #bug-slayer-dev
└─ 즉시 대응 필요

코드 리뷰: Pull Request
└─ 최소 2명 승인 필수
```

### 🔄 Git 워크플로우

```
메인 브랜치: main (안정화 버전)
개발 브랜치: develop
기능 브랜치: feature/<feature-name>

예시:
├─ feature/auth-system
├─ feature/combat-logic
├─ feature/multiplayer-sync
└─ feature/ui-screens
```

### 🐛 버그 리포팅

```
제목: [Component] Brief description
예: [Combat] Skill damage calculation incorrect

본문:
1. 재현 단계
2. 예상 결과
3. 실제 결과
4. 스크린샷/로그
```

---

**상태**: 🟢 개발자 가이드 완성
**마지막 업데이트**: 2026-02-05
