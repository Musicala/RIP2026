/* =============================================================================
  rip.programacion.js — RIP 2026 · Módulo Programación (CACHE + FIX GRID)
  - Carga resumen desde API externa de Programación
  - KPIs + lista por categoría
  - Programación individual por estudiante
  - Cache en memoria + sessionStorage
  - La ficha pinta primero cache y luego refresca desde API
  - Vistas embebidas: Programar / Reprogramar
============================================================================= */
(function () {
  'use strict';

  const RIPProgramacion = {};
  const API_URL = '';
  const API_TOKEN = '';
  const MAX_CLASSES = 24;
  const DEFAULT_CLASS_LIMIT = 24;
  const SESSION_PREFIX = 'rip_prog_schedule_';

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHTML(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function norm(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function isPagoRow(r) {
    const tipo = norm(r?.tipo);
    if (tipo === 'pago') return true;
    if (tipo === 'clase') return false;
    return !!String(r?.pago || '').trim();
  }

  function parsePackageSize(row) {
    const mov = Math.abs(Number(row?.movimiento) || 0);
    if (mov > 0 && mov <= MAX_CLASSES) return mov;
    return 0;
  }

  function normalizePackageKey(value) {
    const key = norm(value || 'sin-clasificacion');
    if (key === 'pago' || key === 'cp de clase de prueba' || key === 'cc de clase de cortesia') return '*';
    if (key === 'tv' || key === 'taller' || key === 'ms g' || key === 'ms sp') return 'vacacional-flex';
    return key;
  }

  function getPackageKey(row) {
    // Taller/OpenHouse es un pago cuya familia queda vacía y cuya
    // clasificación principal es Taller; usarla como fallback lo mantiene
    // compatible con TV/MS G/MS SP en vacacional-flex.
    const value = isPagoRow(row) ? (row?.clasifPago || row?.clasif) : row?.clasif;
    return normalizePackageKey(value);
  }

  function isMatriculaPago(row) {
    if (!isPagoRow(row)) return false;
    const raw = `${row?.servicio || ''} ${row?.clasifPago || ''} ${row?.clasif || ''}`;
    return norm(raw).includes('matricula') || /\bME\b/i.test(raw);
  }

  function getChronoRows(rows) {
    return [...(rows || [])].sort((a, b) => {
      const ta = Number(a?.fechaTs) || 0;
      const tb = Number(b?.fechaTs) || 0;
      if (ta !== tb) return ta - tb;
      const pa = isPagoRow(a) ? 0 : 1;
      const pb = isPagoRow(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a?.fecha || a?.fechaRaw || '').localeCompare(String(b?.fecha || b?.fechaRaw || ''));
    });
  }

  function getStudentClassLimit(state, studentName) {
    const all = Array.isArray(state?.registro) ? state.registro : [];
    const key = norm(studentName);
    if (!key || !all.length) return DEFAULT_CLASS_LIMIT;

    const sourceRows = window.RIPCalculations?.markDuplicateClasses ? window.RIPCalculations.markDuplicateClasses(all) : all;
    const rows = getChronoRows(sourceRows.filter(r => norm(r?.estudiante) === key || norm(r?.estudianteKey) === key));
    let lastPackageTotal = 0;
    const activeByKey = new Map();
    const pendingPackagesByKey = new Map();
    const getQueue = (map, packageKey) => {
      if (!map.has(packageKey)) map.set(packageKey, []);
      return map.get(packageKey);
    };

    const makePackage = (total) => ({ total, remaining: total });
    const consume = (pack) => {
      if (!pack) return;
      pack.remaining = Math.max(0, pack.remaining - 1);
    };

    for (const row of rows) {
      if (row?.duplicateReview) continue;
      const mov = Number(row?.movimientoSaldo ?? row?.movimiento) || 0;
      const packageKey = getPackageKey(row);
      if (!isMatriculaPago(row) && isPagoRow(row) && mov > 0) {
        const total = parsePackageSize(row);
        if (!total) continue;
        lastPackageTotal = total;
        const pack = makePackage(total);
        const active = activeByKey.get(packageKey);
        if (active && active.remaining > 0) getQueue(pendingPackagesByKey, packageKey).push(pack);
        else activeByKey.set(packageKey, pack);
        continue;
      }

      if (norm(row?.tipo) !== 'clase' || mov >= 0) continue;
      let activeKey = packageKey;
      let active = activeByKey.get(activeKey) || activeByKey.get('*') || null;
      if (!active && pendingPackagesByKey.has(packageKey)) {
        active = getQueue(pendingPackagesByKey, packageKey).shift() || null;
        activeKey = packageKey;
        if (active) activeByKey.set(activeKey, active);
      }
      if (!active && pendingPackagesByKey.has('*')) {
        active = getQueue(pendingPackagesByKey, '*').shift() || null;
        activeKey = '*';
        if (active) activeByKey.set(activeKey, active);
      }
      if (!active) continue;
      consume(active);
      if (active.remaining <= 0) {
        const next = getQueue(pendingPackagesByKey, activeKey).shift() || null;
        if (next) activeByKey.set(activeKey, next);
        else activeByKey.delete(activeKey);
      }
    }

    const activeTotals = Array.from(activeByKey.values()).filter(p => p.remaining > 0).map(p => p.total);
    return activeTotals[activeTotals.length - 1] || lastPackageTotal || DEFAULT_CLASS_LIMIT;
  }

  function setText(el, value) {
    if (!el) return;
    el.textContent = value ?? '';
  }

  function toISO(d) {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return '';
    return dt.toISOString().slice(0, 10);
  }

  function todayISO() {
    const d = new Date();
    const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return tz.toISOString().slice(0, 10);
  }

  function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + Number(n || 0));
    return d;
  }

  function nextDate(base, step, avoidSun) {
    let d = addDays(base, step);
    if (avoidSun && d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
  }

  function show(el) {
    if (el) el.style.display = '';
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  function debugLog(...args) {
    try {
      console.log('[RIPProgramacion]', ...args);
    } catch (_) {}
  }

  function normalizeFechas(arr, limit = MAX_CLASSES) {
    if (!Array.isArray(arr)) return [];
    return arr
      .map(v => String(v || '').trim())
      .filter(Boolean)
      .sort()
      .slice(0, limit);
  }

  function fillToMax(arr, limit = MAX_CLASSES) {
    const out = Array.isArray(arr)
      ? arr.map(v => String(v || '').trim()).filter(Boolean).sort().slice(0, limit)
      : [];

    while (out.length < limit) out.push('');
    return out.slice(0, limit);
  }

  function getFutureStats(fechas, today) {
    const list = normalizeFechas(fechas);
    const t = today || todayISO();
    const futuras = list.filter(f => f >= t);
    return {
      futuras,
      nextISO: futuras[0] || '—',
      futureCount: futuras.length
    };
  }

  function getAlertHTML(row) {
    if (!row) return '<span class="tag">—</span>';
    if (row.scheduleExpired) return `<span class="tag danger">Programación vencida</span>`;
    if (row.noSchedule) return `<span class="tag danger">Sin programación</span>`;
    if (row.lowFuture) return `<span class="tag warn">Por completar</span>`;
    return `<span class="tag ok">OK completo</span>`;
  }

  function getAlertText(row) {
    if (!row) return '—';
    if (row.scheduleExpired) return 'Programación vencida';
    if (row.noSchedule) return 'Sin programación';
    if (row.lowFuture) return 'Por completar';
    return 'OK';
  }

  function getAlertTextFromSchedule(fechas, today, limit = MAX_CLASSES, studentIsActive = false) {
    const clean = normalizeFechas(fechas);
    if (!clean.length) return 'Sin programación';

    if (studentIsActive && !clean.some(f => f >= today)) return 'Programación vencida';

    if (clean.length < (Number(limit) || MAX_CLASSES)) return 'Por completar';
    return 'OK';
  }

  function getGroupedRows(rows = []) {
    return {
      none: rows.filter(r => r.noSchedule),
      partial: rows.filter(r => !r.noSchedule && (r.filled || 0) > 0 && (r.filled || 0) < (Number(r.limit) || MAX_CLASSES)),
      complete: rows.filter(r => !r.noSchedule && (r.filled || 0) >= (Number(r.limit) || MAX_CLASSES))
    };
  }

  function getSessionKey(studentName) {
    return SESSION_PREFIX + norm(studentName);
  }

  function readSessionCache(studentName) {
    try {
      const raw = sessionStorage.getItem(getSessionKey(studentName));
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeSessionCache(studentName, fechas) {
    try {
      sessionStorage.setItem(
        getSessionKey(studentName),
        JSON.stringify({
          fechas: fillToMax(fechas),
          savedAt: Date.now()
        })
      );
    } catch (_) {}
  }

  function clearSessionCache(studentName) {
    try {
      sessionStorage.removeItem(getSessionKey(studentName));
    } catch (_) {}
  }

  function ensureScheduleCache(state) {
    if (!state.prog) state.prog = {};
    if (!(state.prog.scheduleCache instanceof Map)) {
      state.prog.scheduleCache = new Map();
    }
  }

  function cacheSchedule(state, studentName, fechas) {
    ensureScheduleCache(state);
    const key = norm(studentName);
    const normalized = fillToMax(fechas);

    state.prog.scheduleCache.set(key, {
      fechas: normalized,
      loadedAt: Date.now()
    });

    writeSessionCache(studentName, normalized);
    return normalized;
  }

  function getCachedSchedule(state, studentName) {
    ensureScheduleCache(state);
    const key = norm(studentName);

    const mem = state.prog.scheduleCache.get(key);
    if (mem?.fechas) return fillToMax(mem.fechas);

    const ses = readSessionCache(studentName);
    if (ses?.fechas) {
      const normalized = fillToMax(ses.fechas);
      state.prog.scheduleCache.set(key, {
        fechas: normalized,
        loadedAt: ses.savedAt || Date.now()
      });
      return normalized;
    }

    return null;
  }

  function apiCall(params = {}) {
    if (window.RIPRepository) {
      if (params.action === 'getAllData') {
        return RIPProgramacion.loadResumen();
      }
      if (params.action === 'getSchedule') {
        return window.RIPRepository.loadStudentSchedule(params.student)
          .then(res => ({ ok: true, fechas: res.fechas || [], row: res }));
      }
      if (params.action === 'saveSchedule') {
        let dates = [];
        try { dates = JSON.parse(params.dates || '[]'); } catch (_) { dates = []; }
        return window.RIPRepository.saveSchedule(params.student, dates)
          .then(res => ({ ok: true, fechas: res.fechas || [] }));
      }
      if (params.action === 'saveScheduleFrom') {
        let dates = [];
        try { dates = JSON.parse(params.dates || '[]'); } catch (_) { dates = []; }
        return window.RIPRepository.saveScheduleFrom(params.student, Number(params.startIndex) || 0, dates)
          .then(res => ({ ok: true, fechas: res.fechas || [] }));
      }
    }
    return new Promise((resolve, reject) => {
      const callbackName = '__jsonp_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const url = new URL(API_URL);

      let settled = false;
      let timedOut = false;

      Object.entries({ ...params, callback: callbackName }).forEach(([k, v]) => {
        url.searchParams.set(k, String(v));
      });

      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete window[callbackName];
        } catch (_) {
          window[callbackName] = undefined;
        }
      };

      const fail = (msg) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error(msg));
      };

      const timer = setTimeout(() => {
        timedOut = true;
        fail('La API tardó demasiado en responder.');
      }, 30000);

      window[callbackName] = (data) => {
        if (settled || timedOut) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        clearTimeout(timer);
        fail('No se pudo conectar con la API.');
      };

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function findStudentRow(data, studentName) {
    const rows = data?.dashboard || [];
    const n = norm(studentName);

    return rows.find(r => norm(r.name) === n)
      || rows.find(r => norm(r.name).includes(n))
      || null;
  }

  /* ─── Mini modal inline para editar una sola fecha ─── */
  function openDateCellModal(container, index, currentISO, onSave) {
    // quita modal anterior si existe
    const prev = document.getElementById('ripDateModal');
    if (prev) prev.remove();

    const modal = document.createElement('div');
    modal.id = 'ripDateModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Editar clase #${index + 1}</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">✕</button>
        </div>
        <div class="rip-modal-body">
          <label class="field">
            <span>Fecha</span>
            <input type="date" id="ripDateInput" class="control" value="${escapeHTML(currentISO || '')}" style="width:100%;margin-top:6px;">
          </label>
          <p class="rip-modal-hint">Deja vacío para eliminar esta fecha.</p>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">Guardar</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('rip-modal-in'));

    const input = modal.querySelector('#ripDateInput');
    input?.focus();

    function close() {
      modal.classList.remove('rip-modal-in');
      setTimeout(() => modal.remove(), 200);
    }

    modal.querySelector('.rip-modal-overlay').addEventListener('click', close);
    modal.querySelector('.rip-modal-close').addEventListener('click', close);
    modal.querySelector('.rip-modal-cancel').addEventListener('click', close);

    modal.querySelector('.rip-modal-save').addEventListener('click', () => {
      const newVal = input?.value?.trim() || '';
      onSave(newVal);
      close();
    });

    // ESC para cerrar
    modal._keyHandler = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', modal._keyHandler);
    modal.addEventListener('remove', () => document.removeEventListener('keydown', modal._keyHandler));
  }

  function renderDatesGrid(container, fechas = [], today = '', { editable = false, state = null, ctx = null, studentName = '', limit = MAX_CLASSES } = {}) {
    if (!container) return;

    const arr = Array.isArray(fechas) ? fechas.slice(0, limit) : [];
    while (arr.length < limit) arr.push('');

    container.innerHTML = arr.map((raw, i) => {
      const iso = String(raw || '').trim();
      const miss = !iso;
      const future = iso && today && iso >= today;
      const past = iso && today && iso < today;

      return `
        <div class="dateCell ${miss ? 'miss' : ''} ${future ? 'future' : ''} ${past ? 'past' : ''} ${editable ? 'dateCell-editable' : ''}"
             data-cell-index="${i}"
             tabindex="${editable ? '0' : '-1'}"
             role="${editable ? 'button' : 'presentation'}"
             title="${editable ? `Editar clase #${i + 1}` : ''}">
          <div class="idx">#${i + 1}</div>
          <div class="val">${escapeHTML(iso || '—')}</div>
          ${editable ? `<div class="dateCell-hint">✏️</div>` : ''}
        </div>
      `;
    }).join('');

    if (!editable || !state || !ctx || !studentName) return;

    // Wiring click/teclado en cada celda
    container.querySelectorAll('.dateCell-editable').forEach(cell => {
      const handleActivate = () => {
        const idx = Number(cell.dataset.cellIndex);
        const currentISO = arr[idx] || '';

        openDateCellModal(container, idx, currentISO, async (newVal) => {
          // Actualizar array local
          arr[idx] = newVal;

          // Guardar en API
          await saveSingleDate(ctx, state, studentName, idx, newVal, arr);
        });
      };

      cell.addEventListener('click', handleActivate);
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleActivate(); }
      });
    });
  }

  async function saveSingleDate(ctx, state, studentName, index, newVal, currentArr) {
    const toastWrap = ctx?.el?.toastWrap;
    const toast = window.RIPUI?.shared?.toast;

    const showToast = (msg, tone) => {
      if (toast && toastWrap) toast(toastWrap, msg, tone);
    };

    showToast('Guardando fecha…', 'info');

    try {
      // Una celda se guarda como cambio puntual sobre la versión más reciente
      // de Firestore. No se reenvía la copia local completa del calendario.
      const saved = await window.RIPRepository.saveScheduleDate(studentName, index, newVal || '');
      const res = { ok: true, fechas: saved?.fechas || [] };

      if (!res?.ok) {
        showToast(res?.message || res?.error || 'Error guardando.', 'warn');
        return;
      }

      // Actualizar cache
      cacheSchedule(state, studentName, res.fechas || currentArr);
      showToast(`Clase #${index + 1} actualizada ✓`, 'ok');

      // Re-pintar la grilla con los datos nuevos
      await RIPProgramacion.attachStudent(ctx, state, studentName, { forceFresh: true });

    } catch (err) {
      console.error(err);
      showToast('No se pudo guardar. Revisa la conexión.', 'warn');
    }
  }

  function paintStudentScheduleGrid(ctx, state) {
    const fechas = Array.isArray(state?.prog?.currentStudentSchedule)
      ? state.prog.currentStudentSchedule
      : [];

    const today = state?.prog?.data?.today || todayISO();
    const studentName = state?.prog?.currentStudentName || '';
    const limit = state?.prog?.currentStudentLimit || getStudentClassLimit(state, studentName);

    debugLog('Pintando grilla con fechas:', fechas);
    const editOpts = { editable: true, state, ctx, studentName, limit };
    renderDatesGrid(ctx?.el?.progStudentDates, fechas, today, editOpts);

    requestAnimationFrame(() => {
      renderDatesGrid(ctx?.el?.progStudentDates, fechas, today, editOpts);
    });
  }

  function applyScheduleToStudentUI(ctx, state, studentName, row, fechas, today) {
    const limit = getStudentClassLimit(state, studentName);
    const normalized = fillToMax(fechas, limit);
    const clean = normalized.filter(Boolean);
    const stats = getFutureStats(clean, today);

    state.prog.currentStudentName = studentName || '';
    state.prog.currentStudentRow = row || null;
    state.prog.currentStudentLimit = limit;
    state.prog.currentStudentSchedule = normalized;

    setText(ctx.el.progStudentName, row?.name || studentName || '—');
    setText(ctx.el.progStudentNext, stats.nextISO || '—');
    setText(ctx.el.progStudentFuture, String(stats.futureCount ?? 0));
    const alert = getAlertTextFromSchedule(clean, today, limit, !!row?.isActive);
    setText(ctx.el.progStudentAlert, alert);
    ctx.el.progStudentAlert?.classList.toggle('prog-status-danger', alert === 'Programación vencida' || alert === 'Sin programación');

    paintStudentScheduleGrid(ctx, state);
  }

  async function loadStudentSchedule(studentName) {
    const res = await apiCall({
      action: 'getSchedule',
      student: studentName
    });

    if (!res?.ok) {
      throw new Error(res?.error || 'No se pudo cargar la programación del estudiante.');
    }

    return res;
  }

  async function refreshKpisAndStudent(ctx, state, studentName) {
    const data = await RIPProgramacion.loadResumen();
    state.prog.data = data;

    if (typeof RIPProgramacion.renderKpis === 'function') {
      RIPProgramacion.renderKpis(
        ctx,
        state,
        state.prog.onOpenList,
        state.prog.onOpenStudent
      );
    }

    if (studentName) {
      await RIPProgramacion.attachStudent(ctx, state, studentName, { forceFresh: true });
    }
  }

  RIPProgramacion.loadResumen = async function () {
    const res = await apiCall({
      action: 'getAllData',
      minFuture: 2
    });

    if (!res?.ok) {
      throw new Error(res?.error || 'No se pudo cargar Programación.');
    }

    return res;
  };

  RIPProgramacion.renderKpis = function (ctx, state, onOpenList, onOpenStudent) {
    const data = state?.prog?.data;
    const rows = data?.dashboard || [];
    const grouped = getGroupedRows(rows);

    state.prog.onOpenList = onOpenList || null;
    state.prog.onOpenStudent = onOpenStudent || null;

    setText(ctx.el.progKpiNone, grouped.none.length);
    setText(ctx.el.progKpiPartial, grouped.partial.length);
    setText(ctx.el.progKpiComplete, grouped.complete.length);

    [ctx.el.progCardNoSchedule, ctx.el.progCardPartial, ctx.el.progCardComplete].forEach(btn => {
      if (!btn) return;
      btn.classList.toggle('active', btn.dataset.group === state.prog.groupFilter);
    });

    let filtered = [];
    if (state.prog.groupFilter === 'none') filtered = grouped.none;
    else if (state.prog.groupFilter === 'partial') filtered = grouped.partial;
    else if (state.prog.groupFilter === 'complete') filtered = grouped.complete;

    if (!ctx.el.progTableBody) return;

    if (!state.prog.groupFilter) {
      ctx.el.progTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="muted">Selecciona una categoría para ver la lista.</td>
        </tr>
      `;
    } else if (!filtered.length) {
      ctx.el.progTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="muted">No hay estudiantes en esta categoría.</td>
        </tr>
      `;
    } else {
      ctx.el.progTableBody.innerHTML = filtered.map(r => `
        <tr class="prog-row ${r.noSchedule ? 'prog-row-none' : r.lowFuture ? 'prog-row-partial' : 'prog-row-complete'}">
          <td>${escapeHTML(r.name)}</td>
          <td>${getAlertHTML(r)}</td>
          <td>${escapeHTML(r.nextISO || '-')}</td>
          <td>${escapeHTML(`${r.filled || 0}/${r.limit || MAX_CLASSES}`)}</td>
          <td>${escapeHTML(`${r.futureCount ?? 0} futuras`)}</td>
          <td><button class="btn small" type="button" data-prog-open="${escapeHTML(r.name)}">Ver</button></td>
        </tr>
      `).join('');
    }

    if (ctx.el.progDashHint) {
      ctx.el.progDashHint.textContent = state.prog.groupFilter
        ? 'Lista filtrada por categoría. Puedes abrir un estudiante.'
        : 'Toca una categoría para ver la lista de estudiantes.';
    }

    [ctx.el.progCardNoSchedule, ctx.el.progCardPartial, ctx.el.progCardComplete].forEach(btn => {
      if (!btn || btn.__progBound) return;
      btn.__progBound = true;

      btn.addEventListener('click', () => {
        const group = btn.dataset.group || '';
        state.prog.groupFilter = (state.prog.groupFilter === group) ? '' : group;
        if (typeof onOpenList === 'function') onOpenList(state.prog.groupFilter);
      });
    });

    if (ctx.el.progTableBody && !ctx.el.progTableBody.__progBound) {
      ctx.el.progTableBody.__progBound = true;

      ctx.el.progTableBody.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-prog-open]');
        if (!btn) return;
        const studentName = btn.getAttribute('data-prog-open') || '';
        if (typeof onOpenStudent === 'function') onOpenStudent(studentName);
      });
    }
  };

  RIPProgramacion.attachStudent = async function (ctx, state, studentName, opts = {}) {
    if (!ctx?.el || !state?.prog?.data) return;

    const { forceFresh = false } = opts;
    const today = state.prog.data?.today || todayISO();
    const row = findStudentRow(state.prog.data, studentName);

    ensureScheduleCache(state);

    state.prog.currentStudentName = studentName || '';
    state.prog.currentStudentRow = row || null;
    state.prog.mode = 'dash';

    if (!row) {
      setText(ctx.el.progStudentName, studentName || '—');
      setText(ctx.el.progStudentNext, '—');
      setText(ctx.el.progStudentFuture, '0');
      setText(ctx.el.progStudentAlert, 'Cargando...');
    } else {
      setText(ctx.el.progStudentName, row.name || studentName || '—');
      setText(ctx.el.progStudentNext, row.nextISO || '—');
      setText(ctx.el.progStudentFuture, String(row.futureCount ?? 0));
      setText(ctx.el.progStudentAlert, getAlertText(row));
    }
    ctx.el.progStudentAlert?.classList.toggle('prog-status-danger', !!row?.noSchedule);

    if (ctx.el.programacionEmbed) ctx.el.programacionEmbed.innerHTML = '';
    hide(ctx.el.programacionEmbed);
    show(ctx.el.programacionStudentView);
    show(ctx.el.tablaContainer);

    // 1) cache inmediato
    const cached = !forceFresh ? getCachedSchedule(state, studentName) : null;
    if (cached) {
      debugLog('Usando cache inmediato para', studentName, cached);
      applyScheduleToStudentUI(ctx, state, studentName, row, cached, today);
    } else {
      state.prog.currentStudentSchedule = new Array(getStudentClassLimit(state, studentName)).fill('');
      paintStudentScheduleGrid(ctx, state);
    }

    // 2) refresco real desde API
    try {
      const res = await loadStudentSchedule(studentName);
      debugLog('Respuesta getSchedule:', res);

      const fechas = cacheSchedule(state, studentName, res?.fechas || []);
      debugLog('Fechas normalizadas para grilla:', fechas);

      applyScheduleToStudentUI(ctx, state, studentName, row, fechas, today);
    } catch (err) {
      console.error('Error cargando programación real del estudiante:', err);

      if (!cached) {
        const fallback = fillToMax(row?.fechas || [], getStudentClassLimit(state, studentName));
        state.prog.currentStudentSchedule = fallback;
        setText(ctx.el.progStudentAlert, row ? getAlertText(row) : 'Sin datos');
        paintStudentScheduleGrid(ctx, state);
      }
    }
  };

  function renderModeShell(ctx, title, subtitle, innerHTML) {
    if (!ctx?.el?.programacionEmbed) return;

    ctx.el.programacionEmbed.innerHTML = `
      <section class="card">
        <div class="card-title">
          <h3>${escapeHTML(title)}</h3>
          <p class="muted">${escapeHTML(subtitle)}</p>
        </div>
        <div class="card-b">
          ${innerHTML}
        </div>
      </section>
    `;
    show(ctx.el.programacionEmbed);
  }

  async function syncStudentInfoAfterSave(ctx, state, studentName) {
    const key = norm(studentName);

    ensureScheduleCache(state);
    state.prog.scheduleCache.delete(key);
    clearSessionCache(studentName);

    await refreshKpisAndStudent(ctx, state, studentName);
  }

  function renderProgramar(ctx, state, studentName) {
    const today = todayISO();
    const classLimit = getStudentClassLimit(state, studentName);
    const packageOptions = [4, 8, 12, 24]
      .filter(v => v <= classLimit)
      .map(v => `<option value="${v}">${v} clases</option>`)
      .join('') || `<option value="${classLimit}">${classLimit} clases</option>`;

    renderModeShell(
      ctx,
      `Programar · ${studentName}`,
      'Genera fechas nuevas y guarda la programación del estudiante.',
      `
        <div class="formGrid">
          <label class="field">
            <span>Paquete</span>
            <select id="ripProgPkg" class="control">
              ${packageOptions}
            </select>
          </label>

          <label class="field">
            <span>Fecha inicial</span>
            <input type="date" id="ripProgStart" class="control" value="${today}">
          </label>

          <label class="field">
            <span>Frecuencia (días)</span>
            <input type="number" id="ripProgFreq" class="control" min="1" value="7">
          </label>

          <label class="field">
            <span>Clases por día</span>
            <input type="number" id="ripProgPerDay" class="control" min="1" max="${classLimit}" value="1">
          </label>
        </div>

        <div class="rowChecks" style="margin-top:12px;">
          <label class="small">
            <input type="checkbox" id="ripProgAvoidSun">
            Evitar domingos
          </label>
          <div class="small">Si un estudiante ve varias clases el mismo día, ajusta “Clases por día”.</div>
        </div>

        <div class="rowActions" style="margin-top:12px;">
          <button class="btn primary" id="ripProgGen" type="button">Generar</button>
          <button class="btn" id="ripProgLoadCurrent" type="button">Cargar programación actual</button>
          <button class="btn ghost" id="ripProgClear" type="button">Limpiar</button>
        </div>

        <div class="statusline" id="ripProgStatus" style="margin-top:12px;"></div>

        <div class="card" style="margin-top:14px;">
          <div class="card-title">
            <h3 style="margin:0;">Fechas (editables)</h3>
            <p class="muted" id="ripProgMeta" style="margin:4px 0 0;">—</p>
          </div>
          <div id="ripProgList" class="list">
            <div class="muted">Aún no hay fechas…</div>
          </div>
          <div class="rowActions" style="margin-top:12px;">
            <button class="btn success" id="ripProgSave" type="button" disabled>Guardar</button>
          </div>
        </div>
      `
    );

    let dates = [];

    function setStatus(msg, tone) {
      const el = $('ripProgStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color =
        tone === 'error' ? '#dc2626' :
        tone === 'ok' ? '#047857' :
        '#6b7280';
    }

    function renderList() {
      const list = $('ripProgList');
      const saveBtn = $('ripProgSave');
      const meta = $('ripProgMeta');
      if (!list) return;

      if (!dates.length) {
        list.innerHTML = `<div class="muted">Aún no hay fechas…</div>`;
        if (saveBtn) saveBtn.disabled = true;
        if (meta) meta.textContent = '—';
        return;
      }

      list.innerHTML = dates.map((v, i) => `
        <div class="item">
          <div class="idxBox">${i + 1}</div>
          <input type="date" class="control" value="${escapeHTML(v)}" data-rip-prog-i="${i}">
          <div></div>
        </div>
      `).join('');

      if (saveBtn) saveBtn.disabled = false;
      if (meta) meta.textContent = `${dates.length} fecha(s)`;

      list.oninput = (ev) => {
        const input = ev.target.closest('[data-rip-prog-i]');
        if (!input) return;
        const i = Number(input.dataset.ripProgI);
        dates[i] = input.value || '';
      };
    }

    $('ripProgGen')?.addEventListener('click', () => {
      const pkg = Math.min(Number($('ripProgPkg')?.value || 0), classLimit);
      const start = $('ripProgStart')?.value;
      const step = Number($('ripProgFreq')?.value || 7);
      const perDay = Math.min(classLimit, Math.max(1, Number($('ripProgPerDay')?.value || 1)));
      const avoid = !!$('ripProgAvoidSun')?.checked;

      if (!pkg || !start) {
        setStatus('Completa paquete y fecha inicial.', 'error');
        return;
      }

      let currentDate = new Date(start);
      const out = [];

      while (out.length < pkg) {
        for (let i = 0; i < perDay && out.length < pkg; i++) {
          out.push(toISO(currentDate));
        }
        if (out.length < pkg) currentDate = nextDate(currentDate, step, avoid);
      }

      dates = out.filter(Boolean);
      renderList();
      setStatus(`Fechas generadas (${pkg} clases, ${perDay} por día).`, 'ok');
    });

    $('ripProgLoadCurrent')?.addEventListener('click', async () => {
      setStatus('Cargando programación actual…');

      try {
        const cached = getCachedSchedule(state, studentName);
        if (cached) {
          dates = normalizeFechas(cached, classLimit);
          renderList();
          setStatus('Programación cargada desde cache.', 'ok');
        }

        const res = await loadStudentSchedule(studentName);
        const fechas = cacheSchedule(state, studentName, res.fechas || []);
        dates = normalizeFechas(fechas, classLimit);
        renderList();
        setStatus('Programación actual cargada.', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('Error cargando programación.', 'error');
      }
    });

    $('ripProgClear')?.addEventListener('click', () => {
      dates = [];
      renderList();
      setStatus('');
    });

    $('ripProgSave')?.addEventListener('click', async () => {
      if (!dates.length) {
        setStatus('Genera o carga fechas antes de guardar.', 'error');
        return;
      }

      setStatus('Guardando…');

      try {
        const res = await apiCall({
          action: 'saveSchedule',
          token: API_TOKEN,
          student: studentName,
        dates: JSON.stringify(dates.slice(0, classLimit))
        });

        if (!res?.ok) {
          setStatus(res?.message || res?.error || 'No se pudo guardar.', 'error');
          return;
        }

        cacheSchedule(state, studentName, dates.slice(0, classLimit));

        setStatus(res.message || 'Programación guardada.', 'ok');
        await syncStudentInfoAfterSave(ctx, state, studentName);
      } catch (err) {
        console.error(err);
        setStatus('Error guardando.', 'error');
      }
    });

    renderList();
  }

  function renderReprogramar(ctx, state, studentName) {
    const classLimit = getStudentClassLimit(state, studentName);
    renderModeShell(
      ctx,
      `Reprogramar · ${studentName}`,
      'Carga programación actual, elige desde qué clase y genera una nueva vista previa.',
      `
        <div class="formGrid">
          <label class="field">
            <span>Frecuencia (días)</span>
            <input type="number" id="ripRepFreq" class="control" min="1" value="7">
          </label>

          <label class="field">
            <span>Cantidad a reprogramar</span>
            <input type="number" id="ripRepCount" class="control" min="1" max="${classLimit}" value="${Math.min(4, classLimit)}">
          </label>

          <label class="field">
            <span>Clases por día</span>
            <input type="number" id="ripRepPerDay" class="control" min="1" max="${classLimit}" value="1">
          </label>

          <label class="field">
            <span>Fecha base (opcional)</span>
            <input type="date" id="ripRepBase" class="control">
          </label>
        </div>

        <div class="rowChecks" style="margin-top:12px;">
          <label class="small">
            <input type="checkbox" id="ripRepAvoidSun">
            Evitar domingos
          </label>
          <div class="small">“Clases por día” repite la misma fecha antes de avanzar a la siguiente.</div>
        </div>

        <div class="rowActions" style="margin-top:12px;">
          <button class="btn primary" id="ripRepLoad" type="button">Cargar programación</button>
          <button class="btn ghost" id="ripRepClear" type="button">Limpiar</button>
        </div>

        <div class="statusline" id="ripRepStatus" style="margin-top:12px;"></div>

        <div class="grid grid2" style="margin-top:14px;">
          <section class="card subcard">
            <div class="card-title">
              <h3 style="margin:0;">Calendario actual</h3>
              <p class="muted" style="margin:4px 0 0;">Toca “Desde aquí”.</p>
            </div>
            <div id="ripRepCurrent" class="list">
              <div class="muted">Carga la programación para ver fechas.</div>
            </div>
          </section>

          <section class="card subcard">
            <div class="card-title">
              <h3 style="margin:0;">Vista previa</h3>
              <p class="muted" id="ripRepPreviewMeta" style="margin:4px 0 0;">—</p>
            </div>
            <div id="ripRepPreview" class="list">
              <div class="muted">Selecciona un punto en calendario.</div>
            </div>
            <div class="rowActions" style="margin-top:12px;">
              <button class="btn" id="ripRepRegen" type="button" disabled>Regenerar</button>
              <button class="btn success" id="ripRepSave" type="button" disabled>Guardar reprogramación</button>
            </div>
          </section>
        </div>
      `
    );

    let schedule = new Array(classLimit).fill('');
    let startIndex = null;
    let preview = [];

    function setStatus(msg, tone) {
      const el = $('ripRepStatus');
      if (!el) return;
      el.textContent = msg || '';
      el.style.color =
        tone === 'error' ? '#dc2626' :
        tone === 'ok' ? '#047857' :
        '#6b7280';
    }

    function renderCurrent() {
      const list = $('ripRepCurrent');
      if (!list) return;

      if (!schedule.some(Boolean)) {
        list.innerHTML = `<div class="muted">Sin programación previa.</div>`;
        return;
      }

      list.innerHTML = schedule.map((v, i) => `
        <div class="item">
          <div class="idxBox">${i + 1}</div>
          ${v ? `<input type="date" class="control" value="${escapeHTML(v)}" disabled>` : `<span class="muted">—</span>`}
          <button class="btn small" type="button" data-rip-rep-start="${i + 1}">Desde aquí</button>
        </div>
      `).join('');
    }

    function renderPreview() {
      const list = $('ripRepPreview');
      const meta = $('ripRepPreviewMeta');
      const btnSave = $('ripRepSave');
      const btnRegen = $('ripRepRegen');

      if (!list) return;

      if (!preview.length || !startIndex) {
        list.innerHTML = `<div class="muted">Selecciona un punto en calendario.</div>`;
        if (meta) meta.textContent = '—';
        if (btnSave) btnSave.disabled = true;
        if (btnRegen) btnRegen.disabled = true;
        return;
      }

      list.innerHTML = preview.map((v, ix) => `
        <div class="item">
          <div class="idxBox">${(startIndex - 1) + ix + 1}</div>
          <input type="date" class="control" value="${escapeHTML(v)}" data-rip-rep-i="${ix}">
          <div></div>
        </div>
      `).join('');

      if (meta) meta.textContent = `Desde clase ${startIndex} · ${preview.length} fecha(s)`;
      if (btnSave) btnSave.disabled = false;
      if (btnRegen) btnRegen.disabled = false;

      list.oninput = (ev) => {
        const input = ev.target.closest('[data-rip-rep-i]');
        if (!input) return;
        const i = Number(input.dataset.ripRepI);
        preview[i] = input.value || '';
      };
    }

    function generatePreview() {
      if (!startIndex) {
        setStatus('Elige primero el punto “Desde aquí”.', 'error');
        return;
      }

      const freq = Number($('ripRepFreq')?.value || 7);
      const cnt = Math.min(classLimit, Number($('ripRepCount')?.value || 4));
      const perDay = Math.min(classLimit, Math.max(1, Number($('ripRepPerDay')?.value || 1)));
      const avoid = !!$('ripRepAvoidSun')?.checked;
      const baseStr = $('ripRepBase')?.value;

      const base = baseStr
        ? new Date(baseStr)
        : (schedule[startIndex - 1] ? new Date(schedule[startIndex - 1]) : new Date(todayISO()));

      let currentDate = new Date(base);
      const out = [];

      while (out.length < cnt && (startIndex + out.length) <= classLimit) {
        for (let i = 0; i < perDay && out.length < cnt && (startIndex + out.length) <= classLimit; i++) {
          out.push(toISO(currentDate));
        }

        if (out.length < cnt && (startIndex + out.length) <= classLimit) {
          currentDate = nextDate(currentDate, freq, avoid);
        }
      }

      preview = out.filter(Boolean);
      renderPreview();
      setStatus(`Vista previa lista: ${preview.length} fecha(s).`, 'ok');
    }

    $('ripRepLoad')?.addEventListener('click', async () => {
      setStatus('Cargando…');

      try {
        const cached = getCachedSchedule(state, studentName);
        if (cached) {
          schedule = fillToMax(cached, classLimit);
          renderCurrent();
          setStatus('Programación cargada desde cache.', 'ok');
        }

        const res = await loadStudentSchedule(studentName);
        const fechas = cacheSchedule(state, studentName, res.fechas || []);

        schedule = fillToMax(fechas, classLimit);
        startIndex = null;
        preview = [];
        renderCurrent();
        renderPreview();
        setStatus('Programación cargada. Elige un punto para reprogramar.', 'ok');
      } catch (err) {
        console.error(err);
        setStatus('Error cargando programación.', 'error');
      }
    });

    $('ripRepClear')?.addEventListener('click', () => {
      schedule = new Array(classLimit).fill('');
      startIndex = null;
      preview = [];
      renderCurrent();
      renderPreview();
      setStatus('');
    });

    $('ripRepRegen')?.addEventListener('click', generatePreview);

    $('ripRepSave')?.addEventListener('click', async () => {
      if (!startIndex || !preview.length) {
        setStatus('Selecciona un punto y genera la vista previa.', 'error');
        return;
      }

      setStatus('Guardando reprogramación…');

      try {
        const res = await apiCall({
          action: 'saveScheduleFrom',
          token: API_TOKEN,
          student: studentName,
          startIndex,
          dates: JSON.stringify(preview.slice(0, classLimit))
        });

        if (!res?.ok) {
          setStatus(res?.message || res?.error || 'Error guardando.', 'error');
          return;
        }

        const merged = fillToMax(schedule, classLimit);
        for (let k = 0; k < preview.length; k++) {
          const idx = (startIndex - 1) + k;
          if (idx >= 0 && idx < classLimit) merged[idx] = preview[k] || '';
        }
        cacheSchedule(state, studentName, merged);

        setStatus(res.message || 'Reprogramación guardada.', 'ok');
        await syncStudentInfoAfterSave(ctx, state, studentName);
      } catch (err) {
        console.error(err);
        setStatus('Error guardando reprogramación.', 'error');
      }
    });

    $('ripRepCurrent')?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-rip-rep-start]');
      if (!btn) return;
      startIndex = Number(btn.dataset.ripRepStart);
      generatePreview();
    });

    renderCurrent();
    renderPreview();
  }

  RIPProgramacion.openMode = function (ctx, state, mode, studentName) {
    const name = studentName || state?.prog?.currentStudentName || '';
    if (!name) return;

    state.prog.currentStudentName = name;
    state.prog.mode = mode || 'prog';

    if (mode === 'reprog') {
      renderReprogramar(ctx, state, name);
      return;
    }

    renderProgramar(ctx, state, name);
  };

  // Firebase adapter: replaces the old Apps Script/JSONP data source while keeping
  // the public RIPProgramacion API used by app.js and ui.ficha.js.
  RIPProgramacion.loadResumen = async function () {
    const [programacion, students, registro] = await Promise.all([
      window.RIPRepository.loadProgramacion(),
      window.RIPRepository.loadStudents(),
      window.RIPRepository.loadRegistro()
    ]);
    const calc = window.RIPCalculations;
    const today = todayISO();

    // Alias nameKey → studentId canónico (mismo criterio que buildFirebasePack)
    const aliasMap = new Map();
    (students || []).forEach(s => {
      const nameKey = String(s.nameKey || s.estudianteKey || '').trim() || norm(s.name || s.estudiante);
      const canonical = String(s.officialStudentId || s.canonicalStudentId ||
        (String(s.studentId || '').trim() === String(s.id || '').trim() ? s.studentId : '') || '').trim();
      if (nameKey && canonical && !aliasMap.has(nameKey)) aliasMap.set(nameKey, canonical);
    });
    const keyOf = (record) => (calc?.getStudentGroupingKey
      ? calc.getStudentGroupingKey(record, aliasMap)
      : (record?.estudianteKey || record?.studentId || norm(record?.estudiante)));

    const studentMap = new Map();
    (students || []).forEach(s => {
      if (s.legacyAliasOf) return; // el canónico ya lo representa
      const nameKey = String(s.nameKey || '').trim() || norm(s.name);
      const key = String(aliasMap.get(nameKey) || '').trim() || nameKey;
      if (key) studentMap.set(key, s.name || key);
    });
    (programacion || []).forEach(p => {
      if (p.legacyAliasOf) return;
      const key = keyOf(p);
      if (key && !studentMap.has(key)) studentMap.set(key, p.estudiante || key);
    });
    const bySchedule = new Map();
    (programacion || []).forEach(p => {
      const key = keyOf(p);
      if (!key) return;
      // El doc canónico manda sobre el alias legado.
      if (p.legacyAliasOf && bySchedule.has(key)) return;
      if (!bySchedule.has(key) || !bySchedule.get(key).canonicalStudentId) bySchedule.set(key, p);
    });
    const rowsByStudent = new Map();
    (registro || []).forEach(row => {
      const key = row?.groupKey || keyOf(row);
      if (!key) return;
      if (!rowsByStudent.has(key)) rowsByStudent.set(key, []);
      rowsByStudent.get(key).push(row);
      if (!studentMap.has(key)) studentMap.set(key, row.estudiante || key);
    });
    const activeStudentByKey = new Map();
    (students || []).forEach(s => {
      const key = String(aliasMap.get(String(s.nameKey || s.estudianteKey || '').trim()) || '').trim()
        || keyOf(s);
      if (!key) return;
      const manualStatus = String(s.estadoManual || s.paramClasif || '').trim();
      if (manualStatus) activeStudentByKey.set(key, norm(manualStatus).startsWith('activo'));
    });
    const dashboard = Array.from(studentMap.entries()).map(([key, name]) => {
      const sch = bySchedule.get(key) || {};
      const fechas = normalizeFechas(sch.fechas || []);
      const limit = calc?.getStudentClassLimit ? calc.getStudentClassLimit(rowsByStudent.get(key) || []) : MAX_CLASSES;
      const studentStatus = calc.calculateStudentStatus(rowsByStudent.get(key) || []);
      const isActive = activeStudentByKey.has(key)
        ? activeStudentByKey.get(key)
        : norm(studentStatus).startsWith('activo');
      const st = calc.calculateProgramacionStatus(fechas, today, limit, isActive);
      return {
        name,
        estado: st.status,
        scheduleExpired: st.status === 'Programacion vencida' || st.status === 'Programación vencida',
        fechas,
        filled: fechas.length,
        limit,
        nextISO: st.nextClassDate || '',
        futureCount: st.futureCount || 0,
        noSchedule: st.status === 'Sin programacion' || st.status === 'Sin programación' || st.status === 'Programacion vencida' || st.status === 'Programación vencida',
        isActive,
        lowFuture: st.status === 'Pocas futuras' || st.status === 'Por completar',
        complete: st.status === 'OK'
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return { ok: true, today, dashboard };
  };

  const firebaseLoadStudentSchedule = async function (studentName) {
    const res = await window.RIPRepository.loadStudentSchedule(studentName);
    return { ok: true, fechas: res.fechas || [], row: res };
  };

  const firebaseSaveSchedule = async function (studentName, fechas) {
    const saved = await window.RIPRepository.saveSchedule(studentName, fechas);
    return { ok: true, fechas: saved.fechas || [] };
  };

  const oldAttachStudent = RIPProgramacion.attachStudent;
  RIPProgramacion.attachStudent = async function (ctx, state, studentName, opts = {}) {
    if (!state.prog) state.prog = {};
    if (!state.prog.data) state.prog.data = await RIPProgramacion.loadResumen();
    return oldAttachStudent(ctx, state, studentName, opts);
  };

  window.RIPProgramacion = RIPProgramacion;
})();

