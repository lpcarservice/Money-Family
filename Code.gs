/**
 * Personal Finance Tracker - Apps Script Backend
 * รัน setupSheets() ครั้งแรกเพื่อสร้างชีทและหัวตารางอัตโนมัติ
 * แล้ว Deploy > New deployment > Web app (Execute as: Me, Who has access: Anyone)
 * คัดลอก Web App URL ไปใส่ในหน้าแอป
 *
 * แก้โค้ดนี้แล้วต้อง Deploy > Manage deployments > ✏️ > Version: New version > Deploy ทุกครั้ง
 */

const SCHEMAS = {
  'Transactions': ['ID','Date','Type','Category','Amount','Account','Note','CreatedAt'],
  'Debts': ['ID','Name','Type','PrincipalAmount','RemainingAmount','InterestRate','MonthlyPayment','DueDate','StartDate','Status','Note','CreatedAt'],
  'Insurance': ['ID','PolicyName','Type','Company','PolicyNumber','PremiumAmount','PaymentFrequency','StartDate','RenewalDate','CoverageAmount','Beneficiary','Status','Note','CreatedAt'],
  'Assets': ['ID','Name','Type','PurchaseValue','CurrentValue','PurchaseDate','Note','CreatedAt']
};

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone('Asia/Bangkok');
  Object.keys(SCHEMAS).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, SCHEMAS[name].length).setValues([SCHEMAS[name]]);
    sheet.setFrozenRows(1);
  });
  // ลบ Sheet1 ค่าเริ่มต้นถ้ายังไม่ได้ใช้
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
}

/**
 * สคริปต์นี้ทำหน้าที่เป็น API ให้หน้าเว็บที่ host อยู่บน GitHub Pages
 *   ?action=all  → JSON ข้อมูลทุกชีท
 *   POST         → เพิ่ม/ลบ/แก้ข้อมูล
 * ถ้ามีไฟล์ HTML ชื่อ Index อยู่ในโปรเจกต์ การเปิด URL เปล่าๆ จะได้ตัวแอปด้วย (ทางเลือกสำรอง)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (!action) {
      try {
        return HtmlService.createHtmlOutputFromFile('Index')
          .setTitle('สมุดบัญชีส่วนตัว')
          .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
      } catch (noFile) {
        return jsonResponse({ success: true, message: 'API พร้อมใช้งาน — เปิดแอปที่ GitHub Pages' });
      }
    }
    // ดึงทุกชีทในครั้งเดียว — ลดจำนวน request จาก 4 เหลือ 1
    if (action === 'all') {
      return jsonResponse(apiGetAll());
    }
    if (action === 'list') {
      return jsonResponse({ success: true, data: listRows(e.parameter.sheet) });
    }
    return jsonResponse({ success: false, error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message || err) });
  }
}

/* ---- ฟังก์ชันที่หน้าเว็บเรียกตรงผ่าน google.script.run (ไม่ผ่าน HTTP ไม่ติด CORS) ---- */

function apiGetAll() {
  try {
    const out = {};
    Object.keys(SCHEMAS).forEach(function (name) { out[name] = listRows(name); });
    return { success: true, data: out };
  } catch (err) {
    return { success: false, error: String(err && err.message || err) };
  }
}

function apiAdd(sheetName, data) {
  return withLock(function () { return addRow(sheetName, data); });
}

function apiDelete(sheetName, id) {
  return withLock(function () { return deleteRow(sheetName, id); });
}

function apiUpdate(sheetName, id, data) {
  return withLock(function () { return updateRow(sheetName, id, data); });
}

// ล็อกกันสองคนเขียนพร้อมกันแล้วข้อมูลชนกัน
function withLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(25000)) return { success: false, error: 'ระบบกำลังถูกใช้งานอยู่ กรุณาลองใหม่' };
    return fn();
  } catch (err) {
    return { success: false, error: String(err && err.message || err) };
  } finally {
    try { lock.releaseLock(); } catch (ignore) {}
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.action === 'add') return jsonResponse(apiAdd(body.sheet, body.data));
    if (body.action === 'update') return jsonResponse(apiUpdate(body.sheet, body.id, body.data));
    if (body.action === 'delete') return jsonResponse(apiDelete(body.sheet, body.id));
    return jsonResponse({ success: false, error: 'unknown action' });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err && err.message || err) });
  }
}

function getSheet(name) {
  if (!SCHEMAS[name]) throw new Error('Unknown sheet: ' + name);
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet not found: ' + name + ' — ลองรัน setupSheets() อีกครั้ง');
  return sheet;
}

function tz() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
}

/**
 * Sheets เก็บวันที่เป็น Date object พอ JSON.stringify จะกลายเป็น UTC
 * ทำให้ไทย (UTC+7) เห็นวันเลื่อนไป 1 วัน — แปลงเป็นข้อความตามโซนเวลาชีทก่อนส่ง
 */
function formatCell(v, header, zone) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return header === 'CreatedAt'
      ? Utilities.formatDate(v, zone, 'yyyy-MM-dd HH:mm:ss')
      : Utilities.formatDate(v, zone, 'yyyy-MM-dd');
  }
  return v;
}

function listRows(sheetName) {
  const sheet = getSheet(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  const zone = tz();
  const out = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === '') continue;
    const obj = {};
    headers.forEach(function (h, c) { obj[h] = formatCell(values[i][c], h, zone); });
    out.push(obj);
  }
  return out;
}

function findRowNumber(sheet, id) {
  const values = sheet.getDataRange().getValues();
  const idCol = values[0].indexOf('ID');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) return i + 1;
  }
  return -1;
}

function addRow(sheetName, data) {
  const sheet = getSheet(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const id = data.ID || ('ID' + new Date().getTime());
  // แอปส่ง ID มาเอง ถ้าเน็ตหลุดแล้วยิงซ้ำจะไม่เกิดรายการซ้ำ
  if (findRowNumber(sheet, id) > 0) return { success: true, id: id, duplicate: true };
  data.ID = id;
  data.CreatedAt = Utilities.formatDate(new Date(), tz(), 'yyyy-MM-dd HH:mm:ss');
  const row = headers.map(function (h) { return data[h] !== undefined ? data[h] : ''; });
  sheet.appendRow(row);
  return { success: true, id: id };
}

function updateRow(sheetName, id, data) {
  const sheet = getSheet(sheetName);
  const rowNum = findRowNumber(sheet, id);
  if (rowNum < 0) return { success: false, error: 'ID not found' };
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  headers.forEach(function (h, colIdx) {
    if (h !== 'ID' && h !== 'CreatedAt' && data[h] !== undefined) {
      sheet.getRange(rowNum, colIdx + 1).setValue(data[h]);
    }
  });
  return { success: true };
}

function deleteRow(sheetName, id) {
  const sheet = getSheet(sheetName);
  const rowNum = findRowNumber(sheet, id);
  // ลบไปแล้วถือว่าสำเร็จ — ยิงซ้ำตอนเน็ตหลุดจะได้ไม่ขึ้น error หลอก
  if (rowNum < 0) return { success: true, notFound: true };
  sheet.deleteRow(rowNum);
  return { success: true };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
