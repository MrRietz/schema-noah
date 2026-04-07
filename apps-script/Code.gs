const SPREADSHEET_ID = "1Veinh7xcEHV_R2tvMd-3oIUt3_EqWYrQTWi211fpL-c";
const SHEET_NAME = "Noah Kalender";
const AUDIT_SHEET_NAME = "Audit Log";
const BACKUP_SHEET_NAME = "Backup Log";
const COLUMN_INDEX = {
  datum: 1,
  hos: 4,
  hamtningsLamning: 5,
  anteckningar: 6,
};
const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_ATTEMPTS = 12;
const BLOCK_DURATION_MINUTES = 30;
const AUDIT_LOOKBACK_ROWS = 200;

function doPost(e) {
  let payload = {};
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(5000);
    payload = JSON.parse(e.postData.contents || "{}");

    const blockResult = evaluateRateLimit(payload);
    if (blockResult.blocked) {
      logAttempt("blocked", payload, blockResult.message);
      return jsonResponse({ ok: false, error: blockResult.message });
    }

    if (!payload.datum) {
      logAttempt("rejected", payload, "Missing datum");
      return jsonResponse({ ok: false, error: "datum is required" });
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    const values = sheet.getDataRange().getValues();

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const rowDate = formatSheetDate(values[rowIndex][COLUMN_INDEX.datum - 1]);
      if (rowDate !== payload.datum) {
        continue;
      }

      backupOriginalRow(values[rowIndex], payload);
      sheet.getRange(rowIndex + 1, COLUMN_INDEX.hos).setValue(payload.hos || "");
      sheet.getRange(rowIndex + 1, COLUMN_INDEX.hamtningsLamning).setValue(payload.hamtningsLamning || "");
      sheet.getRange(rowIndex + 1, COLUMN_INDEX.anteckningar).setValue(payload.anteckningar || "");
      SpreadsheetApp.flush();
      logAttempt("updated", payload, "");

      return jsonResponse({ ok: true, updatedDate: payload.datum });
    }

    logAttempt("not_found", payload, "Date not found");
    return jsonResponse({ ok: false, error: "Date not found" });
  } catch (error) {
    logAttempt("error", payload, String(error));
    return jsonResponse({ ok: false, error: String(error) });
  } finally {
    try {
      lock.releaseLock();
    } catch (error) {
      // Ignore lock release errors.
    }
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatSheetDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }

  return String(value);
}

function logAttempt(status, payload, message) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateAuditSheet(spreadsheet);
  const meta = payload.meta || {};

  sheet.appendRow([
    new Date(),
    status,
    payload.datum || "",
    payload.hos || "",
    payload.hamtningsLamning || "",
    payload.anteckningar || "",
    meta.clientId || "",
    meta.savedFrom || "",
    meta.userAgent || "",
    meta.clientTimestamp || "",
    message || "",
    JSON.stringify(payload),
  ]);
}

function getOrCreateAuditSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(AUDIT_SHEET_NAME);
  if (sheet) {
    return sheet;
  }

  sheet = spreadsheet.insertSheet(AUDIT_SHEET_NAME);
  sheet.appendRow([
    "Timestamp",
    "Status",
    "Datum",
    "Hos",
    "HamtningsLamning",
    "Anteckningar",
    "ClientId",
    "SavedFrom",
    "UserAgent",
    "ClientTimestamp",
    "Message",
    "RawPayload",
  ]);

  return sheet;
}

function backupOriginalRow(rowValues, payload) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateBackupSheet(spreadsheet);
  const meta = payload.meta || {};

  sheet.appendRow([
    new Date(),
    payload.datum || "",
    rowValues[COLUMN_INDEX.datum - 1] || "",
    rowValues[1] || "",
    rowValues[2] || "",
    rowValues[COLUMN_INDEX.hos - 1] || "",
    rowValues[COLUMN_INDEX.hamtningsLamning - 1] || "",
    rowValues[COLUMN_INDEX.anteckningar - 1] || "",
    meta.clientId || "",
    meta.savedFrom || "",
    meta.userAgent || "",
    JSON.stringify(payload),
  ]);
}

function getOrCreateBackupSheet(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(BACKUP_SHEET_NAME);
  if (sheet) {
    return sheet;
  }

  sheet = spreadsheet.insertSheet(BACKUP_SHEET_NAME);
  sheet.appendRow([
    "BackupTimestamp",
    "RequestedDatum",
    "OriginalDatum",
    "OriginalVecka",
    "OriginalVeckodag",
    "OriginalHos",
    "OriginalHamtningsLamning",
    "OriginalAnteckningar",
    "ClientId",
    "SavedFrom",
    "UserAgent",
    "RawPayload",
  ]);

  return sheet;
}

function evaluateRateLimit(payload) {
  const key = getClientKey(payload);
  const properties = PropertiesService.getScriptProperties();
  const now = new Date();
  const blockedUntil = Number(properties.getProperty(`blockedUntil:${key}`) || 0);

  if (blockedUntil && blockedUntil > now.getTime()) {
    return {
      blocked: true,
      message: `Too many edit attempts. Blocked until ${new Date(blockedUntil).toISOString()}`,
    };
  }

  const recentAttempts = countRecentAttempts(key, now);
  if (recentAttempts >= RATE_LIMIT_MAX_ATTEMPTS) {
    const nextBlockedUntil = now.getTime() + BLOCK_DURATION_MINUTES * 60 * 1000;
    properties.setProperty(`blockedUntil:${key}`, String(nextBlockedUntil));
    return {
      blocked: true,
      message: `Too many edit attempts in ${RATE_LIMIT_WINDOW_MINUTES} minutes`,
    };
  }

  return { blocked: false, message: "" };
}

function countRecentAttempts(clientKey, now) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateAuditSheet(spreadsheet);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return 0;
  }

  const startRow = Math.max(2, lastRow - AUDIT_LOOKBACK_ROWS + 1);
  const rowCount = lastRow - startRow + 1;
  const rows = sheet.getRange(startRow, 1, rowCount, 12).getValues();
  const cutoff = now.getTime() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000;
  let count = 0;

  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    const timestamp = new Date(row[0]).getTime();
    const status = String(row[1] || "");
    const rowClientId = String(row[6] || "");
    const rowSavedFrom = String(row[7] || "");
    const rowUserAgent = String(row[8] || "");
    const rowKey = rowClientId || `${rowSavedFrom}|${rowUserAgent}`;

    if (!timestamp || timestamp < cutoff) {
      continue;
    }

    if (status === "error" || status === "updated" || status === "rejected" || status === "not_found" || status === "blocked") {
      if (rowKey === clientKey) {
        count += 1;
      }
    }
  }

  return count;
}

function getClientKey(payload) {
  const meta = payload.meta || {};
  return meta.clientId || `${meta.savedFrom || ""}|${meta.userAgent || ""}`;
}

function restoreLatestBackup(targetDate) {
  if (!targetDate) {
    throw new Error("targetDate is required, example: 2026-04-07");
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const calendarSheet = spreadsheet.getSheetByName(SHEET_NAME);
  const backupSheet = getOrCreateBackupSheet(spreadsheet);
  const backupValues = backupSheet.getDataRange().getValues();

  if (backupValues.length <= 1) {
    throw new Error("No backups found");
  }

  let latestBackupRow = null;

  for (let rowIndex = backupValues.length - 1; rowIndex >= 1; rowIndex -= 1) {
    const row = backupValues[rowIndex];
    const requestedDate = String(row[1] || "");
    const originalDate = formatSheetDate(row[2]);

    if (requestedDate === targetDate || originalDate === targetDate) {
      latestBackupRow = row;
      break;
    }
  }

  if (!latestBackupRow) {
    throw new Error(`No backup found for ${targetDate}`);
  }

  const calendarValues = calendarSheet.getDataRange().getValues();

  for (let rowIndex = 1; rowIndex < calendarValues.length; rowIndex += 1) {
    const rowDate = formatSheetDate(calendarValues[rowIndex][COLUMN_INDEX.datum - 1]);
    if (rowDate !== targetDate) {
      continue;
    }

    calendarSheet.getRange(rowIndex + 1, COLUMN_INDEX.hos).setValue(latestBackupRow[5] || "");
    calendarSheet.getRange(rowIndex + 1, COLUMN_INDEX.hamtningsLamning).setValue(latestBackupRow[6] || "");
    calendarSheet.getRange(rowIndex + 1, COLUMN_INDEX.anteckningar).setValue(latestBackupRow[7] || "");
    SpreadsheetApp.flush();

    logAttempt("restored", {
      datum: targetDate,
      hos: latestBackupRow[5] || "",
      hamtningsLamning: latestBackupRow[6] || "",
      anteckningar: latestBackupRow[7] || "",
      meta: {
        savedFrom: "restoreLatestBackup",
        userAgent: "Apps Script",
        clientTimestamp: new Date().toISOString(),
      },
    }, "Restored from latest backup");

    return {
      ok: true,
      restoredDate: targetDate,
      restoredValues: {
        hos: latestBackupRow[5] || "",
        hamtningsLamning: latestBackupRow[6] || "",
        anteckningar: latestBackupRow[7] || "",
      },
    };
  }

  throw new Error(`Date ${targetDate} was not found in ${SHEET_NAME}`);
}
