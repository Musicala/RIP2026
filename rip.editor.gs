/**
 * rip.editor.gs — RIP 2026 · Apps Script de Edición del Registro
 * ─────────────────────────────────────────────────────────────────
 * Maneja las acciones enviadas desde ui.editor.js:
 *   action=editRow   → edita una fila existente por ID
 *   action=addRow    → agrega una fila nueva
 *   action=deleteRow → elimina una fila por ID
 *
 * INSTALACIÓN:
 *   1. Abre tu Google Spreadsheet → Extensiones → Apps Script
 *   2. Pega este código en un archivo nuevo (ej: rip.editor.gs)
 *   3. Configura las constantes de la sección CONFIG
 *   4. Despliega como App Web:
 *      - Implementar → Nueva implementación → App web
 *      - Ejecutar como: Yo (tu cuenta)
 *      - Quién tiene acceso: Cualquier usuario (o "Solo yo" si quieres más seguridad)
 *   5. Copia la URL de deployment y pégala en ui.editor.js como RIP_EDITOR_API_URL
 *
 * SEGURIDAD:
 *   - El TOKEN debe coincidir entre ui.editor.js (RIP_EDITOR_TOKEN) y aquí (TOKEN)
 *   - Para producción considera oauth o restricción de dominio
 */

// ════════════════════════════════════════
// CONFIG — ajusta según tu spreadsheet
// ════════════════════════════════════════

const SPREADSHEET_ID = ''; // Deja vacío para usar la hoja activa del script
const SHEET_NAME     = 'Registro 2026';  // Nombre exacto de tu hoja de registro
const TOKEN          = 'MUSICALA-EDITOR-2026'; // Debe coincidir con RIP_EDITOR_TOKEN en ui.editor.js
const LOCKED_COL_LETTERS = new Set(['A', 'K']); // columnas con arrayformula (no tocar)

// Columna donde está el ID de cada fila (header exacto)
const COL_ID = 'ID';

// Mapeo de campos del frontend → headers exactos en el sheet
// Ajusta si tus headers son diferentes
const FIELD_TO_HEADER = {
  tipo:       'Clase',            // Col C en tu TSV
  estudiante: 'Estudiantes',      // Col D
  fechaRaw:   'Fecha',
  hora:       'Hora',
  servicio:   'Servicio',
  profesor:   'Profesor',
  pago:       'Pago',
  comentario: 'Comentario',
  clasif:     'Clasificación',
  clasifPago: 'Clasificación de pagos',
  movimiento: 'Movimiento'
};

// ════════════════════════════════════════
// Entry point JSONP (GET)
// ════════════════════════════════════════

function doGet(e) {
  const params   = e?.parameter || {};
  const callback = params.callback || 'callback';
  let   result   = {};

  try {
    // Validar token
    if ((params.token || '') !== TOKEN) {
      result = { ok: false, error: 'Token inválido.' };
      return buildResponse(callback, result);
    }

    const action = (params.action || '').trim();

    if (action === 'editRow') {
      result = handleEditRow(params);

    } else if (action === 'addRow') {
      result = handleAddRow(params);

    } else if (action === 'deleteRow') {
      result = handleDeleteRow(params);

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

function getSheet() {
  const ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('No encontré la hoja "' + SHEET_NAME + '"');
  return sheet;
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(h => String(h || '').trim());
}

function colIndex(headers, headerName) {
  const idx = headers.indexOf(headerName);
  if (idx === -1) throw new Error('Columna no encontrada: ' + headerName);
  return idx; // 0-based
}

function colLetterFrom1Based(colNum) {
  let n = Number(colNum);
  let s = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    s = String.fromCharCode(65 + mod) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Busca la fila cuyo valor en COL_ID coincide con rowId.
 * Devuelve el número de fila 1-based (1 = headers), o -1 si no existe.
 */
function findRowByID(sheet, headers, rowId) {
  const idColIdx = colIndex(headers, COL_ID); // 0-based
  const lastRow  = sheet.getLastRow();

  if (lastRow < 2) return -1;

  const ids = sheet
    .getRange(2, idColIdx + 1, lastRow - 1, 1)
    .getValues()
    .map(r => String(r[0] || '').trim());

  const idx = ids.indexOf(String(rowId).trim());
  return idx === -1 ? -1 : idx + 2; // +2 porque empieza en fila 2
}

// ════════════════════════════════════════
// Handlers
// ════════════════════════════════════════

/**
 * editRow: actualiza todos los campos de una fila existente
 * params: rowId, data (JSON string)
 */
function handleEditRow(params) {
  const rowId = (params.rowId || '').trim();
  if (!rowId) return { ok: false, error: 'rowId requerido.' };

  const data = parseJSON(params.data);
  if (!data) return { ok: false, error: 'data inválido.' };

  const sheet   = getSheet();
  const headers = getHeaders(sheet);
  const rowNum  = findRowByID(sheet, headers, rowId);

  if (rowNum === -1) {
    return { ok: false, error: 'No encontré la fila con ID: ' + rowId };
  }

  // Actualizar solo los campos que vienen en data
  let updatedCount = 0;
  Object.entries(FIELD_TO_HEADER).forEach(([field, header]) => {
    if (!(field in data)) return;

    let colIdx;
    try { colIdx = colIndex(headers, header); }
    catch (_) { return; } // columna no existe en esta hoja → skip silencioso

    const colLetter = colLetterFrom1Based(colIdx + 1);
    if (LOCKED_COL_LETTERS.has(colLetter)) return; // A/K bloqueadas

    const cell = sheet.getRange(rowNum, colIdx + 1);
    cell.setValue(data[field] ?? '');
    updatedCount++;
  });

  if (updatedCount === 0) {
    return { ok: false, error: 'Ningún campo válido para actualizar.' };
  }

  SpreadsheetApp.flush();
  return { ok: true, rowNum, updatedCount };
}

/**
 * addRow: agrega una fila nueva al final del sheet
 * params: data (JSON string)
 */
function handleAddRow(params) {
  const data = parseJSON(params.data);
  if (!data) return { ok: false, error: 'data inválido.' };

  const sheet   = getSheet();
  const headers = getHeaders(sheet);

  // Construir fila con los headers del sheet en orden
  const newRow = headers.map((h, idx) => {
    const colLetter = colLetterFrom1Based(idx + 1);
    if (LOCKED_COL_LETTERS.has(colLetter)) return '';

    // Buscar el campo que mapea a este header
    const field = Object.entries(FIELD_TO_HEADER).find(([, v]) => v === h)?.[0];
    if (!field) return '';
    return data[field] ?? '';
  });

  // Generar ID único si no viene o está vacío
  const idColIdx = headers.indexOf(COL_ID);
  if (idColIdx !== -1 && !newRow[idColIdx]) {
    newRow[idColIdx] = generateID();
  }

  const newId = idColIdx !== -1 ? String(newRow[idColIdx]) : '';

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  return { ok: true, newId };
}

/**
 * deleteRow: elimina una fila por ID
 * params: rowId
 */
function handleDeleteRow(params) {
  const rowId = (params.rowId || '').trim();
  if (!rowId) return { ok: false, error: 'rowId requerido.' };

  const sheet   = getSheet();
  const headers = getHeaders(sheet);
  const rowNum  = findRowByID(sheet, headers, rowId);

  if (rowNum === -1) {
    return { ok: false, error: 'No encontré la fila con ID: ' + rowId };
  }

  sheet.deleteRow(rowNum);
  SpreadsheetApp.flush();

  return { ok: true, deletedRow: rowNum };
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

function parseJSON(str) {
  try { return JSON.parse(str || '{}'); }
  catch (_) { return null; }
}

/**
 * Genera un ID único tipo "RIP-xxxxxxxx"
 */
function generateID() {
  const rand = Math.random().toString(36).slice(2, 10).toUpperCase();
  const ts   = Date.now().toString(36).slice(-4).toUpperCase();
  return 'RIP-' + ts + rand.slice(0, 4);
}
