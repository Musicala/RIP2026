/* global window, document */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $('dropZone'),
    csvFile: $('csvFile'),
    kpiReady: $('kpiReady'),
    kpiDupes: $('kpiDupes'),
    kpiInvalid: $('kpiInvalid'),
    btnUpload: $('btnUpload'),
    btnRefresh: $('btnRefresh'),
    btnClear: $('btnClear'),
    status: $('status'),
    uploadSuccess: $('uploadSuccess'),
    previewBody: $('previewBody'),
    calendarTitle: $('calendarTitle'),
    calendarSub: $('calendarSub'),
    calendarGrid: $('calendarGrid'),
    monthNavTitle: $('monthNavTitle'),
    prevMonth: $('prevMonth'),
    nextMonth: $('nextMonth'),
    toastWrap: $('toastWrap')
  };

  let rawRows = [];
  let previewRows = [];
  let uploadRows = [];
  let duplicateRows = [];
  let invalidRows = [];
  let existingHashes = new Set();
  let existingDates = new Set();
  const today = new Date();
  let calendarYear = today.getFullYear();
  let calendarMonth = today.getMonth();
  let holidayDates = new Set();

  init();

  async function init() {
    wire();
    holidayDates = getColombiaHolidays(calendarYear);
    renderCalendar();
    setStatus('Conectando con Firebase...');
    await window.RIPFirebase.ready;
    await refreshExisting();
    setStatus('Listo para cargar CSV');
  }

  function wire() {
    els.csvFile.addEventListener('change', () => {
      const file = els.csvFile.files && els.csvFile.files[0];
      if (file) loadFile(file);
    });
    els.dropZone.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      els.dropZone.classList.add('drag');
    });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag'));
    els.dropZone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      els.dropZone.classList.remove('drag');
      const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) loadFile(file);
    });
    els.previewBody.addEventListener('input', onEditCell);
    els.btnUpload.addEventListener('click', upload);
    els.btnRefresh.addEventListener('click', refreshExisting);
    els.btnClear.addEventListener('click', clearAll);
    els.prevMonth.addEventListener('click', () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      holidayDates = getColombiaHolidays(calendarYear);
      renderCalendar();
    });
    els.nextMonth.addEventListener('click', () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      holidayDates = getColombiaHolidays(calendarYear);
      renderCalendar();
    });
  }

  async function refreshExisting() {
    setStatus('Leyendo clases existentes...');
    const registro = await window.RIPRepository.loadRegistro();
    existingHashes = new Set(registro.map(r => r.recordHash).filter(Boolean));
    const classDates = registro
      .filter(r => norm(r.tipo) === 'clase')
      .map(r => r.fecha || r.fechaRaw)
      .filter(Boolean);
    holidayDates = getColombiaHolidays(calendarYear);
    existingDates = new Set(classDates.filter(d => shouldCountClassDate(d)));
    applyDedupe();
    render();
    renderCalendar();
    setStatus(`Listo. ${existingHashes.size} registros existentes revisados.`);
  }

  async function loadFile(file) {
    hideUploadSuccess();
    setStatus('Leyendo CSV...');
    const text = await file.text();
    const objects = parseCSV(text);
    rawRows = objects.map((row, idx) => fromWixRow(row, idx));
    applyDedupe();
    render();
    setStatus(`CSV cargado: ${rawRows.length} filas revisadas.`);
  }

  function fromWixRow(row, idx) {
    const estudiante = pick(row, ['Nombre del cliente', 'Cliente', 'Nombre', 'Nombre completo', 'Name', 'Email', 'Correo electronico', 'Correo electrónico', 'Email del cliente']);
    const correo = pick(row, ['Email', 'Correo electronico', 'Correo electrónico', 'Email del cliente']);
    const fechaW = pick(row, ['Hora de inicio de reserva', 'Fecha', 'Fecha de reserva', 'Start Time', 'Booking start time']);
    const item = {
      sourceIndex: idx,
      tipo: 'Clase',
      estudiante: estudiante || correo,
      correo,
      fechaW,
      fecha: parseWixDate(fechaW),
      hora: parseWixTime(fechaW),
      servicio: pick(row, ['Nombre del servicio', 'Servicio', 'Service name']),
      profesor: pick(row, ['Miembro del personal', 'Profesor', 'Staff member']),
      pago: '',
      comentario: pick(row, ['Asistencia', 'Comentario', 'Comentarios', 'Notes']),
      importedFrom: 'Wix CSV'
    };
    return recompute(item);
  }

  function recompute(row) {
    const normalized = window.RIPRepository.normalizeRegistro(row);
    return {
      ...row,
      fecha: normalized.fecha,
      fechaRaw: normalized.fecha,
      fechaTs: normalized.fechaTs,
      estudianteKey: normalized.estudianteKey,
      recordHash: normalized.recordHash,
      classUniqueId: normalized.classUniqueId,
      validation: validate(normalized)
    };
  }

  function validate(normalized) {
    const issues = [];
    if (!normalized.estudianteKey) issues.push('sin estudiante');
    if (!normalized.fecha) issues.push('sin fecha');
    if (!normalized.servicio) issues.push('sin servicio');
    if (normalized.fecha && !shouldCountClassDate(normalized.fecha)) issues.push(skipReason(normalized.fecha));
    return issues;
  }

  function applyDedupe() {
    const seen = new Map();
    uploadRows = [];
    duplicateRows = [];
    invalidRows = [];
    previewRows = [];

    for (const row of rawRows) {
      const item = { ...row, status: 'ok', label: 'Lista', reason: '' };
      if (row.validation && row.validation.length) {
        item.status = 'bad';
        item.label = 'Incompleta';
        item.reason = row.validation.join(', ');
        invalidRows.push(item);
      } else if (seen.has(row.recordHash)) {
        item.status = 'warn';
        item.label = 'Duplicada CSV';
        item.reason = `Repetida de la fila ${seen.get(row.recordHash) + 1}`;
        duplicateRows.push(item);
      } else if (existingHashes.has(row.recordHash)) {
        item.status = 'warn';
        item.label = 'Ya existe';
        item.reason = 'Ya esta subida en RIP/Firebase';
        duplicateRows.push(item);
      } else {
        seen.set(row.recordHash, row.sourceIndex);
        uploadRows.push(row);
      }
      previewRows.push(item);
    }
  }

  function onEditCell(ev) {
    const cell = ev.target.closest('[data-field]');
    if (!cell) return;
    const tr = cell.closest('tr');
    const idx = Number(tr && tr.dataset.index);
    const field = cell.dataset.field;
    const row = rawRows[idx];
    if (!row) return;
    row[field] = cell.textContent.trim();
    if (field === 'fechaW') {
      row.fecha = parseWixDate(row.fechaW);
      row.hora = parseWixTime(row.fechaW);
    }
    rawRows[idx] = recompute(row);
    applyDedupe();
    render();
  }

  async function upload() {
    if (!uploadRows.length) return;
    els.btnUpload.disabled = true;
    setStatus('Subiendo clases al RIP...');
    let inserted = 0;
    let skipped = 0;
    try {
      await refreshExisting();
      const batch = [...uploadRows];
      for (const row of batch) {
        if (existingHashes.has(row.recordHash)) {
          skipped++;
          continue;
        }
        const saved = await window.RIPRepository.addRegistroRow(row);
        existingHashes.add(saved.recordHash);
        if (shouldCountClassDate(saved.fecha || saved.fechaRaw)) existingDates.add(saved.fecha || saved.fechaRaw);
        inserted++;
      }
      showUploadSuccess(inserted, skipped);
      applyDedupe();
      render();
      renderCalendar();
    } catch (err) {
      console.error(err);
      toast('Error al subir: ' + (err.message || err), 'warn');
      setStatus('Error al subir clases.');
    }
  }

  function render() {
    els.kpiReady.textContent = String(uploadRows.length);
    els.kpiDupes.textContent = String(duplicateRows.length);
    els.kpiInvalid.textContent = String(invalidRows.length);
    els.btnUpload.disabled = uploadRows.length === 0;
    els.btnClear.disabled = rawRows.length === 0;

    if (!previewRows.length) {
      els.previewBody.innerHTML = '<tr><td colspan="6" class="empty-td">Carga un CSV para revisar las clases.</td></tr>';
      return;
    }

    els.previewBody.innerHTML = previewRows.slice(0, 200).map((row) => `
      <tr data-index="${row.sourceIndex}" title="${escapeHTML(row.reason || '')}">
        <td><span class="status-pill ${row.status}">${escapeHTML(row.label)}</span></td>
        <td contenteditable="true" data-field="estudiante">${escapeHTML(row.estudiante)}</td>
        <td contenteditable="true" data-field="fechaW">${escapeHTML(row.fechaW)}</td>
        <td contenteditable="true" data-field="servicio">${escapeHTML(row.servicio)}</td>
        <td contenteditable="true" data-field="profesor">${escapeHTML(row.profesor)}</td>
        <td contenteditable="true" data-field="comentario">${escapeHTML(row.comentario)}</td>
      </tr>
    `).join('');
  }

  function renderCalendar() {
    const year = calendarYear;
    holidayDates = getColombiaHolidays(year);
    const stats = getMonthStats(year, calendarMonth);
    const title = monthLabel(year, calendarMonth);
    els.calendarTitle.textContent = 'Calendario';
    els.monthNavTitle.textContent = title;
    els.calendarSub.textContent = `${stats.uploaded} dias subidos, ${stats.missing} faltan. Domingos y festivos no cuentan.`;
    els.calendarGrid.innerHTML = renderMonth(year, calendarMonth);
  }

  function renderMonth(year, month) {
    const title = new Date(year, month, 1).toLocaleDateString('es-CO', { month: 'long' });
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const stats = getMonthStats(year, month);
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstDay = (first.getDay() + 6) % 7;
    const total = Math.ceil((firstDay + last.getDate()) / 7) * 7;
    const todayISO = toISO(new Date());
    const days = Array.from({ length: total }, (_, i) => {
      const day = i - firstDay + 1;
      const muted = day < 1 || day > last.getDate();
      const iso = muted ? '' : `${monthKey}-${String(day).padStart(2, '0')}`;
      const skip = iso && !shouldCountClassDate(iso);
      const uploaded = iso && existingDates.has(iso);
      const missing = iso && !skip && !uploaded;
      return `<div class="calendar-day ${muted ? 'muted' : ''} ${uploaded ? 'has-data' : ''} ${missing ? 'missing' : ''} ${skip ? 'skip' : ''} ${iso === todayISO ? 'today' : ''}" title="${escapeHTML(iso ? dayTitle(iso) : '')}">
        ${muted ? '' : `<strong>${day}</strong><div>${uploaded ? 'Subido' : (skip ? 'No cuenta' : 'Falta')}</div>`}
      </div>`;
    }).join('');
    return `<section class="calendar-month">
      <h4>${escapeHTML(title.charAt(0).toUpperCase() + title.slice(1))}</h4>
      <div class="mini-sub">${stats.uploaded} subidos · ${stats.missing} faltan</div>
      <div class="calendar-head"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
      <div class="calendar-mini">${days}</div>
    </section>`;
  }

  function clearAll() {
    rawRows = [];
    previewRows = [];
    uploadRows = [];
    duplicateRows = [];
    invalidRows = [];
    els.csvFile.value = '';
    hideUploadSuccess();
    render();
    setStatus('Esperando archivo');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const src = String(text || '').replace(/\r/g, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === '"' && quoted && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' && !quoted) {
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    const headers = (rows.shift() || []).map(h => h.trim());
    return rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    });
  }

  function pick(row, names) {
    const map = new Map(Object.keys(row || {}).map(k => [norm(k), row[k]]));
    for (const name of names) {
      const value = map.get(norm(name));
      if (String(value || '').trim()) return String(value).trim();
    }
    return '';
  }

  function parseWixDate(value) {
    const raw = String(value || '').trim();
    let m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) {
      let yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : toISO(d);
  }

  function parseWixTime(value) {
    const m = String(value || '').match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
    if (!m) return '';
    let hh = Number(m[1]);
    const ap = String(m[3] || '').toLowerCase();
    if (ap.startsWith('p') && hh < 12) hh += 12;
    if (ap.startsWith('a') && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${m[2]}`;
  }

  function toISO(date) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }

  function parseISODate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function shouldCountClassDate(iso) {
    const d = parseISODate(iso);
    if (!d) return false;
    return d.getDay() !== 0 && !holidayDates.has(iso);
  }

  function skipReason(iso) {
    const d = parseISODate(iso);
    if (!d) return 'fecha invalida';
    if (d.getDay() === 0) return 'domingo no cuenta';
    if (holidayDates.has(iso)) return 'festivo no cuenta';
    return '';
  }

  function dayTitle(iso) {
    if (existingDates.has(iso)) return `${iso}: subido al RIP`;
    const reason = skipReason(iso);
    return reason ? `${iso}: ${reason}` : `${iso}: falta registrar`;
  }

  function getYearStats(year) {
    return Array.from({ length: 12 }, (_, month) => getMonthStats(year, month))
      .reduce((acc, item) => ({ uploaded: acc.uploaded + item.uploaded, missing: acc.missing + item.missing }), { uploaded: 0, missing: 0 });
  }

  function monthLabel(year, month) {
    const title = new Date(year, month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  function getMonthStats(year, month) {
    const last = new Date(year, month + 1, 0).getDate();
    let uploaded = 0;
    let missing = 0;
    for (let day = 1; day <= last; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!shouldCountClassDate(iso)) continue;
      if (existingDates.has(iso)) uploaded++;
      else missing++;
    }
    return { uploaded, missing };
  }

  function getColombiaHolidays(year) {
    const dates = new Set([
      isoFromParts(year, 1, 1),
      isoFromParts(year, 5, 1),
      isoFromParts(year, 7, 20),
      isoFromParts(year, 8, 7),
      isoFromParts(year, 12, 8),
      isoFromParts(year, 12, 25),
      nextMonday(year, 1, 6),
      nextMonday(year, 3, 19),
      nextMonday(year, 6, 29),
      nextMonday(year, 8, 15),
      nextMonday(year, 10, 12),
      nextMonday(year, 11, 1),
      nextMonday(year, 11, 11)
    ]);
    const easter = getEasterDate(year);
    [-3, -2, 43, 64, 71].forEach(offset => dates.add(toISO(addDays(easter, offset))));
    return dates;
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function nextMonday(year, month, day) {
    const date = new Date(year, month - 1, day);
    const offset = (8 - date.getDay()) % 7;
    return toISO(addDays(date, offset));
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function getEasterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function norm(value) {
    return window.RIPCalculations.norm(value);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function toast(message, tone) {
    if (window.RIPUI?.shared?.toast) window.RIPUI.shared.toast(els.toastWrap, message, tone);
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function showUploadSuccess(inserted, skipped) {
    const suffix = skipped ? ` (${skipped} duplicadas omitidas)` : '';
    els.uploadSuccess.classList.add('show');
    els.uploadSuccess.querySelector('span:last-child').textContent = `Registro subido: ${inserted} clase(s)${suffix}`;
    toast(`Registro subido: ${inserted} clase(s).`, 'ok');
    setStatus('Registro subido. Calendario actualizado.');
  }

  function hideUploadSuccess() {
    els.uploadSuccess.classList.remove('show');
  }
})();
