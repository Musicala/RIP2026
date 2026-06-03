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
  const STUDENT_INDEX_URLS = {};

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
    if (state.dashMode === 'clas') show(ctx.el.dashboardClasView);
    if (state.dashMode === 'saldo') show(ctx.el.dashboardSaldoView);
    if (state.dashMode === 'prog') show(ctx.el.dashboardProgView);
    if (state.dashMode === 'registro') {
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
    if (rows.length) {
      ctx.el.registroDayBody.innerHTML = rows.map(r => `
        <div class="registro-day-row">
          <strong>${escapeHTML(r.estudiante || '')}</strong>
          <span>${escapeHTML([r.hora, r.servicio, r.profesor].filter(Boolean).join(' · '))}</span>
        </div>
      `).join('');
      return;
    }
    ctx.el.registroDayBody.innerHTML = reason
      ? `<span class="pill soft">${escapeHTML(reason)}</span>`
      : `<span class="pill pill-urgency-review">Falta subir clases de este dia</span>`;
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

  function buildTrialFollowupRows() {
    const byStudent = new Map();
    for (const row of state.registro || []) {
      const key = row.estudianteKey || norm(row.estudiante);
      if (!key) continue;
      if (!byStudent.has(key)) byStudent.set(key, []);
      byStudent.get(key).push(row);
    }
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const out = [];
    byStudent.forEach((rows, key) => {
      const sorted = [...rows].sort((a, b) => (Number(a.fechaTs) || 0) - (Number(b.fechaTs) || 0));
      const trialRows = sorted.filter(r => isClassLike(r) && isTrialOrCourtesyRow(r));
      const lastTrial = trialRows[trialRows.length - 1];
      if (!lastTrial) return;
      const trialTs = Number(lastTrial.fechaTs) || Number(RIPCore.util?.parseDate?.(lastTrial.fecha || lastTrial.fechaRaw)?.getTime()) || 0;
      if (sorted.some(r => (Number(r.fechaTs) || 0) > trialTs)) return;
      const lastDateStart = trialTs ? new Date(trialTs).setHours(0, 0, 0, 0) : todayStart;
      const days = Math.max(0, Math.floor((todayStart - lastDateStart) / 86400000));
      const student = (state.allStudents || []).find(s => s.key === key);
      const name = lastTrial.estudiante || student?.name || key;
      out.push({
        priority: 'Prueba sin continuidad',
        filter: 'Prueba sin continuidad',
        name,
        key,
        reason: norm(lastTrial.clasif).includes('cortesia') ? 'Cortesia sin continuidad' : 'Clase de prueba sin continuidad',
        metric: `${days} dias`,
        lastRegistro: lastTrial.fecha || lastTrial.fechaRaw || '',
        programacion: getReviewProgramacionText(name),
        days
      });
    });
    return out.sort((a, b) => b.days - a.days || String(a.name).localeCompare(String(b.name), 'es'));
  }

  function renderReviewToday() {
    if (!ctx.el.reviewTodayBody) return;
    const clas = RIPCore.buildClasificacionDashboard(state.allStudents || []);
    const saldos = RIPCore.buildSaldosDashboard(state.allStudents || [], state.registro || []);
    const progRows = state.prog?.data?.dashboard || [];
    const noProg = progRows.filter(r => r.noSchedule);
    const lowProg = progRows.filter(r => r.lowFuture);
    const review = [...(clas.porRevisar || [])].sort((a, b) => (Number(b.daysSinceLastClass) || 0) - (Number(a.daysSinceLastClass) || 0));
    const trialFollowup = buildTrialFollowupRows();
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

    if (ctx.el.reviewKpiGrid) {
      ctx.el.reviewKpiGrid.innerHTML = [
        ['Por revisar', review.length],
        ['Saldo rojo', saldos.deben.length],
        ['En 0', saldos.seAcabo.length],
        ['Sin programacion', noProg.length],
        ['Pocas futuras', lowProg.length],
        ['Prueba sin continuidad', trialFollowup.length]
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

    const activeFilter = state.reviewFilter || '';
    const visibleUrgent = activeFilter ? urgent.filter(item => item.filter === activeFilter) : urgent;

    ctx.el.reviewTodayBody.innerHTML = visibleUrgent.length
      ? visibleUrgent.map((item) => `
        <tr class="${urgencyClass(item.priority)}">
          <td><span class="pill ${urgencyPillClass(item.priority)}">${escapeHTML(item.priority)}</span></td>
          <td style="font-weight:700">${escapeHTML(item.name)}</td>
          <td>${escapeHTML(item.reason)}</td>
          <td style="font-weight:700">${escapeHTML(item.metric)}</td>
          <td>${escapeHTML(item.lastRegistro || '—')}</td>
          <td>${escapeHTML(item.programacion || 'Sin programacion')}</td>
          <td><button class="btn small primary" type="button" data-review-open="${escapeHTML(item.name)}">Abrir</button></td>
        </tr>
      `).join('')
      : `<tr><td colspan="7" class="empty-td">No hay urgentes por ahora. ✅</td></tr>`;

    ctx.el.reviewTodayBody.querySelectorAll('[data-review-open]').forEach(btn => {
      btn.addEventListener('click', () => openStudentFichaByName(btn.getAttribute('data-review-open') || ''));
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

  function openStudentFichaByName(name) {
    const key = norm(name);
    const entry = (state.searchStudents || []).find(s => norm(s.name) === key)
      || (state.allStudents || []).find(s => norm(s.name) === key);
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

    if (!studentKey || !RIPUI.ficha?.openFichaByKey) {
      if (opts.studentName) openStudentFichaByName(opts.studentName);
      return;
    }

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
    RIPUI.dashboard.renderDashClas(ctx, state.allStudents, (title, list, opts = {}) => {
      showFichaContainer();
      ensureFichaProgramacionHidden();

      RIPUI.dashboard.renderStudentList(ctx, `Lista · ${title}`, list, (studentKey, studentName) => {
        if (studentKey) openStudentFicha(studentKey, { focusProgramacion: false, studentName });
        else if (studentName) openStudentFichaByName(studentName);
      }, { bdEligible: !!opts.bdEligible });
    });

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
    ctx.el.viewTabReview?.addEventListener('click', () => showDashboard('review'));
    ctx.el.viewTabSearch?.addEventListener('click', () => showDashboard('search'));
    ctx.el.viewTabProg?.addEventListener('click', () => showDashboard('prog'));
    ctx.el.viewTabSaldo?.addEventListener('click', () => showDashboard('saldo'));
    ctx.el.viewTabRegistro?.addEventListener('click', () => showDashboard('registro'));
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
    ctx.el.quickStudentSearch?.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') ctx.el.btnQuickSearch?.click();
    });
    ctx.el.clientesSearch?.addEventListener('input', renderClientesView);
    ctx.el.btnClientesRefresh?.addEventListener('click', () => loadClientesB2C(true));
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
