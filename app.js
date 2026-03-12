/* =============================================================================
  app.js — RIP 2026 App (Wiring)
  - Boot + loadAll
  - Render dashboards
  - Navegación: dashboard -> lista -> ficha
  - Tabla base + filtros
  - Integración con módulo de Programación
  - Sin caché local
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('app.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const RIPUI = window.RIPUI;
  const { toast, buildContext, hide, show, setText, setHTML } = RIPUI.shared;

  // =========================
  // State global
  // =========================
  const state = {
    registro: [],
    paramsMap: null,
    allStudents: [],
    filteredRows: [],
    selectedServicios: new Set(),
    currentStudentKey: '',
    currentStudentName: '',
    dashMode: 'clas', // 'clas' | 'saldo' | 'prog'

    prog: {
      data: null,
      currentStudentName: '',
      currentStudentRow: null,
      groupFilter: '',
      mode: 'dash' // dash | prog | reprog
    }
  };

  const ctx = buildContext();

  // =========================
  // Helpers internos
  // =========================
  function clearAppCaches() {
    try {
      if (window.RIPCore?.clearCaches) {
        window.RIPCore.clearCaches();
      }
    } catch (err) {
      console.warn('No se pudo limpiar caché:', err);
    }
  }

  function getStudentByKey(studentKey) {
    return (state.allStudents || []).find(s => s.key === studentKey) || null;
  }

  function getCurrentStudentName() {
    const st = getStudentByKey(state.currentStudentKey);
    return st?.name || state.currentStudentName || '';
  }

  function resetProgramacionEmbed() {
    if (ctx.el.programacionEmbed) ctx.el.programacionEmbed.innerHTML = '';
  }

  function hideAllMainViews() {
    hide(ctx.el.dashboardClasView);
    hide(ctx.el.dashboardSaldoView);
    hide(ctx.el.dashboardProgView);
    hide(ctx.el.fichaView);
  }

  function setHeaderTextsByMode(mode) {
    if (!ctx.el.dashTitle || !ctx.el.dashSub) return;

    if (mode === 'clas') {
      ctx.el.dashTitle.textContent = 'Dashboard · Clasificación';
      ctx.el.dashSub.textContent = 'Agrupado por Activos / Por revisar / Inactivos. Click para ver lista de estudiantes.';
      return;
    }

    if (mode === 'saldo') {
      ctx.el.dashTitle.textContent = 'Dashboard · Saldos';
      ctx.el.dashSub.textContent = 'Agrupado por saldo SUM(Movimiento). Click para ver lista de estudiantes.';
      return;
    }

    ctx.el.dashTitle.textContent = 'Dashboard · Programación';
    ctx.el.dashSub.textContent = 'KPIs de programación y lista de estudiantes. Click para abrir programación individual.';
  }

  function syncDashTabs() {
    const mode = state.dashMode;

    ctx.el.dashTabClas?.classList.toggle('active', mode === 'clas');
    ctx.el.dashTabSaldo?.classList.toggle('active', mode === 'saldo');
    ctx.el.dashTabProg?.classList.toggle('active', mode === 'prog');

    ctx.el.tabClas?.classList.toggle('active', mode === 'clas');
    ctx.el.tabSaldos?.classList.toggle('active', mode === 'saldo');
    ctx.el.tabProg?.classList.toggle('active', mode === 'prog');
  }

  function ensureFichaProgramacionHidden() {
    hide(ctx.el.programacionStudentView);
    resetProgramacionEmbed();
  }

  function resetStateForFreshLoad() {
    state.registro = [];
    state.paramsMap = new Map();
    state.allStudents = [];
    state.filteredRows = [];
    state.selectedServicios = new Set();
    state.currentStudentKey = '';
    state.currentStudentName = '';
    state.prog = {
      data: null,
      currentStudentName: '',
      currentStudentRow: null,
      groupFilter: '',
      mode: 'dash'
    };
  }

  // =========================
  // Navegación de vistas
  // =========================
  function showDashboard(mode) {
    state.dashMode = mode || 'clas';

    hideAllMainViews();

    if (state.dashMode === 'clas') show(ctx.el.dashboardClasView);
    if (state.dashMode === 'saldo') show(ctx.el.dashboardSaldoView);
    if (state.dashMode === 'prog') show(ctx.el.dashboardProgView);

    syncDashTabs();
    setHeaderTextsByMode(state.dashMode);

    hide(ctx.el.btnBackToDash);
  }

  function showFichaContainer() {
    hideAllMainViews();
    show(ctx.el.fichaView);
    show(ctx.el.btnBackToDash);
  }

  // =========================
  // Programación helpers
  // =========================
  async function loadProgramacionSummary() {
    if (!window.RIPProgramacion?.loadResumen) return;

    try {
      state.prog.data = await window.RIPProgramacion.loadResumen();

      if (window.RIPProgramacion.renderKpis) {
        window.RIPProgramacion.renderKpis(
          ctx,
          state,
          onProgramacionListRequested,
          onProgramacionStudentRequested
        );
      }
    } catch (err) {
      console.warn('No se pudo cargar resumen de Programación:', err);

      if (ctx.el.progTableBody) {
        ctx.el.progTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="muted">No se pudo cargar la programación.</td>
          </tr>
        `;
      }
    }
  }

  function onProgramacionListRequested(groupKey) {
    state.dashMode = 'prog';
    state.prog.groupFilter = groupKey || '';
    showDashboard('prog');

    if (window.RIPProgramacion?.renderKpis) {
      window.RIPProgramacion.renderKpis(
        ctx,
        state,
        onProgramacionListRequested,
        onProgramacionStudentRequested
      );
    }
  }

  function onProgramacionStudentRequested(studentName) {
    if (!studentName) return;

    const normalized = RIPUI.shared.norm(studentName);
    const match = (state.allStudents || []).find(
      s => RIPUI.shared.norm(s.name) === normalized
    );

    if (match?.key) {
      openStudentFicha(match.key, { focusProgramacion: true });
      return;
    }

    // fallback por si existe en programación pero no en RIP
    showFichaContainer();

    setText(ctx.el.fichaTitle, `Ficha · ${studentName}`);
    setText(ctx.el.fichaSub, 'Resumen + programación');
    setText(ctx.el.fichaStudent, studentName);
    setText(ctx.el.fichaFecha, '—');
    setText(ctx.el.fichaUltPago, '—');
    setText(ctx.el.fichaProxPago, '—');
    setHTML(ctx.el.fichaSaldosMini, '');

    hide(ctx.el.tablaContainer);

    if (window.RIPProgramacion?.attachStudent) {
      window.RIPProgramacion.attachStudent(ctx, state, studentName);
    }
  }

  function openStudentFicha(studentKey, opts = {}) {
    const { focusProgramacion = false } = opts;

    if (!studentKey || !RIPUI.ficha?.openFichaByKey) return;

    RIPUI.ficha.openFichaByKey(ctx, state, studentKey);
    showFichaContainer();

    const studentName = getCurrentStudentName();
    state.prog.currentStudentName = studentName;

    if (window.RIPProgramacion?.attachStudent && studentName) {
      window.RIPProgramacion.attachStudent(ctx, state, studentName);
    }

    if (focusProgramacion) {
      show(ctx.el.programacionStudentView);
    }
  }

  function openProgramacionMode(mode) {
    const studentName = state.prog.currentStudentName || getCurrentStudentName();

    if (!studentName || !window.RIPProgramacion?.openMode) {
      toast(ctx.el.toastWrap, 'No pude abrir la vista de programación.', 'warn');
      return;
    }

    show(ctx.el.programacionStudentView);
    window.RIPProgramacion.openMode(ctx, state, mode, studentName);
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
    // Clasificación
    RIPUI.dashboard.renderDashClas(ctx, state.allStudents, (title, list) => {
      showFichaContainer();
      ensureFichaProgramacionHidden();

      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey) => {
        openStudentFicha(studentKey, { focusProgramacion: false });
      });
    });

    // Saldos
    RIPUI.dashboard.renderDashSaldo(ctx, state.allStudents, state.registro, (title, list) => {
      showFichaContainer();
      ensureFichaProgramacionHidden();

      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey) => {
        openStudentFicha(studentKey, { focusProgramacion: false });
      });
    });

    // Programación
    if (window.RIPProgramacion?.renderKpis) {
      window.RIPProgramacion.renderKpis(
        ctx,
        state,
        onProgramacionListRequested,
        onProgramacionStudentRequested
      );
    }

    showDashboard(state.dashMode);
  }

  // =========================
  // Ver base de datos
  // =========================
  function openBaseView() {
    showFichaContainer();

    setText(ctx.el.fichaTitle, 'Base de datos');
    setText(ctx.el.fichaSub, 'Tabla filtrada (solo lectura)');

    setText(ctx.el.fichaStudent, '—');
    setText(ctx.el.fichaFecha, '—');
    setText(ctx.el.fichaUltPago, '—');
    setText(ctx.el.fichaProxPago, '—');
    setHTML(ctx.el.fichaSaldosMini, '');

    hide(ctx.el.programacionStudentView);
    resetProgramacionEmbed();
    show(ctx.el.tablaContainer);

    show(ctx.el.btnPDF);
    show(ctx.el.btnVolverDash);

    if (RIPUI.table?.applyAndRender) {
      RIPUI.table.applyAndRender(ctx, state);
    }
  }

  // =========================
  // Wiring UI general
  // =========================
  function wireTopUI() {
    // Tabs arriba
    ctx.el.dashTabClas?.addEventListener('click', () => showDashboard('clas'));
    ctx.el.dashTabSaldo?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.dashTabProg?.addEventListener('click', () => showDashboard('prog'));

    // Tabs intermedios
    ctx.el.tabClas?.addEventListener('click', () => showDashboard('clas'));
    ctx.el.tabSaldos?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.tabProg?.addEventListener('click', () => showDashboard('prog'));

    // Volver al dashboard desde lista/ficha
    ctx.el.btnBackToDash?.addEventListener('click', () => showDashboard(state.dashMode));
    ctx.el.btnVolverDash?.addEventListener('click', () => showDashboard(state.dashMode));
// =========================
// Actualizar SOLO programación
// =========================
if (ctx.el.btnRefreshProg) {
  ctx.el.btnRefreshProg.addEventListener('click', async () => {
    try {
      toast(ctx.el.toastWrap, 'Actualizando programación...', 'info');

      await loadProgramacionSummary();

      toast(ctx.el.toastWrap, 'Programación actualizada.', 'success');
    } catch (err) {
      console.error(err);
      toast(ctx.el.toastWrap, 'No se pudo actualizar la programación.', 'warn');
    }
  });
}
    // Ver base
    ctx.el.btnVerBase?.addEventListener('click', () => openBaseView());

    // Refresh sin caché
    ctx.el.btnRefresh?.addEventListener('click', async () => {
      clearAppCaches();
      toast(ctx.el.toastWrap, 'Actualizando datos sin caché…', 'info');
      await boot({ force: true });
    });

    // Registrar pago
    ctx.el.btnPago?.addEventListener('click', () => {
      const url = window.PAYMENT_WEBAPP_URL || '';
      if (!url) {
        toast(ctx.el.toastWrap, 'PAYMENT_WEBAPP_URL no está configurada en esta versión.', 'warn');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Registrar clases
    ctx.el.btnClases?.addEventListener('click', () => {
      const url = window.REGISTRAR_CLASES_URL || '';
      if (!url) {
        toast(ctx.el.toastWrap, 'REGISTRAR_CLASES_URL no está configurada en esta versión.', 'warn');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // PDF superior
    ctx.el.btnPDFTop?.addEventListener('click', () => {
      const target =
        (ctx.el.fichaView && ctx.el.fichaView.style.display !== 'none')
          ? ctx.el.fichaView
          : (state.dashMode === 'saldo'
              ? ctx.el.dashboardSaldoView
              : state.dashMode === 'prog'
                ? ctx.el.dashboardProgView
                : ctx.el.dashboardClasView);

      const fileName =
        state.dashMode === 'saldo'
          ? 'RIP_2026_Dashboard_Saldos.pdf'
          : state.dashMode === 'prog'
            ? 'RIP_2026_Dashboard_Programacion.pdf'
            : 'RIP_2026_Dashboard_Clasificacion.pdf';

      exportPDF(target, fileName);
    });

    // PDF ficha/base
    ctx.el.btnPDF?.addEventListener('click', () => {
      const name = getCurrentStudentName() || 'Base';
      exportPDF(ctx.el.fichaView, `RIP_2026_${name}.pdf`);
    });

    // Botones bloque programación
    ctx.el.btnOpenProg?.addEventListener('click', () => openProgramacionMode('prog'));
    ctx.el.btnOpenReprog?.addEventListener('click', () => openProgramacionMode('reprog'));

    ctx.el.btnBackToRipTable?.addEventListener('click', () => {
      hide(ctx.el.programacionStudentView);
      resetProgramacionEmbed();
      show(ctx.el.tablaContainer);
    });
  }

  // =========================
  // Boot sin caché
  // =========================
  async function boot({ force = true } = {}) {
    try {
      clearAppCaches();
      resetStateForFreshLoad();

      setText(ctx.el.status, 'Cargando registro 2026…');

      // 1) Fast load LIVE
      const fast = await RIPCore.loadRegistroFast({ force: true });

      state.registro = fast.rows || [];
      state.allStudents = fast.allStudents || [];
      state.paramsMap = new Map();

      if (RIPUI.table) {
        RIPUI.table.init(ctx, state);
        if (RIPUI.table.applyAndRender) {
          RIPUI.table.applyAndRender(ctx, state);
        }
      }

      setText(ctx.el.badgeMode, 'LIVE');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Cargando programación…');

      // 2) Programación LIVE
      await loadProgramacionSummary();

      // 3) Load completo LIVE
      setText(ctx.el.status, 'Cargando análisis…');

      const pack = await RIPCore.loadAll({ force: true });

      state.registro = pack.registro || [];
      state.paramsMap = pack.paramsMap || new Map();
      state.allStudents = pack.allStudents || state.allStudents || [];

      if (RIPUI.table?.applyAndRender) {
        RIPUI.table.applyAndRender(ctx, state);
      }

      renderDashboards();

      setText(ctx.el.badgeMode, 'LIVE');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Listo ✅');

      toast(ctx.el.toastWrap, 'Datos cargados sin caché.', 'ok');
    } catch (err) {
      console.error(err);
      setText(ctx.el.status, 'Error cargando datos.');
      toast(ctx.el.toastWrap, String(err?.message || err), 'warn');
    }
  }

  // =========================
  // Expose
  // =========================
  window.RIPApp = {
    state,
    ctx,
    showDashboard,
    showFichaContainer,
    openBaseView,
    openStudentFicha,
    loadProgramacionSummary,
    renderDashboards,
    boot,
    clearAppCaches
  };

  // =========================
  // Init
  // =========================
  wireTopUI();
  clearAppCaches();
  boot({ force: true });
})();