/* =============================================================================
  ui.ficha.js — RIP 2026 UI Ficha (READ-ONLY) + Toggle 2025 + Sync Programación
  - openFichaByKey: abre ficha completa de un estudiante (2026)
  - Toggle 2025: botón "2025" (solo cuando hay estudiante seleccionado)
    * Carga TSV 2025 (col D = estudiante, col E = fecha dd/mm/aaaa)
    * Muestra columnas C..L, ordenado por fecha desc
    * No calcula movimientos
  - Integra automáticamente bloque de Programación si existe window.RIPProgramacion
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.ficha.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, toast, norm, show, hide, setText, setHTML } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  const TSV_REGISTRO_2025_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv';

  const cache2025 = new Map(); // studentKey(norm nombre) -> { headersSlice, rowsSlice }

  // =========================
  // TSV helpers
  // =========================
  async function fetchTSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('No pude cargar 2025 (' + res.status + ')');
    return await res.text();
  }

  function parseTSV(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(Boolean);
    const rows = lines.map((l) => l.split('\t'));
    const headers = rows.shift() || [];
    return { headers, rows };
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

  async function loadStudent2025(studentName) {
    const key = norm(studentName);
    if (!key) return { headersSlice: [], rowsSlice: [] };
    if (cache2025.has(key)) return cache2025.get(key);

    const t = await fetchTSV(TSV_REGISTRO_2025_URL);
    const parsed = parseTSV(t);

    // C..L
    const start = 2;
    const end = 12;

    const headersSlice = parsed.headers.slice(start, end);

    // D = estudiante, E = fecha
    const idxStudent = 3;
    const idxFecha = 4;

    const rowsSlice = parsed.rows
      .filter((r) => norm(r[idxStudent] || '') === key)
      .map((r) => ({ r, ts: parseDMY(r[idxFecha] || '') }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map((x) => x.r.slice(start, end));

    const pack = { headersSlice, rowsSlice };
    cache2025.set(key, pack);
    return pack;
  }

  // =========================
  // Helpers render 2026
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

    if (!rows || !rows.length) {
      el.tableBody.innerHTML = `<tr><td colspan="12" class="empty-td">No hay registros para este estudiante.</td></tr>`;
      return;
    }

    const html = rows
      .slice(0, 1800)
      .map((r) => {
        const tipo = inferTipoLabel(r);
        const mov = Number(r.movimiento) || 0;
        const movClass = mov < 0 ? 'mov-neg' : mov > 0 ? 'mov-pos' : 'mov-zero';
        const movText = `${mov > 0 ? '+' : ''}${fmtMoney(mov)}`;

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
            <td class="mono">${escapeHTML(r.id)}</td>
            <td>${escapeHTML(r.clasif)}</td>
            <td>${escapeHTML(r.clasifPago)}</td>
            <td class="${movClass}">${movText}</td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML = html;
  }

  // =========================
  // Helpers render 2025
  // =========================
  function setTableHeader(headersSlice) {
    const thead = document.querySelector('#tablaContainer thead');
    if (!thead) return;

    thead.innerHTML =
      '<tr>' + headersSlice.map((h) => '<th>' + escapeHTML(h || '') + '</th>').join('') + '</tr>';
  }

  function setTableBodySimple(rowsSlice) {
    const tbody = document.querySelector('#tablaContainer tbody') || document.querySelector('#tableBody');
    if (!tbody) return;

    if (!rowsSlice.length) {
      tbody.innerHTML = '<tr><td colspan="12" class="empty-td">Sin registros 2025 para este estudiante.</td></tr>';
      return;
    }

    tbody.innerHTML = rowsSlice
      .map((r) => '<tr>' + r.map((c) => '<td>' + escapeHTML(c ?? '') + '</td>').join('') + '</tr>')
      .join('');
  }

  // =========================
  // Botones 2025
  // =========================
  function showYearButtons(ctx, showButtons) {
    const { el } = ctx;
    if (el.btnTop2025) el.btnTop2025.style.display = showButtons ? '' : 'none';
    if (el.btn2025) el.btn2025.style.display = showButtons ? '' : 'none';
  }

  function attachToggle(ctx, state) {
    const { el } = ctx;

    if (!el.btnTop2025 && !el.btn2025) return;

    if (!state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      state.__thead2026HTML = thead ? thead.innerHTML : '';
    }

    const go2026 = () => {
      state.__viewYear = '2026';

      const thead = document.querySelector('#tablaContainer thead');
      if (thead && state.__thead2026HTML) thead.innerHTML = state.__thead2026HTML;

      if (state.currentStudentKey) {
        openFichaByKey(ctx, state, state.currentStudentKey);
      }

      if (el.btnTop2025) el.btnTop2025.textContent = '🗂️ 2025';
      if (el.btn2025) el.btn2025.textContent = '2025';
    };

    const go2025 = async () => {
      const studentName = state.currentStudentName || '';
      if (!studentName) return;

      if (el.btnTop2025) {
        el.btnTop2025.textContent = 'Cargando 2025…';
        el.btnTop2025.disabled = true;
      }
      if (el.btn2025) {
        el.btn2025.disabled = true;
      }

      try {
        const pack = await loadStudent2025(studentName);
        state.__viewYear = '2025';

        setText(el.fichaSub, 'Registro 2025 (solo lectura)');
        setTableHeader(pack.headersSlice);
        setTableBodySimple(pack.rowsSlice);

        if (el.btnTop2025) el.btnTop2025.textContent = '🗂️ Volver 2026';
        if (el.btn2025) el.btn2025.textContent = 'Volver 2026';
      } catch (e) {
        console.error(e);
        toast(el.toastWrap, 'No pude cargar 2025. Revisa que el TSV esté público.', 'warn');
        go2026();
      } finally {
        if (el.btnTop2025) el.btnTop2025.disabled = false;
        if (el.btn2025) el.btn2025.disabled = false;
      }
    };

    const toggle = () => {
      if (state.__viewYear === '2025') go2026();
      else go2025();
    };

    if (el.btnTop2025) el.btnTop2025.onclick = toggle;
    if (el.btn2025) el.btn2025.onclick = toggle;
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

    if (state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      if (thead) thead.innerHTML = state.__thead2026HTML;
    }

    show(el.tablaContainer);
    hide(el.programacionStudentView);

    if (el.programacionEmbed) el.programacionEmbed.innerHTML = '';
  }

  function renderFichaSummary(ctx, student, ficha) {
    const { el } = ctx;
    const rows = ficha.rows || [];

    setText(el.fichaTitle, 'Ficha · ' + (student ? student.name : 'Estudiante'));
    setText(el.fichaSub, 'Registro 2026 (solo lectura)');

    setText(el.fichaStudent, student ? student.name : '—');

    const last = rows[0];
    setText(el.fichaFecha, last ? (last.fechaRaw || '—') : '—');

    let ultimoPago = null;
    for (const r of rows) {
      if (String(r.pago || '').trim()) {
        ultimoPago = r;
        break;
      }
    }

    setText(el.fichaUltPago, ultimoPago ? (ultimoPago.pago || '—') : '—');
    setText(el.fichaProxPago, '—');

    if (el.fichaSaldosMini) {
      const saldo = Number(ficha.saldo) || 0;
      el.fichaSaldosMini.innerHTML = `
        <span class="pill soft">Saldo: <b>${escapeHTML((saldo > 0 ? '+' : '') + fmtMoney(saldo))}</b></span>
      `;
    }
  }

  function syncProgramacionIfAvailable(ctx, state, studentName) {
    if (!studentName) return;
    if (!window.RIPProgramacion?.attachStudent) return;

    try {
      window.RIPProgramacion.attachStudent(ctx, state, studentName);
    } catch (err) {
      console.warn('No se pudo sincronizar bloque de Programación:', err);
    }
  }

  // =========================
  // Core: open ficha por key
  // =========================
  function openFichaByKey(ctx, state, studentKey) {
    const { el } = ctx;
    if (!studentKey) return;

    state.currentStudentKey = studentKey;

    const student = (state.allStudents || []).find((s) => s.key === studentKey);
    state.currentStudentName = student ? student.name : '';

    showFichaContainer(ctx);
    resetFichaVisualState(ctx, state);

    show(el.btnPDF);
    show(el.btnVolverDash);
    showYearButtons(ctx, true);

    const ficha = RIPCore.getStudentFicha(state.registro, studentKey);
    const rows = ficha.rows || [];

    renderFichaSummary(ctx, student, ficha);
    renderTable2026(ctx, rows);
    attachToggle(ctx, state);

    // sincroniza programación del estudiante
    syncProgramacionIfAvailable(ctx, state, state.currentStudentName);
  }

  // =========================
  // Export
  // =========================
  RIPUI.ficha = {
    openFichaByKey
  };
})();