/**
 * RENTAL GATE CRM — Rental Gate API Integration & Batch Sync Engine
 * Token is stored strictly in Script Properties: RG_TOKEN (never exposed to clients)
 */

var RG_RESERVATIONS_API = 'https://api.rentalgate.net/api/reservations/filter';
var RG_EXTENDS_API = 'https://api.rentalgate.net/api/reservation-extends/filter';

function getRgToken() {
  var props = PropertiesService.getScriptProperties();
  return normalizeStr(props.getProperty('RG_TOKEN') || props.getProperty('RENTAL_TOKEN'));
}

function callRentalGateEndpoint(url, token, page, perPage) {
  var payload = {
    page: page || 1,
    per_page: perPage || 100
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch(url, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('خطأ من Rental Gate API (' + code + '): ' + text.substring(0, 250));
  }
  return safeJsonParse(text, {});
}

function fetchAllRentalGatePages(url, token) {
  var allItems = [];
  var page = 1;
  var pagesFetched = 0;
  var maxPages = 100;

  while (page <= maxPages) {
    var body = callRentalGateEndpoint(url, token, page, 100);
    pagesFetched++;
    var rows = [];
    var lastPage = 1;

    if (Array.isArray(body)) {
      rows = body;
      lastPage = 1;
    } else if (body && body.data) {
      if (Array.isArray(body.data)) {
        rows = body.data;
        lastPage = toNumber((body.meta && body.meta.last_page) || (body.pagination && body.pagination.last_page) || body.last_page, 1);
      } else if (Array.isArray(body.data.data)) {
        rows = body.data.data;
        lastPage = toNumber(body.data.last_page || (body.data.meta && body.data.meta.last_page) || (body.data.pagination && body.data.pagination.last_page), 1);
      }
    } else if (body && Array.isArray(body.items)) {
      rows = body.items;
      lastPage = toNumber((body.meta && body.meta.last_page) || (body.pagination && body.pagination.last_page) || body.last_page, 1);
    }

    for (var i = 0; i < rows.length; i++) {
      allItems.push(rows[i]);
    }

    if (page >= lastPage || rows.length === 0) {
      break;
    }
    page++;
  }

  return { items: allItems, pagesFetched: pagesFetched };
}

function saveApiToken(session, payload) {
  requireApiAccess(session);
  var p = payload || {};
  var raw = normalizeStr(p.token || p.rgToken || p.rentalToken).replace(/^Bearer\s+/i, '');
  if (!raw || raw.length < 16 || /\s/.test(raw)) {
    throw new Error('صيغة التوكن غير صالحة. يرجى لصق التوكن كاملاً بدون مسافات.');
  }

  PropertiesService.getScriptProperties().setProperties({
    RG_TOKEN: raw,
    RENTAL_TOKEN: raw
  });

  logActivity(
    session.user,
    'تحديث توكن API',
    'Settings',
    'RG_TOKEN',
    'تم ربط وحفظ RG_TOKEN وRENTAL_TOKEN في Script Properties'
  );

  var result = {
    saved: true,
    hasToken: true,
    hasRgToken: true
  };
  if (toBool(p.testAfterSave)) {
    result.connection = testRentalGateConnection(session);
  }
  return result;
}

function setupRentalGateTokens(token) {
  var clean = normalizeStr(token).replace(/^Bearer\s+/i, '');
  if (!clean) {
    throw new Error('يرجى تمرير التوكن للدالة setupRentalGateTokens(token).');
  }
  PropertiesService.getScriptProperties().setProperties({
    RG_TOKEN: clean,
    RENTAL_TOKEN: clean
  });
  return { saved: true, keys: ['RG_TOKEN', 'RENTAL_TOKEN'] };
}

function testRentalGateConnection(session) {
  requireApiAccess(session);
  var token = getRgToken();
  if (!token) {
    return {
      connected: false,
      hasToken: false,
      message: 'مفتاح RG_TOKEN غير مضبوط في Script Properties.'
    };
  }
  try {
    callRentalGateEndpoint(RG_RESERVATIONS_API, token, 1, 1);
    return {
      connected: true,
      hasToken: true,
      checkedAt: nowIso(),
      message: 'الاتصال بواجهة Rental Gate API ناجح ويعمل بشكل سليم.'
    };
  } catch (err) {
    return {
      connected: false,
      hasToken: true,
      checkedAt: nowIso(),
      message: err.message
    };
  }
}

function syncRentalGate(session) {
  requireApiAccess(session);
  return runRentalGateSyncInternal({
    id: session.employeeId,
    employeeId: session.employeeId,
    name: session.user.name,
    role: session.role
  });
}

function pullReservations(session) {
  requirePermission(session, 'pull_reservations');
  var syncResult = runRentalGateSyncInternal({
    id: session.employeeId,
    employeeId: session.employeeId,
    name: session.user.name,
    role: session.role
  });
  return {
    importedCount: syncResult.importedCount || 0,
    updatedCount: syncResult.updatedCount || 0,
    extensionsCount: syncResult.extensionsCount || 0,
    finishedAt: syncResult.finishedAt || nowIso()
  };
}

function runRentalGateSyncInternal(actor) {
  var token = getRgToken();
  if (!token) {
    throw new Error('لم يتم ضبط RG_TOKEN في Script Properties.');
  }

  var actorId = (actor && (actor.employeeId || actor.id)) || 'SYSTEM';
  var actorName = (actor && actor.name) || 'المزامنة التلقائية';
  var actorObj = { id: actorId, name: actorName, role: (actor && actor.role) || 'system' };

  var startedAt = nowIso();
  var startMs = Date.now();

  return withScriptLock(function () {
    var importedCount = 0;
    var updatedCount = 0;
    var extensionsCount = 0;
    var pagesFetched = 0;

    try {
      var excludedSetting = findRecordById(RG_SHEETS.SETTINGS, 'key', 'excluded_statuses');
      var excludedStatuses = safeJsonParse(excludedSetting ? excludedSetting.value : '[]', []);
      var excludedSet = {};
      for (var e = 0; e < excludedStatuses.length; e++) {
        excludedSet[normalizeStr(excludedStatuses[e]).toLowerCase()] = true;
      }

      // 1. Fetch & filter extensions (accepted & paid only), deduplicated by extensionNumber
      var extFetch = fetchAllRentalGatePages(RG_EXTENDS_API, token);
      pagesFetched += extFetch.pagesFetched;

      var existingExtensions = readAllRecords(RG_SHEETS.EXTENSIONS, true);
      var existingExtByNum = {};
      for (var exi = 0; exi < existingExtensions.length; exi++) {
        var ek = normalizeStr(existingExtensions[exi].extensionNumber);
        if (ek) existingExtByNum[ek] = existingExtensions[exi];
      }

      var extRecordsToUpsert = [];
      var extSeenMap = {};
      var extByResNumber = {};

      for (var x = 0; x < extFetch.items.length; x++) {
        var ext = extFetch.items[x];
        if (!isExtensionAcceptedAndPaid(ext)) continue;

        var extNum = normalizeStr(ext.id || ext.extension_number || ext.code);
        var resNumForExt = normalizeStr(ext.reservation_number || (ext.reservation && ext.reservation.reservation_number) || ext.reservation_id);
        if (!resNumForExt) continue;
        if (!extNum) extNum = resNumForExt + '_EXT_' + (x + 1);
        if (extSeenMap[extNum]) continue;
        extSeenMap[extNum] = true;

        var prevExt = existingExtByNum[extNum];
        var extRecord = {
          id: prevExt ? prevExt.id : generateId('EXT'),
          extensionNumber: extNum,
          reservationId: prevExt ? (prevExt.reservationId || '') : '',
          reservationNumber: resNumForExt,
          statusCode: normalizeStr(ext.status || 'accepted'),
          statusAr: translateOriginalStatus(ext.status || 'accepted'),
          paymentStatus: normalizeStr(ext.payment_status || 'paid'),
          extendDays: toNumber(ext.days || ext.extend_days, 0),
          startDate: formatDateOnly(ext.start_date || ext.from_date),
          endDate: formatDateOnly(ext.end_date || ext.to_date),
          amount: toNumber(ext.total || ext.amount || ext.price, 0),
          isAcceptedAndPaid: 'true',
          syncedAt: nowIso()
        };

        extRecordsToUpsert.push(extRecord);
        if (!extByResNumber[resNumForExt]) extByResNumber[resNumForExt] = [];
        extByResNumber[resNumForExt].push(extRecord);
      }

      // 2. Fetch reservations across pages, deduplicate by reservationNumber
      var resFetch = fetchAllRentalGatePages(RG_RESERVATIONS_API, token);
      pagesFetched += resFetch.pagesFetched;

      var existingReservations = readAllRecords(RG_SHEETS.RESERVATIONS, true);
      var existingByNumber = {};
      for (var r = 0; r < existingReservations.length; r++) {
        var rKey = normalizeStr(existingReservations[r].reservationNumber);
        if (rKey) existingByNumber[rKey] = existingReservations[r];
      }

      var resSeenMap = {};
      var resRecordsToUpsert = [];
      var nowStr = nowIso();

      for (var i = 0; i < resFetch.items.length; i++) {
        var item = resFetch.items[i];
        var resNumber = normalizeStr(item.reservation_number || item.code || item.reference || item.id);
        if (!resNumber || resSeenMap[resNumber]) continue;
        resSeenMap[resNumber] = true;

        var statusCode = normalizeStr(item.status || item.status_code).toLowerCase();
        if (excludedSet[statusCode]) continue;

        var extsForThis = extByResNumber[resNumber] || [];
        var extAmountSum = 0;
        for (var j = 0; j < extsForThis.length; j++) {
          extAmountSum += toNumber(extsForThis[j].amount, 0);
        }

        var baseAmount = toNumber(item.total_price || item.total || item.amount || item.base_amount, 0);
        var totalAmount = computeTotalAmount(baseAmount, extsForThis);
        var existing = existingByNumber[resNumber];
        var resId = existing ? existing.id : generateId('RES');

        for (var k = 0; k < extsForThis.length; k++) {
          extsForThis[k].reservationId = resId;
        }

        var customerObj = item.customer || item.user || {};
        var companyObj = item.company || item.partner || {};
        var branchObj = item.branch || item.location || {};
        var carObj = item.car || item.vehicle || {};

        // Never overwrite internal CRM statuses, priorities, assignments, or employee notes!
        var resPayload = {
          id: resId,
          reservationNumber: resNumber,
          customerName: normalizeStr(item.customer_name || customerObj.name || customerObj.full_name || 'عميل'),
          customerPhone: normalizeStr(item.customer_phone || customerObj.phone || customerObj.mobile || ''),
          companyName: normalizeStr(item.company_name || companyObj.name || ''),
          branchName: normalizeStr(item.branch_name || branchObj.name || ''),
          carName: normalizeStr(item.car_name || carObj.name || (carObj.brand ? (carObj.brand + ' ' + (carObj.model || '')) : '')),
          plateNumber: normalizeStr(item.plate_number || carObj.plate_number || ''),
          startDate: formatDateOnly(item.start_date || item.pickup_date),
          endDate: formatDateOnly(item.end_date || item.return_date),
          daysCount: toNumber(item.days_count || item.days, 1),
          originalStatusCode: statusCode,
          originalStatusAr: translateOriginalStatus(statusCode),
          pickupTypeAr: translateDeliveryType(item.pickup_type || item.delivery_type),
          returnTypeAr: translateDeliveryType(item.return_type || item.dropoff_type),
          baseAmount: baseAmount,
          extensionsAmount: Math.round(extAmountSum * 100) / 100,
          totalAmount: totalAmount,
          hasExtensions: extsForThis.length > 0 ? 'true' : 'false',
          internalStatus: existing ? existing.internalStatus : (extsForThis.length > 0 ? 'تم التمديد' : 'تم الإنشاء'),
          priority: existing ? existing.priority : 'عادي',
          assignedEmployeeIds: existing ? existing.assignedEmployeeIds : '[]',
          assignedEmployeeNames: existing ? existing.assignedEmployeeNames : '[]',
          lastUpdateText: existing ? existing.lastUpdateText : 'تم الاستيراد من Rental Gate',
          lastUpdatedById: existing ? existing.lastUpdatedById : actorId,
          lastUpdatedByName: existing ? existing.lastUpdatedByName : actorName,
          lastUpdatedAt: existing ? existing.lastUpdatedAt : nowStr,
          hasProblem: existing ? existing.hasProblem : 'false',
          createdAt: existing ? existing.createdAt : nowStr,
          updatedAt: nowStr,
          rawJson: JSON.stringify(item).substring(0, 5000)
        };

        resRecordsToUpsert.push(resPayload);
      }

      if (extRecordsToUpsert.length > 0) {
        var extResult = batchUpsertRecords(RG_SHEETS.EXTENSIONS, 'extensionNumber', extRecordsToUpsert);
        extensionsCount = extResult.inserted + extResult.updated;
      }

      if (resRecordsToUpsert.length > 0) {
        var resResult = batchUpsertRecords(RG_SHEETS.RESERVATIONS, 'reservationNumber', resRecordsToUpsert);
        importedCount = resResult.inserted;
        updatedCount = resResult.updated;
      }

      var syncRecord = {
        id: generateId('SYNC'),
        triggeredById: actorId,
        triggeredByName: actorName,
        status: 'success',
        importedCount: importedCount,
        updatedCount: updatedCount,
        extensionsCount: extensionsCount,
        pagesFetched: pagesFetched,
        errorMessage: '',
        durationMs: Date.now() - startMs,
        startedAt: startedAt,
        finishedAt: nowIso()
      };
      appendRecord(RG_SHEETS.SYNC_LOG, syncRecord);
      logActivity(actorObj, 'سحب بيانات', 'Sync', syncRecord.id,
        'استيراد ' + importedCount + '، تحديث ' + updatedCount + '، تمديدات ' + extensionsCount);

      return syncRecord;
    } catch (err) {
      var errRecord = {
        id: generateId('SYNC'),
        triggeredById: actorId,
        triggeredByName: actorName,
        status: 'error',
        importedCount: importedCount,
        updatedCount: updatedCount,
        extensionsCount: extensionsCount,
        pagesFetched: pagesFetched,
        errorMessage: err.message,
        durationMs: Date.now() - startMs,
        startedAt: startedAt,
        finishedAt: nowIso()
      };
      appendRecord(RG_SHEETS.SYNC_LOG, errRecord);
      throw err;
    }
  });
}

function getSyncStatus(session) {
  requireApiAccess(session);
  var logs = readAllRecords(RG_SHEETS.SYNC_LOG, false);
  logs.sort(function (a, b) {
    return String(b.startedAt).localeCompare(String(a.startedAt));
  });
  var map = getSettingsMap_(false);
  return {
    hasToken: Boolean(getRgToken()),
    autoSyncEnabled: map.auto_sync_enabled !== undefined ? toBool(map.auto_sync_enabled) : true,
    autoSyncIntervalHours: map.auto_sync_interval_hours ? toNumber(map.auto_sync_interval_hours, 12) : 12,
    lastSync: logs.length > 0 ? logs[0] : null,
    logs: logs.slice(0, 20)
  };
}
