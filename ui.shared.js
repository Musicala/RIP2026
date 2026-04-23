/* =============================================================================
  ui.shared.js — RIP 2026 UI Shared
  - Helpers: escapeHTML, toast, money, norm wrappers
  - DOM context builder (alineado con index.html nuevo)
  - Incluye refs de Programación (dashboard + ficha)
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore) {
    console.error('ui.shared.js necesita que rip.core.js cargue primero.');
    return;
  }

  const RIPUI = (window.RIPUI = window.RIPUI || {});

  // =========================
  // Helpers base
  // =========================
  function escapeHTML(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function $(id) {
    return document.getElementById(id);
  }

  function fmtMoney(n) {
    return RIPCore.util.fmtMoney(n);
  }

  function norm(s) {
    return RIPCore.util.norm(s);
  }

  function show(el) {
    if (!el) return;
    el.style.display = '';
  }

  function hide(el) {
    if (!el) return;
    el.style.display = 'none';
  }

  function setText(elOrId, value) {
    const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
    if (!el) return;
    el.textContent = value ?? '';
  }

  function setHTML(elOrId, html) {
    const el = typeof elOrId === 'string' ? $(elOrId) : elOrId;
    if (!el) return;
    el.innerHTML = html ?? '';
  }

  function toggle(el, force) {
    if (!el) return;
    if (typeof force === 'boolean') {
      el.style.display = force ? '' : 'none';
      return;
    }
    el.style.display = (el.style.display === 'none') ? '' : 'none';
  }

  // =========================
  // Toast
  // =========================
  function toast(toastWrap, msg, tone = 'info') {
    if (!toastWrap) return;

    const t = document.createElement('div');
    t.className = `toast ${tone}`;
    t.innerHTML = `
      <div class="msg">${escapeHTML(msg)}</div>
      <div class="bar"><span></span></div>
    `;

    toastWrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));

    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 250);
    }, 2600);
  }

  // =========================
  // Badge helper
  // =========================
  function setBadge(badgeEl, n, suffix = 'registros') {
    if (!badgeEl) return;
    badgeEl.textContent = `${n ?? 0} ${suffix}`;
  }

  // =========================
  // Context builder (DOM refs)
  // =========================
  function buildContext() {
    const el = {
      // Header actions
      btnRefresh: $('btnRefresh'),
      btnRefreshProg: $('btnRefreshProg'),
      btnVerBase: $('btnVerBase'),
      btnPago: $('btnPago'),
      btnClases: $('btnClases'),
      badgeCount: $('badgeCount'),
      badgeMode: $('badgeMode'),
      toastWrap: $('toastWrap'),

      // Dashboard header tabs (arriba)
      dashTabClas: $('dashTabClas'),
      dashTabSaldo: $('dashTabSaldo'),
      dashTabProg: $('dashTabProg'),
      dashTitle: $('dashTitle'),
      dashSub: $('dashSub'),

      // Filters
      filtersCard: $('filtersCard'),
      fStudent: $('fStudent'),
      fProfesor: $('fProfesor'),
      fTipo: $('fTipo'),
      fDesde: $('fDesde'),
      fHasta: $('fHasta'),
      btnApply: $('btnApply'),
      btnReset: $('btnReset'),
      status: $('status'),
      btnPDFTop: $('btnPDFTop'),
      btnTop2025: $('btnTop2025'),

      // Servicio multi
      serviceBtn: $('serviceBtn'),
      servicePop: $('servicePop'),
      serviceList: $('serviceList'),
      serviceSearch: $('serviceSearch'),
      serviceClear: $('serviceClear'),
      fServiceCount: $('fServiceCount'),

      // Tabs middle (vista)
      tabClas: $('tabClas'),
      tabSaldos: $('tabSaldos'),
      tabProg: $('tabProg'),
      btnBackToDash: $('btnBackToDash'),

      // Views
      dashboardClasView: $('dashboardClasView'),
      dashboardSaldoView: $('dashboardSaldoView'),
      dashboardProgView: $('dashboardProgView'),
      fichaView: $('fichaView'),

      // Dashboard clasificación
      dashClasTitle: $('dashClasTitle'),
      dashSubClas: $('dashSubClas'),
      dashGridClas: $('dashGridClas'),

      // Dashboard saldos
      dashSubSaldo: $('dashSubSaldo'),
      dashGridSaldo: $('dashGridSaldo'),
      dashKpisSaldo: $('dashKpisSaldo'),

      // Dashboard programación
      dashSubProg: $('dashSubProg'),
      progKpiGrid: $('progKpiGrid'),
      progDashHint: $('progDashHint'),
      progTableWrap: $('progTableWrap'),
      progTableBody: $('progTableBody'),

      progCardNoSchedule: $('progCardNoSchedule'),
      progCardPartial: $('progCardPartial'),
      progCardComplete: $('progCardComplete'),

      progKpiNone: $('progKpiNone'),
      progKpiPartial: $('progKpiPartial'),
      progKpiComplete: $('progKpiComplete'),

      // Ficha summary
      fichaTitle: $('fichaTitle'),
      fichaSub: $('fichaSub'),
      fichaSummaryBlock: $('fichaSummaryBlock'),
      fichaStudent: $('fichaStudent'),
      fichaFecha: $('fichaFecha'),
      fichaUltPago: $('fichaUltPago'),
      fichaUltPagoValor: $('fichaUltPagoValor'),
      fichaTotalPagos: $('fichaTotalPagos'),
      fichaProxPago: $('fichaProxPago'),
      fichaSaldosMini: $('fichaSaldosMini'),

      // Programación dentro de ficha
      programacionStudentView: $('programacionStudentView'),
      progStudentName: $('progStudentName'),
      progStudentNext: $('progStudentNext'),
      progStudentFuture: $('progStudentFuture'),
      progStudentAlert: $('progStudentAlert'),
      progStudentDates: $('progStudentDates'),
      programacionEmbed: $('programacionEmbed'),

      btnOpenProg: $('btnOpenProg'),
      btnOpenReprog: $('btnOpenReprog'),
      btnBackToRipTable: $('btnBackToRipTable'),

      // Table base
      tableBody: $('tableBody'),
      tablaContainer: $('tablaContainer'),

      // Ficha actions
      btnPDF: $('btnPDF'),
      btn2025: $('btn2025'),
      btnOpenMainFicha: $('btnOpenMainFicha'),
      btnOpenMoreInfo: $('btnOpenMoreInfo'),
      btnFichaEditMode: $('btnFichaEditMode'),
      btnFichaSaveEdits: $('btnFichaSaveEdits'),
      btnFichaCancelEdits: $('btnFichaCancelEdits'),
      btnVolverDash: $('btnVolverDash')
    };

    return { el };
  }

  // =========================
  // Exports
  // =========================
  RIPUI.shared = {
    escapeHTML,
    toast,
    setBadge,
    fmtMoney,
    norm,
    $,
    show,
    hide,
    toggle,
    setText,
    setHTML,
    buildContext
  };
})();
