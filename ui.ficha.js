/* =============================================================================
  ui.ficha.js — RIP 2026 UI Ficha (READ-ONLY) — v2
  - Resumen:
      · Saldo = SUM(Movimiento) filtrado por MS P / MS SP si existen
      · Última CLASE (Tipo="Clase")
      · Último PAGO (Tipo="Pago")
      · Pivot chips: SUM(Movimiento) por (Clasificación, Clasificación pagos)
  - Tabla completa del estudiante (solo lectura)
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.ficha.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, norm } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  function showFichaView(ctx) {
    const { el } = ctx;
    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.fichaView) el.fichaView.style.display = '';
  }

  function setFichaHeader(ctx, title, sub) {
    const { el } = ctx;
    if (el.fichaTitle) el.fichaTitle.textContent = title || 'Ficha';
    if (el.fichaSub) el.fichaSub.textContent = sub || '';
  }

  // Regla MS P / MS SP
  function pickRelevantRows(rows) {
    const hasMSP = rows.some(r => String(r.clasif || '').trim() === 'MS P');
    const hasMSSP = rows.some(r => String(r.clasif || '').trim() === 'MS SP');

    if (hasMSP || hasMSSP) {
      const allowed = new Set();
      if (hasMSP) allowed.add('MS P');
      if (hasMSSP) allowed.add('MS SP');
      return rows.filter(r => allowed.has(String(r.clasif || '').trim()));
    }
    return rows;
  }

  function inferTipo(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;
    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  function findLastDateByTipo(rowsDesc, tipoNeed) {
    const need = norm(tipoNeed);
    const hit = rowsDesc.find(r => norm(inferTipo(r)) === need);
    return hit ? (hit.fechaRaw || '—') : '—';
  }

  function buildPivot(rows) {
    const pivot = new Map(); // "a||b" -> sum
    for (const r of rows) {
      const a = (r.clasif || '').trim() || 'Sin clasificar';
      const b = (r.clasifPago || '').trim() || 'Sin clasif. pago';
      const k = `${a}||${b}`;
      pivot.set(k, (pivot.get(k) || 0) + (Number(r.movimiento) || 0));
    }

    return Array.from(pivot.entries())
      .map(([k, sum]) => {
        const [a, b] = k.split('||');
        return { a, b, sum };
      })
      .sort((x, y) => Math.abs(y.sum) - Math.abs(x.sum));
  }

  function renderMiniSaldoChips(ctx, pivotItems) {
    const { el } = ctx;
    if (!el.fichaSaldosMini) return;

    const chips = (pivotItems || [])
      .filter((p) => p.sum !== 0)
      .slice(0, 36)
      .map((p) => {
        const sign = p.sum > 0 ? '+' : '';
        const cls = p.sum < 0 ? 'saldo-chip neg' : p.sum > 0 ? 'saldo-chip pos' : 'saldo-chip zero';
        return `
          <span class="${cls}">
            <span>${escapeHTML(p.a)} · ${escapeHTML(p.b)}</span>
            <b>${sign}${fmtMoney(p.sum)}</b>
          </span>
        `;
      })
      .join('');

    el.fichaSaldosMini.innerHTML = `
      <div class="saldo-mini">
        ${chips || `<span class="muted">Sin movimientos agrupables (o todo en 0).</span>`}
      </div>
    `;
  }

  function renderStudentTable(ctx, rows) {
    const { el } = ctx;
    if (!el.tableBody) return;

    if (!rows || !rows.length) {
      el.tableBody.innerHTML = `<tr><td colspan="12" class="empty-td">Sin registros para este estudiante.</td></tr>`;
      return;
    }

    const html = rows
      .slice(0, 1600)
      .map((r) => {
        const tipo = inferTipo(r);

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

  function renderFicha(ctx, { studentName, fichaRowsDesc, paramClasif }) {
    const { el } = ctx;
    showFichaView(ctx);

    setFichaHeader(
      ctx,
      studentName,
      `Resumen + registro (solo lectura) · Parámetros: ${paramClasif || '—'}`
    );

    // Última clase / último pago según Tipo (col C)
    const lastClase = findLastDateByTipo(fichaRowsDesc, 'Clase');
    const lastPago = findLastDateByTipo(fichaRowsDesc, 'Pago');

    // Reutilizamos los slots existentes en tu HTML:
    if (el.fichaFecha) el.fichaFecha.textContent = lastClase;    // "Última clase"
    if (el.fichaProxPago) el.fichaProxPago.textContent = lastPago; // "Último pago"

    // Saldo con regla MS P / MS SP
    const relevantRows = pickRelevantRows(fichaRowsDesc);
    const saldo = relevantRows.reduce((acc, r) => acc + (Number(r.movimiento) || 0), 0);

    if (el.fichaUltPago) {
      el.fichaUltPago.innerHTML = `
        <span class="${saldo < 0 ? 'mov-neg' : saldo > 0 ? 'mov-pos' : 'mov-zero'}">
          ${saldo > 0 ? '+' : ''}${fmtMoney(saldo)}
        </span>
      `;
    }

    // Chips pivot con filas relevantes
    const pivotItems = buildPivot(relevantRows);
    renderMiniSaldoChips(ctx, pivotItems);

    // Tabla completa del estudiante (toda)
    renderStudentTable(ctx, fichaRowsDesc);
  }

  function openFichaByKey(ctx, state, studentKey) {
    if (!studentKey) return;

    state.currentStudentKey = studentKey;

    const s = state.allStudents.find((x) => x.key === studentKey);
    const name = s ? s.name : 'Estudiante';
    const paramClasif = s ? (s.paramClasif || '') : '';

    const ficha = RIPCore.getStudentFicha(state.registro, studentKey);
    const rowsDesc = ficha.rows || [];

    renderFicha(ctx, { studentName: name, fichaRowsDesc: rowsDesc, paramClasif });
  }

  RIPUI.ficha = { openFichaByKey };
})();
