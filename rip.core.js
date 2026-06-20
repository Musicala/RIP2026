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
    TSV_REGISTRO_URL: '',

    // TSV parámetros (Col A estudiante, Col F clasificación => índice 5)
    TSV_PARAMS_URL: '',

    // Cache TTL (ms) — 0 = siempre recarga desde red
    CACHE_TTL_MS: 0,

    // LocalStorage keys
    CACHE_KEYS: {
      registroFast: 'rip2026_cache_registro_fast_v1',
      registro: 'rip2026_cache_registro_v2',
      params: 'rip2026_cache_params_v2',
      meta: 'rip2026_cache_meta_v2'
    },
    HIST_LAST_CLASS_TSV_URLS: {}
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
  const MS_DAY = 24 * 60 * 60 * 1000;
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const findHeaderByAliases = (headers, aliases = []) => {
    if (!Array.isArray(headers) || !headers.length) return '';
    const aliasSet = new Set((aliases || []).map((x) => norm(x)));
    if (!aliasSet.size) return '';
    return headers.find((h) => aliasSet.has(norm(h))) || '';
  };

  const getValueByHeaderOrIndex = (rowObj, headers, headerName, fallbackIndex = -1) => {
    if (headerName && Object.prototype.hasOwnProperty.call(rowObj, headerName)) {
      return rowObj[headerName] || '';
    }
    if (fallbackIndex >= 0 && fallbackIndex < (headers?.length || 0)) {
      const h = headers[fallbackIndex];
      return (h && Object.prototype.hasOwnProperty.call(rowObj, h)) ? (rowObj[h] || '') : '';
    }
    return '';
  };

  // Fecha: soporta ISO, dd/mm/yyyy, yyyy-mm-dd, etc.
  const parseDate = (s) => {
  const raw = String(s ?? '').trim();
  if (!raw) return null;

  // 1) PRIORIDAD TOTAL: formato día/mes/año
  // soporta dd/mm/aa, dd/mm/aaaa, dd-mm-aa, dd-mm-aaaa
  let m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);

    if (yy < 100) yy += 2000;

    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yy, mm - 1, dd);
      // validación real de fecha
      if (
        d.getFullYear() === yy &&
        d.getMonth() === mm - 1 &&
        d.getDate() === dd
      ) {
        return d;
      }
    }
  }

  // 2) ISO real: yyyy-mm-dd
  m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const yy = Number(m[1]);
    const mm = Number(m[2]);
    const dd = Number(m[3]);

    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const d = new Date(yy, mm - 1, dd);
      if (
        d.getFullYear() === yy &&
        d.getMonth() === mm - 1 &&
        d.getDate() === dd
      ) {
        return d;
      }
    }
  }

  // 3) Último intento solo para formatos largos tipo:
  // "Wed Mar 12 2026 ..." o similares no ambiguos
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  return null;
};

  const fmtMoney = (n) => {
    const v = Number(n) || 0;
    return v.toLocaleString('es-CO', { maximumFractionDigits: 0 });
  };

  const hasText = (v) => String(v || '').trim().length > 0;
  const test = (txt, re) => re.test(String(txt || ''));
  const isTrialText = (servicioRaw, comentarioRaw = '') => /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/i.test(norm(`${servicioRaw || ''} ${comentarioRaw || ''}`));
  const isTrialCPText = (servicioRaw, comentarioRaw = '', clasifRaw = '', clasifPagoRaw = '') => {
    const txt = norm(`${servicioRaw || ''} ${comentarioRaw || ''} ${clasifRaw || ''} ${clasifPagoRaw || ''}`);
    return /\bcp\b/i.test(txt) && /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/i.test(txt);
  };
  const isCourtesyText = (servicioRaw, comentarioRaw = '') => /\b(cortesia|gratis|obsequio)\b/i.test(norm(`${servicioRaw || ''} ${comentarioRaw || ''}`));
  const isTrialOrCourtesyText = (servicioRaw, comentarioRaw = '') => isTrialText(servicioRaw, comentarioRaw) || isCourtesyText(servicioRaw, comentarioRaw);
  const classifyMovimiento = (tipoRaw, servicioRaw, pagoRaw, clasifRaw, clasifPagoRaw, comentarioRaw = '') => {
    const tipo = String(tipoRaw || '').trim();
    const servicio = String(servicioRaw || '').trim();
    const pago = String(pagoRaw || '').trim();
    const clasif = String(clasifRaw || '').trim();
    const clasifPago = String(clasifPagoRaw || '').trim();
    if (clasif) return { clasifAuto: clasif, clasifPagoAuto: clasifPago || '' };
    if (/^multa$/i.test(tipo)) return { clasifAuto: 'Multa', clasifPagoAuto: '' };
    const isPago = /^pago$/i.test(tipo) || (!/^clase$/i.test(tipo) && hasText(pago));
    const s = servicio;
    if (isTrialCPText(servicio, comentarioRaw, clasif, clasifPago)) return { clasifAuto: 'CP de Clase de prueba', clasifPagoAuto: isPago ? 'CP de Clase de prueba' : '' };
    if (isCourtesyCCText(servicio, comentarioRaw, clasif, clasifPago)) return { clasifAuto: 'CC de Clase de cortesia', clasifPagoAuto: isPago ? 'CC de Clase de cortesia' : '' };
    if (isTrialText(servicio, comentarioRaw)) return { clasifAuto: 'Prueba', clasifPagoAuto: isPago ? 'Prueba' : '' };
    if (isCourtesyText(servicio, comentarioRaw)) return { clasifAuto: 'Cortesia', clasifPagoAuto: isPago ? 'Cortesia' : '' };
    if (isPago) {
      if (test(s, /Musifamiliar/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'MF' };
      if (test(s, /Ensamble/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'Ensamble' };
      if (test(s, /vacacional/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'TV' };
      if (!s) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'Pago' };
      if (test(s, /matr[i�]cula/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'Pago' };
      if (test(s, /virtual.*personalizado|personalizado.*virtual/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'MV P' };
      if (test(s, /hogar.*personalizado|personalizado.*hogar/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'MH P' };
      if (test(s, /sede.*personalizado|personalizado.*sede/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'MS P' };
      if (test(s, /sede.*grupal|grupal.*sede/i)) return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'MS G' };
      return { clasifAuto: 'Pago', clasifPagoAuto: clasifPago || 'Pago' };
    }
    if (test(s, /Musifamiliar/i)) return { clasifAuto: 'MF', clasifPagoAuto: '' };
    if (test(s, /Ensamble/i)) return { clasifAuto: 'Ensamble', clasifPagoAuto: '' };
    if (test(s, /FSA/i)) return { clasifAuto: 'FSA', clasifPagoAuto: '' };
    if (test(s, /OpenHouse|Taller/i)) return { clasifAuto: 'Taller', clasifPagoAuto: '' };
    if (test(s, /vacacional/i)) return { clasifAuto: 'TV', clasifPagoAuto: '' };
    if (test(s, /spaces/i)) return { clasifAuto: 'Spaces', clasifPagoAuto: '' };
    if (test(s, /musigym/i)) return { clasifAuto: 'MG', clasifPagoAuto: '' };
    if (test(s, /\bcf\b/i)) return { clasifAuto: 'CF', clasifPagoAuto: '' };
    if (test(s, /\bmv\b/i)) return { clasifAuto: 'MV P', clasifPagoAuto: '' };
    if (test(s, /\bmh\b/i)) return { clasifAuto: 'MH P', clasifPagoAuto: '' };
    if (test(s, /musi/i) && !test(s, /personalizada/i)) return { clasifAuto: 'MS G', clasifPagoAuto: '' };
    if (test(s, /\bms\b/i)) return { clasifAuto: 'MS P', clasifPagoAuto: '' };
    return { clasifAuto: 'No clasificado', clasifPagoAuto: '' };
  };
  const computeMovimiento = (tipoRaw, servicioRaw, comentarioRaw, existingMovRaw) => {
    const tipo = String(tipoRaw || '').trim();
    const servicio = String(servicioRaw || '').trim();
    const comentario = String(comentarioRaw || '').trim();
    const existing = Number(existingMovRaw);
    if (/^pago$/i.test(tipo) && isTrialCPText(servicio, comentario)) return 1;
    if (/^pago$/i.test(tipo) && isCourtesyCCText(servicio, comentario)) return 1;
    if (/^clase$/i.test(tipo) && isTrialCPText(servicio, comentario)) return -1;
    if (/^clase$/i.test(tipo) && isCourtesyCCText(servicio, comentario)) return -1;
    if (/^clase$/i.test(tipo) && isTrialOrCourtesyText(servicio, comentario)) return 0;
    if (Number.isFinite(existing) && existing !== 0) return existing;
    if (isCourtesyText(servicio, comentario)) return 0;
    if (/^clase$/i.test(tipo)) return -1;
    if (/^pago$/i.test(tipo)) {
      if (isTrialText(servicio, comentario) || /\bindividual\b/i.test(servicio)) return 1;
      if (/\bCP\b/i.test(servicio)) return 1;
      const m = servicio.match(/(?:\bP\s*|Paquete\s*(?:de\s*)?)(\d+)/i);
      return m ? (Number(m[1]) || 0) : 0;
    }
    return 0;
  };
  const classifyByDaysSinceLastClass = (days, forceActivo = false) => {
    if (forceActivo) return 'Activo';
    if (!Number.isFinite(days)) return 'Inactivo sin info';
    if (days < 8) return 'Activo';
    if (days < 15) return 'Activo no registro (8–15 días)';
    if (days <= 30) return 'Activo En pausa (15–30 días)';
    if (days <= 90) return 'Inactivo en pausa (1–3 meses)';
    if (days <= 180) return 'Inactivo lejano (3–6 meses)';
    if (days <= 365) return 'Inactivo extendido (6–12 meses)';
    if (days <= 730) return 'Inactivo histórico (12–24 meses)';
    return 'Exestudiante (+24 meses)';
  };

  const classifyFinalByFormula = (days, manualClasif = '') => {
    if (norm(manualClasif) === 'activo') return 'Activo';
    if (!Number.isFinite(days)) return 'Inactivo sin info';
    if (days < 8) return 'Activo';
    if (days < 15) return 'Activo no registro (8-15 dias)';
    if (days <= 30) return 'Activo En pausa (15-30 dias)';
    if (days <= 90) return 'Inactivo en pausa (1-3 meses)';
    if (days <= 180) return 'Inactivo lejano (3-6 meses)';
    if (days <= 365) return 'Inactivo extendido (6-12 meses)';
    if (days <= 730) return 'Inactivo historico (12-24 meses)';
    return 'Exestudiante (+24 meses)';
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
  const HIST_COLMAP = {
    "2023": { fecha: 1, nombre: 2 },
    "2024": { fecha: 4, nombre: 3 },
    "2025": { fecha: 4, nombre: 3 }
  };
  const histLastClassCache = new Map(); // year -> Map(studentKey -> lastTs)

  function buildFirebasePack(registro, students, programacion, computed) {
    const paramsMap = new Map();
    const set = new Map();
    for (const s of students || []) {
      const key = s.nameKey || s.key || norm(s.name);
      if (key) set.set(key, s.name || key);
      if (s.estadoManual || s.paramClasif) paramsMap.set(key, s.estadoManual || s.paramClasif);
    }
    for (const r of registro || []) {
      if (r.estudianteKey) set.set(r.estudianteKey, r.estudiante);
    }
    for (const p of programacion || []) {
      const key = p.estudianteKey || p.studentId || norm(p.estudiante || p.name);
      const name = String(p.estudiante || p.name || '').trim();
      if (key) set.set(key, name || set.get(key) || key);
    }

    const lastClassTsByStudent = new Map();
    for (const r of registro || []) {
      if (!r?.estudianteKey) continue;
      const tipo = norm(r?.tipo || '');
      if (tipo !== 'clase') continue;
      const ts = Number(r?.fechaTs) || 0;
      if (!ts) continue;
      const prev = Number(lastClassTsByStudent.get(r.estudianteKey)) || 0;
      if (ts > prev) lastClassTsByStudent.set(r.estudianteKey, ts);
    }
    const today = startOfDay(new Date());
    const computedMap = new Map((computed || []).map(c => [c.studentId || c.id, c]));
    const allStudents = Array.from(set.entries()).map(([key, name]) => {
      const c = computedMap.get(key) || {};
      const paramClasif = paramsMap.get(key) || '';
      const lastTs = Number(lastClassTsByStudent.get(key)) || (c.ultimaClase ? Number(parseDate(c.ultimaClase)?.getTime()) || 0 : 0);
      const lastDate = lastTs ? startOfDay(new Date(lastTs)) : null;
      const daysSince = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / MS_DAY) : NaN;
      const finalClasif = classifyFinalByFormula(daysSince, paramClasif);
      return {
        key,
        name,
        paramClasif,
        finalClasif,
        lastClassTs: lastTs,
        daysSinceLastClass: daysSince,
        saldo: Number(c.saldo) || 0,
        computed: c
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return {
      registro,
      allStudents,
      searchStudents: allStudents,
      paramsMap,
      programacion: { dashboard: buildProgramacionDashboard(programacion, allStudents, registro), today: new Date().toISOString().slice(0, 10) },
      computed,
      meta: { source: 'firebase' }
    };
  }

  function buildProgramacionDashboard(programacion, allStudents, registro) {
    const calc = window.RIPCalculations;
    const schedules = new Map((programacion || []).map(p => [p.estudianteKey || p.studentId || norm(p.estudiante), p]));
    const rowsByStudent = new Map();
    for (const row of registro || []) {
      const key = row?.estudianteKey || norm(row?.estudiante);
      if (!key) continue;
      if (!rowsByStudent.has(key)) rowsByStudent.set(key, []);
      rowsByStudent.get(key).push(row);
    }
    const today = new Date().toISOString().slice(0, 10);
    return (allStudents || []).map((s) => {
      const sch = schedules.get(s.key) || {};
      const fechas = Array.isArray(sch.fechas) ? sch.fechas : [];
      const limit = calc?.getStudentClassLimit ? calc.getStudentClassLimit(rowsByStudent.get(s.key) || []) : 24;
      const status = calc?.calculateProgramacionStatus
        ? calc.calculateProgramacionStatus(fechas, today, limit)
        : { status: 'Sin programacion', futureCount: 0, nextClassDate: '' };
      return {
        name: s.name,
        estado: status.status,
        fechas,
        filled: fechas.filter(Boolean).length,
        limit,
        nextISO: status.nextClassDate || '',
        futureCount: status.futureCount || 0,
        noSchedule: status.status === 'Sin programacion' || status.status === 'Sin programación',
        lowFuture: status.status === 'Pocas futuras' || status.status === 'Por completar',
        complete: status.status === 'OK'
      };
    });
  }

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

  const parseLegacyDMYToTs = (s) => {
    const raw = String(s || '').trim();
    if (!raw) return 0;
    let m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
    if (m) {
      let yy = Number(m[3]); if (yy < 100) yy += 2000;
      const d = new Date(yy, Number(m[2]) - 1, Number(m[1]));
      return Number.isNaN(d.getTime()) ? 0 : d.getTime();
    }
    const d = parseDate(raw);
    return d ? d.getTime() : 0;
  };

  const getHistoricLastClassMap = async (year) => {
    const y = String(year || '');
    if (histLastClassCache.has(y)) return histLastClassCache.get(y);
    const url = RIPCore.CONFIG.HIST_LAST_CLASS_TSV_URLS[y];
    const cm = HIST_COLMAP[y];
    if (!url || !cm) return new Map();

    const txt = await fetchText(url);
    const lines = String(txt || '').replace(/\r/g, '').split('\n').filter(Boolean);
    const rows = lines.map((l) => l.split('\t'));
    rows.shift();

    const out = new Map();
    rows.forEach((r) => {
      const name = String(r[cm.nombre] || '').trim();
      if (!name) return;
      const ts = parseLegacyDMYToTs(r[cm.fecha] || '');
      if (!ts) return;
      const k = norm(name);
      const prev = Number(out.get(k)) || 0;
      if (ts > prev) out.set(k, ts);
    });
    histLastClassCache.set(y, out);
    return out;
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
      COLS.comentario
    ];

    const missing = need.filter((h) => !headers.includes(h));
    if (missing.length) {
      throw new Error(`TSV Registro no coincide. Faltan columnas: ${missing.join(', ')}`);
    }
    // NOTA: clasif/movimiento/clasifPago pueden variar por nombre o posición
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
    if (window.RIPRepository?.loadRegistro) {
      const rows = await window.RIPRepository.loadRegistro();
      const set = new Map();
      for (const r of rows) if (r.estudianteKey) set.set(r.estudianteKey, r.estudiante);
      return {
        rows,
        allStudents: Array.from(set.entries()).map(([key, name]) => ({ key, name, paramClasif: '' })).sort((a, b) => a.name.localeCompare(b.name, 'es'))
      };
    }
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
      COLS.comentario
    ];
    const missing = need.filter((h) => !parsed.headers.includes(h));
    if (missing.length) {
      throw new Error(`TSV Registro no coincide. Faltan columnas: ${missing.join(', ')}`);
    }

    const HAS_ID = parsed.headers.includes(COLS.id);
    const clasifHeader =
      findHeaderByAliases(parsed.headers, [COLS.clasif, 'Clasificacion', 'Clasificación final', 'Clasificacion final']) ||
      parsed.headers[10] || '';
    const movHeader =
      findHeaderByAliases(parsed.headers, [COLS.movimiento, 'Movimientos', 'Saldo movimiento']) ||
      parsed.headers[11] || '';

    const rows = parsed.rows.map((r, rowIndex) => {
      const sheetRow = rowIndex + 2;
      const estudiante = r[COLS.estudiante] || '';
      const clasifRaw = getValueByHeaderOrIndex(r, parsed.headers, clasifHeader, 10);
      const movRaw = getValueByHeaderOrIndex(r, parsed.headers, movHeader, 11);
      const movimiento = computeMovimiento(r[COLS.tipo], r[COLS.servicio], r[COLS.comentario], safeNum(movRaw));
      const auto = classifyMovimiento(r[COLS.tipo], r[COLS.servicio], r[COLS.pago], clasifRaw, '', r[COLS.comentario]);
      return {
        id: HAS_ID ? (r[COLS.id] || '') : '',
        rowNum: sheetRow,
        __rowNum: sheetRow,
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
        clasif: auto.clasifAuto || '',
        clasifPago: auto.clasifPagoAuto || '',
        movimiento
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

RIPCore.loadAll = async ({ force = false, includeHistorical = false } = {}) => {
    if (window.RIPRepository?.loadRegistro) {
      const [registro, students, programacion, computed] = await Promise.all([
        window.RIPRepository.loadRegistro(),
        window.RIPRepository.loadStudents(),
        window.RIPRepository.loadProgramacion(),
        window.RIPRepository.loadComputed()
      ]);
      return buildFirebasePack(registro, students, programacion, computed);
    }
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

      const clasifHeader =
        findHeaderByAliases(parsed.headers, [COLS.clasif, 'Clasificacion', 'Clasificación final', 'Clasificacion final']) ||
        parsed.headers[10] || '';
      const movHeader =
        findHeaderByAliases(parsed.headers, [COLS.movimiento, 'Movimientos', 'Saldo movimiento']) ||
        parsed.headers[11] || '';
      const clasifPagoHeader = findHeaderByAliases(parsed.headers, [COLS.clasifPago, 'Clasificacion de pagos']);

      const HAS_MOV = !!movHeader;
      const HAS_CLASIF_PAGO = !!clasifPagoHeader;

      // Normaliza y añade computados
      const rows = parsed.rows.map((r, rowIndex) => {
        const sheetRow = rowIndex + 2;
        const estudiante = r[COLS.estudiante] || '';
        const d = parseDate(r[COLS.fecha]);
        const movRaw = HAS_MOV
          ? safeNum(getValueByHeaderOrIndex(r, parsed.headers, movHeader, 11))
          : 0;
        const movimiento = computeMovimiento(r[COLS.tipo], r[COLS.servicio], r[COLS.comentario], movRaw);
        const clasifRaw = getValueByHeaderOrIndex(r, parsed.headers, clasifHeader, 10);
        const clasifPagoRaw = HAS_CLASIF_PAGO
          ? getValueByHeaderOrIndex(r, parsed.headers, clasifPagoHeader, -1)
          : '';
        const auto = classifyMovimiento(r[COLS.tipo], r[COLS.servicio], r[COLS.pago], clasifRaw, clasifPagoRaw, r[COLS.comentario]);

        return {
          raw: r,
          id: r[COLS.id] || '',
          rowNum: sheetRow,
          __rowNum: sheetRow,
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
          clasif: auto.clasifAuto || '',
          clasifPago: auto.clasifPagoAuto || '',
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
    let paramsMap = paramsPack.map || new Map();
    if (!(paramsMap instanceof Map)) {
      const rebuilt = new Map();
      const srcRows = Array.isArray(paramsPack.rows) ? paramsPack.rows : [];
      srcRows.forEach((p) => {
        const k = norm(p?.student || '');
        if (k) rebuilt.set(k, p?.clasif || '');
      });
      paramsMap = rebuilt;
    }

    // Todos los estudiantes únicos del registro, ordenados
    const set = new Map(); // key -> display
    for (const r of registro) {
      if (r.estudianteKey) set.set(r.estudianteKey, r.estudiante);
    }
    const lastClassTsByStudent = new Map();
    for (const r of registro) {
      if (!r?.estudianteKey) continue;
      const tipo = norm(r?.tipo || '');
      const isClase = (tipo === 'clase') || (tipo !== 'pago' && !String(r?.pago || '').trim());
      if (!isClase) continue;
      const ts = Number(r?.fechaTs) || 0;
      if (!ts) continue;
      const prev = Number(lastClassTsByStudent.get(r.estudianteKey)) || 0;
      if (ts > prev) lastClassTsByStudent.set(r.estudianteKey, ts);
    }

    const today = startOfDay(new Date());
    const no2026ClassKeys = includeHistorical
      ? Array.from(set.keys()).filter((k) => !lastClassTsByStudent.get(k))
      : [];
    let histMerged = new Map();
    if (no2026ClassKeys.length) {
      const maps = await Promise.all([
        getHistoricLastClassMap('2025').catch(() => new Map()),
        getHistoricLastClassMap('2024').catch(() => new Map()),
        getHistoricLastClassMap('2023').catch(() => new Map())
      ]);
      maps.forEach((m) => {
        m.forEach((ts, k) => {
          const prev = Number(histMerged.get(k)) || 0;
          if (ts > prev) histMerged.set(k, ts);
        });
      });
    }
    const allStudents = Array.from(set.entries())
      .map(([k, name]) => {
        const paramClasif = getParamLabel(paramsMap.get(k)) || '';
        const lastTs = Number(lastClassTsByStudent.get(k)) || Number(histMerged.get(k)) || 0;
        const lastDate = lastTs ? startOfDay(new Date(lastTs)) : null;
        const daysSince = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / MS_DAY) : NaN;
        const finalClasif = classifyFinalByFormula(daysSince, paramClasif);
        return { key: k, name, paramClasif, finalClasif, lastClassTs: lastTs || 0, daysSinceLastClass: daysSince };
      })
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
      if (!s.finalClasif && Number.isFinite(Number(s.daysSinceLastClass))) {
        s.finalClasif = classifyFinalByFormula(Number(s.daysSinceLastClass), s.paramClasif || '');
      }
      const c = norm(s.finalClasif || s.paramClasif || '');

      // ✅ Activos netos: SOLO "Activo"
      if (c === 'activo') {
        groups.activosNetos.push(s);
        continue;
      }

      // 🟡 Por revisar: "Activo no registro (8–15 días)" y "Activo En pausa (15–30 días)"
      if (c.startsWith('activo no registro') || c.startsWith('activo en pausa')) {
        groups.porRevisar.push(s);
        continue;
      }

      // ⚫ Inactivos: todos los que empiezan por "Inactivo" + "Exestudiante"
      if (c.startsWith('inactivo') || c.startsWith('exestudiante')) {
        groups.inactivos.push(s);
        continue;
      }

      // fallback: que no se pierdan por rarezas
      groups.inactivos.push(s);
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

  function isInactiveStudent(student) {
    const c = norm(student?.finalClasif || student?.paramClasif || '');
    return c.startsWith('inactivo') || c.startsWith('exestudiante');
  }

  function sortByActiveRecent(a, b) {
    const ai = isInactiveStudent(a) ? 1 : 0;
    const bi = isInactiveStudent(b) ? 1 : 0;
    if (ai !== bi) return ai - bi;
    const at = Number(a?.lastClassTs) || 0;
    const bt = Number(b?.lastClassTs) || 0;
    if (at !== bt) return bt - at;
    return String(a?.name || '').localeCompare(String(b?.name || ''), 'es');
  }

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
    cats.seAcabo.sort(sortByActiveRecent);

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
    estudianteKey,
    profesores,
    tipo,
    serviciosSet,
    fromTs,
    toTs
  } = filters || {};

  return registro.filter((r) => {
    if (estudianteKey && r.estudianteKey !== estudianteKey) return false;

    if (profesores && norm(r.profesor) !== norm(profesores)) return false;

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

    // Fecha robusta: si no existe fechaTs, la calcula desde fechaRaw
    let rowTs = Number(r.fechaTs) || 0;
    if (!rowTs && r.fechaRaw) {
      const d = parseDate(r.fechaRaw);
      rowTs = d ? d.getTime() : 0;
      r.fechaTs = rowTs; // cachea en memoria para próximas vueltas
    }

    if (fromTs && (!rowTs || rowTs < fromTs)) return false;
    if (toTs && (!rowTs || rowTs > toTs)) return false;

    return true;
  });
};

  // Limpiar todos los cachés en memoria y almacenamiento
  RIPCore.clearCaches = () => {
    histLastClassCache.clear();
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('rip2026_')) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    try {
      const skeys = [];
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k) skeys.push(k);
      }
      skeys.forEach(k => sessionStorage.removeItem(k));
    } catch (_) {}
  };

  // Exports
  RIPCore.COL_LABELS = COLS;
  RIPCore.util = { norm, safeNum, parseDate, fmtMoney, clamp };

  window.RIPCore = RIPCore;
})();
