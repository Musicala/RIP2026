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
  const { toast, buildContext } = RIPUI.shared;

  // =========================
  // State global (simple)
  // =========================
  const state = {
    registro: [],
    paramsMap: null,
    allStudents: [],
    filteredRows: [],
    selectedServicios: new Set(),
    currentStudentKey: '',
    dashMode: 'clas' // 'clas' | 'saldo'
  };

  // ctx (refs DOM)
  const ctx = buildContext();

  // =========================
  // Vistas
  // =========================
  function showDashboard(mode) {
    const { el } = ctx;

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
    if (el.dashboardClasView) el.dashboardClasView.style.display = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.fichaView) el.fichaView.style.display = '';
    if (el.btnBackToDash) el.btnBackToDash.style.display = '';
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
  // Render dashboards
  // =========================
  function renderDashboards() {
    const { el } = ctx;

    // Clasificación
    RIPUI.dashboard.renderDashClas(ctx, state.allStudents, (title, list) => {
      showFichaContainer();
      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey) => {
        RIPUI.ficha.openFichaByKey(ctx, state, studentKey);
      });
    });

    // Saldos
    RIPUI.dashboard.renderDashSaldo(ctx, state.allStudents, state.registro, (title, list) => {
      showFichaContainer();
      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey) => {
        RIPUI.ficha.openFichaByKey(ctx, state, studentKey);
      });
    });

    // Mostrar el modo actual
    showDashboard(state.dashMode);
  }

  // =========================
  // Botón "Ver base de datos"
  // =========================
  function openBaseView() {
    const { el } = ctx;
    showFichaContainer();

    // título
    if (el.fichaTitle) el.fichaTitle.textContent = 'Base de datos';
    if (el.fichaSub) el.fichaSub.textContent = 'Tabla filtrada (solo lectura)';

    // limpia resumen (no aplica)
    if (el.fichaStudent) el.fichaStudent.textContent = '—';
    if (el.fichaFecha) el.fichaFecha.textContent = '—';
    if (el.fichaUltPago) el.fichaUltPago.textContent = '—';
    if (el.fichaProxPago) el.fichaProxPago.textContent = '—';
    if (el.fichaSaldosMini) el.fichaSaldosMini.innerHTML = '';

    // botones de ficha: PDF sí, volver sí
    if (el.btnPDF) el.btnPDF.style.display = '';
    if (el.btnVolverDash) el.btnVolverDash.style.display = '';

    // asegura que el contenedor sea la tabla real (tu HTML ya trae la tabla)
    // y renderiza lo que esté filtrado ahora mismo:
    if (RIPUI.table) {
      RIPUI.table.applyAndRender(ctx, state);
          attach2025IfExactStudent();
}
  }


  // =========================
  // Helper: si hay un estudiante EXACTO en el filtro, habilita botón 2025 (solo on-demand)
  // - No recalcula saldos ni clasificaciones
  // - No toca filtros: restoreFn vuelve a pintar la tabla 2026 filtrada actual
  // =========================
  function attach2025IfExactStudent() {
    if (!RIPUI.ficha?.enable2025Toggle) return;
    const { el } = ctx;
    const typed = String(el.fStudent?.value || '').trim();

    if (!typed) {
      RIPUI.ficha.enable2025Toggle(ctx, { studentName: '' });
      return;
    }

    const key = RIPUI.shared.norm(typed);
    const s = (state.allStudents || []).find((x) => RIPUI.shared.norm(x.name) === key);

    if (!s) {
      // si no es match exacto, no mostramos 2025 para evitar confusiones
      RIPUI.ficha.enable2025Toggle(ctx, { studentName: '' });
      return;
    }

    RIPUI.ficha.enable2025Toggle(ctx, {
      studentName: s.name,
      restoreFn: () => RIPUI.table?.applyAndRender?.(ctx, state)
    });
  }

  // =========================
  // Wiring UI general
  // =========================
  function wireTopUI() {
    const { el } = ctx;

    // Tabs arriba
    if (el.dashTabClas) el.dashTabClas.addEventListener('click', () => showDashboard('clas'));
    if (el.dashTabSaldo) el.dashTabSaldo.addEventListener('click', () => showDashboard('saldo'));

    // Tabs middle
    if (el.tabClas) el.tabClas.addEventListener('click', () => showDashboard('clas'));
    if (el.tabSaldos) el.tabSaldos.addEventListener('click', () => showDashboard('saldo'));

    // Back to dash (cuando estás en lista/ficha)
    if (el.btnBackToDash) el.btnBackToDash.addEventListener('click', () => showDashboard(state.dashMode));

    // Ver base
    if (el.btnVerBase) el.btnVerBase.addEventListener('click', () => openBaseView());

    // Volver del view ficha
    if (el.btnVolverDash) el.btnVolverDash.addEventListener('click', () => showDashboard(state.dashMode));

    // Refresh (force reload TSV)
    if (el.btnRefresh) {
      el.btnRefresh.addEventListener('click', async () => {
        toast(el.toastWrap, 'Actualizando datos…', 'info');
        await boot({ force: true });
      });
    }

    // Registrar pago (si tú defines la URL global, lo abre)
    if (el.btnPago) {
      el.btnPago.addEventListener('click', () => {
        const url = window.PAYMENT_WEBAPP_URL || '';
        if (!url) {
          toast(el.toastWrap, 'PAYMENT_WEBAPP_URL no está configurada en esta versión.', 'warn');
          return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
      });
    }

    // PDF Top (descarga PDF del contenido principal visible)
    if (el.btnPDFTop) {
      el.btnPDFTop.addEventListener('click', () => {
        // si está visible fichaView, exporta esa, sino exporta el dashboard actual
        const target =
          (el.fichaView && el.fichaView.style.display !== 'none') ? el.fichaView :
          (state.dashMode === 'saldo' ? el.dashboardSaldoView : el.dashboardClasView);

        exportPDF(target, state.dashMode === 'saldo' ? 'RIP_2026_Dashboard_Saldos.pdf' : 'RIP_2026_Dashboard_Clasificacion.pdf');
      });
    }

    // PDF ficha/base
    if (el.btnPDF) {
      el.btnPDF.addEventListener('click', () => {
        const name = (state.currentStudentKey && state.allStudents.find(s => s.key === state.currentStudentKey)?.name) || 'Base';
        exportPDF(el.fichaView, `RIP_2026_${name}.pdf`);
      });
    }
  }

  // =========================
  // Boot
  // =========================
  async function boot({ force = false } = {}) {
    const { el } = ctx;

    try {
      if (el.status) el.status.textContent = 'Cargando…';

      const pack = await RIPCore.loadAll({ force });

      state.registro = pack.registro || [];
      state.paramsMap = pack.paramsMap || new Map();
      state.allStudents = pack.allStudents || [];
      state.currentStudentKey = '';

      // init table (filtros + tabla base) y reusa state.selectedServicios
      if (!state.selectedServicios) state.selectedServicios = new Set();
      if (RIPUI.table) RIPUI.table.init(ctx, state);

      // render dashboards
      renderDashboards();

      // badges
      if (el.badgeMode) el.badgeMode.textContent = 'TSV';
      if (el.badgeCount) el.badgeCount.textContent = `${state.registro.length} registros`;

      if (el.status) el.status.textContent = 'Listo ✅';
      toast(el.toastWrap, force ? 'Datos actualizados.' : 'Datos cargados.', 'ok');
    } catch (err) {
      console.error(err);
      if (el.status) el.status.textContent = 'Error cargando datos.';
      toast(el.toastWrap, String(err?.message || err), 'warn');
    }
  }

  // =========================
  // Init
  // =========================
  wireTopUI();
  boot({ force: false });
})();
