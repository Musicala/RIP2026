/* global window */
(function () {
  'use strict';

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const src = String(text || '').replace(/\r/g, '');
    const delimiter = detectDelimiter(src);
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === '"' && quoted && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === delimiter && !quoted) {
        row.push(cell.trim());
        cell = '';
      } else if (ch === '\n' && !quoted) {
        row.push(cell.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function detectDelimiter(src) {
    const firstLine = String(src || '').split('\n').find(Boolean) || '';
    const counts = [
      [',', (firstLine.match(/,/g) || []).length],
      [';', (firstLine.match(/;/g) || []).length],
      ['\t', (firstLine.match(/\t/g) || []).length]
    ];
    return counts.sort((a, b) => b[1] - a[1])[0][0] || ',';
  }

  function rowsToObjects(rows) {
    const headerIndex = findObjectHeaderIndex(rows);
    const headers = (rows[headerIndex] || []).map(h => String(h || '').trim());
    return rows.slice(headerIndex + 1).map((r) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    });
  }

  function findObjectHeaderIndex(rows) {
    const calc = window.RIPCalculations;
    let best = 0;
    let bestScore = -1;
    (rows || []).slice(0, 10).forEach((row, idx) => {
      const normalized = row.map(cell => calc.norm(cell));
      const score = normalized.filter(Boolean).length
        + (normalized.some(v => v.includes('estudiante')) ? 20 : 0)
        + (normalized.some(v => v.includes('fecha')) ? 10 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = idx;
      }
    });
    return best;
  }

  function pick(row, names) {
    const calc = window.RIPCalculations;
    const map = new Map(Object.keys(row || {}).map(k => [calc.norm(k), row[k]]));
    for (const n of names) {
      const v = map.get(calc.norm(n));
      if (v !== undefined) return v;
    }
    return '';
  }

  function mapRegistroRow(row) {
    return {
      tipo: pick(row, ['tipo', 'clase']),
      estudiante: pick(row, ['estudiante', 'estudiantes', 'nombre']),
      fecha: pick(row, ['fecha', 'date']),
      hora: pick(row, ['hora']),
      servicio: pick(row, ['servicio', 'service']),
      profesor: pick(row, ['profesor', 'teacher']),
      pago: pick(row, ['pago', 'valorPago', 'valor pago']),
      comentario: pick(row, ['comentario', 'observacion']),
      importedFrom: 'Importador RIP Musicala'
    };
  }

  function parseDateValue(value) {
    const calc = window.RIPCalculations;
    const raw = String(value || '').trim();
    const excelSerial = Number(raw);
    if (/^\d{5}(?:\.\d+)?$/.test(raw) && Number.isFinite(excelSerial)) {
      return calc.toISODate(new Date(Math.round((excelSerial - 25569) * 86400000)));
    }
    const iso = calc.toISODate(value);
    return iso || '';
  }

  function splitDateList(value) {
    return String(value || '')
      .split(/[\n;|]+|,\s*(?=\d{1,4}[/-])/)
      .map(v => parseDateValue(v))
      .filter(Boolean);
  }

  function getStudentName(row) {
    return String(pick(row, [
      'estudiante', 'estudiantes', 'nombre', 'alumno', 'alumna',
      'cliente', 'nombre del cliente', 'student', 'name'
    ]) || '').trim();
  }

  function getProgramacionDates(row) {
    const calc = window.RIPCalculations;
    const dates = [];
    for (const [key, value] of Object.entries(row || {})) {
      const k = calc.norm(key);
      if (!String(value || '').trim()) continue;
      if (['estudiante', 'estudiantes', 'nombre', 'alumno', 'alumna', 'cliente', 'nombre del cliente', 'student', 'name'].includes(k)) continue;
      if (k.includes('fecha') || k.includes('date') || k.includes('programacion') || k.includes('clase') || k.includes('dia') || /^f\d+$/.test(k)) {
        dates.push(...splitDateList(value).filter(isDate2026));
        continue;
      }
      const iso = parseDateValue(value);
      if (isDate2026(iso)) dates.push(iso);
    }
    return Array.from(new Set(dates)).sort();
  }

  function isDate2026(iso) {
    return String(iso || '').startsWith('2026-');
  }

  function importProgramacionRowsFromSheet(rows) {
    const calc = window.RIPCalculations;
    const headerIndex = (rows || []).findIndex((row) => {
      const normalized = row.map(cell => calc.norm(cell));
      return normalized.some(v => v.includes('estudiante')) && normalized.filter(v => v === 'fecha').length >= 2;
    });
    if (headerIndex < 0) return null;

    const header = rows[headerIndex] || [];
    const studentIndex = header.findIndex(cell => calc.norm(cell).includes('estudiante'));
    const dateIndexes = header
      .map((cell, index) => calc.norm(cell) === 'fecha' ? index : -1)
      .filter(index => index >= 0);
    if (studentIndex < 0 || !dateIndexes.length) return null;

    const grouped = new Map();
    let skipped = 0;
    for (const row of rows.slice(headerIndex + 1)) {
      const name = String(row[studentIndex] || '').trim();
      if (!name) {
        skipped++;
        continue;
      }
      const dates = dateIndexes
        .map(index => parseDateValue(row[index]))
        .filter(isDate2026);
      if (!dates.length) {
        skipped++;
        continue;
      }
      const key = calc.norm(name);
      if (!grouped.has(key)) grouped.set(key, { name, dates: new Set() });
      dates.forEach(date => grouped.get(key).dates.add(date));
    }
    return { grouped, skipped };
  }

  function looksLikeProgramacion(rows) {
    let withStudentAndDates = 0;
    let withRegistroFields = 0;
    for (const row of rows.slice(0, 50)) {
      if (getStudentName(row) && getProgramacionDates(row).length) withStudentAndDates++;
      if (pick(row, ['tipo', 'pago', 'valorPago', 'valor pago', 'movimiento'])) withRegistroFields++;
    }
    return withStudentAndDates > 0 && withRegistroFields === 0;
  }

  async function importProgramacionRows(rows) {
    const calc = window.RIPCalculations;
    const grouped = new Map();
    let skipped = 0;

    for (const row of rows) {
      const name = getStudentName(row);
      const dates = getProgramacionDates(row);
      if (!name || !dates.length) {
        skipped++;
        continue;
      }
      const key = calc.norm(name);
      if (!grouped.has(key)) grouped.set(key, { name, dates: new Set() });
      dates.forEach(date => grouped.get(key).dates.add(date));
    }

    return saveProgramacionGroups(grouped, skipped);
  }

  async function saveProgramacionGroups(grouped, skipped) {
    const repo = window.RIPRepository;
    let schedules = 0;
    for (const item of grouped.values()) {
      await repo.saveSchedule(item.name, Array.from(item.dates).sort());
      schedules++;
    }

    await repo.recalculateAllStudents();
    return { ok: true, created: schedules, skipped, schedules, kind: 'programacion' };
  }

  async function importFromJSON(data) {
    const repo = window.RIPRepository;
    const registro = Array.isArray(data) ? data : (data?.registro || []);
    const programacion = Array.isArray(data?.programacion) ? data.programacion : [];
    const seen = new Set();
    let created = 0;
    let skipped = 0;

    const existing = await repo.loadRegistro();
    existing.forEach(r => { if (r.recordHash) seen.add(r.recordHash); });

    for (const raw of registro) {
      const mapped = mapRegistroRow(raw);
      const normalized = repo.normalizeRegistro(mapped);
      if (!normalized.estudianteKey || seen.has(normalized.recordHash)) {
        skipped++;
        continue;
      }
      await repo.addRegistroRow(mapped);
      seen.add(normalized.recordHash);
      created++;
    }

    for (const p of programacion) {
      const name = p.estudiante || p.name || p.studentId;
      if (name) await repo.saveSchedule(name, p.fechas || p.dates || []);
    }

    await repo.recalculateAllStudents();
    return { ok: true, created, skipped, schedules: programacion.length };
  }

  async function importFromCSV(text) {
    const parsed = parseCSV(text);
    const sheet = importProgramacionRowsFromSheet(parsed);
    if (sheet) return saveProgramacionGroups(sheet.grouped, sheet.skipped);
    const rows = rowsToObjects(parsed);
    if (looksLikeProgramacion(rows)) return importProgramacionRows(rows);
    return importFromJSON(rows);
  }

  async function importProgramacionFromCSV(text) {
    const rows = parseCSV(text);
    const sheet = importProgramacionRowsFromSheet(rows);
    if (sheet) return saveProgramacionGroups(sheet.grouped, sheet.skipped);
    return importProgramacionRows(rowsToObjects(rows));
  }

  function mapClienteB2CRow(row) {
    const calc = window.RIPCalculations;
    const byIndex = Object.values(row || {});
    const fecha = parseDateValue(pick(row, ['fecha', 'fecha pago', 'fecha de pago', 'date']) || byIndex[1]);
    const usuarios = [];
    const aliases = [
      ['usuario 1', 'usuario1', 'estudiante 1', 'estudiante1', 'cliente 1'],
      ['usuario 2', 'usuario2', 'estudiante 2', 'estudiante2', 'cliente 2'],
      ['usuario 3', 'usuario3', 'estudiante 3', 'estudiante3', 'cliente 3'],
      ['usuario 4', 'usuario4', 'estudiante 4', 'estudiante4', 'cliente 4'],
      ['usuario 5', 'usuario5', 'estudiante 5', 'estudiante5', 'cliente 5']
    ];
    for (let i = 0; i < 5; i++) {
      const base = 3 + (i * 4);
      const estudiante = pick(row, aliases[i]) || byIndex[base] || byIndex[base + 1] || '';
      const servicio = pick(row, [`servicio ${i + 1}`, `servicio${i + 1}`]) || byIndex[base + 1] || byIndex[base + 2] || '';
      const precio = pick(row, [`precio ${i + 1}`, `precio${i + 1}`, `valor ${i + 1}`, `valor${i + 1}`]) || byIndex[base + 2] || byIndex[base + 3] || '';
      if (String(estudiante || servicio || precio).trim()) {
        usuarios.push({ index: i + 1, estudiante, servicio, precio: calc.safeNum(precio) });
      }
    }
    const servicio6 = pick(row, ['servicio 6', 'servicio6']) || byIndex[23] || '';
    const precio6 = pick(row, ['precio 6', 'precio6', 'valor 6', 'valor6']) || byIndex[24] || '';
    return {
      fecha,
      usuarios,
      servicio6,
      precio6: calc.safeNum(precio6),
      recargo: calc.safeNum(pick(row, ['recargo']) || byIndex[25]),
      descuento: calc.safeNum(pick(row, ['descuento']) || byIndex[26]),
      total: calc.safeNum(pick(row, ['total']) || byIndex[27]),
      medioPago: pick(row, ['medio pago', 'medio de pago', 'medio']) || byIndex[28] || '',
      FEVM: calc.safeNum(pick(row, ['fevm', 'FEVM']) || byIndex[29]),
      importedFrom: 'Importador Clientes B2C'
    };
  }

  async function importClientesFromCSV(text) {
    const rows = rowsToObjects(parseCSV(text));
    let created = 0;
    let skipped = 0;
    for (const row of rows) {
      const mapped = mapClienteB2CRow(row);
      if (!mapped.fecha || !mapped.usuarios.length) {
        skipped++;
        continue;
      }
      await window.RIPRepository.addClienteB2C(mapped);
      created++;
    }
    return { ok: true, kind: 'clientesB2C', created, skipped };
  }

  window.RIPImporter = { parseCSV, importFromCSV, importFromJSON, importProgramacionFromCSV, importClientesFromCSV };
})();
