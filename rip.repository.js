/* global window */
(function () {
  'use strict';

  const C = () => window.RIPCalculations;
  async function fb() { return window.RIPFirebase.ready; }
  function stamp(fs) { return fs.serverTimestamp(); }
  function userEmail(env) { return env.user?.email || ''; }

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

  async function loadCollection(name, orderField) {
    const env = await fb();
    const { collection, getDocs, query, orderBy } = env.fs;
    const ref = collection(env.db, name);
    const snap = await getDocs(orderField ? query(ref, orderBy(orderField, 'desc')) : ref);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function loadRegistro() {
    const rows = await loadCollection('registro', 'fechaTs');
    return C().markDuplicateClasses(rows.map((r) => normalizeRegistro(r)));
  }

  async function loadStudents() { return loadCollection('students'); }
  async function loadProgramacion() { return loadCollection('programacion'); }
  async function loadComputed() { return loadCollection('studentComputed'); }
  async function loadClientesB2C() { return loadCollection('clientesB2C', 'fechaTs'); }
  async function loadPrimeraVez() { return loadCollection('primeraVez', 'fechaClaseTs'); }

  async function loadPaymentMeta() {
    const [students, registro] = await Promise.all([loadStudents(), loadRegistro()]);
    const studentSet = new Set();
    (students || []).forEach(s => {
      const name = String(s.name || s.estudiante || '').trim();
      if (name) studentSet.add(name);
    });
    (registro || []).forEach(r => {
      const name = String(r.estudiante || '').trim();
      if (name) studentSet.add(name);
    });
    const services = Array.from(new Set((registro || [])
      .map(r => String(r.servicio || '').trim())
      .filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'es'));
    return {
      estudiantes: Array.from(studentSet).sort((a, b) => a.localeCompare(b, 'es')),
      servicios: services.map(name => ({ name, prices: {} })),
      tiposEstudiante: ['Antiguos/Convenios', 'Nuevos'],
      mediosPago: ['Bancolombia M', 'Nequi M', 'Bold', 'Davivienda M', 'Efectivo', 'Daviplata C', 'Fesicol', 'Mercadopago', 'Addi']
    };
  }

  async function upsertStudent(env, row) {
    if (!row.estudianteKey) return;
    const { doc, setDoc } = env.fs;
    await setDoc(doc(env.db, 'students', row.estudianteKey), {
      name: row.estudiante,
      nameKey: row.estudianteKey,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env),
      createdBy: userEmail(env)
    }, { merge: true });
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
    const rowsSnap = await getDocs(query(collection(env.db, 'registro'), where('estudianteKey', '==', studentId)));
    const records = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const scheduleSnap = await getDoc(doc(env.db, 'programacion', studentId));
    const computed = C().recalculateStudentFromRecords(studentId, records, scheduleSnap.exists() ? scheduleSnap.data() : null);
    await setDoc(doc(env.db, 'studentComputed', studentId), { ...computed, updatedAt: stamp(env.fs) }, { merge: true });
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
    row.createdAt = stamp(env.fs);
    row.updatedAt = stamp(env.fs);
    row.createdBy = userEmail(env);
    row.updatedBy = userEmail(env);
    await assertNoDuplicateClass(env, row);
    await upsertStudent(env, row);
    const ref = await addDoc(collection(env.db, 'registro'), row);
    await recalculateStudent(row.estudianteKey);
    await logAudit('registro', ref.id, 'create', null, row);
    notifyFirestoreChange({ entity: 'registro', action: 'create', id: ref.id, studentId: row.estudianteKey });
    return { id: ref.id, ...row };
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
        servicio: String(u.servicio || '').trim(),
        precio: calc.safeNum(u.precio),
        ciclo: String(u.ciclo || '').trim()
      }))
      .filter(u => u.estudiante && u.servicio && u.precio > 0);
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
    const savedRows = [];
    for (const item of valid) {
      const row = await addRegistroRow({
        tipo: 'Pago',
        estudiante: item.estudiante,
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
      servicio: String(u.servicio || '').trim(),
      precio: calc.safeNum(u.precio)
    })).filter(u => u.estudiante || u.servicio || u.precio);
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
    const linkedSnap = await getDocs(query(collection(env.db, 'registro'), where('clientesB2CId', '==', recordId)));
    const linkedRows = linkedSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (Number(a.fechaTs) || 0) - (Number(b.fechaTs) || 0) || String(a.id).localeCompare(String(b.id)));
    for (let i = 0; i < clean.length; i++) {
      const item = clean[i];
      const registroData = {
        tipo: 'Pago',
        estudiante: item.estudiante,
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
    row.updatedAt = stamp(env.fs);
    row.updatedBy = userEmail(env);
    await upsertStudent(env, row);
    await setDoc(ref, row, { merge: true });
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
    row.createdAt = stamp(env.fs);
    row.updatedAt = stamp(env.fs);
    row.createdBy = userEmail(env);
    row.updatedBy = userEmail(env);
    await setStudentFromName(env, row.estudiante);
    const ref = await addDoc(collection(env.db, 'primeraVez'), row);
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
    row.updatedAt = stamp(env.fs);
    row.updatedBy = userEmail(env);
    await setStudentFromName(env, row.estudiante);
    await setDoc(ref, row, { merge: true });
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
    await logAudit('primeraVez', recordId, 'delete', before, null);
    notifyFirestoreChange({ entity: 'primeraVez', action: 'delete', id: recordId, studentId: before?.estudianteKey || '' });
    return { ok: true };
  }

  async function setStudentFromName(env, estudiante) {
    const calc = C();
    const key = calc.norm(estudiante);
    if (!key) return;
    const { doc, setDoc } = env.fs;
    await setDoc(doc(env.db, 'students', key), {
      name: estudiante,
      nameKey: key,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env),
      createdBy: userEmail(env)
    }, { merge: true });
  }

  async function loadStudentSchedule(studentIdOrName) {
    const env = await fb();
    const key = C().norm(studentIdOrName);
    const { doc, getDoc } = env.fs;
    const snap = await getDoc(doc(env.db, 'programacion', key));
    return snap.exists() ? { id: snap.id, ...snap.data() } : { studentId: key, estudiante: studentIdOrName, fechas: [] };
  }

  async function saveSchedule(studentId, fechas) {
    const env = await fb();
    const key = C().norm(studentId);
    const { doc, setDoc } = env.fs;
    const cleanFechas = Array.isArray(fechas) ? fechas.map(x => String(x || '').trim()).filter(Boolean).sort() : [];
    const after = {
      studentId: key,
      estudiante: String(studentId || ''),
      estudianteKey: key,
      fechas: cleanFechas,
      maxClasses: cleanFechas.length || 24,
      updatedAt: stamp(env.fs),
      updatedBy: userEmail(env)
    };
    await setDoc(doc(env.db, 'programacion', key), after, { merge: true });
    await recalculateStudent(key);
    await logAudit('programacion', key, 'update', null, after);
    notifyFirestoreChange({ entity: 'programacion', action: 'update', id: key, studentId: key });
    return after;
  }

  async function saveScheduleFrom(studentId, startIndex, fechas) {
    const current = await loadStudentSchedule(studentId);
    const merged = Array.isArray(current.fechas) ? current.fechas.slice() : [];
    (fechas || []).forEach((f, i) => { merged[Number(startIndex) + i] = f; });
    return saveSchedule(studentId, merged);
  }

  window.RIPRepository = {
    loadRegistro, loadStudents, loadProgramacion, loadComputed,
    loadClientesB2C, loadPrimeraVez,
    addRegistroRow, updateRegistroRow, deleteRegistroRow,
    addPrimeraVez, updatePrimeraVez, deletePrimeraVez,
    loadPaymentMeta, savePaymentTransaction, addClienteB2C, updateClienteB2C,
    loadStudentSchedule, saveSchedule, saveScheduleFrom,
    recalculateStudent, recalculateAllStudents, logAudit,
    normalizeRegistro
  };
})();
