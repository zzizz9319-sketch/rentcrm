/**
 * RENTAL GATE CRM — Google Sheets Database Layer
 * Auto-creates Spreadsheet if missing, appends new schema columns safely without data loss,
 * uses LockService for concurrent writes, CacheService for read optimization,
 * and batch getValues/setValues operations.
 */

var RG_SHEETS_SCHEMA = {
  Users: [
    'id', 'name', 'username', 'phone', 'email', 'jobTitle',
    'role', 'permissions', 'status', 'lastActivity', 'createdAt', 'updatedAt'
  ],
  Employees: [
    'id', 'name', 'username', 'passwordHash', 'salt', 'phone', 'email',
    'jobTitle', 'role', 'permissions', 'status', 'lastActivity', 'createdAt', 'updatedAt'
  ],
  Reservations: [
    'id', 'reservationNumber', 'customerName', 'customerPhone', 'companyName',
    'branchName', 'carName', 'plateNumber', 'startDate', 'endDate', 'daysCount',
    'originalStatusCode', 'originalStatusAr', 'pickupTypeAr', 'returnTypeAr',
    'baseAmount', 'extensionsAmount', 'totalAmount', 'hasExtensions',
    'internalStatus', 'priority', 'assignedEmployeeIds', 'assignedEmployeeNames',
    'lastUpdateText', 'lastUpdatedById', 'lastUpdatedByName', 'lastUpdatedAt',
    'hasProblem', 'createdAt', 'updatedAt', 'rawJson'
  ],
  Extensions: [
    'id', 'extensionNumber', 'reservationId', 'reservationNumber', 'statusCode',
    'statusAr', 'paymentStatus', 'extendDays', 'startDate', 'endDate',
    'amount', 'isAcceptedAndPaid', 'syncedAt'
  ],
  Assignments: [
    'id', 'reservationId', 'reservationNumber', 'employeeId', 'employeeName',
    'assignedById', 'assignedByName', 'roleType', 'status', 'assignedAt', 'updatedAt'
  ],
  FollowUps: [
    'id', 'reservationId', 'reservationNumber', 'customerName', 'employeeId',
    'employeeName', 'status', 'action', 'notes', 'followUpDate', 'followUpTime', 'createdAt'
  ],
  FollowUpHistory: [
    'id', 'followUpId', 'reservationId', 'reservationNumber', 'employeeId',
    'employeeName', 'changeType', 'previousStatus', 'newStatus', 'previousAction',
    'newAction', 'previousNotes', 'newNotes', 'changedAt'
  ],
  Issues: [
    'id', 'problemNumber', 'reservationId', 'reservationNumber', 'customerName',
    'createdById', 'createdByName', 'assignedEmployeeIds', 'assignedEmployeeNames',
    'description', 'priority', 'status', 'createdAt', 'updatedAt'
  ],
  Problems: [
    'id', 'problemNumber', 'reservationId', 'reservationNumber', 'customerName',
    'createdById', 'createdByName', 'assignedEmployeeIds', 'assignedEmployeeNames',
    'description', 'priority', 'status', 'createdAt', 'updatedAt'
  ],
  ProblemUpdates: [
    'id', 'problemId', 'reservationNumber', 'employeeId', 'employeeName',
    'previousStatus', 'newStatus', 'previousPriority', 'newPriority', 'note', 'createdAt'
  ],
  ActivityLog: [
    'id', 'userId', 'userName', 'userRole', 'actionType', 'entityType',
    'entityId', 'details', 'logDate', 'logTime', 'createdAt'
  ],
  Notifications: [
    'id', 'recipientEmployeeId', 'recipientRole', 'type', 'title',
    'message', 'entityType', 'entityId', 'isRead', 'createdAt'
  ],
  Settings: [
    'key', 'value', 'updatedBy', 'updatedAt'
  ],
  Roles: [
    'id', 'label', 'jobTitle', 'role', 'permissions', 'updatedBy', 'updatedAt'
  ],
  Permissions: [
    'key', 'label', 'group', 'isCustom', 'updatedBy', 'updatedAt'
  ],
  Sessions: [
    'tokenHash', 'employeeId', 'username', 'role', 'expiresAt',
    'createdAt', 'lastSeenAt', 'isRevoked'
  ],
  SyncLog: [
    'id', 'triggeredById', 'triggeredByName', 'status', 'importedCount',
    'updatedCount', 'extensionsCount', 'pagesFetched', 'errorMessage',
    'durationMs', 'startedAt', 'finishedAt'
  ]
};

var _rgSpreadsheetCache = null;
var _rgSpreadsheetTzCache = '';
var _rgVerifiedSheetsCache = {};
var _rgRecordsCache = {};
var RG_CACHE_CHUNK_SIZE = 75000;
var RG_CACHE_MAX_CHUNKS = 12;
var RG_CACHE_TTL_SECONDS = 300;
var RG_DATE_ONLY_FIELDS = { startDate: true, endDate: true, followUpDate: true, logDate: true };
var RG_TIME_ONLY_FIELDS = { followUpTime: true, logTime: true };

function getSpreadsheetTz_() {
  if (_rgSpreadsheetTzCache) return _rgSpreadsheetTzCache;
  try {
    var ss = getSpreadsheet();
    _rgSpreadsheetTzCache = ss.getSpreadsheetTimeZone() || Session.getScriptTimeZone() || 'Asia/Riyadh';
  } catch (e) {
    _rgSpreadsheetTzCache = 'Asia/Riyadh';
  }
  return _rgSpreadsheetTzCache;
}

function getSpreadsheet() {
  if (_rgSpreadsheetCache) return _rgSpreadsheetCache;
  var props = PropertiesService.getScriptProperties();
  var sheetId = normalizeStr(props.getProperty('SPREADSHEET_ID'));
  if (sheetId) {
    try {
      _rgSpreadsheetCache = SpreadsheetApp.openById(sheetId);
      return _rgSpreadsheetCache;
    } catch (e) {
      throw new Error('تعذر فتح ملف Google Sheets بالمعرف المخزن (' + sheetId + '): ' + e.message);
    }
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    props.setProperty('SPREADSHEET_ID', active.getId());
    _rgSpreadsheetCache = active;
    return _rgSpreadsheetCache;
  }

  var created = SpreadsheetApp.create('RENTAL_GATE_CRM_DB');
  props.setProperty('SPREADSHEET_ID', created.getId());
  _rgSpreadsheetCache = created;
  return _rgSpreadsheetCache;
}

function withScriptLock(fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(20000);
  if (!acquired) {
    throw new Error('النظام مشغول حالياً بمعالجة عملية متزامنة أخرى، يرجى المحاولة بعد ثوانٍ.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getCacheKey(sheetName) {
  return 'RG_CACHE_V2_' + sheetName;
}

function invalidateCache(sheetName) {
  if (sheetName) {
    delete _rgRecordsCache[sheetName];
  }
  try {
    var base = getCacheKey(sheetName);
    var keys = [base, base + '_META'];
    for (var i = 0; i < RG_CACHE_MAX_CHUNKS; i++) {
      keys.push(base + '_' + i);
    }
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) {}
}

function invalidateAllCaches() {
  _rgRecordsCache = {};
  var names = Object.keys(RG_SHEETS_SCHEMA);
  for (var i = 0; i < names.length; i++) {
    invalidateCache(names[i]);
  }
}

function putChunkedCache_(sheetName, serialized) {
  try {
    var cache = CacheService.getScriptCache();
    var base = getCacheKey(sheetName);
    if (serialized.length <= RG_CACHE_CHUNK_SIZE) {
      cache.put(base, serialized, RG_CACHE_TTL_SECONDS);
      return;
    }
    var totalChunks = Math.ceil(serialized.length / RG_CACHE_CHUNK_SIZE);
    if (totalChunks > RG_CACHE_MAX_CHUNKS) return;
    var batch = {};
    batch[base + '_META'] = String(totalChunks);
    for (var i = 0; i < totalChunks; i++) {
      batch[base + '_' + i] = serialized.substring(i * RG_CACHE_CHUNK_SIZE, (i + 1) * RG_CACHE_CHUNK_SIZE);
    }
    cache.remove(base);
    cache.putAll(batch, RG_CACHE_TTL_SECONDS);
  } catch (e) {}
}

function getChunkedCache_(sheetName) {
  try {
    var cache = CacheService.getScriptCache();
    var base = getCacheKey(sheetName);
    var direct = cache.get(base);
    if (direct) return JSON.parse(direct);

    var metaRaw = cache.get(base + '_META');
    var totalChunks = Number(metaRaw || 0);
    if (!totalChunks || totalChunks < 1 || totalChunks > RG_CACHE_MAX_CHUNKS) return null;

    var keys = [];
    for (var i = 0; i < totalChunks; i++) {
      keys.push(base + '_' + i);
    }
    var got = cache.getAll(keys);
    var parts = [];
    for (var j = 0; j < totalChunks; j++) {
      var chunk = got[base + '_' + j];
      if (!chunk) return null;
      parts.push(chunk);
    }
    return JSON.parse(parts.join(''));
  } catch (e) {
    return null;
  }
}

function styleHeaderRange(range) {
  range
    .setBackground('#313232')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold');
}

function ensureSheetSchemaColumns(sheet, expectedHeaders) {
  if (!expectedHeaders || expectedHeaders.length === 0) return expectedHeaders || [];
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0 || sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
    styleHeaderRange(sheet.getRange(1, 1, 1, expectedHeaders.length));
    sheet.setFrozenRows(1);
    return expectedHeaders.slice();
  }

  var existingHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) {
    return normalizeStr(h);
  });

  var missingHeaders = [];
  for (var i = 0; i < expectedHeaders.length; i++) {
    if (existingHeaders.indexOf(expectedHeaders[i]) === -1) {
      missingHeaders.push(expectedHeaders[i]);
    }
  }

  if (missingHeaders.length > 0) {
    var startCol = existingHeaders.length + 1;
    sheet.getRange(1, startCol, 1, missingHeaders.length).setValues([missingHeaders]);
    styleHeaderRange(sheet.getRange(1, startCol, 1, missingHeaders.length));
    existingHeaders = existingHeaders.concat(missingHeaders);
  }
  return existingHeaders;
}

function getSheetOrCreate(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  var headers = RG_SHEETS_SCHEMA[sheetName] || [];
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    _rgVerifiedSheetsCache[sheetName] = ensureSheetSchemaColumns(sheet, headers);
    return sheet;
  }
  if (!_rgVerifiedSheetsCache[sheetName]) {
    _rgVerifiedSheetsCache[sheetName] = ensureSheetSchemaColumns(sheet, headers);
  }
  return sheet;
}

function getEffectiveHeaders(sheet, sheetName) {
  if (_rgVerifiedSheetsCache[sheetName]) {
    return _rgVerifiedSheetsCache[sheetName];
  }
  var schemaHeaders = RG_SHEETS_SCHEMA[sheetName] || [];
  var resolved = ensureSheetSchemaColumns(sheet, schemaHeaders);
  _rgVerifiedSheetsCache[sheetName] = resolved;
  return resolved;
}

function syncUserSheetRecord(emp) {
  if (!emp || !emp.id) return;
  upsertRecordByKey(RG_SHEETS.USERS, 'id', emp.id, {
    id: emp.id,
    name: emp.name || '',
    username: emp.username || '',
    phone: emp.phone || '',
    email: emp.email || '',
    jobTitle: emp.jobTitle || '',
    role: emp.role || RG_ROLES.AGENT,
    permissions: typeof emp.permissions === 'string' ? emp.permissions : JSON.stringify(emp.permissions || []),
    status: emp.status || 'active',
    lastActivity: emp.lastActivity || '',
    createdAt: emp.createdAt || nowIso(),
    updatedAt: emp.updatedAt || nowIso()
  });
}

function syncIssueSheetRecord(problem) {
  if (!problem || !problem.id) return;
  upsertRecordByKey(RG_SHEETS.ISSUES, 'id', problem.id, {
    id: problem.id,
    problemNumber: problem.problemNumber || '',
    reservationId: problem.reservationId || '',
    reservationNumber: problem.reservationNumber || '',
    customerName: problem.customerName || '',
    createdById: problem.createdById || '',
    createdByName: problem.createdByName || '',
    assignedEmployeeIds: typeof problem.assignedEmployeeIds === 'string'
      ? problem.assignedEmployeeIds
      : JSON.stringify(problem.assignedEmployeeIds || []),
    assignedEmployeeNames: typeof problem.assignedEmployeeNames === 'string'
      ? problem.assignedEmployeeNames
      : JSON.stringify(problem.assignedEmployeeNames || []),
    description: problem.description || '',
    priority: problem.priority || 'متوسط',
    status: problem.status || 'جديدة',
    createdAt: problem.createdAt || nowIso(),
    updatedAt: problem.updatedAt || nowIso()
  });
}

function initDatabaseCore_() {
  var ss = getSpreadsheet();
    var sheetNames = Object.keys(RG_SHEETS_SCHEMA);
    for (var i = 0; i < sheetNames.length; i++) {
      getSheetOrCreate(ss, sheetNames[i]);
      invalidateCache(sheetNames[i]);
    }

    var defaultSettings = {
      company_name: 'RENTAL GATE',
      excluded_statuses: JSON.stringify(['draft', 'test', 'abandoned']),
      session_ttl_hours: '24',
      allow_agent_view_all: 'true',
      default_language: 'ar',
      auto_sync_enabled: 'true',
      auto_sync_interval_hours: '12',
      job_role_presets: JSON.stringify(RG_DEFAULT_ROLE_PRESETS),
      permissions_catalog_custom: JSON.stringify([])
    };

    var settingKeys = Object.keys(defaultSettings);
    for (var k = 0; k < settingKeys.length; k++) {
      var key = settingKeys[k];
      var existing = findRecordById(RG_SHEETS.SETTINGS, 'key', key);
      if (!existing) {
        appendRecord(RG_SHEETS.SETTINGS, {
          key: key,
          value: defaultSettings[key],
          updatedBy: 'system',
          updatedAt: nowIso()
        });
      }
    }

    syncRolesSheetFromPresets(readRolePresetsSetting(), 'system');
    syncPermissionsSheetFromCatalog(readCustomPermissionsSetting(), 'system');

    var employees = readAllRecords(RG_SHEETS.EMPLOYEES, true);
    var adminCreated = false;
    if (employees.length === 0) {
      var props = PropertiesService.getScriptProperties();
      var adminUsername = props.getProperty('INITIAL_ADMIN_USER') || 'admin';
      var adminPass = props.getProperty('INITIAL_ADMIN_PASS') || 'Admin@123';
      var salt = generateId('SALT');
      var now = nowIso();
      var adminRecord = {
        id: generateId('EMP'),
        name: 'المدير العام',
        username: adminUsername,
        passwordHash: hashPassword(adminPass, salt),
        salt: salt,
        phone: '0500000000',
        email: 'admin@rentalgate.net',
        jobTitle: 'المدير العام',
        role: RG_ROLES.GENERAL_MANAGER,
        permissions: JSON.stringify(['all']),
        status: 'active',
        lastActivity: now,
        createdAt: now,
        updatedAt: now
      };
      appendRecord(RG_SHEETS.EMPLOYEES, adminRecord);
      syncUserSheetRecord(adminRecord);
      adminCreated = true;
    } else {
      for (var u = 0; u < employees.length; u++) {
        syncUserSheetRecord(employees[u]);
      }
    }

  return {
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    initializedSheets: sheetNames,
    adminCreated: adminCreated
  };
}

function initDatabase() {
  return withScriptLock(function () {
    return initDatabaseCore_();
  });
}

function readAllRecords(sheetName, skipCache) {
  if (!skipCache) {
    if (_rgRecordsCache[sheetName]) {
      return _rgRecordsCache[sheetName];
    }
    var cachedRecords = getChunkedCache_(sheetName);
    if (cachedRecords) {
      _rgRecordsCache[sheetName] = cachedRecords;
      return cachedRecords;
    }
  }

  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) {
    if (!skipCache) _rgRecordsCache[sheetName] = [];
    return [];
  }

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var fileHeaders = values[0];
  var ssTz = getSpreadsheetTz_();
  var records = [];

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var isEmpty = true;
    var obj = {};
    for (var c = 0; c < fileHeaders.length; c++) {
      var header = normalizeStr(fileHeaders[c]);
      if (!header) continue;
      var cell = row[c];
      if (cell !== '' && cell !== null && cell !== undefined) {
        isEmpty = false;
      }
      if (cell instanceof Date) {
        if (RG_DATE_ONLY_FIELDS[header]) {
          obj[header] = Utilities.formatDate(cell, ssTz, 'yyyy-MM-dd');
        } else if (RG_TIME_ONLY_FIELDS[header]) {
          obj[header] = Utilities.formatDate(cell, ssTz, 'HH:mm:ss');
        } else {
          obj[header] = cell.toISOString();
        }
      } else if (RG_DATE_ONLY_FIELDS[header] && typeof cell === 'string' && cell.length > 10) {
        obj[header] = formatDateOnly(cell);
      } else {
        obj[header] = cell;
      }
    }
    if (!isEmpty) {
      records.push(obj);
    }
  }

  if (!skipCache) {
    var cachePayload = records;
    if (sheetName === RG_SHEETS.RESERVATIONS) {
      cachePayload = records.map(function (rec) {
        var slim = Object.assign({}, rec);
        delete slim.rawJson;
        return slim;
      });
    }
    _rgRecordsCache[sheetName] = cachePayload;
    try {
      putChunkedCache_(sheetName, JSON.stringify(cachePayload));
    } catch (e) {}
  }

  return records;
}

function getSettingsMap_(skipCache) {
  var rows = readAllRecords(RG_SHEETS.SETTINGS, Boolean(skipCache));
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].key) {
      map[rows[i].key] = rows[i].value;
    }
  }
  return map;
}

function findRecordById(sheetName, idField, idValue, skipCache) {
  var target = normalizeStr(idValue);
  if (!target) return null;
  var rows = readAllRecords(sheetName, Boolean(skipCache));
  for (var i = 0; i < rows.length; i++) {
    if (normalizeStr(rows[i][idField]) === target) {
      return rows[i];
    }
  }
  return null;
}

function applyTextFormatForDateColumns_(sheet, headers, startRow, numRows) {
  if (!sheet || !headers || numRows < 1) return;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (RG_DATE_ONLY_FIELDS[h] || RG_TIME_ONLY_FIELDS[h]) {
      sheet.getRange(startRow, c + 1, numRows, 1).setNumberFormat('@');
    }
  }
}

function recordToRowArray(headers, recordObj) {
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var val = recordObj[headers[i]];
    row.push(val !== undefined && val !== null ? val : '');
  }
  return row;
}

function appendRecord(sheetName, recordObj) {
  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var headers = getEffectiveHeaders(sheet, sheetName);
  var row = recordToRowArray(headers, recordObj);
  var nextRow = Math.max(2, sheet.getLastRow() + 1);
  applyTextFormatForDateColumns_(sheet, headers, nextRow, 1);
  sheet.getRange(nextRow, 1, 1, headers.length).setValues([row]);
  invalidateCache(sheetName);
  return recordObj;
}

function batchAppendRecords(sheetName, recordsList) {
  if (!Array.isArray(recordsList) || recordsList.length === 0) return 0;
  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var headers = getEffectiveHeaders(sheet, sheetName);
  var rows = [];
  for (var i = 0; i < recordsList.length; i++) {
    rows.push(recordToRowArray(headers, recordsList[i]));
  }
  var startRow = Math.max(2, sheet.getLastRow() + 1);
  applyTextFormatForDateColumns_(sheet, headers, startRow, rows.length);
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  invalidateCache(sheetName);
  return rows.length;
}

function updateRecordByKey(sheetName, keyField, keyValue, patchObj) {
  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var headers = getEffectiveHeaders(sheet, sheetName);
  var keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) throw new Error('حقل المفتاح غير موجود: ' + keyField);

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return null;

  var range = sheet.getRange(2, 1, lastRow - 1, headers.length);
  var values = range.getValues();
  var target = normalizeStr(keyValue);

  for (var r = 0; r < values.length; r++) {
    if (normalizeStr(values[r][keyIndex]) === target) {
      var updated = {};
      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        if (Object.prototype.hasOwnProperty.call(patchObj, h)) {
          values[r][c] = patchObj[h] !== undefined && patchObj[h] !== null ? patchObj[h] : '';
        }
        updated[h] = values[r][c] instanceof Date ? values[r][c].toISOString() : values[r][c];
      }
      sheet.getRange(r + 2, 1, 1, headers.length).setValues([values[r]]);
      invalidateCache(sheetName);
      return updated;
    }
  }
  return null;
}

function upsertRecordByKey(sheetName, keyField, keyValue, recordObj) {
  var updated = updateRecordByKey(sheetName, keyField, keyValue, recordObj);
  if (updated) return { action: 'updated', record: updated };
  appendRecord(sheetName, recordObj);
  return { action: 'inserted', record: recordObj };
}

function batchUpsertRecords(sheetName, keyField, recordsList) {
  if (!Array.isArray(recordsList) || recordsList.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var headers = getEffectiveHeaders(sheet, sheetName);
  var keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) throw new Error('حقل المفتاح غير موجود: ' + keyField);

  var lastRow = sheet.getLastRow();
  var existingValues = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, headers.length).getValues() : [];
  var rowIndexByKey = {};
  for (var r = 0; r < existingValues.length; r++) {
    var k = normalizeStr(existingValues[r][keyIndex]);
    if (k) rowIndexByKey[k] = r;
  }

  var updatedCount = 0;
  var insertedRows = [];
  var hasUpdates = false;

  for (var i = 0; i < recordsList.length; i++) {
    var rec = recordsList[i];
    var keyVal = normalizeStr(rec[keyField]);
    if (!keyVal) continue;

    if (Object.prototype.hasOwnProperty.call(rowIndexByKey, keyVal)) {
      var targetIdx = rowIndexByKey[keyVal];
      for (var c = 0; c < headers.length; c++) {
        var h = headers[c];
        if (Object.prototype.hasOwnProperty.call(rec, h)) {
          existingValues[targetIdx][c] = rec[h] !== undefined && rec[h] !== null ? rec[h] : '';
        }
      }
      hasUpdates = true;
      updatedCount++;
    } else {
      rowIndexByKey[keyVal] = existingValues.length + insertedRows.length;
      insertedRows.push(recordToRowArray(headers, rec));
    }
  }

  if (hasUpdates && existingValues.length > 0) {
    applyTextFormatForDateColumns_(sheet, headers, 2, existingValues.length);
    sheet.getRange(2, 1, existingValues.length, headers.length).setValues(existingValues);
  }
  if (insertedRows.length > 0) {
    var appendStart = existingValues.length + 2;
    applyTextFormatForDateColumns_(sheet, headers, appendStart, insertedRows.length);
    sheet.getRange(appendStart, 1, insertedRows.length, headers.length).setValues(insertedRows);
  }

  invalidateCache(sheetName);
  return {
    inserted: insertedRows.length,
    updated: updatedCount
  };
}

function deleteRecordByKey(sheetName, keyField, keyValue) {
  var ss = getSpreadsheet();
  var sheet = getSheetOrCreate(ss, sheetName);
  var headers = getEffectiveHeaders(sheet, sheetName);
  var keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) return false;

  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var target = normalizeStr(keyValue);

  for (var r = values.length - 1; r >= 0; r--) {
    if (normalizeStr(values[r][keyIndex]) === target) {
      sheet.deleteRow(r + 2);
      invalidateCache(sheetName);
      return true;
    }
  }
  return false;
}
