# 05 - 기술 아키텍처 (MVP)

## 📋 개요

Bug Slayer MVP Phase 1의 기술 구조입니다.
신규 플레이어 5시간 경험에 필요한 최소 기술 사양입니다.

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────┐
│   클라이언트     │
│ (웹 게임)       │
│ Next.js + Game │
└────────┬────────┘
         │ WebSocket
         │ REST API
         ▼
┌─────────────────┐
│  게임 서버      │
│ Node.js/Express│
│ WebSocket Room │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   데이터베이스   │
│ PostgreSQL      │
└─────────────────┘
```

---

## 💾 데이터베이스 스키마 (MVP)

### 1. Users 테이블
```sql
- user_id (PK)
- display_name
- selected_class
- level
- experience
- gold
- hp / max_hp
- inventory_json
- created_at
- updated_at
```

### 2. Party 테이블
```sql
- party_id (PK)
- player_ids (JSON) -- 최대 2명
- created_at
- current_chapter
- current_floor
- tech_debt (0-100)
```

### 3. Monsters 테이블
```sql
- monster_id (PK)
- chapter (1-4)
- floor (1-5)
- name
- hp
- atk
- def
- exp_reward
- gold_reward
- drop_items (JSON)
```

### 4. Items 테이블
```sql
- item_id (PK)
- item_name
- rarity (Common/Rare/Epic)
- effect
- price
- drop_source
```

---

## 🌐 API 엔드포인트 (MVP)

### 인증
- `POST /api/auth/register` - 회원가입
- `POST /api/auth/login` - 로그인
- `GET /api/auth/me` - 현재 플레이어 정보

### 게임 시작
- `POST /api/game/start` - 던전 시작
- `GET /api/game/status` - 게임 상태 조회

### 게임플레이
- `POST /api/combat/attack` - 공격
- `POST /api/combat/skill` - 스킬 사용
- `POST /api/combat/item` - 아이템 사용
- `GET /api/combat/state` - 현재 전투 상태

### 멀티플레이
- `POST /api/party/create` - 파티 생성
- `POST /api/party/join` - 파티 참여
- `GET /api/party/list` - 파티 목록

### 인벤토리
- `GET /api/inventory` - 인벤토리 조회
- `POST /api/inventory/equip` - 아이템 장착
- `POST /api/inventory/drop` - 아이템 버리기

---

## 🔌 WebSocket 이벤트 (MVP)

### 클라이언트 → 서버
```json
{
  "type": "join_party",
  "party_id": "123"
}

{
  "type": "start_combat",
  "chapter": 1,
  "floor": 1
}

{
  "type": "player_action",
  "action": "attack",
  "target": "monster_1"
}
```

### 서버 → 클라이언트
```json
{
  "type": "combat_update",
  "player_hp": 80,
  "monster_hp": 60,
  "turn": 3
}

{
  "type": "player_joined",
  "player_name": "SamplePlayer",
  "class": "frontend-mage"
}

{
  "type": "monster_defeated",
  "exp_gained": 100,
  "gold_gained": 50,
  "items": ["item_1", "item_2"]
}
```

---

## 🎮 UI 화면 구조 (MVP)

### 1. 메인 화면
- 캐릭터 선택
- 게임 시작 버튼
- 인벤토리

### 2. 던전 선택
- 4개 챕터 표시
- 각 챕터 진행률
- 난이도 표시

### 3. 전투 화면
- 플레이어 HP/MP
- 보스 HP
- 스킬 버튼 4개
- 아이템 버튼

### 4. 전투 결과
- 획득 경험치
- 획득 골드
- 드롭 아이템
- 다음 스테이지 진행

### 5. 파티 로비
- 플레이어 목록
- 파티 정보
- 준비 상태

---

## ⚡ 성능 목표 (MVP)

| 항목 | 목표 | 비고 |
|------|------|------|
| 초기 로딩 | < 3초 | 번들 최적화 필요 |
| 전투 응답 | < 200ms | WebSocket 레이턴시 |
| 동시 플레이어 | 100 | 테스트 목표 |
| 메모리 | < 50MB | 클라이언트 기준 |

---

## 🔒 보안 사항 (MVP)

✅ **필수 (Security_예방자 검토 완료)**:
- **JWT 토큰 인증** (Stateless Architecture)
  - Access Token: 15분 유효기간
  - Refresh Token: 7일 유효기간 (Redis 저장)
  - 토큰 검증: 매 요청마다 수행
- **HTTPS 통신** (모든 엔드포인트)
- **SQL Injection 방지** (Parameterized Queries)
- **CORS Policy** (동일 출처 정책 강화)
- **Input Validation** (XSS 방지)

⏸️ **출시 후**:
- Rate Limiting (DoS 방어)
- DDoS 방어 (CloudFlare 등)
- 자동 안티치트 (의심 행동 감시)

---

**상태**: 🟡 작업 예정
**목표**: 300줄, 개발 시작 가능한 수준
