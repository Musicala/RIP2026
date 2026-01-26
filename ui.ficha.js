/* =============================================================================
  ui.ficha.js — RIP 2026 UI · Ficha de Estudiante + botón “2025”
  ------------------------------------------------------------------------------
  - Abre ficha completa (registro 2026 filtrado por estudianteKey)
  - Render de resumen + tabla
  - Botón “2025” (on-demand): carga TSV 2025, filtra por estudiante (col D),
    muestra columnas C→L y ordena por fecha desc (col E)
  - NO toca el resto del flujo (dashboards / filtros siguen igual)
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.ficha.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const RIPCore = window.RIPCore;
  const { escapeHTML, fmtMoney, setBadge, norm, toast } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  // ✅ TSV 2025 (Registro 2025 publicado)
  const TSV_REGISTRO_2025_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv';

  // Cache simple para no re-fetchear cada click
  const cache2025 = { stamp: 0, headers: null, rows: null };

  // Guardamos el thead “normal” (2026) para poder restaurar luego
  let baseTheadHTML = '';
  let baseTheadCaptured = false;

  function ensureBaseThead(ctx) {
    const table = ctx?.el?.tablaContainer?.querySelector?.('table.tbl');
    const thead = table?.querySelector?.('thead');
    if (!thead) return null;
    if (!baseTheadCaptured) {
      baseTheadHTML = thead.innerHTML;
      baseTheadCaptured = true;
    }
    return thead;
  }

  function setThead(ctx, headers) {
    const thead = ensureBaseThead(ctx);
    if (!thead) return;

    // restore
    if (!headers || !headers.length) {
      thead.innerHTML = baseTheadHTML || thead.innerHTML;
      return;
    }

    thead.innerHTML =
      '<tr>' + headers.map((h) => `<th>${escapeHTML(h)}</th>`).join('') + '</tr>';
  }

  function renderEmpty(ctx, msg, colSpan = 12) {
    const { el } = ctx;
    if (!el.tableBody) return;
    el.tableBody.innerHTML = `<tr><td colspan="${colSpan}" class="empty-td">${escapeHTML(
      msg || 'No hay registros.'
    )}</td></tr>`;
    setBadge(el.badgeCount, 0);
  }

  function inferTipoLabel(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;
    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  function renderTable2026(ctx, rows) {
    const { el } = ctx;
    if (!el.tableBody) return;

    // restaurar headers base (12 cols)
    setThead(ctx, null);

    if (!rows || !rows.length) {
      renderEmpty(ctx, 'Este estudiante no tiene registros en 2026.', 12);
      return;
    }

    const html = rows
      .slice()
      .sort((a, b) => (b.fechaTs || 0) - (a.fechaTs || 0))
      .slice(0, 2000)
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
            <td>${escapeHTML(r.clasifPago || '')}</td>
            <td class="${movClass}">${movText}</td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML = html;
    setBadge(el.badgeCount, rows.length);
  }

  function renderMiniPivots(ctx, rows) {
    const elMini = ctx?.el?.fichaSaldosMini;
    if (!elMini) return;

    if (!rows || !rows.length) {
      elMini.innerHTML = '';
      return;
    }

    const m = new Map();
    for (const r of rows) {
      const k = String(r.clasifPago || r.clasif || '').trim() || 'Sin clasif';
      const key = norm(k);
      const cur = m.get(key) || { label: k, sum: 0, count: 0 };
      cur.sum += Number(r.movimiento) || 0;
      cur.count += 1;
      m.set(key, cur);
    }
    const piv = Array.from(m.values()).sort((a, b) => (b.sum || 0) - (a.sum || 0));

    elMini.innerHTML = piv
      .slice(0, 14)
      .map((p) => {
        const sum = Number(p.sum) || 0;
        const tone = sum < 0 ? 'neg' : sum > 0 ? 'pos' : 'zero';
        return `
          <span class="chip ${tone}">
            <span class="chip-t">${escapeHTML(p.label)}</span>
            <span class="chip-v">${escapeHTML(fmtMoney(sum))}</span>
            <span class="chip-n">${escapeHTML(String(p.count))}</span>
          </span>
        `;
      })
      .join('');
  }

  // =========================
  // 2025 (TSV) helpers
  // =========================
  function parseTSVText(tsvText) {
    const lines = String(tsvText || '')
      .replace(/\r/g, '')
      .split('\n')
      .filter(Boolean);

    if (!lines.length) return { headers: [], rows: [] };

    const headers = lines[0].split('\t').map((s) => s.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      while (parts.length < headers.length) parts.push('');
      rows.push(parts);
    }

    return { headers, rows };
  }

  function pickIndex(headers, candidates, fallbackIndex) {
    const lower = headers.map((h) => norm(h));
    for (const c of candidates) {
      const idx = lower.indexOf(norm(c));
      if (idx >= 0) return idx;
    }
    return fallbackIndex;
  }

  function toDateTs(raw) {
    const d = RIPCore.util.parseDate(raw);
    return d ? d.getTime() : 0;
  }

  async function loadRegistro2025Once() {
    const now = Date.now();
    if (cache2025.rows && now - cache2025.stamp < 1000 * 60 * 10) return cache2025;

    const res = await fetch(TSV_REGISTRO_2025_URL, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`No pude cargar TSV 2025 (${res.status})`);

    const text = await res.text();
    const parsed = parseTSVText(text);

    cache2025.stamp = now;
    cache2025.headers = parsed.headers;
    cache2025.rows = parsed.rows;

    return cache2025;
  }

  function renderTable2025(ctx, headers, rowsCL) {
    const { el } = ctx;
    if (!el.tableBody) return;

    setThead(ctx, headers);

    if (!rowsCL || !rowsCL.length) {
      renderEmpty(ctx, 'No hay registros en 2025 para este estudiante.', headers.length);
      return;
    }

    const html = rowsCL
      .slice(0, 2500)
      .map((cells) => '<tr>' + cells.map((c) => `<td>${escapeHTML(c)}</td>`).join('') + '</tr>')
      .join('');

    el.tableBody.innerHTML = html;
    setBadge(el.badgeCount, rowsCL.length);
  }

  async function show2025ForStudent(ctx, studentName) {
    const { el } = ctx;
    if (el?.fichaSub) el.fichaSub.textContent = 'Cargando 2025…';

    const pack = await loadRegistro2025Once();
    const headers = pack.headers || [];
    const rows = pack.rows || [];

    // En 2025: estudiante = col D, fecha = col E
    const idxStudent = pickIndex(headers, ['Estudiantes', 'Estudiante', 'Nombre', 'Nombre estudiante'], 3);
    const idxFecha = pickIndex(headers, ['Fecha', 'fecha'], 4);

    // Mostrar C→L => índices 2..11
    const start = 2;
    const endExcl = 12;

    const headersCL = headers.length
      ? headers.slice(start, endExcl)
      : Array.from({ length: 10 }, (_, i) => `Col ${String.fromCharCode(67 + i)}`);

    const target = norm(studentName);

    const filtered = rows
      .filter((r) => norm(r[idxStudent]) === target)
      .map((r) => ({
        dt: toDateTs(r[idxFecha]),
        cells: r.slice(start, endExcl).map((v) => String(v ?? ''))
      }))
      .sort((a, b) => (b.dt || 0) - (a.dt || 0));

    renderTable2025(ctx, headersCL, filtered.map((x) => x.cells));
    if (el?.fichaSub) el.fichaSub.textContent = 'Mostrando Registro 2025 (solo lectura)';
  }

  // =========================
  // UI: botón 2025 (reusable)
  // =========================
  function ensureBtn2025(onClick) {
    const actions = document.querySelector('.ficha-actions');
    if (!actions) return null;

    let btn = document.getElementById('btnLoad2025');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'btnLoad2025';
      btn.type = 'button';
      btn.className = 'btn ghost';
      btn.textContent = '2025';
      btn.title = 'Ver registro 2025 de este estudiante';

      // Insertar a la izquierda del PDF
      const pdf = document.getElementById('btnPDF');
      if (pdf && pdf.parentNode === actions) actions.insertBefore(btn, pdf);
      else actions.prepend(btn);
    }

    btn.onclick = onClick;
    btn.style.display = '';
    return btn;
  }

  // =========================
  // Helper: habilitar toggle 2025 para la vista actual (ficha o base)
  // - restoreFn se encarga de volver a pintar 2026 sin tocar nada más
  // =========================
  function enable2025Toggle(ctx, opts) {
    const { el } = ctx || {};
    const studentName = opts?.studentName || '';
    const restoreFn = typeof opts?.restoreFn === 'function' ? opts.restoreFn : null;

    if (!studentName) {
      const b = document.getElementById('btnLoad2025');
      if (b) b.style.display = 'none';
      return;
    }

    let showing = false;
    const btn = ensureBtn2025(async () => {
      try {
        if (!showing) {
          toast(el?.toastWrap, 'Cargando registro 2025…', 'info');
          await show2025ForStudent(ctx, studentName);
          showing = true;
          btn.textContent = 'Volver 2026';
          btn.title = 'Volver a ver 2026';
        } else {
          setThead(ctx, null);
          if (restoreFn) restoreFn();
          showing = false;
          btn.textContent = '2025';
          btn.title = 'Ver registro 2025 de este estudiante';
        }
      } catch (err) {
        console.error(err);
        toast(el?.toastWrap, String(err?.message || err), 'warn');
        setThead(ctx, null);
        if (restoreFn) restoreFn();
        showing = false;
        btn.textContent = '2025';
        btn.title = 'Ver registro 2025 de este estudiante';
      }
    });

    return btn;
  }

  // =========================
  // Public API: abrir ficha (desde dashboard)
  // =========================
  function openFichaByKey(ctx, state, studentKey) {
    const { el } = ctx;
    if (!el?.fichaView) return;

    state.currentStudentKey = studentKey || '';

    // mostrar ficha
    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    el.fichaView.style.display = '';

    // datos estudiante
    const student = (state.allStudents || []).find((s) => s.key === studentKey);
    const name = student?.name || 'Estudiante';

    if (el.fichaTitle) el.fichaTitle.textContent = 'Ficha · Registro';
    if (el.fichaSub) el.fichaSub.textContent = 'Mostrando Registro 2026 (solo lectura)';
    if (el.fichaStudent) el.fichaStudent.textContent = name;

    const rows = (state.registro || []).filter((r) => r.estudianteKey === studentKey);
    const last = rows.slice().sort((a, b) => (b.fechaTs || 0) - (a.fechaTs || 0))[0];

    if (el.fichaFecha) el.fichaFecha.textContent = last?.fechaRaw || '—';

    const saldo = rows.reduce((acc, r) => acc + (Number(r.movimiento) || 0), 0);
    if (el.fichaUltPago) el.fichaUltPago.textContent = fmtMoney(saldo);

    const clasifParam = student?.clasifParam || student?.clasif || student?.paramClasif || '';
    if (el.fichaProxPago) el.fichaProxPago.textContent = clasifParam || '—';

    renderMiniPivots(ctx, rows);
    renderTable2026(ctx, rows);

    // habilitar 2025 y restaurar a la misma ficha 2026
    enable2025Toggle(ctx, {
      studentName: name,
      restoreFn: () => renderTable2026(ctx, rows)
    });
  }

  RIPUI.ficha = { openFichaByKey, enable2025Toggle };
})();
