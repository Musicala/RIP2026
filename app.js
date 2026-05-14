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
  const { toast, buildContext, hide, show, setText, setHTML, norm, escapeHTML } = RIPUI.shared;
  const MORE_INFO_URL = 'https://musicala.github.io/estudiantesmusicala/';
  const TSV_ESTUDIANTES_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vQQO-CBQoN1QZ4GFExJWmPz6YNLO6rhaIsWBv-Whlu9okpZRpcxfUtLYeAMKaiNOQJrrf3Vcwhk32kZ/pub?gid=2130299316&single=true&output=tsv';
  const FICHA_COL = {
    nombre: 0, estado: 1, edad: 4, tel: 9, cel: 10, curso: 11,
    estiloM: 12, estiloN: 13, estiloO: 14, plan: 16, modalidad: 17, acudiente: 20
  };
  let __studentsInfoMap = null;

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

  function normName(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function parseTSVRows(text) {
    return String(text || '')
      .replace(/\r/g, '')
      .split('\n')
      .filter(Boolean)
      .map((r) => r.split('\t'));
  }

  async function ensureStudentsInfoMap() {
    if (__studentsInfoMap instanceof Map) return __studentsInfoMap;
    const res = await fetch(TSV_ESTUDIANTES_URL + '&_ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('No pude cargar TSV_ESTUDIANTES');
    const txt = await res.text();
    const rows = parseTSVRows(txt).slice(1);
    const map = new Map();
    for (const r of rows) {
      const name = String(r[FICHA_COL.nombre] || '').trim();
      if (!name) continue;
      const key = normName(name);
      if (!map.has(key)) map.set(key, r);
    }
    __studentsInfoMap = map;
    return map;
  }

  function buildEstilo(row) {
    const vals = [row[FICHA_COL.estiloM], row[FICHA_COL.estiloN], row[FICHA_COL.estiloO]]
      .map((x) => String(x || '').trim())
      .filter(Boolean);
    return vals.join(', ');
  }

  function openStudentInfoModal(studentName, row) {
    const prev = document.getElementById('ripStudentInfoModal');
    if (prev) prev.remove();

    const modal = document.createElement('div');
    modal.id = 'ripStudentInfoModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9200;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box" style="width:min(760px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Ficha · ${studentName}</span>
          <button class="rip-modal-close" type="button">×</button>
        </div>
        <div class="rip-modal-body">
          <div class="formGrid">
            <div class="field"><span>Estado</span><div class="control">${String(row[FICHA_COL.estado] || '—')}</div></div>
            <div class="field"><span>Edad</span><div class="control">${String(row[FICHA_COL.edad] || '—')}</div></div>
            <div class="field"><span>Curso</span><div class="control">${String(row[FICHA_COL.curso] || '—')}</div></div>
            <div class="field"><span>Teléfono</span><div class="control">${String(row[FICHA_COL.tel] || '—')}</div></div>
            <div class="field"><span>Celular</span><div class="control">${String(row[FICHA_COL.cel] || '—')}</div></div>
            <div class="field"><span>Plan</span><div class="control">${String(row[FICHA_COL.plan] || '—')}</div></div>
            <div class="field"><span>Modalidad</span><div class="control">${String(row[FICHA_COL.modalidad] || '—')}</div></div>
            <div class="field" style="grid-column:1/-1;"><span>Estilo</span><div class="control">${buildEstilo(row) || '—'}</div></div>
            <div class="field" style="grid-column:1/-1;"><span>Acudiente</span><div class="control">${String(row[FICHA_COL.acudiente] || '—')}</div></div>
          </div>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    document.body.appendChild(modal);
  }

  function buildStudentUrl(baseUrl, studentName) {
    const name = String(studentName || '').trim();
    if (!name) return baseUrl;
    const u = new URL(baseUrl);
    u.searchParams.set('student', name);
    return u.toString();
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
    setText(ctx.el.fichaUltPagoValor, '—');
    setText(ctx.el.fichaTotalPagos, '—');
    setText(ctx.el.fichaProxPago, '—');
    setHTML(ctx.el.fichaSaldosMini, '');
    show(ctx.el.fichaSummaryBlock);
    show(ctx.el.programacionStudentView);

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
  function loadScriptOnce(src, id) {
    return new Promise((resolve, reject) => {
      const existing = id ? document.getElementById(id) : null;
      if (existing?.dataset?.loaded === 'true') {
        resolve();
        return;
      }

      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('No cargó ' + src)), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      if (id) script.id = id;

      const timer = setTimeout(() => {
        script.remove();
        reject(new Error('Tiempo agotado cargando ' + src));
      }, 20000);

      script.onload = () => {
        clearTimeout(timer);
        script.dataset.loaded = 'true';
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timer);
        script.remove();
        reject(new Error('No cargó ' + src));
      };

      document.head.appendChild(script);
    });
  }

  function getPDFLibraries() {
    return {
      html2canvasFn: window.html2canvas || null,
      JsPDFCtor: window.jspdf?.jsPDF || window.jsPDF || null
    };
  }

  async function ensurePDFLibraries() {
    let libs = getPDFLibraries();
    const jobs = [];

    if (!libs.html2canvasFn) {
      jobs.push(loadScriptOnce(
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'rip-lib-html2canvas'
      ));
    }

    if (!libs.JsPDFCtor) {
      jobs.push(loadScriptOnce(
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
        'rip-lib-jspdf'
      ));
    }

    if (jobs.length) await Promise.all(jobs);

    libs = getPDFLibraries();
    if (!libs.html2canvasFn || !libs.JsPDFCtor) {
      throw new Error('html2canvas/jsPDF no quedaron disponibles en window.');
    }

    return libs;
  }
  async function exportPDF(element, filename, sections = {}) {
    if (!element) {
      toast(ctx.el.toastWrap, 'No hay contenido para exportar.', 'warn');
      return;
    }

    let pdfLibs;
    try {
      pdfLibs = await ensurePDFLibraries();
    } catch (err) {
      console.error(err);
      toast(ctx.el.toastWrap, 'No pude cargar las librerías PDF. Revisa conexión o CDN.', 'warn');
      return;
    }

    const { html2canvasFn, JsPDFCtor } = pdfLibs;

    const rawTitle =
      element.querySelector('#fichaStudent')?.textContent?.trim() ||
      element.querySelector('#fichaTitle')?.textContent?.trim() ||
      element.querySelector('h3')?.textContent?.trim() ||
      'RIP 2026';
    const title = rawTitle.replace(/^Ficha\s*[·.-]\s*/i, '').trim() || rawTitle;
    const subtitle =
      element.querySelector('#fichaSub')?.textContent?.trim() ||
      'Registro integral de pagos';
    const exportDate = new Date().toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    // Ancho real del lienzo de exportación. Más pequeño que 1200 para que la
    // ficha y la tabla no nazcan desbordadas en móviles. Igual se escala completo
    // dentro de la página PDF, sin recortar columnas.
    const PDF_EXPORT_WIDTH = 1080;
    const PDF_MARGIN_MM = 5;
    const PDF_TARGET_SCALE = 3;
    const PDF_MAX_RENDER_PIXELS = 90000000;

    const stage = document.createElement('div');
    stage.className = 'pdf-export-stage';
    stage.setAttribute('aria-hidden', 'true');
    Object.assign(stage.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      width: `${PDF_EXPORT_WIDTH}px`,
      maxWidth: 'none',
      height: 'auto',
      maxHeight: 'none',
      overflow: 'visible',
      background: '#ffffff',
      zIndex: '2147483647',
      pointerEvents: 'none'
    });

    const clone = element.cloneNode(true);
    clone.classList.add('pdf-export-clone');
    Object.assign(clone.style, {
      display: 'block',
      width: '100%',
      minWidth: '0',
      maxWidth: 'none',
      boxSizing: 'border-box',
      height: 'auto',
      maxHeight: 'none',
      overflow: 'visible',
      background: '#ffffff',
      transform: 'none'
    });

    // Quita scrolls heredados. Si una tabla quedó movida horizontalmente en pantalla,
    // el clon no debe conservar ese scroll, porque ahí nace el “PDF cortado”.
    clone.querySelectorAll('*').forEach((node) => {
      try {
        node.scrollLeft = 0;
        node.scrollTop = 0;
        if (node.style) {
          node.style.transform = 'none';
          node.style.translate = 'none';
        }
      } catch (_) {}
    });

    clone.querySelectorAll('.table-wrap, .tableWrap').forEach((node) => {
      node.style.overflow = 'visible';
      node.style.maxHeight = 'none';
      node.style.height = 'auto';
      node.style.width = '100%';
      node.style.maxWidth = 'none';
      node.scrollLeft = 0;
      node.scrollTop = 0;
    });

    clone.querySelector('#tablaContainer')?.classList.add('pdf-registro-table');
    clone.querySelectorAll('.ficha-actions, .tabs, button').forEach((node) => node.remove());

    if (sections.saldos === false) {
      clone.querySelector('#fichaSummaryBlock')?.remove();
    }
    if (sections.programacion === false) {
      clone.querySelector('#programacionStudentView')?.remove();
    }
    if (sections.registro === false) {
      clone.querySelector('#tablaContainer')?.remove();
    }

    stage.innerHTML = `
      <div class="pdf-export-page">
        <header class="pdf-export-head">
          <div>
            <div class="pdf-export-brand">Musicala · RIP 2026</div>
            <h1>${escapeHTML(title)}</h1>
            <p>${escapeHTML(subtitle)}</p>
          </div>
          <div class="pdf-export-meta">
            <span>Exportado</span>
            <strong>${escapeHTML(exportDate)}</strong>
          </div>
        </header>
      </div>
    `;

    const page = stage.querySelector('.pdf-export-page');
    Object.assign(page.style, {
      width: `${PDF_EXPORT_WIDTH}px`,
      minWidth: `${PDF_EXPORT_WIDTH}px`,
      maxWidth: 'none',
      overflow: 'visible'
    });
    page.appendChild(clone);

    document.body.appendChild(stage);

    try {
      toast(ctx.el.toastWrap, 'Preparando PDF...', 'info');
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const source = stage.querySelector('.pdf-export-page');
      const captureWidth = Math.ceil(Math.max(PDF_EXPORT_WIDTH, source.scrollWidth, source.offsetWidth));
      const captureHeight = Math.ceil(Math.max(source.scrollHeight, source.offsetHeight)) + 12;

      const basePixels = Math.max(1, captureWidth * captureHeight);
      const scaleByPixels = Math.sqrt(PDF_MAX_RENDER_PIXELS / basePixels);
      const renderScale = Math.max(1.8, Math.min(PDF_TARGET_SCALE, scaleByPixels));

      const canvas = await html2canvasFn(source, {
        scale: renderScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight
      });

      const pdf = new JsPDFCtor({
        orientation: 'landscape',
        unit: 'mm',
        format: 'letter',
        compress: false
      });

      pdf.setProperties({
        title: filename || 'RIP 2026',
        subject: 'Registro integral de pagos',
        creator: 'Musicala RIP 2026'
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const innerWidth = pageWidth - PDF_MARGIN_MM * 2;
      const innerHeight = pageHeight - PDF_MARGIN_MM * 2;
      const sliceHeightPx = Math.max(1, Math.floor(canvas.width * (innerHeight / innerWidth)));

      const pageCanvas = document.createElement('canvas');
      const pageCtx = pageCanvas.getContext('2d');
      let renderedHeight = 0;
      let pageIndex = 0;

      while (renderedHeight < canvas.height) {
        const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - renderedHeight);
        pageCanvas.width = canvas.width;
        pageCanvas.height = currentSliceHeight;
        pageCtx.fillStyle = '#ffffff';
        pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        pageCtx.drawImage(
          canvas,
          0,
          renderedHeight,
          canvas.width,
          currentSliceHeight,
          0,
          0,
          canvas.width,
          currentSliceHeight
        );

        if (pageIndex > 0) pdf.addPage('letter', 'landscape');

        const imgData = pageCanvas.toDataURL('image/png');
        const sliceHeightMm = currentSliceHeight * innerWidth / canvas.width;
        pdf.addImage(
          imgData,
          'PNG',
          PDF_MARGIN_MM,
          PDF_MARGIN_MM,
          innerWidth,
          sliceHeightMm,
          undefined,
          'NONE'
        );

        renderedHeight += currentSliceHeight;
        pageIndex += 1;
      }

      pdf.save(filename || 'RIP_2026.pdf');
    } catch (err) {
      console.error(err);
      toast(ctx.el.toastWrap, 'No pude exportar PDF. Intenta actualizar y descargar otra vez.', 'warn');
    } finally {
      stage.remove();
    }
  }

  function openPDFOptions(element, filename) {
    if (!element) {
      toast(ctx.el.toastWrap, 'No hay contenido para exportar.', 'warn');
      return;
    }

    const isFicha = element === ctx.el.fichaView;
    if (!isFicha) {
      exportPDF(element, filename);
      return;
    }

    const prev = document.getElementById('ripPDFOptionsModal');
    if (prev) prev.remove();

    const hasSaldos = !!element.querySelector('#fichaSummaryBlock');
    const hasProgramacion = !!element.querySelector('#programacionStudentView');
    const hasRegistro = !!element.querySelector('#tablaContainer');

    const modal = document.createElement('div');
    modal.id = 'ripPDFOptionsModal';
    modal.className = 'rip-pdf-modal';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Contenido del PDF</span>
          <button class="rip-modal-close" type="button">×</button>
        </div>
        <div class="rip-modal-body">
          <label class="pdf-check ${hasSaldos ? '' : 'is-disabled'}">
            <input type="checkbox" data-pdf-section="saldos" ${hasSaldos ? 'checked' : 'disabled'}>
            <span>Saldos / resumen</span>
          </label>
          <label class="pdf-check ${hasProgramacion ? '' : 'is-disabled'}">
            <input type="checkbox" data-pdf-section="programacion" ${hasProgramacion ? 'checked' : 'disabled'}>
            <span>Programación</span>
          </label>
          <label class="pdf-check ${hasRegistro ? '' : 'is-disabled'}">
            <input type="checkbox" data-pdf-section="registro" ${hasRegistro ? 'checked' : 'disabled'}>
            <span>Registro</span>
          </label>
        </div>
        <div class="rip-modal-actions">
          <button class="btn ghost" type="button" data-pdf-cancel>Cancelar</button>
          <button class="btn primary" type="button" data-pdf-export>Descargar PDF</button>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-pdf-cancel]')?.addEventListener('click', close);
    modal.querySelector('[data-pdf-export]')?.addEventListener('click', () => {
      const sections = {
        saldos: !!modal.querySelector('[data-pdf-section="saldos"]')?.checked,
        programacion: !!modal.querySelector('[data-pdf-section="programacion"]')?.checked,
        registro: !!modal.querySelector('[data-pdf-section="registro"]')?.checked
      };

      if (!sections.saldos && !sections.programacion && !sections.registro) {
        toast(ctx.el.toastWrap, 'Elige al menos una sección para el PDF.', 'warn');
        return;
      }

      close();
      exportPDF(element, filename, sections);
    });

    document.body.appendChild(modal);
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
      const url = window.PAYMENT_WEBAPP_URL || 'https://musicala.github.io/registrodepagos2026/';
      if (!url) {
        toast(ctx.el.toastWrap, 'PAYMENT_WEBAPP_URL no está configurada en esta versión.', 'warn');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Registrar clases
    ctx.el.btnClases?.addEventListener('click', () => {
      const url = window.REGISTRAR_CLASES_URL || 'https://musicala.github.io/RegistroWix2026/';
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

      openPDFOptions(target, fileName);
    });

    // PDF ficha/base
    ctx.el.btnPDF?.addEventListener('click', () => {
      const name = getCurrentStudentName() || 'Base';
      openPDFOptions(ctx.el.fichaView, `RIP_2026_${name}.pdf`);
    });

    // Botones bloque programación
    ctx.el.btnOpenProg?.addEventListener('click', () => openProgramacionMode('prog'));
    ctx.el.btnOpenReprog?.addEventListener('click', () => openProgramacionMode('reprog'));

    ctx.el.btnBackToRipTable?.addEventListener('click', () => {
      hide(ctx.el.programacionStudentView);
      resetProgramacionEmbed();
      show(ctx.el.tablaContainer);
    });

    ctx.el.btnOpenMainFicha?.addEventListener('click', () => {
      const name = getCurrentStudentName();
      if (!name) {
        toast(ctx.el.toastWrap, 'Primero selecciona un estudiante.', 'warn');
        return;
      }
      ensureStudentsInfoMap()
        .then((map) => {
          const row = map.get(normName(name));
          if (!row) {
            toast(ctx.el.toastWrap, 'No encontré datos principales para ese estudiante.', 'warn');
            return;
          }
          openStudentInfoModal(name, row);
        })
        .catch((err) => {
          console.error(err);
          toast(ctx.el.toastWrap, 'No se pudo abrir la ficha principal.', 'warn');
        });
    });

    ctx.el.btnOpenMoreInfo?.addEventListener('click', () => {
      const name = getCurrentStudentName();
      const url = buildStudentUrl(MORE_INFO_URL, name);
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  // =========================
  // Boot progresivo real
  // =========================
  async function boot({ force = false } = {}) {
    try {
      if (force) clearAppCaches();
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
        RIPCore.loadAll({ force: !!force, includeHistorical: false }),
        loadProgramacionSummary().catch(e => console.warn('Programación:', e))
      ]);

      let fullPack = null;
      if (pack.status === 'fulfilled' && pack.value) {
        fullPack = pack.value;
      } else {
        try {
          fullPack = await RIPCore.loadAll({ force: true, includeHistorical: false });
        } catch (retryErr) {
          console.warn('No se pudo completar loadAll tras reintento:', retryErr);
        }
      }

      if (fullPack) {
        const p = fullPack;
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
      setTimeout(async () => {
        try {
          const hp = await RIPCore.loadAll({ force: false, includeHistorical: true });
          if (!hp) return;
          state.registro = hp.registro || state.registro;
          state.paramsMap = hp.paramsMap || state.paramsMap;
          state.allStudents = hp.allStudents || state.allStudents;
          renderDashboards();
        } catch (e) {
          console.warn('Historicos en segundo plano:', e);
        }
      }, 0);

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
  boot({ force: false });
})();
