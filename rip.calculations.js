/* global window */
(function () {
  'use strict';

  function norm(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function safeNum(value) {
    if (value === null || value === undefined) return 0;
    const clean = String(value)
      .trim()
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(/,/g, '.')
      .replace(/[^\d.-]/g, '');
    const n = Number(clean);
    return Number.isFinite(n) ? n : 0;
  }

  function parseDate(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    let m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
    if (m) {
      const dd = Number(m[1]);
      const mm = Number(m[2]);
      let yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }
    m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      const yy = Number(m[1]);
      const mm = Number(m[2]);
      const dd = Number(m[3]);
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function toISODate(value) {
    const d = value instanceof Date ? value : parseDate(value);
    if (!d) return '';
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function computeMovimiento(row) {
    const tipo = norm(row?.tipo);
    const servicio = String(row?.servicio || '');
    const comentario = norm(row?.comentario);
    if (isTrialCP(row) && tipo === 'pago') return 1;
    if (isCourtesyCC(row) && tipo === 'pago') return 1;
    if (isTrialCP(row) && tipo === 'clase') return -1;
    if (isCourtesyCC(row) && tipo === 'clase') return -1;
    if (isTrialOrCourtesy(row) && tipo === 'clase') return 0;
    if (isCourtesy(row)) return 0;
    if (tipo === 'clase') return -1;
    if (tipo === 'pago') {
      if (/\bME\b/i.test(servicio)) return 0;
      if (/\b(prueba|individual)\b/i.test(servicio)) return 1;
      if (/\bCP\b/i.test(servicio)) return 1;
      const match = servicio.match(/(?:\bP\s*|Paquete\s*(?:de\s*)?)(\d+)/i);
      if (match) return Number(match[1]) || 0;
      const pago = safeNum(row?.pago || row?.valorPago);
      if (pago > 0 && pago < 10) return pago;
      return 0;
    }
    return 0;
  }

  function classifyMovimiento(row) {
    const tipo = norm(row?.tipo);
    const servicio = String(row?.servicio || '');
    const s = norm(servicio);
    if (isTrialCP(row)) return { clasif: 'CP de Clase de prueba', clasifPago: tipo === 'pago' ? 'CP de Clase de prueba' : '' };
    if (isCourtesyCC(row)) return { clasif: 'CC de Clase de cortesia', clasifPago: tipo === 'pago' ? 'CC de Clase de cortesia' : '' };
    if (isTrial(row)) return { clasif: 'Prueba', clasifPago: tipo === 'pago' ? 'Prueba' : '' };
    if (isCourtesy(row)) return { clasif: 'Cortesia', clasifPago: tipo === 'pago' ? 'Cortesia' : '' };
    if (tipo === 'pago') {
      if (s.includes('musifamiliar')) return { clasif: 'Pago', clasifPago: 'MF' };
      if (s.includes('ensamble')) return { clasif: 'Pago', clasifPago: 'Ensamble' };
      if (s.includes('vacacional')) return { clasif: 'Pago', clasifPago: 'TV' };
      if (/\bme\b/i.test(servicio)) return { clasif: 'Pago', clasifPago: 'Matricula' };
      if (s.includes('matricula')) return { clasif: 'Pago', clasifPago: 'Pago' };
      if (s.includes('virtual') && s.includes('personalizado')) return { clasif: 'Pago', clasifPago: 'MV P' };
      if (s.includes('hogar') && s.includes('personalizado')) return { clasif: 'Pago', clasifPago: 'MH P' };
      if (s.includes('sede') && s.includes('personalizado')) return { clasif: 'Pago', clasifPago: 'MS P' };
      if (s.includes('sede') && s.includes('grupal')) return { clasif: 'Pago', clasifPago: 'MS G' };
      return { clasif: 'Pago', clasifPago: 'Pago' };
    }
    if (tipo === 'multa') return { clasif: 'Multa', clasifPago: '' };
    if (s.includes('musifamiliar')) return { clasif: 'MF', clasifPago: '' };
    if (s.includes('ensamble')) return { clasif: 'Ensamble', clasifPago: '' };
    if (s.includes('fsa')) return { clasif: 'FSA', clasifPago: '' };
    if (/openhouse|taller/i.test(servicio)) return { clasif: 'Taller', clasifPago: '' };
    if (s.includes('vacacional')) return { clasif: 'TV', clasifPago: '' };
    if (s.includes('spaces')) return { clasif: 'Spaces', clasifPago: '' };
    if (s.includes('musigym')) return { clasif: 'MG', clasifPago: '' };
    if (/\bcf\b/i.test(servicio)) return { clasif: 'CF', clasifPago: '' };
    if (/\bmv\b/i.test(servicio)) return { clasif: 'MV P', clasifPago: '' };
    if (/\bmh\b/i.test(servicio)) return { clasif: 'MH P', clasifPago: '' };
    if (s.includes('musi') && !s.includes('personalizada')) return { clasif: 'MS G', clasifPago: '' };
    if (/\bms\b/i.test(servicio)) return { clasif: 'MS P', clasifPago: '' };
    return { clasif: 'No clasificado', clasifPago: '' };
  }

  function buildClassUniqueId(row) {
    if (norm(row?.tipo) !== 'clase') return '';
    return [row?.fecha || row?.fechaRaw || '', norm(row?.servicio), norm(row?.hora), norm(row?.profesor)].join('|');
  }

  function buildDuplicateClassKey(row) {
    if (norm(row?.tipo) !== 'clase') return '';
    return [
      norm(row?.estudianteKey || row?.estudiante),
      norm(row?.fecha || row?.fechaRaw),
      norm(row?.hora),
      norm(row?.profesor)
    ].join('|');
  }

  function buildDuplicateClassKeyFromData(data) {
    const base = {
      ...data,
      estudianteKey: data?.estudianteKey || norm(data?.estudiante),
      fecha: data?.fecha || data?.fechaRaw,
      fechaRaw: data?.fechaRaw || data?.fecha
    };
    return buildDuplicateClassKey(base);
  }

  function isTrialCP(row) {
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''} ${row?.clasif || ''} ${row?.clasifPago || ''}`);
    return /\bcp\b/.test(txt) && /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/.test(txt);
  }

  function isCourtesyCC(row) {
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''} ${row?.clasif || ''} ${row?.clasifPago || ''}`);
    return /\bcc\b/.test(txt) && /\b(cortesia|gratis|obsequio)\b/.test(txt);
  }

  function isTrial(row) {
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''}`);
    return /\b(prueba|clase de prueba|trial|diagnostico|diagnostica)\b/.test(txt);
  }

  function isCourtesy(row) {
    const txt = norm(`${row?.servicio || ''} ${row?.comentario || ''}`);
    return /\b(cortesia|cortesía|gratis|obsequio)\b/.test(txt);
  }

  function isTrialOrCourtesy(row) {
    return isTrial(row) || isCourtesy(row);
  }

  function buildRecordHash(row) {
    return [
      norm(row?.tipo), norm(row?.estudiante), row?.fecha || row?.fechaRaw || '',
      norm(row?.hora), norm(row?.servicio), norm(row?.profesor),
      safeNum(row?.pago || row?.valorPago), norm(row?.comentario)
    ].join('|');
  }

  function markFirstOccurrence(records) {
    const seen = new Set();
    return (records || []).map((row) => {
      const hash = row.recordHash || buildRecordHash(row);
      const first = !seen.has(hash);
      seen.add(hash);
      return { ...row, isFirstOccurrence: first };
    });
  }

  function countClassParticipants(records) {
    const counts = new Map();
    for (const row of records || []) {
      if (!row.classUniqueId) continue;
      counts.set(row.classUniqueId, (counts.get(row.classUniqueId) || 0) + 1);
    }
    return (records || []).map(row => ({
      ...row,
      participantesPorClase: row.classUniqueId ? counts.get(row.classUniqueId) || 0 : 0
    }));
  }

  function markDuplicateClasses(records) {
    const counts = new Map();
    const firstByKey = new Map();
    const rowKey = (row, index) => String(row?.id || row?.recordHash || row?.rowNum || row?.__rowNum || index);
    for (const [index, row] of (records || []).entries()) {
      const key = buildDuplicateClassKey(row);
      if (!key || key.split('|').some(part => !part)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!firstByKey.has(key)) firstByKey.set(key, rowKey(row, index));
    }
    return (records || []).map((row, index) => {
      const key = buildDuplicateClassKey(row);
      const duplicateCount = key ? (counts.get(key) || 0) : 0;
      const isDuplicateClass = duplicateCount > 1;
      const duplicateReview = isDuplicateClass && rowKey(row, index) !== firstByKey.get(key);
      return {
        ...row,
        duplicateClassKey: key,
        duplicateClassCount: duplicateCount,
        isDuplicateClass,
        duplicateReview,
        movimientoSaldo: duplicateReview ? 0 : (Number(row?.movimiento) || 0)
      };
    });
  }

  function calculateStudentBalance(records) {
    return markDuplicateClasses(records).reduce((sum, row) => sum + (Number(row.movimientoSaldo) || 0), 0);
  }

  function getStudentClassLimit(records) {
    const normalizePackageKey = (value) => {
      const key = norm(value || 'sin-clasificacion');
      if (key === 'pago' || key === 'cp de clase de prueba' || key === 'cc de clase de cortesia') return '*';
      if (key === 'tv' || key === 'taller' || key === 'ms g' || key === 'ms sp') return 'vacacional-flex';
      return key;
    };
    const isPago = (row) => {
      const tipo = norm(row?.tipo);
      if (tipo === 'pago') return true;
      if (tipo === 'clase') return false;
      return !!String(row?.pago || '').trim();
    };
    const packageKey = (row) => normalizePackageKey(isPago(row) ? row?.clasifPago : row?.clasif);
    const isMatricula = (row) => {
      if (!isPago(row)) return false;
      const raw = `${row?.servicio || ''} ${row?.clasifPago || ''} ${row?.clasif || ''}`;
      const txt = norm(raw);
      return txt.includes('matricula') || /\bME\b/i.test(raw);
    };
    const rows = markDuplicateClasses(records).sort((a, b) => {
      const ta = Number(a?.fechaTs) || 0;
      const tb = Number(b?.fechaTs) || 0;
      if (ta !== tb) return ta - tb;
      const pa = isPago(a) ? 0 : 1;
      const pb = isPago(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return String(a?.fecha || a?.fechaRaw || '').localeCompare(String(b?.fecha || b?.fechaRaw || ''));
    });
    let lastPackageTotal = 0;
    const activeByKey = new Map();
    const pendingByKey = new Map();
    const queue = (map, key) => {
      if (!map.has(key)) map.set(key, []);
      return map.get(key);
    };

    for (const row of rows) {
      if (row?.duplicateReview) continue;
      const mov = Number(row?.movimientoSaldo ?? row?.movimiento) || 0;
      const key = packageKey(row);
      if (!isMatricula(row) && isPago(row) && mov > 0 && mov <= 24) {
        const pack = { total: Math.round(mov), remaining: Math.round(mov) };
        lastPackageTotal = pack.total;
        const active = activeByKey.get(key);
        if (active && active.remaining > 0) queue(pendingByKey, key).push(pack);
        else activeByKey.set(key, pack);
        continue;
      }
      if (norm(row?.tipo) !== 'clase' || mov >= 0) continue;
      let activeKey = key;
      let active = activeByKey.get(activeKey) || activeByKey.get('*') || null;
      if (!active && pendingByKey.has(key)) {
        active = queue(pendingByKey, key).shift() || null;
        activeKey = key;
        if (active) activeByKey.set(activeKey, active);
      }
      if (!active && pendingByKey.has('*')) {
        active = queue(pendingByKey, '*').shift() || null;
        activeKey = '*';
        if (active) activeByKey.set(activeKey, active);
      }
      if (!active) continue;
      active.remaining = Math.max(0, active.remaining - 1);
      if (active.remaining <= 0) {
        const next = queue(pendingByKey, activeKey).shift() || null;
        if (next) activeByKey.set(activeKey, next);
        else activeByKey.delete(activeKey);
      }
    }

    const activeTotals = Array.from(activeByKey.values()).filter(p => p.remaining > 0).map(p => p.total);
    return activeTotals[activeTotals.length - 1] || lastPackageTotal || 24;
  }

  function calculateProgramacionStatus(fechas, todayISO, expectedTotal) {
    const clean = Array.isArray(fechas) ? fechas.map(x => String(x || '').trim()).filter(Boolean).sort() : [];
    const today = todayISO || toISODate(new Date());
    const limit = Math.max(1, Math.round(Number(expectedTotal) || 24));
    if (!clean.length) return { status: 'Sin programacion', futureCount: 0, nextClassDate: '', filled: 0, limit };
    const future = clean.filter(f => f >= today);
    if (clean.length >= limit) return { status: 'OK', futureCount: future.length, nextClassDate: future[0] || '', filled: clean.length, limit };
    return { status: 'Por completar', futureCount: future.length, nextClassDate: future[0] || '', filled: clean.length, limit };
  }

  function calculateStudentStatus(records) {
    const manualActivo = (records || []).some(r => norm(r.estadoManual || r.paramClasif || r.clasificacionManual) === 'activo');
    if (manualActivo) return 'Activo';
    const classes = (records || []).filter(r => norm(r.tipo) === 'clase').sort((a, b) => (Number(b.fechaTs) || 0) - (Number(a.fechaTs) || 0));
    const lastTs = Number(classes[0]?.fechaTs) || 0;
    if (!lastTs) return 'Inactivo sin info';
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const last = new Date(lastTs);
    const lastStart = new Date(last.getFullYear(), last.getMonth(), last.getDate()).getTime();
    const days = Math.floor((todayStart - lastStart) / 86400000);
    if (days < 8) return 'Activo';
    if (days < 15) return 'Activo no registro (8-15 dias)';
    if (days <= 30) return 'Activo En pausa (15-30 dias)';
    if (days <= 90) return 'Inactivo en pausa (1-3 meses)';
    if (days <= 180) return 'Inactivo lejano (3-6 meses)';
    if (days <= 365) return 'Inactivo extendido (6-12 meses)';
    if (days <= 730) return 'Inactivo historico (12-24 meses)';
    return 'Exestudiante (+24 meses)';
  }

  function calculateStudentFicha(records) {
    const rows = markDuplicateClasses(records).sort((a, b) => (Number(b.fechaTs) || 0) - (Number(a.fechaTs) || 0));
    const saldo = calculateStudentBalance(rows);
    const clases = rows.filter(r => norm(r.tipo) === 'clase');
    const pagos = rows.filter(r => norm(r.tipo) === 'pago' || String(r.pago || '').trim());
    return { saldo, rows, totalClases: clases.length, totalPagos: pagos.length, ultimaClase: clases[0]?.fecha || clases[0]?.fechaRaw || '', ultimoPago: pagos[0]?.fecha || pagos[0]?.fechaRaw || '' };
  }

  function recalculateStudentFromRecords(studentId, records, schedule) {
    const ficha = calculateStudentFicha(records);
    const prog = calculateProgramacionStatus(schedule?.fechas || []);
    return {
      studentId,
      estudiante: records?.[0]?.estudiante || schedule?.estudiante || '',
      saldo: ficha.saldo,
      totalClases: ficha.totalClases,
      totalPagos: ficha.totalPagos,
      ultimaClase: ficha.ultimaClase,
      ultimoPago: ficha.ultimoPago,
      clasificacionFinal: calculateStudentStatus(records),
      programacionStatus: prog.status,
      nextClassDate: prog.nextClassDate,
      futureClassCount: prog.futureCount,
      pivotCategorias: [],
      updatedAt: new Date()
    };
  }

  function recalculateAllStudents(records, schedules) {
    const byStudent = new Map();
    for (const r of records || []) {
      const k = r.estudianteKey || norm(r.estudiante);
      if (!k) continue;
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k).push(r);
    }
    return Array.from(byStudent.entries()).map(([studentId, rows]) => recalculateStudentFromRecords(studentId, rows, schedules?.get?.(studentId)));
  }

  window.RIPCalculations = {
    norm, safeNum, parseDate, toISODate, computeMovimiento, classifyMovimiento,
    isTrial, isTrialCP, isCourtesyCC, isCourtesy, isTrialOrCourtesy,
    buildClassUniqueId, buildDuplicateClassKey, buildDuplicateClassKeyFromData, buildRecordHash, markFirstOccurrence, countClassParticipants,
    markDuplicateClasses,
    calculateStudentBalance, calculateStudentFicha, calculateStudentStatus,
    getStudentClassLimit, calculateProgramacionStatus, recalculateStudentFromRecords,
    recalculateAllStudents
  };
})();
