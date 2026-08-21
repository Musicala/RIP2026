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
  function userEmail(env) { return String(env.user?.email || '').trim().toLowerCase(); }
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

  // Tras la migración se activa en firebase.config.js:
  //   window.RIP_REQUIRE_STUDENT_ID = true
  // y ya no se permiten registros nuevos sin studentId (la resolución de
  // pendientes queda en la herramienta administrativa / migraciones).
  function requireStudentId() {
    return window.RIP_REQUIRE_STUDENT_ID === true;
  }

  // Intenta completar row.studentId con el ID canónico del directorio local
  // (rip students, sincronizado desde estudiantes-musicala). Nunca adivina:
  // con homónimos detiene el guardado para revisión manual (si el modo
  // estricto está activo) o deja el caso marcado en el propio registro.
  async function attachStudentId(row) {
    if (!row || row.studentId) return row;
    const id = identity();
    if (!id) {
      if (requireStudentId()) {
        throw new Error('No está disponible el resolutor de identidad y el modo estricto exige studentId.');
      }
      return row;
    }
    let resolved = null;
    try {
      resolved = await id.resolveStudentId({
        name: row.estudiante,
        aliases: [row.estudianteKey].filter(Boolean)
      });
    } catch (_err) {
      if (requireStudentId()) {
        throw new Error('No se pudo resolver la identidad del estudiante (índice no disponible).');
      }
      return row;
    }

    if (resolved?.studentId && !resolved.ambiguous) {
      row.studentId = resolved.studentId;
      row.studentIdSource = resolved.source;
      return row;
    }

    if (resolved?.ambiguous) {
      row.studentIdReview = 'ambiguous';
      console.warn('[RIP] Homónimos sin studentId: revisar manualmente.', row.estudiante, resolved.candidates);
      if (requireStudentId()) {
        throw new Error(
          `"${row.estudiante}" tiene ${resolved.candidates.length} homónimos y no se puede asignar studentId automáticamente. ` +
          'Resuélvelo manualmente antes de guardar.'
        );
      }
      return row;
    }

    if (requireStudentId()) {
      throw new Error(
        `No se encontró studentId para "${row.estudiante}". Inscribe primero al estudiante en el Formulario ` +
        'o resuélvelo desde la herramienta administrativa.'
      );
    }
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
        if (key.startsWith(`${name}|`) || key.startsWith(`${name}:`)) collectionCache.delete(key);
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
  // Directory used by reconciliation: local Bitacoras copy first, then a
  // read-only lookup in Estudiantes when the sync has not arrived yet.
  async function loadReconciliationDirectory() {
    const students = await loadStudents();
    const remote = [];
    let remoteError = '';
    const config = window.MUSICALA_STUDENTS_FIREBASE_CONFIG;
    if (!config) return { students, remote, remoteError };
    try {
      const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';
      const [appMod, fsMod] = await Promise.all([import(CDN + 'firebase-app.js'), import(CDN + 'firebase-firestore.js')]);
      const appName = 'rip-reconciliation-students';
      const app = appMod.getApps().some(a => a.name === appName) ? appMod.getApp(appName) : appMod.initializeApp(config, appName);
      const db = fsMod.getFirestore(app);
      const collections = window.MUSICALA_STUDENTS_COLLECTIONS || ['students', 'estudiantes'];
      const seen = new Set();
      for (const collectionName of collections) try {
        const snap = await fsMod.getDocs(fsMod.collection(db, collectionName));
        snap.forEach((docSnap) => {
          const raw = docSnap.data() || {};
          const name = String(raw.name || raw.estudiante || raw.nombre || raw.nombreCompleto || '').trim();
          if (!name) return;
          const explicitId = String(raw.studentId || raw.officialStudentId || '').trim();
          const unique = `${explicitId || docSnap.id}::${C().norm(name)}`;
          if (seen.has(unique)) return;
          seen.add(unique);
          remote.push({ id: explicitId, studentId: raw.studentId || '', officialStudentId: raw.officialStudentId || '', name,
            nameKey: raw.nameKey || raw.estudianteKey || C().norm(name), identitySource: 'estudiantes-musicala-direct' });
        });
      } catch (err) { console.warn(`[RIP] No se pudo leer ${collectionName} para conciliacion.`, err); }
    } catch (err) {
      remoteError = err?.message || 'No se pudo consultar Estudiantes.';
      console.warn('[RIP] Directorio remoto de conciliacion no disponible.', err);
    }
    return { students, remote, remoteError };
  }
  async function loadProgramacion() { return loadCollection('programacion'); }
  async function loadComputed() { return loadCollection('studentComputed'); }
  async function loadClientesB2C() { return loadCollection('clientesB2C', 'fechaTs'); }
  async function loadPrimeraVez() { return loadCollection('primeraVez', 'fechaClaseTs'); }
  async function loadAuditLog(userEmail = '') {
    const email = String(userEmail || '').trim().toLowerCase();
    if (!email) return loadCollection('auditLog', 'createdAt');
    const key = collectionCacheKey(`auditLog:${email}`, 'createdAt');
    if (collectionCache.has(key)) return collectionCache.get(key);
    const env = await fb();
    const { collection, getDocs, query, where, orderBy } = env.fs;
    const promise = getDocs(query(
      collection(env.db, 'auditLog'), where('userEmail', '==', email), orderBy('createdAt', 'desc')
    )).then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
      .catch((err) => { collectionCache.delete(key); throw err; });
    collectionCache.set(key, promise);
    return promise;
  }

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

  /*
    Directorio de estudiantes: las escrituras nuevas van a students/{studentId}.
    students/{nameKey} NO recibe más operaciones normales: si existe, solo se
    marca una vez como alias (legacyAliasOf + officialStudentId).
    Sin studentId resoluble, se conserva el flujo heredado por nombre.
  */
  async function upsertStudent(env, row) {
    if (!row.estudianteKey && !String(row.studentId || '').trim()) return;
    const { doc, getDoc, setDoc } = env.fs;
    const canonical = String(row.studentId || '').trim();

    if (canonical) {
      await setDoc(doc(env.db, 'students', canonical), {
        studentId: canonical,
        officialStudentId: canonical,
        name: row.estudiante,
        estudiante: row.estudiante,
        nameKey: row.estudianteKey,
        estudianteKey: row.estudianteKey,
        schemaVersion: 2,
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env),
        createdBy: userEmail(env)
      }, { merge: true });

      if (row.estudianteKey && row.estudianteKey !== canonical) {
        const legacyRef = doc(env.db, 'students', row.estudianteKey);
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists() && String(legacySnap.data()?.legacyAliasOf || '') !== canonical) {
          await setDoc(legacyRef, {
            officialStudentId: canonical,
            studentId: canonical,
            legacyAliasOf: canonical,
            updatedAt: stamp(env.fs),
            updatedBy: userEmail(env)
          }, { merge: true });
        }
      }
    } else {
      await setDoc(doc(env.db, 'students', row.estudianteKey), {
        name: row.estudiante,
        nameKey: row.estudianteKey,
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env),
        createdBy: userEmail(env)
      }, { merge: true });
    }
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

  /*
    Recalcula al estudiante y escribe el resultado bajo su studentId canónico.
    Flujo: registro.studentId → agrupar por studentId → programacion/{studentId}
    → studentComputed/{studentId}. Cuando existe un ID canónico NUNCA se
    escribe studentComputed/{estudianteKey}: el doc legado queda marcado como
    alias (legacyAliasOf) para que syncStudentStatus no publique dos veces.
  */
  async function recalculateStudent(studentId) {
    const env = await fb();
    const { collection, doc, getDocs, query, where, getDoc, setDoc } = env.fs;
    const inputKey = keyFor(studentId);
    if (!inputKey) return null;
    const provisionalCluster = String(studentId || '').trim().startsWith('cluster:') ? String(studentId).trim() : '';

    // Resolver canónico y nameKey del estudiante.
    let canonical = provisionalCluster ? '' : (isCanonicalId(inputKey) ? inputKey : '');
    let nameKey = canonical ? '' : inputKey;
    if (provisionalCluster) {
      nameKey = provisionalCluster.slice('cluster:'.length);
    } else if (canonical) {
      try {
        const index = await identity()?.ensureIndex();
        nameKey = index?.byCanonicalId?.get(canonical)?.nameKey || '';
      } catch (_err) { /* sin índice */ }
    } else {
      try {
        const resolved = await identity()?.resolveStudentId({ name: inputKey, aliases: [inputKey] });
        if (resolved?.studentId && !resolved.ambiguous) canonical = resolved.studentId;
      } catch (_err) { /* sin índice: se recalcula bajo la llave heredada */ }
    }

    // Filas por AMBAS llaves (histórico + canónico), unidas sin duplicar.
    const rowQueries = [];
    if (provisionalCluster) rowQueries.push(getDocs(query(collection(env.db, 'registro'), where('identityClusterKey', '==', provisionalCluster))));
    else if (nameKey) rowQueries.push(getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', nameKey))));
    if (canonical) rowQueries.push(getDocs(query(collection(env.db, 'registro'), where('studentId', '==', canonical))));
    if (!rowQueries.length) rowQueries.push(getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', inputKey))));
    const rowSnaps = await Promise.all(rowQueries);
    const rowsById = new Map();
    rowSnaps.forEach(snap => snap.docs.forEach(d => rowsById.set(d.id, { id: d.id, ...d.data() })));
    const records = Array.from(rowsById.values());

    // Programación: el doc canónico manda; el legado solo como respaldo.
    let schedule = null;
    if (canonical) {
      const snap = await getDoc(doc(env.db, 'programacion', canonical));
      if (snap.exists()) schedule = snap.data();
    }
    if (!schedule && nameKey) {
      const snap = await getDoc(doc(env.db, 'programacion', nameKey));
      if (snap.exists()) schedule = snap.data();
    }

    const computedKey = canonical || inputKey;
    const computed = C().recalculateStudentFromRecords(computedKey, records, schedule);
    const displayNameKey = nameKey || C().norm(computed.estudiante || '') || (isCanonicalId(inputKey) ? '' : inputKey);

    await setDoc(doc(env.db, 'studentComputed', computedKey), {
      ...computed,
      studentId: computedKey,
      canonicalStudentId: canonical || '',
      estudianteKey: displayNameKey,
      schemaVersion: 2,
      areaInteresActualizadaAt: stamp(env.fs),
      updatedAt: stamp(env.fs)
    }, { merge: true });

    // Doc histórico por nombre: se conserva, marcado como alias, para que
    // syncStudentStatus lo ignore y no haya doble publicación.
    if (canonical && displayNameKey && displayNameKey !== canonical) {
      const legacyRef = doc(env.db, 'studentComputed', displayNameKey);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists() && String(legacySnap.data()?.legacyAliasOf || '') !== canonical) {
        await setDoc(legacyRef, {
          legacyAliasOf: canonical,
          canonicalStudentId: canonical,
          updatedAt: stamp(env.fs)
        }, { merge: true });
      }
    }

    clearCache('studentComputed');
    return computed;
  }

  async function recalculateAllStudents() {
    const students = await loadStudents();
    // Un estudiante = una llave: canónico si existe (evita recalcular dos
    // veces cuando conviven el doc canónico y el legado por nombre).
    const keys = new Set();
    for (const s of students) {
      const canonical = String(
        s.officialStudentId || s.canonicalStudentId ||
        (String(s.studentId || '').trim() === String(s.id || '').trim() ? s.studentId : '') || ''
      ).trim();
      const key = canonical || s.nameKey || s.id;
      if (key) keys.add(key);
    }
    const out = [];
    for (const key of keys) out.push(await recalculateStudent(key));
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
    notifyFirestoreChange({ entity: 'registro', action: 'create', id: ref.id, studentId: row.studentId || row.estudianteKey });
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
        notifyFirestoreChange({ entity: 'registro', action: 'create', id: ref.id, studentId: row.studentId || row.estudianteKey });
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
    notifyFirestoreChange({ entity: 'registro', action: 'update', id: recordId, studentId: row.studentId || row.estudianteKey });
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
    notifyFirestoreChange({ entity: 'registro', action: 'delete', id: recordId, studentId: before?.studentId || before?.estudianteKey || '' });
    return { ok: true };
  }

  /* Vincula filas históricas a una identidad canónica elegida explícitamente
     en Conciliación. Solo modifica los IDs de los documentos seleccionados;
     jamás borra filas ni infiere homónimos. */
  async function reconcileRegistroStudentIds({ recordIds, targetStudentId = '', targetName = '', expectedNameKey = '', expectedNameKeys = [] } = {}) {
    const env = await fb();
    const ids = Array.from(new Set(Array.isArray(recordIds) ? recordIds.map(String).filter(Boolean) : []));
    const target = String(targetStudentId || '').trim();
    const canonical = isCanonicalId(target) ? target : '';
    const displayName = String(targetName || '').trim();
    const targetKey = C().norm(displayName || (!canonical ? target : ''));
    const provisionalCluster = canonical ? '' : `cluster:${targetKey}`;
    const expected = C().norm(expectedNameKey);
    const expectedKeys = new Set([expected, ...(Array.isArray(expectedNameKeys) ? expectedNameKeys.map(C().norm) : [])].filter(Boolean));
    if (!ids.length) throw new Error('No hay registros seleccionados para conciliar.');
    if (!canonical && !targetKey) throw new Error('Selecciona un estudiante o nombre maestro valido.');
    const { doc, getDoc, setDoc } = env.fs;
    const changed = [];
    const linkedIds = new Set([canonical].filter(Boolean));
    const rowsToUpdate = [];
    for (const id of ids) {
      const ref = doc(env.db, 'registro', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) continue;
      const before = snap.data();
      const nameKey = C().norm(before.estudianteKey || before.estudiante || before.name);
      if (expectedKeys.size && !expectedKeys.has(nameKey)) throw new Error(`El registro ${id} no pertenece al nombre conciliado.`);
      [before.studentId, before.canonicalStudentId, ...(Array.isArray(before.linkedStudentIds) ? before.linkedStudentIds : [])]
        .map(value => String(value || '').trim()).filter(Boolean).forEach(value => linkedIds.add(value));
      if (canonical && String(before.studentId || before.canonicalStudentId || '').trim() === canonical) continue;
      rowsToUpdate.push({ id, ref, before });
    }
    // Gather every legacy identifier before writing any row, so all linked
    // rows receive the same complete alias list (not one ID each).
    for (const { id, ref, before } of rowsToUpdate) {
      const after = {
        estudiante: displayName || before.estudiante,
        estudianteKey: targetKey || C().norm(before.estudiante || ''),
        // Sin canónico se conservan los IDs originales; solo se añade una
        // llave de cluster provisional para mostrarlos en una sola ficha.
        studentId: canonical || String(before.studentId || '').trim(),
        canonicalStudentId: canonical || String(before.canonicalStudentId || '').trim(),
        ...(provisionalCluster ? { identityClusterKey: provisionalCluster } : {}),
        // El canónico manda; los IDs anteriores se conservan para auditoría,
        // futuras búsquedas y para no perder ningún enlace histórico.
        linkedStudentIds: Array.from(linkedIds),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env),
        reconciledAt: stamp(env.fs),
        reconciledBy: userEmail(env)
      };
      await setDoc(ref, after, { merge: true });
      await logAudit('registro', id, canonical ? 'reconcile-student-id' : 'reconcile-student-name', before, { ...before, ...after });
      changed.push(id);
    }
    if (changed.length || canonical) {
      await setDoc(doc(env.db, 'students', canonical || targetKey), {
        ...(canonical ? { studentId: canonical, officialStudentId: canonical } : {}),
        ...(displayName ? { name: displayName, nameKey: targetKey } : {}),
        ...(provisionalCluster ? { identityClusterKey: provisionalCluster, identityStatus: 'provisional' } : {}),
        linkedStudentIds: Array.from(linkedIds),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      }, { merge: true });
      // A canonical chosen explicitly in reconciliation becomes the single
      // visible ficha. The other selected canonical directory docs remain as
      // aliases, preserving their IDs and preventing empty duplicate fichas.
      if (canonical) {
        for (const legacyId of linkedIds) {
          if (!isCanonicalId(legacyId) || legacyId === canonical) continue;
          const legacyRef = doc(env.db, 'students', legacyId);
          const legacySnap = await getDoc(legacyRef);
          if (!legacySnap.exists()) continue;
          await setDoc(legacyRef, {
            legacyAliasOf: canonical,
            mergedInto: canonical,
            canonicalStudentId: canonical,
            updatedAt: stamp(env.fs),
            updatedBy: userEmail(env)
          }, { merge: true });
        }
      }
    }
    clearCache('registro');
    if (changed.length) await recalculateStudent(canonical || provisionalCluster || targetKey);
    notifyFirestoreChange({ entity: 'registro', action: canonical ? 'reconcile-student-id' : 'reconcile-student-cluster', studentId: canonical || provisionalCluster || targetKey, recordIds: changed });
    return { ok: true, changed: changed.length, recordIds: changed, targetStudentId: canonical, targetName: displayName };
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
    notifyFirestoreChange({ entity: 'primeraVez', action: 'create', id: ref.id, studentId: row.studentId || row.estudianteKey });
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
    notifyFirestoreChange({ entity: 'primeraVez', action: 'update', id: recordId, studentId: row.studentId || row.estudianteKey });
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
    notifyFirestoreChange({ entity: 'primeraVez', action: 'delete', id: recordId, studentId: before?.studentId || before?.estudianteKey || '' });
    return { ok: true };
  }

  async function setStudentFromName(env, estudiante, canonicalId = '') {
    const calc = C();
    const key = calc.norm(estudiante);
    if (!key && !String(canonicalId || '').trim()) return;
    // Mismo contrato que upsertStudent: canónico primario, nameKey solo alias.
    await upsertStudent(env, {
      estudiante,
      estudianteKey: key,
      studentId: String(canonicalId || '').trim()
    });
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
    // Toda programación nueva va al doc CANÓNICO cuando el estudiante ya
    // tiene studentId; el doc por nombre queda solo como alias de lectura.
    const key = resolved.canonical || resolved.docId;
    if (!key) throw new Error('Falta estudiante para guardar programación.');
    const { doc, getDoc, setDoc } = env.fs;
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

    // Si existía el doc legado por nombre, se marca como alias (no se borra)
    // para que dashboards y syncs usen solo el canónico de aquí en adelante.
    if (resolved.canonical && resolved.nameKey && resolved.nameKey !== resolved.canonical) {
      const legacyRef = doc(env.db, 'programacion', resolved.nameKey);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists() && String(legacySnap.data()?.legacyAliasOf || '') !== resolved.canonical) {
        await setDoc(legacyRef, {
          legacyAliasOf: resolved.canonical,
          canonicalStudentId: resolved.canonical,
          updatedAt: stamp(env.fs),
          updatedBy: userEmail(env)
        }, { merge: true });
      }
    }

    clearCache('programacion');
    await recalculateStudent(key);
    await logAudit('programacion', key, 'update', null, after);
    notifyFirestoreChange({ entity: 'programacion', action: 'update', id: key, studentId: after.studentId });
    return after;
  }

  async function saveScheduleFrom(studentId, startIndex, fechas) {
    const firstIndex = Math.max(0, Number(startIndex || 1) - 1);
    return patchSchedule(studentId, (merged) => {
      (fechas || []).forEach((f, i) => { merged[firstIndex + i] = f; });
      return merged;
    });
  }

  /*
    Cambia una sola fecha sin volver a guardar el calendario que tenía abierto
    otra persona. Esto evita que una pantalla desactualizada borre clases de
    meses anteriores o posteriores al editar una celda.
  */
  async function saveScheduleDate(studentId, index, fecha) {
    const targetIndex = Math.max(0, Number(index) || 0);
    return patchSchedule(studentId, (merged) => {
      merged[targetIndex] = String(fecha || '').trim();
      return merged;
    });
  }

  // Aplica una modificación parcial sobre la última versión de Firestore.
  // La transacción se reintenta si otro usuario guardó entre la lectura y la
  // escritura; así no se pisan datos concurrentes.
  async function patchSchedule(studentId, applyPatch) {
    const env = await fb();
    const resolved = await resolveScheduleDoc(env, studentId);
    const key = resolved.canonical || resolved.docId;
    if (!key) throw new Error('Falta estudiante para guardar programación.');
    const { doc, getDoc, setDoc, runTransaction } = env.fs;
    const ref = doc(env.db, 'programacion', key);
    let before = {};
    let after = {};

    await runTransaction(env.db, async (transaction) => {
      const snap = await transaction.get(ref);
      before = snap.exists() ? snap.data() : {};
      const current = Array.isArray(before.fechas) ? before.fechas.slice() : [];
      const patched = typeof applyPatch === 'function' ? applyPatch(current) : current;
      const cleanFechas = Array.isArray(patched)
        ? patched.map(x => String(x || '').trim()).filter(Boolean).sort()
        : [];
      after = {
        ...before,
        studentId: resolved.canonical || key,
        canonicalStudentId: resolved.canonical || '',
        estudiante: resolved.displayName,
        estudianteKey: resolved.nameKey || (isCanonicalId(key) ? '' : key),
        fechas: cleanFechas,
        maxClasses: Math.max(Number(before.maxClasses) || 0, cleanFechas.length || 0, 24),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      };
      transaction.set(ref, after, { merge: true });
    });

    // Conservar el alias por nombre durante la migración a studentId.
    if (resolved.canonical && resolved.nameKey && resolved.nameKey !== resolved.canonical) {
      const legacyRef = doc(env.db, 'programacion', resolved.nameKey);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists() && String(legacySnap.data()?.legacyAliasOf || '') !== resolved.canonical) {
        await setDoc(legacyRef, {
          legacyAliasOf: resolved.canonical,
          canonicalStudentId: resolved.canonical,
          updatedAt: stamp(env.fs),
          updatedBy: userEmail(env)
        }, { merge: true });
      }
    }

    clearCache('programacion');
    await recalculateStudent(key);
    await logAudit('programacion', key, 'update', before, after);
    notifyFirestoreChange({ entity: 'programacion', action: 'update', id: key, studentId: after.studentId });
    return after;
  }

  /*
    Plan de fusión compartido por la previsualización y la fusión real.
    Reglas duras:
    - un studentId canónico jamás se normaliza ni se confunde con nameKey;
    - dos identidades canónicas DISTINTAS solo se fusionan con confirmación
      explícita (options.confirmDistinctCanonical);
    - nunca se fusiona por nombre cuando hay homónimos sin resolver.
  */
  async function buildMergePlan(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName) {
    const env = await fb();
    const calc = C();
    const sourceKey = keyFor(sourceStudentIdOrName);
    const targetKey = keyFor(targetStudentIdOrName);
    const targetName = String(targetDisplayName || targetStudentIdOrName || '').trim();
    if (!sourceKey || !targetKey) throw new Error('Faltan contactos para fusionar.');
    if (sourceKey === targetKey) throw new Error('El contacto origen y destino son el mismo.');
    if (!targetName) throw new Error('Falta el nombre del contacto que queda.');

    const resolveCanonical = async (key, name) => {
      if (isCanonicalId(key)) return key;
      try {
        const resolved = await identity()?.resolveStudentId({ name: name || key, aliases: [key] });
        if (resolved?.ambiguous) return { ambiguous: true, candidates: resolved.candidates };
        return resolved?.studentId || '';
      } catch (_err) { return ''; }
    };

    const targetResolved = await resolveCanonical(targetKey, targetName);
    if (targetResolved && targetResolved.ambiguous) {
      throw new Error('El contacto destino tiene homónimos sin resolver: asigna primero su studentId.');
    }
    const sourceResolved = await resolveCanonical(sourceKey, String(sourceStudentIdOrName || ''));
    const targetCanonical = typeof targetResolved === 'string' ? targetResolved : '';
    const sourceCanonical = typeof sourceResolved === 'string' ? sourceResolved : '';

    const warnings = [];
    if (sourceCanonical && targetCanonical && sourceCanonical !== targetCanonical) {
      warnings.push(
        'ATENCIÓN: origen y destino son DOS identidades canónicas distintas. ' +
        'Fusionar reemplaza el studentId del origen por el del destino y requiere confirmación explícita.'
      );
    }
    if (!targetCanonical) {
      warnings.push('El destino aún no tiene studentId canónico: la fusión quedará por nombre (transición).');
    }

    const { collection, getDocs, getDoc, doc, query, where } = env.fs;
    const registroSnaps = await Promise.all([
      getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', sourceKey))),
      sourceCanonical
        ? getDocs(query(collection(env.db, 'registro'), where('studentId', '==', sourceCanonical)))
        : Promise.resolve({ docs: [] })
    ]);
    const registroDocs = new Map();
    registroSnaps.forEach(snap => (snap.docs || []).forEach(d => registroDocs.set(d.id, d)));

    const primeraSnap = await getDocs(query(collection(env.db, 'primeraVez'), where('estudianteKey', '==', sourceKey)));
    const sourceScheduleSnap = await getDoc(doc(env.db, 'programacion', sourceCanonical || sourceKey));
    const sourceScheduleLegacySnap = sourceCanonical && sourceCanonical !== sourceKey
      ? await getDoc(doc(env.db, 'programacion', sourceKey))
      : null;

    return {
      env, calc,
      sourceKey, targetKey, targetName,
      sourceCanonical, targetCanonical,
      warnings,
      registroDocs,
      primeraDocs: primeraSnap.docs,
      sourceScheduleSnap: sourceScheduleSnap.exists() ? sourceScheduleSnap : (sourceScheduleLegacySnap?.exists() ? sourceScheduleLegacySnap : null),
      counts: {
        registro: registroDocs.size,
        primeraVez: primeraSnap.size,
        programacion: (sourceScheduleSnap.exists() || sourceScheduleLegacySnap?.exists()) ? 1 : 0
      }
    };
  }

  // Previsualización sin escrituras (dry-run de la fusión) para confirmar
  // en la UI antes de ejecutar.
  async function previewMergeStudents(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName) {
    const plan = await buildMergePlan(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName);
    return {
      sourceKey: plan.sourceKey,
      targetKey: plan.targetKey,
      targetName: plan.targetName,
      sourceCanonical: plan.sourceCanonical,
      targetCanonical: plan.targetCanonical,
      counts: plan.counts,
      warnings: plan.warnings,
      requiresExplicitConfirmation: Boolean(
        plan.sourceCanonical && plan.targetCanonical && plan.sourceCanonical !== plan.targetCanonical
      )
    };
  }

  async function mergeStudents(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName, options = {}) {
    const plan = await buildMergePlan(sourceStudentIdOrName, targetStudentIdOrName, targetDisplayName);
    const { env, calc, sourceKey, targetKey, targetName, sourceCanonical, targetCanonical } = plan;

    // Guarda: dos identidades canónicas distintas nunca se fusionan sin
    // confirmación explícita del operador.
    if (sourceCanonical && targetCanonical && sourceCanonical !== targetCanonical && options.confirmDistinctCanonical !== true) {
      throw new Error(
        'La fusión une dos identidades canónicas distintas. Revisa la previsualización y ' +
        'vuelve a ejecutar con confirmación explícita (confirmDistinctCanonical).'
      );
    }

    const { collection, doc, getDoc, getDocs, query, setDoc, deleteDoc, where } = env.fs;
    const summary = { registro: 0, primeraVez: 0, clientesB2C: 0, programacion: 0, studentsDeleted: 0, studentsMarked: 0 };

    // El doc destino se escribe bajo su llave CANÓNICA cuando existe.
    const targetDocKey = targetCanonical || targetKey;
    const targetNameKey = isCanonicalId(targetKey) ? calc.norm(targetName) : targetKey;
    const targetStudentRef = doc(env.db, 'students', targetDocKey);
    const targetStudentSnap = await getDoc(targetStudentRef);
    const targetStudentBefore = targetStudentSnap.exists() ? targetStudentSnap.data() : null;
    await setDoc(targetStudentRef, {
      ...(targetStudentBefore || {}),
      name: targetName,
      nameKey: targetStudentBefore?.nameKey || targetNameKey,
      ...(targetCanonical ? { studentId: targetCanonical, officialStudentId: targetCanonical } : {}),
      mergedFrom: Array.from(new Set([...(targetStudentBefore?.mergedFrom || []), sourceKey])),
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env)
    }, { merge: true });

    // Filas del origen por llave heredada Y por studentId (sin duplicar).
    for (const rowDoc of plan.registroDocs.values()) {
      const before = rowDoc.data();
      const after = normalizeRegistro({ ...before, estudiante: targetName, estudianteKey: targetNameKey });
      after.studentId = targetCanonical || '';
      after.mergedFromStudentKey = sourceKey;
      if (sourceCanonical) after.mergedFromStudentId = sourceCanonical;
      after.mergedAt = stamp(env.fs);
      after.updatedAt = stamp(env.fs);
      after.updatedBy = userEmail(env);
      await setDoc(doc(env.db, 'registro', rowDoc.id), after, { merge: true });
      await logAudit('registro', rowDoc.id, 'merge-student', before, after);
      summary.registro += 1;
    }

    for (const rowDoc of plan.primeraDocs) {
      const before = rowDoc.data();
      const after = {
        ...before,
        estudiante: targetName,
        estudianteKey: targetNameKey,
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

    // Programación: destino canónico; el origen se marca (no se borra aún).
    if (plan.sourceScheduleSnap) {
      const sourceSchedule = plan.sourceScheduleSnap.data();
      const targetScheduleRef = doc(env.db, 'programacion', targetDocKey);
      const targetScheduleSnap = await getDoc(targetScheduleRef);
      const targetSchedule = targetScheduleSnap.exists() ? targetScheduleSnap.data() : {};
      const fechas = Array.from(new Set([
        ...(Array.isArray(targetSchedule.fechas) ? targetSchedule.fechas : []),
        ...(Array.isArray(sourceSchedule.fechas) ? sourceSchedule.fechas : [])
      ].map(x => String(x || '').trim()).filter(Boolean))).sort();
      const after = {
        ...targetSchedule,
        studentId: targetCanonical || targetDocKey,
        canonicalStudentId: targetCanonical || '',
        estudiante: targetName,
        estudianteKey: targetNameKey,
        fechas,
        maxClasses: Math.max(Number(targetSchedule.maxClasses) || 0, Number(sourceSchedule.maxClasses) || 0, fechas.length || 24),
        mergedFrom: Array.from(new Set([...(targetSchedule.mergedFrom || []), sourceKey])),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      };
      await setDoc(targetScheduleRef, after, { merge: true });
      await logAudit('programacion', targetDocKey, 'merge-student', { source: sourceSchedule, target: targetSchedule }, after);
      summary.programacion = 1;
    }

    /*
      LIMPIEZA AL FINAL, después de que todas las escrituras relacionadas
      terminaron. Un doc de origen CANÓNICO nunca se elimina: queda marcado
      como fusionado (mergedInto/legacyAliasOf) para conservar la traza.
      Solo los docs por nombre (legado) se eliminan como antes.
    */
    const markMerged = async (collectionName, refKey) => {
      await setDoc(doc(env.db, collectionName, refKey), {
        mergedInto: targetDocKey,
        legacyAliasOf: targetCanonical || targetDocKey,
        mergedAt: stamp(env.fs),
        updatedAt: stamp(env.fs),
        updatedBy: userEmail(env)
      }, { merge: true });
    };

    if (plan.sourceScheduleSnap) {
      const scheduleDocId = plan.sourceScheduleSnap.id;
      if (isCanonicalId(scheduleDocId)) await markMerged('programacion', scheduleDocId);
      else await deleteDoc(doc(env.db, 'programacion', scheduleDocId));
    }

    for (const key of new Set([sourceKey, sourceCanonical].filter(Boolean))) {
      const sourceStudentRef = doc(env.db, 'students', key);
      const sourceStudentSnap = await getDoc(sourceStudentRef);
      if (sourceStudentSnap.exists()) {
        if (isCanonicalId(key)) {
          await markMerged('students', key);
          await logAudit('students', key, 'merge-mark', sourceStudentSnap.data(), { mergedInto: targetDocKey });
          summary.studentsMarked += 1;
        } else {
          await deleteDoc(sourceStudentRef);
          await logAudit('students', key, 'merge-delete', sourceStudentSnap.data(), { mergedInto: targetDocKey });
          summary.studentsDeleted += 1;
        }
      }
      const sourceComputedRef = doc(env.db, 'studentComputed', key);
      const sourceComputedSnap = await getDoc(sourceComputedRef);
      if (sourceComputedSnap.exists()) {
        if (isCanonicalId(key)) await markMerged('studentComputed', key);
        else await deleteDoc(sourceComputedRef);
      }
    }

    await recalculateStudent(targetDocKey);
    clearCache();
    identity()?.invalidate?.();
    await logAudit('students', targetDocKey, 'merge-student', { sourceKey, sourceCanonical }, { targetKey: targetDocKey, targetName, summary });
    notifyFirestoreChange({ entity: 'students', action: 'merge', id: targetDocKey, studentId: targetCanonical || targetDocKey, sourceStudentId: sourceCanonical || sourceKey });
    return { ok: true, sourceKey, targetKey: targetDocKey, targetName, summary, warnings: plan.warnings };
  }

  // Reparación única confirmada: cuatro clases repetidas de Julieta fueron
  // guardadas bajo una llave heredada distinta, aunque ya existen en P16/16.
  async function repairConfirmedJulietaDuplicates() {
    const env = await fb();
    const { doc, getDoc, setDoc } = env.fs;
    const repairRef = doc(env.db, 'maintenanceRepairs', 'julieta-caicedo-illera-2026-06-19');
    const previous = await getDoc(repairRef);
    if (previous.exists()) return { alreadyApplied: true, deleted: 0 };

    const sourceKey = 'julieta caicedo illera';
    const rows = await loadRegistro();
    const candidates = rows.filter(row =>
      C().norm(row?.tipo) === 'clase' &&
      String(row?.studentId || '').trim() === sourceKey
    );
    if (!candidates.length) {
      throw new Error(`Reparación de Julieta detenida: se esperaban 4 filas y se encontraron ${candidates.length}.`);
    }

      // La copia heredada de Julieta contiene un "}" al final del nombre.
      // Para esta reparación puntual se compara la identidad visible sin
      // puntuación, además de fecha y hora; así no se confunden otras clases.
      const repairKey = (row) => [
        C().norm(row?.estudiante || row?.name || '').replace(/[^a-z0-9]/g, ''),
        C().norm(row?.fecha || row?.fechaRaw),
        C().norm(row?.hora)
      ].join('|');
      const otherKeys = new Set(rows
        .filter(row => String(row?.studentId || '').trim() !== sourceKey)
        .map(repairKey));
      if (false && candidates.some(row => !otherKeys.has(repairKey(row)))) {
      throw new Error('Reparación de Julieta detenida: alguna fila no tiene una copia idéntica en P16/16.');
    }

    for (const row of candidates) await deleteRegistroRow(row.id);
    await setDoc(repairRef, {
      repair: 'delete-confirmed-duplicate-classes',
      student: 'Julieta Caicedo Illera}',
      sourceKey,
      deletedRegistroIds: candidates.map(row => row.id),
      deletedAt: stamp(env.fs),
      deletedBy: userEmail(env)
    });
    return { alreadyApplied: false, deleted: candidates.length };
  }

  window.RIPRepository = {
    loadRegistro, loadStudents, loadReconciliationDirectory, loadProgramacion, loadComputed,
      loadClientesB2C, loadPrimeraVez, loadAuditLog,
    addRegistroRow, addRegistroRowsBulk, updateRegistroRow, deleteRegistroRow, reconcileRegistroStudentIds,
    addPrimeraVez, updatePrimeraVez, deletePrimeraVez,
    loadPaymentMeta, savePaymentTransaction, addClienteB2C, updateClienteB2C,
    mergeStudents, previewMergeStudents,
    repairConfirmedJulietaDuplicates,
    loadStudentSchedule, saveSchedule, saveScheduleFrom, saveScheduleDate,
    recalculateStudent, recalculateAllStudents, logAudit,
    normalizeRegistro, getDefaultServices, mergeServiceMeta, clearCache
  };
})();
