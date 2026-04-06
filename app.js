/* =============================================================================
  app.js — RIP 2026 App (Wiring) — v4 optimizado
  - Boot progresivo real: 2026 fast -> tabla usable -> programación -> análisis
  - Índice global liviano de estudiantes (2023/2024/2025/2026) lazy / background
  - Búsqueda global por nombre sin bloquear el arranque
  - Navegación: dashboard -> lista -> ficha
  - Tabla base + filtros
  - Integración con módulo de Programación
  - Sin caché local persistente; solo memoria de sesión
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('app.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const RIPUI = window.RIPUI;
  const { toast, buildContext, hide, show, setText, setHTML, norm } = RIPUI.shared;

  // =========================
  // Config índice global
  // =========================
  const STUDENT_INDEX_URLS = {
    "2026": "https://docs.google.com/spreadsheets/d/e/2PACX-1vREJFkqvhXwjBNPCQXTg4pHXUplygJU1ZZG6-xgOeAJ2ifnEMHmuoDJKwQIpxVfGfCrmfmNCS_8RHTc/pub?gid=1810443337&single=true&output=tsv",
    "2025": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv",
    "2024": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhAIn0x5D-p80AVkXrBaLhVyqakoQabAvUw3UmEzoo__1AXaWXM1dfvdagWNkHGO4YY_Txxb7OQHM/pub?gid=1810443337&single=true&output=tsv",
    "2023": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRL2kvbjxpU7qoPgiyoytANin1VsvqRx8BTZpSqBOJw_Lyid3NGPc88e3kwFiOsHpOPIgRricd64cin/pub?gid=1810443337&single=true&output=tsv"
  };

  const STUDENT_INDEX_COLMAP = {
    "2023": { fecha: 1, nombre: 2, servicio: 4, hora: 7, pago: null, profesor: null },
    "2024": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2025": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2026": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null }
  };

  const INDEX_YEAR_ORDER = ['2026', '2025', '2024', '2023'];

  // cache en memoria del índice por sesión
  const __studentIndexYearCache = new Map(); // year -> parsed TSV
  let __globalStudentIndexCache = null;
  let __globalIndexPromise = null;

  // =========================
  // State global
  // =========================
  const state = {
    registro: [],
    paramsMap: null,
    allStudents: [],          // estudiantes del registro actual (2026)
    searchStudents: [],       // índice global liviano 2023-2026
    filteredRows: [],
    selectedServicios: new Set(),
    currentStudentKey: '',
    currentStudentName: '',
    currentSearchEntry: null,
    dashMode: 'clas', // 'clas' | 'saldo' | 'prog'
    historicalIndexReady: false,

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
    return st?.name || state.currentStudentName || state.currentSearchEntry?.name || '';
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
    state.searchStudents = [];
    state.filteredRows = [];
    state.selectedServicios = new Set();
    state.currentStudentKey = '';
    state.currentStudentName = '';
    state.currentSearchEntry = null;
    state.historicalIndexReady = false;
    state.prog = {
      data: null,
      currentStudentName: '',
      currentStudentRow: null,
      groupFilter: '',
      mode: 'dash'
    };
  }

  function dedupeByNormalizedName(items) {
    const seen = new Set();
    const out = [];

    for (const item of items || []) {
      const name = String(item?.name || '').trim();
      const key = norm(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }

    return out;
  }

  function mergeSearchIndexWithCurrentStudents(searchStudents, currentStudents) {
    const byName = new Map();

    for (const item of searchStudents || []) {
      const k = norm(item?.name);
      if (!k) continue;
      byName.set(k, {
        name: item.name || '',
        key: item.key || '',
        currentKey: item.currentKey || '',
        years: Array.isArray(item.years) ? [...item.years] : []
      });
    }

    for (const student of currentStudents || []) {
      const k = norm(student?.name);
      if (!k) continue;

      if (!byName.has(k)) {
        byName.set(k, {
          name: student.name || '',
          key: student.key || '',
          currentKey: student.key || '',
          years: ['2026']
        });
        continue;
      }

      const prev = byName.get(k);
      const yearSet = new Set(Array.isArray(prev.years) ? prev.years : []);
      yearSet.add('2026');

      byName.set(k, {
        ...prev,
        name: prev.name || student.name || '',
        key: prev.key || student.key || '',
        currentKey: student.key || prev.currentKey || prev.key || '',
        years: INDEX_YEAR_ORDER.filter(y => yearSet.has(y))
      });
    }

    return Array.from(byName.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es')
    );
  }

  // =========================
  // Índice global liviano
  // =========================
  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`No pude cargar índice TSV (${res.status})`);
    }
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

  async function getParsedIndexYear(year) {
    const y = String(year || '').trim();
    if (!STUDENT_INDEX_URLS[y]) {
      throw new Error(`No hay URL configurada para ${y}`);
    }

    if (__studentIndexYearCache.has(y)) {
      return __studentIndexYearCache.get(y);
    }

    const text = await fetchText(STUDENT_INDEX_URLS[y]);
    const parsed = parseTSV(text);
    __studentIndexYearCache.set(y, parsed);
    return parsed;
  }

  function buildYearStudentEntries(year, parsed, currentStudents2026) {
    const y = String(year || '').trim();
    const colmap = STUDENT_INDEX_COLMAP[y];
    if (!colmap) return [];

    const idxName = Number(colmap.nombre);
    const currentMap = new Map(
      (currentStudents2026 || []).map((s) => [norm(s.name), s])
    );

    const seen = new Set();
    const out = [];

    for (const row of parsed.rows || []) {
      const rawName = String(row[idxName] || '').trim();
      const normalized = norm(rawName);
      if (!normalized || seen.has(normalized)) continue;

      seen.add(normalized);

      const currentMatch = currentMap.get(normalized);

      out.push({
        name: rawName,
        key: currentMatch?.key || '',
        currentKey: currentMatch?.key || '',
        years: [y]
      });
    }

    return out;
  }

  async function buildGlobalStudentIndex(currentStudents2026 = []) {
    if (__globalStudentIndexCache) {
      return mergeSearchIndexWithCurrentStudents(__globalStudentIndexCache, currentStudents2026);
    }

    const byName = new Map();

    for (const year of INDEX_YEAR_ORDER) {
      try {
        const parsed = await getParsedIndexYear(year);
        const entries = buildYearStudentEntries(year, parsed, currentStudents2026);

        for (const entry of entries) {
          const k = norm(entry.name);
          if (!k) continue;

          if (!byName.has(k)) {
            byName.set(k, {
              name: entry.name,
              key: entry.key || '',
              currentKey: entry.currentKey || '',
              years: [year]
            });
            continue;
          }

          const prev = byName.get(k);
          const yearSet = new Set(prev.years || []);
          yearSet.add(year);

          byName.set(k, {
            ...prev,
            name: prev.name || entry.name || '',
            key: prev.key || entry.key || '',
            currentKey: prev.currentKey || entry.currentKey || '',
            years: INDEX_YEAR_ORDER.filter(y => yearSet.has(y))
          });
        }
      } catch (err) {
        console.warn(`No se pudo construir índice del año ${year}:`, err);
      }
    }

    __globalStudentIndexCache = Array.from(byName.values()).sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), 'es')
    );

    return mergeSearchIndexWithCurrentStudents(__globalStudentIndexCache, currentStudents2026);
  }

  async function loadGlobalStudentIndex(currentStudents2026 = []) {
    try {
      const index = await buildGlobalStudentIndex(currentStudents2026);
      state.searchStudents = dedupeByNormalizedName(index);
      state.historicalIndexReady = true;
      return state.searchStudents;
    } catch (err) {
      console.warn('No se pudo cargar el índice global de estudiantes:', err);
      state.searchStudents = dedupeByNormalizedName(currentStudents2026 || []);
      state.historicalIndexReady = false;
      return state.searchStudents;
    }
  }

  function ensureGlobalStudentIndex(currentStudents2026 = []) {
    if (state.historicalIndexReady && state.searchStudents?.length) {
      return Promise.resolve(state.searchStudents);
    }

    if (__globalIndexPromise) return __globalIndexPromise;

    __globalIndexPromise = loadGlobalStudentIndex(currentStudents2026)
      .finally(() => {
        __globalIndexPromise = null;
      });

    return __globalIndexPromise;
  }

  function warmGlobalStudentIndexInBackground() {
    setTimeout(async () => {
      try {
        await ensureGlobalStudentIndex(state.allStudents);

        if (state.historicalIndexReady) {
          setText(
            ctx.el.status,
            `Listo ✅ · búsqueda histórica activa (${state.searchStudents.length || 0} estudiantes)`
          );
        }
      } catch (err) {
        console.warn('No se pudo cargar el índice global en background:', err);
      }
    }, 0);
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

  async function onProgramacionStudentRequested(studentName) {
    if (!studentName) return;

    const normalized = norm(studentName);

    const currentMatch = (state.allStudents || []).find(
      s => norm(s.name) === normalized
    );

    if (currentMatch?.key) {
      openStudentFicha(currentMatch.key, { focusProgramacion: true });
      return;
    }

    await ensureGlobalStudentIndex(state.allStudents);

    const searchEntry = (state.searchStudents || []).find(
      s => norm(s.name) === normalized
    );

    if (searchEntry && RIPUI.ficha?.openStudentFromSearch) {
      await RIPUI.ficha.openStudentFromSearch(ctx, state, searchEntry);
      showFichaContainer();
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

    // Actualizar SOLO programación
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

    // Refresh general — nuclear: borra absolutamente todo sin caché
    ctx.el.btnRefresh?.addEventListener('click', async () => {
      // 1) Caches en memoria del índice global
      clearAppCaches();
      __studentIndexYearCache.clear();
      __globalStudentIndexCache = null;
      __globalIndexPromise = null;

      // 2) Cache de programación en sessionStorage
      try {
        const keysToDelete = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith('rip_prog_schedule_')) keysToDelete.push(k);
        }
        keysToDelete.forEach(k => sessionStorage.removeItem(k));
      } catch (_) {}

      // 3) Cache de históricos en ui.ficha.js
      if (window.RIPUI?.ficha?.clearCaches) {
        try { window.RIPUI.ficha.clearCaches(); } catch (_) {}
      }

      toast(ctx.el.toastWrap, '🔄 Actualizando todo sin caché…', 'info');
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
  // Boot progresivo real
  // =========================
  async function boot({ force = true } = {}) {
    try {
      clearAppCaches();
      resetStateForFreshLoad();

      setText(ctx.el.badgeMode, 'LIVE');
      setText(ctx.el.badgeCount, 'Cargando…');
      setText(ctx.el.status, 'Cargando registro 2026…');

      // ─── FASE 1: Carga rápida 2026 → tabla usable YA ───────────────────────
      const fast = await RIPCore.loadRegistroFast({ force: !!force });

      state.registro = fast.rows || [];
      state.allStudents = fast.allStudents || [];
      state.paramsMap = new Map();

      // Índice de búsqueda 2026 inmediato para el datalist
      state.searchStudents = dedupeByNormalizedName(
        mergeSearchIndexWithCurrentStudents([], state.allStudents || [])
      );

      // Tabla visible y filtrable de inmediato
      if (RIPUI.table) {
        RIPUI.table.init(ctx, state);
        if (RIPUI.table.applyAndRender) {
          RIPUI.table.applyAndRender(ctx, state);
        }
      }

      setText(ctx.el.badgeMode, 'LIVE');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Cargando análisis y programación…');

      // ─── FASE 2: Programación + análisis completo en paralelo ──────────────
      const [pack] = await Promise.allSettled([
        RIPCore.loadAll({ force: !!force }),
        loadProgramacionSummary().catch(e => console.warn('Programación:', e))
      ]);

      if (pack.status === 'fulfilled' && pack.value) {
        const p = pack.value;
        state.registro   = p.registro  || state.registro;
        state.paramsMap  = p.paramsMap  || state.paramsMap;
        state.allStudents = p.allStudents || state.allStudents;

        // Actualizar índice 2026 con los datos completos
        state.searchStudents = dedupeByNormalizedName(
          mergeSearchIndexWithCurrentStudents([], state.allStudents || [])
        );
      }

      if (RIPUI.table?.applyAndRender) {
        RIPUI.table.applyAndRender(ctx, state);
      }

      renderDashboards();

      setText(ctx.el.badgeMode, 'LIVE');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Listo ✅');

      toast(ctx.el.toastWrap, 'Datos cargados ✓', 'ok');

      // ─── FASE 3: Histórico 2023-2025 en fondo (no bloquea nada) ────────────
      warmGlobalStudentIndexInBackground();

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
    clearAppCaches,
    loadGlobalStudentIndex,
    ensureGlobalStudentIndex
  };

  // =========================
  // Init
  // =========================
  wireTopUI();
  clearAppCaches();
  boot({ force: true });
})();