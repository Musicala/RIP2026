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
  const { toast, buildContext, hide, show, setText, setHTML, norm, escapeHTML, fmtMoney } = RIPUI.shared;
  const MORE_INFO_URL = 'https://musicala.github.io/estudiantesmusicala/';
  const TSV_ESTUDIANTES_URL = '';
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
    clientesB2C: [],
    clientesLoaded: false,
    primeraVez: [],
    primeraVezLoaded: false,
    selectedServicios: new Set(),
    currentStudentKey: '',
    currentStudentName: '',
    currentSearchEntry: null,
    dashMode: 'review',
    reviewFilter: '',
    registroCalendar: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(),
      selected: ''
    },
    historicalIndexReady: false,

    prog: {
      data: null,
      currentStudentName: '',
      currentStudentRow: null,
      groupFilter: '',
      mode: 'dash' // dash | prog | reprog
    },
    syncSettings: readSyncSettings()
  };

  const ctx = buildContext();
  ctx.state = state;
  let syncTimer = null;
  let syncWriteTimer = null;

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

  function readSyncSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem('rip2026_sync_settings') || '{}');
      return {
        mode: saved.mode || 'afterEdit',
        intervalMinutes: Number(saved.intervalMinutes) || 5
      };
    } catch (_) {
      return { mode: 'afterEdit', intervalMinutes: 5 };
    }
  }

  function saveSyncSettings(settings) {
    state.syncSettings = {
      mode: settings.mode || 'afterEdit',
      intervalMinutes: Number(settings.intervalMinutes) || 5
    };
    localStorage.setItem('rip2026_sync_settings', JSON.stringify(state.syncSettings));
    setupSyncTimer();
  }

  function setupSyncTimer() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    const s = state.syncSettings || readSyncSettings();
    if (s.mode !== 'interval') return;
    const minutes = Math.max(1, Number(s.intervalMinutes) || 5);
    syncTimer = setInterval(() => {
      boot({ force: true }).catch((err) => {
        console.error(err);
        toast(ctx.el.toastWrap, 'No se pudo actualizar automaticamente.', 'warn');
      });
    }, minutes * 60000);
  }

  async function refreshAfterFirestoreWrite(detail = {}) {
    const s = state.syncSettings || readSyncSettings();
    if (s.mode !== 'afterEdit') return;
    if (syncWriteTimer) clearTimeout(syncWriteTimer);
    syncWriteTimer = setTimeout(async () => {
      try {
        toast(ctx.el.toastWrap, 'Cambio guardado. Actualizando...', 'info');
        await boot({ force: true });
        toast(ctx.el.toastWrap, 'Datos actualizados.', 'ok');
      } catch (err) {
        console.error(err, detail);
        toast(ctx.el.toastWrap, 'El cambio se guardo, pero no se pudo actualizar la vista.', 'warn');
      }
    }, 700);
  }

  window.RIPAppFirestoreChanged = refreshAfterFirestoreWrite;

  function openSyncSettingsModal() {
    const current = state.syncSettings || readSyncSettings();
    const prev = document.getElementById('ripSyncSettingsModal');
    if (prev) prev.remove();
    const modal = document.createElement('div');
    modal.id = 'ripSyncSettingsModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Configuracion de actualizacion</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        <div class="rip-modal-body rip-editor-body">
          <div class="ripedit-grid">
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Cuando se guarden cambios</span>
              <select id="ripSyncMode" class="control">
                <option value="afterEdit" ${current.mode === 'afterEdit' ? 'selected' : ''}>Actualizar de una al editar</option>
                <option value="interval" ${current.mode === 'interval' ? 'selected' : ''}>Actualizar cada cierto tiempo</option>
                <option value="manual" ${current.mode === 'manual' ? 'selected' : ''}>Solo con el boton Actualizar</option>
              </select>
            </label>
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Intervalo en minutos</span>
              <input id="ripSyncInterval" type="number" min="1" class="control" value="${String(current.intervalMinutes || 5)}">
            </label>
          </div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('rip-modal-in'));
    const close = () => {
      modal.classList.remove('rip-modal-in');
      setTimeout(() => modal.remove(), 160);
    };
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-cancel')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-save')?.addEventListener('click', () => {
      saveSyncSettings({
        mode: modal.querySelector('#ripSyncMode')?.value || 'afterEdit',
        intervalMinutes: modal.querySelector('#ripSyncInterval')?.value || 5
      });
      toast(ctx.el.toastWrap, 'Configuracion guardada.', 'ok');
      close();
    });
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
    if (!TSV_ESTUDIANTES_URL) {
      __studentsInfoMap = new Map();
      return __studentsInfoMap;
    }
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
    hide(ctx.el.reviewTodayView);
    hide(ctx.el.searchView);
    hide(ctx.el.clientesView);
    hide(ctx.el.primeraVezView);
    hide(ctx.el.dashboardClasView);
    hide(ctx.el.dashboardSaldoView);
    hide(ctx.el.dashboardProgView);
    hide(ctx.el.registroCalendarView);
    hide(ctx.el.fichaView);
  }

  function setHeaderTextsByMode(mode) {
    if (!ctx.el.dashTitle || !ctx.el.dashSub) return;

    if (mode === 'review') {
      ctx.el.dashTitle.textContent = 'Revisar Hoy';
      ctx.el.dashSub.textContent = 'Lo urgente primero: por revisar, saldos, programacion y registro.';
      return;
    }

    if (mode === 'search') {
      ctx.el.dashTitle.textContent = 'Buscar estudiante';
      ctx.el.dashSub.textContent = 'Consulta rapida para responder por clases, saldo, paquete y programacion.';
      return;
    }

    if (mode === 'registro') {
      ctx.el.dashTitle.textContent = 'Registro';
      ctx.el.dashSub.textContent = 'Auditoria, filtros, edicion y registro completo.';
      return;
    }

    if (mode === 'clientes') {
      ctx.el.dashTitle.textContent = 'Clientes / pagos B2C';
      ctx.el.dashSub.textContent = 'Registro de pagos por cliente, usuario, servicio y medio de pago.';
      return;
    }

    if (mode === 'primeraVez') {
      ctx.el.dashTitle.textContent = 'Primera vez';
      ctx.el.dashSub.textContent = 'Registro de cancelaciones perdonadas por primera vez.';
      return;
    }

    if (mode === 'kpis') {
      ctx.el.dashTitle.textContent = 'KPIs';
      ctx.el.dashSub.textContent = 'Numeros generales de estudiantes, saldos y programacion.';
      return;
    }

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

    ctx.el.viewTabReview?.classList.toggle('active', mode === 'review');
    ctx.el.viewTabSearch?.classList.toggle('active', mode === 'search');
    ctx.el.viewTabProg?.classList.toggle('active', mode === 'prog');
    ctx.el.viewTabSaldo?.classList.toggle('active', mode === 'saldo');
    ctx.el.viewTabRegistro?.classList.toggle('active', mode === 'registro');
    ctx.el.viewTabPrimeraVez?.classList.toggle('active', mode === 'primeraVez');
    ctx.el.viewTabClientes?.classList.toggle('active', mode === 'clientes');
    ctx.el.viewTabKpis?.classList.toggle('active', mode === 'kpis');

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
    state.clientesB2C = [];
    state.clientesLoaded = false;
    state.primeraVez = [];
    state.primeraVezLoaded = false;
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

  function studentNameScore(value) {
    const text = String(value || '').trim();
    const upper = (text.match(/[A-Z������]/g) || []).length;
    const words = norm(text).split(' ').filter(Boolean).length;
    return text.length + words * 10 + upper * 2;
  }

  function shouldMergeStudentNames(a, b) {
    const ak = norm(a);
    const bk = norm(b);
    if (!ak || !bk) return false;
    if (ak === bk) return true;
    const shorter = ak.length <= bk.length ? ak : bk;
    const longer = ak.length <= bk.length ? bk : ak;
    const words = shorter.split(' ').filter(Boolean);
    return words.length >= 2 && longer.includes(shorter);
  }

  function dedupeByNormalizedName(items) {
    const out = [];
    for (const item of items || []) {
      const name = String(item?.name || '').trim();
      const key = norm(name);
      if (!key) continue;
      const idx = out.findIndex(prev => shouldMergeStudentNames(prev?.name, name));
      if (idx >= 0) {
        if (studentNameScore(name) > studentNameScore(out[idx]?.name)) out[idx] = item;
      } else {
        out.push(item);
      }
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
      return { headers: [], rows: [] };
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

  function describeClienteUsuarios(row) {
    return (Array.isArray(row?.usuarios) ? row.usuarios : [])
      .map(u => String(u?.estudiante || u?.nombre || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function describeClienteServicios(row) {
    return (Array.isArray(row?.usuarios) ? row.usuarios : [])
      .map(u => String(u?.servicio || '').trim())
      .filter(Boolean)
      .join(', ');
  }

  function filterClientesB2C() {
    const q = norm(ctx.el.clientesSearch?.value || '');
    const rows = Array.isArray(state.clientesB2C) ? state.clientesB2C : [];
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [
        row.id,
        row.fecha,
        row.medioPago,
        row.tipoEstudiante,
        row.comentario,
        describeClienteUsuarios(row),
        describeClienteServicios(row)
      ].join(' ');
      return norm(haystack).includes(q);
    });
  }

  function buildClienteEditUserRows(row) {
    const usuarios = Array.isArray(row?.usuarios) && row.usuarios.length
      ? row.usuarios
      : [{ estudiante: '', servicio: '', precio: 0 }];
    return usuarios.map((u, index) => `
      <div class="ripedit-grid cliente-user-row" data-user-row>
        <label class="ripedit-field">
          <span class="ripedit-label">Estudiante ${index + 1}</span>
          <input class="control" data-cliente-user="estudiante" value="${escapeHTML(u.estudiante || '')}">
        </label>
        <label class="ripedit-field">
          <span class="ripedit-label">Servicio</span>
          <input class="control" data-cliente-user="servicio" value="${escapeHTML(u.servicio || '')}">
        </label>
        <label class="ripedit-field">
          <span class="ripedit-label">Precio</span>
          <input class="control" data-cliente-user="precio" value="${escapeHTML(u.precio || '')}">
        </label>
      </div>
    `).join('');
  }

  function readClienteEditModal(modal) {
    const usuarios = Array.from(modal.querySelectorAll('[data-user-row]')).map((row, index) => ({
      index: index + 1,
      estudiante: row.querySelector('[data-cliente-user="estudiante"]')?.value || '',
      servicio: row.querySelector('[data-cliente-user="servicio"]')?.value || '',
      precio: row.querySelector('[data-cliente-user="precio"]')?.value || ''
    })).filter(u => u.estudiante.trim() || u.servicio.trim() || String(u.precio).trim());
    return {
      fecha: modal.querySelector('[data-cliente-field="fecha"]')?.value || '',
      tipoEstudiante: modal.querySelector('[data-cliente-field="tipoEstudiante"]')?.value || '',
      medioPago: modal.querySelector('[data-cliente-field="medioPago"]')?.value || '',
      recargo: modal.querySelector('[data-cliente-field="recargo"]')?.value || '',
      descuento: modal.querySelector('[data-cliente-field="descuento"]')?.value || '',
      FEVM: modal.querySelector('[data-cliente-field="FEVM"]')?.value || '',
      comentario: modal.querySelector('[data-cliente-field="comentario"]')?.value || '',
      usuarios
    };
  }

  function openClienteEditModal(recordId) {
    const row = (state.clientesB2C || []).find(r => r.id === recordId);
    if (!row) return;
    const prev = document.getElementById('ripClienteEditModal');
    if (prev) prev.remove();
    const modal = document.createElement('div');
    modal.id = 'ripClienteEditModal';
    modal.className = 'rip-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box" style="width:min(920px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Editar pago B2C</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        <div class="rip-modal-body rip-editor-body">
          <div class="ripedit-grid">
            <label class="ripedit-field">
              <span class="ripedit-label">Fecha</span>
              <input class="control" data-cliente-field="fecha" value="${escapeHTML(row.fecha || '')}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Tipo estudiante</span>
              <input class="control" data-cliente-field="tipoEstudiante" value="${escapeHTML(row.tipoEstudiante || '')}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Medio de pago</span>
              <input class="control" data-cliente-field="medioPago" value="${escapeHTML(row.medioPago || '')}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Recargo</span>
              <input class="control" data-cliente-field="recargo" value="${escapeHTML(row.recargo || '')}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Descuento</span>
              <input class="control" data-cliente-field="descuento" value="${escapeHTML(row.descuento || '')}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">FEVM</span>
              <input class="control" data-cliente-field="FEVM" value="${escapeHTML(row.FEVM || '')}">
            </label>
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Comentario</span>
              <textarea class="control" data-cliente-field="comentario" rows="2">${escapeHTML(row.comentario || '')}</textarea>
            </label>
          </div>
          <div class="card-title" style="margin-top:14px">
            <h3>Usuarios del pago</h3>
            <p class="muted">El total se recalcula con precios + recargo - descuento.</p>
          </div>
          <div id="clienteUsersEdit">${buildClienteEditUserRows(row)}</div>
          <div class="filters-actions">
            <button class="btn ghost" type="button" id="btnClienteAddUser">Agregar usuario</button>
            <span class="status" id="clienteEditStatus">Listo para editar.</span>
          </div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">Guardar cambios</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('rip-modal-in'));
    const close = () => {
      modal.classList.remove('rip-modal-in');
      setTimeout(() => modal.remove(), 180);
    };
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-cancel')?.addEventListener('click', close);
    modal.querySelector('#btnClienteAddUser')?.addEventListener('click', () => {
      const wrap = modal.querySelector('#clienteUsersEdit');
      const temp = document.createElement('div');
      temp.innerHTML = buildClienteEditUserRows({ usuarios: [{ estudiante: '', servicio: '', precio: 0 }] });
      wrap?.appendChild(temp.firstElementChild);
    });
    modal.querySelector('.rip-modal-save')?.addEventListener('click', async () => {
      try {
        setText(modal.querySelector('#clienteEditStatus'), 'Guardando...');
        const saved = await RIPRepository.updateClienteB2C(recordId, readClienteEditModal(modal));
        state.clientesB2C = (state.clientesB2C || []).map(r => r.id === recordId ? saved : r);
        renderClientesView();
        toast(ctx.el.toastWrap, 'Pago actualizado.', 'success');
        close();
      } catch (err) {
        console.error(err);
        setText(modal.querySelector('#clienteEditStatus'), 'No se pudo guardar.');
        toast(ctx.el.toastWrap, 'No se pudo guardar el pago.', 'warn');
      }
    });
  }

  function renderClientesView() {
    if (!ctx.el.clientesBody) return;
    const rows = filterClientesB2C();
    setText(ctx.el.clientesStatus, state.clientesLoaded
      ? `${rows.length} de ${(state.clientesB2C || []).length} pagos`
      : 'Cargando pagos...');
    if (!rows.length) {
      ctx.el.clientesBody.innerHTML = `<tr><td colspan="9" class="empty-td">${state.clientesLoaded ? 'No hay pagos para mostrar.' : 'Cargando pagos...'}</td></tr>`;
      return;
    }
    ctx.el.clientesBody.innerHTML = rows.map((row) => {
      const ajuste = [
        Number(row.recargo) ? `+${fmtMoney(row.recargo)}` : '',
        Number(row.descuento) ? `-${fmtMoney(row.descuento)}` : ''
      ].filter(Boolean).join(' / ') || '-';
      return `
        <tr>
          <td>${escapeHTML(row.fecha || '')}</td>
          <td>${escapeHTML(describeClienteUsuarios(row) || '-')}</td>
          <td>${escapeHTML(describeClienteServicios(row) || '-')}</td>
          <td>${escapeHTML(fmtMoney(row.total || 0))}</td>
          <td>${escapeHTML(row.medioPago || '-')}</td>
          <td>${escapeHTML(ajuste)}</td>
          <td>${escapeHTML(fmtMoney(row.FEVM || 0))}</td>
          <td><code>${escapeHTML(String(row.id || '').slice(0, 10))}</code></td>
          <td><button class="btn small" type="button" data-cliente-edit="${escapeHTML(row.id || '')}">Editar</button></td>
        </tr>
      `;
    }).join('');
    ctx.el.clientesBody.querySelectorAll('[data-cliente-edit]').forEach(btn => {
      btn.addEventListener('click', () => openClienteEditModal(btn.getAttribute('data-cliente-edit')));
    });
  }

  async function loadClientesB2C(force = false) {
    if (state.clientesLoaded && !force) {
      renderClientesView();
      return state.clientesB2C;
    }
    setText(ctx.el.clientesStatus, 'Cargando pagos...');
    try {
      state.clientesB2C = await RIPRepository.loadClientesB2C();
      state.clientesLoaded = true;
      renderClientesView();
      return state.clientesB2C;
    } catch (err) {
      console.error(err);
      state.clientesLoaded = false;
      setText(ctx.el.clientesStatus, 'No se pudieron cargar los pagos.');
      if (ctx.el.clientesBody) {
        ctx.el.clientesBody.innerHTML = '<tr><td colspan="9" class="empty-td">No se pudieron cargar los pagos.</td></tr>';
      }
      return [];
    }
  }

  const PRIMERA_VEZ_MOTIVOS = ['Enfermedad', 'Descuido', 'Olvido', 'Familiar', 'Transporte', 'Otro'];

  function getPrimeraVezForStudent(studentNameOrKey) {
    const key = norm(studentNameOrKey);
    if (!key) return null;
    return (state.primeraVez || []).find(row => norm(row.estudianteKey || row.estudiante) === key || norm(row.estudiante) === key) || null;
  }

  function filterPrimeraVez() {
    const q = norm(ctx.el.primeraVezSearch?.value || '');
    const motivo = String(ctx.el.primeraVezMotivoFilter?.value || '').trim();
    return [...(state.primeraVez || [])]
      .filter(row => {
        if (motivo && String(row.motivo || '') !== motivo) return false;
        if (!q) return true;
        return norm(`${row.estudiante || ''} ${row.motivo || ''} ${row.detalle || ''}`).includes(q);
      })
      .sort((a, b) => (Number(b.fechaClaseTs) || 0) - (Number(a.fechaClaseTs) || 0));
  }

  function fillPrimeraVezMotivos() {
    if (!ctx.el.primeraVezMotivoFilter) return;
    const current = ctx.el.primeraVezMotivoFilter.value || '';
    const motives = Array.from(new Set([...PRIMERA_VEZ_MOTIVOS, ...(state.primeraVez || []).map(r => r.motivo).filter(Boolean)]));
    ctx.el.primeraVezMotivoFilter.innerHTML = '<option value="">Todos</option>' +
      motives.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
    ctx.el.primeraVezMotivoFilter.value = motives.includes(current) ? current : '';
  }

  function renderPrimeraVezView() {
    if (!ctx.el.primeraVezBody) return;
    fillPrimeraVezMotivos();
    const rows = filterPrimeraVez();
    setText(ctx.el.primeraVezStatus, state.primeraVezLoaded
      ? `${rows.length} de ${(state.primeraVez || []).length} registros`
      : 'Cargando registros...');

    const byMotivo = new Map();
    for (const row of state.primeraVez || []) {
      const key = row.motivo || 'Sin motivo';
      byMotivo.set(key, (byMotivo.get(key) || 0) + 1);
    }
    if (ctx.el.primeraVezKpis) {
      const total = (state.primeraVez || []).length;
      const motivoCards = Array.from(byMotivo.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => `<div class="kpi-card"><div class="v">${count}</div><div class="t">${escapeHTML(label)}</div></div>`)
        .join('');
      ctx.el.primeraVezKpis.innerHTML = `<div class="kpi-card"><div class="v">${total}</div><div class="t">Total perdonadas</div></div>${motivoCards}`;
    }

    if (!rows.length) {
      ctx.el.primeraVezBody.innerHTML = `<tr><td colspan="6" class="empty-td">${state.primeraVezLoaded ? 'No hay registros para mostrar.' : 'Cargando registros...'}</td></tr>`;
      return;
    }

    ctx.el.primeraVezBody.innerHTML = rows.map(row => `
      <tr>
        <td>${escapeHTML(row.fechaClase || '-')}</td>
        <td>${escapeHTML(row.estudiante || '-')}</td>
        <td>${escapeHTML(row.motivo || '-')}</td>
        <td>${escapeHTML(row.detalle || '-')}</td>
        <td>${escapeHTML(row.fechaRegistro || '-')}</td>
        <td>
          <button class="btn small" type="button" data-pv-edit="${escapeHTML(row.id || '')}">Editar</button>
          <button class="btn small ghost" type="button" data-pv-del="${escapeHTML(row.id || '')}">Eliminar</button>
        </td>
      </tr>
    `).join('');

    ctx.el.primeraVezBody.querySelectorAll('[data-pv-edit]').forEach(btn => {
      btn.addEventListener('click', () => openPrimeraVezModal({ recordId: btn.getAttribute('data-pv-edit') }));
    });
    ctx.el.primeraVezBody.querySelectorAll('[data-pv-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-pv-del');
        if (!id || !confirm('Eliminar este registro de primera vez?')) return;
        await RIPRepository.deletePrimeraVez(id);
        state.primeraVez = (state.primeraVez || []).filter(r => r.id !== id);
        renderPrimeraVezView();
        toast(ctx.el.toastWrap, 'Registro eliminado.', 'ok');
      });
    });
  }

  async function loadPrimeraVez(force = false) {
    if (state.primeraVezLoaded && !force) {
      renderPrimeraVezView();
      return state.primeraVez;
    }
    setText(ctx.el.primeraVezStatus, 'Cargando registros...');
    try {
      state.primeraVez = await RIPRepository.loadPrimeraVez();
      state.primeraVezLoaded = true;
      renderPrimeraVezView();
      updatePrimeraVezFichaButton();
      return state.primeraVez;
    } catch (err) {
      console.error(err);
      state.primeraVezLoaded = false;
      setText(ctx.el.primeraVezStatus, 'No se pudieron cargar los registros.');
      if (ctx.el.primeraVezBody) {
        ctx.el.primeraVezBody.innerHTML = '<tr><td colspan="6" class="empty-td">No se pudieron cargar los registros.</td></tr>';
      }
      return [];
    }
  }

  function updatePrimeraVezFichaButton() {
    if (!ctx.el.btnPrimeraVezFicha) return;
    const name = getCurrentStudentName();
    const existing = getPrimeraVezForStudent(name || state.currentStudentKey);
    ctx.el.btnPrimeraVezFicha.textContent = existing
      ? `Primera vez registrada (${existing.motivo || 'sin motivo'})`
      : 'Registrar primera vez';
    ctx.el.btnPrimeraVezFicha.classList.toggle('ghost', !!existing);
    ctx.el.btnPrimeraVezFicha.title = existing
      ? `Registrada el ${existing.fechaClase || '-'}`
      : 'Registrar perdon de primera vez';
    setText(
      ctx.el.fichaPrimeraVez,
      existing ? `${existing.fechaClase || '-'} · ${existing.motivo || 'Sin motivo'}` : '—'
    );
  }

  function openPrimeraVezModal(opts = {}) {
    const record = opts.recordId ? (state.primeraVez || []).find(r => r.id === opts.recordId) : null;
    const studentName = opts.studentName || record?.estudiante || getCurrentStudentName() || '';
    const existing = !record ? getPrimeraVezForStudent(studentName) : null;
    const modal = document.createElement('div');
    modal.id = 'ripPrimeraVezModal';
    modal.className = 'rip-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    const motives = Array.from(new Set([...PRIMERA_VEZ_MOTIVOS, record?.motivo].filter(Boolean)));
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box" style="width:min(760px,calc(100vw - 28px));max-height:calc(100vh - 28px);overflow:auto;">
        <div class="rip-modal-head">
          <span class="rip-modal-title">${record ? 'Editar primera vez' : 'Registrar primera vez'}</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        <div class="rip-modal-body rip-editor-body">
          ${existing ? `<div class="empty-td" style="text-align:left;margin-bottom:12px">Este estudiante ya tiene primera vez registrada el ${escapeHTML(existing.fechaClase || '-')}: ${escapeHTML(existing.motivo || '-')}.</div>` : ''}
          <div class="ripedit-grid">
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Estudiante</span>
              <input id="pvEstudiante" class="control" list="nombresLista" value="${escapeHTML(studentName)}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Fecha de clase</span>
              <input id="pvFechaClase" class="control" type="date" value="${escapeHTML(record?.fechaClase || toISODate(new Date()))}">
            </label>
            <label class="ripedit-field">
              <span class="ripedit-label">Motivo</span>
              <select id="pvMotivo" class="control">
                <option value="">Seleccionar...</option>
                ${motives.map(m => `<option value="${escapeHTML(m)}" ${record?.motivo === m ? 'selected' : ''}>${escapeHTML(m)}</option>`).join('')}
              </select>
            </label>
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Detalle</span>
              <textarea id="pvDetalle" class="control" rows="4" placeholder="Ej: avisaron 1 hora antes por fiebre...">${escapeHTML(record?.detalle || '')}</textarea>
            </label>
          </div>
          <p class="rip-modal-hint">Politica: si cancelan con menos de 3 horas pierden la clase; esta es la unica primera vez perdonada.</p>
          <div id="pvStatus" class="status"></div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">${record ? 'Guardar cambios' : 'Guardar primera vez'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('rip-modal-in'));
    const close = () => {
      modal.classList.remove('rip-modal-in');
      setTimeout(() => modal.remove(), 160);
    };
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-cancel')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-save')?.addEventListener('click', async () => {
      const data = {
        estudiante: modal.querySelector('#pvEstudiante')?.value || '',
        fechaClase: modal.querySelector('#pvFechaClase')?.value || '',
        motivo: modal.querySelector('#pvMotivo')?.value || '',
        detalle: modal.querySelector('#pvDetalle')?.value || ''
      };
      const duplicate = !record ? getPrimeraVezForStudent(data.estudiante) : null;
      if (duplicate && !confirm('Este estudiante ya tiene primera vez registrada. Guardar otra de todos modos?')) return;
      try {
        setText(modal.querySelector('#pvStatus'), 'Guardando...');
        const saved = record
          ? await RIPRepository.updatePrimeraVez(record.id, data)
          : await RIPRepository.addPrimeraVez(data);
        if (record) state.primeraVez = (state.primeraVez || []).map(r => r.id === saved.id ? saved : r);
        else state.primeraVez = [saved, ...(state.primeraVez || [])];
        state.primeraVezLoaded = true;
        renderPrimeraVezView();
        updatePrimeraVezFichaButton();
        toast(ctx.el.toastWrap, 'Primera vez guardada.', 'ok');
        close();
      } catch (err) {
        console.error(err);
        setText(modal.querySelector('#pvStatus'), 'No se pudo guardar.');
        toast(ctx.el.toastWrap, err?.message || 'No se pudo guardar.', 'warn');
      }
    });
    modal.querySelector('#pvEstudiante')?.focus();
  }

  // =========================
  // Navegación de vistas
  // =========================
  function showDashboard(mode) {
    state.dashMode = mode || 'review';

    hideAllMainViews();

    if (state.dashMode === 'review') {
      show(ctx.el.reviewTodayView);
      renderReviewToday();
    }
    if (state.dashMode === 'search') show(ctx.el.searchView);
    if (state.dashMode === 'clientes') {
      show(ctx.el.clientesView);
      loadClientesB2C(false);
    }
    if (state.dashMode === 'primeraVez') {
      show(ctx.el.primeraVezView);
      loadPrimeraVez(false);
    }
    if (state.dashMode === 'clas') show(ctx.el.dashboardClasView);
    if (state.dashMode === 'saldo') show(ctx.el.dashboardSaldoView);
    if (state.dashMode === 'prog') show(ctx.el.dashboardProgView);
    if (state.dashMode === 'registro') {
      state.currentStudentKey = '';
      state.currentStudentName = '';
      ctx.el.filtersCard?.classList.remove('filters-card--ficha');
      RIPUI.dashboard?.restoreRegistroTableHead?.(ctx);
      show(ctx.el.registroCalendarView);
      show(ctx.el.fichaView);
      hide(ctx.el.programacionStudentView);
      show(ctx.el.tablaContainer);
      hide(ctx.el.fichaSummaryBlock);
      setText(ctx.el.fichaTitle, 'Registro');
      setText(ctx.el.fichaSub, 'Filtra, revisa y edita el registro completo.');
      renderRegistroCalendar();
    }
    if (state.dashMode === 'kpis') show(ctx.el.dashboardClasView);

    syncDashTabs();
    setHeaderTextsByMode(state.dashMode);

    hide(ctx.el.btnBackToDash);
  }

  function toISODate(date) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }

  function parseISODate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function nextMonday(year, month, day) {
    const date = new Date(year, month - 1, day);
    const offset = (8 - date.getDay()) % 7;
    return toISODate(addDays(date, offset));
  }

  function easterDate(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function getColombiaHolidays(year) {
    const dates = new Set([
      isoFromParts(year, 1, 1),
      isoFromParts(year, 5, 1),
      isoFromParts(year, 7, 20),
      isoFromParts(year, 8, 7),
      isoFromParts(year, 12, 8),
      isoFromParts(year, 12, 25),
      nextMonday(year, 1, 6),
      nextMonday(year, 3, 19),
      nextMonday(year, 6, 29),
      nextMonday(year, 8, 15),
      nextMonday(year, 10, 12),
      nextMonday(year, 11, 1),
      nextMonday(year, 11, 11)
    ]);
    const easter = easterDate(year);
    [-3, -2, 43, 64, 71].forEach(offset => dates.add(toISODate(addDays(easter, offset))));
    return dates;
  }

  function shouldCountRegistroDate(iso, holidays) {
    const d = parseISODate(iso);
    return !!d && d.getDay() !== 0 && !holidays.has(iso);
  }

  function registroClassRowsByDate(iso) {
    return (state.registro || [])
      .filter(r => norm(r.tipo) === 'clase' && (r.fecha || r.fechaRaw) === iso)
      .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  }

  function renderRegistroDay(iso) {
    if (!ctx.el.registroDayTitle || !ctx.el.registroDayBody) return;
    const holidays = getColombiaHolidays(Number(iso.slice(0, 4)));
    const rows = registroClassRowsByDate(iso);
    const reason = !shouldCountRegistroDate(iso, holidays)
      ? (parseISODate(iso)?.getDay() === 0 ? 'domingo no cuenta' : 'festivo no cuenta')
      : '';
    ctx.el.registroDayTitle.textContent = new Date(`${iso}T12:00:00`).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

    const addButton = `
      <div class="registro-day-actions">
        <button class="btn primary small" type="button" data-registro-add="${escapeHTML(iso)}">Agregar registro</button>
      </div>
    `;

    if (rows.length) {
      ctx.el.registroDayBody.innerHTML = addButton + rows.map(r => `
        <div class="registro-day-row registro-day-row-editable">
          <div class="registro-day-main">
            <strong>${escapeHTML(r.estudiante || '')}</strong>
            <span>${escapeHTML([r.hora, r.servicio, r.profesor].filter(Boolean).join(' � '))}</span>
          </div>
          <div class="registro-day-row-actions">
            <button class="btn small ghost" type="button" data-registro-edit="${escapeHTML(r.id || '')}" ${r.id ? '' : 'disabled'}>Editar</button>
            <button class="btn small ghost danger" type="button" data-registro-delete="${escapeHTML(r.id || '')}" ${r.id ? '' : 'disabled'}>Eliminar</button>
          </div>
        </div>
      `).join('');
    } else {
      ctx.el.registroDayBody.innerHTML = addButton + (reason
        ? `<span class="pill soft">${escapeHTML(reason)}</span>`
        : `<span class="pill pill-urgency-review">Falta subir clases de este dia</span>`);
    }

    ctx.el.registroDayBody.querySelector('[data-registro-add]')?.addEventListener('click', () => {
      window.RIPUI?.editor?.openNewRowModal?.(ctx, state, { tipo: 'Clase', fechaRaw: iso, fecha: iso });
    });
    ctx.el.registroDayBody.querySelectorAll('[data-registro-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-registro-edit') || '';
        if (id) window.RIPUI?.editor?.openEditModal?.(ctx, state, id);
      });
    });
    ctx.el.registroDayBody.querySelectorAll('[data-registro-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-registro-delete') || '';
        if (id && confirm('Eliminar este registro?')) window.RIPUI?.editor?.deleteRow?.(ctx, state, id);
      });
    });
  }
  function renderRegistroCalendar() {
    const grid = ctx.el.registroCalendarGrid;
    if (!grid) return;
    const cal = state.registroCalendar;
    const year = cal.year;
    const month = cal.month;
    const holidays = getColombiaHolidays(year);
    const todayISO = toISODate(new Date());
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const existingDates = new Set((state.registro || [])
      .filter(r => norm(r.tipo) === 'clase')
      .map(r => r.fecha || r.fechaRaw)
      .filter(Boolean));
    let uploaded = 0;
    let missing = 0;
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    for (let day = 1; day <= last.getDate(); day++) {
      const iso = `${monthKey}-${String(day).padStart(2, '0')}`;
      if (!shouldCountRegistroDate(iso, holidays) || iso > todayISO) continue;
      if (existingDates.has(iso)) uploaded++;
      else missing++;
    }
    const title = first.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    setText(ctx.el.registroCalTitle, title.charAt(0).toUpperCase() + title.slice(1));
    setText(ctx.el.registroCalendarSub, `${uploaded} dias subidos, ${missing} faltan hasta hoy. Domingos y festivos no cuentan.`);

    const firstDay = (first.getDay() + 6) % 7;
    const total = Math.ceil((firstDay + last.getDate()) / 7) * 7;
    const days = Array.from({ length: total }, (_, i) => {
      const day = i - firstDay + 1;
      const muted = day < 1 || day > last.getDate();
      const iso = muted ? '' : `${monthKey}-${String(day).padStart(2, '0')}`;
      const skip = iso && !shouldCountRegistroDate(iso, holidays);
      const uploadedDay = iso && existingDates.has(iso);
      const missingDay = iso && iso <= todayISO && !skip && !uploadedDay;
      const future = iso && iso > todayISO;
      return `<button type="button" class="calendar-day ${muted ? 'muted' : ''} ${uploadedDay ? 'has-data' : ''} ${missingDay ? 'missing' : ''} ${skip || future ? 'skip' : ''} ${iso === todayISO ? 'today' : ''} ${iso === cal.selected ? 'selected' : ''}" data-registro-day="${escapeHTML(iso)}" ${muted ? 'disabled' : ''}>
        ${muted ? '' : `<strong>${day}</strong><div>${uploadedDay ? 'Subido' : (skip ? 'No cuenta' : (future ? 'Futuro' : 'Falta'))}</div>`}
      </button>`;
    }).join('');
    grid.innerHTML = `<section class="calendar-month">
      <div class="calendar-head"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
      <div class="calendar-mini">${days}</div>
    </section>`;
    grid.querySelectorAll('[data-registro-day]').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso = btn.getAttribute('data-registro-day') || '';
        if (!iso) return;
        state.registroCalendar.selected = iso;
        renderRegistroCalendar();
        renderRegistroDay(iso);
      });
    });
    if (!cal.selected || !cal.selected.startsWith(monthKey)) {
      cal.selected = todayISO.startsWith(monthKey) ? todayISO : `${monthKey}-01`;
    }
    renderRegistroDay(cal.selected);
  }

  function enrichSaldoList(list) {
    const progMap = new Map((state.prog?.data?.dashboard || []).map(row => [norm(row.name), row]));
    return (list || []).map(item => {
      const key = item.key || norm(item.name);
      const ficha = RIPCore.getStudentFicha(state.registro || [], key);
      const prog = progMap.get(norm(item.name)) || null;
      const lastClass = ficha.rows.find(r => norm(r.tipo) === 'clase');
      return {
        ...item,
        statusText: item.finalClasif || item.paramClasif || 'Sin estado',
        saldoPendiente: item.saldo,
        lastClassDate: lastClass?.fecha || lastClass?.fechaRaw || item.lastClass || '',
        programacionText: prog
          ? (prog.noSchedule ? 'Sin programacion' : `${prog.futureCount || 0} futuras${prog.nextClassDate ? ' · prox. ' + prog.nextClassDate : ''}`)
          : 'Sin programacion'
      };
    });
  }

  function getLastRegistroDate(studentKey) {
    const rows = (state.registro || [])
      .filter(r => r.estudianteKey === studentKey)
      .map(r => ({
        date: r.fecha || r.fechaRaw || '',
        ts: Number(r.fechaTs) || Number(RIPCore.util?.parseDate?.(r.fecha || r.fechaRaw)?.getTime()) || 0
      }))
      .filter(r => r.date);
    rows.sort((a, b) => b.ts - a.ts || String(b.date).localeCompare(String(a.date)));
    return rows[0]?.date || '';
  }

  function getReviewProgramacionText(studentName) {
    const prog = (state.prog?.data?.dashboard || []).find(row => norm(row.name) === norm(studentName));
    if (!prog || prog.noSchedule) return 'Sin programacion';
    const future = Number(prog.futureCount) || 0;
    if (!future) return 'Sin futuras';
    return `${future} futuras${prog.nextClassDate ? ' · prox. ' + prog.nextClassDate : ''}`;
  }

  function isTrialOrCourtesyRow(row) {
    if (window.RIPCalculations?.isTrialOrCourtesy) return window.RIPCalculations.isTrialOrCourtesy(row);
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''} ${row?.clasif || ''}`);
    return /\b(prueba|trial|diagnostico|diagnostica|cortesia|gratis|obsequio)\b/.test(txt);
  }

  function isClassLike(row) {
    const tipo = norm(row?.tipo || '');
    return tipo === 'clase' || (tipo !== 'pago' && !String(row?.pago || '').trim());
  }

  function getTrialCreditCode(row) {
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''} ${row?.clasif || ''} ${row?.clasifPago || ''}`);
    if (txt.includes('cp de clase de prueba') || (/\bcp\b/.test(txt) && /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/.test(txt))) return 'CP';
    if (txt.includes('cc de clase de cortesia') || (/\bcc\b/.test(txt) && /\b(cortesia|gratis|obsequio)\b/.test(txt))) return 'CC';
    return '';
  }

  function buildTrialContinuityGroups() {
    const byStudent = new Map();
    for (const row of state.registro || []) {
      const key = row.estudianteKey || norm(row.estudiante);
      if (!key) continue;
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key).push(row);
    }
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const groups = { sin: [], con: [] };

    byStudent.forEach((rows, key) => {
      const sorted = [...rows].sort((a, b) => {
        const ta = Number(a.fechaTs) || Number(RIPCore.util?.parseDate?.(a.fecha || a.fechaRaw)?.getTime()) || 0;
        const tb = Number(b.fechaTs) || Number(RIPCore.util?.parseDate?.(b.fecha || b.fechaRaw)?.getTime()) || 0;
        if (ta !== tb) return ta - tb;
        const pa = isClassLike(a) ? 1 : 0;
        const pb = isClassLike(b) ? 1 : 0;
        return pa - pb;
      });

      const credits = [];
      const redeemed = [];
      const directTrialRows = [];

      for (const row of sorted) {
        const mov = Number(row?.movimiento) || 0;
        const code = getTrialCreditCode(row);
        if (!isClassLike(row) && mov > 0 && code) {
          credits.push({ code, remaining: Math.max(1, Math.round(mov)), source: row });
          continue;
        }

        if (!isClassLike(row)) continue;
        if (isTrialOrCourtesyRow(row)) directTrialRows.push({ row, code: getTrialCreditCode(row) || (norm(row?.clasif).includes('cortesia') ? 'CC' : 'CP') });
        if (mov >= 0) continue;

        const credit = credits.find(c => c.remaining > 0);
        if (!credit) continue;
        credit.remaining -= 1;
        redeemed.push({ row, code: credit.code, source: credit.source });
      }

      const firstTrial = redeemed[0] || directTrialRows[0] || null;
      const lastTrial = redeemed[redeemed.length - 1] || directTrialRows[directTrialRows.length - 1] || null;
      if (!firstTrial || !lastTrial) return;

      const firstTrialRow = firstTrial.row;
      const firstTrialTs = Number(firstTrialRow.fechaTs) || Number(RIPCore.util?.parseDate?.(firstTrialRow.fecha || firstTrialRow.fechaRaw)?.getTime()) || 0;
      const laterClass = sorted.find(r => isClassLike(r) && (Number(r.fechaTs) || Number(RIPCore.util?.parseDate?.(r.fecha || r.fechaRaw)?.getTime()) || 0) > firstTrialTs);
      const referenceRow = laterClass || lastTrial.row;
      const referenceTs = Number(referenceRow.fechaTs) || Number(RIPCore.util?.parseDate?.(referenceRow.fecha || referenceRow.fechaRaw)?.getTime()) || 0;
      const lastDateStart = referenceTs ? new Date(referenceTs).setHours(0, 0, 0, 0) : todayStart;
      const days = Math.max(0, Math.floor((todayStart - lastDateStart) / 86400000));
      const student = (state.allStudents || []).find(s => s.key === key);
      const name = referenceRow.estudiante || student?.name || key;
      const code = lastTrial.code || firstTrial.code || 'CP';
      const target = laterClass ? groups.con : groups.sin;
      target.push({
        priority: laterClass ? 'Prueba con continuidad' : 'Prueba sin continuidad',
        filter: laterClass ? 'Prueba con continuidad' : 'Prueba sin continuidad',
        name,
        key,
        reason: code === 'CC'
          ? (laterClass ? 'Clase de cortesia con continuidad' : 'Clase de cortesia sin continuidad')
          : (laterClass ? 'Clase de prueba con continuidad' : 'Clase de prueba sin continuidad'),
        metric: laterClass ? `Continua desde ${laterClass.fecha || laterClass.fechaRaw || ''}` : `${days} dias`,
        lastRegistro: referenceRow.fecha || referenceRow.fechaRaw || '',
        programacion: getReviewProgramacionText(name),
        days,
        lastClassTs: referenceTs,
        finalClasif: laterClass ? 'CP/CC con continuidad' : 'CP/CC sin continuidad',
        paramClasif: code
      });
    });

    groups.sin.sort((a, b) => b.days - a.days || String(a.name).localeCompare(String(b.name), 'es'));
    groups.con.sort((a, b) => (Number(b.lastClassTs) || 0) - (Number(a.lastClassTs) || 0) || String(a.name).localeCompare(String(b.name), 'es'));
    return groups;
  }

  function buildTrialFollowupRows() {
    return buildTrialContinuityGroups().sin;
  }
  function openTrialContinuityList(title, list) {
    showFichaContainer();
    ensureFichaProgramacionHidden();
    RIPUI.dashboard.renderStudentList(ctx, `Lista � ${title}`, list, (studentKey, studentName) => {
      if (studentKey) openStudentFicha(studentKey, { focusProgramacion: false, studentName });
      else if (studentName) openStudentFichaByName(studentName);
    }, { bdEligible: false });
  }

  function appendTrialContinuityKpis() {
    if (!ctx.el.dashGridClas) return;
    const groups = buildTrialContinuityGroups();
    const total = groups.sin.length + groups.con.length;
    const pct = total > 0 ? Math.round((groups.con.length / total) * 100) : 0;
    const cards = [
      ['Prueba / cortesía sin continuidad', groups.sin.length, 'No volvieron después de CP/CC', 'sin'],
      ['Prueba / cortesía con continuidad', groups.con.length, 'Volvieron después de CP/CC', 'con']
    ];
    ctx.el.dashGridClas.insertAdjacentHTML('beforeend', cards.map(([title, value, subtitle, key]) => `
      <button class="pocket ${key === 'con' ? 'ok' : 'warn'}" type="button" data-trial-continuity="${escapeHTML(key)}">
        <div class="pocket-top">
          <h3>${escapeHTML(title)}</h3>
          <span class="pilltag ${key === 'con' ? 'ok' : 'warn'}">CP/CC</span>
        </div>
        <div class="big">${escapeHTML(value)}</div>
        <div class="mini">${escapeHTML(subtitle)}</div>
      </button>
    `).join(''));

    // Tarjeta de conversión + acceso a la lista completa
    ctx.el.dashGridClas.insertAdjacentHTML('beforeend', `
      <button class="pocket info" type="button" data-trial-open-list>
        <div class="pocket-top">
          <h3>Tasa de conversión CP/CC</h3>
          <span class="pilltag info">Conversión</span>
        </div>
        <div class="big">${pct}%</div>
        <div class="mini">${groups.con.length} de ${total} con prueba convirtieron</div>
      </button>
    `);

    ctx.el.dashGridClas.querySelectorAll('[data-trial-continuity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-trial-continuity') || '';
        if (key === 'con') openTrialContinuityList('Prueba / cortesia con continuidad', groups.con);
        else openTrialContinuityList('Prueba / cortesia sin continuidad', groups.sin);
      });
    });
    ctx.el.dashGridClas.querySelector('[data-trial-open-list]')?.addEventListener('click', () => {
      openTrialListView();
    });
  }

  // =========================
  // Vista: Lista de clases de prueba / cortesía
  // =========================
  function openTrialListView() {
    hide(ctx.el.dashboardClasView);
    hide(ctx.el.dashboardSaldoView);
    hide(ctx.el.fichaView);
    show(ctx.el.trialListView);
    renderTrialListView();
  }

  function renderTrialListView() {
    const groups = buildTrialContinuityGroups();
    const total = groups.sin.length + groups.con.length;
    const pct = total > 0 ? Math.round((groups.con.length / total) * 100) : 0;

    if (ctx.el.trialConversionBadge) {
      const cls = pct >= 50 ? 'ok' : pct >= 25 ? 'warn' : 'err';
      ctx.el.trialConversionBadge.innerHTML = `
        <span class="trial-conv-pct ${cls}">${pct}% conversión</span>
        <span class="trial-conv-detail">${groups.con.length} de ${total} convirtieron</span>
      `;
    }

    if (ctx.el.trialKpis) {
      ctx.el.trialKpis.innerHTML = `
        <div class="kpi-card ok"><div class="kpi-label">Con continuidad</div><div class="kpi-val">${groups.con.length}</div></div>
        <div class="kpi-card warn"><div class="kpi-label">Sin continuidad</div><div class="kpi-val">${groups.sin.length}</div></div>
        <div class="kpi-card info"><div class="kpi-label">Total CP/CC</div><div class="kpi-val">${total}</div></div>
        <div class="kpi-card ${pct >= 50 ? 'ok' : 'warn'}"><div class="kpi-label">Tasa conversión</div><div class="kpi-val">${pct}%</div></div>
      `;
    }

    if (!ctx.el.trialListBody) return;
    const trialRows = (state.registro || []).filter(r => isTrialOrCourtesyRow(r));
    const convertedKeys = new Set(groups.con.map(g => g.key));
    const sorted = [...trialRows].sort((a, b) => (Number(b.fechaTs) || 0) - (Number(a.fechaTs) || 0));

    if (sorted.length === 0) {
      ctx.el.trialListBody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px">No hay clases de prueba o cortesía registradas.</td></tr>';
      return;
    }

    ctx.el.trialListBody.innerHTML = sorted.map(r => {
      const key = r.estudianteKey || norm(r.estudiante);
      const converted = convertedKeys.has(key);
      const esCortesia = /cortesia|gratis|obsequio/i.test(`${r.servicio || ''} ${r.comentario || ''} ${r.clasif || ''}`);
      const tipoLabel = esCortesia
        ? '<span class="pilltag info">CC Cortesía</span>'
        : '<span class="pilltag warn">CP Prueba</span>';
      const convLabel = converted
        ? '<span class="pilltag ok">✅ Convirtió</span>'
        : '<span class="pilltag muted">⏳ Pendiente</span>';
      return `
        <tr class="trial-row${converted ? ' trial-converted' : ''}"
            data-student-key="${escapeHTML(key)}" style="cursor:pointer" title="Ver ficha">
          <td>${escapeHTML(r.fecha || r.fechaRaw || '')}</td>
          <td><strong>${escapeHTML(r.estudiante || key)}</strong></td>
          <td>${tipoLabel}</td>
          <td>${escapeHTML(r.servicio || '')}</td>
          <td>${escapeHTML(r.profesor || '')}</td>
          <td>${convLabel}</td>
        </tr>
      `;
    }).join('');

    ctx.el.trialListBody.querySelectorAll('.trial-row').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.getAttribute('data-student-key');
        if (!key) return;
        hide(ctx.el.trialListView);
        showFichaContainer();
        openStudentFicha(key, { focusProgramacion: false });
      });
    });
  }

  function renderReviewToday() {
    if (!ctx.el.reviewTodayBody) return;
    const clas = RIPCore.buildClasificacionDashboard(state.allStudents || []);
    const saldos = RIPCore.buildSaldosDashboard(state.allStudents || [], state.registro || []);
    const progRows = state.prog?.data?.dashboard || [];
    const noProg = progRows.filter(r => r.noSchedule);
    const lowProg = progRows.filter(r => r.lowFuture);
    const review = [...(clas.porRevisar || [])].sort((a, b) => (Number(b.daysSinceLastClass) || 0) - (Number(a.daysSinceLastClass) || 0));
    const trialContinuity = buildTrialContinuityGroups();
    const trialFollowup = trialContinuity.sin;
    const trialContinued = trialContinuity.con;
    const urgent = [];

    review.slice(0, 20).forEach(s => urgent.push({
      priority: 'Por revisar',
      filter: 'Por revisar',
      name: s.name,
      key: s.key,
      reason: s.finalClasif || s.paramClasif || '',
      metric: `${Number(s.daysSinceLastClass) || 0} dias`,
      lastRegistro: getLastRegistroDate(s.key),
      programacion: getReviewProgramacionText(s.name)
    }));
    saldos.deben.slice(0, 15).forEach(s => urgent.push({
      priority: 'Saldo rojo',
      filter: 'Saldo rojo',
      name: s.name,
      key: s.key,
      reason: 'Debe revisar saldo',
      metric: fmtMoney(s.saldo),
      lastRegistro: getLastRegistroDate(s.key),
      programacion: getReviewProgramacionText(s.name)
    }));
    saldos.seAcabo.forEach(s => urgent.push({
      priority: 'Saldo en 0',
      filter: 'En 0',
      name: s.name,
      key: s.key,
      reason: 'Paquete agotado',
      metric: '0',
      lastRegistro: getLastRegistroDate(s.key),
      programacion: getReviewProgramacionText(s.name)
    }));
    noProg.slice(0, 15).forEach(s => urgent.push({
      priority: 'Sin programacion',
      filter: 'Sin programacion',
      name: s.name,
      key: norm(s.name),
      reason: 'No tiene fechas futuras',
      metric: `${s.futureCount || 0} futuras`,
      lastRegistro: getLastRegistroDate(norm(s.name)),
      programacion: getReviewProgramacionText(s.name)
    }));
    lowProg.slice(0, 15).forEach(s => urgent.push({
      priority: 'Pocas futuras',
      filter: 'Pocas futuras',
      name: s.name,
      key: norm(s.name),
      reason: 'Programacion por completar',
      metric: `${s.futureCount || 0} futuras`,
      lastRegistro: getLastRegistroDate(norm(s.name)),
      programacion: getReviewProgramacionText(s.name)
    }));
    trialFollowup.forEach(s => urgent.push(s));
    trialContinued.forEach(s => urgent.push(s));

    if (ctx.el.reviewKpiGrid) {
      ctx.el.reviewKpiGrid.innerHTML = [
        ['Por revisar', review.length],
        ['Saldo rojo', saldos.deben.length],
        ['En 0', saldos.seAcabo.length],
        ['Sin programacion', noProg.length],
        ['Pocas futuras', lowProg.length],
        ['Prueba sin continuidad', trialFollowup.length],
        ['Prueba con continuidad', trialContinued.length]
      ].map(([label, value]) => `
        <button class="kpi kpi-btn" type="button" data-review-filter="${escapeHTML(label)}">
          <div class="n">${escapeHTML(value)}</div>
          <div class="t">${escapeHTML(label)}</div>
        </button>
      `).join('');
    }

    const urgencyClass = (priority) => {
      const p = priority.toLowerCase();
      if (p.includes('revisar')) return 'urgency-review';
      if (p.includes('rojo'))    return 'urgency-danger';
      if (p.includes('en 0'))    return 'urgency-zero';
      return 'urgency-info';
    };
    const urgencyPillClass = (priority) => {
      const p = priority.toLowerCase();
      if (p.includes('revisar')) return 'pill-urgency-review';
      if (p.includes('rojo'))    return 'pill-urgency-danger';
      if (p.includes('en 0'))    return 'pill-urgency-zero';
      return 'pill-urgency-info';
    };

    const reviewDateTs = (item) => {
      const raw = item.lastRegistro || '';
      return Number(RIPCore.util?.parseDate?.(raw)?.getTime()) || 0;
    };
    const activeFilter = state.reviewFilter || '';
    const visibleUrgent = (activeFilter ? urgent.filter(item => item.filter === activeFilter) : urgent)
      .sort((a, b) => reviewDateTs(b) - reviewDateTs(a) || String(a.name).localeCompare(String(b.name), 'es'));

    ctx.el.reviewTodayBody.innerHTML = visibleUrgent.length
      ? visibleUrgent.map((item) => `
        <tr class="${urgencyClass(item.priority)}">
          <td><span class="pill ${urgencyPillClass(item.priority)}">${escapeHTML(item.priority)}</span></td>
          <td style="font-weight:700">${escapeHTML(item.name)}</td>
          <td>${escapeHTML(item.reason)}</td>
          <td style="font-weight:700">${escapeHTML(item.metric)}</td>
          <td>${escapeHTML(item.lastRegistro || '—')}</td>
          <td>${escapeHTML(item.programacion || 'Sin programacion')}</td>
          <td><button class="btn small primary" type="button" data-inline-open data-review-open="${escapeHTML(item.name)}" data-review-key="${escapeHTML(item.key || norm(item.name))}">Abrir</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="7" class="empty-td">No hay urgentes por ahora. ✅</td></tr>`;

    ctx.el.reviewTodayBody.querySelectorAll('[data-review-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-review-open') || '';
        const key = btn.getAttribute('data-review-key') || norm(name);
        const item = visibleUrgent.find(x => (x.key || norm(x.name)) === key || norm(x.name) === norm(name)) || { name, key };
        if (RIPUI.dashboard?.toggleInlineFicha) {
          RIPUI.dashboard.toggleInlineFicha(ctx, btn, { ...item, key, name: item.name || name });
          return;
        }
        openStudentFichaByName(name);
      });
    });
    ctx.el.reviewKpiGrid?.querySelectorAll('[data-review-filter]').forEach(btn => {
      const label = btn.getAttribute('data-review-filter') || '';
      btn.classList.toggle('active', label === activeFilter);
      btn.addEventListener('click', () => {
        state.reviewFilter = state.reviewFilter === label ? '' : label;
        renderReviewToday();
      });
    });
  }

  function getCombinedSearchStudents() {
    return dedupeByNormalizedName([
      ...(Array.isArray(state.searchStudents) ? state.searchStudents : []),
      ...(Array.isArray(state.allStudents) ? state.allStudents : [])
    ]);
  }

  function openStudentFichaByName(name) {
    const key = norm(name);
    const pool = getCombinedSearchStudents();
    let entry = pool.find(s => norm(s.name) === key);
    if (!entry && key) {
      const partial = pool.filter(s => norm(s.name).includes(key));
      if (partial.length === 1) entry = partial[0];
      else if (partial.length > 1) {
        const ranked = [...partial].sort((a, b) => studentNameScore(b.name) - studentNameScore(a.name));
        const bestKey = norm(ranked[0]?.name);
        if (bestKey && partial.every(s => bestKey.includes(norm(s.name)))) entry = ranked[0];
        else {
          setText(ctx.el.quickSearchStatus, 'Encontre ' + partial.length + ' coincidencias. Escoge una de la lista.');
          RIPUI.table?.renderStudentDatalist?.(ctx, pool, name);
          return;
        }
      }
    }
    if (entry && RIPUI.ficha?.openStudentFromSearch) {
      RIPUI.ficha.openStudentFromSearch(ctx, state, entry);
      return;
    }
    if (key) openStudentFicha(key);
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
      show(ctx.el.btnPrimeraVezFicha);
      updatePrimeraVezFichaButton();
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
    setText(ctx.el.fichaPrimeraVez, '—');
    setText(ctx.el.fichaProxPago, '—');
    setHTML(ctx.el.fichaSaldosMini, '');
    show(ctx.el.fichaSummaryBlock);
    show(ctx.el.programacionStudentView);
    show(ctx.el.btnPrimeraVezFicha);
    updatePrimeraVezFichaButton();

    hide(ctx.el.tablaContainer);

    if (window.RIPProgramacion?.attachStudent) {
      window.RIPProgramacion.attachStudent(ctx, state, studentName);
    }
  }

  function openStudentFicha(studentKey, opts = {}) {
    const { focusProgramacion = false } = opts;

    if (!studentKey || !RIPUI.ficha?.openFichaByKey) {
      if (opts.studentName) openStudentFichaByName(opts.studentName);
      return;
    }

    RIPUI.ficha.openFichaByKey(ctx, state, studentKey);
    showFichaContainer();
    show(ctx.el.btnPrimeraVezFicha);
    updatePrimeraVezFichaButton();

    const studentName = getCurrentStudentName();
    state.prog.currentStudentName = studentName;

    // Sincronizar input de filtro y restringir servicios al estudiante actual
    if (ctx.el.fStudent && studentName) ctx.el.fStudent.value = studentName;
    if (RIPUI.table?.renderServiceList) {
      RIPUI.table.renderServiceList(ctx, state, state.registro, { keepSearch: false, estudianteKey: studentKey });
    }

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
  function extractPackages(tableEl) {
    const CYCLE_COLORS = {
      'cycle-0': '#2563eb', 'cycle-1': '#16a34a', 'cycle-2': '#d97706',
      'cycle-3': '#dc2626', 'cycle-4': '#7c3aed', 'cycle-5': '#0d9488',
      'cycle-6': '#db2777', 'cycle-7': '#6b7280'
    };
    const packages = [];
    const cleanTitle = (value) => String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[^\x20-\x7E]+/g, ' - ')
      .replace(/\s+/g, ' ')
      .trim();
    const codeBefore = (title, keyword) => cleanTitle(title).split(new RegExp('\\s+' + keyword + '\\b', 'i'))[0]?.trim() || '';

    // La tabla se muestra newest-first; invertimos para procesar oldest-first
    // igual que la lógica de asignación de paquetes de ui.ficha.js.
    const tableRows = [...(tableEl?.querySelectorAll('tbody tr') || [])].reverse();
    tableRows.forEach((row) => {
      const tds = row.querySelectorAll('td');
      const typeTd = tds[1];
      if (!typeTd) return;
      const dot = typeTd.querySelector('.cycle-dot');
      if (!dot || dot.classList.contains('cycle-matricula')) return;

      const title = cleanTitle(dot.getAttribute('title') || '');
      const cycleText = typeTd.querySelector('.cycle-num')?.textContent?.trim() || '';
      const colorClass = [...dot.classList].find((c) => /^cycle-\d+$/.test(c)) || 'cycle-0';
      const color = CYCLE_COLORS[colorClass] || '#1A3B6E';
      const service = tds[4]?.textContent?.trim() || '';

      if (/activado/i.test(title) || /\+\s*\d+/.test(cycleText)) {
        const m = title.match(/activado.*?(\d+)/i) || cycleText.match(/\+\s*(\d+)/);
        const code = codeBefore(title, 'activado') || cycleText.replace(/\+.*/, '').trim() || '?';
        const total = parseInt(m?.[1], 10) || 0;
        packages.push({ code, service, total, used: 0, extra: 0, color, colorClass });
      } else if (/redimido/i.test(title) || /\d+\s*\/\s*\d+/.test(cycleText)) {
        const m = title.match(/clase\s+(\d+)\s+de\s+(\d+)/i) || cycleText.match(/(\d+)\s*\/\s*(\d+)/);
        const classNo = parseInt(m?.[1], 10) || 0;
        const code = codeBefore(title, 'redimido') || cycleText.replace(/\d+\s*\/\s*\d+.*/, '').trim() || '';
        const total = parseInt(m?.[2], 10) || 0;
        if (!packages.some((pkg) => pkg.code === code && pkg.colorClass === colorClass) && total > 0) {
          packages.push({ code, service, total, used: 0, extra: 0, color, colorClass });
        }
        for (let i = packages.length - 1; i >= 0; i--) {
          if (packages[i].code === code && packages[i].colorClass === colorClass) {
            packages[i].used = Math.max(packages[i].used, classNo);
            break;
          }
        }
      } else if (/agotadas/i.test(title)) {
        const cm = title.match(/^(.+?)\s*-?\s*clases agotadas/i);
        const code = cm?.[1]?.trim() || cycleText.replace(/!.*/, '').trim() || '';
        for (let i = packages.length - 1; i >= 0; i--) {
          if (packages[i].code === code && packages[i].colorClass === colorClass) {
            packages[i].extra = (packages[i].extra || 0) + 1;
            break;
          }
        }
      } else if (/pendiente de pago/i.test(title) || cycleText === '!') {
        if (packages.length > 0) {
          packages[packages.length - 1].extra = (packages[packages.length - 1].extra || 0) + 1;
        }
      }
    });

    return packages.filter((p) => p.total > 0);
  }

  function buildFichaTemplate(element, sections, studentName, exportDate) {
    const escH = escapeHTML;

    const statusEl = element.querySelector('#fichaStatusBadge');
    const statusText = statusEl?.textContent?.trim() || '';
    const statusCls = ['activo', 'pausa', 'inactivo'].find((c) => statusEl?.classList.contains(c)) || '';

    const stats = [
      { label: 'Última clase',  value: element.querySelector('#fichaFecha')?.textContent?.trim() || '—' },
      { label: 'Próxima clase', value: element.querySelector('#fichaProxPago')?.textContent?.trim() || '—' },
      { label: 'Último pago',   value: element.querySelector('#fichaUltPago')?.textContent?.trim() || '—' },
      { label: 'Valor pago',    value: element.querySelector('#fichaUltPagoValor')?.textContent?.trim() || '—' },
      { label: 'Total pagos',   value: element.querySelector('#fichaTotalPagos')?.textContent?.trim() || '—' },
      { label: 'Primera vez',   value: element.querySelector('#fichaPrimeraVez')?.textContent?.trim() || '—' },
    ];

    const saldoChipsHTML = [...(element.querySelector('#fichaSaldosMini')?.querySelectorAll('.saldo-chip') || [])]
      .map((chip) => {
        const label = [...chip.childNodes]
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent.trim())
          .join('');
        const value = chip.querySelector('b')?.textContent?.trim() || '';
        const cls = chip.classList.contains('pos') ? 'pos' : chip.classList.contains('neg') ? 'neg' : 'zero';
        return `<span class="pdf-ft-chip ${cls}">${escH(label)} <strong>${escH(value)}</strong></span>`;
      }).join('');

    const tableEl = element.querySelector('#tablaContainer');
    const pkgs = (sections.paquetes !== false) ? extractPackages(tableEl) : [];

    const packagesHTML = pkgs.map((pkg, idx) => {
      const MAX_DOTS = 20;
      const extra = pkg.extra || 0;
      let dotsOrBar;
      if (pkg.total <= MAX_DOTS) {
        // Dots normales del paquete
        const normalDots = Array.from({ length: pkg.total }, (_, i) =>
          `<span class="pdf-ft-dot ${i < pkg.used ? 'filled' : 'empty'}" style="background:${i < pkg.used ? pkg.color : 'transparent'};border-color:${pkg.color}"></span>`
        ).join('');
        // Dots extra (clases fuera del paquete) en rojo con "!"
        const extraDots = extra > 0
          ? Array.from({ length: Math.min(extra, 6) }, () =>
              `<span class="pdf-ft-dot filled pdf-ft-dot-extra" style="background:#dc2626;border-color:#dc2626" title="Clase sin cubrir"></span>`
            ).join('') + (extra > 6 ? `<span style="font-size:10px;color:#dc2626;font-weight:700">+${extra - 6}</span>` : '')
          : '';
        dotsOrBar = normalDots + (extra > 0 ? `<span style="margin:0 4px;color:#94a3b8;font-size:10px">|</span>${extraDots}` : '');
      } else {
        const pct = Math.round((pkg.used / pkg.total) * 100);
        dotsOrBar = `<div style="flex:1;height:10px;border-radius:5px;background:#e2e8f0;overflow:hidden"><div style="height:100%;width:${pct}%;background:${escH(pkg.color)};border-radius:5px"></div></div>`;
      }
      const remaining = pkg.total - pkg.used;
      let countText;
      if (extra > 0) {
        countText = `${pkg.used}/${pkg.total} - ${extra} pendiente${extra === 1 ? '' : 's'}`;
      } else if (remaining <= 0) {
        countText = `${pkg.used}/${pkg.total} - Completo`;
      } else {
        countText = `${pkg.used}/${pkg.total} - ${remaining} restante${remaining === 1 ? '' : 's'}`;
      }
      const countColor = extra > 0 ? '#dc2626' : remaining <= 0 ? '#059669' : '#1A5FAD';
      // cycle-dot idéntico al puntico de la tabla (usa la clase .cycle-X para el color)
      const cycleDotHTML = `<span class="${escH(pkg.colorClass)}" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${escH(pkg.color)};vertical-align:middle;margin-right:5px;flex-shrink:0;box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></span>`;
      return `
        <div class="pdf-ft-pkg-row">
          <div class="pdf-ft-pkg-num" style="background:${escH(pkg.color)}">${idx + 1}</div>
          <div class="pdf-ft-pkg-info">
            <div class="pdf-ft-pkg-code">${cycleDotHTML}${escH(pkg.code)}</div>
            ${pkg.service ? `<div class="pdf-ft-pkg-service">${escH(pkg.service)}</div>` : ''}
          </div>
          <div class="pdf-ft-pkg-dots">${dotsOrBar}</div>
          <div class="pdf-ft-pkg-count" style="color:${escH(countColor)}">${escH(countText)}</div>
        </div>`;
    }).join('');

    let tableCloneHTML = '';
    if (sections.registro !== false && tableEl) {
      const tc = tableEl.cloneNode(true);
      // IMPORTANTE: el selector CSS usa ".pdf-export-clone .pdf-registro-table",
      // por eso ponemos pdf-export-clone en un wrapper externo, no en la tabla misma.
      tc.classList.add('pdf-registro-table');
      tc.querySelectorAll('.ficha-actions, .tabs, button').forEach((n) => n.remove());
      tc.querySelectorAll('*').forEach((n) => {
        try { n.scrollLeft = 0; n.scrollTop = 0; if (n.style) { n.style.transform = 'none'; n.style.translate = 'none'; } } catch (_) {}
      });
      tc.querySelectorAll('.table-wrap, .tableWrap').forEach((n) => {
        n.style.overflow = 'visible'; n.style.maxHeight = 'none';
        n.style.height = 'auto'; n.style.width = '100%'; n.style.maxWidth = 'none';
      });
      // Wrapper con clase pdf-export-clone para que los selectores CSS funcionen
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-export-clone';
      wrapper.appendChild(tc);
      tableCloneHTML = wrapper.outerHTML;
    }

    const showSaldos = sections.saldos !== false;
    const showPaquetes = showSaldos && sections.paquetes !== false;
    const showRegistro = sections.registro !== false;

    return `
      <div class="pdf-ficha-template">
        <div class="pdf-ft-header-img">
          <img src="${typeof MEMBRETE_HEADER_B64 !== 'undefined' ? MEMBRETE_HEADER_B64 : './membrete_img_0.png'}" alt="Musicala" style="width:100%;display:block;"/>
          <div class="pdf-ft-header-overlay">
            <span>Exportado el <strong>${escH(exportDate)}</strong></span>
          </div>
        </div>
        <div class="pdf-ft-body">
          ${showSaldos ? `
          <div class="pdf-ft-student-card">
            <div class="pdf-ft-student-head">
              <div class="pdf-ft-name">${escH(studentName)}</div>
              ${statusText ? `<span class="pdf-ft-badge ${escH(statusCls)}">${escH(statusText)}</span>` : ''}
            </div>
            <div class="pdf-ft-stats-grid">
              ${stats.map((s) => `<div class="pdf-ft-stat"><div class="pdf-ft-stat-label">${escH(s.label)}</div><div class="pdf-ft-stat-value">${escH(s.value)}</div></div>`).join('')}
            </div>
          </div>
          ${saldoChipsHTML ? `<div class="pdf-ft-section"><div class="pdf-ft-section-head">Saldos por servicio</div><div class="pdf-ft-chips">${saldoChipsHTML}</div></div>` : ''}
          ${showPaquetes && pkgs.length ? `<div class="pdf-ft-section"><div class="pdf-ft-section-head">Paquetes de clases</div><div class="pdf-ft-packages">${packagesHTML}</div></div>` : ''}
          ` : ''}
          ${!showSaldos && pkgs.length ? `<div class="pdf-ft-section"><div class="pdf-ft-section-head">Paquetes de clases</div><div class="pdf-ft-packages">${packagesHTML}</div></div>` : ''}
          ${showRegistro ? `<div class="pdf-ft-section"><div class="pdf-ft-section-head">Registro de clases y pagos</div><div class="pdf-ft-table-wrap">${tableCloneHTML}</div></div>` : ''}
        </div>
        <div class="pdf-ft-footer-img">
          <img src="${typeof MEMBRETE_FOOTER_B64 !== 'undefined' ? MEMBRETE_FOOTER_B64 : './membrete_img_1.png'}" alt="" style="width:100%;display:block;"/>
        </div>
      </div>`;
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

    const isFicha = element === ctx.el.fichaView;
    // Ficha → portrait 800px; tabla general → landscape 1080px
    const PDF_EXPORT_WIDTH = isFicha ? 800 : 1080;
    const PDF_MARGIN_MM = 8;
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

    let sourcePage;

    if (isFicha) {
      stage.innerHTML = buildFichaTemplate(element, sections, title, exportDate);
      sourcePage = stage.querySelector('.pdf-ficha-template');
    } else {
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

      if (sections.saldos === false) clone.querySelector('#fichaSummaryBlock')?.remove();
      if (sections.programacion === false) clone.querySelector('#programacionStudentView')?.remove();
      if (sections.registro === false) clone.querySelector('#tablaContainer')?.remove();

      stage.innerHTML = `
        <div class=”pdf-export-page”>
          <header class=”pdf-export-head”>
            <div>
              <div class=”pdf-export-brand”>Musicala · RIP 2026</div>
              <h1>${escapeHTML(title)}</h1>
              <p>${escapeHTML(subtitle)}</p>
            </div>
            <div class=”pdf-export-meta”>
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
        overflow: 'visible',
        background: '#ffffff'
      });
      page.appendChild(clone);
      sourcePage = page;
    }

    if (sourcePage) {
      Object.assign(sourcePage.style, {
        width: `${PDF_EXPORT_WIDTH}px`,
        minWidth: `${PDF_EXPORT_WIDTH}px`,
        maxWidth: 'none',
        overflow: 'visible',
        background: '#ffffff'
      });
    }

    document.body.appendChild(stage);

    try {
      toast(ctx.el.toastWrap, 'Preparando PDF...', 'info');
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const source = sourcePage || stage.querySelector('.pdf-export-page') || stage;
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

      const pdfOrientation = isFicha ? 'portrait' : 'landscape';
      const pdf = new JsPDFCtor({
        orientation: pdfOrientation,
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

        if (pageIndex > 0) pdf.addPage('letter', pdfOrientation);

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
          <label class="pdf-check pdf-check--sub ${hasSaldos ? '' : 'is-disabled'}" id="pdfChkPaquetesLabel">
            <input type="checkbox" data-pdf-section="paquetes" ${hasSaldos ? 'checked' : 'disabled'}>
            <span>↳ Paquetes de clases</span>
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

    // Si se desmarca "Saldos", deshabilitar automáticamente "Paquetes de clases"
    const chkSaldos = modal.querySelector('[data-pdf-section="saldos"]');
    const chkPaquetes = modal.querySelector('[data-pdf-section="paquetes"]');
    const lblPaquetes = modal.querySelector('#pdfChkPaquetesLabel');
    if (chkSaldos && chkPaquetes) {
      chkSaldos.addEventListener('change', () => {
        chkPaquetes.disabled = !chkSaldos.checked;
        if (!chkSaldos.checked) chkPaquetes.checked = false;
        else chkPaquetes.checked = true;
        if (lblPaquetes) lblPaquetes.classList.toggle('is-disabled', !chkSaldos.checked);
      });
    }

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-pdf-cancel]')?.addEventListener('click', close);
    modal.querySelector('[data-pdf-export]')?.addEventListener('click', () => {
      const sections = {
        saldos: !!modal.querySelector('[data-pdf-section="saldos"]')?.checked,
        paquetes: !!modal.querySelector('[data-pdf-section="paquetes"]')?.checked,
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
    RIPUI.dashboard.renderDashClas(ctx, state.allStudents, (title, list, opts = {}) => {
      showFichaContainer();
      ensureFichaProgramacionHidden();

      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey, studentName) => {
        if (studentKey) openStudentFicha(studentKey, { focusProgramacion: false, studentName });
        else if (studentName) openStudentFichaByName(studentName);
      }, { bdEligible: !!opts.bdEligible });
    });
    appendTrialContinuityKpis();

    // Saldos
    RIPUI.dashboard.renderDashSaldo(ctx, state.allStudents, state.registro, (title, list, opts = {}) => {
      showFichaContainer();
      ensureFichaProgramacionHidden();

      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey, studentName) => {
        if (studentKey) openStudentFicha(studentKey, { focusProgramacion: false, studentName });
        else if (studentName) openStudentFichaByName(studentName);
      }, { bdEligible: !!opts?.bdEligible });
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
    setText(ctx.el.fichaPrimeraVez, '—');
    setHTML(ctx.el.fichaSaldosMini, '');

    hide(ctx.el.programacionStudentView);
    resetProgramacionEmbed();
    show(ctx.el.tablaContainer);

    show(ctx.el.btnPDF);
    show(ctx.el.btnClaseEspecial);
    hide(ctx.el.btnPrimeraVezFicha);
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
    ctx.el.viewTabReview?.addEventListener('click', () => showDashboard('review'));
    ctx.el.viewTabSearch?.addEventListener('click', () => showDashboard('search'));
    ctx.el.viewTabProg?.addEventListener('click', () => showDashboard('prog'));
    ctx.el.viewTabSaldo?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.viewTabRegistro?.addEventListener('click', () => showDashboard('registro'));
    ctx.el.viewTabPrimeraVez?.addEventListener('click', () => showDashboard('primeraVez'));
    ctx.el.viewTabClientes?.addEventListener('click', () => showDashboard('clientes'));
    ctx.el.viewTabKpis?.addEventListener('click', () => showDashboard('kpis'));

    ctx.el.dashTabClas?.addEventListener('click', () => showDashboard('kpis'));
    ctx.el.dashTabSaldo?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.dashTabProg?.addEventListener('click', () => showDashboard('prog'));

    ctx.el.tabClas?.addEventListener('click', () => showDashboard('kpis'));
    ctx.el.tabSaldos?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.tabProg?.addEventListener('click', () => showDashboard('prog'));

    ctx.el.btnQuickSearch?.addEventListener('click', () => {
      const name = ctx.el.quickStudentSearch?.value || '';
      if (!name.trim()) {
        setText(ctx.el.quickSearchStatus, 'Escribe un nombre para buscar.');
        return;
      }
      setText(ctx.el.quickSearchStatus, 'Abriendo ficha...');
      openStudentFichaByName(name);
    });
    ctx.el.quickStudentSearch?.addEventListener('input', () => {
      const q = ctx.el.quickStudentSearch?.value || '';
      RIPUI.table?.renderStudentDatalist?.(ctx, getCombinedSearchStudents(), q);
    });
    ctx.el.quickStudentSearch?.addEventListener('focus', () => {
      const q = ctx.el.quickStudentSearch?.value || '';
      RIPUI.table?.renderStudentDatalist?.(ctx, getCombinedSearchStudents(), q);
    });
    ctx.el.quickStudentSearch?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') ctx.el.btnQuickSearch?.click();
    });
    ctx.el.clientesSearch?.addEventListener('input', renderClientesView);
    ctx.el.btnClientesRefresh?.addEventListener('click', () => loadClientesB2C(true));
    ctx.el.primeraVezSearch?.addEventListener('input', renderPrimeraVezView);
    ctx.el.primeraVezMotivoFilter?.addEventListener('change', renderPrimeraVezView);
    ctx.el.btnPrimeraVezRefresh?.addEventListener('click', () => loadPrimeraVez(true));
    ctx.el.btnPrimeraVezNew?.addEventListener('click', () => openPrimeraVezModal());
    ctx.el.registroCalPrev?.addEventListener('click', () => {
      state.registroCalendar.month -= 1;
      if (state.registroCalendar.month < 0) {
        state.registroCalendar.month = 11;
        state.registroCalendar.year -= 1;
      }
      state.registroCalendar.selected = '';
      renderRegistroCalendar();
    });
    ctx.el.registroCalNext?.addEventListener('click', () => {
      state.registroCalendar.month += 1;
      if (state.registroCalendar.month > 11) {
        state.registroCalendar.month = 0;
        state.registroCalendar.year += 1;
      }
      state.registroCalendar.selected = '';
      renderRegistroCalendar();
    });

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
      const url = window.PAYMENT_WEBAPP_URL || './registrar-pagos.html';
      if (!url) {
        toast(ctx.el.toastWrap, 'PAYMENT_WEBAPP_URL no está configurada en esta versión.', 'warn');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    });

    // Registrar clases
    ctx.el.btnClases?.addEventListener('click', () => {
      const url = window.REGISTRAR_CLASES_URL || './registrar-clases.html';
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

    // Volver desde lista de pruebas
    ctx.el.btnTrialListBack?.addEventListener('click', () => {
      hide(ctx.el.trialListView);
      show(ctx.el.dashboardClasView);
    });

    // Clase especial (cortesía / prueba) desde la ficha
    ctx.el.btnClaseEspecial?.addEventListener('click', () => {
      const name = getCurrentStudentName();
      const key = state.currentStudentKey;
      if (!name && !key) {
        toast(ctx.el.toastWrap, 'Primero selecciona un estudiante.', 'warn');
        return;
      }
      openClaseEspecialModal(key || name, name || key);
    });

    ctx.el.btnPrimeraVezFicha?.addEventListener('click', () => {
      const name = getCurrentStudentName();
      if (!name) {
        toast(ctx.el.toastWrap, 'Primero selecciona un estudiante.', 'warn');
        return;
      }
      openPrimeraVezModal({ studentName: name });
    });
  }

  // =========================
  // Modal: Clase especial (cortesía / prueba)
  // =========================
  function openClaseEspecialModal(studentKey, studentName) {
    const prev = document.getElementById('ripClaseEspecialModal');
    if (prev) prev.remove();

    const today = new Date();
    const todayStr = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0')
    ].join('-');

    const modal = document.createElement('div');
    modal.id = 'ripClaseEspecialModal';
    modal.className = 'rip-pdf-modal';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-ce-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">🎁 Clase de cortesía · <strong>${escapeHTML(studentName)}</strong></span>
          <button class="rip-modal-close" type="button">×</button>
        </div>
        <div class="rip-modal-body">
          <div class="rip-ce-form">
            <div class="rip-ce-row">
              <label class="rip-ce-label">Fecha</label>
              <input class="rip-ce-input" id="ceInputFecha" type="date" value="${todayStr}">
            </div>
          </div>
          <p class="rip-modal-hint" style="margin-top:12px">
            Crea un <strong>Pago $0 · CC Cortesía</strong> para <strong>${escapeHTML(studentName)}</strong>.
            La clase se registra normalmente después y redime este crédito.
          </p>
        </div>
        <div class="rip-modal-actions">
          <button class="btn ghost" type="button" data-ce-cancel>Cancelar</button>
          <button class="btn primary" type="button" data-ce-save>🎁 Registrar cortesía</button>
        </div>
      </div>
    `;

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-ce-cancel]')?.addEventListener('click', close);

    modal.querySelector('[data-ce-save]')?.addEventListener('click', async () => {
      const fecha = modal.querySelector('#ceInputFecha')?.value?.trim();
      if (!fecha) {
        toast(ctx.el.toastWrap, 'Ingresa una fecha.', 'warn');
        return;
      }

      const row = {
        tipo: 'Pago',
        estudiante: studentName,
        estudianteKey: studentKey,
        fecha,
        hora: '',
        servicio: 'Clase de cortesía CC',
        profesor: '',
        pago: '0',
        comentario: 'Cortesía CC',
        clasif: 'CC de Clase de cortesia',
        clasifPago: 'CC de Clase de cortesia'
      };

      const saveBtn = modal.querySelector('[data-ce-save]');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';

      try {
        await RIPRepository.addRegistroRow(row);
        close();
        toast(ctx.el.toastWrap, `Cortesía registrada para ${studentName}.`, 'ok');
        setTimeout(() => {
          if (state.currentStudentKey === studentKey && RIPUI.ficha?.openFichaByKey) {
            RIPUI.ficha.openFichaByKey(ctx, state, studentKey);
          }
        }, 800);
      } catch (err) {
        console.error(err);
        toast(ctx.el.toastWrap, 'No se pudo registrar. Intenta de nuevo.', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '🎁 Registrar cortesía';
      }
    });

    document.body.appendChild(modal);
    modal.querySelector('#ceInputFecha')?.focus();
  }

  // =========================
  // Boot progresivo real
  // =========================
  async function boot({ force = false } = {}) {
    try {
      if (force) clearAppCaches();
      resetStateForFreshLoad();

      setText(ctx.el.badgeMode, 'Firebase');
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

      setText(ctx.el.badgeMode, 'Firebase');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Cargando análisis y programación…');

      // ─── FASE 2: Programación + análisis completo en paralelo ──────────────
      const [pack] = await Promise.allSettled([
        RIPCore.loadAll({ force: !!force, includeHistorical: false }),
        loadProgramacionSummary().catch(e => console.warn('Programación:', e)),
        loadPrimeraVez(true).catch(e => console.warn('Primera vez:', e))
      ]);
      updatePrimeraVezFichaButton();

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

      setText(ctx.el.badgeMode, 'Firebase');
      setText(ctx.el.badgeCount, `${state.registro.length} registros`);
      setText(ctx.el.status, 'Listo ✅');
      setTimeout(async () => {
        try {
          const hp = await RIPCore.loadAll({ force: false, includeHistorical: true });
          if (!hp) return;
          state.registro = hp.registro || state.registro;
          state.paramsMap = hp.paramsMap || state.paramsMap;
          state.allStudents = hp.allStudents || state.allStudents;
          state.searchStudents = dedupeByNormalizedName(
            mergeSearchIndexWithCurrentStudents([], state.allStudents || [])
          );
          if (RIPUI.table?.renderStudentDatalist) {
            RIPUI.table.renderStudentDatalist(ctx, getCombinedSearchStudents(), ctx.el.fStudent?.value || ctx.el.quickStudentSearch?.value || '');
          }
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
    renderRegistroCalendar,
    boot,
    clearAppCaches,
    loadGlobalStudentIndex,
    ensureGlobalStudentIndex
  };

  // =========================
  // Filtros sticky: mide topbar y actualiza --topbar-h
  // =========================
  function syncTopbarHeight() {
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      document.documentElement.style.setProperty('--topbar-h', topbar.offsetHeight + 'px');
    }
  }

  syncTopbarHeight();
  window.addEventListener('resize', syncTopbarHeight);
  // Resinc tras carga de fuentes (puede cambiar el alto del topbar)
  if (document.fonts?.ready) document.fonts.ready.then(syncTopbarHeight);

  // Limpiar localStorage de cachés obsoletos al iniciar
  (function clearOldLocalStorage() {
    try {
      const ripKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rip2026_') && k !== 'rip2026_sync_settings') ripKeys.push(k);
      }
      ripKeys.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
  })();

  // =========================
  // Init
  // =========================
  ctx.el.btnSyncSettings?.addEventListener('click', openSyncSettingsModal);
  wireTopUI();
  boot({ force: false });
  setupSyncTimer();
})();
