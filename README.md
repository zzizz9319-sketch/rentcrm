# RENTAL GATE CRM — نظام إدارة خدمة العملاء والحجوزات

نظام CRM متكامل لشركة **Rental Gate** مبني بـ **Vite + Tailwind CSS + JavaScript** للنشر على **GitHub Pages** (`https://za7adalarbi-commits.github.io/RENT-CRM/`)، مع **Google Apps Script Web App** كخادم Backend و**Google Sheets** كقاعدة بيانات متكاملة بدون أي قواعد بيانات خارجية.

---

## هيكل المشروع

```
RENT-CRM/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── index.html
├── vite.config.ts
├── src/
│   └── index.css
├── assets/
│   ├── css/
│   │   ├── style.css
│   │   ├── dashboard.css
│   │   └── responsive.css
│   ├── js/
│   │   ├── core.js
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── reservations.js
│   │   ├── followups.js
│   │   ├── problems.js
│   │   ├── employees.js
│   │   ├── reports.js
│   │   ├── settings.js
│   │   └── app.js
│   ├── vendor/
│   │   ├── chart.umd.min.js
│   │   ├── xlsx.full.min.js
│   │   ├── jspdf.umd.min.js
│   │   └── jspdf.plugin.autotable.min.js
│   └── images/
│       └── logo.png
├── google-apps-script/
│   ├── appsscript.json
│   ├── Code.gs
│   ├── Auth.gs
│   ├── Database.gs
│   ├── Reservations.gs
│   ├── RentalGateAPI.gs
│   ├── FollowUps.gs
│   ├── Problems.gs
│   ├── Employees.gs
│   ├── Permissions.gs
│   ├── Dashboard.gs
│   ├── Reports.gs
│   ├── Export.gs
│   ├── Notifications.gs
│   ├── Triggers.gs
│   ├── Settings.gs
│   ├── Utils.gs
│   └── AuditLog.gs
├── tests/
│   └── crmCore.test.ts
├── package.json
├── README.md
└── .gitignore
```

---

## النشر التلقائي على GitHub Pages

- تم ضبط `vite.config.ts` ليعمل مع مسار المستودع الفرعي `/RENT-CRM/` تلقائيًا عند البناء عبر GitHub Actions (`GITHUB_PAGES=true` و `VITE_BASE_PATH=/RENT-CRM/`).
- يتم بناء ملفات Tailwind CSS وجميع الأصول في مجلد `dist/` مع توليد `dist/.nojekyll` و `dist/404.html` لضمان عدم حدوث أخطاء 404 عند تحديث الصفحات أو فتح الروابط الفرعية.
- عند كل `git push` إلى فرع `main` يعمل ملف `.github/workflows/deploy.yml` تلقائيًا على تثبيت الحزم، تشغيل `npm run build`، ونشر مجلد `dist/` إلى GitHub Pages.
- ملاحظة مهمة في إعدادات GitHub للمستودع: من **Settings > Pages** اختر **Source: GitHub Actions**.

---

## خطوات تثبيت وتشغيل Google Apps Script Backend

1. **إنشاء مشروع Google Apps Script:** افتح [script.google.com](https://script.google.com) وأنشئ مشروعًا جديدًا باسم `RentalGateCRM-Backend`.
2. **تفعيل ملف Manifest (`appsscript.json`):** من **Project Settings** فعّل **Show "appsscript.json" manifest file in editor** واستبدل محتواه بمحتوى `google-apps-script/appsscript.json`.
3. **إضافة جميع ملفات Backend:** أنشئ وانسخ جميع الملفات الموجودة في مجلد `google-apps-script/`:
   - `Code.gs`, `Auth.gs`, `Database.gs`, `Reservations.gs`, `RentalGateAPI.gs`, `FollowUps.gs`, `Problems.gs`, `Employees.gs`, `Permissions.gs`, `Dashboard.gs`, `Reports.gs`, `Export.gs`, `Notifications.gs`, `Triggers.gs`, `Settings.gs`, `Utils.gs`, `AuditLog.gs`.
4. **إعداد Script Properties:** من **Project Settings > Script Properties** أضف:
   - `RG_TOKEN` = التوكن السري لواجهة Rental Gate API (لا يُحفظ أبدًا في ملفات Frontend أو GitHub).
   - (اختياري) `SPREADSHEET_ID` = معرف ملف Google Sheets؛ وإذا لم يُحدد فستقوم دالة التهيئة بإنشاء ملف جديد تلقائيًا باسم `RENTAL_GATE_CRM_DB` وحفظ معرفه.
   - (اختياري) `INITIAL_ADMIN_USER` و `INITIAL_ADMIN_PASS`.
5. **تشغيل دالة التهيئة الأولى:** من محرر Apps Script اختر الدالة `setupRentalGateDatabase` واضغط **Run** ثم امنح الصلاحيات.
   - يتم تلقائيًا إنشاء جميع التبويبات (`Users`, `Employees`, `Reservations`, `Extensions`, `Assignments`, `FollowUps`, `FollowUpHistory`, `Issues`, `Problems`, `ProblemUpdates`, `ActivityLog`, `Notifications`, `Settings`, `Roles`, `Permissions`, `Sessions`, `SyncLog`) مع رؤوس الأعمدة وحساب المدير العام الأول (`admin` / `Admin@123`) وتفعيل المزامنة التلقائية كل 12 ساعة.
6. **نشر Apps Script كـ Web App:** اضغط **Deploy > New deployment > Web app**:
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
   - انسخ رابط `/exec` الناتج.
7. **ربط رابط `/exec` بالموقع:** افتح شاشة تسجيل الدخول أو صفحة **الإعدادات** في الموقع (`https://za7adalarbi-commits.github.io/RENT-CRM/`)، الصق رابط `/exec` واضغط **ربط** ثم اختبر الاتصال واسحب الحجوزات.
