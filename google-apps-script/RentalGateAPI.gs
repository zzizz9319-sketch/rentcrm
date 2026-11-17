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

function callRentalGateEndpoint(url, token, pageZeroBased, size) {
  var pageNum = pageZeroBased !== undefined && pageZeroBased !== null ? Math.max(0, Number(pageZeroBased) || 0) : 0;
  var pageSize = size ? Math.max(1, Number(size) || 100) : 100;
  var sep = url.indexOf('?') === -1 ? '?' : '&';
  var fullUrl = url + sep + 'page=' + encodeURIComponent(pageNum) + '&size=' + encodeURIComponent(pageSize);

  var options = {
    method: 'get',
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  };

  var res = UrlFetchApp.fetch(fullUrl, options);
  var code = res.getResponseCode();
  var text = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('خطأ من Rental Gate API (' + code + '): ' + text.substring(0, 250));
  }
  return safeJsonParse(text, {});
}

function fetchAllRentalGatePages(url, token) {
  var allItems = [];
  var page = 0;
  var pagesFetched = 0;
  var maxPages = 100;
  var pageSize = 100;

  while (page < maxPages) {
    var body = callRentalGateEndpoint(url, token, page, pageSize);
    pagesFetched++;
    var rows = [];
    var totalPages = 1;
    var isLast = false;

    if (Array.isArray(body)) {
      rows = body;
      isLast = true;
    } else if (body && Array.isArray(body.content)) {
      rows = body.content;
      totalPages = toNumber(body.totalPages, 1);
      isLast = body.last === true || (page + 1) >= totalPages;
    } else if (body && body.data) {
      if (Array.isArray(body.data)) {
        rows = body.data;
        totalPages = toNumber((body.meta && body.meta.last_page) || (body.pagination && body.pagination.last_page) || body.last_page, 1);
        isLast = (page + 1) >= totalPages;
      } else if (Array.isArray(body.data.content)) {
        rows = body.data.content;
        totalPages = toNumber(body.data.totalPages, 1);
        isLast = body.data.last === true || (page + 1) >= totalPages;
      } else if (Array.isArray(body.data.data)) {
        rows = body.data.data;
        totalPages = toNumber(body.data.last_page || (body.data.meta && body.data.meta.last_page) || (body.data.pagination && body.data.pagination.last_page), 1);
        isLast = (page + 1) >= totalPages;
      }
    } else if (body && Array.isArray(body.items)) {
      rows = body.items;
      totalPages = toNumber((body.meta && body.meta.last_page) || (body.pagination && body.pagination.last_page) || body.last_page, 1);
      isLast = (page + 1) >= totalPages;
    }

    for (var i = 0; i < rows.length; i++) {
      allItems.push(rows[i]);
    }

    if (isLast || rows.length === 0) {
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
    callRentalGateEndpoint(RG_RESERVATIONS_API, token, 0, 1);
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
      var extByResId = {};

      for (var x = 0; x < extFetch.items.length; x++) {
        var ext = extFetch.items[x];
        if (!isExtensionAcceptedAndPaid(ext)) continue;

        var extNum = normalizeStr(ext.extendId || ext.id || ext.extension_number || ext.code);
        var resIdForExt = normalizeStr(ext.reservationId || ext.reservation_id || (ext.reservation && ext.reservation.id));
        var resNumForExt = normalizeStr(ext.reservationNumber || ext.reservation_number || (ext.reservation && ext.reservation.reservation_number) || resIdForExt);
        if (!resNumForExt && !resIdForExt) continue;
        if (!extNum) extNum = (resNumForExt || resIdForExt) + '_EXT_' + (x + 1);
        if (extSeenMap[extNum]) continue;
        extSeenMap[extNum] = true;

        var prevExt = existingExtByNum[extNum];
        var extStatusRaw = normalizeStr(ext.reservationStatus || ext.status || 'paid');
        var extPayRaw = normalizeStr(ext.payment_status || ext.paymentStatus || ext.paymentResult || (ext.paymentDate ? 'paid' : ext.paymentType) || 'paid');
        var extRecord = {
          id: prevExt ? prevExt.id : generateId('EXT'),
          extensionNumber: extNum,
          reservationId: prevExt && prevExt.reservationId ? prevExt.reservationId : resIdForExt,
          reservationNumber: resNumForExt || resIdForExt,
          statusCode: extStatusRaw,
          statusAr: translateOriginalStatus(extStatusRaw),
          paymentStatus: extPayRaw,
          extendDays: toNumber(ext.days || ext.extend_days, 0),
          startDate: formatDateOnly(ext.extendDate || ext.startDate || ext.start_date || ext.from_date || ext.createdAt),
          endDate: formatDateOnly(ext.endDate || ext.end_date || ext.to_date),
          amount: toNumber(ext.total || ext.amount || ext.price, 0),
          isAcceptedAndPaid: 'true',
          syncedAt: nowIso()
        };

        extRecordsToUpsert.push(extRecord);
        if (resNumForExt) {
          if (!extByResNumber[resNumForExt]) extByResNumber[resNumForExt] = [];
          extByResNumber[resNumForExt].push(extRecord);
        }
        if (resIdForExt) {
          if (!extByResId[resIdForExt]) extByResId[resIdForExt] = [];
          extByResId[resIdForExt].push(extRecord);
        }
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
        var resApiId = normalizeStr(item.reservationId || item.id);
        var resNumber = normalizeStr(item.reservationNumber || item.reservation_number || item.code || item.reference || resApiId);
        if (!resNumber || resSeenMap[resNumber]) continue;
        resSeenMap[resNumber] = true;

        var statusCode = normalizeStr(item.reservationStatus || item.status || item.status_code).toLowerCase();
        if (excludedSet[statusCode]) continue;

        var combinedExts = [];
        var extSeenForRes = {};
        var byNumList = extByResNumber[resNumber] || [];
        var byIdList = resApiId ? (extByResId[resApiId] || []) : [];
        var mergedLists = byNumList.concat(byIdList);
        for (var m = 0; m < mergedLists.length; m++) {
          var candExt = mergedLists[m];
          if (!extSeenForRes[candExt.extensionNumber]) {
            extSeenForRes[candExt.extensionNumber] = true;
            combinedExts.push(candExt);
          }
        }

        var extAmountSum = 0;
        for (var j = 0; j < combinedExts.length; j++) {
          extAmountSum += toNumber(combinedExts[j].amount, 0);
        }
        if (combinedExts.length === 0 && toBool(item.extended) && toNumber(item.extensionsTotal, 0) > 0) {
          extAmountSum = toNumber(item.extensionsTotal, 0);
        }

        var baseAmount = toNumber(item.total || item.total_price || item.amount || item.base_amount, 0);
        var totalAmount = combinedExts.length > 0
          ? computeTotalAmount(baseAmount, combinedExts)
          : Math.round((baseAmount + extAmountSum) * 100) / 100;
        var existing = existingByNumber[resNumber];
        var resId = existing ? existing.id : generateId('RES');

        for (var k = 0; k < combinedExts.length; k++) {
          combinedExts[k].reservationId = resId;
        }

        var customerObj = item.customer || item.user || {};
        var companyObj = item.company || item.partner || {};
        var branchObj = item.branch || item.location || {};
        var carObj = item.car || item.vehicle || {};

        // Never overwrite internal CRM statuses, priorities, assignments, or employee notes!
        var resPayload = {
          id: resId,
          reservationNumber: resNumber,
          customerName: normalizeStr(item.clientName || item.customer_name || customerObj.name || customerObj.full_name || 'عميل'),
          customerPhone: normalizeStr(item.clientMobile || item.customer_phone || customerObj.phone || customerObj.mobile || ''),
          companyName: normalizeStr(item.companyArName || item.companyEnName || item.company_name || companyObj.name || ''),
          branchName: normalizeStr(item.receiveBranchArName || item.receiveBranchEnName || item.branch_name || branchObj.name || ''),
          carName: normalizeStr(item.carNameAr || item.carNameEn || item.car_name || carObj.name || (carObj.brand ? (carObj.brand + ' ' + (carObj.model || '')) : '')),
          plateNumber: normalizeStr(item.plate_number || item.plateNumber || carObj.plate_number || ''),
          startDate: formatDateOnly(item.startDate || item.start_date || item.pickup_date),
          endDate: formatDateOnly(item.actualEndDate || item.endDate || item.end_date || item.return_date),
          daysCount: toNumber(item.reservationDays || item.days_count || item.days, 1),
          originalStatusCode: statusCode,
          originalStatusAr: translateOriginalStatus(statusCode),
          pickupTypeAr: translateDeliveryType(item.receiveType || item.pickup_type || item.delivery_type),
          returnTypeAr: translateDeliveryType(item.deliverType || item.return_type || item.dropoff_type),
          baseAmount: baseAmount,
          extensionsAmount: Math.round(extAmountSum * 100) / 100,
          totalAmount: totalAmount,
          hasExtensions: (combinedExts.length > 0 || toBool(item.extended)) ? 'true' : 'false',
          internalStatus: existing ? existing.internalStatus : ((combinedExts.length > 0 || toBool(item.extended)) ? 'تم التمديد' : 'تم الإنشاء'),
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
