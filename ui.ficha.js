/* =============================================================================
  ui.ficha.js — RIP UI Ficha (READ-ONLY) + Históricos dinámicos + Sync Programación
  - openFichaByKey: abre ficha completa del estudiante actual (2026)
  - openStudentFromSearch: abre desde índice global (2023/2024/2025/2026)
  - Botones dinámicos por años disponibles
  - Carga TSV histórico bajo demanda
  - Cache por año + estudiante
  - Integra automáticamente bloque de Programación si existe window.RIPProgramacion
  - Resumen mejorado:
    * Última clase
    * Último pago
    * Saldo total
    * Desglose por categoría
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.ficha.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, toast, norm, show, hide, setText } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});
  const EDITOR_API_URL = '';
  const EDITOR_TOKEN = '';

  // =========================
  // Config años / TSV / columnas
  // =========================
  const TSV_URLS = {
    "2025": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRv5znuM6DUG7m6DOQBCbjzJiYpZJiuMK23GW__RfMCcOi1kAcMT_7YH7CzBgmtDEJ-HeiJ5bgCKryw/pub?gid=1810443337&single=true&output=tsv",
    "2024": "https://docs.google.com/spreadsheets/d/e/2PACX-1vTKhAIn0x5D-p80AVkXrBaLhVyqakoQabAvUw3UmEzoo__1AXaWXM1dfvdagWNkHGO4YY_Txxb7OQHM/pub?gid=1810443337&single=true&output=tsv",
    "2023": "https://docs.google.com/spreadsheets/d/e/2PACX-1vRL2kvbjxpU7qoPgiyoytANin1VsvqRx8BTZpSqBOJw_Lyid3NGPc88e3kwFiOsHpOPIgRricd64cin/pub?gid=1810443337&single=true&output=tsv"
  };

  const COLMAP = {
    "2023": { fecha: 1, nombre: 2, servicio: 4, hora: 7, pago: null, profesor: null },
    "2024": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2025": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null },
    "2026": { fecha: 4, nombre: 3, servicio: 5, hora: 8, pago: null, profesor: null }
  };

  const YEAR_ORDER = ['2026', '2025', '2024', '2023'];

  // Cache: year::norm(studentName) -> { headersSlice, rowsSlice, studentName, year }
  const historyCache = new Map();

  // Cache TSV bruto por año
  const tsvYearCache = new Map();

  // =========================
  // TSV helpers
  // =========================
  async function fetchTSV(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('No pude cargar TSV (' + res.status + ')');
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

  async function getParsedYearTSV(year) {
    const y = String(year || '').trim();
    if (!TSV_URLS[y]) return { headers: [], rows: [] };

    if (tsvYearCache.has(y)) return tsvYearCache.get(y);

    const text = await fetchTSV(TSV_URLS[y]);
    const parsed = parseTSV(text);
    tsvYearCache.set(y, parsed);
    return parsed;
  }

  function parseDMY(dmy) {
    const s = String(dmy || '').trim();

    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (m) {
      let dd = parseInt(m[1], 10);
      let mm = parseInt(m[2], 10);
      let yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      const dt = new Date(yy, mm - 1, dd);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      const yy = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const dd = parseInt(m[3], 10);
      const dt = new Date(yy, mm - 1, dd);
      return isNaN(dt.getTime()) ? 0 : dt.getTime();
    }

    return 0;
  }

  function getHistorySliceRange(year) {
    return { start: 2, end: 12 };
  }

  function buildSimpleHeaders(headers, start, end) {
    return (headers || []).slice(start, end);
  }

  async function loadStudentByYear(year, studentName) {
    const y = String(year || '').trim();
    const studentKey = norm(studentName);
    if (!y || !studentKey) return { headersSlice: [], rowsSlice: [], year: y, studentName };

    const cacheKey = `${y}::${studentKey}`;
    if (historyCache.has(cacheKey)) return historyCache.get(cacheKey);

    const parsed = await getParsedYearTSV(y);
    const map = COLMAP[y];
    if (!map) throw new Error(`No hay COLMAP para ${y}`);

    const idxStudent = Number(map.nombre);
    const idxFecha = Number(map.fecha);

    const { start, end } = getHistorySliceRange(y);
    const headersSlice = buildSimpleHeaders(parsed.headers, start, end);

    const rowsSlice = parsed.rows
      .filter((r) => norm(r[idxStudent] || '') === studentKey)
      .map((r) => ({
        r,
        ts: parseDMY(r[idxFecha] || '')
      }))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0))
      .map((x) => x.r.slice(start, end));

    const pack = { headersSlice, rowsSlice, year: y, studentName };
    historyCache.set(cacheKey, pack);
    return pack;
  }

  // =========================
  // Helpers data / entry
  // =========================
  function getSearchEntryByName(state, studentName) {
    const pool =
      state.searchStudents ||
      state.studentSearchIndex ||
      state.globalStudentIndex ||
      state.allStudents ||
      [];

    const key = norm(studentName);
    if (!key) return null;

    return pool.find((s) => norm(s?.name) === key) || null;
  }

  function getCurrentStudentSearchEntry(state) {
    const name = state.currentStudentName || '';
    if (!name) return null;

    const fresh = getSearchEntryByName(state, name);
    if (fresh) {
      state.currentSearchEntry = fresh;
      return fresh;
    }

    if (state.currentSearchEntry && norm(state.currentSearchEntry.name) === norm(name)) {
      return state.currentSearchEntry;
    }

    return null;
  }
  function getAvailableYearsForEntry(entry, state) {
    const set = new Set();

    if (entry && Array.isArray(entry.years)) {
      entry.years.forEach((y) => {
        const yy = String(y || '').trim();
        if (yy) set.add(yy);
      });
    }

    const currentName = entry?.name || state.currentStudentName || '';
    if (currentName) {
      const exists2026 = (state.allStudents || []).some((s) => norm(s.name) === norm(currentName));
      if (exists2026) set.add('2026');
    }

    return YEAR_ORDER.filter((y) => set.has(y));
  }

  function isCurrentYearAvailable(year, state) {
    const entry = getCurrentStudentSearchEntry(state);
    const years = getAvailableYearsForEntry(entry, state);
    return years.includes(String(year));
  }

  function ensureYearButtonsHost(ctx) {
    const { el } = ctx;

    if (el.yearButtonsHost) return el.yearButtonsHost;

    let host = document.getElementById('yearButtonsHost');
    if (!host && el.fichaView) {
      host = document.createElement('div');
      host.id = 'yearButtonsHost';
      host.className = 'year-buttons-host';

      const anchor =
        el.fichaSub?.parentElement ||
        el.fichaTitle?.parentElement ||
        el.fichaView;

      anchor.appendChild(host);
    }

    el.yearButtonsHost = host;
    return host;
  }

  // =========================
  // Render 2026
  // =========================
  function inferTipoLabel(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;
    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  function renderTable2026(ctx, rows, cycleBaseRows = rows) {
    const { el } = ctx;
    if (!el.tableBody) return;
    rows = window.RIPCalculations?.markMusigymSubscriptions ? window.RIPCalculations.markMusigymSubscriptions(rows || []) : rows;
    cycleBaseRows = window.RIPCalculations?.markMusigymSubscriptions ? window.RIPCalculations.markMusigymSubscriptions(cycleBaseRows || rows || []) : cycleBaseRows;
    // Esta función se invoca desde varias vistas (ficha, edición y revisión
    // Wix). El orden se garantiza aquí, justo antes de pintar la tabla.
    if (window.RIPCore?.util?.sortRowsByDateTime) {
      rows = window.RIPCore.util.sortRowsByDateTime(rows || [], 'desc');
      cycleBaseRows = window.RIPCore.util.sortRowsByDateTime(cycleBaseRows || [], 'desc');
    }

    const editable = !!ctx.__fichaEditMode;
    const theadRow = document.querySelector('#tablaContainer thead tr');
    if (theadRow) {
      const hasAction = !!theadRow.querySelector('.th-ficha-actions');
      if (editable && !hasAction) {
        const th = document.createElement('th');
        th.className = 'th-ficha-actions';
        th.textContent = 'Acciones';
        theadRow.appendChild(th);
      }
      if (!editable && hasAction) theadRow.querySelector('.th-ficha-actions')?.remove();
    }

    if (!rows || !rows.length) {
      el.tableBody.innerHTML = `<tr><td colspan="${editable ? 12 : 11}" class="empty-td">No hay registros para este estudiante.</td></tr>`;
      return;
    }

    const cycleById = new Map();
    const cycleMetaById = new Map();
    const getRowId = (r) => String(r.id || `${r.fechaRaw}|${r.hora}|${r.servicio}`);
    const getTimeKey = (r) => {
      const raw = String(r?.hora || '').trim().toLowerCase();
      const m = raw.match(/(\d{1,2}):(\d{2})/);
      if (!m) return 0;
      let hour = Number(m[1]);
      const meridiem = raw.replace(/[.\s]/g, '').match(/([ap])m/)?.[1] || '';
      if (meridiem === 'p' && hour < 12) hour += 12;
      if (meridiem === 'a' && hour === 12) hour = 0;
      return hour * 60 + Number(m[2]);
    };
    const normalizePackageKey = (value) => {
      const key = norm(value || 'sin-clasificacion');
      if (key === 'pago' || key === 'cp de clase de prueba' || key === 'cc de clase de cortesia') return '*';
      // TV son talleres vacacionales: consumen la misma bolsa que Taller.
      if (key === 'tv') return 'taller';
      if (key === 'ms g' || key === 'ms sp') return 'vacacional-flex';
      return key;
    };
    const getPackageKey = (r) => {
      if (window.RIPCalculations?.getPackageRedemptionKey) {
        return window.RIPCalculations.getPackageRedemptionKey(r);
      }
      // Los pagos de Taller suelen guardar la familia en Clasif. pagos, pero
      // los importados antiguos pueden tenerla solo en Clasificación.
      const value = isPagoRow(r) ? (r?.clasifPago || r?.clasif) : r?.clasif;
      return normalizePackageKey(value);
    };
    let cycle = -1;
    // La numeración visible identifica la familia del paquete. Las clases
    // regulares comparten P; Taller y Ensamble llevan sus propios contadores.
    const packageSequenceByPrefix = new Map();
    const activeByKey = new Map();
    const pendingPackagesByKey = new Map();
    const pendingClassIdsByKey = new Map();
    const specialCreditsByPaymentId = new Map();
    const getQueue = (map, key) => {
      if (!map.has(key)) map.set(key, []);
      return map.get(key);
    };
    const getPackagePrefix = (packageKey) => {
      if (packageKey === 'taller') return 'T';
      if (packageKey === 'ensamble') return 'E';
      return 'P';
    };
    const getSpecialCode = (r, fallbackCycle = 0, prefix = 'P') => {
      const txt = norm(`${r?.servicio || ''} ${r?.comentario || ''} ${r?.clasif || ''} ${r?.clasifPago || ''}`);
      if (txt.includes('cp de clase de prueba') || (/\bcp\b/.test(txt) && /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/.test(txt))) return 'CP';
      if (txt.includes('cc de clase de cortesia') || (/\bcc\b/.test(txt) && /\b(cortesia|gratis|obsequio)\b/.test(txt))) return 'CC';
      return `${prefix}${fallbackCycle + 1}`;
    };

    const makePackage = (cycleIdx, mov, sourceRow, packageKey) => {
      const prefix = getPackagePrefix(packageKey);
      const specialCode = getSpecialCode(sourceRow, 0, prefix);
      const isSpecialCredit = specialCode === 'CP' || specialCode === 'CC';
      const sequence = packageSequenceByPrefix.get(prefix) || 0;
      if (!isSpecialCredit) packageSequenceByPrefix.set(prefix, sequence + 1);
      return {
        cycle: cycleIdx,
        code: isSpecialCredit ? specialCode : getSpecialCode(sourceRow, sequence, prefix),
        total: Math.max(0, Math.round(mov)),
        remaining: Math.max(0, Math.round(mov)),
        used: 0,
        exhausted: false
      };
    };
    const assignClassToPackage = (rid, pack) => {
      pack.used += 1;
      const overLimit = pack.exhausted || (pack.total > 0 && pack.used > pack.total);
      pack.remaining = Math.max(0, pack.remaining - 1);
      if (pack.remaining <= 0) pack.exhausted = true;
      cycleById.set(rid, pack.cycle);
      cycleMetaById.set(rid, {
        kind: 'clase',
        cycle: pack.cycle,
        classNo: pack.used,
        total: pack.total,
        code: pack.code,
        overLimit
      });
    };
    const bottomToTop = window.RIPCore?.util?.sortRowsByDateTime
      ? window.RIPCore.util.sortRowsByDateTime(cycleBaseRows || rows || [], 'asc')
      : [...(cycleBaseRows || rows || [])].sort((a, b) => {
          const ta = Number(a?.fechaTs) || 0;
          const tb = Number(b?.fechaTs) || 0;
          if (ta !== tb) return ta - tb;
          return getTimeKey(a) - getTimeKey(b);
        });

    for (const r of bottomToTop) {
      const matricula = isMatriculaPago(r) || Boolean(r?.matriculaEnrollmentRedeemed);
      const mov = Number(r.movimientoSaldo ?? r.movimiento) || 0;
      const rid = getRowId(r);
      const packageKey = getPackageKey(r);

      if (r?.musigymSubscriptionRedeemed && isClaseRow(r)) {
        cycleById.set(rid, Math.max(cycle, 0));
        cycleMetaById.set(rid, {
          kind: 'musigym-subscription',
          cycle: Math.max(cycle, 0),
          code: r.musigymSubscriptionLabel || 'Musigym',
          total: 0
        });
        continue;
      }

      if (!matricula && isPagoRow(r) && window.RIPCalculations?.isMusigymSubscription?.(r)) {
        cycle += 1;
        const code = `Musigym ${cycle + 1}`;
        cycleById.set(rid, cycle);
        cycleMetaById.set(rid, {
          kind: 'musigym-pago',
          cycle,
          total: 0,
          code,
          key: packageKey
        });
        continue;
      }

      if (!matricula && isPagoRow(r) && mov > 0) {
        cycle += 1;
        const pack = makePackage(cycle, mov, r, packageKey);
        // Un crédito CC/CP solo se puede consumir por la clase que la regla
        // cronológica ya marcó como posterior a su pago. Nunca se usa para
        // cubrir una clase anterior que estuviera pendiente.
        if (window.RIPCalculations?.isTrialCP?.(r) || window.RIPCalculations?.isCourtesyCC?.(r)) {
          specialCreditsByPaymentId.set(rid, pack);
          cycleById.set(rid, cycle);
          cycleMetaById.set(rid, { kind: 'pago', cycle, total: pack.total, code: pack.code, key: packageKey });
          continue;
        }
        let activePackage = activeByKey.get(packageKey) || null;
        if (activePackage && activePackage.remaining > 0) getQueue(pendingPackagesByKey, packageKey).push(pack);
        else {
          activePackage = pack;
          activeByKey.set(packageKey, activePackage);
        }
        cycleById.set(rid, cycle);
        cycleMetaById.set(rid, {
          kind: 'pago',
          cycle,
          total: pack.total,
          code: pack.code,
          key: packageKey
        });

        const pendingClassIds = getQueue(pendingClassIdsByKey, packageKey);
        while (activePackage && pendingClassIds.length && activePackage.remaining > 0) {
          const pendingId = pendingClassIds.shift();
          assignClassToPackage(pendingId, activePackage);
        }
        if (packageKey === '*') {
          for (const [pendingKey, ids] of pendingClassIdsByKey.entries()) {
            if (pendingKey === '*' || !ids.length) continue;
            while (activePackage && ids.length && activePackage.remaining > 0) {
              const pendingId = ids.shift();
              assignClassToPackage(pendingId, activePackage);
            }
            if (!activePackage || activePackage.remaining <= 0) break;
          }
        }

        if (activePackage && activePackage.remaining <= 0) {
          activePackage = getQueue(pendingPackagesByKey, packageKey).shift() || null;
          if (activePackage) activeByKey.set(packageKey, activePackage);
          else activeByKey.delete(packageKey);
        }

        continue;
      }

      let activeKey = packageKey;
      let activePackage = activeByKey.get(activeKey) || null;
      const specialPaymentId = String(r?.trialCourtesyPaymentId || '');
      if (r?.trialCourtesyRedeemed && specialPaymentId && specialCreditsByPaymentId.has(specialPaymentId)) {
        activePackage = specialCreditsByPaymentId.get(specialPaymentId);
        activeKey = `special:${specialPaymentId}`;
      }
      if (!activePackage) {
        activeKey = '*';
        activePackage = activeByKey.get(activeKey) || null;
      }
      if (!activePackage && pendingPackagesByKey.has(packageKey)) {
        activePackage = getQueue(pendingPackagesByKey, packageKey).shift() || null;
        if (activePackage) {
          activeKey = packageKey;
          activeByKey.set(activeKey, activePackage);
        }
      }
      if (!activePackage && pendingPackagesByKey.has('*')) {
        activePackage = getQueue(pendingPackagesByKey, '*').shift() || null;
        if (activePackage) {
          activeKey = '*';
          activeByKey.set(activeKey, activePackage);
        }
      }
      const rowCycle = matricula ? -1 : (activePackage ? activePackage.cycle : Math.max(cycle, 0));
      cycleById.set(rid, rowCycle);
      if (matricula) cycleMetaById.set(rid, { kind: 'matricula' });

      if (!matricula && isClaseRow(r) && mov < 0 && activePackage) {
        assignClassToPackage(rid, activePackage);
        if (activeKey.startsWith('special:')) {
          specialCreditsByPaymentId.delete(specialPaymentId);
          continue;
        }
        if (activePackage.remaining <= 0) {
          const nextPackage = getQueue(pendingPackagesByKey, activeKey).shift() || null;
          if (nextPackage) activeByKey.set(activeKey, nextPackage);
          else activeByKey.delete(activeKey);
        }
      } else if (!matricula && isClaseRow(r) && mov < 0) {
        getQueue(pendingClassIdsByKey, packageKey).push(rid);
      }
    }

    for (const ids of pendingClassIdsByKey.values()) {
      for (const pendingId of ids) {
        cycleById.set(pendingId, Math.max(cycle, 0));
        cycleMetaById.set(pendingId, { kind: 'unpaid' });
      }
    }

    const duplicateClassCounts = getDuplicateClassCounts(rows);
    const html = rows
      .slice(0, 1800)
      .map((r) => {
        const isCourtesy = Boolean((window.RIPCalculations?.isCourtesy?.(r) || window.RIPCalculations?.isCourtesyCC?.(r)) && !r?.trialCourtesyRedeemed);
        const tipo = inferTipoLabel(r);
        const mov = Number(r.movimientoSaldo ?? r.movimiento) || 0;
        const movClass = mov < 0 ? 'mov-neg' : mov > 0 ? 'mov-pos' : 'mov-zero';
        const movText = `${mov > 0 ? '+' : ''}${fmtMoney(mov)}`;
        const duplicateCount = Number(r?.duplicateClassCount) || duplicateClassCounts.get(getDuplicateClassKey(r)) || 0;
        const isDuplicate = !!r?.isDuplicateClass || duplicateCount > 1;
        const duplicateBadge = isDuplicate
          ? ` <span class="tag duplicate" title="Clase repetida: mismo estudiante, dia, hora y docente">${r?.duplicateReview ? 'Duplicada por revisar' : `Repetida x${duplicateCount}`}</span>`
          : '';
        const rid = getRowId(r);
        const cycleIdxRaw = Number(cycleById.get(rid));
        const cycleMeta = cycleMetaById.get(rid) || null;
        const isMatricula = isMatriculaPago(r) || Boolean(r?.matriculaEnrollmentRedeemed) || cycleIdxRaw < 0;
        const cycleIdx = Number.isFinite(cycleIdxRaw) ? cycleIdxRaw : 0;
        const cycleClass = isCourtesy ? 'cycle-courtesy' : (isMatricula ? 'cycle-matricula' : `cycle-${cycleIdx % 8}`);
        const specialCode = cycleMeta?.code || getSpecialCode(r, cycleIdx);
        const cycleLabel = isCourtesy
          ? 'CC'
          : isMatricula
          ? 'M'
          : cycleMeta?.kind === 'unpaid'
            ? '!'
          : cycleMeta?.kind === 'musigym-pago'
            ? specialCode
          : cycleMeta?.kind === 'musigym-subscription'
            ? specialCode
          : cycleMeta?.kind === 'clase'
            ? (cycleMeta.overLimit ? '!' : `${specialCode} ${cycleMeta.classNo}/${cycleMeta.total || '?'}`)
            : cycleMeta?.kind === 'pago'
              ? `${specialCode} +${cycleMeta.total || mov}`
              : specialCode;
        const cycleTitle = isCourtesy
          ? 'Clase de cortesía (CC) · no consume pago'
          : isMatricula
          ? 'Matrícula (sin conteo)'
          : cycleMeta?.kind === 'unpaid'
            ? 'Clase pendiente de pago'
          : cycleMeta?.kind === 'musigym-pago'
            ? `${specialCode} activado`
          : cycleMeta?.kind === 'musigym-subscription'
            ? `${specialCode} redimido`
          : cycleMeta?.kind === 'clase'
            ? (cycleMeta.overLimit ? `${specialCode} · clases agotadas` : `${specialCode} redimido · clase ${cycleMeta.classNo} de ${cycleMeta.total || '?'}`)
            : cycleMeta?.kind === 'pago'
              ? `${specialCode} activado · ${cycleMeta.total || mov} clase(s)`
              : `${specialCode}`;
        const wixTag = r.__wixStatus
          ? ` <span class="pilltag ${escapeHTML(r.__wixTone || 'muted')}" title="${escapeHTML(r.__wixDetail || '')}">${escapeHTML(r.__wixStatus)}</span>`
          : '';
        const tipoWithDot = `<span class="cycle-dot ${cycleClass}" title="${cycleTitle}"></span><span class="cycle-num" title="${cycleTitle}">${cycleLabel}</span> ${escapeHTML(tipo)}${wixTag}${duplicateBadge}`;
        const debtClass = isClaseRow(r) && mov < 0 && (!cycleMeta || cycleMeta.kind === 'unpaid' || cycleMeta.overLimit) ? 'row-debt' : '';
        const actionKey = getEditableRowKey(r);
        const canPersistRow = !!actionKey;
        const actions = editable
          ? `<td class="td-ficha-actions"><button class="btn small ghost" type="button" data-edit-row="${escapeHTML(actionKey)}" ${canPersistRow ? '' : 'disabled title="Fila sin ID ni número de fila"'}>Editar</button> <button class="btn small" type="button" data-dup-row="${escapeHTML(actionKey)}" ${canPersistRow ? '' : 'disabled title="Fila sin ID ni número de fila"'}>Duplicar</button> <button class="btn small ghost" type="button" data-del-row="${escapeHTML(actionKey)}" ${canPersistRow ? '' : 'disabled title="Fila sin ID ni número de fila"'}>Eliminar</button></td>`
          : '';

        return `
          <tr class="${[debtClass, isDuplicate ? 'row-duplicate' : ''].filter(Boolean).join(' ')}">
            <td>${escapeHTML(r.estudiante)}</td>
            <td>${tipoWithDot}</td>
            <td>${escapeHTML(r.fechaRaw)}</td>
            <td>${escapeHTML(r.hora)}</td>
            <td>${escapeHTML(r.servicio)}</td>
            <td>${escapeHTML(r.profesor)}</td>
            <td>${escapeHTML(r.pago)}</td>
            <td>${escapeHTML(r.comentario)}</td>
            <td>${escapeHTML(r.clasif)}</td>
            <td>${escapeHTML(r.clasifPago)}</td>
            <td class="${movClass}">${movText}</td>
            ${actions}
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML = html;
    if (ctx?.el?.btnFichaDeleteDuplicates) {
      const duplicateCount = (rows || []).filter(r => r?.duplicateReview).length;
      ctx.el.btnFichaDeleteDuplicates.style.display = duplicateCount > 0 ? '' : 'none';
      ctx.el.btnFichaDeleteDuplicates.textContent = duplicateCount > 0
        ? `Verificar y eliminar duplicadas (${duplicateCount})`
        : 'Verificar y eliminar duplicadas';
    }
    if (editable) bindEditRowActions(ctx);
  }

  // =========================
  // Render históricos simples
  // =========================
  function setTableHeader(headersSlice) {
    const thead = document.querySelector('#tablaContainer thead');
    if (!thead) return;

    thead.innerHTML =
      '<tr>' + headersSlice.map((h) => '<th>' + escapeHTML(h || '') + '</th>').join('') + '</tr>';
  }

  function setTableBodySimple(rowsSlice, year) {
    const tbody =
      document.querySelector('#tablaContainer tbody') ||
      document.querySelector('#tableBody');

    if (!tbody) return;

    if (!rowsSlice.length) {
      tbody.innerHTML = `<tr><td colspan="12" class="empty-td">Sin registros ${escapeHTML(year)} para este estudiante.</td></tr>`;
      return;
    }

    tbody.innerHTML = rowsSlice
      .map((r) => '<tr>' + r.map((c) => '<td>' + escapeHTML(c ?? '') + '</td>').join('') + '</tr>')
      .join('');
  }

  // =========================
  // View helpers
  // =========================
  function showFichaContainer(ctx) {
    const { el } = ctx;

    show(el.fichaView);
    hide(el.dashboardClasView);
    hide(el.dashboardSaldoView);
    hide(el.dashboardProgView);

    show(el.btnBackToDash);
  }

  function resetFichaVisualState(ctx, state) {
    const { el } = ctx;

    state.__viewYear = '2026';

    if (!state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      state.__thead2026HTML = thead ? thead.innerHTML : '';
    }

    if (state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      if (thead) thead.innerHTML = state.__thead2026HTML;
    }

    show(el.fichaSummaryBlock);
    show(el.tablaContainer);
    show(el.programacionStudentView);
    el.filtersCard?.classList.add('filters-card--ficha');
    if (el.fStudent) el.fStudent.value = state.currentStudentName || '';
    RIPUI.table?.renderProfesorOptions?.(ctx, state.registro || [], state.currentStudentKey || '');
    RIPUI.table?.renderServiceList?.(ctx, state, state.registro || [], { keepSearch: false, estudianteKey: state.currentStudentKey || '' });

    if (el.programacionEmbed) el.programacionEmbed.innerHTML = '';
  }

  // =========================
  // Helpers resumen 2026
  // =========================
  function isPagoRow(r) {
    const tipo = String(r?.tipo || '').trim().toLowerCase();
    if (tipo === 'pago') return true;
    if (tipo === 'clase') return false;
    return !!String(r?.pago || '').trim();
  }

  function isMatriculaPago(r) {
    if (!isPagoRow(r)) return false;
    const raw = `${r?.servicio || ''} ${r?.pago || ''} ${r?.comentario || ''} ${r?.clasifPago || ''} ${r?.clasif || ''}`;
    const txt = raw.toLowerCase();
    return /matr[ií]cula/.test(txt) || /\bME\b/i.test(raw);
  }

  function isClaseRow(r) {
    const tipo = String(r?.tipo || '').trim().toLowerCase();
    if (tipo === 'clase') return true;
    if (tipo === 'pago') return false;
    return !String(r?.pago || '').trim();
  }

  function getDuplicateClassKey(r) {
    if (!isClaseRow(r)) return '';
    return [
      norm(r.estudianteKey || r.estudiante),
      norm(r.fechaRaw || r.fecha),
      norm(r.hora),
      norm(r.profesor)
    ].join('|');
  }

  function getDuplicateClassCounts(rows) {
    const counts = new Map();
    for (const r of rows || []) {
      const key = getDuplicateClassKey(r);
      if (!key || key.split('|').some(part => !part)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function getLastPagoRow(rows) {
    for (const r of rows || []) {
      if (isPagoRow(r)) return r;
    }
    return null;
  }

  function getLastClaseRow(rows) {
    for (const r of rows || []) {
      if (isClaseRow(r)) return r;
    }
    return null;
  }

  function getCategoryKey(r) {
    const fromPago = String(r?.clasifPago || '').trim();
    const fromClase = String(r?.clasif || '').trim();
    const fallback = String(r?.servicio || '').trim();

    if (isPagoRow(r) && fromPago) return fromPago;
    return fromClase || fromPago || fallback || 'Sin categor�a';
  }

  function isTrialCPLabel(label) {
    const key = norm(label);
    return key.includes('cp de clase de prueba') || key.includes('cc de clase de cortesia');
  }

  function buildSaldoBreakdown(rows) {
    rows = window.RIPCalculations?.markMusigymSubscriptions ? window.RIPCalculations.markMusigymSubscriptions(rows || []) : rows;
    const totals = new Map();
    let saldoTotal = 0;

    for (const r of rows || []) {
      const mov = Number(r?.movimientoSaldo ?? r?.movimiento) || 0;
      saldoTotal += mov;

      const cat = getCategoryKey(r);
      totals.set(cat, (totals.get(cat) || 0) + mov);
    }

    let cpCredit = 0;
    for (const [label, value] of totals.entries()) {
      if (isTrialCPLabel(label) && value > 0) cpCredit += value;
    }

    let settledTrialClasses = 0;
    if (cpCredit > 0) {
      const negativeLabels = Array.from(totals.entries())
        .filter(([label, value]) => value < 0 && !isTrialCPLabel(label))
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));

      for (const [label, value] of negativeLabels) {
        if (cpCredit <= 0) break;
        const used = Math.min(cpCredit, Math.abs(value));
        totals.set(label, value + used);
        cpCredit -= used;
        settledTrialClasses += used;
      }

      for (const [label, value] of totals.entries()) {
        if (!isTrialCPLabel(label) || value <= 0) continue;
        const used = value - cpCredit;
        totals.set(label, Math.max(0, value - used));
        break;
      }
    }

    // Los pagos heredados como “Pago” son crédito sin modalidad. En lugar
    // de mostrar dos cifras que obliguen a hacer la resta mental (Pago +8,
    // MV P -5), se aplican a las modalidades con clases pendientes. Así la
    // ficha muestra directamente MV P +3.
    const genericPaymentLabel = Array.from(totals.keys()).find(label => norm(label) === 'pago');
    let genericPaymentCredit = genericPaymentLabel ? Math.max(0, Number(totals.get(genericPaymentLabel)) || 0) : 0;
    if (genericPaymentCredit > 0) {
      const pendingModalities = Array.from(totals.entries())
        .filter(([label, value]) => norm(label) !== 'pago' && !isTrialCPLabel(label) && value < 0)
        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      for (const [label, value] of pendingModalities) {
        if (genericPaymentCredit <= 0) break;
        const used = Math.min(genericPaymentCredit, Math.abs(value));
        totals.set(label, value + used);
        genericPaymentCredit -= used;
      }
      totals.set(genericPaymentLabel, genericPaymentCredit);
    }

    const duplicateReviewCount = (rows || []).filter(r => r?.duplicateReview).length;

    const items = Array.from(totals.entries())
      .map(([label, value]) => ({ label, value }))
      .filter(item => Math.abs(Number(item.value) || 0) > 0.0001);

    if (settledTrialClasses > 0) {
      items.push({ label: 'Clase de prueba saldada', value: 0 });
    }

    if (duplicateReviewCount > 0) {
      items.push({ label: 'Clases duplicadas por revisar', value: 0, count: duplicateReviewCount });
    }

    items.sort((a, b) => {
      const absDiff = Math.abs(b.value) - Math.abs(a.value);
      if (absDiff !== 0) return absDiff;
      return String(a.label).localeCompare(String(b.label), 'es');
    });

    return { saldoTotal, items };
  }

  function saldoClass(value) {
    if (value < 0) return 'neg';
    if (value > 0) return 'pos';
    return 'zero';
  }

  function saldoText(value) {
    return `${value > 0 ? '+' : ''}${fmtMoney(value)}`;
  }

    function parsePagoValue(raw) {
    const s = String(raw || '').trim();
    if (!s) return 0;
    const cleaned = s
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function getPagosStats(rows) {
    const pagos = (rows || []).filter(isPagoRow);
    const lastPago = pagos[0] || null;
    let totalPagos = 0;
    for (const p of pagos) totalPagos += parsePagoValue(p?.pago);
    return {
      lastPagoValor: parsePagoValue(lastPago?.pago),
      totalPagos
    };
  }

  function getPrimeraVezForStudent(ctx, student) {
    // student.key puede ser un studentId canónico: no se normaliza.
    const key = String(student?.key || '').trim() || norm(student?.name || '');
    if (!key) return null;
    const calc = window.RIPCalculations;
    return (ctx?.state?.primeraVez || [])
      .filter(row => (calc?.matchesStudentKey
        ? calc.matchesStudentKey(row, key) || (student?.name && calc.matchesStudentKey(row, norm(student.name)))
        : norm(row?.estudianteKey || row?.estudiante) === norm(key)))
      .sort((a, b) => (Number(b?.fechaClaseTs) || 0) - (Number(a?.fechaClaseTs) || 0))[0] || null;
  }

  function primeraVezText(record) {
    if (!record) return '—';
    const fecha = record.fechaClase || '—';
    const motivo = record.motivo || 'Sin motivo';
    return `${fecha} · ${motivo}`;
  }

  function getActiveInterestRows(rows) {
    const calc = window.RIPCalculations;
    return (rows || []).filter(row => calc?.isActiveInterestRow ? calc.isActiveInterestRow(row) : norm(row?.tipo) === 'clase');
  }

  function uniqueServicesFromRows(rows) {
    const seen = new Set();
    const out = [];
    for (const row of getActiveInterestRows(rows || [])) {
      const name = String(row?.servicio || '').trim().replace(/\s+/g, ' ');
      const key = norm(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b, 'es'));
  }

  function renderInterestValue(value) {
    const text = String(value || '').trim();
    return text ? escapeHTML(text) : '<span class="muted">?</span>';
  }

  function renderServiceChips(services) {
    const list = Array.isArray(services) ? services : [];
    if (!list.length) return '<span class="muted">Sin servicios registrados</span>';
    return list.map(service => `<span class="ficha-service-chip">${escapeHTML(service)}</span>`).join('');
  }

  function renderFichaServicios(ctx, student, rows) {
    const el = ctx?.el?.fichaServiciosBlock;
    if (!el) return;
    const calculated = window.RIPCalculations?.calculateStudentInterest
      ? window.RIPCalculations.calculateStudentInterest(rows || [])
      : (student?.computed || {});
    const activeRows = getActiveInterestRows(rows || []);
    const services = uniqueServicesFromRows(activeRows);
    el.innerHTML = `
      <div class="ficha-interest-grid">
        <div class="ficha-interest-cell">
          <span>Curso</span>
          <strong>${renderInterestValue(calculated.cursoDisplay)}</strong>
        </div>
        <div class="ficha-interest-cell">
          <span>Instrumento</span>
          <strong>${renderInterestValue(calculated.instrumentoDisplay)}</strong>
        </div>
        <div class="ficha-interest-cell">
          <span>Estilo</span>
          <strong>${renderInterestValue(calculated.estiloDisplay)}</strong>
        </div>
        <div class="ficha-interest-cell">
          <span>?nfasis</span>
          <strong>${renderInterestValue(calculated.enfasisDisplay)}</strong>
        </div>
      </div>
      <div class="ficha-services-row">
        <span class="ficha-services-label">Servicios activos detectados</span>
        <div class="ficha-services-chips">${renderServiceChips(services)}</div>
      </div>
    `;
  }

  function renderAssociatedIds(ctx, student, rows = []) {
    const el = ctx?.el;
    if (!el?.fichaStudentIds) return;

    const ids = new Set();
    const add = (value) => {
      const id = String(value || '').trim();
      if (id) ids.add(id);
    };

    add(student?.key);
    add(student?.studentId);
    add(student?.officialStudentId);
    add(student?.canonicalStudentId);
    (student?.linkedStudentIds || []).forEach(add);
    (rows || []).forEach(row => {
      add(row?.studentId);
      add(row?.officialStudentId);
      add(row?.canonicalStudentId);
      (row?.linkedStudentIds || []).forEach(add);
    });

    const values = Array.from(ids);
    el.fichaStudentIds.innerHTML = values.length
      ? values.map(id => `<code class="ficha-id">${escapeHTML(id)}</code>`).join('')
      : '<span class="muted">No hay IDs asociados.</span>';
    if (el.fichaIdsBlock) el.fichaIdsBlock.hidden = false;
  }


  const wixEmail = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const wixMinute = (value) => {
    const text = String(value || '').trim().toLowerCase();
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) return -1;
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    // Históricos RIP pueden guardar "4:00 p. m." mientras Wix entrega
    // "16:00". Se aceptan p.m./pm y a.m./am, con espacios opcionales.
    const meridiem = text.replace(/[.\s]/g, '').match(/([ap])m/iu)?.[1] || '';
    if (meridiem === 'p' && hour < 12) hour += 12;
    if (meridiem === 'a' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return -1;
    return hour * 60 + minute;
  };
  const wixDateTime = (value) => {
    const local = window.RIPWix?.normalizeWixDateTime(value);
    if (!local) return { date: '', minute: -1, label: String(value || '') };
    return { date: local.fecha, minute: wixMinute(local.hora), label: `${local.fecha} ${local.hora}` };
  };

  function wixIdentity(student, rows, emails, resolvedContactId = '') {
    const fromRows = (rows || []).find(r => r?.wixContactId)?.wixContactId;
    return { wixContactId: String(resolvedContactId || student?.wixContactId || fromRows || '').trim(), emails: new Set([...emails].map(x => window.RIPWix?.normalizeText(x) || wixEmail(x))) };
  }

  function wixPresentation(result, wix) {
    const map = {
      MATCHED_CONFIRMED: ['✅ Wix confirmado', 'success'], MATCHED_CANCELED: ['🔵 Wix cancelado', 'muted'],
      PROBABLE_MATCH: ['🟡 Revisar coincidencia', 'warn'], UNMAPPED_SERVICE: ['⚠ Sin relación Wix', 'warn'],
      UNMAPPED_STUDENT: ['⚠ Sin identidad Wix', 'warn'], TIME_MISMATCH: ['⚠ Hora/fecha distinta', 'warn'],
      DUPLICATE_MATCH: ['⚠ Más de una reserva Wix', 'warn'], NOT_FOUND: ['❌ No encontrado', 'warn']
    };
    const pair = map[result?.state] || map.NOT_FOUND;
    const local = result?.local;
    const ids = [`Booking: ${wix?.wixBookingId || wix?.id || '—'}`, `Event: ${wix?.wixEventId || '—'}`, `Service: ${wix?.wixServiceId || '—'}`, `Wix UTC: ${wix?.inicio || '—'}`, local ? `Bogotá: ${local.fecha} ${local.hora}` : ''];
    return { status: pair[0], tone: pair[1], detail: `${result?.method || 'sin coincidencia'}\n${ids.filter(Boolean).join('\n')}` };
  }

  async function getFichaWixEmails(student, rows) {
    const emails = new Set();
    const add = (value) => { const clean = wixEmail(value); if (clean) emails.add(clean); };
    (rows || []).forEach(row => add(row?.correo || row?.email));
    add(student?.correoWix);
    const studentId = String(student?.studentId || student?.officialStudentId || student?.id || rows?.find(row => row?.studentId)?.studentId || '').trim();
    if (studentId && window.RIPRepository?.loadStudents) {
      const item = (await window.RIPRepository.loadStudents()).find(row => String(row?.id || row?.studentId || row?.officialStudentId || '').trim() === studentId);
      if (item) add(item.correoWix);
    }
    return emails;
  }

  function renderFichaWixCheck(rows, wixClasses, emails) {
    const body = document.getElementById('fichaWixBody');
    const status = document.getElementById('fichaWixStatus');
    if (!body) return;
    const rip = (rows || []).filter(isClaseRow).map(row => ({ row, date: String(row?.fecha || row?.fechaRaw || '').slice(0, 10), minute: wixMinute(row?.hora) }));
    const used = new Set();
    const result = [];
    // `checkWixClasses` already scopes this list to the resolved contactId.
    (wixClasses || []).forEach(item => {
      const at = wixDateTime(item.inicio);
      const match = rip.findIndex((entry, index) => !used.has(index) && entry.date === at.date && entry.minute >= 0 && at.minute >= 0 && Math.abs(entry.minute - at.minute) <= 30);
      const past = new Date(item.inicio).getTime() < Date.now();
      if (match >= 0) { used.add(match); result.push({ tone: 'success', state: '✓ En RIP y Wix', at: at.label, rip: rip[match].row.servicio || 'Clase', wix: item.servicio || 'Clase Wix' }); }
      else if (past) result.push({ tone: 'warn', state: '⚠ Falta registrar en RIP', at: at.label, rip: '—', wix: item.servicio || 'Clase Wix' });
      else result.push({ tone: 'muted', state: '↗ Próxima clase Wix', at: at.label, rip: '—', wix: item.servicio || 'Clase Wix' });
    });
    rip.forEach((entry, index) => {
      if (used.has(index) || new Date(`${entry.date}T00:00:00`).getTime() >= Date.now()) return;
      result.push({ tone: 'warn', state: '⚠ En RIP, no en Wix', at: `${entry.date} ${entry.row.hora || ''}`.trim(), rip: entry.row.servicio || 'Clase', wix: '—' });
    });
    result.sort((a, b) => a.at.localeCompare(b.at));
    body.innerHTML = result.map(item => `<tr><td><span class="pilltag ${item.tone}">${escapeHTML(item.state)}</span></td><td>${escapeHTML(item.at)}</td><td>${escapeHTML(item.rip)}</td><td>${escapeHTML(item.wix)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty-td">No hay clases comparables para este estudiante.</td></tr>';
    if (status) status.textContent = `${result.length} clase(s) revisadas: ✓ coincide, ⚠ requiere revisión, ↗ próxima en Wix.`;
  }

  function buildFichaWixTableRows(student, rows, wixClasses, emails, resolvedContactId) {
    const display = (rows || []).map(row => ({ ...row }));
    const rip = display.map((row, index) => ({ row, index, date: String(row?.fecha || row?.fechaRaw || '').slice(0, 10), minute: wixMinute(row?.hora) }))
      .filter(item => isClaseRow(item.row));
    const identity = wixIdentity(student, rows, emails, resolvedContactId);
    const used = new Set();
    rip.forEach(entry => {
      const matches = (wixClasses || []).map((item, wixIndex) => ({ item, wixIndex, result: window.RIPWix?.reconcile(entry.row, item, identity) }))
        .filter(x => !used.has(x.wixIndex) && x.result?.state?.startsWith('MATCHED'));
      if (matches.length === 1) {
        const found = matches[0]; used.add(found.wixIndex);
        const present = wixPresentation(found.result, found.item);
        Object.assign(entry.row, { __wixStatus: present.status, __wixTone: present.tone, __wixDetail: present.detail, wixBookingId: found.item.wixBookingId || found.item.id, wixEventId: found.item.wixEventId || '', wixSessionId: found.item.wixSessionId || '', wixServiceId: found.item.wixServiceId || '', wixContactId: found.item.wixContactId || identity.wixContactId || '', wixStatus: found.item.estado || '', wixLastSyncAt: new Date().toISOString() });
      } else if (matches.length > 1) {
        const present = wixPresentation({ state: 'DUPLICATE_MATCH', method: 'más de una reserva coincide con la misma clase RIP' }, matches[0].item);
        Object.assign(entry.row, { __wixStatus: present.status, __wixTone: present.tone, __wixDetail: present.detail });
      }
    });
    (wixClasses || []).forEach((item, wixIndex) => {
      if (used.has(wixIndex)) return;
      const at = wixDateTime(item.inicio), past = new Date(item.inicio).getTime() < Date.now();
      if (past) display.push({ id: `wix-missing-${item.id || item.inicio}`, estudiante: 'Wix', tipo: 'Wix', fecha: at.date, fechaRaw: at.date, hora: at.label.slice(-5), servicio: item.servicio || 'Clase Wix', profesor: 'Wix', pago: '', comentario: item.estado?.includes('CANCEL') ? 'Cancelada en Wix' : 'Falta registrar en RIP', clasif: '', clasifPago: '', movimiento: 0, __wixStatus: item.estado?.includes('CANCEL') ? '🔵 Wix cancelado' : '⚠ Falta en RIP', __wixTone: item.estado?.includes('CANCEL') ? 'muted' : 'warn', __wixDetail: wixPresentation({ method: 'sin clase RIP correspondiente', local: window.RIPWix?.normalizeWixDateTime(item.inicio) }, item).detail });
      else display.push({ id: `wix-future-${item.id || item.inicio}`, estudiante: 'Wix', tipo: 'Wix', fecha: at.date, fechaRaw: at.date, hora: at.label.slice(-5), servicio: item.servicio || 'Clase Wix', profesor: 'Wix', pago: '', comentario: 'Próxima clase Wix', clasif: '', clasifPago: '', movimiento: 0, __wixStatus: '↗ Próxima Wix', __wixTone: 'muted', __wixDetail: 'Disponible para programación' });
    });
    rip.forEach(entry => {
      if (entry.row.__wixStatus || new Date(`${entry.date}T00:00:00`).getTime() >= Date.now()) return;
      const related = (wixClasses || []).find(item => window.RIPWix?.reconcile(entry.row, item, identity)?.state === 'TIME_MISMATCH');
      const present = wixPresentation(related ? { state: 'TIME_MISMATCH', method: 'coincide estudiante/servicio, pero no fecha u hora', local: window.RIPWix?.normalizeWixDateTime(related.inicio) } : { state: window.RIPWix?.mappingForRip(entry.row.servicio) ? 'NOT_FOUND' : 'UNMAPPED_SERVICE' }, related);
      Object.assign(entry.row, { __wixStatus: present.status, __wixTone: present.tone, __wixDetail: present.detail });
    });
    return display.sort((a, b) => (Number(b.fechaTs) || Date.parse(b.fecha || b.fechaRaw) || 0) - (Number(a.fechaTs) || Date.parse(a.fecha || a.fechaRaw) || 0));
  }

  function chooseWixContact(candidates, relatedEmail) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'wix-contact-picker-overlay';
      overlay.innerHTML = `
        <section class="wix-contact-picker" role="dialog" aria-modal="true" aria-labelledby="wixContactPickerTitle">
          <div class="wix-contact-picker-head">
            <div>
              <h3 id="wixContactPickerTitle">Selecciona el contacto Wix</h3>
              <p>El correo <strong>${escapeHTML(relatedEmail || '')}</strong> está relacionado con varios contactos.</p>
            </div>
            <button type="button" class="wix-contact-picker-close" aria-label="Cancelar">×</button>
          </div>
          <div class="wix-contact-picker-list">
            ${(candidates || []).map((item, index) => `
              <button type="button" class="wix-contact-choice" data-wix-choice="${index}">
                <span class="wix-contact-choice-name">${escapeHTML(item.name || 'Sin nombre')}</span>
                <span>${escapeHTML(item.primaryEmail || relatedEmail || 'Sin correo principal')}</span>
                <code>${escapeHTML(item.contactId || '')}</code>
              </button>
            `).join('')}
          </div>
          <button type="button" class="btn ghost wix-contact-picker-cancel">Cancelar</button>
        </section>`;
      const finish = value => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(value);
      };
      const onKeydown = event => { if (event.key === 'Escape') finish(null); };
      document.addEventListener('keydown', onKeydown);
      overlay.querySelectorAll('[data-wix-choice]').forEach(choice => {
        choice.onclick = () => finish(candidates[Number(choice.dataset.wixChoice)] || null);
      });
      overlay.querySelector('.wix-contact-picker-close').onclick = () => finish(null);
      overlay.querySelector('.wix-contact-picker-cancel').onclick = () => finish(null);
      overlay.onclick = event => { if (event.target === overlay) finish(null); };
      document.body.appendChild(overlay);
      overlay.querySelector('[data-wix-choice]')?.focus();
    });
  }

  function wixScheduleSuggestions(wixClasses, scheduledDates) {
    const available = new Map();
    (scheduledDates || []).forEach(value => {
      const date = String(value || '').trim().slice(0, 10);
      if (date) available.set(date, (available.get(date) || 0) + 1);
    });
    return (wixClasses || [])
      .filter(item => {
        const status = String(item?.estado || '').toUpperCase();
        return !status.includes('CANCEL') && !status.includes('REJECT') && !status.includes('DECLIN');
      })
      .map(item => ({ item, at: wixDateTime(item?.inicio) }))
      .filter(entry => entry.at.date && new Date(entry.item.inicio).getTime() >= Date.now())
      .sort((a, b) => String(a.item.inicio).localeCompare(String(b.item.inicio)))
      .filter(entry => {
        const count = available.get(entry.at.date) || 0;
        if (count > 0) {
          available.set(entry.at.date, count - 1);
          return false;
        }
        return true;
      });
  }

  function chooseWixScheduleClasses(suggestions, studentName) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'wix-contact-picker-overlay';
      overlay.innerHTML = `
        <section class="wix-contact-picker wix-schedule-picker" role="dialog" aria-modal="true" aria-labelledby="wixSchedulePickerTitle">
          <div class="wix-contact-picker-head">
            <div>
              <h3 id="wixSchedulePickerTitle">Actualizar Programación</h3>
              <p>Wix tiene clases futuras de <strong>${escapeHTML(studentName || 'este estudiante')}</strong> que aún no aparecen en Programación. Escoge las que quieres incluir.</p>
            </div>
            <button type="button" class="wix-contact-picker-close" aria-label="Cancelar">×</button>
          </div>
          <div class="wix-contact-picker-list">
            ${(suggestions || []).map((entry, index) => `
              <label class="wix-schedule-choice">
                <input type="checkbox" data-wix-schedule-choice="${index}" checked>
                <span>
                  <strong>${escapeHTML(entry.at.date)} · ${escapeHTML(entry.at.label.slice(-5))}</strong>
                  <small>${escapeHTML(entry.item.servicio || 'Clase Wix')}</small>
                </span>
              </label>
            `).join('')}
          </div>
          <div class="wix-schedule-actions">
            <button type="button" class="btn ghost wix-contact-picker-cancel">Ahora no</button>
            <button type="button" class="btn primary wix-schedule-save">Incluir seleccionadas</button>
          </div>
        </section>`;
      const finish = value => {
        document.removeEventListener('keydown', onKeydown);
        overlay.remove();
        resolve(value);
      };
      const onKeydown = event => { if (event.key === 'Escape') finish(null); };
      document.addEventListener('keydown', onKeydown);
      overlay.querySelector('.wix-schedule-save').onclick = () => {
        const selected = [...overlay.querySelectorAll('[data-wix-schedule-choice]:checked')]
          .map(input => suggestions[Number(input.dataset.wixScheduleChoice)])
          .filter(Boolean);
        finish(selected);
      };
      overlay.querySelector('.wix-contact-picker-close').onclick = () => finish(null);
      overlay.querySelector('.wix-contact-picker-cancel').onclick = () => finish(null);
      overlay.onclick = event => { if (event.target === overlay) finish(null); };
      document.body.appendChild(overlay);
      overlay.querySelector('[data-wix-schedule-choice]')?.focus();
    });
  }

  function bindFichaWixCheck(ctx, student, rows) {
    const button = document.getElementById('btnFichaWixCheck');
    const status = ctx?.el?.status;
    if (!button) return;
    button.onclick = async () => {
      const state = ctx?.__fichaState;
      button.disabled = true;
      if (status) status.textContent = 'Consultando clases de Wix…';
      try {
        // La conciliación no debe depender de lecturas/escrituras directas del
        // navegador. El callable resuelve correoWix → contactId en servidor;
        // aquí solo mostramos las reservas que ya devolvió para ese contacto.
        const emails = new Set();
        // RIPCore identifica la ficha seleccionada mediante key. Las filas
        // pueden conservar IDs históricos agrupados bajo esa ficha canónica.
        const studentId = String(student?.canonicalStudentId || student?.studentId || student?.officialStudentId || student?.id || student?.key || rows?.find(row => row?.studentId)?.studentId || '').trim();
        if (!studentId) throw new Error('Esta ficha no tiene un ID de estudiante RIP para resolver su contacto Wix.');
        const env = await window.RIPFirebase.ready;
        const mod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js');
        const checkWix = mod.httpsCallable(mod.getFunctions(env.app, 'us-central1'), 'checkWixClasses');
        let response = await checkWix({ studentId, pastDays: 180, futureDays: 90 });
        if (response.data?.status === 'WIX_CONTACT_AMBIGUOUS') {
          const candidates = response.data.candidates || [];
          const chosen = await chooseWixContact(candidates, response.data.correoWix);
          if (!chosen) {
            if (status) status.textContent = 'Selección de contacto Wix cancelada.';
            return;
          }
          response = await checkWix({ studentId, selectedWixContactId: chosen.contactId, pastDays: 180, futureDays: 90 });
        }
        const displayRows = buildFichaWixTableRows(student, rows, response.data?.classes || [], emails, response.data?.contactId || '');
        renderTable2026(ctx, displayRows, rows);
        const schedule = await window.RIPRepository.loadStudentSchedule(studentId);
        const suggestions = wixScheduleSuggestions(response.data?.classes || [], schedule?.fechas || []);
        let scheduleMessage = '';
        if (suggestions.length) {
          if (status) status.textContent = `${suggestions.length} clase(s) futura(s) de Wix no están en Programación. Escoge cuáles incluir.`;
          const selected = await chooseWixScheduleClasses(suggestions, student?.name || student?.estudiante || rows?.[0]?.estudiante || '');
          if (selected?.length) {
            const selectedDates = selected.map(entry => entry.at.date);
            if (typeof window.RIPRepository.appendScheduleDates === 'function') {
              await window.RIPRepository.appendScheduleDates(studentId, selectedDates);
            } else {
              // Compatibilidad defensiva si una pestaña conservó en memoria
              // el repositorio anterior durante una publicación.
              const latest = await window.RIPRepository.loadStudentSchedule(studentId);
              await window.RIPRepository.saveSchedule(studentId, [...(latest?.fechas || []), ...selectedDates]);
            }
            scheduleMessage = ` Se incluyeron ${selected.length} clase(s) en Programación.`;
            if (state?.prog) state.prog.data = await window.RIPProgramacion?.loadResumen?.();
            await syncProgramacionIfAvailable(ctx, state, student?.name || rows?.[0]?.estudiante || '', '2026');
          } else if (selected) {
            scheduleMessage = ' No se seleccionaron clases para Programación.';
          } else {
            scheduleMessage = ` Hay ${suggestions.length} sugerencia(s) pendientes para Programación.`;
          }
        }
        const saved = response.data?.source === 'cache';
        const diagnostic = response.data?.contactId
          ? ` Contacto Wix: ${response.data.wixContactName || 'sin nombre'} · ${response.data.correoWix || 'sin correo'} · ${response.data.contactId}.`
          : '';
        if (status) status.textContent = (saved
          ? 'Mostrando la consulta guardada de Wix: ✓ coincide · ⚠ requiere revisión · ↗ próxima clase.'
          : 'Consulta de Wix guardada: ✓ coincide · ⚠ requiere revisión · ↗ próxima clase.') + diagnostic + scheduleMessage;
      } catch (err) {
        console.error(err);
        if (status) status.textContent = err?.message || 'No se pudo consultar Wix.';
        toast(ctx?.el?.toastWrap, err?.message || 'No se pudo consultar Wix.', 'warn');
      } finally { button.disabled = false; }
    };
  }

  function renderFichaSummary(ctx, student, ficha, year) {
    const { el } = ctx;
    const rows = ficha?.rows || [];

    setText(el.fichaTitle, 'Ficha · ' + (student ? student.name : 'Estudiante'));
    setText(el.fichaSub, `Registro ${year || '2026'} (solo lectura)`);
    setText(el.fichaStudent, student ? student.name : '—');

    const lastRow = rows[0] || null;
    const lastPago = getLastPagoRow(rows);
    const lastClase = getLastClaseRow(rows);
    const { saldoTotal, items } = buildSaldoBreakdown(rows);
    const pagosStats = getPagosStats(rows);

    setText(el.fichaFecha, lastRow ? (lastRow.fechaRaw || '—') : '—');

    setText(
      el.fichaUltPago,
      lastPago
        ? `${lastPago.fechaRaw || '—'}${lastPago.pago ? ' · ' + lastPago.pago : ''}`
        : '—'
    );

    setText(
      el.fichaProxPago,
      lastClase
        ? `${lastClase.fechaRaw || '—'}${lastClase.servicio ? ' · ' + lastClase.servicio : ''}`
        : '—'
    );
    setText(el.fichaUltPagoValor, pagosStats.lastPagoValor ? fmtMoney(pagosStats.lastPagoValor) : '—');
    setText(el.fichaTotalPagos, pagosStats.totalPagos ? fmtMoney(pagosStats.totalPagos) : '—');
    setText(el.fichaPrimeraVez, primeraVezText(getPrimeraVezForStudent(ctx, student)));

    // Status badge
    if (el.fichaStatusBadge) {
      const parseDate = (raw) => {
        if (!raw) return null;
        const m = String(raw).match(/(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        return null;
      };
      const lastDate = parseDate(lastRow?.fechaRaw);
      const daysSinceLast = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86400000) : null;
      let statusLabel, statusClass;
      if (daysSinceLast === null) {
        statusLabel = 'Sin registro'; statusClass = 'inactivo';
      } else if (daysSinceLast <= 45) {
        statusLabel = 'Activo'; statusClass = 'activo';
      } else if (saldoTotal > 0) {
        statusLabel = 'Activo en pausa'; statusClass = 'pausa';
      } else {
        statusLabel = 'Inactivo'; statusClass = 'inactivo';
      }
      el.fichaStatusBadge.textContent = statusLabel;
      el.fichaStatusBadge.className = `ficha-status-badge ${statusClass}`;
    }

    if (el.fichaSaldosMini) {
      const finalClass = saldoTotal > 0 ? 'pos' : saldoTotal < 0 ? 'neg' : 'zero';
      const finalSign = saldoTotal > 0 ? '+' : '';
      const detailsHTML = (items || []).map((item) => {
        const v = item.value;
        const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
        const sign = v > 0 ? '+' : '';
        const extra = item.count ? ` <b>${item.count}</b>` : ` <b>${sign}${v}</b>`;
        return `<span class="saldo-chip ${cls} ${item.count ? 'warn' : ''}">${escapeHTML(String(item.label || '').trim())}${extra}</span>`;
      }).join('');
      el.fichaSaldosMini.innerHTML = `
        <span class="saldo-chip saldo-final ${finalClass}">Saldo final <b>${finalSign}${saldoTotal}</b></span>
        ${detailsHTML ? `<div class="saldo-modalidades">${detailsHTML}</div>` : ''}
      `;
    }

    renderFichaServicios(ctx, student, rows);
    renderAssociatedIds(ctx, student, rows);
    bindFichaWixCheck(ctx, student, rows);
  }

  function renderSimpleSummary(ctx, studentName, year, rowsSlice) {
    const { el } = ctx;

    setText(el.fichaTitle, 'Ficha · ' + (studentName || 'Estudiante'));
    setText(el.fichaSub, `Registro ${year} (solo lectura)`);

    setText(el.fichaStudent, studentName || '—');

    const firstDate = rowsSlice?.[0]?.[2] || rowsSlice?.[0]?.[1] || '—';
    setText(el.fichaFecha, firstDate || '—');
    setText(el.fichaUltPago, '—');
    setText(el.fichaUltPagoValor, '—');
    setText(el.fichaTotalPagos, '—');
    setText(el.fichaPrimeraVez, '—');
    setText(el.fichaProxPago, '—');

    if (el.fichaSaldosMini) {
      el.fichaSaldosMini.innerHTML = `
        <span class="pill soft">Histórico ${escapeHTML(year)}</span>
      `;
    }
    if (el.fichaServiciosBlock) el.fichaServiciosBlock.innerHTML = '';
    renderAssociatedIds(ctx, { key: ctx?.state?.currentStudentKey || '' }, []);
  }

  async function syncProgramacionIfAvailable(ctx, state, studentName, year) {
    if (!studentName) return;
    if (String(year) !== '2026') return;
    if (!window.RIPProgramacion?.attachStudent) return;

    try {
      show(ctx?.el?.programacionStudentView);
      if (!state?.prog?.data && window.RIPProgramacion?.loadResumen) {
        state.prog = state.prog || {};
        state.prog.data = await window.RIPProgramacion.loadResumen();
      }
      await window.RIPProgramacion.attachStudent(ctx, state, studentName);
    } catch (err) {
      console.warn('No se pudo sincronizar bloque de Programación:', err);
    }
  }

  // =========================
  // Botones dinámicos por año
  // =========================
  function updateLegacyYearButtons(ctx, years, activeYear) {
    const { el } = ctx;

    if (el.btnTop2025) {
      el.btnTop2025.style.display = years.includes('2025') ? '' : 'none';
      el.btnTop2025.textContent = activeYear === '2025' ? '🗂️ Volver 2026' : '🗂️ 2025';
    }

  }

  function renderYearButtons(ctx, state) {
    const host = ensureYearButtonsHost(ctx);
    if (!host) return;

    const entry = getCurrentStudentSearchEntry(state);
    const years = getAvailableYearsForEntry(entry, state);

    updateLegacyYearButtons(ctx, years, state.__viewYear || '2026');

    if (!years.length) {
      host.innerHTML = '';
      return;
    }

    host.innerHTML = years
      .map((year) => {
        const active = String(state.__viewYear || '2026') === String(year);
        return `
          <button
            type="button"
            class="year-chip ${active ? 'active' : ''}"
            data-year="${escapeHTML(year)}"
          >${escapeHTML(year)}</button>
        `;
      })
      .join('');

    host.querySelectorAll('[data-year]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const year = btn.getAttribute('data-year') || '';
        if (!year) return;
        await openStudentYear(ctx, state, year);
      });
    });
  }

  // =========================
  // Abrir años
  // =========================
  async function openStudentYear(ctx, state, year) {
    const y = String(year || '').trim();
    const studentName = state.currentStudentName || '';
    const { el } = ctx;

    if (!y || !studentName) return;
    if (!isCurrentYearAvailable(y, state)) return;

    if (!state.__thead2026HTML) {
      const thead = document.querySelector('#tablaContainer thead');
      state.__thead2026HTML = thead ? thead.innerHTML : '';
    }

    if (y === '2026') {
      state.__viewYear = '2026';
      toggleEditButtons(ctx, !!ctx.__fichaEditMode);

      if (state.currentStudentKey) {
        const student = (state.allStudents || []).find((s) => s.key === state.currentStudentKey);
        const ficha = window.RIPCore.getStudentFicha(state.registro, state.currentStudentKey);

        renderFichaSummary(ctx, student, ficha, '2026');

        const thead = document.querySelector('#tablaContainer thead');
        if (thead && state.__thead2026HTML) thead.innerHTML = state.__thead2026HTML;

        renderTable2026(ctx, ficha.rows || []);
        syncProgramacionIfAvailable(ctx, state, state.currentStudentName, '2026');
      }

      renderYearButtons(ctx, state);
      return;
    }

    try {
      state.__viewYear = y;
      renderYearButtons(ctx, state);

      if (el.btnTop2025) el.btnTop2025.disabled = true;

      setText(el.fichaSub, `Cargando registro ${y}...`);

      const pack = await loadStudentByYear(y, studentName);

      renderSimpleSummary(ctx, studentName, y, pack.rowsSlice);
      setTableHeader(pack.headersSlice);
      setTableBodySimple(pack.rowsSlice, y);
      hide(el.programacionStudentView);
      ctx.__fichaEditMode = false;
      toggleEditButtons(ctx, false);

      renderYearButtons(ctx, state);
    } catch (e) {
      console.error(e);
      toast(el.toastWrap, `No pude cargar ${y}. Revisa que el TSV esté público.`, 'warn');

      state.__viewYear = '2026';
      renderYearButtons(ctx, state);

      if (state.currentStudentKey) {
        openFichaByKey(ctx, state, state.currentStudentKey);
      }
    } finally {
      if (el.btnTop2025) el.btnTop2025.disabled = false;
    }
  }

  // =========================
  // Core: open ficha por key (2026)
  // =========================
  function openFichaByKey(ctx, state, studentKey) {
    const { el } = ctx;
    if (!studentKey) return;

    state.currentStudentKey = studentKey;

    const student = (state.allStudents || []).find((s) => s.key === studentKey);
    state.currentStudentName = student ? student.name : (state.currentStudentName || '');
    state.currentSearchEntry = getSearchEntryByName(state, state.currentStudentName) || student || null;
    state.__viewYear = '2026';
    ctx.__fichaState = state;

    showFichaContainer(ctx);
    resetFichaVisualState(ctx, state);
    bindFichaEditButtons(ctx, state);
    ctx.__fichaEditMode = false;
    ctx.__fichaRowsWorking = null;
    ctx.__fichaRowsBase = null;
    toggleEditButtons(ctx, false);

    show(el.btnPDF);
    show(el.btnClaseEspecial);
    show(el.btnPrimeraVezFicha);
    show(el.btnMergeStudent);
    show(el.btnVolverDash);

    const ficha = RIPCore.getStudentFicha(state.registro, studentKey);
    const rows = ficha.rows || [];

    renderFichaSummary(ctx, student, ficha, '2026');
    renderTable2026(ctx, rows);
    renderYearButtons(ctx, state);

    syncProgramacionIfAvailable(ctx, state, state.currentStudentName, '2026');
  }

  // =========================
  // Core: open desde búsqueda global
  // =========================
  async function openStudentFromSearch(ctx, state, entry) {
    if (!entry || !entry.name) return;

    state.currentSearchEntry = entry;
    state.currentStudentName = entry.name || '';
    state.currentStudentKey = String(entry.currentKey || entry.key || '').trim() || '';
    ctx.__fichaState = state;
    bindFichaEditButtons(ctx, state);

    showFichaContainer(ctx);
    resetFichaVisualState(ctx, state);

    const { el } = ctx;
    show(el.btnPDF);
    show(el.btnClaseEspecial);
    show(el.btnPrimeraVezFicha);
    show(el.btnMergeStudent);
    show(el.btnVolverDash);

    const years = getAvailableYearsForEntry(entry, state);

    if (state.currentStudentKey && years.includes('2026')) {
      openFichaByKey(ctx, state, state.currentStudentKey);
      return;
    }

    const firstHistoricalYear = years.find((y) => y !== '2026') || years[0];
    if (firstHistoricalYear) {
      renderYearButtons(ctx, state);
      await openStudentYear(ctx, state, firstHistoricalYear);
      return;
    }

    toast(el.toastWrap, 'No encontré años disponibles para este estudiante.', 'warn');
  }


  function toEditablePayload(row) {
    return {
      tipo: row.tipo || '',
      estudiante: row.estudiante || '',
      fechaRaw: row.fechaRaw || '',
      hora: row.hora || '',
      servicio: row.servicio || '',
      profesor: row.profesor || '',
      pago: row.pago || '',
      comentario: row.comentario || '',
      clasif: row.clasif || '',
      clasifPago: row.clasifPago || '',
      movimiento: Number(row.movimiento) || 0
    };
  }

  function diffEditablePayload(currentRow, baseRow) {
    const cur = toEditablePayload(currentRow);
    const base = toEditablePayload(baseRow || {});
    const out = {};
    Object.keys(cur).forEach((k) => {
      const a = String(cur[k] ?? '');
      const b = String(base[k] ?? '');
      if (a !== b) out[k] = cur[k];
    });
    return out;
  }

  function cloneRow(row) {
    return { ...row, __isNew: !!row.__isNew, __deleted: !!row.__deleted };
  }

  function getEditableRowKey(row) {
    const id = String(row?.id || '').trim();
    if (id) return 'id:' + id;

    const rn = Number(row?.rowNum || row?.__rowNum || 0);
    if (Number.isFinite(rn) && rn >= 2) return 'row:' + rn;

    const local = String(row?.__localKey || '').trim();
    if (local) return 'local:' + local;

    return '';
  }

  function findEditableRowByKey(rows, key) {
    const k = String(key || '').trim();
    if (!k) return null;
    return (rows || []).find((r) => getEditableRowKey(r) === k) || null;
  }

  function getEditorRowParams(row) {
    const rowId = String(row?.id || '').trim();
    const rowNum = Number(row?.rowNum || row?.__rowNum || 0);
    const params = {};
    if (rowId) params.rowId = rowId;
    if (Number.isFinite(rowNum) && rowNum >= 2) params.rowNum = String(rowNum);
    return params;
  }

  function assertEditableRowReference(row, actionLabel) {
    const params = getEditorRowParams(row);
    if (!params.rowId && !params.rowNum) {
      throw new Error(`${actionLabel}: la fila no tiene ID ni número de fila. Actualiza el registro y revisa la columna ID.`);
    }
    return params;
  }

  function apiCallEditor(params = {}) {
    if (window.RIPRepository) {
      // Firebase solo puede editar/eliminar documentos con ID. Las filas
      // históricas identificadas por rowNum deben continuar por la API del
      // editor de la hoja; enviarlas a Firestore producía un guardado fallido.
      if (params.action === 'editRow' && params.rowId) return window.RIPRepository.updateRegistroRow(params.rowId, JSON.parse(params.data || '{}')).then(() => ({ ok: true }));
      if (params.action === 'addRow') return window.RIPRepository.addRegistroRow(JSON.parse(params.data || '{}')).then((r) => ({ ok: true, newId: r.id }));
      if (params.action === 'deleteRow' && params.rowId) return window.RIPRepository.deleteRegistroRow(params.rowId).then(() => ({ ok: true }));
    }
    if (!EDITOR_API_URL) return Promise.reject(new Error('RIP_EDITOR_API_URL no esta configurada'));
    return new Promise((resolve, reject) => {
      const cb = '__rip_editor_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const url = new URL(EDITOR_API_URL);
      let done = false;
      Object.entries({ ...params, callback: cb }).forEach(([k, v]) => url.searchParams.set(k, String(v)));

      const clean = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        clean();
        reject(new Error('Timeout API edicion'));
      }, 25000);

      window[cb] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        resolve(data);
      };

      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clean();
        reject(new Error('Error conectando API edicion'));
      };

      script.src = url.toString();
      document.body.appendChild(script);
    });
  }

  function toggleEditButtons(ctx, editing) {
    if (ctx?.el?.btnFichaEditMode) ctx.el.btnFichaEditMode.style.display = editing ? 'none' : '';
    if (ctx?.el?.btnFichaSaveEdits) ctx.el.btnFichaSaveEdits.style.display = editing ? '' : 'none';
    if (ctx?.el?.btnFichaCancelEdits) ctx.el.btnFichaCancelEdits.style.display = editing ? '' : 'none';
  }

  function openRowEditModal(row, onSave) {
    const prev = document.getElementById('ripFichaEditModal');
    if (prev) prev.remove();

    const d = toEditablePayload(row);
    const modal = document.createElement('div');
    modal.id = 'ripFichaEditModal';
    modal.className = 'rip-modal-in';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Editar ${escapeHTML(row.id || '')}</span>
          <button class="rip-modal-close" type="button">x</button>
        </div>
        <div class="rip-modal-body">
          <div class="ripedit-grid">
            <label class="ripedit-field"><span class="ripedit-label">Tipo</span><input id="re_tipo" class="control" value="${escapeHTML(d.tipo)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Fecha</span><input id="re_fechaRaw" class="control" value="${escapeHTML(d.fechaRaw)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Hora</span><input id="re_hora" class="control" value="${escapeHTML(d.hora)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Servicio</span><input id="re_servicio" class="control" value="${escapeHTML(d.servicio)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Profesor</span><input id="re_profesor" class="control" value="${escapeHTML(d.profesor)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Pago</span><input id="re_pago" class="control" value="${escapeHTML(d.pago)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Clasificacion</span><input id="re_clasif" class="control" value="${escapeHTML(d.clasif)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Clasif pagos</span><input id="re_clasifPago" class="control" value="${escapeHTML(d.clasifPago)}"></label>
            <label class="ripedit-field"><span class="ripedit-label">Movimiento</span><input id="re_movimiento" class="control" value="${escapeHTML(String(d.movimiento))}"></label>
            <label class="ripedit-field" style="grid-column:1/-1"><span class="ripedit-label">Comentario</span><textarea id="re_comentario" class="control">${escapeHTML(d.comentario)}</textarea></label>
          </div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost" type="button" data-close>Cancelar</button>
          <button class="btn primary" type="button" data-save>Guardar</button>
        </div>
      </div>`;

    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-close]')?.addEventListener('click', close);
    modal.querySelector('[data-save]')?.addEventListener('click', async () => {
      const saveButton = modal.querySelector('[data-save]');
      const originalMovement = Number(row?.movimientoSaldo ?? row?.movimiento) || 0;
      const data = {
        tipo: modal.querySelector('#re_tipo')?.value || '',
        estudiante: row.estudiante || '',
        fechaRaw: modal.querySelector('#re_fechaRaw')?.value || '',
        hora: modal.querySelector('#re_hora')?.value || '',
        servicio: modal.querySelector('#re_servicio')?.value || '',
        profesor: modal.querySelector('#re_profesor')?.value || '',
        pago: modal.querySelector('#re_pago')?.value || '',
        comentario: modal.querySelector('#re_comentario')?.value || '',
        clasif: modal.querySelector('#re_clasif')?.value || '',
        clasifPago: modal.querySelector('#re_clasifPago')?.value || '',
        movimiento: Number(modal.querySelector('#re_movimiento')?.value || 0) || 0
      };
      const movementWasManuallyChanged = data.movimiento !== originalMovement;
      const isPackagePayment = norm(data.tipo) === 'pago' &&
        /(?:\bP\s*|Paquete\s*(?:de\s*)?)\d+/i.test(data.servicio);
      // El valor manual manda. Solo inferimos desde el nombre del paquete
      // cuando la persona no modificó expresamente el campo Movimiento.
      if (isPackagePayment && !movementWasManuallyChanged && window.RIPCalculations?.computeMovimiento) {
        data.movimiento = window.RIPCalculations.computeMovimiento({
          ...data,
          movimiento: 0,
          movimientoSaldo: 0
        });
      }
      data.movimientoSaldo = data.movimiento;
      try {
        if (saveButton) {
          saveButton.disabled = true;
          saveButton.textContent = 'Guardando…';
        }
        await onSave(data);
        close();
      } catch (err) {
        console.error(err);
        if (saveButton) {
          saveButton.disabled = false;
          saveButton.textContent = 'Guardar';
        }
        const message = err?.message || String(err || 'No se pudo guardar');
        window.alert?.('No se pudo guardar: ' + message);
      }
    });

    document.body.appendChild(modal);
  }

  function refreshEditableFicha(ctx, state) {
    const rows = (ctx.__fichaRowsWorking || []).filter((r) => !r.__deleted);
    const student = (state.allStudents || []).find((s) => s.key === state.currentStudentKey) || null;
    renderFichaSummary(ctx, student, { rows }, '2026');
    renderTable2026(ctx, rows);
  }

  function bindEditRowActions(ctx) {
    const tbody = ctx?.el?.tableBody;
    if (!tbody || tbody.__fichaEditBound) return;
    tbody.__fichaEditBound = true;

    tbody.addEventListener('click', (ev) => {
      const editBtn = ev.target.closest('[data-edit-row]');
      const dupBtn = ev.target.closest('[data-dup-row]');
      const delBtn = ev.target.closest('[data-del-row]');
      const key = editBtn?.getAttribute('data-edit-row') || dupBtn?.getAttribute('data-dup-row') || delBtn?.getAttribute('data-del-row');
      if (!key) return;

      const rows = ctx.__fichaRowsWorking || [];
      const row = findEditableRowByKey(rows, key);
      if (!row) return;
      const state = ctx.__fichaState;

      if (editBtn) {
        openRowEditModal(row, async (data) => {
          Object.assign(row, data);
          refreshEditableFicha(ctx, state);
          const pending = (ctx.__fichaRowsWorking || []).filter(item => {
            const base = findEditableRowByKey(ctx.__fichaRowsBase || [], getEditableRowKey(item));
            return base && Object.keys(diffEditablePayload(item, base)).length > 0;
          }).length;
          if (ctx.el.btnFichaSaveEdits) ctx.el.btnFichaSaveEdits.textContent = `💾 Guardar cambios (${pending})`;
          toast(ctx.el.toastWrap, 'Cambio pendiente. Guarda todos los cambios al final.', 'info');
        });
        return;
      }

      if (dupBtn) {
        const copy = cloneRow(row);
        copy.id = 'LOCAL-' + Date.now() + '-' + Math.random().toString(36).slice(2, 5);
        delete copy.rowNum;
        delete copy.__rowNum;
        copy.__localKey = copy.id;
        copy.__isNew = true;
        rows.unshift(copy);
        refreshEditableFicha(ctx, state);
        return;
      }

      if (delBtn) {
        if (!confirm('¿Eliminar esta clase del registro?')) return;
        row.__deleted = true;
        refreshEditableFicha(ctx, state);
      }
    });
  }

  async function saveEditChanges(ctx, state) {
    const rows = (ctx.__fichaRowsWorking || []).map(cloneRow);
    const baseMap = new Map((ctx.__fichaRowsBase || []).map((r) => [getEditableRowKey(r), r]));

    const created = rows.filter((r) => r.__isNew && !r.__deleted);
    const updated = rows
      .filter((r) => !r.__isNew && !r.__deleted)
      .map((r) => {
        const base = baseMap.get(getEditableRowKey(r)) || {};
        const changes = diffEditablePayload(r, base);
        return { row: r, changes };
      })
      .filter((x) => Object.keys(x.changes).length > 0);
    const deleted = (ctx.__fichaRowsBase || [])
      .filter((r) => !rows.find((x) => getEditableRowKey(x) === getEditableRowKey(r) && !x.__deleted))
      .sort((a, b) => Number(b.rowNum || b.__rowNum || 0) - Number(a.rowNum || a.__rowNum || 0));

    for (const u of updated) {
      const rowRef = assertEditableRowReference(u.row, 'Editar');
      const res = await apiCallEditor({
        action: 'editRow',
        ...rowRef,
        data: JSON.stringify(u.changes)
      });
      if (!res?.ok) throw new Error(res?.error || ('Error editando ' + (u.row.id || u.row.rowNum || 'fila')));
    }

    for (const r of created) {
      const res = await apiCallEditor({ action: 'addRow', data: JSON.stringify(toEditablePayload(r)) });
      if (!res?.ok) throw new Error(res?.error || 'Error duplicando fila');
      if (res?.newId) r.id = res.newId;
      if (res?.rowNum) {
        r.rowNum = Number(res.rowNum) || r.rowNum;
        r.__rowNum = Number(res.rowNum) || r.__rowNum;
      }
      delete r.__localKey;
      r.__isNew = false;
    }

    for (const r of deleted) {
      const rowRef = assertEditableRowReference(r, 'Eliminar');
      const res = await apiCallEditor({ action: 'deleteRow', ...rowRef });
      if (!res?.ok) throw new Error(res?.error || ('Error eliminando ' + (r.id || r.rowNum || 'fila')));
    }

    const cleaned = rows.filter((r) => !r.__deleted).map((r) => {
      const x = cloneRow(r);
      delete x.__isNew;
      delete x.__deleted;
      return x;
    });

    // En una ficha de revisión pueden coexistir varios IDs para el mismo
    // nombre. Reemplazar por estudianteKey dejaba duplicadas o borraba filas
    // ajenas; se reemplazan únicamente las filas que se estaban editando.
    const editedIds = new Set((ctx.__fichaRowsBase || []).map(r => String(r?.id || '')).filter(Boolean));
    const others = (state.registro || []).filter((r) => !editedIds.has(String(r?.id || '')));
    state.registro = window.RIPCalculations?.markDuplicateClasses ? window.RIPCalculations.markDuplicateClasses(others.concat(cleaned)) : others.concat(cleaned);

    ctx.__fichaRowsBase = cleaned.map(cloneRow);
    ctx.__fichaRowsWorking = cleaned.map(cloneRow);
    ctx.__fichaEditMode = false;
    toggleEditButtons(ctx, false);
    if (ctx.el.btnFichaSaveEdits) ctx.el.btnFichaSaveEdits.textContent = '💾 Guardar cambios';

    // Evita que una fila eliminada reaparezca por caché local después de guardar.
    try { window.RIPCore?.clearCaches?.(); } catch (_) {}
    try { window.RIPApp?.clearAppCaches?.(); } catch (_) {}

    refreshEditableFicha(ctx, state);
    toast(ctx.el.toastWrap, 'Cambios guardados', 'ok');
  }

  async function deleteDuplicateReviewRows(ctx, state) {
    const ficha = RIPCore.getStudentFicha(state.registro || [], state.currentStudentKey);
    const rows = (ficha.rows || []).filter(r => r?.duplicateReview);
    const deletable = rows.filter(r => String(r?.id || '').trim());
    const missingId = rows.length - deletable.length;
    if (!rows.length) {
      toast(ctx.el.toastWrap, 'No hay duplicadas por eliminar.', 'info');
      return;
    }
    const msg = `Se eliminaran ${deletable.length} clase(s) duplicada(s).${missingId ? ` ${missingId} no tienen ID y quedan para revision manual.` : ''} �Continuar?`;
    if (!deletable.length || !confirm(msg)) return;
    toast(ctx.el.toastWrap, 'Eliminando duplicadas...', 'info');
    for (const row of deletable) {
      const rowRef = assertEditableRowReference(row, 'Eliminar duplicada');
      const res = await apiCallEditor({ action: 'deleteRow', ...rowRef });
      if (!res?.ok) throw new Error(res?.error || ('Error eliminando ' + (row.id || row.rowNum || 'fila')));
    }
    const deletedIds = new Set(deletable.map(r => String(r.id)));
    state.registro = (state.registro || []).filter(r => !deletedIds.has(String(r.id)));
    state.registro = window.RIPCalculations?.markDuplicateClasses ? window.RIPCalculations.markDuplicateClasses(state.registro) : state.registro;
    try { window.RIPCore?.clearCaches?.(); } catch (_) {}
    try { window.RIPApp?.clearAppCaches?.(); } catch (_) {}
    refreshEditableFicha(ctx, state);
    toast(ctx.el.toastWrap, `Duplicadas eliminadas: ${deletable.length}`, 'ok');
  }

  function getMergeCandidateStudents(state, targetKey) {
    const byKey = new Map();
    const push = (name, key) => {
      const cleanName = String(name || '').trim();
      const cleanKey = String(key || norm(cleanName)).trim();
      if (!cleanName || !cleanKey || cleanKey === targetKey) return;
      if (!byKey.has(cleanKey)) byKey.set(cleanKey, { name: cleanName, key: cleanKey, count: 0, saldo: 0 });
    };
    (state.allStudents || []).forEach((s) => push(s.name || s.estudiante, s.key || s.studentId || s.canonicalStudentId || s.id || s.nameKey));
    (state.registro || []).forEach((r) => push(r.estudiante, r.groupKey || r.studentId || r.canonicalStudentId || r.estudianteKey));
    (state.searchStudents || []).forEach((s) => push(s.name || s.estudiante, s.currentKey || s.key));
    for (const row of state.registro || []) {
      const key = String(row?.groupKey || row?.studentId || row?.canonicalStudentId || row?.estudianteKey || '').trim();
      const candidate = byKey.get(key);
      if (!candidate) continue;
      candidate.count += 1;
      candidate.saldo += Number(row?.movimientoSaldo ?? row?.movimiento) || 0;
    }
    return Array.from(byKey.values()).map((candidate) => {
      const signedSaldo = `${candidate.saldo > 0 ? '+' : ''}${candidate.saldo}`;
      const shortKey = candidate.key.length > 12 ? `${candidate.key.slice(0, 6)}…${candidate.key.slice(-4)}` : candidate.key;
      return {
        ...candidate,
        label: `${candidate.name} · saldo ${signedSaldo} · ${candidate.count} mov. · ${shortKey}`
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es') || a.key.localeCompare(b.key));
  }

  function openMergeStudentModal(ctx, state) {
    const targetKey = String(state.currentStudentKey || '').trim();
    const targetName = String(state.currentStudentName || '').trim();
    if (!targetKey || !targetName) {
      toast(ctx.el.toastWrap, 'Primero selecciona el contacto que quieres conservar.', 'warn');
      return;
    }
    if (!window.RIPRepository?.mergeStudents) {
      toast(ctx.el.toastWrap, 'La fusion de contactos no esta disponible.', 'warn');
      return;
    }

    const prev = document.getElementById('ripMergeStudentModal');
    if (prev) prev.remove();

    const candidates = getMergeCandidateStudents(state, targetKey);
    const options = candidates
      .map((s) => `<option value="${escapeHTML(s.label)}" data-key="${escapeHTML(s.key)}"></option>`)
      .join('');

    const modal = document.createElement('div');
    modal.id = 'ripMergeStudentModal';
    modal.className = 'rip-modal-in';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Fusionar contacto</span>
          <button class="rip-modal-close" type="button">x</button>
        </div>
        <div class="rip-modal-body">
          <div class="empty-td" style="text-align:left;margin-bottom:12px">
            Se conservara <strong>${escapeHTML(targetName)}</strong>. El contacto que elijas abajo se movera a esta ficha.
          </div>
          <label class="ripedit-field">
            <span class="ripedit-label">Contacto duplicado</span>
            <input id="mergeSourceStudent" class="control" list="mergeStudentOptions" placeholder="Escribe el otro nombre">
            <datalist id="mergeStudentOptions">${options}</datalist>
          </label>
          <div class="empty-td" style="text-align:left;margin-top:12px">
            Esto fusiona clases, pagos, pagos B2C, primera vez y programacion. Al final queda solo el contacto conservado.
          </div>
        </div>
        <div class="rip-modal-foot">
          <span class="status" id="mergeStudentStatus">Listo.</span>
          <button class="btn ghost" type="button" data-close>Cancelar</button>
          <button class="btn primary" type="button" data-merge>Fusionar</button>
        </div>
      </div>`;

    const close = () => modal.remove();
    const setStatus = (msg) => {
      const el = modal.querySelector('#mergeStudentStatus');
      if (el) el.textContent = msg;
    };
    const resolveSource = () => {
      const raw = String(modal.querySelector('#mergeSourceStudent')?.value || '').trim();
      const key = norm(raw);
      const exact = candidates.find((s) => s.key === raw || norm(s.label) === key);
      if (exact) return exact;
      const sameName = candidates.filter((s) => norm(s.name) === key);
      return sameName.length === 1 ? sameName[0] : null;
    };

    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-close]')?.addEventListener('click', close);
    modal.querySelector('[data-merge]')?.addEventListener('click', async () => {
      const source = resolveSource();
      if (!source?.key || source.key === targetKey) {
        toast(ctx.el.toastWrap, 'Elige un contacto duplicado diferente.', 'warn');
        return;
      }
      const btn = modal.querySelector('[data-merge]');
      if (btn) btn.disabled = true;

      // Previsualización sin escrituras: cuántos documentos se moverán y si
      // la fusión une dos identidades canónicas distintas (requiere doble
      // confirmación explícita).
      let preview = null;
      try {
        setStatus('Calculando previsualización...');
        preview = await window.RIPRepository.previewMergeStudents?.(source.key, targetKey, targetName);
      } catch (previewErr) {
        setStatus('No se pudo previsualizar.');
        toast(ctx.el.toastWrap, previewErr?.message || 'No se pudo previsualizar la fusión.', 'warn');
        if (btn) btn.disabled = false;
        return;
      }

      const counts = preview?.counts || {};
      const warnText = (preview?.warnings || []).length ? `\n\n${preview.warnings.join('\n')}` : '';
      const msg = `Fusionar "${source.name}" dentro de "${targetName}"?\n` +
        `Se moverán: ${counts.registro || 0} registro(s), ${counts.primeraVez || 0} primera(s) vez, ` +
        `${counts.programacion || 0} programación(es).${warnText}`;
      if (!confirm(msg)) {
        setStatus('Fusión cancelada.');
        if (btn) btn.disabled = false;
        return;
      }
      let confirmDistinctCanonical = false;
      if (preview?.requiresExplicitConfirmation) {
        confirmDistinctCanonical = confirm(
          'CONFIRMACIÓN ADICIONAL: origen y destino son DOS estudiantes con identidad oficial distinta. ' +
          '¿Seguro que son la misma persona y quieres fusionarlos?'
        );
        if (!confirmDistinctCanonical) {
          setStatus('Fusión cancelada.');
          if (btn) btn.disabled = false;
          return;
        }
      }

      setStatus('Fusionando...');
      try {
        const result = await window.RIPRepository.mergeStudents(source.key, targetKey, targetName, { confirmDistinctCanonical });
        const [registro, students, programacion, primeraVez] = await Promise.all([
          window.RIPRepository.loadRegistro(),
          window.RIPRepository.loadStudents(),
          window.RIPRepository.loadProgramacion(),
          window.RIPRepository.loadPrimeraVez ? window.RIPRepository.loadPrimeraVez() : Promise.resolve(state.primeraVez || [])
        ]);
        state.registro = registro;
        state.allStudents = (students || [])
          .filter((s) => !(s.legacyAliasOf || s.mergedInto || s.mergedIntoStudentId))
          .map((s) => ({
          ...s,
          name: s.name || s.estudiante || s.id,
          key: s.studentId || s.canonicalStudentId || s.id || s.nameKey
          }));
        state.programacion = programacion;
        state.primeraVez = primeraVez;
        try { window.RIPCore?.clearCaches?.(); } catch (_) {}
        try { window.RIPApp?.clearAppCaches?.(); } catch (_) {}
        close();
        openFichaByKey(ctx, state, targetKey);
        const total = result?.summary?.registro || 0;
        toast(ctx.el.toastWrap, `Contacto fusionado. ${total} registro(s) movidos.`, 'success');
      } catch (err) {
        console.error(err);
        setStatus('No se pudo fusionar.');
        toast(ctx.el.toastWrap, err?.message || 'No se pudo fusionar el contacto.', 'warn');
      } finally {
        if (btn) btn.disabled = false;
      }
    });

    document.body.appendChild(modal);
  }
  function bindFichaEditButtons(ctx, state) {
    if (ctx.__fichaEditButtonsBound) return;
    ctx.__fichaEditButtonsBound = true;

    ctx.el.btnFichaEditMode?.addEventListener('click', () => {
      if (String(state.__viewYear || '2026') !== '2026') {
        toast(ctx.el.toastWrap, 'Solo puedes editar 2026.', 'warn');
        return;
      }
      const ficha = RIPCore.getStudentFicha(state.registro, state.currentStudentKey);
      const rows = (ficha.rows || []).map(cloneRow);
      ctx.__fichaRowsBase = rows.map(cloneRow);
      ctx.__fichaRowsWorking = rows.map(cloneRow);
      ctx.__fichaEditMode = true;
      toggleEditButtons(ctx, true);
      refreshEditableFicha(ctx, state);
    });

    ctx.el.btnFichaCancelEdits?.addEventListener('click', () => {
      ctx.__fichaEditMode = false;
      ctx.__fichaRowsWorking = (ctx.__fichaRowsBase || []).map(cloneRow);
      toggleEditButtons(ctx, false);
      refreshEditableFicha(ctx, state);
    });

    ctx.el.btnFichaSaveEdits?.addEventListener('click', async () => {
      try {
        await saveEditChanges(ctx, state);
      } catch (err) {
        console.error(err);
        toast(ctx.el.toastWrap, 'No se pudo guardar: ' + (err.message || err), 'warn');
      }
    });

    ctx.el.btnFichaDeleteDuplicates?.addEventListener('click', async () => {
      try {
        await deleteDuplicateReviewRows(ctx, state);
      } catch (err) {
        console.error(err);
        toast(ctx.el.toastWrap, 'No se pudieron eliminar duplicadas: ' + (err.message || err), 'warn');
      }
    });

    ctx.el.btnMergeStudent?.addEventListener('click', () => {
      openMergeStudentModal(ctx, state);
    });
  }  // =========================
  // Export
  // =========================
  RIPUI.ficha = {
    openFichaByKey,
    openStudentFromSearch,
    openStudentYear,
    loadStudentByYear,
    preloadHistoricalYear: getParsedYearTSV,
    renderTable2026,
    refreshYearButtons: renderYearButtons,
    // Limpia caches en memoria y TSV para el refresh nuclear
    clearCaches() {
      historyCache.clear();
      tsvYearCache.clear();
    }
  };
})();




