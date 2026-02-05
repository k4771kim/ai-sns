# 🐛 20개 버그 상세 정의 (MVP Edition)

> **목표**: 각 버그 보스의 상세 정보, 약점, 전략 명시

---

## 📋 구조

```json
{
  "id": "bug_001",
  "name": "NullPointer Exception",
  "chapter": 1,
  "floor": 1,
  "story": "...",
  "hp": 30,
  "attacks": [...],
  "weaknesses": [...],
  "experience": 50,
  "gold": 25,
  "loot": [...],
  "strategy": "..."
}
```

---

## 🏆 Chapter 1: 기초 개념 (경험치 기본율)

### 🐛 Bug #1: NullPointer Exception

```
📍 위치: Chapter 1 - Floor 1 (튜토리얼)
👾 난이도: ★☆☆ (가장 쉬움)
💚 HP: 30
```

**스토리:**
> "코드를 실행하면... 갑자기 오류 메시지가 떴어요!"
> NullPointerException은 null 값을 역참조하려고 할 때 발생합니다.
> "이 오류, 어떻게 해결할까요?"

**약점:**
- Type checking (타입 체크 후 진행)
- Optional 사용
- 방어 기법

**공격:**
1. Null Reference (15 데미지) - 기본 공격
2. Pointer Dereference (20 데미지) - 강한 공격
3. Segfault (25 데미지) - 드문 강공

**전투 전략:**
- 신규 플레이어를 위한 튜토리얼 레벨
- "console.log 디버그" 스킬로 약점 표시 권장
- 난이도: 3턴 내에 해결 가능

**보상:**
- 경험치: 50 XP
- 골드: 25 💰
- 드롭: Common 검 (40%), HP 물약 (30%)

---

### 🐛 Bug #2: Syntax Error: Unexpected token

```
📍 위치: Chapter 1 - Floor 1
👾 난이도: ★☆☆
💚 HP: 25
```

**스토리:**
> "코드를 작성하다가 괄호를 잘못 닫았나?"
> 이 버그는 명백한 문법 오류입니다. 코드 파서가 인식할 수 없는 토큰을 만났어요.

**약점:**
- 정확한 코드 구조 이해
- AST (Abstract Syntax Tree) 분석

**공격:**
1. Parse Error (12 데미지)
2. Token Mismatch (18 데미지)
3. Compilation Fail (22 데미지)

**전투 전략:**
- 문법 오류는 명백하므로 높은 정확도 필요
- "CSS 리셋"으로 자신의 공격력 강화 추천
- 빠른 격파 가능

**보상:**
- 경험치: 40 XP
- 골드: 20 💰
- 드롭: Bug Fix 스크롤 (35%), Common 갑옷 (35%)

---

### 🐛 Bug #3: TypeError: Cannot read property

```
📍 위치: Chapter 1 - Floor 2
👾 난이도: ★☆☆
💚 HP: 35
```

**스토리:**
> "undefined가 뭐지? 프로퍼티를 읽으려고 했는데..."
> 잘못된 타입의 객체에서 프로퍼티를 읽으려고 하면 이 오류가 발생합니다.

**약점:**
- 타입 검증
- Type Guard 사용
- Runtime Type Checking

**공격:**
1. Type Mismatch (16 데미지)
2. Property Access (19 데미지)
3. Undefined Behavior (24 데미지)

**전투 전략:**
- 방어도 중요함 (DEF 강화 스킬)
- "React Hooks" 스킬로 버프 유지

**보상:**
- 경험치: 60 XP
- 골드: 30 💰
- 드롭: Common 반지 (40%), MP 물약 (30%)

---

### 🐛 Bug #4: IndexOutOfBoundsException

```
📍 위치: Chapter 1 - Floor 3
👾 난이도: ★☆☆
💚 HP: 40
```

**스토리:**
> "배열의 크기가 몇 개라고 생각했는데... 그보다 큰 인덱스에 접근했어요."
> 배열 경계를 넘어서는 접근은 메모리 침범입니다.

**약점:**
- 배열 크기 검증
- Boundary Checking
- Safe Array Access

**공격:**
1. Boundary Violation (18 데미지)
2. Memory Violation (21 데미지)
3. Corruption (26 데미지)

**전투 전략:**
- 멀티플레이 추천 (파티원이 도와줄 수 있음)
- "DOM 조작"으로 기절시키기 가능

**보상:**
- 경험치: 70 XP
- 골드: 40 💰
- 드롭: Common 목걸이 (75%), 생명의 목걸이 (25%)

---

### 🐛 Bug #5: Infinite Loop

```
📍 위치: Chapter 1 - Floor 4
👾 난이도: ★☆☆
💚 HP: 50
```

**스토리:**
> "while(true) { ... } 루프가 끝나지 않아요!"
> 루프 조건이 항상 true이므로, 프로그램이 영원히 돌아갑니다.

**약점:**
- 루프 조건 검증
- Break Condition 확인
- Loop Control

**공격:**
1. Infinite Cycle (20 데미지) - 계속 반복
2. CPU Spin (23 데미지) - 부하
3. System Hang (28 데미지) - 매우 위험

**전투 전략:**
- 지속 데미지 스킬 사용 추천
- "Promise 연쇄"로 계속 공격

**보상:**
- 경험치: 100 XP
- 골드: 50 💰
- 드롭: Common 검 (30%), 공격력 스크롤 (35%)

---

### 🏆 Chapter 1 보스: Syntax Monster

```
📍 위치: Chapter 1 - Boss Room
👾 난이도: ★★☆
💚 HP: 100
```

**스토리:**
> "모든 문법 오류들이 하나로 합쳐졌어요!"
> Chapter 1의 모든 버그들이 합쳐진 거대한 괴물입니다.

**공격 패턴:**
1. Turn 1-3: 기본 공격 (25 데미지)
2. Turn 4: 다중 공격 (15 × 3 데미지)
3. Turn 6+: 약점 + 저주 (상태이상 유발)

**약점:**
- 포괄적 이해 필요
- 다양한 방어기법

**전투 전략:**
- 멀티플레이 권장 (협력 시너지 활용)
- 파티 보조 스킬 중요

**보상:**
- 경험치: 200 XP ⭐
- 골드: 75 💰
- 드롭: Rare 검 (100%), Epic 검 (15% 희귀)

---

## 🎯 Chapter 2: 성능 & 메모리 (1.5배 경험치 배율)

### 🐛 Bug #6: Memory Leak

```
📍 위치: Chapter 2 - Floor 1
👾 난이도: ★★☆
💚 HP: 60
```

**스토리:**
> "메모리를 할당하고도 해제하지 않았어요... 점점 메모리가 가득 차고 있어요!"
> 메모리 누수는 서서히 시스템을 죽입니다.

**약점:**
- Garbage Collection 이해
- Memory Management
- Reference Counting

**공격:**
1. Memory Pressure (22 데미지) - 지속 증가
2. OOM Killer (28 데미지) - 치명적
3. System Crash (35 데미지) - 드묾

**특성:**
- 지속 데미지 타입 (매 턴 누적)
- 시간이 길어질수록 강해짐

**보상:**
- 경험치: 225 XP
- 골드: 100 💰
- 드롭: Rare 갑옷 (50%), HP 물약 (30%)

---

### 🐛 Bug #7: O(n²) Loop

```
📍 위치: Chapter 2 - Floor 2
👾 난이도: ★★☆
💚 HP: 70
```

**스토리:**
> "이중 루프 안에서 또 다른 중첩이... 알고리즘의 복잡도가 엄청나요!"
> 입력 크기가 커질수록 기하급수적으로 느려집니다.

**약점:**
- 알고리즘 최적화
- Big O 이해
- 시간복잡도 개선

**공격:**
1. Quadratic Time (24 데미지)
2. Exponential Growth (30 데미지)
3. Timeout (38 데미지) - 매우 강함

**전략:**
- 빠른 처리 필요 (속도 스킬 중요)
- 오래 끌리면 불리

**보상:**
- 경험치: 270 XP
- 골드: 120 💰
- 드롭: Rare 검 (40%), 공격력 스크롤 (40%)

---

### 🐛 Bug #8: Cache Miss

```
📍 위치: Chapter 2 - Floor 3
👾 난이도: ★★☆
💚 HP: 65
```

**스토리:**
> "계속 데이터베이스를 다시 조회하고 있어요... 캐싱이 안 되고 있나?"
> 캐시를 활용하지 않아 반복적인 조회가 발생합니다.

**약점:**
- 캐싱 전략
- Memoization
- Storage Optimization

**공격:**
1. Redundant Query (20 데미지)
2. DB Overload (26 데미지)
3. Connection Timeout (32 데미지)

**특성:**
- 지연 누적 공격
- 지속 데미지

**보상:**
- 경험치: 255 XP
- 골드: 110 💰
- 드롭: Rare 보주 (50%), 깨달음의 보주 (50%)

---

### 🐛 Bug #9: Stack Overflow

```
📍 위치: Chapter 2 - Floor 4
👾 난이도: ★★☆
💚 HP: 75
```

**스토리:**
> "재귀 함수의 종료 조건을 빼먹었나... 스택이 가득 차고 있어요!"
> 무한 재귀는 스택 메모리를 고갈시킵니다.

**약점:**
- 재귀 제한
- 기본 조건 (Base Case)
- 꼬리 재귀 최적화

**공격:**
1. Stack Pressure (23 데미지)
2. Frame Overflow (29 데미지)
3. Corruption (36 데미지)

**특성:**
- 매 공격마다 강해짐 (누적)
- 다중 공격 가능

**보상:**
- 경험치: 300 XP
- 골드: 135 💰
- 드롭: Rare 부츠 (40%), 속도 스크롤 (40%)

---

### 🐛 Bug #10: Connection Pool Exhausted

```
📍 위치: Chapter 2 - Floor 5
👾 난이도: ★★☆
💚 HP: 80
```

**스토리:**
> "데이터베이스 커넥션이 다 떨어졌어요... 새로운 요청을 받을 수 없어요!"
> 리소스 관리의 실패입니다.

**약점:**
- 커넥션 풀 관리
- 리소스 재사용
- Connection Pooling

**공격:**
1. Connection Rejection (21 데미지)
2. Deadlock (27 데미지)
3. Service Unavailable (34 데미지)

**특성:**
- 여러 공격을 동시에 가능
- 협력 게임에서 강함

**보상:**
- 경험치: 330 XP
- 골드: 150 💰
- 드롭: Rare 반지 (35%), Bug Fix 스크롤 (50%)

---

### 🏆 Chapter 2 보스: Performance Demon

```
📍 위치: Chapter 2 - Boss Room
👾 난이도: ★★☆
💚 HP: 150
```

**스토리:**
> "모든 성능 문제가 하나의 악마로 나타났어요..."
> Chapter 2의 고통이 구체화되었습니다.

**공격 패턴:**
1. Turn 1-5: 누적 데미지 (시간 지남에 따라 강해짐)
2. Turn 6: 다중 공격 (20 × 3)
3. Turn 8+: 최종 공격 (50 데미지 + 상태이상)

**특성:**
- 길어질수록 강해짐
- 빠른 해결 필수
- 협력 멀티플레이 권장

**보상:**
- 경험치: 450 XP ⭐
- 골드: 200 💰
- 드롭: Rare 모든 장비 (100%), Epic 항목 (8%)

---

## ⚡ Chapter 3: 동시성 & 데이터 (2배 경험치 배율)

### 🐛 Bug #11-15: (생략)

```
상세 내용은 기획 문서 참고:

11. Race Condition - 경합 조건
    └─ HP: 90, 경험치: 500, 골드: 250

12. Deadlock - 교착 상태
    └─ HP: 100, 경험치: 560, 골드: 280

13. Double-checked Locking Bug
    └─ HP: 85, 경험치: 480, 골드: 240

14. Data Corruption - 데이터 손상
    └─ HP: 95, 경험치: 540, 골드: 270

15. Inconsistent State - 상태 불일치
    └─ HP: 100, 경험치: 600, 골드: 300
```

**Chapter 3 특징:**
- 복잡한 동시성 문제
- 재현 어려움 (난처함)
- 고급 전략 필요
- Mutex, Semaphore 개념 필요

---

### 🏆 Chapter 3 보스: Concurrency Chaos

```
📍 위치: Chapter 3 - Boss Room
👾 난이도: ★★★
💚 HP: 200
```

**특성:**
- 예측 불가능한 공격 패턴
- 다중 공격 동시 발생
- 협력 필수

**보상:**
- 경험치: 800 XP ⭐⭐
- 골드: 400 💰
- 드롭: Epic 모든 장비 (15%), Legendary 항목 (20%)

---

## 🔐 Chapter 4: 보안 & 아키텍처 (2.5배 경험치 배율)

### 🐛 Bug #16-20: (생략)

```
상세 내용:

16. SQL Injection - 보안 위협
    └─ HP: 110, 경험치: 875, 골드: 350

17. XSS Vulnerability - 크로스사이트 스크립팅
    └─ HP: 115, 경험치: 900, 골드: 360

18. CORS Bypass - 정책 우회
    └─ HP: 120, 경험치: 925, 골드: 370

19. Architecture Anti-pattern - 설계 문제
    └─ HP: 130, 경험치: 1000, 골드: 400

20. Technical Debt Overflow - 기술 부채 폭발
    └─ HP: 150, 경험치: 1250, 골드: 500
```

**Chapter 4 특징:**
- 가장 어려움 (최상급)
- 보안 & 설계 이해 필요
- 완벽한 전략 필수
- 최고 보상

---

### 🏆 최종 보스: The Ultimate Bug - Spaghetti Code Dragon

```
📍 위치: Chapter 4 - Final Boss Room
👾 난이도: ★★★★
💚 HP: 300 (정상) / 250 (Good Ending) / 350 (Bad Ending)
```

**스토리:**
> "모든 버그가 하나로... 거대한 스파게티 코드 드래곤으로 변신했어요!"
> 기술 부채의 극단화입니다.

**공격 패턴:**
- 예측 불가능 (완전히 카오스)
- 최대 데미지 (50+ 한 번에)
- 여러 공격 동시 발생
- 상태이상 연발

**전투 전략:**
- Tech Debt에 따라 난이도 변경
- 완벽한 협력 필수
- 모든 스킬 활용
- 극도의 주의 필요

**엔딩 분기:**
- Good Ending (Tech Debt < 40): 쉬운 버전 (HP 250)
- Normal Ending (40-70): 중간 (HP 300)
- Bad Ending (> 70): 어려운 버전 (HP 350) + 미니 보스

**보상:**
- 경험치: 1500 XP ⭐⭐⭐
- 골드: 600 💰
- 드롭:
  - Good Ending: Legendary 전부 + Secret 항목
  - Normal Ending: Legendary 모음
  - Bad Ending: Legendary 부분

---

## 📊 전체 요약

| # | 버그명 | 장 | HP | 경험치 | 전략 |
|----|--------|-----|-----|--------|------|
| 1 | NullPointer | 1 | 30 | 50 | 초보자 친화 |
| 2 | Syntax Error | 1 | 25 | 40 | 빠른 격파 |
| 3 | TypeError | 1 | 35 | 60 | 방어 중시 |
| 4 | Index OOB | 1 | 40 | 70 | 협력 시작 |
| 5 | Infinite Loop | 1 | 50 | 100 | 지속 공격 |
| 보스 | Syntax Monster | 1 | 100 | 200 | 협력 필수 |
| 6 | Memory Leak | 2 | 60 | 225 | 지속 위협 |
| 7 | O(n²) Loop | 2 | 70 | 270 | 빠른 클리어 |
| 8 | Cache Miss | 2 | 65 | 255 | 적응형 |
| 9 | Stack OVF | 2 | 75 | 300 | 누적 관리 |
| 10 | Conn Pool | 2 | 80 | 330 | 리소스 관리 |
| 보스 | Performance | 2 | 150 | 450 | 시간 관리 |
| 11-15 | 동시성 | 3 | 85-100 | 480-600 | 복잡한 전술 |
| 보스 | Concurrency | 3 | 200 | 800 | 고급 협력 |
| 16-20 | 보안 | 4 | 110-150 | 875-1250 | 완벽함 추구 |
| 최종 | Spaghetti | 4 | 250-350 | 1500 | 종합 전략 |

---

**상태**: 🟢 20개 버그 정의 완성
**담당자**: PM (루미)
**마지막 업데이트**: 2026-02-05
