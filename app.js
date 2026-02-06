/* =============================================================================
  app.js — RIP 2026 App (Wiring)
  - Boot + loadAll
  - Render dashboards
  - Navegación: dashboard -> lista -> ficha
  - Tabla base + filtros
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('app.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const RIPUI = window.RIPUI;
  const { toast } = window.RIPCore;

  const ctx = RIPUI.shared.buildContext();

  const state = {
    rows: [],
    rows2025: [],
    showing2025: false,
    dashMode: 'clas',
    currentStudent: '',
    currentList: []
  };

  // =========================
  // Views
  // =========================
  function showDashboard(mode) {
    const { el } = ctx;

    // si venimos de Programación, restaurar layout RIP
    if (el.programacionView) el.programacionView.style.display = 'none';
    if (el.filtersCard) el.filtersCard.style.display = '';
    if (el.dashTabsMid) el.dashTabsMid.style.display = '';
    if (el.dashTabs) el.dashTabs.style.display = '';

    state.dashMode = mode || 'clas';

    // views
    if (el.dashboardClasView) el.dashboardClasView.style.display = state.dashMode === 'clas' ? '' : 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = state.dashMode === 'saldo' ? '' : 'none';
    if (el.fichaView) el.fichaView.style.display = 'none';

    // tabs arriba (header)
    if (el.dashTabClas) el.dashTabClas.classList.toggle('active', state.dashMode === 'clas');
    if (el.dashTabSaldo) el.dashTabSaldo.classList.toggle('active', state.dashMode === 'saldo');

    // tabs middle
    if (el.tabClas) el.tabClas.classList.toggle('active', state.dashMode === 'clas');
    if (el.tabSaldos) el.tabSaldos.classList.toggle('active', state.dashMode === 'saldo');

    // textos header
    if (el.dashTitle) el.dashTitle.textContent = state.dashMode === 'clas' ? 'Dashboard · Clasificación' : 'Dashboard · Saldos';
    if (el.dashSub) {
      el.dashSub.textContent =
        state.dashMode === 'clas'
          ? 'Agrupado por Activos / Por revisar / Inactivos. Click para ver lista de estudiantes.'
          : 'Agrupado por saldo SUM(Movimiento). Click para ver lista de estudiantes.';
    }

    // botones
    if (el.btnBackToDash) el.btnBackToDash.style.display = 'none';
  }

  function showFichaContainer() {
    const { el } = ctx;
    if (el.programacionView) el.programacionView.style.display = 'none';
    if (el.filtersCard) el.filtersCard.style.display = '';
    if (el.dashTabsMid) el.dashTabsMid.style.display = '';
    if (el.dashTabs) el.dashTabs.style.display = '';

    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.fichaView) el.fichaView.style.display = '';
    if (el.btnBackToDash) el.btnBackToDash.style.display = '';
  }

  // =========================
  // Programación (vista nueva)
  // =========================
  function showProgramacion() {
    const { el } = ctx;

    // ocultar vistas RIP
    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.fichaView) el.fichaView.style.display = 'none';

    // ocultar UI del RIP (filtros + tabs)
    if (el.filtersCard) el.filtersCard.style.display = 'none';
    if (el.dashTabsMid) el.dashTabsMid.style.display = 'none';
    if (el.dashTabs) el.dashTabs.style.display = 'none';

    // mostrar módulo
    if (el.programacionView) el.programacionView.style.display = '';

    // header copy
    if (el.dashTitle) el.dashTitle.textContent = 'Programación';
    if (el.dashSub) el.dashSub.textContent = 'Programar y reprogramar clases (módulo trasplantado dentro del RIP).';

    // botones
    if (el.btnBackToDash) el.btnBackToDash.style.display = 'none';
  }

  // =========================
  // PDF
  // =========================
  function exportPDF(element, filename) {
    if (!window.html2pdf || !element) {
      toast(ctx.el.toastWrap, 'No pude exportar PDF (html2pdf no está listo).', 'warn');
      return;
    }

    const opt = {
      margin: 8,
      filename: filename || 'RIP_2026.pdf',
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    window.html2pdf().set(opt).from(element).save();
  }

  // =========================
  // Boot
  // =========================
  async function boot(opts = {}) {
    // ... (tu boot original, intacto)
  }

  // =========================
  // Bind UI
  // =========================
  function bindUI() {
    const { el } = ctx;

    // ... (tus binds originales)

    // Registrar clases
    if (el.btnClases) {
      el.btnClases.addEventListener('click', () => {
        const url = window.REGISTRAR_CLASES_URL || '';
        if (!url) {
          toast(el.toastWrap, 'REGISTRAR_CLASES_URL no está configurada en esta versión.', 'warn');
          return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }

    // Programación (vista dentro del RIP)
    if (el.btnProgramacion) {
      el.btnProgramacion.addEventListener('click', () => showProgramacion());
    }
    if (el.btnBackFromProgramacion) {
      el.btnBackFromProgramacion.addEventListener('click', () => showDashboard(state.dashMode));
    }
  }

  // init
  bindUI();
  boot();

})();
