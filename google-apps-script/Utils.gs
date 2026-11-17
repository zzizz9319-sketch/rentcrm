/**
 * RENTAL GATE CRM — Utilities & Domain Constants
 * Google Apps Script Backend
 */

var RG_SHEETS = {
  USERS: 'Users',
  EMPLOYEES: 'Employees',
  RESERVATIONS: 'Reservations',
  EXTENSIONS: 'Extensions',
  ASSIGNMENTS: 'Assignments',
  FOLLOWUPS: 'FollowUps',
  FOLLOWUP_HISTORY: 'FollowUpHistory',
  ISSUES: 'Issues',
  PROBLEMS: 'Problems',
  PROBLEM_UPDATES: 'ProblemUpdates',
  ACTIVITY_LOG: 'ActivityLog',
  NOTIFICATIONS: 'Notifications',
  SETTINGS: 'Settings',
  ROLES: 'Roles',
  PERMISSIONS: 'Permissions',
  SESSIONS: 'Sessions',
  SYNC_LOG: 'SyncLog'
};

var RG_ROLES = {
  GENERAL_MANAGER: 'general_manager',
  SUPERVISOR: 'supervisor',
  AGENT: 'agent'
};

var RG_FOLLOWUP_STATUSES = [
  'تم الحجز',
  'تم التسليم',
  'تم الاستلام',
  'تم الإنشاء',
  'تم الإلغاء',
  'تم التمديد',
  'لم يتم الحجز'
];

var RG_PROBLEM_PRIORITIES = ['عادي', 'متوسط', 'مرتفع'];

var RG_PROBLEM_STATUSES = [
  'جديدة',
  'قيد المعالجة',
  'بانتظار العميل',
  'بانتظار الشركة',
  'تم الحل',
  'مغلقة'
];

var RG_STATUS_MAP = {
  pending: 'قيد الانتظار',
  new: 'جديد',
  created: 'تم الإنشاء',
  confirmed: 'مؤكد',
  booked: 'تم الحجز',
  reserved: 'تم الحجز',
  active: 'نشط',
  delivered: 'تم التسليم',
  picked_up: 'تم الاستلام',
  received: 'تم الاستلام',
  extended: 'تم التمديد',
  completed: 'مكتمل',
  finished: 'مكتمل',
  cancelled: 'ملغي',
  canceled: 'ملغي',
  rejected: 'مرفوض',
  expired: 'منتهي',
  no_show: 'لم يحضر',
  draft: 'مسودة',
  unpaid: 'غير مدفوع',
  paid: 'مدفوع',
  accepted: 'مقبول',
  approved: 'مقبول'
};

var RG_DELIVERY_MAP = {
  branch: 'استلام من الفرع',
  office: 'استلام من المكتب',
  pickup: 'استلام من الفرع',
  delivery: 'توصيل للموقع',
  home: 'توصيل للمنزل',
  airport: 'توصيل للمطار',
  hotel: 'توصيل للفندق',
  return_branch: 'تسليم في الفرع',
  return_delivery: 'استلام من موقع العميل'
};

function generateId(prefix) {
  var uuid = Utilities.getUuid().replace(/-/g, '').substring(0, 12).toUpperCase();
  return (prefix ? prefix + '_' : '') + uuid;
}

function nowIso() {
  return new Date().toISOString();
}

function formatDateOnly(dateInput) {
  if (!dateInput) return '';
  var d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput).substring(0, 10);
  var tz = 'Asia/Riyadh';
  try {
    tz = Session.getScriptTimeZone() || 'Asia/Riyadh';
  } catch (e) {}
  return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
}

function formatTimeOnly(dateInput) {
  var d = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (isNaN(d.getTime())) return '';
  var tz = 'Asia/Riyadh';
  try {
    tz = Session.getScriptTimeZone() || 'Asia/Riyadh';
  } catch (e) {}
  return Utilities.formatDate(d, tz, 'HH:mm:ss');
}

function safeJsonParse(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

function normalizeStr(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function toNumber(val, fallback) {
  var n = Number(val);
  return isNaN(n) ? (fallback || 0) : n;
}

function toBool(val) {
  if (typeof val === 'boolean') return val;
  var s = String(val).toLowerCase().trim();
  return s === 'true' || s === '1' || s === 'yes';
}

function translateOriginalStatus(code) {
  var key = normalizeStr(code).toLowerCase().replace(/\s+/g, '_');
  return RG_STATUS_MAP[key] || normalizeStr(code) || 'غير محدد';
}

function translateDeliveryType(type) {
  var key = normalizeStr(type).toLowerCase().replace(/\s+/g, '_');
  return RG_DELIVERY_MAP[key] || normalizeStr(type) || 'استلام من الفرع';
}

function isExtensionAcceptedAndPaid(ext) {
  if (!ext || typeof ext !== 'object') return false;
  var st = normalizeStr(ext.status || ext.status_code || ext.state).toLowerCase();
  var pay = normalizeStr(ext.payment_status || ext.paymentStatus || ext.is_paid).toLowerCase();
  var accepted = st === 'accepted' || st === 'approved' || st === 'confirmed' || st === 'active' || st === 'completed' || st === 'مقبول';
  var paid = pay === 'paid' || pay === 'completed' || pay === 'true' || pay === '1' || pay === 'مدفوع' || ext.paid === true;
  return accepted && paid;
}

function computeTotalAmount(baseAmount, extensionsList) {
  var total = toNumber(baseAmount, 0);
  if (Array.isArray(extensionsList)) {
    for (var i = 0; i < extensionsList.length; i++) {
      total += toNumber(extensionsList[i].amount, 0);
    }
  }
  return Math.round(total * 100) / 100;
}

function escapeCsvCell(val) {
  var s = val === null || val === undefined ? '' : String(val);
  if (/[",\r\n]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function jsonResponse(success, message, data, error) {
  var payload = {
    success: Boolean(success),
    message: message || '',
    data: data !== undefined ? data : null,
    error: error || null
  };
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
