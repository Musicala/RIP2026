/* =============================================================================
  ui.dashboard.js — RIP 2026 UI Dashboard
  - Cards: Clasificación + Saldos
  - KPIs Saldos
  - Lista intermedia de estudiantes (click -> abrir ficha)
  ✅ FIX: NO reventar la tabla (no tocar tablaContainer.innerHTML)
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.dashboard.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney } = window.RIPUI.shared;

  const RIPUI = (window.RIPUI = window.RIPUI || {});

  // =========================
  // Card HTML (reusa tu look)
  // =========================
  function cardHTML({ title, subtitle, value, tone, icon }) {
    return `
      <button class="pocket ${tone || ''}" type="button" data-title="${escapeHTML(title)}">
        <div class="pocket-top">
          <h3>${escapeHTML(title)}</h3>
          ${icon ? `<span class="pilltag ${tone || ''}">${escapeHTML(icon)}</span>` : ''}
        </div>
        <div class="big">${escapeHTML(value)}</div>
        ${subtitle ? `<div class="mini">${escapeHTML(subtitle)}</div>` : ''}
      </button>
    `;
  }

  // =========================
  // Render lista intermedia (SIN destruir la tabla)
  // =========================
  function renderStudentList(ctx, title, items, onPickStudent) {
    const { el } = ctx;
    if (!el.fichaView || !el.tableBody) return;

    // muestra vista ficha (la usamos como “contenedor”)
    el.fichaView.style.display = '';

    // esconde dashboards
    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';

    // botón volver
    if (el.btnBackToDash) el.btnBackToDash.style.display = '';

    // header
    if (el.fichaTitle) el.fichaTitle.textContent = title;
    if (el.fichaSub) el.fichaSub.textContent = 'Selecciona un estudiante para abrir su ficha';

    // limpia resumen
    if (el.fichaStudent) el.fichaStudent.textContent = '—';
    if (el.fichaFecha) el.fichaFecha.textContent = '—';
    if (el.fichaUltPago) el.fichaUltPago.textContent = '—';
    if (el.fichaProxPago) el.fichaProxPago.textContent = '—';
    if (el.fichaSaldosMini) el.fichaSaldosMini.innerHTML = '';

    // acciones de ficha no aplican en lista
    if (el.btnPDF) el.btnPDF.style.display = 'none';
    if (el.btnVolverDash) el.btnVolverDash.style.display = 'none';

    const rowsHTML = (items || [])
      .map((s) => {
        const badge =
          typeof s.saldo === 'number'
            ? `${s.saldo > 0 ? '+' : ''}${fmtMoney(s.saldo)}`
            : (s.paramClasif || '');

        return `
          <tr>
            <td colspan="12" style="padding:0; border-bottom: 1px solid rgba(15,23,42,.08);">
              <button type="button"
                class="student-row"
                data-skey="${escapeHTML(s.key)}"
                style="
                  width:100%;
                  display:flex;
                  align-items:center;
                  justify-content:space-between;
                  gap:12px;
                  padding:12px 14px;
                  border:0;
                  background:transparent;
                  cursor:pointer;
                  font-weight:800;
                ">
                <span>${escapeHTML(s.name)}</span>
                <span class="pill soft">${escapeHTML(badge)}</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML =
      rowsHTML || `<tr><td colspan="12" class="empty-td">No hay estudiantes en este grupo.</td></tr>`;

    // listeners
    el.fichaView.querySelectorAll('.student-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skey = btn.getAttribute('data-skey') || '';
        if (skey) onPickStudent(skey);
      });
    });
  }

  // =========================
  // Render dashboard clasificación
  // =========================
  function renderDashClas(ctx, students, onOpenList) {
    const { el } = ctx;
    if (!el.dashGridClas) return;

    const groups = RIPCore.buildClasificacionDashboard(students);

    el.dashGridClas.innerHTML =
      cardHTML({
        title: 'Activos netos',
        subtitle: '“activo” pero no “inactivo”',
        value: `${groups.activosNetos.length}`,
        tone: 'ok',
        icon: '🟦'
      }) +
      cardHTML({
        title: 'Por revisar',
        subtitle: 'pausa / no registro',
        value: `${groups.porRevisar.length}`,
        tone: 'info',
        icon: '🟨'
      }) +
      cardHTML({
        title: 'Inactivos',
        subtitle: 'todo lo demás',
        value: `${groups.inactivos.length}`,
        tone: '',
        icon: '⬛'
      });

    el.dashGridClas.querySelectorAll('.pocket').forEach((c) => {
      c.addEventListener('click', () => {
        const t = c.getAttribute('data-title') || '';
        if (t === 'Activos netos') onOpenList('Activos netos', groups.activosNetos);
        else if (t === 'Por revisar') onOpenList('Por revisar', groups.porRevisar);
        else onOpenList('Inactivos', groups.inactivos);
      });
    });
  }

  // =========================
  // Render dashboard saldos + KPIs
  // =========================
  function renderDashSaldo(ctx, students, registro, onOpenList) {
    const { el } = ctx;
    if (!el.dashGridSaldo) return;

    const cats = RIPCore.buildSaldosDashboard(students, registro);

    el.dashGridSaldo.innerHTML =
      cardHTML({
        title: 'Deben',
        subtitle: 'SUM(Movimiento) < 0',
        value: `${cats.deben.length}`,
        tone: 'warn',
        icon: '🔻'
      }) +
      cardHTML({
        title: 'Se acabó',
        subtitle: 'SUM(Movimiento) = 0',
        value: `${cats.seAcabo.length}`,
        tone: '',
        icon: '⏹️'
      }) +
      cardHTML({
        title: 'Les debemos / Clases activas',
        subtitle: 'SUM(Movimiento) > 0',
        value: `${cats.lesDebemos.length}`,
        tone: 'ok',
        icon: '🔺'
      });

    // KPIs
    if (el.dashKpisSaldo) {
      const sumMap = RIPCore.sumMovimientoByStudent(registro);
      let total = 0;
      for (const v of sumMap.values()) total += v;

      const withNonZero = Array.from(sumMap.values()).filter((v) => v !== 0).length;

      el.dashKpisSaldo.innerHTML = `
        <div class="kpi-card">
          <div class="k">Saldo global</div>
          <div class="v">${total > 0 ? '+' : ''}${fmtMoney(total)}</div>
        </div>
        <div class="kpi-card">
          <div class="k">Estudiantes con saldo ≠ 0</div>
          <div class="v">${withNonZero}</div>
        </div>
      `;
    }

    el.dashGridSaldo.querySelectorAll('.pocket').forEach((c) => {
      c.addEventListener('click', () => {
        const t = c.getAttribute('data-title') || '';
        if (t.startsWith('Deben')) onOpenList('Deben (saldo < 0)', cats.deben);
        else if (t.startsWith('Se acabó')) onOpenList('Se acabó (saldo = 0)', cats.seAcabo);
        else onOpenList('Les debemos / Clases activas (saldo > 0)', cats.lesDebemos);
      });
    });
  }

  // =========================
  // Exports
  // =========================
  RIPUI.dashboard = {
    renderDashClas,
    renderDashSaldo,
    renderStudentList
  };
})();
