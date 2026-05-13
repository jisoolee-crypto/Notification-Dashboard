/**
 * ONE's Notification System — Apps Script Web App
 */

const CONFIG = {
  INCIDENT_FOLDER_ID:    '1HMJXOoAd-ZfqBNRKVSJRBGsS1zR4W68u',
  MAINTENANCE_FOLDER_ID: '1TwzQEJd6GZCO0nl7zl_c_H9ReSgAIQdW',
};

/* ═══════════════════════════════════════════════════
   Web App 진입점
════════════════════════════════════════════════════ */
function doGet(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const type = (e && e.parameter && e.parameter.type) || 'incident';

    let data;
    if (type === 'maintenance') data = getMaintenanceData();
    else if (type === 'debug')  data = debugSheets();
    else                        data = getIncidentData();

    output.setContent(JSON.stringify({ ok: true, data }));
  } catch (err) {
    output.setContent(JSON.stringify({ ok: false, error: err.toString() }));
  }
  return output;
}

/* ═══════════════════════════════════════════════════
   DEBUG — 시트명 + GSD Notification 첫 20행 미리보기
════════════════════════════════════════════════════ */
function debugSheets() {
  const result = { incident: [], maintenance: [] };

  const incFolder = DriveApp.getFolderById(CONFIG.INCIDENT_FOLDER_ID);
  const incFiles  = incFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (incFiles.hasNext()) {
    const f  = incFiles.next();
    const ss = SpreadsheetApp.openById(f.getId());
    result.incident.push({
      fileName: f.getName(),
      sheets: ss.getSheets().map(s => s.getName()),
    });
  }

  const mntFolder = DriveApp.getFolderById(CONFIG.MAINTENANCE_FOLDER_ID);
  const mntFiles  = mntFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (mntFiles.hasNext()) {
    const f  = mntFiles.next();
    const ss = SpreadsheetApp.openById(f.getId());
    const firstSheet = ss.getSheets()[0];
    const preview = firstSheet
      ? firstSheet.getRange(1, 1, Math.min(20, firstSheet.getLastRow()), Math.min(6, firstSheet.getLastColumn()))
           .getValues()
           .map(r => r.map(c => String(c).substring(0, 50)))
      : [];
    result.maintenance.push({
      fileName: f.getName(),
      firstSheetName: firstSheet ? firstSheet.getName() : '',
      sheets: ss.getSheets().map(s => s.getName()),
      preview,
    });
  }

  return result;
}

/* ═══════════════════════════════════════════════════
   Incident Notification 폴더 스캔
   각 파일에서 Occurrence / Intermediate / Normalize 탭 파싱
   시트 구조: 알림 이메일 형식
     - Title 셀, Recipient 셀
     - 번호 행: 1 | "Incident reported date" | "값"
                2 | "Impact" | "값"
                3 | "Current Status" | "값"
                4 | "Inc. No" | "값"
════════════════════════════════════════════════════ */
function getIncidentData() {
  const folder = DriveApp.getFolderById(CONFIG.INCIDENT_FOLDER_ID);
  const files  = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    const ss   = SpreadsheetApp.openById(file.getId());
    const tabs = {};

    // 실제 시트명과 표준 탭명 매핑
    const TAB_MAP = {
      'Occurrence':               ['Occurrence', 'Incident Occurrence Notice'],
      'Intermediate':             ['Intermediate', 'Intermediate Notice', 'Intermediate 2'],
      'Normalize':                ['Normalize', 'Normalization Notice', 'Normalization Notification'],
    };

    Object.entries(TAB_MAP).forEach(([standardName, candidates]) => {
      let sheet = null;
      for (const name of candidates) {
        sheet = ss.getSheetByName(name);
        if (sheet) break;
      }
      if (!sheet) return;

      const values = sheet.getDataRange().getValues();
      tabs[standardName] = parseIncidentSheet(values);
    });

    // 탭이 하나라도 있으면 추가
    if (Object.keys(tabs).length > 0) {
      result.push({
        fileName:   file.getName(),
        fileId:     file.getId(),
        modifiedAt: Utilities.formatDate(
          file.getLastUpdated(), 'Asia/Singapore', 'yyyy-MM-dd HH:mm'
        ),
        tabs,
      });
    }
  }

  result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return { files: result };
}

/* 인시던트 시트 파싱: 이메일 알림 형식
   실제 구조: col A 비어있음, 데이터는 col B부터
   숫자(1~4)가 col A 또는 col B에 위치
*/
function parseIncidentSheet(values) {
  const result = { title: '', recipient: '', rows: [] };

  values.forEach(row => {
    // 모든 셀 문자열화
    const cells = row.map(c => String(c).trim());

    // Title 찾기 (어느 셀에나 있을 수 있음)
    cells.forEach((cell, i) => {
      if (!result.title && (cell.includes('Title:') || cell.includes('Title :'))) {
        const after = cell.replace(/Title\s*:\s*/i, '').trim();
        result.title = after || String(row[i + 1] || '').trim();
      }
    });

    // Recipient: All 찾기
    cells.forEach(cell => {
      if (/Recipient\s*:\s*All/i.test(cell)) result.recipient = 'All';
    });

    // 번호 행: col A 또는 col B에서 1~10 정수 찾기
    for (let i = 0; i <= Math.min(2, cells.length - 1); i++) {
      const num = Number(cells[i]);
      if (Number.isInteger(num) && num >= 1 && num <= 10 && cells[i + 1]) {
        result.rows.push({
          no:    cells[i],
          field: cells[i + 1],
          value: cells[i + 2] || '',
        });
        break;
      }
    }
  });

  return result;
}

/* ═══════════════════════════════════════════════════
   System Maintenance 폴더 스캔
   첫 번째 시트(이름 무관) 또는 "GSD Notification" 시트 읽기
════════════════════════════════════════════════════ */
function getMaintenanceData() {
  const folder = DriveApp.getFolderById(CONFIG.MAINTENANCE_FOLDER_ID);
  const files  = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  const result = [];

  while (files.hasNext()) {
    const file   = files.next();
    const ss     = SpreadsheetApp.openById(file.getId());

    // "GSD Notification" 시트 우선, 없으면 첫 번째 시트
    const sheet = ss.getSheetByName('GSD Notification') || ss.getSheets()[0];
    if (!sheet) continue;

    const values      = sheet.getDataRange().getValues();
    const title       = extractCell(values, 'Title');
    const recipient   = extractCell(values, 'Recipient');
    const prodRows    = parseMaintenanceTable(values, '* Production');
    const nonProdRows = parseMaintenanceTable(values, '* Non-Production');

    result.push({
      fileName:   file.getName(),
      fileId:     file.getId(),
      sheetUsed:  sheet.getName(),   // 어떤 시트가 읽혔는지 확인용
      modifiedAt: Utilities.formatDate(
        file.getLastUpdated(), 'Asia/Singapore', 'yyyy-MM-dd HH:mm'
      ),
      title,
      recipient,
      prodRows,
      nonProdRows,
    });
  }

  result.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  return { files: result };
}

/* ── 셀 값 찾기: 키워드가 포함된 셀의 값 또는 옆 셀 반환 ── */
function extractCell(values, keyword) {
  const kw = keyword.toLowerCase();
  for (const row of values) {
    for (let i = 0; i < row.length; i++) {
      const cellRaw = String(row[i]);
      const cellLow = cellRaw.toLowerCase().trim();
      if (!cellLow.includes(kw)) continue;

      // "Title : 실제값" — 콜론 뒤에 값이 있으면 반환
      if (cellLow.includes(':')) {
        const after = cellRaw.split(':').slice(1).join(':').trim();
        if (after) return after;
        // 콜론은 있지만 값이 없음 (e.g. "Title :") → 옆 셀 확인으로 fall-through
      }

      // 키워드만 있거나, 콜론 뒤가 비어있는 경우 → 같은 행의 오른쪽 셀에서 값 탐색
      for (let j = i + 1; j < row.length; j++) {
        const next = String(row[j]).trim();
        if (next) return next;
      }
    }
  }
  return '';
}

/* ── Production / Non-Production 테이블 파싱
   col A 또는 col B 어느 쪽에 섹션 헤더/No 값이 있든 자동 감지
── */
function parseMaintenanceTable(values, sectionKeyword) {
  let inSection = false;
  const rows = [];

  for (const row of values) {
    const c0 = String(row[0] || '').trim(); // col A
    const c1 = String(row[1] || '').trim(); // col B

    // 섹션 시작 감지: col A 또는 col B에서 키워드 검색
    if (c0.includes(sectionKeyword) || c1.includes(sectionKeyword)) {
      inSection = true;
      continue;
    }

    // 다른 섹션("* ...")이 시작되면 종료
    if (inSection) {
      const starInA = c0.startsWith('* ') && !c0.includes(sectionKeyword);
      const starInB = c1.startsWith('* ') && !c1.includes(sectionKeyword);
      if (starInA || starInB) break;
    }

    if (!inSection) continue;

    // 헤더 행 스킵 (No, Environment 등)
    if (c0 === 'No' || c1 === 'No' || c0 === 'Environment') continue;

    // 데이터 행 감지: No 값이 col A에 있는 경우 (1,2,3 또는 No1,No2)
    const c0isNo = /^\d+$/.test(c0) || /^No[\d,]/i.test(c0);
    if (c0isNo && c1) {
      // 구조: col A=No, col B=Env, col C=Services, col D=Impact, col E=Time
      rows.push({
        no:       c0,
        env:      c1,
        services: String(row[2] || '').trim(),
        impact:   String(row[3] || '').trim(),
        time:     String(row[4] || '').trim(),
      });
      continue;
    }

    // No 값이 col B에 있는 경우 (구형 포맷: No5, No11)
    const c1isNo = /^\d+$/.test(c1) || /^No[\d,]/i.test(c1);
    const c2 = String(row[2] || '').trim();
    if (c1isNo && c2) {
      // 구조: col A=empty, col B=No, col C=Env, col D=Services, col E=Impact, col F=Time
      rows.push({
        no:       c1,
        env:      c2,
        services: String(row[3] || '').trim(),
        impact:   String(row[4] || '').trim(),
        time:     String(row[5] || '').trim(),
      });
    }
  }

  return rows;
}
