/* =============================================================================
  ui.shared.js — RIP 2026 UI Shared
  - Helpers: escapeHTML, toast, money, norm wrappers
  - DOM context builder (IDs según tu index.html)
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
  function setBadge(badgeEl, n) {
    if (!badgeEl) return;
    badgeEl.textContent = `${n ?? 0} registros`;
  }

  // =========================
  // Context builder (DOM refs)
  // =========================
  function buildContext() {
    // Header actions
    const el = {
      btnRefresh: $('btnRefresh'),
      btnVerBase: $('btnVerBase'),
      btnPago: $('btnPago'),
      btnClases: $('btnClases'),
      badgeCount: $('badgeCount'),
      badgeMode: $('badgeMode'),
      toastWrap: $('toastWrap'),

      // Dashboard header tabs (arriba)
      dashTabClas: $('dashTabClas'),
      dashTabSaldo: $('dashTabSaldo'),
      dashTitle: $('dashTitle'),
      dashSub: $('dashSub'),

      // Filters
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
      btnBackToDash: $('btnBackToDash'),

      // Views
      dashboardClasView: $('dashboardClasView'),
      dashboardSaldoView: $('dashboardSaldoView'),
      fichaView: $('fichaView'),

      // Dashboard grids
      dashGridClas: $('dashGridClas'),
      dashGridSaldo: $('dashGridSaldo'),
      dashKpisSaldo: $('dashKpisSaldo'),

      // Ficha summary
      fichaTitle: $('fichaTitle'),
      fichaSub: $('fichaSub'),
      fichaStudent: $('fichaStudent'),
      fichaFecha: $('fichaFecha'),
      fichaUltPago: $('fichaUltPago'),
      fichaProxPago: $('fichaProxPago'),
      fichaSaldosMini: $('fichaSaldosMini'),

      // Table
      tableBody: $('tableBody'),
      tablaContainer: $('tablaContainer'),

      // Ficha actions
      btnPDF: $('btnPDF'),
      btn2025: $('btn2025'),
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
    buildContext
  };
})();
