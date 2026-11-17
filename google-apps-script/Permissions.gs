/**
 * RENTAL GATE CRM — Role-Based Access Control (RBAC), Presets & Permissions Catalog
 */

var RG_ROLE_PERMISSIONS = {
  general_manager: [
    'view_dashboard', 'view_all_reservations', 'pull_reservations', 'assign_employees', 'add_followup',
    'claim_reservation', 'unclaim_reservation', 'quick_update_status',
    'edit_any_followup', 'edit_reservation_details', 'edit_ticket_details',
    'create_problem', 'update_problem', 'view_employees', 'manage_employees',
    'view_all_logs', 'sync_data', 'manage_settings', 'export_reports'
  ],
  supervisor: [
    'view_dashboard', 'view_all_reservations', 'pull_reservations', 'assign_employees', 'add_followup',
    'claim_reservation', 'unclaim_reservation', 'quick_update_status',
    'edit_any_followup', 'edit_reservation_details', 'edit_ticket_details',
    'create_problem', 'update_problem', 'view_employees', 'view_all_logs',
    'sync_data', 'export_reports'
  ],
  agent: [
    'view_dashboard', 'pull_reservations', 'add_followup', 'claim_reservation', 'unclaim_reservation',
    'quick_update_status', 'create_problem', 'update_problem', 'export_reports'
  ]
};

var RG_BUILTIN_PERMISSIONS_CATALOG = [
  { key: 'view_dashboard', label: 'عرض لوحة التحكم', group: 'عام' },
  { key: 'view_all_reservations', label: 'عرض جميع الحجوزات', group: 'الحجوزات' },
  { key: 'pull_reservations', label: 'جلب الحجوزات من Rental Gate (صفحة الحجوزات)', group: 'الحجوزات' },
  { key: 'claim_reservation', label: 'استلام حجز ذاتياً للمتابعة', group: 'الحجوزات' },
  { key: 'unclaim_reservation', label: 'إلغاء استلام حجز', group: 'الحجوزات' },
  { key: 'quick_update_status', label: 'تغيير حالة الحجز مباشرة', group: 'الحجوزات' },
  { key: 'assign_employees', label: 'توزيع وإعادة إسناد الحجوزات', group: 'الحجوزات' },
  { key: 'add_followup', label: 'إضافة متابعة وملاحظات', group: 'المتابعات' },
  { key: 'edit_any_followup', label: 'تعديل متابعات الآخرين', group: 'المتابعات' },
  { key: 'edit_reservation_details', label: 'تعديل تفاصيل الحجز والمبالغ', group: 'الحجوزات' },
  { key: 'edit_ticket_details', label: 'تعديل وصف وبيانات تذاكر المشاكل', group: 'المشاكل' },
  { key: 'create_problem', label: 'إنشاء تذكرة مشكلة', group: 'المشاكل' },
  { key: 'update_problem', label: 'تحديث حالة/أولوية المشكلة', group: 'المشاكل' },
  { key: 'view_employees', label: 'عرض قائمة وملفات الموظفين', group: 'الفريق' },
  { key: 'manage_employees', label: 'إدارة الموظفين والصلاحيات', group: 'الفريق' },
  { key: 'view_all_logs', label: 'عرض سجل نشاطات الفريق', group: 'التقارير' },
  { key: 'export_reports', label: 'تصدير التقارير (Excel / PDF)', group: 'التقارير' },
  { key: 'sync_data', label: 'إدارة API والمزامنة التلقائية', group: 'الإعدادات' },
  { key: 'manage_settings', label: 'تعديل إعدادات النظام', group: 'الإعدادات' }
];

var RG_DEFAULT_ROLE_PRESETS = [
  {
    id: 'agent_standard',
    label: 'موظف خدمة عملاء (الافتراضي)',
    jobTitle: 'موظف خدمة العملاء',
    role: RG_ROLES.AGENT,
    permissions: RG_ROLE_PERMISSIONS.agent.slice()
  },
  {
    id: 'agent_senior',
    label: 'موظف متابعة أول (صلاحيات موسعة)',
    jobTitle: 'موظف متابعة أول',
    role: RG_ROLES.AGENT,
    permissions: RG_ROLE_PERMISSIONS.agent.concat(['view_all_reservations', 'view_employees', 'edit_any_followup'])
  },
  {
    id: 'qa_reports',
    label: 'مسؤول جودة وتقارير (قراءة وتصدير)',
    jobTitle: 'أخصائي جودة وتقارير',
    role: RG_ROLES.AGENT,
    permissions: ['view_dashboard', 'view_all_reservations', 'view_employees', 'view_all_logs', 'export_reports']
  },
  {
    id: 'supervisor_ops',
    label: 'مشرف عمليات ومتابعة (مع صلاحية API)',
    jobTitle: 'مشرف خدمة العملاء',
    role: RG_ROLES.SUPERVISOR,
    permissions: RG_ROLE_PERMISSIONS.supervisor.slice()
  },
  {
    id: 'general_manager',
    label: 'المدير العام (كامل الصلاحيات)',
    jobTitle: 'المدير العام',
    role: RG_ROLES.GENERAL_MANAGER,
    permissions: RG_ROLE_PERMISSIONS.general_manager.slice()
  }
];

function resolveEffectivePermissions(userOrRole) {
  if (!userOrRole) return [];
  if (typeof userOrRole === 'string') {
    return (RG_ROLE_PERMISSIONS[userOrRole] || []).slice();
  }
  var role = normalizeStr(userOrRole.role) || RG_ROLES.AGENT;
  var raw = Array.isArray(userOrRole.permissions)
    ? userOrRole.permissions
    : safeJsonParse(userOrRole.permissions, []);
  if (raw.indexOf('all') !== -1) {
    return RG_ROLE_PERMISSIONS.general_manager.slice();
  }
  var isLegacyRoleOnly = !raw || raw.length === 0 || (
    raw.length === 1 &&
    [RG_ROLES.AGENT, RG_ROLES.SUPERVISOR, RG_ROLES.GENERAL_MANAGER].indexOf(raw[0]) !== -1
  );
  if (isLegacyRoleOnly) {
    return (RG_ROLE_PERMISSIONS[role] || []).slice();
  }
  return raw.slice();
}

function canAccessApi(userOrRole) {
  var role = typeof userOrRole === 'string' ? userOrRole : (userOrRole && userOrRole.role);
  return role === RG_ROLES.GENERAL_MANAGER || role === RG_ROLES.SUPERVISOR;
}

function hasPermission(sessionOrUser, action) {
  if (!sessionOrUser || !action) return false;
  var userObj = sessionOrUser.user ? sessionOrUser.user : sessionOrUser;
  if (action === 'sync_data' || action === 'manage_api_connection') {
    if (!canAccessApi(userObj)) return false;
  }
  var perms = resolveEffectivePermissions(userObj);
  return perms.indexOf(action) !== -1;
}

function sanitizeEmployeeForClient(emp) {
  if (!emp) return null;
  var effectivePerms = resolveEffectivePermissions(emp);
  return {
    id: emp.id,
    name: emp.name,
    username: emp.username,
    phone: emp.phone,
    email: emp.email,
    jobTitle: emp.jobTitle,
    role: emp.role,
    permissions: effectivePerms,
    status: emp.status,
    lastActivity: emp.lastActivity,
    createdAt: emp.createdAt,
    updatedAt: emp.updatedAt
  };
}

function sanitizePresetPermsServer(role, perms) {
  var list = Array.isArray(perms) ? perms : [];
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var k = normalizeStr(list[i]);
    if (!k || seen[k]) continue;
    if (role === RG_ROLES.AGENT && (k === 'sync_data' || k === 'manage_api_connection')) continue;
    seen[k] = true;
    out.push(k);
  }
  return out;
}

function normalizeRolePresetsServer(rawPresets) {
  var source = Array.isArray(rawPresets) && rawPresets.length > 0 ? rawPresets : RG_DEFAULT_ROLE_PRESETS;
  var out = [];
  var seen = {};
  for (var i = 0; i < source.length; i++) {
    var p = source[i];
    if (!p) continue;
    var pid = normalizeStr(p.id) || ('preset_' + (i + 1));
    if (seen[pid]) continue;
    seen[pid] = true;
    var role = [RG_ROLES.GENERAL_MANAGER, RG_ROLES.SUPERVISOR, RG_ROLES.AGENT].indexOf(p.role) !== -1 ? p.role : RG_ROLES.AGENT;
    out.push({
      id: pid,
      label: normalizeStr(p.label) || normalizeStr(p.jobTitle) || pid,
      jobTitle: normalizeStr(p.jobTitle) || normalizeStr(p.label) || 'موظف خدمة العملاء',
      role: role,
      permissions: sanitizePresetPermsServer(role, p.permissions)
    });
  }
  return out;
}

function readRolePresetsSetting() {
  var rec = findRecordById(RG_SHEETS.SETTINGS, 'key', 'job_role_presets');
  var parsed = rec ? safeJsonParse(rec.value, RG_DEFAULT_ROLE_PRESETS) : RG_DEFAULT_ROLE_PRESETS;
  return normalizeRolePresetsServer(parsed);
}

function readCustomPermissionsSetting() {
  var rec = findRecordById(RG_SHEETS.SETTINGS, 'key', 'permissions_catalog_custom');
  var parsed = rec ? safeJsonParse(rec.value, []) : [];
  return Array.isArray(parsed) ? parsed : [];
}

function syncRolesSheetFromPresets(presets, actorName) {
  var list = normalizeRolePresetsServer(presets);
  var now = nowIso();
  var rows = [];
  for (var i = 0; i < list.length; i++) {
    rows.push({
      id: list[i].id,
      label: list[i].label,
      jobTitle: list[i].jobTitle,
      role: list[i].role,
      permissions: JSON.stringify(list[i].permissions || []),
      updatedBy: actorName || 'system',
      updatedAt: now
    });
  }
  batchUpsertRecords(RG_SHEETS.ROLES, 'id', rows);
}

function syncPermissionsSheetFromCatalog(customPerms, actorName) {
  var customMap = {};
  var customList = Array.isArray(customPerms) ? customPerms : [];
  for (var i = 0; i < customList.length; i++) {
    var k = normalizeStr(customList[i].key);
    if (k) customMap[k] = customList[i];
  }
  var now = nowIso();
  var rows = [];
  var seen = {};
  for (var b = 0; b < RG_BUILTIN_PERMISSIONS_CATALOG.length; b++) {
    var base = RG_BUILTIN_PERMISSIONS_CATALOG[b];
    var ov = customMap[base.key];
    seen[base.key] = true;
    rows.push({
      key: base.key,
      label: (ov && ov.label) ? ov.label : base.label,
      group: (ov && ov.group) ? ov.group : base.group,
      isCustom: 'false',
      updatedBy: actorName || 'system',
      updatedAt: now
    });
  }
  for (var c = 0; c < customList.length; c++) {
    var ck = normalizeStr(customList[c].key);
    if (!ck || seen[ck]) continue;
    seen[ck] = true;
    rows.push({
      key: ck,
      label: normalizeStr(customList[c].label) || ck,
      group: normalizeStr(customList[c].group) || 'صلاحيات مخصصة',
      isCustom: 'true',
      updatedBy: actorName || 'system',
      updatedAt: now
    });
  }
  batchUpsertRecords(RG_SHEETS.PERMISSIONS, 'key', rows);
}

function saveRolePreset(session, payload) {
  requirePermission(session, 'manage_employees');
  var label = normalizeStr(payload.label);
  if (!label) throw new Error('اسم الصلاحية الجاهزة مطلوب.');
  var role = [RG_ROLES.GENERAL_MANAGER, RG_ROLES.SUPERVISOR, RG_ROLES.AGENT].indexOf(payload.role) !== -1
    ? payload.role
    : RG_ROLES.AGENT;
  var jobTitle = normalizeStr(payload.jobTitle) || label;
  var perms = sanitizePresetPermsServer(role, payload.permissions);
  var pid = normalizeStr(payload.id);

  return withScriptLock(function () {
    var list = readRolePresetsSetting();
    var idx = -1;
    if (pid) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === pid) { idx = i; break; }
      }
    }
    var record = {
      id: idx !== -1 ? pid : (pid || generateId('PRESET')),
      label: label,
      jobTitle: jobTitle,
      role: role,
      permissions: perms
    };
    if (idx !== -1) {
      list[idx] = record;
    } else {
      list.push(record);
    }
    upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'job_role_presets', {
      key: 'job_role_presets',
      value: JSON.stringify(list),
      updatedBy: session.user.name,
      updatedAt: nowIso()
    });
    syncRolesSheetFromPresets(list, session.user.name);
    logActivity(session.user, idx !== -1 ? 'تعديل صلاحية جاهزة' : 'إضافة صلاحية جاهزة', 'RolePreset', record.id, record.label);
    return { rolePresets: list, savedPreset: record };
  });
}

function deleteRolePreset(session, payload) {
  requirePermission(session, 'manage_employees');
  var targetId = normalizeStr(payload.presetId || payload.id);
  if (!targetId) throw new Error('معرف الصلاحية الجاهزة مطلوب.');

  return withScriptLock(function () {
    var list = readRolePresetsSetting();
    var removed = null;
    var next = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === targetId) removed = list[i];
      else next.push(list[i]);
    }
    if (!removed) throw new Error('الصلاحية الجاهزة غير موجودة.');
    if (next.length === 0) throw new Error('يجب الإبقاء على قالب صلاحية جاهزة واحد على الأقل.');
    upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'job_role_presets', {
      key: 'job_role_presets',
      value: JSON.stringify(next),
      updatedBy: session.user.name,
      updatedAt: nowIso()
    });
    deleteRecordByKey(RG_SHEETS.ROLES, 'id', targetId);
    logActivity(session.user, 'حذف صلاحية جاهزة', 'RolePreset', targetId, removed.label);
    return { rolePresets: next };
  });
}

function resetRolePresets(session) {
  requirePermission(session, 'manage_employees');
  return withScriptLock(function () {
    var defaults = normalizeRolePresetsServer(RG_DEFAULT_ROLE_PRESETS);
    upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'job_role_presets', {
      key: 'job_role_presets',
      value: JSON.stringify(defaults),
      updatedBy: session.user.name,
      updatedAt: nowIso()
    });
    syncRolesSheetFromPresets(defaults, session.user.name);
    logActivity(session.user, 'استعادة الصلاحيات الجاهزة', 'RolePreset', 'defaults', 'استعادة القوالب الافتراضية');
    return { rolePresets: defaults };
  });
}

function savePermissionDefinition(session, payload) {
  requirePermission(session, 'manage_employees');
  var label = normalizeStr(payload.label);
  var group = normalizeStr(payload.group) || 'صلاحيات مخصصة';
  if (!label) throw new Error('اسم الصلاحية مطلوب.');
  var rawKey = normalizeStr(payload.key);
  if (!rawKey) {
    rawKey = 'custom_' + generateId('P').toLowerCase();
  }
  rawKey = rawKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  if (!rawKey) throw new Error('مفتاح الصلاحية غير صالح.');

  return withScriptLock(function () {
    var list = readCustomPermissionsSetting();
    var builtInKeys = {};
    var roles = Object.keys(RG_ROLE_PERMISSIONS);
    for (var r = 0; r < roles.length; r++) {
      var arr = RG_ROLE_PERMISSIONS[roles[r]];
      for (var j = 0; j < arr.length; j++) builtInKeys[arr[j]] = true;
    }
    var item = {
      key: rawKey,
      label: label,
      group: group,
      isCustom: !builtInKeys[rawKey] && rawKey.indexOf('custom_') === 0
    };
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (normalizeStr(list[i].key) === rawKey) { idx = i; break; }
    }
    if (idx !== -1) list[idx] = item;
    else list.push(item);

    upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'permissions_catalog_custom', {
      key: 'permissions_catalog_custom',
      value: JSON.stringify(list),
      updatedBy: session.user.name,
      updatedAt: nowIso()
    });
    syncPermissionsSheetFromCatalog(list, session.user.name);
    logActivity(session.user, idx !== -1 ? 'تعديل صلاحية' : 'إضافة صلاحية', 'Permission', rawKey, label);
    return { customPermissions: list, saved: item };
  });
}

function deletePermissionDefinition(session, payload) {
  requirePermission(session, 'manage_employees');
  var targetKey = normalizeStr(payload.key);
  if (!targetKey) throw new Error('مفتاح الصلاحية مطلوب.');

  return withScriptLock(function () {
    var list = readCustomPermissionsSetting();
    var next = list.filter(function (c) { return normalizeStr(c.key) !== targetKey; });
    upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'permissions_catalog_custom', {
      key: 'permissions_catalog_custom',
      value: JSON.stringify(next),
      updatedBy: session.user.name,
      updatedAt: nowIso()
    });
    deleteRecordByKey(RG_SHEETS.PERMISSIONS, 'key', targetKey);

    var presets = readRolePresetsSetting();
    if (targetKey.indexOf('custom_') === 0) {
      for (var i = 0; i < presets.length; i++) {
        presets[i].permissions = (presets[i].permissions || []).filter(function (pk) { return pk !== targetKey; });
      }
      upsertRecordByKey(RG_SHEETS.SETTINGS, 'key', 'job_role_presets', {
        key: 'job_role_presets',
        value: JSON.stringify(presets),
        updatedBy: session.user.name,
        updatedAt: nowIso()
      });
      syncRolesSheetFromPresets(presets, session.user.name);
    }
    syncPermissionsSheetFromCatalog(next, session.user.name);
    logActivity(session.user, 'حذف صلاحية', 'Permission', targetKey, targetKey);
    return { customPermissions: next, rolePresets: presets };
  });
}
