/* =============================================================================
  ui.ficha.js — RIP UI Ficha (READ-ONLY) + Históricos dinámicos + Sync Programación
  - openFichaByKey: abre ficha completa del estudiante actual (2026)
  - openStudentFromSearch: abre desde índice global (2023/2024/2025/2026)
  - Botones dinámicos por años disponibles
  - Carga TSV histórico bajo demanda
  - Cache por año + estudiante
  - Integra automáticamente bloque de Programación si existe window.RIPProgramacion
  - Resumen mejorado:
    * Última clase
    * Último pago
    * Saldo total
    * Desglose por categoría
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.ficha.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, toast, norm, show, hide, setText } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});
  const EDITOR_API_URL = window.RIP_EDITOR_API_URL || '';
  const EDITOR_TOKEN = window.RIP_EDITOR_TOKEN || 'MUSICALA-EDITOR-2026';

  // =========================
  // Config años / TSV / columnas
  // =========================
  const TSV_URLS = {
    "2026": "https://docs.google.com/spreadsheets/d/e/2PACX-1vREJFkqvhXwjBNPCQXTg4pHXUplygJU1ZZG6-xgOeAJ2ifnEMHmuoDJKwQIpxVfGfCrmfmNCS_8RHTc/pub?gid=1810443337&single=true&output=tsv",
    "2025": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv",
    "2024": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhAIn0x5D-p80AVkXrBaLhVyqakoQabAvUw3UmEzoo__1AXaWXM1dfvdagWNkHGO4YY_Txxb7OQHM/pub?gid=1810443337&single=true&output=tsv",
    "2023": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRL2kvbjxpU7qoPgiyoytANin1VsvqRx8BTZpSqBOJw_Lyid3NGPc88e3kwFiOsHpOPIgRricd64cin/pub?gid=1810443337&single=true&output=tsv"
  };

  const COLMAP = {
    "2023": { fecha: 1, nombre: 2, servicio: 4, hora: 7, pago: null, profesor: null },
    "2024": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2025": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2026": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null }
  };

  const YEAR_ORDER = ['2026', '2025', '2024', '2023'];

  // Cache: year::norm(studentName) -> { headersSlice, rowsSlice, studentName, year }
  const historyCache = new Map();

  // Cache TSV bruto por año
  const tsvYearCache = new Map();

  // =========================
  // TSV helpers
  // =========================
  async function fetchTSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('No pude cargar TSV (' + res.status + ')');
    return await res.text();
  }

  function parseTSV(text) {
    const lines = String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .filter(Boolean);

    const rows = lines.map((l) => l.split('\t'));
    const headers = rows.shift() || [];
    return { headers, rows };
  }

  async function getParsedYearTSV(year) {
    const y = String(year || '').trim();
    if (!TSV_URLS[y]) throw new Error(`No hay URL configurada para ${y}`);

    if (tsvYearCache.has(y)) return tsvYearCache.get(y);

    const text = await fetchTSV(TSV_URLS[y]);
    const parsed = parseTSV(text);
    tsvYearCache.set(y, parsed);
    return parsed;
  }

  function parseDMY(dmy) {
    const s = String(dmy || '').trim();

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let dd = parseInt(m[1], 10);
      let mm = parseInt(m[2], 10);
      let yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      const dt = new Date(yy, mm - 1, dd);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const yy = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const dd = parseInt(m[3], 10);
      const dt = new Date(yy, mm - 1, dd);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    return 0;
  }

  function getHistorySliceRange(year) {
    return { start: 2, end: 12 };
  }

  function buildSimpleHeaders(headers, start, end) {
    return (headers || []).slice(start, end);
  }

  async function loadStudentByYear(year, studentName) {
    const y = String(year || '').trim();
    const studentKey = norm(studentName);
    if (!y || !studentKey) return { headersSlice: [], rowsSlice: [], year: y, studentName };

    const cacheKey = `${y}::${studentKey}`;
    if (historyCache.has(cacheKey)) return historyCache.get(cacheKey);

    const parsed = await getParsedYearTSV(y);
    const map = COLMAP[y];
    if (!map) throw new Error(`No hay COLMAP para ${y}`);

    const idxStudent = Number(map.nombre);
    const idxFecha = Number(map.fecha);

    const { start, end } = getHistorySliceRange(y);
    const headersSlice = buildSimpleHeaders(parsed.headers, start, end);

    const rowsSlice = parsed.rows
      .filter((r) => norm(r[idxStudent] || '') === studentKey)
      .map((r) => ({
        r,
        ts: parseDMY(r[idxFecha] || '')
      }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map((x) => x.r.slice(start, end));

    const pack = { headersSlice, rowsSlice, year: y, studentName };
    historyCache.set(cacheKey, pack);
    return pack;
  }

  // =========================
  // Helpers data / entry
  // =========================
  function getSearchEntryByName(state, studentName) {
    const pool =
      state.searchStudents ||
      state.studentSearchIndex ||
      state.globalStudentIndex ||
      state.allStudents ||
      [];

    const key = norm(studentName);
    if (!key) return null;

    return pool.find((s) => norm(s?.name) === key) || null;
  }

  function getCurrentStudentSearchEntry(state) {
    const name = state.currentStudentName || '';
    if (!name) return null;

    if (state.currentSearchEntry && norm(state.currentSearchEntry.name) === norm(name)) {
      return state.currentSearchEntry;
    }

    return getSearchEntryByName(state, name);
  }

  function getAvailableYearsForEntry(entry, state) {
    const set = new Set();

    if (entry && Array.isArray(entry.years)) {
      entry.years.forEach((y) => {
        const yy = String(y || '').trim();
        if (yy) set.add(yy);
      });
    }

    const currentName = entry?.name || state.currentStudentName || '';
    if (currentName) {
      const exists2026 = (state.allStudents || []).some((s) => norm(s.name) === norm(currentName));
      if (exists2026) set.add('2026');
    }

    return YEAR_ORDER.filter((y) => set.has(y));
  }

  function isCurrentYearAvailable(year, state) {
    const entry = getCurrentStudentSearchEntry(state);
    const years = getAvailableYearsForEntry(entry, state);
    return years.includes(String(year));
  }

  function ensureYearButtonsHost(ctx) {
    const { el } = ctx;

    if (el.yearButtonsHost) return el.yearButtonsHost;

    let host = document.getElementById('yearButtonsHost');
    if (!host && el.fichaView) {
      host = document.createElement('div');
      host.id = 'yearButtonsHost';
      host.className = 'year-buttons-host';

      const anchor =
        el.fichaSub?.parentElement ||
        el.fichaTitle?.parentElement ||
        el.fichaView;

      anchor.appendChild(host);
    }

    el.yearButtonsHost = host;
    return host;
  }

  // =========================
  // Render 2026
  // =========================
  function inferTipoLabel(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;
    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  function renderTable2026(ctx, rows) {
    const { el } = ctx;
    if (!el.tableBody) return;

    const editable = !!ctx.__fichaEditMode;
    const theadRow = document.querySelector('#tablaContainer thead tr');
    if (theadRow) {
      const hasAction = !!theadRow.querySelector('.th-ficha-actions');
      if (editable && !hasAction) {
        const th = document.createElement('th');
        th.className = 'th-ficha-actions';
        th.textContent = 'Acciones';
        theadRow.appendChild(th);
      }
      if (!editable && hasAction) theadRow.querySelector('.th-ficha-actions')?.remove();
    }

    if (!rows || !rows.length) {
      el.tableBody.innerHTML = `<tr><td colspan="${editable ? 12 : 11}" class="empty-td">No hay registros para este estudiante.</td></tr>`;
      return;
    }

    const html = rows
      .slice(0, 1800)
      .map((r) => {
        const tipo = inferTipoLabel(r);
        const mov = Number(r.movimiento) || 0;
        const movClass = mov < 0 ? 'mov-neg' : mov > 0 ? 'mov-pos' : 'mov-zero';
        const movText = `${mov > 0 ? '+' : ''}${fmtMoney(mov)}`;
        const actions = editable
          ? `<td class="td-ficha-actions"><button class="btn small ghost" type="button" data-edit-row="${escapeHTML(r.id || '')}">Editar</button> <button class="btn small" type="button" data-dup-row="${escapeHTML(r.id || '')}">Duplicar</button> <button class="btn small ghost" type="button" data-del-row="${escapeHTML(r.id || '')}">Eliminar</button></td>`
          : '';

        return `
          <tr>
            <td>${escapeHTML(r.estudiante)}</td>
            <td>${escapeHTML(tipo)}</td>
            <td>${escapeHTML(r.fechaRaw)}</td>
            <td>${escapeHTML(r.hora)}</td>
            <td>${escapeHTML(r.servicio)}</td>
            <td>${escapeHTML(r.profesor)}</td>
            <td>${escapeHTML(r.pago)}</td>
            <td>${escapeHTML(r.comentario)}</td>
            <td>${escapeHTML(r.clasif)}</td>
            <td>${escapeHTML(r.clasifPago)}</td>
            <td class="${movClass}">${movText}</td>
            ${actions}
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML = html;
    if (editable) bindEditRowActions(ctx);
  }

  // =========================
  // Render históricos simples
  // =========================
  function setTableHeader(headersSlice) {
    const thead = document.querySelector('#tablaContainer thead');
    if (!thead) return;

    thead.innerHTML =
      '<tr>' + headersSlice.map((h) => '<th>' + escapeHTML(h || '') + '</th>').join('') + '</tr>';
  }

  function setTableBodySimple(rowsSlice, year) {
    const tbody =
      document.querySelector('#tablaContainer tbody') ||
      document.querySelector('#tableBody');

    if (!tbody) return;

    if (!rowsSlice.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-td">Sin registros ${escapeHTML(year)} para este estudiante.</td></tr>`;
      return;
    }

    tbody.innerHTML = rowsSlice
      .map((r) => '<tr>' + r.map((c) => '<td>' + escapeHTML(c ?? '') + '</td>').join('') + '</tr>')
      .join('');
  }

  // =========================
  // View helpers
  // =========================
  function showFichaContainer(ctx) {
    const { el } = ctx;

    show(el.fichaView);
    hide(el.dashboardClasView);
    hide(el.dashboardSaldoView);
    hide(el.dashboardProgView);

    show(el.btnBackToDash);
  }

  function resetFichaVisualState(ctx, state) {
    const { el } = ctx;

    state.__viewYear = '2026';

    if (!state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      state.__thead2026HTML = thead ? thead.innerHTML : '';
    }

    if (state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      if (thead) thead.innerHTML = state.__thead2026HTML;
    }

    show(el.fichaSummaryBlock);
    show(el.tablaContainer);
    show(el.programacionStudentView);

    if (el.programacionEmbed) el.programacionEmbed.innerHTML = '';
  }

  // =========================
  // Helpers resumen 2026
  // =========================
  function isPagoRow(r) {
    const tipo = String(r?.tipo || '').trim().toLowerCase();
    if (tipo === 'pago') return true;
    if (tipo === 'clase') return false;
    return !!String(r?.pago || '').trim();
  }

  function isClaseRow(r) {
    const tipo = String(r?.tipo || '').trim().toLowerCase();
    if (tipo === 'clase') return true;
    if (tipo === 'pago') return false;
    return !String(r?.pago || '').trim();
  }

  function getLastPagoRow(rows) {
    for (const r of rows || []) {
      if (isPagoRow(r)) return r;
    }
    return null;
  }

  function getLastClaseRow(rows) {
    for (const r of rows || []) {
      if (isClaseRow(r)) return r;
    }
    return null;
  }

  function getCategoryKey(r) {
    const fromPago = String(r?.clasifPago || '').trim();
    const fromClase = String(r?.clasif || '').trim();
    const fallback = String(r?.servicio || '').trim();

    if (isPagoRow(r) && fromPago) return fromPago;
    return fromClase || fromPago || fallback || 'Sin categor�a';
  }

  function buildSaldoBreakdown(rows) {
    const totals = new Map();
    let saldoTotal = 0;

    for (const r of rows || []) {
      const mov = Number(r?.movimiento) || 0;
      saldoTotal += mov;

      const cat = getCategoryKey(r);
      totals.set(cat, (totals.get(cat) || 0) + mov);
    }

    const items = Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => {
        const absDiff = Math.abs(b.value) - Math.abs(a.value);
        if (absDiff !== 0) return absDiff;
        return String(a.label).localeCompare(String(b.label), 'es');
      });

    return { saldoTotal, items };
  }

  function saldoClass(value) {
    if (value < 0) return 'neg';
    if (value > 0) return 'pos';
    return 'zero';
  }

  function saldoText(value) {
    return `${value > 0 ? '+' : ''}${fmtMoney(value)}`;
  }

    function parsePagoValue(raw) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    const cleaned = s
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function getPagosStats(rows) {
    const pagos = (rows || []).filter(isPagoRow);
    const lastPago = pagos[0] || null;
    let totalPagos = 0;
    for (const p of pagos) totalPagos += parsePagoValue(p?.pago);
    return {
      lastPagoValor: parsePagoValue(lastPago?.pago),
      totalPagos
    };
  }

  function renderFichaSummary(ctx, student, ficha, year) {
    const { el } = ctx;
    const rows = ficha?.rows || [];

    setText(el.fichaTitle, 'Ficha · ' + (student ? student.name : 'Estudiante'));
    setText(el.fichaSub, `Registro ${year || '2026'} (solo lectura)`);
    setText(el.fichaStudent, student ? student.name : '—');

    const lastRow = rows[0] || null;
    const lastPago = getLastPagoRow(rows);
    const lastClase = getLastClaseRow(rows);
    const { saldoTotal, items } = buildSaldoBreakdown(rows);
    const pagosStats = getPagosStats(rows);

    setText(el.fichaFecha, lastRow ? (lastRow.fechaRaw || '—') : '—');

    setText(
      el.fichaUltPago,
      lastPago
        ? `${lastPago.fechaRaw || '—'}${lastPago.pago ? ' · ' + lastPago.pago : ''}`
        : '—'
    );

    setText(
      el.fichaProxPago,
      lastClase
        ? `${lastClase.fechaRaw || '—'}${lastClase.servicio ? ' · ' + lastClase.servicio : ''}`
        : '—'
    );
    setText(el.fichaUltPagoValor, pagosStats.lastPagoValor ? fmtMoney(pagosStats.lastPagoValor) : '—');
    setText(el.fichaTotalPagos, pagosStats.totalPagos ? fmtMoney(pagosStats.totalPagos) : '—');

    if (el.fichaSaldosMini) {
      const compact = [`Saldo final ${saldoText(saldoTotal)}`].concat((items || []).map((item) => `${String(item.label || '').trim()} ${saldoText(item.value)}`))
        .join(' · ');

      el.fichaSaldosMini.innerHTML = `
        <div class="saldo-mini">
          <span class="saldo-chip soft">${escapeHTML(compact)}</span>
        </div>
      `;
    }
  }

  function renderSimpleSummary(ctx, studentName, year, rowsSlice) {
    const { el } = ctx;

    setText(el.fichaTitle, 'Ficha · ' + (studentName || 'Estudiante'));
    setText(el.fichaSub, `Registro ${year} (solo lectura)`);

    setText(el.fichaStudent, studentName || '—');

    const firstDate = rowsSlice?.[0]?.[2] || rowsSlice?.[0]?.[1] || '—';
    setText(el.fichaFecha, firstDate || '—');
    setText(el.fichaUltPago, '—');
    setText(el.fichaUltPagoValor, '—');
    setText(el.fichaTotalPagos, '—');
    setText(el.fichaProxPago, '—');

    if (el.fichaSaldosMini) {
      el.fichaSaldosMini.innerHTML = `
        <span class="pill soft">Histórico ${escapeHTML(year)}</span>
      `;
    }
  }

  async function syncProgramacionIfAvailable(ctx, state, studentName, year) {
    if (!studentName) return;
    if (String(year) !== '2026') return;
    if (!window.RIPProgramacion?.attachStudent) return;

    try {
      show(ctx?.el?.programacionStudentView);
      if (!state?.prog?.data && window.RIPProgramacion?.loadResumen) {
        state.prog = state.prog || {};
        state.prog.data = await window.RIPProgramacion.loadResumen();
      }
      await window.RIPProgramacion.attachStudent(ctx, state, studentName);
    } catch (err) {
      console.warn('No se pudo sincronizar bloque de Programación:', err);
    }
  }

  // =========================
  // Botones dinámicos por año
  // =========================
  function updateLegacyYearButtons(ctx, years, activeYear) {
    const { el } = ctx;

    if (el.btnTop2025) {
      el.btnTop2025.style.display = years.includes('2025') ? '' : 'none';
      el.btnTop2025.textContent = activeYear === '2025' ? '🗂️ Volver 2026' : '🗂️ 2025';
    }

    if (el.btn2025) {
      el.btn2025.style.display = years.includes('2025') ? '' : 'none';
      el.btn2025.textContent = activeYear === '2025' ? 'Volver 2026' : '2025';
    }
  }

  function renderYearButtons(ctx, state) {
    const host = ensureYearButtonsHost(ctx);
    if (!host) return;

    const entry = getCurrentStudentSearchEntry(state);
    const years = getAvailableYearsForEntry(entry, state);

    updateLegacyYearButtons(ctx, years, state.__viewYear || '2026');

    if (!years.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = years
      .map((year) => {
        const active = String(state.__viewYear || '2026') === String(year);
        return `
          <button
            type="button"
            class="year-chip ${active ? 'active' : ''}"
            data-year="${escapeHTML(year)}"
          >${escapeHTML(year)}</button>
        `;
      })
      .join('');

    host.querySelectorAll('[data-year]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const year = btn.getAttribute('data-year') || '';
        if (!year) return;
        await openStudentYear(ctx, state, year);
      });
    });
  }

  // =========================
  // Abrir años
  // =========================
  async function openStudentYear(ctx, state, year) {
    const y = String(year || '').trim();
    const studentName = state.currentStudentName || '';
    const { el } = ctx;

    if (!y || !studentName) return;
    if (!isCurrentYearAvailable(y, state)) return;

    if (!state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      state.__thead2026HTML = thead ? thead.innerHTML : '';
    }

    if (y === '2026') {
      state.__viewYear = '2026';
      toggleEditButtons(ctx, !!ctx.__fichaEditMode);

      if (state.currentStudentKey) {
        const student = (state.allStudents || []).find((s) => s.key === state.currentStudentKey);
        const ficha = window.RIPCore.getStudentFicha(state.registro, state.currentStudentKey);

        renderFichaSummary(ctx, student, ficha, '2026');

        const thead = document.querySelector('#tablaContainer thead');
        if (thead && state.__thead2026HTML) thead.innerHTML = state.__thead2026HTML;

        renderTable2026(ctx, ficha.rows || []);
        syncProgramacionIfAvailable(ctx, state, state.currentStudentName, '2026');
      }

      renderYearButtons(ctx, state);
      return;
    }

    try {
      state.__viewYear = y;
      renderYearButtons(ctx, state);

      if (el.btnTop2025) el.btnTop2025.disabled = true;
      if (el.btn2025) el.btn2025.disabled = true;

      setText(el.fichaSub, `Cargando registro ${y}...`);

      const pack = await loadStudentByYear(y, studentName);

      renderSimpleSummary(ctx, studentName, y, pack.rowsSlice);
      setTableHeader(pack.headersSlice);
      setTableBodySimple(pack.rowsSlice, y);
      hide(el.programacionStudentView);
      ctx.__fichaEditMode = false;
      toggleEditButtons(ctx, false);

      renderYearButtons(ctx, state);
    } catch (e) {
      console.error(e);
      toast(el.toastWrap, `No pude cargar ${y}. Revisa que el TSV esté público.`, 'warn');

      state.__viewYear = '2026';
      renderYearButtons(ctx, state);

      if (state.currentStudentKey) {
        openFichaByKey(ctx, state, state.currentStudentKey);
      }
    } finally {
      if (el.btnTop2025) el.btnTop2025.disabled = false;
      if (el.btn2025) el.btn2025.disabled = false;
    }
  }

  // =========================
  // Core: open ficha por key (2026)
  // =========================
  function openFichaByKey(ctx, state, studentKey) {
    const { el } = ctx;
    if (!studentKey) return;

    state.currentStudentKey = studentKey;

    const student = (state.allStudents || []).find((s) => s.key === studentKey);
    state.currentStudentName = student ? student.name : '';
    state.currentSearchEntry = getSearchEntryByName(state, state.currentStudentName) || student || null;
    state.__viewYear = '2026';
    ctx.__fichaState = state;

    showFichaContainer(ctx);
    resetFichaVisualState(ctx, state);
    bindFichaEditButtons(ctx, state);
    ctx.__fichaEditMode = false;
    ctx.__fichaRowsWorking = null;
    ctx.__fichaRowsBase = null;
    toggleEditButtons(ctx, false);

    show(el.btnPDF);
    show(el.btnVolverDash);

    const ficha = RIPCore.getStudentFicha(state.registro, studentKey);
    const rows = ficha.rows || [];

    renderFichaSummary(ctx, student, ficha, '2026');
    renderTable2026(ctx, rows);
    renderYearButtons(ctx, state);

    syncProgramacionIfAvailable(ctx, state, state.currentStudentName, '2026');
  }

  // =========================
  // Core: open desde búsqueda global
  // =========================
  async function openStudentFromSearch(ctx, state, entry) {
    if (!entry || !entry.name) return;

    state.currentSearchEntry = entry;
    state.currentStudentName = entry.name || '';
    state.currentStudentKey = String(entry.currentKey || entry.key || '').trim() || '';
    ctx.__fichaState = state;
    bindFichaEditButtons(ctx, state);

    showFichaContainer(ctx);
    resetFichaVisualState(ctx, state);

    const { el } = ctx;
    show(el.btnPDF);
    show(el.btnVolverDash);

    const years = getAvailableYearsForEntry(entry, state);

    if (state.currentStudentKey && years.includes('2026')) {
      openFichaByKey(ctx, state, state.currentStudentKey);
      return;
    }

    const firstHistoricalYear = years.find((y) => y !== '2026') || years[0];
    if (firstHistoricalYear) {
      renderYearButtons(ctx, state);
      await openStudentYear(ctx, state, firstHistoricalYear);
      return;
    }

    toast(el.toastWrap, 'No encontré años disponibles para este estudiante.', 'warn');
  }


  function toEditablePayload(row) {
    return {
      tipo: row.tipo || '',
      estudiante: row.estudiante || '',
      fechaRaw: row.fechaRaw || '',
      hora: row.hora || '',
      servicio: row.servicio || '',
      profesor: row.profesor || '',
      pago: row.pago || '',
      comentario: row.comentario || '',
      clasif: row.clasif || '',
      clasifPago: row.clasifPago || '',
      movimiento: Number(row.movimiento) || 0
    };
  }

  function cloneRow(row) {
    return { ...row, __isNew: !!row.__isNew, __deleted: !!row.__deleted };
  }

  function apiCallEditor(params = {}) {
    if (!EDITOR_API_URL) return Promise.reject(new Error('RIP_EDITOR_API_URL no esta configurada'));
    return new Promise((resolve, reject) => {
      const cb = '__rip_editor_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const url = new URL(EDITOR_API_URL);
      let done = false;
      Object.entries({ ...params, callback: cb }).forEach(([k, v]) => url.searchParams.set(k, String(v)));

      const clean = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        clean();
        reject(new Error('Timeout API edicion'));
      }, 25000);

      window[cb] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        resolve(data);
      };

      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        reject(new Error('Error conectando API edicion'));
      };

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function toggleEditButtons(ctx, editing) {
    if (ctx?.el?.btnFichaEditMode) ctx.el.btnFichaEditMode.style.display = editing ? 'none' : '';
    if (ctx?.el?.btnFichaSaveEdits) ctx.el.btnFichaSaveEdits.style.display = editing ? '' : 'none';
    if (ctx?.el?.btnFichaCancelEdits) ctx.el.btnFichaCancelEdits.style.display = editing ? '' : 'none';
  }

  function openRowEditModal(row, onSave) {
    const prev = document.getElementById('ripFichaEditModal');
    if (prev) prev.remove();

    const d = toEditablePayload(row);
    const modal = document.createElement('div');
    modal.id = 'ripFichaEditModal';
    modal.className = 'rip-modal-in';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Editar ${escapeHTML(row.id || '')}</span>
          <button class="rip-modal-close" type="button">x</button>
        </div>
        <div class="rip-modal-body">
          <div class="ripedit-grid">
            <label class="ripedit-field"><span class="ripedit-label">Tipo</span><input id="re_tipo" class="control" value="${escapeHTML(d.tipo)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Fecha</span><input id="re_fechaRaw" class="control" value="${escapeHTML(d.fechaRaw)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Hora</span><input id="re_hora" class="control" value="${escapeHTML(d.hora)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Servicio</span><input id="re_servicio" class="control" value="${escapeHTML(d.servicio)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Profesor</span><input id="re_profesor" class="control" value="${escapeHTML(d.profesor)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Pago</span><input id="re_pago" class="control" value="${escapeHTML(d.pago)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Clasificacion</span><input id="re_clasif" class="control" value="${escapeHTML(d.clasif)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Clasif pagos</span><input id="re_clasifPago" class="control" value="${escapeHTML(d.clasifPago)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Movimiento</span><input id="re_movimiento" class="control" value="${escapeHTML(String(d.movimiento))}"></label>
            <label class="ripedit-field" style="grid-column:1/-1"><span class="ripedit-label">Comentario</span><textarea id="re_comentario" class="control">${escapeHTML(d.comentario)}</textarea></label>
          </div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost" type="button" data-close>Cancelar</button>
          <button class="btn primary" type="button" data-save>Guardar</button>
        </div>
      </div>`;

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-close]')?.addEventListener('click', close);
    modal.querySelector('[data-save]')?.addEventListener('click', () => {
      onSave({
        tipo: modal.querySelector('#re_tipo')?.value || '',
        estudiante: row.estudiante || '',
        fechaRaw: modal.querySelector('#re_fechaRaw')?.value || '',
        hora: modal.querySelector('#re_hora')?.value || '',
        servicio: modal.querySelector('#re_servicio')?.value || '',
        profesor: modal.querySelector('#re_profesor')?.value || '',
        pago: modal.querySelector('#re_pago')?.value || '',
        comentario: modal.querySelector('#re_comentario')?.value || '',
        clasif: modal.querySelector('#re_clasif')?.value || '',
        clasifPago: modal.querySelector('#re_clasifPago')?.value || '',
        movimiento: Number(modal.querySelector('#re_movimiento')?.value || 0) || 0
      });
      close();
    });

    document.body.appendChild(modal);
  }

  function refreshEditableFicha(ctx, state) {
    const rows = (ctx.__fichaRowsWorking || []).filter((r) => !r.__deleted);
    const student = (state.allStudents || []).find((s) => s.key === state.currentStudentKey) || null;
    renderFichaSummary(ctx, student, { rows }, '2026');
    renderTable2026(ctx, rows);
  }

  function bindEditRowActions(ctx) {
    const tbody = ctx?.el?.tableBody;
    if (!tbody || tbody.__fichaEditBound) return;
    tbody.__fichaEditBound = true;

    tbody.addEventListener('click', (ev) => {
      const editBtn = ev.target.closest('[data-edit-row]');
      const dupBtn = ev.target.closest('[data-dup-row]');
      const delBtn = ev.target.closest('[data-del-row]');
      const id = editBtn?.getAttribute('data-edit-row') || dupBtn?.getAttribute('data-dup-row') || delBtn?.getAttribute('data-del-row');
      if (!id) return;

      const rows = ctx.__fichaRowsWorking || [];
      const row = rows.find((r) => String(r.id) === String(id));
      if (!row) return;
      const state = ctx.__fichaState;

      if (editBtn) {
        openRowEditModal(row, (data) => {
          Object.assign(row, data);
          refreshEditableFicha(ctx, state);
        });
        return;
      }

      if (dupBtn) {
        const copy = cloneRow(row);
        copy.id = 'LOCAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        copy.__isNew = true;
        rows.unshift(copy);
        refreshEditableFicha(ctx, state);
        return;
      }

      if (delBtn) {
        if (!confirm('¿Eliminar esta clase del registro?')) return;
        row.__deleted = true;
        refreshEditableFicha(ctx, state);
      }
    });
  }

  async function saveEditChanges(ctx, state) {
    if (!EDITOR_API_URL) {
      toast(ctx.el.toastWrap, 'Configura RIP_EDITOR_API_URL para guardar edicion.', 'warn');
      return;
    }

    const rows = (ctx.__fichaRowsWorking || []).map(cloneRow);
    const baseMap = new Map((ctx.__fichaRowsBase || []).map((r) => [String(r.id), r]));

    const created = rows.filter((r) => r.__isNew && !r.__deleted);
    const updated = rows.filter((r) => !r.__isNew && !r.__deleted).filter((r) => JSON.stringify(toEditablePayload(r)) !== JSON.stringify(toEditablePayload(baseMap.get(String(r.id)) || {})));
    const deleted = (ctx.__fichaRowsBase || []).filter((r) => !rows.find((x) => String(x.id) === String(r.id) && !x.__deleted));

    for (const r of updated) {
      const res = await apiCallEditor({ action: 'editRow', token: EDITOR_TOKEN, rowId: r.id, data: JSON.stringify(toEditablePayload(r)) });
      if (!res?.ok) throw new Error(res?.error || ('Error editando ' + r.id));
    }

    for (const r of created) {
      const res = await apiCallEditor({ action: 'addRow', token: EDITOR_TOKEN, data: JSON.stringify(toEditablePayload(r)) });
      if (!res?.ok) throw new Error(res?.error || 'Error duplicando fila');
      if (res?.newId) r.id = res.newId;
      r.__isNew = false;
    }

    for (const r of deleted) {
      const res = await apiCallEditor({ action: 'deleteRow', token: EDITOR_TOKEN, rowId: r.id });
      if (!res?.ok) throw new Error(res?.error || ('Error eliminando ' + r.id));
    }

    const cleaned = rows.filter((r) => !r.__deleted).map((r) => {
      const x = cloneRow(r);
      delete x.__isNew;
      delete x.__deleted;
      return x;
    });

    const others = (state.registro || []).filter((r) => r.estudianteKey !== state.currentStudentKey);
    state.registro = others.concat(cleaned);

    ctx.__fichaRowsBase = cleaned.map(cloneRow);
    ctx.__fichaRowsWorking = cleaned.map(cloneRow);
    ctx.__fichaEditMode = false;
    toggleEditButtons(ctx, false);
    refreshEditableFicha(ctx, state);
    toast(ctx.el.toastWrap, 'Cambios guardados', 'ok');
  }

  function bindFichaEditButtons(ctx, state) {
    if (ctx.__fichaEditButtonsBound) return;
    ctx.__fichaEditButtonsBound = true;

    ctx.el.btnFichaEditMode?.addEventListener('click', () => {
      if (String(state.__viewYear || '2026') !== '2026') {
        toast(ctx.el.toastWrap, 'Solo puedes editar 2026.', 'warn');
        return;
      }
      const ficha = RIPCore.getStudentFicha(state.registro, state.currentStudentKey);
      const rows = (ficha.rows || []).map(cloneRow);
      ctx.__fichaRowsBase = rows.map(cloneRow);
      ctx.__fichaRowsWorking = rows.map(cloneRow);
      ctx.__fichaEditMode = true;
      toggleEditButtons(ctx, true);
      refreshEditableFicha(ctx, state);
    });

    ctx.el.btnFichaCancelEdits?.addEventListener('click', () => {
      ctx.__fichaEditMode = false;
      ctx.__fichaRowsWorking = (ctx.__fichaRowsBase || []).map(cloneRow);
      toggleEditButtons(ctx, false);
      refreshEditableFicha(ctx, state);
    });

    ctx.el.btnFichaSaveEdits?.addEventListener('click', async () => {
      try {
        await saveEditChanges(ctx, state);
      } catch (err) {
        console.error(err);
        toast(ctx.el.toastWrap, 'No se pudo guardar: ' + (err.message || err), 'warn');
      }
    });
  }  // =========================
  // Export
  // =========================
  RIPUI.ficha = {
    openFichaByKey,
    openStudentFromSearch,
    openStudentYear,
    loadStudentByYear,
    // Limpia caches en memoria y TSV para el refresh nuclear
    clearCaches() {
      historyCache.clear();
      tsvYearCache.clear();
    }
  };
})();
