/**
 * RENTAL GATE CRM — Reports Filtering & Analytical Datasets
 */

function getReports(session, params) {
  var p = params || {};
  var reportType = normalizeStr(p.reportType) || 'all_reservations';
  var dateFrom = normalizeStr(p.dateFrom);
  var dateTo = normalizeStr(p.dateTo);
  var employeeId = normalizeStr(p.employeeId);
  var status = normalizeStr(p.status);
  var company = normalizeStr(p.company);
  var branch = normalizeStr(p.branch);
  var priority = normalizeStr(p.priority);

  var reservations = readAllRecords(RG_SHEETS.RESERVATIONS, false);
  var followUps = readAllRecords(RG_SHEETS.FOLLOWUPS, false);
  var problems = readAllRecords(RG_SHEETS.PROBLEMS, false);
  var extensions = readAllRecords(RG_SHEETS.EXTENSIONS, false);
  var employees = readAllRecords(RG_SHEETS.EMPLOYEES, false);

  var followedSet = {};
  for (var f = 0; f < followUps.length; f++) followedSet[followUps[f].reservationId] = true;

  var companiesMap = {};
  var branchesMap = {};
  var filteredRes = reservations.filter(function (r) {
    if (r.companyName) companiesMap[r.companyName] = true;
    if (r.branchName) branchesMap[r.branchName] = true;
    if (dateFrom && r.startDate < dateFrom) return false;
    if (dateTo && r.startDate > dateTo) return false;
    if (company && r.companyName !== company) return false;
    if (branch && r.branchName !== branch) return false;
    if (status && r.internalStatus !== status) return false;
    if (priority && r.priority !== priority) return false;
    if (employeeId) {
      var ids = safeJsonParse(r.assignedEmployeeIds, []);
      if (ids.indexOf(employeeId) === -1) return false;
    }
    return true;
  });

  var facets = {
    companies: Object.keys(companiesMap).sort(),
    branches: Object.keys(branchesMap).sort()
  };

  if (toBool(p.logExport)) {
    logActivity(session.user, 'تصدير تقرير', 'Report', reportType, 'تصدير تقرير: ' + reportType);
  }

  if (reportType === 'followups_log') {
    var fuRows = followUps.filter(function (x) {
      if (dateFrom && x.followUpDate < dateFrom) return false;
      if (dateTo && x.followUpDate > dateTo) return false;
      if (employeeId && x.employeeId !== employeeId) return false;
      if (status && x.status !== status) return false;
      return true;
    });
    return { reportType: reportType, rows: fuRows, facets: facets };
  }

  if (reportType === 'problems') {
    var prRows = problems.map(formatProblemForClient).filter(function (pr) {
      if (priority && pr.priority !== priority) return false;
      if (status && pr.status !== status) return false;
      if (employeeId && pr.assignedEmployeeIds.indexOf(employeeId) === -1) return false;
      return true;
    });
    return { reportType: reportType, rows: prRows, facets: facets };
  }

  if (reportType === 'extensions') {
    return { reportType: reportType, rows: extensions, facets: facets };
  }

  if (reportType === 'unfollowed') {
    return {
      reportType: reportType,
      rows: filteredRes.filter(function (r) { return !followedSet[r.id]; }),
      facets: facets
    };
  }

  if (reportType === 'employee_performance') {
    var perf = employees.map(function (emp) {
      var empFus = followUps.filter(function (x) { return x.employeeId === emp.id; });
      var empRes = reservations.filter(function (r) {
        return safeJsonParse(r.assignedEmployeeIds, []).indexOf(emp.id) !== -1;
      });
      var empPrb = problems.filter(function (pr) {
        return safeJsonParse(pr.assignedEmployeeIds, []).indexOf(emp.id) !== -1;
      });
      return {
        employeeName: emp.name,
        jobTitle: emp.jobTitle,
        role: emp.role,
        assignedReservations: empRes.length,
        followUpsCount: empFus.length,
        problemsCount: empPrb.length,
        lastActivity: emp.lastActivity
      };
    });
    return { reportType: reportType, rows: perf, facets: facets };
  }

  if (reportType === 'sync_log') {
    var syncRows = readAllRecords(RG_SHEETS.SYNC_LOG, false);
    syncRows.sort(function (a, b) {
      return String(b.startedAt).localeCompare(String(a.startedAt));
    });
    return { reportType: reportType, rows: syncRows, facets: facets };
  }

  if (reportType === 'activity_log') {
    var logRes = getActivityLogs(session, { userId: employeeId, date: dateFrom });
    return { reportType: reportType, rows: logRes.items, facets: facets };
  }

  return { reportType: reportType, rows: filteredRes, facets: facets };
}
