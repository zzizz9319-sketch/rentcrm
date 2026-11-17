/**
 * RENTAL GATE CRM — Report Export Service (CSV UTF-8 BOM & Structured Export Payload)
 */

function exportReportData(session, payload) {
  requirePermission(session, 'export_reports');

  var p = payload || {};
  var format = normalizeStr(p.format).toLowerCase() || 'csv';
  var reportResult = getReports(session, p);
  var rows = Array.isArray(reportResult.rows) ? reportResult.rows : [];
  var reportType = reportResult.reportType || 'all_reservations';

  var fileName = 'rental-gate-' + reportType + '-' + formatDateOnly(new Date()) + '.' + (format === 'json' ? 'json' : 'csv');

  logActivity(
    session.user,
    'تصدير تقرير',
    'Export',
    reportType,
    'تصدير ' + rows.length + ' سجل بصيغة ' + format.toUpperCase()
  );

  if (format === 'json') {
    return {
      fileName: fileName,
      mimeType: 'application/json;charset=utf-8',
      count: rows.length,
      content: JSON.stringify(rows)
    };
  }

  // Build CSV with UTF-8 BOM so Arabic renders properly in Microsoft Excel
  var headers = rows.length > 0 ? Object.keys(rows[0]).filter(function (k) { return k !== 'rawJson'; }) : [];
  var lines = [];
  if (headers.length > 0) {
    lines.push(headers.map(escapeCsvCell).join(','));
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = [];
      for (var c = 0; c < headers.length; c++) {
        var val = row[headers[c]];
        if (Array.isArray(val) || (val && typeof val === 'object')) {
          val = JSON.stringify(val);
        }
        cells.push(escapeCsvCell(val));
      }
      lines.push(cells.join(','));
    }
  }

  return {
    fileName: fileName,
    mimeType: 'text/csv;charset=utf-8',
    count: rows.length,
    content: '\uFEFF' + lines.join('\r\n')
  };
}
