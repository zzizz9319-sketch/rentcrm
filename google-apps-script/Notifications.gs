/**
 * RENTAL GATE CRM — In-App Notifications Service
 */

function createNotification(recipientEmployeeId, recipientRole, type, title, message, entityType, entityId) {
  appendRecord(RG_SHEETS.NOTIFICATIONS, {
    id: generateId('NTF'),
    recipientEmployeeId: recipientEmployeeId || '',
    recipientRole: recipientRole || '',
    type: type || 'info',
    title: title || '',
    message: message || '',
    entityType: entityType || '',
    entityId: entityId || '',
    isRead: 'false',
    createdAt: nowIso()
  });
}

function getNotifications(session) {
  var all = readAllRecords(RG_SHEETS.NOTIFICATIONS, false);
  var mine = all.filter(function (n) {
    return n.recipientEmployeeId === session.employeeId ||
      (!n.recipientEmployeeId && n.recipientRole === session.role);
  });

  mine.sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  var unreadCount = 0;
  var items = mine.slice(0, 50).map(function (n) {
    var read = toBool(n.isRead);
    if (!read) unreadCount++;
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      entityType: n.entityType,
      entityId: n.entityId,
      isRead: read,
      createdAt: n.createdAt
    };
  });

  return { items: items, unreadCount: unreadCount };
}

function markNotificationRead(session, payload) {
  return withScriptLock(function () {
    var all = readAllRecords(RG_SHEETS.NOTIFICATIONS, true);
    var p = payload || {};
    var targetId = normalizeStr(p.notificationId);
    var markAll = toBool(p.markAll);

    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var isMine = n.recipientEmployeeId === session.employeeId ||
        (!n.recipientEmployeeId && n.recipientRole === session.role);
      if (!isMine) continue;
      if (markAll || n.id === targetId) {
        updateRecordByKey(RG_SHEETS.NOTIFICATIONS, 'id', n.id, { isRead: 'true' });
      }
    }
    return { updated: true };
  });
}
