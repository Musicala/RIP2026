/* global window */
(function () {
  'use strict';

  const C = () => window.RIPCalculations;
  const PAYMENT_METHODS = ['Bancolombia M', 'Nequi M', 'Bold', 'Bold CF', 'Davivienda M', 'Efectivo', 'Daviplata C', 'Fesicol', 'Mercadopago', 'Addi'];
  const collectionCache = new Map();
  let registroCache = null;
  const DEFAULT_SERVICE_NAMES = [
    'Matrícula anual',
    'Sede Personalizado Clase de prueba',
    'Sede Personalizado Clase individual',
    'Sede Personalizado Paquete de 4 clases',
    'Sede Personalizado Paquete de 8 clases',
    'Sede Personalizado Paquete de 12 clases',
    'Sede Personalizado Paquete de 24 clases',
    'Musifamiliar Sede Grupal Clase de prueba',
    'Musifamiliar Sede Grupal Clase individual',
    'Musifamiliar Sede Grupal Paquete de 4 clases',
    'Musifamiliar Sede Grupal Paquete de 8 clases',
    'Musifamiliar Sede Grupal Paquete de 12 clases',
    'Musifamiliar Sede Grupal Paquete de 24 clases',
    'Sede Grupal Clase de prueba',
    'Sede Grupal Clase individual',
    'Sede Grupal Paquete de 4 clases',
    'Sede Grupal Paquete de 8 clases',
    'Sede Grupal Paquete de 12 clases',
    'Sede Grupal Paquete de 24 clases',
    'Hogar Personalizado Clase de prueba',
    'Hogar Personalizado Clase individual',
    'Hogar Personalizado Paquete de 4 clases',
    'Hogar Personalizado Paquete de 8 clases',
    'Hogar Personalizado Paquete de 12 clases',
    'Hogar Personalizado Paquete de 24 clases',
    'Hogar Musifamiliar Grupal Clase de prueba',
    'Hogar Musifamiliar Grupal Clase individual',
    'Hogar Musifamiliar Grupal Paquete de 4 clases',
    'Hogar Musifamiliar Grupal Paquete de 8 clases',
    'Hogar Musifamiliar Grupal Paquete de 12 clases',
    'Hogar Musifamiliar Grupal Paquete de 24 clases',
    'Virtual Personalizado Clase de prueba',
    'Virtual Personalizado Clase individual',
    'Virtual Personalizado Paquete de 4 clases',
    'Virtual Personalizado Paquete de 8 clases',
    'Virtual Personalizado Paquete de 12 clases',
    'Virtual Personalizado Paquete de 24 clases',
    'Virtual Grupal Clase de prueba',
    'Virtual Grupal Clase individual',
    'Virtual Grupal Paquete de 4 clases',
    'Virtual Grupal Paquete de 8 clases',
    'Virtual Grupal Paquete de 12 clases',
    'Virtual Grupal Paquete de 24 clases',
    'Plataforma Online 1 mes',
    'Plataforma Online 2 meses',
    'Plataforma Online 3 meses',
    'Plataforma Online 6 meses',
    'Plataforma Online 12 meses',
    'Ensambles Paquete de 4 clases',
    'Ensambles Paquete de 8 clases',
    'Ensambles Paquete de 12 clases',
    'Ensambles Paquete de 24 clases',
    'MusiGym 1 mes',
    'MusiGym 2 meses',
    'MusiGym 3 meses',
    'MusiGym 6 meses',
    'Ensayos: MS P1 (Lunes a Viernes)',
    'Ensayos: MS P8 (Lunes a Viernes)',
    'Ensayos: MS P24 (Lunes a Viernes)',
    'Ensayos: MS P48 (Lunes a Viernes)',
    'Ensayos: Jornada P4 (Lunes a Viernes)',
    'Ensayos: Jornada P8 (Lunes a Viernes)',
    'Ensayos: MS P1 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Ensayos: MS P8 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Ensayos: MS P24 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Ensayos: MS P48 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Ensayos: Jornada P4 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Ensayos: Jornada P8 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: MS P1 (Lunes a Viernes)',
    'Talleres: MS P8 (Lunes a Viernes)',
    'Talleres: MS P24 (Lunes a Viernes)',
    'Talleres: MS P48 (Lunes a Viernes)',
    'Talleres: Jornada P4 (Lunes a Viernes)',
    'Talleres: Jornada P8 (Lunes a Viernes)',
    'Talleres: MS P1 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: MS P8 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: MS P24 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: MS P48 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: Jornada P4 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Talleres: Jornada P8 (Sábados, Domingos, Festivos, Fuera del horario)',
    'Curso Preuniversitario Personalizado Paquete de 54 clases 9 semanas, 3 jornadas 3 clases)',
    'Curso Preuniversitario Grupal Paquete de 54 clases 9 semanas, 3 jornadas 3 clases)',
    'Curso de formación Paquete de 27 clases',
    'Curso de formación Paquete de 36 clases',
    'Curso Vacacional Paquete de 20 clases',
    'Curso Vacacional Paquete de 16 clases',
    'Taller empresarial Sesión 1H',
    'Taller empresarial Plan 4H',
    'Taller empresarial Plan 8H',
    'Taller empresarial Plan 12H',
    'Taller empresarial Plan 24H',
    'Taller esporádico CI',
    'Docente A - Virtual',
    'Docente A - Personalizada/Hogar',
    'Docente A - Grupal',
    'Docente B - Virtual',
    'Docente B - Personalizada/Hogar',
    'Docente B -  Grupal',
    'Hora adicional contratados  Sede/Virtual',
    'Hora adicional contratados  Hogar',
    'Transporte adicional (durante jornada)',
    'Extensión de vigencia',
    'Clase de cortesía CC',
    'Clase de prueba CP',
    'Clase de cortesía',
    'Clase de prueba',
    'Multa'
  ];
  async function fb() { return window.RIPFirebase.ready; }
  function stamp(fs) { return fs.serverTimestamp(); }
  function userEmail(env) { return env.user?.email || ''; }
  function identity() { return window.RIPIdentity || null; }

  function isCanonicalId(value) {
    const id = identity();
    return Boolean(id && id.looksLikeCanonicalId(String(value || '').trim()));
  }

  // Llave de agrupación/documento: los studentId canónicos se conservan tal
  // cual (nunca norm()); todo lo demás sigue usando el nombre normalizado.
  function keyFor(value) {
    const text = String(value || '').trim();
    if (isCanonicalId(text)) return text;
    return C().norm(text);
  }

  // Intenta completar row.studentId con el ID canónico del directorio local
  // (rip students, sincronizado desde estudiantes-musicala). Nunca adivina:
  // si hay más de un candidato deja el campo vacío para revisión.
  async function attachStudentId(row) {
    if (!row || row.studentId) return row;
    const id = identity();
    if (!id) return row;
    try {
      const resolved = await id.resolveStudentId({
        name: row.estudiante,
        aliases: [row.estudianteKey].filter(Boolean)
      });
      if (resolved.studentId && !resolved.ambiguous) {
        row.studentId = resolved.studentId;
        row.studentIdSource = resolved.source;
      }
    } catch (_err) { /* sin índice disponible: se conserva el flujo actual */ }
    return row;
  }

  function getDefaultServices() {
    const calc = C();
    const byKey = new Map();
    for (const name of DEFAULT_SERVICE_NAMES) {
      const clean = String(name || '').trim().replace(/\s+/g, ' ');
      const key = calc.norm(clean);
      if (key && !byKey.has(key)) byKey.set(key, { name: clean, prices: {} });
    }
    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function mergeServiceMeta(...lists) {
    const calc = C();
    const byKey = new Map();
    for (const list of lists) {
      for (const item of list || []) {
        const name = String(item?.name || item || '').trim().replace(/\s+/g, ' ');
        const key = calc.norm(name);
        if (!key) continue;
        const prev = byKey.get(key) || { name, prices: {} };
        byKey.set(key, {
          name: prev.name || name,
          prices: { ...(prev.prices || {}), ...(item?.prices || {}) }
        });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function normalizeRegistro(data) {
    const calc = C();
    const fecha = data.fecha || data.fechaRaw || '';
    const d = calc.parseDate(fecha);
    const iso = calc.toISODate(d || fecha);
    const base = {
      ...data,
      estudiante: String(data.estudiante || data.name || '').trim(),
      fecha: iso,
      fechaRaw: iso || fecha,
      fechaTs: d ? d.getTime() : 0,
      tipo: String(data.tipo || '').trim(),
      servicio: String(data.servicio || '').trim(),
      hora: String(data.hora || '').trim(),
      profesor: String(data.profesor || '').trim(),
      pago: String(data.pago || data.valorPago || '').trim(),
      valorPago: calc.safeNum(data.valorPago || data.pago),
      comentario: String(data.comentario || '').trim()
    };
    const classif = calc.classifyMovimiento(base);
    base.estudianteKey = calc.norm(base.estudiante);
    // studentId canónico: viaja tal cual (nunca se normaliza). Si no viene,
    // attachStudentId() lo intenta resolver en el momento de guardar.
    base.studentId = String(data.studentId || data.officialStudentId || '').trim();
    base.servicioKey = calc.norm(base.servicio);
    base.profesorKey = calc.norm(base.profesor);
    base.movimiento = calc.computeMovimiento(base);
    base.clasif = classif.clasif;
    base.clasifPago = classif.clasifPago;
    base.classUniqueId = calc.buildClassUniqueId(base);
    base.recordHash = calc.buildRecordHash(base);
    base.source = 'firebase';
    base.importedFrom = base.importedFrom || 'RIP Musicala 2026';
    base.year = Number(String(base.fecha || '').slice(0, 4)) || new Date().getFullYear();
    return base;
  }

  function collectionCacheKey(name, orderField) {
    return `${name}|${orderField || ''}`;
  }

  function clearCache(names) {
    if (!names) {
      collectionCache.clear();
      registroCache = null;
      return;
    }
    const list = Array.isArray(names) ? names : [names];
    for (const name of list) {
      for (const key of Array.from(collectionCache.keys())) {
        if (key.startsWith(`${name}|`)) collectionCache.delete(key);
      }
      if (name === 'registro') registroCache = null;
    }
  }

  async function loadCollection(name, orderField) {
    const key = collectionCacheKey(name, orderField);
    if (collectionCache.has(key)) return collectionCache.get(key);
    const env = await fb();
    const { collection, getDocs, query, orderBy } = env.fs;
    const ref = collection(env.db, name);
    const promise = getDocs(orderField ? query(ref, orderBy(orderField, 'desc')) : ref)
      .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch((err) => {
        collectionCache.delete(key);
        throw err;
      });
    collectionCache.set(key, promise);
    return promise;
  }

  async function loadRegistro() {
    if (registroCache) return registroCache;
    const rows = await loadCollection('registro', 'fechaTs');
    registroCache = C().markDuplicateClasses(rows.map((r) => normalizeRegistro(r)));
    return registroCache;
  }

  async function loadStudents() { return loadCollection('students'); }
  async function loadProgramacion() { return loadCollection('programacion'); }
  async function loadComputed() { return loadCollection('studentComputed'); }
  async function loadClientesB2C() { return loadCollection('clientesB2C', 'fechaTs'); }
  async function loadPrimeraVez() { return loadCollection('primeraVez', 'fechaClaseTs'); }

  async function loadPaymentMeta() {
    const [students, registro] = await Promise.all([loadStudents(), loadCollection('registro')]);
    const studentSet = new Set();
    (students || []).forEach(s => {
      const name = String(s.name || s.estudiante || '').trim();
      if (name) studentSet.add(name);
    });
    (registro || []).forEach(r => {
      const name = String(r.estudiante || '').trim();
      if (name) studentSet.add(name);
    });
    const firebaseServices = Array.from(new Set((registro || [])
      .map(r => String(r.servicio || '').trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return {
      estudiantes: Array.from(studentSet).sort((a, b) => a.localeCompare(b, 'es')),
      servicios: mergeServiceMeta(getDefaultServices(), firebaseServices.map(name => ({ name, prices: {} }))),
      tiposEstudiante: ['Antiguos/Convenios', 'Nuevos'],
      mediosPago: PAYMENT_METHODS
    };
  }

  async function upsertStudent(env, row) {
    if (!row.estudianteKey) return;
    const { doc, setDoc } = env.fs;
    const canonical = String(row.studentId || '').trim();
    const payload = {
      name: row.estudiante,
      nameKey: row.estudianteKey,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env),
      createdBy: userEmail(env)
    };
    // El doc por nombre se conserva por compatibilidad, pero queda anotado
    // con su studentId oficial para que el resolutor pueda mapearlo.
    if (canonical) {
      payload.officialStudentId = canonical;
      payload.studentId = canonical;
    }
    await setDoc(doc(env.db, 'students', row.estudianteKey), payload, { merge: true });
    clearCache('students');
    identity()?.invalidate?.();
  }

  async function logAudit(entity, entityId, action, before, after) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    await addDoc(collection(env.db, 'auditLog'), {
      entity, entityId, action,
      before: before || null,
      after: after || null,
      userEmail: userEmail(env),
      createdAt: stamp(env.fs)
    });
  }

  function notifyFirestoreChange(detail) {
    try {
      if (typeof window.RIPAppFirestoreChanged === 'function') {
        window.RIPAppFirestoreChanged(detail || {});
      } else {
        window.RIP_PENDING_FIRESTORE_CHANGES = window.RIP_PENDING_FIRESTORE_CHANGES || [];
        window.RIP_PENDING_FIRESTORE_CHANGES.push({ ...(detail || {}), at: Date.now() });
      }
    } catch (err) {
      console.warn('No se pudo notificar cambio Firestore', err);
    }
  }

  async function recalculateStudent(studentId) {
    const env = await fb();
    const { collection, doc, getDocs, query, where, getDoc, setDoc } = env.fs;
    const inputKey = keyFor(studentId);
    if (!inputKey) return null;

    // Se buscan filas tanto por la llave heredada (nombre normalizado) como
    // por studentId canónico, y se unen sin duplicar. Así el recálculo sirve
    // antes y después de la migración de IDs.
    const [byKeySnap, byIdSnap] = await Promise.all([
      getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', inputKey))),
      getDocs(query(collection(env.db, 'registro'), where('studentId', '==', inputKey)))
    ]);
    const rowsById = new Map();
    byKeySnap.docs.forEach(d => rowsById.set(d.id, { id: d.id, ...d.data() }));
    byIdSnap.docs.forEach(d => rowsById.set(d.id, { id: d.id, ...d.data() }));
    const records = Array.from(rowsById.values());

    const scheduleSnap = await getDoc(doc(env.db, 'programacion', inputKey));
    const computed = C().recalculateStudentFromRecords(inputKey, records, scheduleSnap.exists() ? scheduleSnap.data() : null);

    // canonicalStudentId: lo usa syncStudentStatus (rip-musicala) para saber
    // bajo qué ID publicar el estado hacia Bitácoras. Sin él, el doc queda
    // pendiente en sync_logs hasta que la migración lo resuelva.
    let canonical = isCanonicalId(inputKey) ? inputKey : '';
    if (!canonical) {
      const rowWithId = records.find(r => String(r.studentId || '').trim());
      try {
        const resolved = await identity()?.resolveStudentId({
          studentId: rowWithId ? rowWithId.studentId : '',
          name: computed.estudiante,
          aliases: [inputKey]
        });
        if (resolved?.studentId && !resolved.ambiguous) canonical = resolved.studentId;
      } catch (_err) { /* índice no disponible: se publica sin canónico */ }
    }

    await setDoc(doc(env.db, 'studentComputed', inputKey), {
      ...computed,
      estudianteKey: C().norm(computed.estudiante || '') || (isCanonicalId(inputKey) ? '' : inputKey),
      canonicalStudentId: canonical,
      schemaVersion: 2,
      areaInteresActualizadaAt: stamp(env.fs),
      updatedAt: stamp(env.fs)
    }, { merge: true });
    clearCache('studentComputed');
    return computed;
  }

  async function recalculateAllStudents() {
    const students = await loadStudents();
    const out = [];
    for (const s of students) out.push(await recalculateStudent(s.nameKey || s.id));
    await logAudit('studentComputed', 'all', 'recalculate', null, { count: out.length });
    return out;
  }

  async function assertNoDuplicateClass(env, row) {
    const calc = C();
    const key = calc.buildDuplicateClassKeyFromData?.(row) || '';
    if (!key) return;
    const { collection, getDocs, query, where } = env.fs;
    const snap = await getDocs(query(
      collection(env.db, 'registro'),
      where('estudianteKey', '==', row.estudianteKey),
      where('fecha', '==', row.fecha)
    ));
    const duplicate = snap.docs.some(docSnap => {
      const existing = normalizeRegistro({ id: docSnap.id, ...docSnap.data() });
      return calc.buildDuplicateClassKeyFromData?.(existing) === key;
    });
    if (duplicate) throw new Error('Esta clase ya esta registrada para este estudiante, fecha, hora y docente.');
  }

  async function addRegistroRow(data) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    const row = normalizeRegistro(data);
    await attachStudentId(row);
    row.createdAt = stamp(env.fs);
    row.updatedAt = stamp(env.fs);
    row.createdBy = userEmail(env);
    row.updatedBy = userEmail(env);
    await assertNoDuplicateClass(env, row);
    await upsertStudent(env, row);
    const ref = await addDoc(collection(env.db, 'registro'), row);
    clearCache('registro');
    await recalculateStudent(row.estudianteKey);
    await logAudit('registro', ref.id, 'create', null, row);
    notifyFirestoreChange({ entity: 'registro', action: 'create', id: ref.id, studentId: row.estudianteKey });
    return { id: ref.id, ...row };
  }

  async function addRegistroRowsBulk(rows, onProgress) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    const saved = [];
    const skipped = [];
    const studentIds = new Set();
    const sourceRows = Array.isArray(rows) ? rows : [];

    for (let index = 0; index < sourceRows.length; index++) {
      const row = normalizeRegistro(sourceRows[index]);
      await attachStudentId(row);
      row.createdAt = stamp(env.fs);
      row.updatedAt = stamp(env.fs);
      row.createdBy = userEmail(env);
      row.updatedBy = userEmail(env);
      try {
        await assertNoDuplicateClass(env, row);
        await upsertStudent(env, row);
        const ref = await addDoc(collection(env.db, 'registro'), row);
        clearCache('registro');
        await logAudit('registro', ref.id, 'create', null, row);
        saved.push({ id: ref.id, ...row });
        if (row.estudianteKey) studentIds.add(row.estudianteKey);
        notifyFirestoreChange({ entity: 'registro', action: 'create', id: ref.id, studentId: row.estudianteKey });
      } catch (err) {
        if (String(err?.message || err).includes('ya esta registrada')) {
          skipped.push(row);
        } else {
          throw err;
        }
      }
      if (typeof onProgress === 'function') onProgress(index + 1, sourceRows.length);
    }

    for (const studentId of studentIds) {
      await recalculateStudent(studentId);
    }
    return { saved, skipped };
  }

  async function savePaymentTransaction(data) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    const calc = C();
    const fecha = String(data.fechaPago || '').trim();
    const usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    const recargo = calc.safeNum(data.recargo);
    const descuento = calc.safeNum(data.descuento);
    const fevm = calc.safeNum(data.FEVM);
    const valid = usuarios
      .map((u, index) => ({
        index: index + 1,
        estudiante: String(u.estudiante || '').trim(),
        studentId: String(u.studentId || '').trim(),
        servicio: String(u.servicio || '').trim(),
        precio: calc.safeNum(u.precio),
        ciclo: String(u.ciclo || '').trim()
      }))
      .filter(u => u.estudiante && u.servicio && u.precio > 0);
    // Resolver studentId canónico por usuario (sin adivinar homónimos).
    for (const u of valid) {
      if (!u.studentId) {
        const helper = { estudiante: u.estudiante, estudianteKey: calc.norm(u.estudiante), studentId: '' };
        await attachStudentId(helper);
        u.studentId = helper.studentId || '';
      }
    }
    if (!fecha) throw new Error('Falta fecha de pago.');
    if (!valid.length) throw new Error('No hay usuarios validos.');
    const total = valid.reduce((sum, u) => sum + u.precio, 0) + recargo - descuento;
    const transaction = {
      fecha,
      fechaTs: calc.parseDate(fecha)?.getTime() || 0,
      tipoEstudiante: String(data.tipoEstudiante || '').trim(),
      usuarios: valid,
      recargo,
      descuento,
      total,
      medioPago: String(data.medioPago || '').trim(),
      FEVM: fevm,
      comentario: String(data.comentario || '').trim(),
      source: 'firebase',
      importedFrom: 'Registro de pagos Firebase',
      createdAt: stamp(env.fs),
      updatedAt: stamp(env.fs),
      createdBy: userEmail(env),
      updatedBy: userEmail(env)
    };
    if (!transaction.medioPago) throw new Error('Falta medio de pago.');
    const txRef = await addDoc(collection(env.db, 'clientesB2C'), transaction);
    clearCache('clientesB2C');
    const savedRows = [];
    for (const item of valid) {
      const row = await addRegistroRow({
        tipo: 'Pago',
        estudiante: item.estudiante,
        studentId: item.studentId || '',
        fecha,
        fechaRaw: fecha,
        servicio: item.servicio,
        pago: String(item.precio),
        valorPago: item.precio,
        comentario: transaction.comentario,
        medioPago: transaction.medioPago,
        ciclo: item.ciclo,
        clientesB2CId: txRef.id,
        importedFrom: 'Registro de pagos Firebase'
      });
      savedRows.push(row);
    }
    await logAudit('clientesB2C', txRef.id, 'create', null, { ...transaction, registroIds: savedRows.map(r => r.id) });
    notifyFirestoreChange({ entity: 'clientesB2C', action: 'create', id: txRef.id });
    return { ok: true, id: txRef.id, transaction: { id: txRef.id, ...transaction }, registro: savedRows };
  }

  async function addClienteB2C(data) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    const calc = C();
    const fecha = String(data.fecha || data.fechaPago || '').trim();
    const usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
    const clean = usuarios.map((u, index) => ({
      index: Number(u.index || index + 1),
      estudiante: String(u.estudiante || u.u || '').trim(),
      studentId: String(u.studentId || '').trim(),
      servicio: String(u.servicio || u.s || '').trim(),
      precio: calc.safeNum(u.precio ?? u.p)
    })).filter(u => u.estudiante || u.servicio || u.precio);
    const row = {
      fecha,
      fechaTs: calc.parseDate(fecha)?.getTime() || 0,
      usuarios: clean,
      recargo: calc.safeNum(data.recargo),
      descuento: calc.safeNum(data.descuento),
      total: calc.safeNum(data.total),
      medioPago: String(data.medioPago || data.medio || '').trim(),
      FEVM: calc.safeNum(data.FEVM || data.fevm),
      servicio6: String(data.servicio6 || '').trim(),
      precio6: calc.safeNum(data.precio6),
      importedFrom: data.importedFrom || 'Importador Clientes B2C',
      source: 'firebase-import',
      createdAt: stamp(env.fs),
      updatedAt: stamp(env.fs),
      createdBy: userEmail(env),
      updatedBy: userEmail(env)
    };
    const ref = await addDoc(collection(env.db, 'clientesB2C'), row);
    clearCache('clientesB2C');
    await logAudit('clientesB2C', ref.id, 'import', null, row);
    notifyFirestoreChange({ entity: 'clientesB2C', action: 'import', id: ref.id });
    return { id: ref.id, ...row };
  }

  async function updateClienteB2C(recordId, data) {
    const env = await fb();
    const { collection, doc, getDoc, getDocs, query, setDoc, where } = env.fs;
    const calc = C();
    const ref = doc(env.db, 'clientesB2C', recordId);
    const beforeSnap = await getDoc(ref);
    const before = beforeSnap.exists() ? beforeSnap.data() : {};
    const fecha = String(data.fecha || data.fechaPago || before.fecha || '').trim();
    const usuarios = Array.isArray(data.usuarios) ? data.usuarios : (before.usuarios || []);
    const clean = usuarios.map((u, index) => ({
      index: Number(u.index || index + 1),
      estudiante: String(u.estudiante || u.nombre || '').trim(),
      studentId: String(u.studentId || '').trim(),
      servicio: String(u.servicio || '').trim(),
      precio: calc.safeNum(u.precio)
    })).filter(u => u.estudiante || u.servicio || u.precio);
    for (const u of clean) {
      if (!u.studentId && u.estudiante) {
        const helper = { estudiante: u.estudiante, estudianteKey: calc.norm(u.estudiante), studentId: '' };
        await attachStudentId(helper);
        u.studentId = helper.studentId || '';
      }
    }
    const recargo = calc.safeNum(data.recargo);
    const descuento = calc.safeNum(data.descuento);
    const after = {
      ...before,
      fecha,
      fechaTs: calc.parseDate(fecha)?.getTime() || 0,
      tipoEstudiante: String(data.tipoEstudiante || before.tipoEstudiante || '').trim(),
      usuarios: clean,
      recargo,
      descuento,
      total: clean.reduce((sum, u) => sum + calc.safeNum(u.precio), 0) + recargo - descuento,
      medioPago: String(data.medioPago || before.medioPago || '').trim(),
      FEVM: calc.safeNum(data.FEVM),
      comentario: String(data.comentario || '').trim(),
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env)
    };
    await setDoc(ref, after, { merge: true });
    clearCache('clientesB2C');
    const linkedSnap = await getDocs(query(collection(env.db, 'registro'), where('clientesB2CId', '==', recordId)));
    const linkedRows = linkedSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (Number(a.fechaTs) || 0) - (Number(b.fechaTs) || 0) || String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < clean.length; i++) {
      const item = clean[i];
      const registroData = {
        tipo: 'Pago',
        estudiante: item.estudiante,
        studentId: item.studentId || '',
        fecha,
        fechaRaw: fecha,
        servicio: item.servicio,
        pago: String(item.precio || 0),
        valorPago: item.precio || 0,
        comentario: after.comentario,
        medioPago: after.medioPago,
        clientesB2CId: recordId,
        importedFrom: before.importedFrom || 'Registro de pagos Firebase'
      };
      if (linkedRows[i]?.id) {
        await updateRegistroRow(linkedRows[i].id, registroData);
      } else {
        await addRegistroRow(registroData);
      }
    }
    for (let i = clean.length; i < linkedRows.length; i++) {
      await deleteRegistroRow(linkedRows[i].id);
    }
    await logAudit('clientesB2C', recordId, 'update', before, after);
    notifyFirestoreChange({ entity: 'clientesB2C', action: 'update', id: recordId });
    return { id: recordId, ...after };
  }

  async function updateRegistroRow(recordId, data) {
    const env = await fb();
    const { doc, getDoc, setDoc } = env.fs;
    const ref = doc(env.db, 'registro', recordId);
    const beforeSnap = await getDoc(ref);
    const before = beforeSnap.exists() ? beforeSnap.data() : {};
    const row = normalizeRegistro({ ...before, ...data });
    await attachStudentId(row);
    row.updatedAt = stamp(env.fs);
    row.updatedBy = userEmail(env);
    await upsertStudent(env, row);
    await setDoc(ref, row, { merge: true });
    clearCache('registro');
    await recalculateStudent(row.estudianteKey);
    await logAudit('registro', recordId, 'update', before, row);
    notifyFirestoreChange({ entity: 'registro', action: 'update', id: recordId, studentId: row.estudianteKey });
    return { id: recordId, ...row };
  }

  async function deleteRegistroRow(recordId) {
    const env = await fb();
    const { doc, getDoc, deleteDoc } = env.fs;
    const ref = doc(env.db, 'registro', recordId);
    const beforeSnap = await getDoc(ref);
    const before = beforeSnap.exists() ? beforeSnap.data() : null;
    await deleteDoc(ref);
    clearCache('registro');
    if (before?.estudianteKey) await recalculateStudent(before.estudianteKey);
    await logAudit('registro', recordId, 'delete', before, null);
    notifyFirestoreChange({ entity: 'registro', action: 'delete', id: recordId, studentId: before?.estudianteKey || '' });
    return { ok: true };
  }

  function normalizePrimeraVez(data) {
    const calc = C();
    const fechaClase = String(data.fechaClase || data.fecha || '').trim();
    const fechaRegistro = String(data.fechaRegistro || calc.toISODate(new Date())).trim();
    const estudiante = String(data.estudiante || data.name || '').trim();
    return {
      estudiante,
      estudianteKey: calc.norm(estudiante),
      studentId: String(data.studentId || '').trim(),
      fechaClase,
      fechaClaseTs: calc.parseDate(fechaClase)?.getTime() || 0,
      fechaRegistro,
      fechaRegistroTs: calc.parseDate(fechaRegistro)?.getTime() || 0,
      motivo: String(data.motivo || '').trim(),
      detalle: String(data.detalle || data.comentario || '').trim(),
      politica: 'Primera vez perdonada por cancelacion con menos de 3 horas',
      source: 'firebase',
      importedFrom: data.importedFrom || 'RIP Primera vez'
    };
  }

  async function addPrimeraVez(data) {
    const env = await fb();
    const { collection, addDoc } = env.fs;
    const row = normalizePrimeraVez(data);
    if (!row.estudiante) throw new Error('Falta estudiante.');
    if (!row.fechaClase) throw new Error('Falta fecha de clase.');
    if (!row.motivo) throw new Error('Falta motivo.');
    await attachStudentId(row);
    row.createdAt = stamp(env.fs);
    row.updatedAt = stamp(env.fs);
    row.createdBy = userEmail(env);
    row.updatedBy = userEmail(env);
    await setStudentFromName(env, row.estudiante, row.studentId);
    const ref = await addDoc(collection(env.db, 'primeraVez'), row);
    clearCache('primeraVez');
    await logAudit('primeraVez', ref.id, 'create', null, row);
    notifyFirestoreChange({ entity: 'primeraVez', action: 'create', id: ref.id, studentId: row.estudianteKey });
    return { id: ref.id, ...row };
  }

  async function updatePrimeraVez(recordId, data) {
    const env = await fb();
    const { doc, getDoc, setDoc } = env.fs;
    const ref = doc(env.db, 'primeraVez', recordId);
    const beforeSnap = await getDoc(ref);
    const before = beforeSnap.exists() ? beforeSnap.data() : {};
    const row = normalizePrimeraVez({ ...before, ...data });
    await attachStudentId(row);
    row.updatedAt = stamp(env.fs);
    row.updatedBy = userEmail(env);
    await setStudentFromName(env, row.estudiante, row.studentId);
    await setDoc(ref, row, { merge: true });
    clearCache('primeraVez');
    await logAudit('primeraVez', recordId, 'update', before, row);
    notifyFirestoreChange({ entity: 'primeraVez', action: 'update', id: recordId, studentId: row.estudianteKey });
    return { id: recordId, ...row };
  }

  async function deletePrimeraVez(recordId) {
    const env = await fb();
    const { doc, getDoc, deleteDoc } = env.fs;
    const ref = doc(env.db, 'primeraVez', recordId);
    const beforeSnap = await getDoc(ref);
    const before = beforeSnap.exists() ? beforeSnap.data() : null;
    await deleteDoc(ref);
    clearCache('primeraVez');
    await logAudit('primeraVez', recordId, 'delete', before, null);
    notifyFirestoreChange({ entity: 'primeraVez', action: 'delete', id: recordId, studentId: before?.estudianteKey || '' });
    return { ok: true };
  }

  async function setStudentFromName(env, estudiante, canonicalId = '') {
    const calc = C();
    const key = calc.norm(estudiante);
    if (!key) return;
    const { doc, setDoc } = env.fs;
    const payload = {
      name: estudiante,
      nameKey: key,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env),
      createdBy: userEmail(env)
    };
    const canonical = String(canonicalId || '').trim();
    if (canonical) {
      payload.officialStudentId = canonical;
      payload.studentId = canonical;
    }
    await setDoc(doc(env.db, 'students', key), payload, { merge: true });
    clearCache('students');
    identity()?.invalidate?.();
  }

  /*
    Resuelve a qué documento de `programacion` pertenece un estudiante.
    Transición de IDs:
    - si existe el doc canónico programacion/{studentId}, se usa;
    - si existe el doc heredado programacion/{nameKey}, se conserva;
    - si no existe ninguno, se sigue creando por nameKey hasta terminar la
      migración (las filas de registro siguen agrupadas por nameKey).
    Un studentId canónico jamás se normaliza.
  */
  async function resolveScheduleDoc(env, studentIdOrName) {
    const text = String(studentIdOrName || '').trim();
    const { doc, getDoc } = env.fs;
    let canonical = '';
    let nameKey = '';
    let displayName = text;

    if (isCanonicalId(text)) {
      canonical = text;
      try {
        const index = await identity()?.ensureIndex();
        const entry = index?.byCanonicalId?.get(canonical);
        if (entry) {
          nameKey = entry.nameKey || '';
          displayName = entry.name || text;
        }
      } catch (_err) { /* sin índice: se trabaja solo con el canónico */ }
    } else {
      nameKey = C().norm(text);
      try {
        const resolved = await identity()?.resolveStudentId({ name: text, aliases: [nameKey] });
        if (resolved?.studentId && !resolved.ambiguous) canonical = resolved.studentId;
      } catch (_err) { /* sin índice: flujo actual */ }
    }

    if (canonical) {
      const canonicalSnap = await getDoc(doc(env.db, 'programacion', canonical));
      if (canonicalSnap.exists()) return { docId: canonical, canonical, nameKey, displayName };
    }
    if (nameKey) {
      const legacySnap = await getDoc(doc(env.db, 'programacion', nameKey));
      if (legacySnap.exists()) return { docId: nameKey, canonical, nameKey, displayName };
    }
    return { docId: nameKey || canonical, canonical, nameKey, displayName };
  }

  async function loadStudentSchedule(studentIdOrName) {
    const env = await fb();
    const resolved = await resolveScheduleDoc(env, studentIdOrName);
    const { doc, getDoc } = env.fs;
    if (!resolved.docId) return { studentId: '', estudiante: String(studentIdOrName || ''), fechas: [] };
    const snap = await getDoc(doc(env.db, 'programacion', resolved.docId));
    return snap.exists()
      ? { id: snap.id, ...snap.data() }
      : {
          studentId: resolved.canonical || resolved.docId,
          estudiante: resolved.displayName,
          estudianteKey: resolved.nameKey,
          fechas: []
        };
  }

  async function saveSchedule(studentId, fechas) {
    const env = await fb();
    const resolved = await resolveScheduleDoc(env, studentId);
    const key = resolved.docId;
    if (!key) throw new Error('Falta estudiante para guardar programación.');
    const { doc, setDoc } = env.fs;
    const cleanFechas = Array.isArray(fechas) ? fechas.map(x => String(x || '').trim()).filter(Boolean).sort() : [];
    const after = {
      studentId: resolved.canonical || key,
      canonicalStudentId: resolved.canonical || '',
      estudiante: resolved.displayName,
      estudianteKey: resolved.nameKey || (isCanonicalId(key) ? '' : key),
      fechas: cleanFechas,
      maxClasses: cleanFechas.length || 24,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env)
    };
    await setDoc(doc(env.db, 'programacion', key), after, { merge: true });
    clearCache('programacion');
    await recalculateStudent(key);
    await logAudit('programacion', key, 'update', null, after);
    notifyFirestoreChange({ entity: 'programacion', action: 'update', id: key, studentId: after.studentId });
    return after;
  }

  async function saveScheduleFrom(studentId, startIndex, fechas) {
    const current = await loadStudentSchedule(studentId);
    const merged = Array.isArray(current.fechas) ? current.fechas.slice() : [];
    (fechas || []).forEach((f, i) => { merged[Number(startIndex) + i] = f; });
    return saveSchedule(studentId, merged);
  }

  async function mergeStudents(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName) {
    const env = await fb();
    const calc = C();
    // keyFor conserva los studentId canónicos tal cual (no aplica norm()).
    const sourceKey = keyFor(sourceStudentIdOrName);
    const targetKey = keyFor(targetStudentIdOrName);
    const targetName = String(targetDisplayName || targetStudentIdOrName || '').trim();
    if (!sourceKey || !targetKey) throw new Error('Faltan contactos para fusionar.');
    if (sourceKey === targetKey) throw new Error('El contacto origen y destino son el mismo.');
    if (!targetName) throw new Error('Falta el nombre del contacto que queda.');

    // studentId canónico del contacto que queda: las filas fusionadas deben
    // apuntar a ESTE id (nunca conservar el del contacto origen).
    let targetCanonical = isCanonicalId(targetKey) ? targetKey : '';
    if (!targetCanonical) {
      try {
        const resolved = await identity()?.resolveStudentId({ name: targetName, aliases: [targetKey] });
        if (resolved?.studentId && !resolved.ambiguous) targetCanonical = resolved.studentId;
      } catch (_err) { /* sin índice */ }
    }

    const { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } = env.fs;
    const summary = { registro: 0, primeraVez: 0, clientesB2C: 0, programacion: 0, studentsDeleted: 0 };

    const targetStudentRef = doc(env.db, 'students', targetKey);
    const targetStudentSnap = await getDoc(targetStudentRef);
    const targetStudentBefore = targetStudentSnap.exists() ? targetStudentSnap.data() : null;
    await setDoc(targetStudentRef, {
      ...(targetStudentBefore || {}),
      name: targetName,
      nameKey: isCanonicalId(targetKey)
        ? (targetStudentBefore?.nameKey || calc.norm(targetName))
        : targetKey,
      ...(targetCanonical ? { studentId: targetCanonical, officialStudentId: targetCanonical } : {}),
      mergedFrom: Array.from(new Set([...(targetStudentBefore?.mergedFrom || []), sourceKey])),
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env)
    }, { merge: true });

    const registroSnap = await getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', sourceKey)));
    for (const rowDoc of registroSnap.docs) {
      const before = rowDoc.data();
      const after = normalizeRegistro({ ...before, estudiante: targetName, estudianteKey: targetKey });
      after.studentId = targetCanonical || '';
      after.mergedFromStudentKey = sourceKey;
      after.mergedAt = stamp(env.fs);
      after.updatedAt = stamp(env.fs);
      after.updatedBy = userEmail(env);
      await setDoc(doc(env.db, 'registro', rowDoc.id), after, { merge: true });
      await logAudit('registro', rowDoc.id, 'merge-student', before, after);
      summary.registro += 1;
    }

    const primeraSnap = await getDocs(query(collection(env.db, 'primeraVez'), where('estudianteKey', '==', sourceKey)));
    for (const rowDoc of primeraSnap.docs) {
      const before = rowDoc.data();
      const after = {
        ...before,
        estudiante: targetName,
        estudianteKey: targetKey,
        studentId: targetCanonical || '',
        mergedFromStudentKey: sourceKey,
        mergedAt: stamp(env.fs),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      };
      await setDoc(doc(env.db, 'primeraVez', rowDoc.id), after, { merge: true });
      await logAudit('primeraVez', rowDoc.id, 'merge-student', before, after);
      summary.primeraVez += 1;
    }

    const clientesSnap = await getDocs(collection(env.db, 'clientesB2C'));
    for (const rowDoc of clientesSnap.docs) {
      const before = rowDoc.data();
      const usuarios = Array.isArray(before.usuarios) ? before.usuarios : [];
      let changed = false;
      const afterUsuarios = usuarios.map((u) => {
        const key = calc.norm(u?.estudiante || u?.nombre || '');
        if (key !== sourceKey) return u;
        changed = true;
        return { ...u, estudiante: targetName, studentId: targetCanonical || '', mergedFromStudentKey: sourceKey };
      });
      if (!changed) continue;
      const after = {
        ...before,
        usuarios: afterUsuarios,
        mergedStudentKeys: Array.from(new Set([...(before.mergedStudentKeys || []), sourceKey])),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      };
      await setDoc(doc(env.db, 'clientesB2C', rowDoc.id), after, { merge: true });
      await logAudit('clientesB2C', rowDoc.id, 'merge-student', before, after);
      summary.clientesB2C += 1;
    }

    const sourceScheduleRef = doc(env.db, 'programacion', sourceKey);
    const targetScheduleRef = doc(env.db, 'programacion', targetKey);
    const [sourceScheduleSnap, targetScheduleSnap] = await Promise.all([getDoc(sourceScheduleRef), getDoc(targetScheduleRef)]);
    if (sourceScheduleSnap.exists()) {
      const sourceSchedule = sourceScheduleSnap.data();
      const targetSchedule = targetScheduleSnap.exists() ? targetScheduleSnap.data() : {};
      const fechas = Array.from(new Set([
        ...(Array.isArray(targetSchedule.fechas) ? targetSchedule.fechas : []),
        ...(Array.isArray(sourceSchedule.fechas) ? sourceSchedule.fechas : [])
      ].map(x => String(x || '').trim()).filter(Boolean))).sort();
      const after = {
        ...targetSchedule,
        studentId: targetKey,
        estudiante: targetName,
        estudianteKey: targetKey,
        fechas,
        maxClasses: Math.max(Number(targetSchedule.maxClasses) || 0, Number(sourceSchedule.maxClasses) || 0, fechas.length || 24),
        mergedFrom: Array.from(new Set([...(targetSchedule.mergedFrom || []), sourceKey])),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      };
      await setDoc(targetScheduleRef, after, { merge: true });
      await deleteDoc(sourceScheduleRef);
      await logAudit('programacion', targetKey, 'merge-student', { source: sourceSchedule, target: targetSchedule }, after);
      summary.programacion = 1;
    }

    const sourceStudentRef = doc(env.db, 'students', sourceKey);
    const sourceStudentSnap = await getDoc(sourceStudentRef);
    if (sourceStudentSnap.exists()) {
      await deleteDoc(sourceStudentRef);
      await logAudit('students', sourceKey, 'merge-delete', sourceStudentSnap.data(), { mergedInto: targetKey });
      summary.studentsDeleted = 1;
    }
    const sourceComputedRef = doc(env.db, 'studentComputed', sourceKey);
    const sourceComputedSnap = await getDoc(sourceComputedRef);
    if (sourceComputedSnap.exists()) await deleteDoc(sourceComputedRef);

    await recalculateStudent(targetKey);
    clearCache();
    await logAudit('students', targetKey, 'merge-student', { sourceKey }, { targetKey, targetName, summary });
    notifyFirestoreChange({ entity: 'students', action: 'merge', id: targetKey, studentId: targetKey, sourceStudentId: sourceKey });
    return { ok: true, sourceKey, targetKey, targetName, summary };
  }

  window.RIPRepository = {
    loadRegistro, loadStudents, loadProgramacion, loadComputed,
    loadClientesB2C, loadPrimeraVez,
    addRegistroRow, addRegistroRowsBulk, updateRegistroRow, deleteRegistroRow,
    addPrimeraVez, updatePrimeraVez, deletePrimeraVez,
    loadPaymentMeta, savePaymentTransaction, addClienteB2C, updateClienteB2C,
    mergeStudents,
    loadStudentSchedule, saveSchedule, saveScheduleFrom,
    recalculateStudent, recalculateAllStudents, logAudit,
    normalizeRegistro, getDefaultServices, mergeServiceMeta, clearCache
  };
})();
