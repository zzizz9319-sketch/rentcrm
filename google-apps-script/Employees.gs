/**
 * RENTAL GATE CRM — Employees Management (Synced with Users Sheet)
 */

function getEmployees(session) {
  var employees = readAllRecords(RG_SHEETS.EMPLOYEES, true);
  var reservations = readAllRecords(RG_SHEETS.RESERVATIONS, false);
  var followUps = readAllRecords(RG_SHEETS.FOLLOWUPS, false);
  var problems = readAllRecords(RG_SHEETS.PROBLEMS, false);

  var resCounts = {};
  for (var r = 0; r < reservations.length; r++) {
    var ids = safeJsonParse(reservations[r].assignedEmployeeIds, []);
    for (var j = 0; j < ids.length; j++) {
      resCounts[ids[j]] = (resCounts[ids[j]] || 0) + 1;
    }
  }

  var fuCounts = {};
  for (var f = 0; f < followUps.length; f++) {
    var eid = followUps[f].employeeId;
    fuCounts[eid] = (fuCounts[eid] || 0) + 1;
  }

  var prbCounts = {};
  for (var p = 0; p < problems.length; p++) {
    var pids = safeJsonParse(problems[p].assignedEmployeeIds, []);
    for (var k = 0; k < pids.length; k++) {
      prbCounts[pids[k]] = (prbCounts[pids[k]] || 0) + 1;
    }
  }

  var list = [];
  for (var i = 0; i < employees.length; i++) {
    var clean = sanitizeEmployeeForClient(employees[i]);
    clean.reservationsCount = resCounts[clean.id] || 0;
    clean.followUpsCount = fuCounts[clean.id] || 0;
    clean.problemsCount = prbCounts[clean.id] || 0;
    list.push(clean);
  }

  return {
    items: list,
    total: list.length,
    rolePresets: readRolePresetsSetting(),
    customPermissions: readCustomPermissionsSetting()
  };
}

function getEmployeeDetails(session, params) {
  var pa = params || {};
  var employeeId = normalizeStr(pa.employeeId) || session.employeeId;
  if (employeeId !== session.employeeId && !hasPermission(session, 'view_employees')) {
    throw new Error('FORBIDDEN: لا يمكنك استعراض ملف موظف آخر.');
  }

  var employee = findRecordById(RG_SHEETS.EMPLOYEES, 'id', employeeId);
  if (!employee) throw new Error('لم يتم العثور على الموظف المطلوب.');

  var reservations = readAllRecords(RG_SHEETS.RESERVATIONS, false);
  var followUps = readAllRecords(RG_SHEETS.FOLLOWUPS, true);
  var problems = readAllRecords(RG_SHEETS.PROBLEMS, true);

  var empFollowUps = followUps.filter(function (f) {
    return f.employeeId === employeeId;
  }).sort(function (a, b) {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });

  var touchedResIds = {};
  var fuByRes = {};
  for (var f = 0; f < followUps.length; f++) {
    var fu = followUps[f];
    if (!fuByRes[fu.reservationId]) fuByRes[fu.reservationId] = [];
    fuByRes[fu.reservationId].push(fu);
    if (fu.employeeId === employeeId) touchedResIds[fu.reservationId] = true;
  }

  var prbByRes = {};
  var empProblems = [];
  for (var p = 0; p < problems.length; p++) {
    var pr = problems[p];
    if (!prbByRes[pr.reservationId]) prbByRes[pr.reservationId] = [];
    prbByRes[pr.reservationId].push(pr);
    var pids = safeJsonParse(pr.assignedEmployeeIds, []);
    if (pr.createdById === employeeId || pids.indexOf(employeeId) !== -1) {
      empProblems.push(pr);
    }
  }

  var statusCounts = {};
  var customerSet = {};
  var empReservations = [];

  for (var r = 0; r < reservations.length; r++) {
    var res = reservations[r];
    var assignedIds = safeJsonParse(res.assignedEmployeeIds, []);
    if (assignedIds.indexOf(employeeId) === -1 && !touchedResIds[res.id]) continue;

    customerSet[normalizeStr(res.customerPhone || res.customerName)] = true;
    var st = res.internalStatus || 'تم الإنشاء';
    statusCounts[st] = (statusCounts[st] || 0) + 1;

    var resFus = (fuByRes[res.id] || []).slice().sort(function (a, b) {
      return String(b.createdAt).localeCompare(String(a.createdAt));
    });
    var myResFus = resFus.filter(function (x) { return x.employeeId === employeeId; });

    empReservations.push({
      id: res.id,
      reservationNumber: res.reservationNumber,
      customerName: res.customerName,
      customerPhone: res.customerPhone,
      companyName: res.companyName,
      branchName: res.branchName,
      carName: res.carName,
      startDate: res.startDate,
      endDate: res.endDate,
      daysCount: toNumber(res.daysCount, 1),
      totalAmount: toNumber(res.totalAmount, 0),
      originalStatusAr: res.originalStatusAr,
      internalStatus: res.internalStatus,
      priority: res.priority,
      hasProblem: toBool(res.hasProblem),
      lastUpdateText: res.lastUpdateText,
      lastUpdatedByName: res.lastUpdatedByName,
      lastUpdatedAt: res.lastUpdatedAt,
      followUpsCount: resFus.length,
      myFollowUpsCount: myResFus.length,
      problemsCount: (prbByRes[res.id] || []).length,
      latestFollowUp: resFus.length > 0 ? resFus[0] : null
    });
  }

  empReservations.sort(function (a, b) {
    return String(b.lastUpdatedAt).localeCompare(String(a.lastUpdatedAt));
  });

  return {
    employee: sanitizeEmployeeForClient(employee),
    assignedReservations: empReservations,
    followUps: empFollowUps,
    problems: empProblems,
    stats: {
      uniqueCustomersCount: Object.keys(customerSet).length,
      reservationsCount: empReservations.length,
      followUpsCount: empFollowUps.length,
      problemsCount: empProblems.length,
      statusCounts: statusCounts
    }
  };
}

function createEmployee(session, payload) {
  requirePermission(session, 'manage_employees');

  var p = payload || {};
  var name = normalizeStr(p.name);
  var username = normalizeStr(p.username).toLowerCase();
  var password = String(p.password || '');
  var phone = normalizeStr(p.phone);
  var email = normalizeStr(p.email);
  var jobTitle = normalizeStr(p.jobTitle) || 'موظف خدمة العملاء';
  var role = normalizeStr(p.role) || RG_ROLES.AGENT;

  if (!name || !username || !password) {
    throw new Error('الاسم واسم المستخدم وكلمة المرور حقول إلزامية.');
  }
  if (password.length < 6) {
    throw new Error('كلمة المرور يجب أن لا تقل عن 6 أحرف.');
  }
  if ([RG_ROLES.GENERAL_MANAGER, RG_ROLES.SUPERVISOR, RG_ROLES.AGENT].indexOf(role) === -1) {
    throw new Error('الدور الوظيفي غير صالح.');
  }

  return withScriptLock(function () {
    var existing = readAllRecords(RG_SHEETS.EMPLOYEES, true);
    for (var i = 0; i < existing.length; i++) {
      if (normalizeStr(existing[i].username).toLowerCase() === username) {
        throw new Error('اسم المستخدم مستخدم مسبقًا.');
      }
    }

    var salt = generateId('SALT');
    var now = nowIso();
    var emp = {
      id: generateId('EMP'),
      name: name,
      username: username,
      passwordHash: hashPassword(password, salt),
      salt: salt,
      phone: phone,
      email: email,
      jobTitle: jobTitle,
      role: role,
      permissions: JSON.stringify(Array.isArray(p.permissions) && p.permissions.length ? p.permissions : resolveEffectivePermissions(role)),
      status: 'active',
      lastActivity: '',
      createdAt: now,
      updatedAt: now
    };

    appendRecord(RG_SHEETS.EMPLOYEES, emp);
    syncUserSheetRecord(emp);
    logActivity(session.user, 'إنشاء موظف', 'Employee', emp.id, 'إنشاء حساب للموظف: ' + emp.name + ' (' + emp.role + ')');
    return sanitizeEmployeeForClient(emp);
  });
}

function updateEmployee(session, payload) {
  requirePermission(session, 'manage_employees');

  var p = payload || {};
  var employeeId = normalizeStr(p.employeeId);
  if (!employeeId) throw new Error('معرف الموظف مطلوب.');

  return withScriptLock(function () {
    var existing = findRecordById(RG_SHEETS.EMPLOYEES, 'id', employeeId);
    if (!existing) throw new Error('الموظف غير موجود.');

    var patch = { updatedAt: nowIso() };
    if (p.name) patch.name = normalizeStr(p.name);
    if (p.phone !== undefined) patch.phone = normalizeStr(p.phone);
    if (p.email !== undefined) patch.email = normalizeStr(p.email);
    if (p.jobTitle) patch.jobTitle = normalizeStr(p.jobTitle);
    if (p.role && [RG_ROLES.GENERAL_MANAGER, RG_ROLES.SUPERVISOR, RG_ROLES.AGENT].indexOf(p.role) !== -1) {
      patch.role = p.role;
    }
    if (Array.isArray(p.permissions)) {
      patch.permissions = JSON.stringify(p.permissions);
    }
    if (p.status && (p.status === 'active' || p.status === 'disabled')) {
      patch.status = p.status;
      if (p.status === 'disabled') {
        revokeEmployeeSessions(employeeId);
      }
    }
    if (p.newPassword && String(p.newPassword).length >= 6) {
      var newSalt = generateId('SALT');
      patch.salt = newSalt;
      patch.passwordHash = hashPassword(String(p.newPassword), newSalt);
      revokeEmployeeSessions(employeeId);
    }

    var updated = updateRecordByKey(RG_SHEETS.EMPLOYEES, 'id', employeeId, patch);
    if (updated) syncUserSheetRecord(updated);
    logActivity(session.user, 'تحديث موظف', 'Employee', employeeId, 'تحديث بيانات/صلاحيات الموظف ' + (patch.name || existing.name));
    return sanitizeEmployeeForClient(updated);
  });
}

function disableEmployee(session, payload) {
  requirePermission(session, 'manage_employees');

  var p = payload || {};
  var employeeId = normalizeStr(p.employeeId);
  if (!employeeId) throw new Error('معرف الموظف مطلوب.');
  if (employeeId === session.employeeId) {
    throw new Error('لا يمكنك إيقاف حسابك الشخصي أثناء تسجيل الدخول.');
  }

  return withScriptLock(function () {
    var existing = findRecordById(RG_SHEETS.EMPLOYEES, 'id', employeeId);
    if (!existing) throw new Error('الموظف غير موجود.');

    var nextStatus = normalizeStr(p.status) === 'active' ? 'active' : 'disabled';
    var updated = updateRecordByKey(RG_SHEETS.EMPLOYEES, 'id', employeeId, {
      status: nextStatus,
      updatedAt: nowIso()
    });
    if (updated) syncUserSheetRecord(updated);
    if (nextStatus === 'disabled') {
      revokeEmployeeSessions(employeeId);
    }
    logActivity(session.user, nextStatus === 'disabled' ? 'إيقاف حساب موظف' : 'تفعيل حساب موظف', 'Employee', employeeId, existing.name);
    return sanitizeEmployeeForClient(updated);
  });
}
