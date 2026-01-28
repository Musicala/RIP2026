/* =============================================================================
  rip.core.js — RIP 2026 Core (READ-ONLY) — FIX “Desde la C”
  - Carga TSV con fetch (cache: no-store) + cache local TTL
  - Parse TSV robusto
  - Mapeo Estudiante -> Clasificación(param) usando Col F (índice 5) del TSV_PARAMS
  - Filtros, KPIs, dashboards, pivots
  - Exporta window.RIPCore

  Ajustes para tu caso:
  - "Clase" (col C) es TIPO (clase/pago), NO el nombre del estudiante
  - Estudiante está en header "Estudiantes" (col D)
  - TSV Registro NO incluye "Movimiento" ni "Clasificación de pagos" → se vuelven opcionales (movimiento=0)
============================================================================= */
(function () {
  'use strict';

  const RIPCore = {};

  // =========================
  // Config (ajusta URLs)
  // =========================
  RIPCore.CONFIG = {
    // TSV principal (Registro 2026 desde columna C ya publicado)
    TSV_REGISTRO_URL:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vREJFkqvhXwjBNPCQXTg4pHXUplygJU1ZZG6-xgOeAJ2ifnEMHmuoDJKwQIpxVfGfCrmfmNCS_8RHTc/pub?gid=1810443337&single=true&output=tsv',

    // TSV parámetros (Col A estudiante, Col F clasificación => índice 5)
    TSV_PARAMS_URL:
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vREJFkqvhXwjBNPCQXTg4pHXUplygJU1ZZG6-xgOeAJ2ifnEMHmuoDJKwQIpxVfGfCrmfmNCS_8RHTc/pub?gid=745458333&single=true&output=tsv',

    // Cache TTL (ms)
    CACHE_TTL_MS: 1000 * 60 * 8, // 8 min

    // LocalStorage keys
    CACHE_KEYS: {
      registroFast: 'rip2026_cache_registro_fast_v1',
      registro: 'rip2026_cache_registro_v2',
      params: 'rip2026_cache_params_v2',
      meta: 'rip2026_cache_meta_v2'
    }
  };

  // =========================
  // Utilidades base
  // =========================
  const norm = (s) =>
    String(s ?? '')
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const getParamLabel = (v) => (typeof v === 'string' ? v : (v && v.label) ? v.label : '');
  const safeNum = (v) => {
    if (v === null || v === undefined) return 0;
    const s = String(v).trim();
    if (!s) return 0;
    // soporta "1.234,56" y "1234.56"
    const cleaned = s
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  // Fecha: soporta ISO, dd/mm/yyyy, yyyy-mm-dd, etc.
  const parseDate = (s) => {
    const raw = String(s ?? '').trim();
    if (!raw) return null;

    // ISO o yyyy-mm-dd
    const iso = Date.parse(raw);
    if (!Number.isNaN(iso)) return new Date(iso);

    // dd/mm/yyyy o dd-mm-yyyy
    const m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]) - 1;
      const yy = Number(m[3].length === 2 ? '20' + m[3] : m[3]);
      const d = new Date(yy, mm, dd);
      if (!Number.isNaN(d.getTime())) return d;
    }
    return null;
  };

  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  };

  // TSV parser robusto (publicado suele venir plano)
  const parseTSV = (text) => {
    const lines = String(text ?? '')
      .replace(/\r/g, '')
      .split('\n')
      .filter((l) => l.trim().length);

    if (!lines.length) return { headers: [], rows: [] };

    const headers = lines[0].split('\t').map((h) => h.trim());
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split('\t');
      const row = {};
      for (let c = 0; c < headers.length; c++) {
        row[headers[c]] = (parts[c] ?? '').trim();
      }
      rows.push(row);
    }
    return { headers, rows };
  };

  // =========================
  // Cache local TTL
  // =========================
  const now = () => Date.now();

  const readCacheMeta = () => {
    try {
      return JSON.parse(localStorage.getItem(RIPCore.CONFIG.CACHE_KEYS.meta) || '{}');
    } catch {
      return {};
    }
  };

  const writeCacheMeta = (meta) => {
    try {
      localStorage.setItem(RIPCore.CONFIG.CACHE_KEYS.meta, JSON.stringify(meta || {}));
    } catch {}
  };

  const isFresh = (stamp) => {
    if (!stamp) return false;
    return now() - stamp < RIPCore.CONFIG.CACHE_TTL_MS;
  };

  const readCache = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const writeCache = (key, val) => {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch {}
  };

  // =========================
  // Fetch TSV con no-store
  // =========================
  const fetchText = async (url) => {
    if (!url) throw new Error('Falta URL TSV en RIPCore.CONFIG');
    const res = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (!res.ok) throw new Error(`No pude cargar TSV (${res.status})`);
    return await res.text();
  };

  // =========================
  // Modelo de columnas (según TU TSV desde C)
  // =========================
  const COLS = {
    // Header real: "Clase" pero tú lo estás usando como TIPO (Clase/Pago)
    tipo: 'Clase',

    // Header real: "Estudiantes" (col D)
    estudiante: 'Estudiantes',

    fecha: 'Fecha',
    servicio: 'Servicio',
    hora: 'Hora',
    profesor: 'Profesor',
    pago: 'Pago',
    comentario: 'Comentario',
    id: 'ID',
    clasif: 'Clasificación',

    // Opcionales (tu TSV desde C NO los trae hoy)
    clasifPago: 'Clasificación de pagos',
    movimiento: 'Movimiento'
  };

  // =========================
  // Validación de headers (mínimo viable)
  // =========================
  const validateHeaders = (headers) => {
    const need = [
      COLS.tipo,
      COLS.estudiante,
      COLS.fecha,
      COLS.servicio,
      COLS.hora,
      COLS.profesor,
      COLS.pago,
      COLS.comentario,      COLS.clasif
    ];

    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error(`TSV Registro no coincide. Faltan columnas: ${missing.join(', ')}`);
    }
    // NOTA: movimiento y clasifPago son opcionales
  };

  // =========================
  // Load principal: registro + params
  // =========================
  
  // =========================
  // Carga RÁPIDA (solo para filtrar y ver registro de estudiantes)
  // - No calcula pivots/saldos/dashboards
  // - Cache propia (registroFast) para mostrar casi instantáneo
  // =========================
  RIPCore.loadRegistroFast = async ({ force = false } = {}) => {
    const meta = readCacheMeta();
    const canUseCache = !force;

    if (canUseCache && isFresh(meta.registroFastStamp)) {
      const fastPack = readCache(RIPCore.CONFIG.CACHE_KEYS.registroFast);
      if (fastPack && Array.isArray(fastPack.rows)) return fastPack;
    }

    const t = await fetchText(RIPCore.CONFIG.TSV_REGISTRO_URL);
    const parsed = parseTSV(t);

    // Validación mínima (NO exige ID)
    const need = [
      COLS.tipo,
      COLS.estudiante,
      COLS.fecha,
      COLS.servicio,
      COLS.hora,
      COLS.profesor,
      COLS.pago,
      COLS.comentario,
      COLS.clasif
    ];
    const missing = need.filter((h) => !parsed.headers.includes(h));
    if (missing.length) {
      throw new Error(`TSV Registro no coincide. Faltan columnas: ${missing.join(', ')}`);
    }

    const HAS_ID = parsed.headers.includes(COLS.id);
    const rows = parsed.rows.map((r) => {
      const estudiante = r[COLS.estudiante] || '';
      return {
        id: HAS_ID ? (r[COLS.id] || '') : '',
        estudiante,
        estudianteKey: norm(estudiante),
        fechaRaw: r[COLS.fecha] || '',
        fechaTs: 0,
        servicio: r[COLS.servicio] || '',
        hora: r[COLS.hora] || '',
        profesor: r[COLS.profesor] || '',
        tipo: r[COLS.tipo] || '',
        pago: r[COLS.pago] || '',
        comentario: r[COLS.comentario] || '',
        clasif: r[COLS.clasif] || '',
        clasifPago: '',
        movimiento: 0
      };
    });

    const map = new Map();
    for (const r of rows) if (r.estudianteKey) map.set(r.estudianteKey, r.estudiante);

    const allStudents = Array.from(map.entries())
      .map(([key, name]) => ({ key, name, paramClasif: '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const fastPack = { rows, allStudents };
    writeCache(RIPCore.CONFIG.CACHE_KEYS.registroFast, fastPack);
    meta.registroFastStamp = now();
    writeCacheMeta(meta);

    return fastPack;
  };

RIPCore.loadAll = async ({ force = false } = {}) => {
    const meta = readCacheMeta();
    const canUseCache = !force;

    // Registro
    let registroPack = null;
    if (canUseCache && isFresh(meta.registroStamp)) {
      registroPack = readCache(RIPCore.CONFIG.CACHE_KEYS.registro);
    }

    // Params
    let paramsPack = null;
    if (canUseCache && isFresh(meta.paramsStamp)) {
      paramsPack = readCache(RIPCore.CONFIG.CACHE_KEYS.params);
    }

    // Fetch si no hay cache
    if (!registroPack) {
      const t = await fetchText(RIPCore.CONFIG.TSV_REGISTRO_URL);
      const parsed = parseTSV(t);

      validateHeaders(parsed.headers);

      const HAS_MOV = parsed.headers.includes(COLS.movimiento);
      const HAS_CLASIF_PAGO = parsed.headers.includes(COLS.clasifPago);

      // Normaliza y añade computados
      const rows = parsed.rows.map((r) => {
        const estudiante = r[COLS.estudiante] || '';
        const d = parseDate(r[COLS.fecha]);
        const movimiento = HAS_MOV ? safeNum(r[COLS.movimiento]) : 0;

        return {
          raw: r,
          id: r[COLS.id] || '',
          estudiante,
          estudianteKey: norm(estudiante),
          fechaRaw: r[COLS.fecha] || '',
          fechaObj: d,
          fechaTs: d ? d.getTime() : 0,
          servicio: r[COLS.servicio] || '',
          servicioKey: norm(r[COLS.servicio] || ''),
          hora: r[COLS.hora] || '',
          profesor: r[COLS.profesor] || '',
          profesorKey: norm(r[COLS.profesor] || ''),

          // “tipo” viene del header "Clase" (col C)
          tipo: r[COLS.tipo] || '',

          pago: r[COLS.pago] || '',
          comentario: r[COLS.comentario] || '',
          clasif: r[COLS.clasif] || '',
          clasifPago: HAS_CLASIF_PAGO ? (r[COLS.clasifPago] || '') : '',
          movimiento
        };
      });

      registroPack = { rows };
      writeCache(RIPCore.CONFIG.CACHE_KEYS.registro, registroPack);
      meta.registroStamp = now();
      writeCacheMeta(meta);
    }

    if (!paramsPack) {
      const t = await fetchText(RIPCore.CONFIG.TSV_PARAMS_URL);

      // Params: Col A estudiante, Col F índice 5 clasificación
      const lines = String(t ?? '')
        .replace(/\r/g, '')
        .split('\n')
        .filter((l) => l.trim().length);

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split('\t');
        const student = (parts[0] ?? '').trim();
        const clasif = (parts[5] ?? '').trim(); // F = index 5
        if (student) rows.push({ student, clasif });
      }

      // map
      const map = new Map();
      rows.forEach((p) => {
        map.set(norm(p.student), p.clasif || '');
      });

      paramsPack = { rows, map };
      writeCache(RIPCore.CONFIG.CACHE_KEYS.params, paramsPack);
      meta.paramsStamp = now();
      writeCacheMeta(meta);
    }

    // Derivados
    const registro = registroPack.rows || [];
    const paramsMap = paramsPack.map || new Map();

    // Todos los estudiantes únicos del registro, ordenados
    const set = new Map(); // key -> display
    for (const r of registro) {
      if (r.estudianteKey) set.set(r.estudianteKey, r.estudiante);
    }
    const allStudents = Array.from(set.entries())
      .map(([k, name]) => ({ key: k, name, paramClasif: getParamLabel(paramsMap.get(k)) || '' }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      registro,
      paramsMap,
      allStudents,
      meta: readCacheMeta()
    };
  };

  // =========================
  // Dashboards
  // =========================
  RIPCore.buildClasificacionDashboard = (students) => {
    const groups = {
      activosNetos: [],
      porRevisar: [],
      inactivos: []
    };

    for (const s of students) {
      const c = norm(s.paramClasif);

      const isActivo = c.includes('activo') && !c.includes('inactivo');
      const isRevisar = c.includes('pausa') || c.includes('no registro');

      if (isActivo) groups.activosNetos.push(s);
      else if (isRevisar) groups.porRevisar.push(s);
      else groups.inactivos.push(s);
    }

    return groups;
  };

  RIPCore.sumMovimientoByStudent = (registro) => {
    const sums = new Map(); // key -> sum
    for (const r of registro) {
      if (!r.estudianteKey) continue;
      sums.set(r.estudianteKey, (sums.get(r.estudianteKey) || 0) + (r.movimiento || 0));
    }
    return sums;
  };

  RIPCore.buildSaldosDashboard = (students, registro) => {
    const sums = RIPCore.sumMovimientoByStudent(registro);
    const cats = {
      deben: [],
      seAcabo: [],
      lesDebemos: []
    };

    for (const s of students) {
      const total = sums.get(s.key) || 0;
      const item = { ...s, saldo: total };

      if (total < 0) cats.deben.push(item);
      else if (total === 0) cats.seAcabo.push(item);
      else cats.lesDebemos.push(item);
    }

    // Orden: por magnitud (los más urgentes arriba)
    cats.deben.sort((a, b) => a.saldo - b.saldo);
    cats.lesDebemos.sort((a, b) => b.saldo - a.saldo);
    cats.seAcabo.sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return cats;
  };

  // =========================
  // Ficha estudiante: saldo + pivots + rows
  // =========================
  RIPCore.getStudentFicha = (registro, studentKey) => {
    // Lazy compute fechaTs para fast-pack (solo para este estudiante)
    const subset = registro.filter((r) => r.estudianteKey === studentKey);
    for (const r of subset) {
      if (!r.fechaTs) {
        const d = parseDate(r.fechaRaw);
        r.fechaTs = d ? d.getTime() : 0;
      }
    }
    const rows = subset.sort((a, b) => (b.fechaTs || 0) - (a.fechaTs || 0));

    const saldo = rows.reduce((acc, r) => acc + (r.movimiento || 0), 0);

    // pivot por (Clasificación, Clasificación de pagos)
    const pivot = new Map(); // "a||b" -> sum
    for (const r of rows) {
      const a = (r.clasif || '').trim() || 'Sin clasificar';
      const b = (r.clasifPago || '').trim() || 'Sin clasif. pago';
      const k = `${a}||${b}`;
      pivot.set(k, (pivot.get(k) || 0) + (r.movimiento || 0));
    }

    const pivotItems = Array.from(pivot.entries())
      .map(([k, sum]) => {
        const [a, b] = k.split('||');
        return { a, b, sum };
      })
      .sort((x, y) => Math.abs(y.sum) - Math.abs(x.sum));

    return { saldo, pivotItems, rows };
  };

  // =========================
  // Filtros de tabla
  // =========================
  RIPCore.applyFilters = (registro, filters) => {
    const {
      estudianteKey, // exact match
      profesores, // string o ''
      tipo, // 'all'|'clase'|'pago'
      serviciosSet, // Set(norm(serv))
      fromTs, // number|0
      toTs // number|0 (inclusive)
    } = filters || {};

    return registro.filter((r) => {
      if (estudianteKey && r.estudianteKey !== estudianteKey) return false;

      if (profesores && norm(r.profesor) !== norm(profesores)) return false;

      // Si tu TSV usa COLS.tipo (“Clase”) como tipo literal, úsalo aquí
      // Si no, caemos al heurístico viejo usando campos pago (y listo).
      if (tipo === 'clase') {
        const t = norm(r.tipo);
        const isClase = t ? t.includes('clase') : !String(r.pago || '').trim();
        if (!isClase) return false;
      } else if (tipo === 'pago') {
        const t = norm(r.tipo);
        const isPago = t ? t.includes('pago') : !!String(r.pago || '').trim();
        if (!isPago) return false;
      }

      if (serviciosSet && serviciosSet.size) {
        if (!serviciosSet.has(r.servicioKey)) return false;
      }

      if (fromTs) {
        if (!r.fechaTs || r.fechaTs < fromTs) return false;
      }
      if (toTs) {
        if (!r.fechaTs || r.fechaTs > toTs) return false;
      }

      return true;
    });
  };

  // Exports
  RIPCore.COL_LABELS = COLS;
  RIPCore.util = { norm, safeNum, parseDate, fmtMoney, clamp };

  window.RIPCore = RIPCore;
})();
