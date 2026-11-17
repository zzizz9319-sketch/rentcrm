/**
 * RENTAL GATE CRM — Scheduled Triggers Service
 */

function configureAutoSyncTrigger(hours, enabled) {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'scheduledAutoSync') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  if (!enabled) return { enabled: false, intervalHours: hours };

  var h = Math.max(1, Math.min(168, Math.round(toNumber(hours, 12))));
  var builder = ScriptApp.newTrigger('scheduledAutoSync').timeBased();
  if ([1, 2, 4, 6, 8, 12].indexOf(h) !== -1) {
    builder.everyHours(h).create();
  } else if (h >= 24 && h % 24 === 0) {
    builder.everyDays(Math.round(h / 24)).create();
  } else {
    // Apps Script everyHours only accepts 1, 2, 4, 6, 8, 12; hourly trigger checks elapsed interval
    builder.everyHours(1).create();
  }
  return { enabled: true, intervalHours: h };
}

function scheduledAutoSync() {
  var enabledRec = findRecordById(RG_SHEETS.SETTINGS, 'key', 'auto_sync_enabled');
  var enabled = enabledRec ? toBool(enabledRec.value) : true;
  if (!enabled) return;

  var intervalRec = findRecordById(RG_SHEETS.SETTINGS, 'key', 'auto_sync_interval_hours');
  var intervalHours = intervalRec ? Math.max(1, Math.min(168, toNumber(intervalRec.value, 12))) : 12;

  var logs = readAllRecords(RG_SHEETS.SYNC_LOG, true);
  if (logs.length > 0) {
    logs.sort(function (a, b) {
      return String(b.finishedAt || b.startedAt).localeCompare(String(a.finishedAt || a.startedAt));
    });
    var lastTime = new Date(logs[0].finishedAt || logs[0].startedAt).getTime();
    if (!isNaN(lastTime)) {
      var elapsedHours = (Date.now() - lastTime) / 3600000;
      if (elapsedHours < (intervalHours - 0.1)) {
        return;
      }
    }
  }

  runRentalGateSyncInternal({
    id: 'SYSTEM',
    employeeId: 'SYSTEM',
    name: 'المزامنة التلقائية (كل ' + intervalHours + ' ساعة)',
    role: 'system'
  });
}

function getTriggerStatus(session) {
  requireApiAccess(session);
  var triggers = ScriptApp.getProjectTriggers();
  var active = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'scheduledAutoSync') {
      active.push({
        id: triggers[i].getUniqueId(),
        handler: triggers[i].getHandlerFunction(),
        eventType: String(triggers[i].getEventType())
      });
    }
  }
  return { count: active.length, triggers: active };
}
