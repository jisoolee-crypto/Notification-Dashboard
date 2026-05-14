# ONE Notification Dashboard — 개발 정책 및 협업 가이드

> 이 문서는 비개발자 팀원이 Claude와 함께 개발에 참여할 때 알아야 할 정책과 규칙을 정리한 문서입니다.
> Claude는 이 문서를 자동으로 읽고 개발 방향을 맞춥니다.

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 서비스명 | ONE's Notification Dashboard |
| 목적 | 인시던트 알림 및 시스템 유지보수 일정을 한 화면에서 확인 |
| 프레임워크 | AdminLTE v4 (Bootstrap 5) — 순수 HTML/CSS/JS, 빌드 도구 없음 |
| 데이터 소스 | Google Apps Script Web App → Google Drive 폴더 스캔 |
| 배포 방식 | 로컬 Python HTTP 서버 (사내 WiFi 공유) |
| 주요 파일 | `AdminLTE-master/dist/notification-dashboard.html` |
| GAS 파일 | `apps-script-automation.gs` |

---

## 2. 기술 구조 한 눈에 보기

```
[Google Drive 폴더]
  ├── Incident Folder    → 인시던트 알림 구글 시트들
  └── Maintenance Folder → 유지보수 알림 구글 시트들
          ↓ (DriveApp 스캔)
[Google Apps Script Web App]   ← GAS URL로 JSON 반환
          ↓ (fetch API, 5분 캐시)
[notification-dashboard.html]  ← 브라우저에서 직접 렌더링
          ↓ (Python HTTP 서버)
[팀원 브라우저]  http://[내 IP]:8000/notification-dashboard.html
```

**핵심 원칙**: 서버·DB 없음. 구글 시트가 DB 역할, GAS가 API 역할.

---

## 3. 화면 구성

| 섹션 | 설명 |
|------|------|
| Home | 요약 현황 카드 (진행 중 인시던트 수, 다가오는 점검 등) |
| Incident Notification | GAS에서 실시간 로드 — Occurrence / Intermediate / Normalize 탭 |
| Incident History | 인시던트 이력 테이블 (현재 mock 데이터) |
| Maintenance Schedule | Reference / MSN / Monthly / On Demand 탭 |

---

## 4. 개발 정책

### 4-1. 파일 수정 원칙
- **메인 파일은 1개**: `notification-dashboard.html` 하나에 HTML·CSS·JS 모두 포함.
  별도 `.js` / `.css` 파일을 새로 만들지 않는다.
- **AdminLTE 원본 파일(`css/`, `js/`, `plugins/`)은 절대 수정하지 않는다.**
  커스텀 스타일은 `notification-dashboard.html` 내 `<style>` 블록에만 작성.
- 새 페이지가 필요하면 새 `.html` 파일을 `dist/` 폴더 안에 추가한다.

### 4-2. GAS(Google Apps Script) 정책
- 로컬의 `apps-script-automation.gs` 파일이 **원본 소스**다.
- 코드 변경 후에는 반드시 **GAS 에디터에 붙여넣고 새 버전으로 재배포**해야 적용된다.
  (Deploy → Manage deployments → New version)
- GAS Web App URL은 재배포해도 바뀌지 않는다.
- 배포 타입은 항상 **"Execute as: Me" / "Who has access: Anyone"** 유지.

### 4-3. 데이터 정책
- 구글 드라이브 폴더 ID는 `apps-script-automation.gs` 상단 `CONFIG` 객체에서만 관리한다.
- 새 폴더가 추가되면 `CONFIG`에 ID를 추가하고 GAS 재배포.
- 대시보드는 GAS 호출 실패 시 **mock 데이터로 자동 fallback**한다. (서비스 중단 없음)

### 4-4. 스타일 정책
- 컬러 팔레트: Primary `#0057A8`, 긴급 `#a0006e`, 경고 `#e65c00`, 정상 `#28a745`
- 아이콘: Bootstrap Icons (`bi bi-*`) 만 사용. 외부 아이콘 라이브러리 추가 금지.
- 반응형: Bootstrap 5 그리드 기준. 모바일 대응은 현재 범위 외.

### 4-5. 성능 정책
- GAS 응답은 **5분 캐시** (`_cacheTs` 변수). 5분 미만 재방문 시 캐시 사용.
- 페이지 로딩 목표: **3초 이내** (로컬 서버 기준).
- 달력 이벤트는 현재 **mock 데이터** 사용 중. 실시간 연동 시 별도 기획 필요.

---

## 5. Claude와 협업하는 방법

### 요청할 때 이렇게 말하세요

| 상황 | 좋은 요청 예시 |
|------|---------------|
| 화면 수정 | "MSN 탭 테이블에 '비고' 컬럼 추가해줘" |
| 버그 신고 | "달력이 공란으로 떠, 스크린샷 첨부" |
| 새 기능 | "인시던트 히스토리에 검색 필터 추가하고 싶어" |
| GAS 수정 | "유지보수 시트에서 '담당자' 컬럼도 읽어오고 싶어" |

### 하지 말아야 할 요청
- "전부 다시 만들어줘" → 범위가 너무 넓음. 기능 단위로 나눠서 요청.
- "예쁘게 해줘" → 구체적으로: "헤더 색을 네이비로, 폰트 크기 키워줘"처럼.

### Claude가 코드를 바꿨을 때
1. 브라우저에서 `Cmd+Shift+R` (강력 새로고침)
2. GAS 코드가 바뀌었다면 → GAS 에디터에서 재배포 필요 (Claude가 알려줌)

---

## 6. 로컬 서버 실행 방법

```bash
# 터미널에서 실행
cd "/Users/jisoo.lee/notification dashboard/AdminLTE-master/dist"
python3 -m http.server 8000
```

- 접속 URL: `http://localhost:8000/notification-dashboard.html`
- 팀원 공유: `http://[내 맥 IP]:8000/notification-dashboard.html`
  - 내 IP 확인: 터미널에서 `ipconfig getifaddr en0`

---

## 7. 폴더 구조

```
notification dashboard/
├── CLAUDE.md                          ← 이 파일 (Claude 자동 참조)
├── apps-script-automation.gs          ← GAS 소스 원본
├── ONE_Notification_Planning_Template.xlsx  ← 기획 템플릿
├── make_planning_excel.py             ← 엑셀 생성 스크립트
└── AdminLTE-master/
    └── dist/
        ├── notification-dashboard.html  ← 메인 대시보드 (핵심 파일)
        ├── css/                         ← AdminLTE 원본 (수정 금지)
        ├── js/                          ← AdminLTE 원본 (수정 금지)
        └── plugins/                     ← AdminLTE 원본 (수정 금지)
```

---

## 8. GAS 엔드포인트

| URL 파라미터 | 반환 데이터 |
|-------------|------------|
| `?type=incident` | 인시던트 폴더 내 모든 시트 (Occurrence/Intermediate/Normalize 탭) |
| `?type=maintenance` | 유지보수 폴더 내 모든 시트 (GSD Notification 시트 우선) |
| `?type=debug` | 폴더 내 파일명·시트명 목록 (디버깅용) |

**GAS Web App URL**:
```
https://script.google.com/macros/s/AKfycbwm8_VkjQZ3pkA9D2weHrgds5DWO_8IO_amGjMPxekXBEg0BC_lWuLtMEikj-NtZpAH/exec
```

---

## 9. 알려진 제약사항

| 제약 | 이유 | 우회 방법 |
|------|------|-----------|
| GAS 코드 변경 후 직접 재배포 필요 | GAS 보안 정책 | Claude가 변경 내용 설명하면 수동 배포 |
| 달력 이벤트 수동 입력 | GAS에 날짜 파싱 미구현 | 추후 기획 시 개발 가능 |
| HTTPS 미지원 | 로컬 서버 한계 | ngrok / Netlify 배포로 해결 가능 |
| 인시던트 히스토리 실시간 미지원 | 현재 mock 데이터 | GAS 히스토리 폴더 연동 시 가능 |

---

## 10. 변경 이력

| 날짜 | 변경 내용 | 작성자 |
|------|-----------|--------|
| 2026-05-14 | 최초 작성 | Claude |
