/**
 * RENTAL GATE CRM — Audit Logging Service
 */

function logActivity(user, actionType, entityType, entityId, details) {
  var now = new Date();
  appendRecord(RG_SHEETS.ACTIVITY_LOG, {
    id: generateId('ACT'),
    userId: user ? user.id : 'system',
    userName: user ? user.name : 'النظام',
    userRole: user ? user.role : 'system',
    actionType: actionType || '',
    entityType: entityType || '',
    entityId: entityId || '',
    details: details || '',
    logDate: formatDateOnly(now),
    logTime: formatTimeOnly(now),
    createdAt: now.toISOString()
  });
}

function getActivityLogs(session, params) {
  var logs = readAllRecords(RG_SHEETS.ACTIVITY_LOG, false);
  var p = params || {};
  var userId = normalizeStr(p.userId);
  var actionType = normalizeStr(p.actionType);
  var date = normalizeStr(p.date);

  var filtered = logs.filter(function (l) {
    if (!hasPermission(session, 'view_all_logs') && l.userId !== session.employeeId) {
      return false;
    }
    if (userId && l.userId !== userId) return false;
    if (actionType && l.actionType !== actionType) return false;
    if (date && l.logDate !== date) return false;
    return true;
  });

  filtered.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  return { items: filtered.slice(0, 300), total: filtered.length };
}
