/**
 * rip.programacion.gs — RIP 2026 · Apps Script de Programación
 * ──────────────────────────────────────────────────────────────
 * Conecta el cuadro interactivo de programación (rip.programacion.js)
 * con una hoja "Programación 2026" del spreadsheet.
 *
 * ACCIONES:
 *   action=getAllData   → devuelve dashboard con stats de todos los estudiantes
 *   action=getSchedule → devuelve las fechas programadas de un estudiante
 *   action=saveSchedule→ guarda/actualiza las fechas de un estudiante
 *
 * INSTALACIÓN:
 *   1. Abre tu Google Spreadsheet → Extensiones → Apps Script
 *   2. Pega este código en un archivo nuevo (ej: rip.programacion.gs)
 *   3. Configura las constantes de CONFIG
 *   4. Crea la hoja "Programación 2026" con el formato indicado abajo,
 *      O ejecuta setupSheet() una sola vez para crearla automáticamente.
 *   5. Despliega como App Web:
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 *   6. Reemplaza API_URL en rip.programacion.js con la URL de deployment.
 *
 * FORMATO DE LA HOJA "Programación 2026":
 *   Col A: Estudiante (nombre)
 *   Col B: Última actualización (timestamp)
 *   Col C–Z: Fecha 1, Fecha 2, ... Fecha 24  (hasta 24 columnas = MAX_CLASSES)
 *
 * DASHBOARD (getAllData):
 *   El dashboard se calcula dinámicamente desde los datos de la hoja.
 *   No necesitas columna de estado; se calcula por cantidad de fechas futuras.
 */

// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════

const PROG_SPREADSHEET_ID = ''; // Deja vacío para hoja activa del script
const PROG_SHEET_NAME     = 'Programación 2026';
const PROG_TOKEN          = 'MUSICALA-PROGRAMACION-2026'; // Mismo que API_TOKEN en rip.programacion.js
const MAX_CLASSES         = 24;
const MIN_FUTURE_OK       = 2; // Mínimo de clases futuras para considerarse "completo"

// ════════════════════════════════════════
// Entry point
// ════════════════════════════════════════

function doGet(e) {
  const params   = e?.parameter || {};
  const callback = params.callback || 'callback';
  let   result   = {};

  try {
    const action = (params.action || '').trim();

    // getAllData no requiere token (es lectura pública del dashboard)
    // saveSchedule sí requiere token
    if (action === 'saveSchedule') {
      if ((params.token || '') !== PROG_TOKEN) {
        result = { ok: false, error: 'Token inválido.' };
        return buildResponse(callback, result);
      }
    }

    if (action === 'getAllData') {
      result = handleGetAllData(params);

    } else if (action === 'getSchedule') {
      result = handleGetSchedule(params);

    } else if (action === 'saveSchedule') {
      result = handleSaveSchedule(params);

    } else {
      result = { ok: false, error: 'Acción desconocida: ' + action };
    }

  } catch (err) {
    result = { ok: false, error: err.message || String(err) };
  }

  return buildResponse(callback, result);
}

// ════════════════════════════════════════
// Helpers de hoja
// ════════════════════════════════════════

function getProgSheet() {
  const ss = PROG_SPREADSHEET_ID
    ? SpreadsheetApp.openById(PROG_SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(PROG_SHEET_NAME);

  // Auto-crear si no existe
  if (!sheet) {
    sheet = createProgSheet(ss);
  }

  return sheet;
}

function createProgSheet(ss) {
  const sheet = ss.insertSheet(PROG_SHEET_NAME);

  // Headers
  const headers = ['Estudiante', 'Última actualización'];
  for (let i = 1; i <= MAX_CLASSES; i++) {
    headers.push('Fecha ' + i);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  // Formato visual
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setBackground('#1A3B6E');
  headerRange.setFontColor('#FFFFFF');
  headerRange.setFontWeight('bold');

  sheet.setColumnWidth(1, 200); // Estudiante
  sheet.setColumnWidth(2, 180); // Última actualización

  Logger.log('Hoja "' + PROG_SHEET_NAME + '" creada correctamente.');
  return sheet;
}

/**
 * Devuelve todas las filas como array de objetos
 * { name, updatedAt, fechas: [ISO...] }
 */
function getAllRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet.getRange(2, 1, lastRow - 1, 2 + MAX_CLASSES).getValues();

  return data
    .filter(r => String(r[0] || '').trim())
    .map(r => {
      const name      = String(r[0] || '').trim();
      const updatedAt = r[1] ? Utilities.formatDate(
        new Date(r[1]),
        Session.getScriptTimeZone(),
        'yyyy-MM-dd HH:mm'
      ) : '';

      const fechas = [];
      for (let i = 2; i < 2 + MAX_CLASSES; i++) {
        const raw = String(r[i] || '').trim();
        fechas.push(raw ? formatDateISO(raw) : '');
      }

      return { name, updatedAt, fechas };
    });
}

/**
 * Busca la fila de un estudiante por nombre normalizado.
 * Devuelve { rowNum (1-based), rowData } o null.
 */
function findStudentRow_(sheet, studentName) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const normTarget = normStr(studentName);
  const names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < names.length; i++) {
    if (normStr(names[i][0]) === normTarget) {
      return { rowNum: i + 2 };
    }
  }
  return null;
}

// ════════════════════════════════════════
// Handlers
// ════════════════════════════════════════

/**
 * getAllData: dashboard completo
 * Respuesta: { ok, today, dashboard: [...], minFuture }
 */
function handleGetAllData(params) {
  const sheet   = getProgSheet();
  const rows    = getAllRows(sheet);
  const today   = todayISO_();
  const minFut  = Number(params.minFuture || MIN_FUTURE_OK);

  const dashboard = rows.map(r => {
    const cleanFechas = r.fechas.filter(Boolean);
    const futuras     = cleanFechas.filter(f => f >= today);
    const futureCount = futuras.length;
    const nextISO     = futuras[0] || null;
    const filled      = cleanFechas.length;

    const noSchedule = filled === 0;
    const lowFuture  = !noSchedule && futureCount < minFut;

    let estado = 'Completo';
    if (noSchedule) estado = 'Sin programación';
    else if (futureCount === 0) estado = 'Sin futuras';
    else if (lowFuture) estado = 'Por completar';

    return {
      name:        r.name,
      updatedAt:   r.updatedAt,
      filled,
      futureCount,
      nextISO:     nextISO || '—',
      noSchedule,
      lowFuture,
      estado
    };
  });

  return {
    ok: true,
    today,
    minFuture: minFut,
    dashboard
  };
}

/**
 * getSchedule: devuelve las fechas de un estudiante
 * params: student
 * Respuesta: { ok, student, fechas: [ISO...] }
 */
function handleGetSchedule(params) {
  const studentName = (params.student || '').trim();
  if (!studentName) return { ok: false, error: 'Parámetro student requerido.' };

  const sheet = getProgSheet();
  const found = findStudentRow_(sheet, studentName);

  if (!found) {
    // Estudiante sin programación: devolver array vacío (no es error)
    return {
      ok: true,
      student: studentName,
      fechas:  new Array(MAX_CLASSES).fill('')
    };
  }

  const rowData = sheet
    .getRange(found.rowNum, 3, 1, MAX_CLASSES)
    .getValues()[0];

  const fechas = rowData.map(v => {
    const raw = String(v || '').trim();
    return raw ? formatDateISO(raw) : '';
  });

  return {
    ok: true,
    student: studentName,
    fechas
  };
}

/**
 * saveSchedule: guarda/actualiza las fechas de un estudiante
 * params: student, dates (JSON array de strings ISO)
 * Respuesta: { ok, student, savedCount }
 */
function handleSaveSchedule(params) {
  const studentName = (params.student || '').trim();
  if (!studentName) return { ok: false, error: 'Parámetro student requerido.' };

  let fechas;
  try {
    fechas = JSON.parse(params.dates || '[]');
    if (!Array.isArray(fechas)) throw new Error('dates debe ser array');
  } catch (e) {
    return { ok: false, error: 'dates inválido: ' + e.message };
  }

  // Normalizar a exactamente MAX_CLASSES elementos
  const normalized = [];
  for (let i = 0; i < MAX_CLASSES; i++) {
    const raw = String(fechas[i] || '').trim();
    normalized.push(raw || '');
  }

  const sheet     = getProgSheet();
  const now       = new Date();
  const found     = findStudentRow_(sheet, studentName);
  const savedCount = normalized.filter(Boolean).length;

  if (found) {
    // Actualizar fila existente
    sheet.getRange(found.rowNum, 2).setValue(now);           // timestamp
    sheet.getRange(found.rowNum, 3, 1, MAX_CLASSES)
         .setValues([normalized]);
  } else {
    // Agregar nueva fila
    const newRow = [studentName, now, ...normalized];
    sheet.appendRow(newRow);
  }

  SpreadsheetApp.flush();

  return {
    ok: true,
    student:    studentName,
    savedCount
  };
}

// ════════════════════════════════════════
// Función de setup manual (ejecuta una vez)
// ════════════════════════════════════════

/**
 * Ejecuta esta función manualmente desde el editor de Apps Script
 * para crear la hoja si aún no existe.
 */
function setupSheet() {
  const sheet = getProgSheet();
  Logger.log('Hoja lista: ' + sheet.getName());
}

// ════════════════════════════════════════
// Utilidades
// ════════════════════════════════════════

function buildResponse(callback, data) {
  const json = JSON.stringify(data);
  const js   = callback + '(' + json + ')';
  return ContentService
    .createTextOutput(js)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function normStr(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function todayISO_() {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
}

/**
 * Intenta convertir cualquier formato de fecha a yyyy-MM-dd.
 * Acepta: Date, dd/mm/yyyy, yyyy-MM-dd, y formatos de Sheets.
 */
function formatDateISO(value) {
  if (!value) return '';

  // Si ya es ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);

  // dd/mm/yyyy
  const dmy = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  }

  // Date object de Sheets
  try {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
  } catch (_) {}

  return String(value).trim();
}
