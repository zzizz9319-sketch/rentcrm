/**
 * RENTAL GATE CRM — Dashboard KPIs & Charts Aggregation
 */

function resolveDateRange(rangeKey, customFrom, customTo) {
  var today = new Date();
  var end = formatDateOnly(today);
  var start = '';

  if (rangeKey === 'today') {
    start = end;
  } else if (rangeKey === '7d') {
    start = formatDateOnly(new Date(today.getTime() - 6 * 86400000));
  } else if (rangeKey === '30d') {
    start = formatDateOnly(new Date(today.getTime() - 29 * 86400000));
  } else if (rangeKey === 'month') {
    start = end.substring(0, 7) + '-01';
  } else if (rangeKey === 'custom') {
    start = normalizeStr(customFrom);
    end = normalizeStr(customTo) || end;
  }
  return { start: start, end: end };
}

function getDashboard(session, params) {
  var p = params || {};
  var range = resolveDateRange(normalizeStr(p.range) || '30d', p.dateFrom, p.dateTo);
  var todayStr = formatDateOnly(new Date());

  var reservations = readAllRecords(RG_SHEETS.RESERVATIONS, false);
  var followUps = readAllRecords(RG_SHEETS.FOLLOWUPS, false);
  var problems = readAllRecords(RG_SHEETS.PROBLEMS, false);
  var employees = readAllRecords(RG_SHEETS.EMPLOYEES, false);

  var filteredRes = reservations.filter(function (r) {
    var d = formatDateOnly(r.startDate || r.createdAt);
    if (range.start && d < range.start) return false;
    if (range.end && d > range.end) return false;
    return true;
  });

  var statusCounts = {
    'تم الحجز': 0,
    'تم التسليم': 0,
    'تم الاستلام': 0,
    'تم الإنشاء': 0,
    'تم الإلغاء': 0,
    'تم التمديد': 0,
    'لم يتم الحجز': 0
  };

  var companyCounts = {};
  var todayReservations = 0;
  var newReservations = 0;

  for (var i = 0; i < filteredRes.length; i++) {
    var res = filteredRes[i];
    var st = res.internalStatus || 'تم الإنشاء';
    if (Object.prototype.hasOwnProperty.call(statusCounts, st)) {
      statusCounts[st]++;
    }
    if (formatDateOnly(res.createdAt) === todayStr || formatDateOnly(res.startDate) === todayStr) {
      todayReservations++;
    }
    if (st === 'تم الإنشاء') newReservations++;
    var comp = res.companyName || 'غير محدد';
    companyCounts[comp] = (companyCounts[comp] || 0) + 1;
  }

  var todayFollowUps = 0;
  var dailyFollowUps = {};
  var empFollowUpCounts = {};

  for (var f = 0; f < followUps.length; f++) {
    var fu = followUps[f];
    if (fu.followUpDate === todayStr) todayFollowUps++;
    if (range.start && fu.followUpDate < range.start) continue;
    if (range.end && fu.followUpDate > range.end) continue;
    dailyFollowUps[fu.followUpDate] = (dailyFollowUps[fu.followUpDate] || 0) + 1;
    empFollowUpCounts[fu.employeeName] = (empFollowUpCounts[fu.employeeName] || 0) + 1;
  }

  var openProblems = 0;
  var closedProblems = 0;
  var highProblems = 0;
  var problemPriorities = { 'عادي': 0, 'متوسط': 0, 'مرتفع': 0 };

  for (var prIdx = 0; prIdx < problems.length; prIdx++) {
    var pr = problems[prIdx];
    var isClosed = pr.status === 'مغلقة' || pr.status === 'تم الحل';
    if (isClosed) closedProblems++;
    else openProblems++;
    if (pr.priority === 'مرتفع' && !isClosed) highProblems++;
    if (Object.prototype.hasOwnProperty.call(problemPriorities, pr.priority)) {
      problemPriorities[pr.priority]++;
    }
  }

  var empActivityComparison = [];
  for (var e = 0; e < employees.length; e++) {
    var emp = employees[e];
    if (emp.status !== 'active') continue;
    var assignedTotal = 0;
    for (var r2 = 0; r2 < filteredRes.length; r2++) {
      var aIds = safeJsonParse(filteredRes[r2].assignedEmployeeIds, []);
      if (aIds.indexOf(emp.id) !== -1) assignedTotal++;
    }
    empActivityComparison.push({
      name: emp.name,
      followUps: empFollowUpCounts[emp.name] || 0,
      assigned: assignedTotal
    });
  }

  return {
    kpis: {
      totalReservations: filteredRes.length,
      todayReservations: todayReservations,
      newReservations: newReservations,
      booked: statusCounts['تم الحجز'],
      delivered: statusCounts['تم التسليم'],
      received: statusCounts['تم الاستلام'],
      created: statusCounts['تم الإنشاء'],
      cancelled: statusCounts['تم الإلغاء'],
      extended: statusCounts['تم التمديد'],
      notBooked: statusCounts['لم يتم الحجز'],
      openProblems: openProblems,
      highProblems: highProblems,
      todayFollowUps: todayFollowUps
    },
    charts: {
      statusDistribution: statusCounts,
      employeePerformance: empFollowUpCounts,
      dailyFollowUps: dailyFollowUps,
      problemsByPriority: problemPriorities,
      problemsOpenVsClosed: { open: openProblems, closed: closedProblems },
      reservationsByCompany: companyCounts,
      employeeComparison: empActivityComparison
    }
  };
}

function getAppBootstrap(session, params) {
  return {
    user: session.user,
    dashboard: getDashboard(session, params || { range: '30d' }),
    notifications: getNotifications(session),
    employees: getEmployees(session)
  };
}

