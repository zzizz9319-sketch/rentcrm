/* ============================================================
   سحب الحجوزات من RentalGate + شيت المتابعة (Data / FollowUps)
   نسخة محسّنة فائقة السرعة باستخدام UrlFetchApp.fetchAll() بالتوازي
   التوكن يُحفظ بأمان في Script Properties (RG_TOKEN & RENTAL_TOKEN)
   ============================================================ */

var API = "https://api.rentalgate.net/api/";
var RES_URL = API + "reservations/filter";
var EXT_URL = API + "reservation-extends/filter";
var PAGE_SIZE = 100;       // 100 عنصر بالصفحة لتقليل عدد الطلبات إلى النصف
var FIRST_PAGE = 0;        // الصفحات تبدأ من 0
var MAX_PAGES = 500;
var START_KEY = 20261110;  // الحجوزات من 10 نوفمبر 2026 (عدّله حسب الحاجة)

// التمديدات التي تنزل (مدفوع ومقبول فقط)
var EXT_ALLOWED = ["PAID", "ADMIN_APPROVED", "APPROVED", "ACCEPTED"];
// حالات الحجوزات المستبعدة
var EXCLUDE_STATUSES = ["CANCELLED", "CANCELED", "DECLINED", "REJECTED"];

/* ---------- إعدادات تابة FollowUps ---------- */

var FU_SYS = [
  "رقم الحجز", "اسم العميل", "جوال العميل", "الشركة", "اسم الفرع", "السيارة",
  "بداية الحجز", "وقت البداية", "نهاية الحجز", "وقت النهاية", "مدة الحجز",
  "نوع الاستلام", "نوع التسليم", "حالة الحجز"
];
var FU_ROUNDS = 4;
var FU_ROUND_FIELDS = ["حالة المتابعة", "موظف المتابعة", "الإجراء", "تاريخ المتابعة", "ملاحظات الموظف"];
var F_STATUS = 0, F_EMP = 1, F_ACTION = 2, F_DATE = 3, F_NOTES = 4;
var FU_ROUND_COLORS = ["#fff2cc", "#e2efda", "#fce4d6", "#ddebf7", "#ede7f6", "#f2f2f2"];
var FU_AGENT = [];
for (var _r = 1; _r <= FU_ROUNDS; _r++) {
  FU_ROUND_FIELDS.forEach(function (f) { FU_AGENT.push(f + " " + _r); });
}
var FU_HEADERS = FU_SYS.concat(FU_AGENT);
var FU_N_SYS = FU_SYS.length;
function fuCol_(round, field) { return FU_N_SYS + (round - 1) * FU_ROUND_FIELDS.length + field + 1; }

var FU_TEXT_COLS = [1, 2, 3, 7, 8, 9, 10, 11];
var FU_REFRESH_EXISTING = false;
var FU_DATE_FORMAT = "dd/MM/yyyy hh:mm AM/PM";

var FU_STATUSES = ["تم الحجز", "تم التسليم", "تم الاستلام", "تم الإنشاء", "تم الإلغاء", "تم التمديد", "لم يتم الحجز"];
var FU_EMPLOYEES = ["عبد الرحمن الأمير", "علا", "مريم", "أيمن", "زياد", "إبراهيم", "مبارك", "نورة"];
var FU_ACTIONS = [];

/* ---------- تابة Data ---------- */

var DATA_HEADERS = [
  "م", "رقم الحجز", "تاريخ الانشاء", "اسم العميل", "جوال العميل", "الشركة", "اسم الفرع", "السيارة",
  "بداية الحجز", "وقت البداية", "نهاية الحجز", "وقت النهاية", "مدة الحجز", "نوع الاستلام", "نوع التسليم",
  "حالة الحجز", "له تمديد", "نوع التمديد", "المبلغ المدفوع"
];

var STATUS_AR = {
  ACTIVE: "نشط الآن", STARTED: "نشط الآن",
  CONFIRMED: "مؤكد", IN_PROGRESS: "مؤكد",
  COMPLETED: "منتهي", FINISHED: "منتهي", CLOSED: "منتهي", ENDED: "منتهي",
  FINISHED_BY_DRIVER: "تم التسليم من قبل السائق",
  CANCELLED: "ملغي", CANCELED: "ملغي",
  PENDING: "قيد الانتظار", CREATED: "قيد الانتظار",
  PAID: "مدفوع", ADMIN_APPROVED: "مقبول", APPROVED: "مقبول", ACCEPTED: "مقبول",
  DECLINED: "مرفوض", REJECTED: "مرفوض",
  PAID_BY_WALLET: "مدفوع عن طريق المحفظة", WALLET_PAID: "مدفوع عن طريق المحفظة",
  PAID_WALLET: "مدفوع عن طريق المحفظة"
};
var HANDOVER_AR = {
  BRANCH: "فرع", AIRPORT: "مطار",
  MY_LOCATION: "موقع خاص",
  CUSTOM: "موقع خاص", CUSTOM_LOCATION: "موقع خاص", DELIVERY: "موقع خاص",
  LOCATION: "موقع خاص", PRIVATE_LOCATION: "موقع خاص", PRIVATE: "موقع خاص"
};
var EXT_TYPE_AR = { CLIENT: "التمديد بواسطة العميل", AUTOMATIC: "تمديد تلقائي" };

var UNMAPPED = {};

/* ---------- أدوات ---------- */

function notify_(msg) {
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}

function getToken_() {
  var props = PropertiesService.getScriptProperties();
  return String(props.getProperty("RG_TOKEN") || props.getProperty("RENTAL_TOKEN") || "").trim();
}

function setToken() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt("حفظ التوكن", "الصق التوكن (يبدأ بـ eyJ). كلمة Bearer ما تضر، بتنشال تلقائياً", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var t = r.getResponseText().trim().replace(/^Bearer\s+/i, "");
  if (t.indexOf("eyJ") !== 0) { notify_("التوكن غير صحيح، لازم يبدأ بـ eyJ"); return; }
  PropertiesService.getScriptProperties().setProperties({
    RG_TOKEN: t,
    RENTAL_TOKEN: t
  });
  notify_("تم حفظ التوكن بنجاح (RG_TOKEN & RENTAL_TOKEN) ✔");
}

function pick_(obj, paths) {
  for (var i = 0; i < paths.length; i++) {
    var v = obj, parts = paths[i].split(".");
    for (var j = 0; j < parts.length && v != null; j++) v = v[parts[j]];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function pad_(n) { return (n < 10 ? "0" : "") + n; }

function parts_(v) {
  if (!v) return null;
  var m = String(v).match(/(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (!m) return null;
  return { y: +m[1], mo: +m[2], d: +m[3], h: m[4] !== undefined ? +m[4] : null, mi: m[5] !== undefined ? +m[5] : null };
}
function dateKey_(v) { var p = parts_(v); return p ? p.y * 10000 + p.mo * 100 + p.d : 0; }
function fmtDate_(v) { var p = parts_(v); return p ? pad_(p.d) + "/" + pad_(p.mo) + "/" + p.y : ""; }
function fmtTime_(v) {
  var p = parts_(v);
  if (!p || p.h === null) return "";
  return pad_(p.h % 12 || 12) + ":" + pad_(p.mi) + " " + (p.h >= 12 ? "م" : "ص");
}

function durationText_(days) {
  var n = Number(days);
  if (!n) return days || "";
  if (n === 1) return "1 يوم";
  if (n === 2) return "يومين";
  if (n >= 3 && n <= 10) return n + " أيام";
  return n + " يوم";
}

function map_(dict, v, label) {
  if (v === "" || v == null) return "";
  var t = dict[String(v).toUpperCase()];
  if (t) return t;
  UNMAPPED[label + ": " + v] = true;
  return v;
}

function round2_(x) { return Math.round(x * 100) / 100; }

/* ---------- سحب البيانات بالتوازي فائق السرعة ---------- */

function buildApiReq_(url, token) {
  return {
    url: url,
    method: "get",
    headers: { "Authorization": "Bearer " + token, "Accept": "application/json", "lang": "ar" },
    muteHttpExceptions: true
  };
}

function parseApiRes_(res) {
  var code = res.getResponseCode();
  if (code !== 200) throw new Error("كود " + code + " | " + res.getContentText().substring(0, 300));
  return JSON.parse(res.getContentText());
}

function itemsOf_(result) {
  if (Array.isArray(result)) return result;
  var r = result.content || result.items || result.data || result.results || [];
  if (r && !Array.isArray(r)) r = r.content || r.items || r.data || [];
  return Array.isArray(r) ? r : [];
}

function fetchBothParallel_(token) {
  var firstBatch = UrlFetchApp.fetchAll([
    buildApiReq_(RES_URL + "?page=" + FIRST_PAGE + "&size=" + PAGE_SIZE, token),
    buildApiReq_(EXT_URL + "?page=" + FIRST_PAGE + "&size=" + PAGE_SIZE, token)
  ]);

  var res0 = parseApiRes_(firstBatch[0]);
  var ext0 = parseApiRes_(firstBatch[1]);

  var resPages = [itemsOf_(res0)];
  var extPages = [itemsOf_(ext0)];

  var totalResPages = Math.min(Number(res0.totalPages || 1), MAX_PAGES);
  var totalExtPages = Math.min(Number(ext0.totalPages || 1), MAX_PAGES);

  var reqs = [];
  var meta = [];

  if (res0.last !== true && totalResPages > 1 && resPages[0].length > 0) {
    for (var rp = FIRST_PAGE + 1; rp < FIRST_PAGE + totalResPages; rp++) {
      reqs.push(buildApiReq_(RES_URL + "?page=" + rp + "&size=" + PAGE_SIZE, token));
      meta.push({ kind: "res", idx: rp - FIRST_PAGE });
    }
  }
  if (ext0.last !== true && totalExtPages > 1 && extPages[0].length > 0) {
    for (var ep = FIRST_PAGE + 1; ep < FIRST_PAGE + totalExtPages; ep++) {
      reqs.push(buildApiReq_(EXT_URL + "?page=" + ep + "&size=" + PAGE_SIZE, token));
      meta.push({ kind: "ext", idx: ep - FIRST_PAGE });
    }
  }

  var batchSize = 12;
  for (var i = 0; i < reqs.length; i += batchSize) {
    var chunkReqs = reqs.slice(i, i + batchSize);
    var chunkMeta = meta.slice(i, i + batchSize);
    var chunkRes = UrlFetchApp.fetchAll(chunkReqs);
    for (var j = 0; j < chunkRes.length; j++) {
      var arr = itemsOf_(parseApiRes_(chunkRes[j]));
      if (chunkMeta[j].kind === "res") resPages[chunkMeta[j].idx] = arr;
      else extPages[chunkMeta[j].idx] = arr;
    }
  }

  var dedupe = function (pages, idKeys) {
    var out = [], seen = {};
    for (var p = 0; p < pages.length; p++) {
      var list = pages[p] || [];
      for (var k = 0; k < list.length; k++) {
        var it = list[k];
        var id = String(pick_(it, idKeys));
        if (id && seen[id]) continue;
        if (id) seen[id] = true;
        out.push(it);
      }
    }
    return out;
  };

  return {
    reservations: dedupe(resPages, ["reservationId", "id"]),
    extensions: dedupe(extPages, ["extendId", "id"])
  };
}

/* ---------- تحويل إلى صفوف ---------- */

function resId_(r) { return pick_(r, ["reservationId", "id"]); }
function extId_(e) { return pick_(e, ["extendId", "id"]); }
function extDate_(e) { return pick_(e, ["extendDate", "createdAt"]); }
function extAllowed_(e) {
  return EXT_ALLOWED.indexOf(String(e.reservationStatus || "").toUpperCase()) !== -1;
}

function resRow_(r, idx, exts, flagExt) {
  var amount = Number(r.total) || 0;
  exts.forEach(function (e) { amount += Number(e.total) || 0; });
  return [
    idx,
    resId_(r),
    fmtDate_(r.reservationDate),
    pick_(r, ["clientName"]),
    pick_(r, ["clientMobile"]),
    pick_(r, ["companyArName", "companyEnName"]),
    pick_(r, ["receiveBranchArName", "receiveBranchEnName"]),
    pick_(r, ["carNameAr", "carNameEn"]),
    fmtDate_(r.startDate),
    fmtTime_(r.startDate),
    fmtDate_(r.endDate),
    fmtTime_(r.endDate),
    durationText_(r.reservationDays),
    map_(HANDOVER_AR, r.receiveType, "نوع الاستلام"),
    map_(HANDOVER_AR, r.deliverType, "نوع التسليم"),
    map_(STATUS_AR, r.reservationStatus, "حالة الحجز"),
    flagExt ? "نعم" : "لا",
    "",
    round2_(amount)
  ];
}

function extRow_(e, full) {
  return [
    "",
    pick_(e, ["reservationId"]),
    fmtDate_(extDate_(e)),
    "تمديد #" + extId_(e) + (full ? " - " + pick_(e, ["clientName"]) : ""),
    full ? pick_(e, ["clientMobile"]) : "",
    full ? pick_(e, ["companyArabicName", "companyName"]) : "",
    full ? pick_(e, ["branchArabicName", "branchName"]) : "",
    full ? pick_(e, ["carName"]) : "",
    fmtDate_(extDate_(e)),
    "", "", "", "", "", "",
    map_(STATUS_AR, e.reservationStatus, "حالة التمديد"),
    "",
    map_(EXT_TYPE_AR, e.extensionType, "نوع التمديد"),
    Number(e.total) || 0
  ];
}

/* ---------- تابة FollowUps ---------- */

function fuSysCols_(r) {
  return [
    String(resId_(r)),
    pick_(r, ["clientName"]),
    String(pick_(r, ["clientMobile"])),
    pick_(r, ["companyArName", "companyEnName"]),
    pick_(r, ["receiveBranchArName", "receiveBranchEnName"]),
    pick_(r, ["carNameAr", "carNameEn"]),
    fmtDate_(r.startDate),
    fmtTime_(r.startDate),
    fmtDate_(r.endDate),
    fmtTime_(r.endDate),
    durationText_(r.reservationDays),
    map_(HANDOVER_AR, r.receiveType, "نوع الاستلام"),
    map_(HANDOVER_AR, r.deliverType, "نوع التسليم"),
    map_(STATUS_AR, r.reservationStatus, "حالة الحجز")
  ];
}

function writeFuHeader_(sheet) {
  sheet.getRange(1, 1, 1, FU_HEADERS.length).setValues([FU_HEADERS])
    .setFontWeight("bold").setBackground("#d9e2f3").setHorizontalAlignment("center");
  for (var r = 1; r <= FU_ROUNDS; r++) {
    sheet.getRange(1, fuCol_(r, 0), 1, FU_ROUND_FIELDS.length)
      .setBackground(FU_ROUND_COLORS[(r - 1) % FU_ROUND_COLORS.length]);
  }
  sheet.setFrozenRows(1);
}

function resolveFollowUpsSheet_(ss) {
  var sheet = ss.getSheetByName("FollowUps");
  if (!sheet) return ss.insertSheet("FollowUps");
  var a1 = String(sheet.getRange(1, 1).getValue() || "").trim();
  // حماية قاعدة بيانات CRM إذا كانت تابة FollowUps مستخدمة بنظام Web App (تبدأ بـ id)
  if (a1 === "id") {
    return ss.getSheetByName("FollowUps_Sheet") || ss.insertSheet("FollowUps_Sheet");
  }
  return sheet;
}

function migrateFollowUps_(sheet) {
  var last = sheet.getLastRow();
  if (last === 0) { writeFuHeader_(sheet); return; }

  var a1 = String(sheet.getRange(1, 1).getValue()).trim();
  if (a1 !== FU_HEADERS[0]) {
    sheet.insertRowsBefore(1, 1);
    writeFuHeader_(sheet);
    return;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var oldH = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (x) { return String(x).trim(); });
  var same = FU_HEADERS.every(function (h, i) { return oldH[i] === h; });
  if (same) { return; }

  var data = last > 1 ? sheet.getRange(2, 1, last - 1, lastCol).getValues() : [];
  var idx = FU_HEADERS.map(function (h) {
    var k = oldH.indexOf(h);
    if (k < 0 && / 1$/.test(h)) {
      var base = h.replace(/ 1$/, "");
      k = oldH.indexOf(base);
      if (k < 0 && base === "موظف المتابعة") k = oldH.indexOf("اسم الموظف المتابع");
    }
    return k;
  });
  var out = data.map(function (row) {
    return idx.map(function (k) { return k >= 0 ? row[k] : ""; });
  });

  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearDataValidations();
  sheet.clear();
  writeFuHeader_(sheet);
  if (out.length) {
    FU_TEXT_COLS.forEach(function (c) { sheet.getRange(2, c, out.length, 1).setNumberFormat("@"); });
    sheet.getRange(2, 1, out.length, FU_HEADERS.length).setValues(out);
  }
}

function applyFuFormatting_(sheet) {
  var rows = sheet.getLastRow() - 1;
  if (rows < 1) return;

  FU_TEXT_COLS.forEach(function (c) { sheet.getRange(2, c, rows, 1).setNumberFormat("@"); });

  var list = function (arr) {
    return SpreadsheetApp.newDataValidation().requireValueInList(arr, true).setAllowInvalid(false).build();
  };
  var dateRule = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
    .setHelpText("اختر التاريخ من التقويم أو اكتبه مع الوقت مثل: 05/11/2026 03:30 PM").build();

  for (var r = 1; r <= FU_ROUNDS; r++) {
    sheet.getRange(2, fuCol_(r, F_STATUS), rows, 1).setDataValidation(list(FU_STATUSES));
    sheet.getRange(2, fuCol_(r, F_EMP), rows, 1).setDataValidation(list(FU_EMPLOYEES));
    if (FU_ACTIONS.length) sheet.getRange(2, fuCol_(r, F_ACTION), rows, 1).setDataValidation(list(FU_ACTIONS));

    var dr = sheet.getRange(2, fuCol_(r, F_DATE), rows, 1);
    dr.setDataValidation(dateRule);
    dr.setNumberFormat(FU_DATE_FORMAT);

    sheet.getRange(2, fuCol_(r, F_NOTES), rows, 1).setWrap(true);
    sheet.getRange(1, fuCol_(r, 0), rows + 1, FU_ROUND_FIELDS.length)
      .setBorder(null, true, null, true, null, null, "#7f7f7f", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
  }
}

function updateFollowUps_(ss, filtered) {
  var sheet = resolveFollowUpsSheet_(ss);
  var N = FU_HEADERS.length;
  if (sheet.getMaxColumns() < N) sheet.insertColumnsAfter(sheet.getMaxColumns(), N - sheet.getMaxColumns());

  migrateFollowUps_(sheet);

  var byId = {};
  filtered.forEach(function (r) { byId[String(resId_(r))] = r; });

  var last = sheet.getLastRow();
  var existing = {};
  var refreshed = null;
  if (last > 1) {
    if (FU_REFRESH_EXISTING) {
      refreshed = sheet.getRange(2, 1, last - 1, FU_N_SYS).getValues();
      refreshed.forEach(function (row, i) {
        var id = String(row[0]).trim();
        if (!id) return;
        existing[id] = true;
        if (byId[id]) refreshed[i] = fuSysCols_(byId[id]);
      });
    } else {
      sheet.getRange(2, 1, last - 1, 1).getValues().forEach(function (row) {
        var id = String(row[0]).trim();
        if (id) existing[id] = true;
      });
    }
  }

  var emptyAgent = FU_AGENT.map(function () { return ""; });
  var newRows = [];
  filtered.forEach(function (r) {
    var id = String(resId_(r));
    if (!id || existing[id]) return;
    existing[id] = true;
    newRows.push(fuSysCols_(r).concat(emptyAgent));
  });

  var n = newRows.length;
  if (n > 0) {
    sheet.insertRowsAfter(1, n);
    var target = sheet.getRange(2, 1, n, N);
    target.clearFormat();
    target.clearDataValidations();
    applyFuFormatting_(sheet);
    sheet.getRange(2, 1, n, N).setValues(newRows);
  } else if (last === 1) {
    applyFuFormatting_(sheet);
  }

  if (refreshed && refreshed.length) sheet.getRange(2 + n, 1, refreshed.length, FU_N_SYS).setValues(refreshed);

  return n;
}

function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    var shName = sh.getName();
    if (shName !== "FollowUps" && shName !== "FollowUps_Sheet") return;
    if (String(sh.getRange(1, 1).getValue() || "").trim() !== FU_HEADERS[0]) return;

    var r1 = e.range.getRow(), r2 = r1 + e.range.getNumRows() - 1;
    var c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
    if (r2 < 2) return;
    if (e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 && e.value === undefined) return;

    var start = Math.max(r1, 2), cnt = r2 - start + 1;
    if (cnt > 200) return;

    for (var r = 1; r <= FU_ROUNDS; r++) {
      var touched = [F_STATUS, F_EMP, F_ACTION, F_NOTES].some(function (f) {
        var c = fuCol_(r, f);
        return c >= c1 && c <= c2;
      });
      if (!touched) continue;

      var dr = sh.getRange(start, fuCol_(r, F_DATE), cnt, 1);
      var vals = dr.getValues();
      var now = new Date(), changed = false;
      vals.forEach(function (v, i) { if (v[0] === "" || v[0] === null) { vals[i][0] = now; changed = true; } });
      if (changed) {
        dr.setNumberFormat(FU_DATE_FORMAT);
        dr.setValues(vals);
      }
    }
  } catch (err) {}
}

/* ---------- الرئيسية ---------- */

function fetchBookingsFromAPI() {
  var token = getToken_();
  if (token.indexOf("eyJ") !== 0) {
    notify_("التوكن غير محفوظ أو غير صحيح. من القائمة اختر: حفظ التوكن، والصقه (يبدأ بـ eyJ)");
    return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  UNMAPPED = {};
  var t0 = Date.now();

  try {
    var fetched = fetchBothParallel_(token);
    var reservations = fetched.reservations;
    var allExt = fetched.extensions;

    var hasAnyExt = {};
    allExt.forEach(function (e) { hasAnyExt[String(pick_(e, ["reservationId"]))] = true; });

    var extensions = allExt.filter(extAllowed_);

    var excluded = EXCLUDE_STATUSES.map(function (s) { return String(s).toUpperCase(); });
    var filtered = reservations.filter(function (r) {
      if (dateKey_(r.reservationDate) < START_KEY) return false;
      return excluded.indexOf(String(r.reservationStatus || "").toUpperCase()) === -1;
    });
    filtered.sort(function (a, b) { return Number(resId_(b)) - Number(resId_(a)); });

    var statusCount = {};
    filtered.forEach(function (r) {
      var s = String(r.reservationStatus || "?");
      statusCount[s] = (statusCount[s] || 0) + 1;
    });

    var extByRes = {};
    extensions.forEach(function (e) {
      var k = String(pick_(e, ["reservationId"]));
      (extByRes[k] = extByRes[k] || []).push(e);
    });
    Object.keys(extByRes).forEach(function (k) {
      extByRes[k].sort(function (a, b) { return Number(extId_(a)) - Number(extId_(b)); });
    });

    var rows = [], used = {}, extCount = 0;
    filtered.forEach(function (r, i) {
      var id = String(resId_(r));
      var exts = extByRes[id] || [];
      var flag = (r.extended === true) || !!hasAnyExt[id];
      rows.push(resRow_(r, i + 1, exts, flag));
      exts.forEach(function (e) { rows.push(extRow_(e, false)); extCount++; });
      used[id] = true;
    });

    extensions.forEach(function (e) {
      if (used[String(pick_(e, ["reservationId"]))]) return;
      if (dateKey_(extDate_(e)) >= START_KEY) { rows.push(extRow_(e, true)); extCount++; }
    });

    var dataSheet = ss.getSheetByName("Data") || ss.insertSheet("Data");
    dataSheet.clearContents();
    dataSheet.getRange(1, 1, 1, DATA_HEADERS.length).setValues([DATA_HEADERS]).setFontWeight("bold");
    dataSheet.setFrozenRows(1);
    if (rows.length > 0) {
      [3, 9, 10, 11, 12, 13].forEach(function (c) {
        dataSheet.getRange(2, c, rows.length, 1).setNumberFormat("@");
      });
      dataSheet.getRange(2, 1, rows.length, DATA_HEADERS.length).setValues(rows);
    }

    var added = updateFollowUps_(ss, filtered);
    var sec = ((Date.now() - t0) / 1000).toFixed(1);

    var msg = "تم السحب والتحديث خلال " + sec + " ثانية ⚡\n" +
              "مسحوب من الـ API (الكل): " + reservations.length + " حجز و " + allExt.length + " تمديد\n" +
              "تابة Data: " + filtered.length + " حجز + " + extCount + " تمديد\n" +
              "تابة المتابعة: أضيف " + added + " حجز جديد (في الأعلى)\n\n" +
              "الحجوزات حسب الحالة:\n" +
              Object.keys(statusCount).map(function (k) { return k + " = " + statusCount[k]; }).join("\n");
    var un = Object.keys(UNMAPPED);
    if (un.length) msg += "\n\nقيم إنجليزية بدون ترجمة (أرسلها لي):\n" + un.join("\n");
    notify_(msg);
  } catch (e) {
    notify_("خطأ: " + e.message);
  }
}

/* ---------- للتشخيص فقط ---------- */

function debugRaw() {
  [RES_URL, EXT_URL].forEach(function (u) {
    var res = UrlFetchApp.fetch(u + "?page=" + FIRST_PAGE + "&size=2", {
      method: "get",
      headers: { "Authorization": "Bearer " + getToken_(), "Accept": "application/json", "lang": "ar" },
      muteHttpExceptions: true
    });
    Logger.log(u + "\nكود: " + res.getResponseCode() + "\n" + res.getContentText().substring(0, 4000));
  });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu("إدارة المتابعات 🚀")
    .addItem("سحب الحجوزات المباشرة من المنصة", "fetchBookingsFromAPI")
    .addItem("حفظ التوكن", "setToken")
    .addToUi();
}
