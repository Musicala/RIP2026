/* global window, document */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    dropZone: $('dropZone'),
    csvFile: $('csvFile'),
    kpiReady: $('kpiReady'),
    kpiDupes: $('kpiDupes'),
    kpiInvalid: $('kpiInvalid'),
    btnUpload: $('btnUpload'),
    btnRefresh: $('btnRefresh'),
    btnClear: $('btnClear'),
    status: $('status'),
    uploadSuccess: $('uploadSuccess'),
    previewBody: $('previewBody'),
    calendarTitle: $('calendarTitle'),
    calendarSub: $('calendarSub'),
    calendarGrid: $('calendarGrid'),
    monthNavTitle: $('monthNavTitle'),
    prevMonth: $('prevMonth'),
    nextMonth: $('nextMonth'),
    toastWrap: $('toastWrap')
  };

  let rawRows = [];
  let previewRows = [];
  let uploadRows = [];
  let duplicateRows = [];
  let invalidRows = [];
  let existingHashes = new Set();
  let existingDates = new Set();
  let officialStudentsByEmail = new Map();
  let officialStudentsLoaded = false;
  let officialStudentsError = '';
  let officialStudentsReadStats = { collections: 0, docs: 0, emails: 0 };
  let localStudents = [];
  let localEmailLinks = new Map();
  const today = new Date();
  let calendarYear = today.getFullYear();
  let calendarMonth = today.getMonth();
  let holidayDates = new Set();

  init();

  async function init() {
    wire();
    holidayDates = getColombiaHolidays(calendarYear);
    renderCalendar();
    setStatus('Conectando con Firebase...');
    await window.RIPFirebase.ready;
    await refreshExisting();
    await loadLocalEmailLinks();
    await loadOfficialStudentsIndex();
    setStatus('Listo para cargar CSV. ' + officialStudentsByEmail.size + ' estudiantes activos por correo.');
  }

  function wire() {
    els.csvFile.addEventListener('change', () => {
      const file = els.csvFile.files && els.csvFile.files[0];
      if (file) loadFile(file);
    });
    els.dropZone.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      els.dropZone.classList.add('drag');
    });
    els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag'));
    els.dropZone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      els.dropZone.classList.remove('drag');
      const file = ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) loadFile(file);
    });
    els.previewBody.addEventListener('input', onEditCell);
    els.btnUpload.addEventListener('click', upload);
    els.btnRefresh.addEventListener('click', refreshExisting);
    els.btnClear.addEventListener('click', clearAll);
    els.prevMonth.addEventListener('click', () => {
      calendarMonth--;
      if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
      }
      holidayDates = getColombiaHolidays(calendarYear);
      renderCalendar();
    });
    els.nextMonth.addEventListener('click', () => {
      calendarMonth++;
      if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
      }
      holidayDates = getColombiaHolidays(calendarYear);
      renderCalendar();
    });
  }

  async function refreshExisting() {
    setStatus('Leyendo clases existentes...');
    const [registro, students, programacion] = await Promise.all([
      window.RIPRepository.loadRegistro(),
      window.RIPRepository.loadStudents(),
      window.RIPRepository.loadProgramacion()
    ]);
    buildLocalStudentIndex(registro, students, programacion);
    existingHashes = new Set(registro.map(r => r.recordHash).filter(Boolean));
    const classDates = registro
      .filter(r => norm(r.tipo) === 'clase')
      .map(r => r.fecha || r.fechaRaw)
      .filter(Boolean);
    holidayDates = getColombiaHolidays(calendarYear);
    existingDates = new Set(classDates.filter(d => shouldCountClassDate(d)));
    applyDedupe();
    render();
    renderCalendar();
    setStatus(`Listo. ${existingHashes.size} registros existentes revisados.`);
  }

  async function loadFile(file) {
    hideUploadSuccess();
    setStatus('Leyendo CSV...');
    const text = await file.text();
    await ensureOfficialStudentsIndex();
    const objects = parseCSV(text);
    rawRows = objects.map((row, idx) => fromWixRow(row, idx));
    applyDedupe();
    render();
    setStatus(`CSV cargado: ${rawRows.length} filas revisadas.`);
  }

  async function ensureOfficialStudentsIndex() {
    if (officialStudentsLoaded || officialStudentsError) return;
    await loadOfficialStudentsIndex();
  }

  async function loadOfficialStudentsIndex() {
    const config = window.MUSICALA_STUDENTS_FIREBASE_CONFIG;
    if (!config) {
      officialStudentsError = 'No esta configurado el Firestore de estudiantes activos.';
      return;
    }

    setStatus('Leyendo estudiantes activos por correo...');
    try {
      const CDN = 'https://www.gstatic.com/firebasejs/10.12.5/';
      const appMod = await import(CDN + 'firebase-app.js');
      const fsMod = await import(CDN + 'firebase-firestore.js');
      const appName = 'musicala-students-active';
      const app = appMod.getApps().some(a => a.name === appName)
        ? appMod.getApp(appName)
        : appMod.initializeApp(config, appName);
      const db = fsMod.getFirestore(app);
      const collections = window.MUSICALA_STUDENTS_COLLECTIONS || ['students', 'Students', 'estudiantes', 'Estudiantes', 'alumnos', 'Alumnos', 'usuarios', 'Usuarios'];
      const byEmail = new Map();
      let docsRead = 0;
      let collectionsRead = 0;

      for (const collectionName of collections) {
        try {
          const snap = await fsMod.getDocs(fsMod.collection(db, collectionName));
          if (!snap.empty) collectionsRead++;
          docsRead += snap.size;
          snap.forEach((docSnap) => {
            const student = normalizeOfficialStudent(docSnap.data(), docSnap.id, collectionName);
            if (!student.active || !student.emails.length) return;
            for (const email of student.emails) {
              if (!byEmail.has(email)) byEmail.set(email, student);
            }
          });
        } catch (err) {
          console.warn(`No se pudo leer ${collectionName} en estudiantes-musicala:`, err);
        }
      }

      officialStudentsByEmail = byEmail;
      officialStudentsLoaded = true;
      officialStudentsReadStats = { collections: collectionsRead, docs: docsRead, emails: byEmail.size };
      officialStudentsError = '';
      console.info('Estudiantes activos leidos:', officialStudentsReadStats);
    } catch (err) {
      console.error(err);
      officialStudentsError = err?.message || 'No se pudo cargar estudiantes activos.';
    }
  }


  function studentNameScore(value) {
    const text = String(value || '').trim();
    const upper = (text.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
    const words = norm(text).split(' ').filter(Boolean).length;
    return text.length + words * 10 + upper * 2;
  }

  function buildLocalStudentIndex(registro, students, programacion) {
    const byKey = new Map();
    const add = (name, source, id) => {
      const clean = String(name || '').trim();
      const key = norm(clean);
      if (!clean || !key) return;
      const current = byKey.get(key);
      const next = { id: id || key, sourceCollection: source || 'rip', name: clean, nameKey: key, emails: [], active: true };
      if (!current || studentNameScore(clean) > studentNameScore(current.name)) byKey.set(key, next);
    };
    (students || []).forEach(s => add(s.name || s.estudiante, 'rip/students', s.id || s.nameKey));
    (programacion || []).forEach(p => add(p.estudiante || p.name, 'rip/programacion', p.id || p.studentId || p.estudianteKey));
    (registro || []).forEach(r => add(r.estudiante, 'rip/registro', r.estudianteKey));
    localStudents = Array.from(byKey.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  async function loadLocalEmailLinks() {
    try {
      const env = await window.RIPFirebase.ready;
      const { collection, getDocs } = env.fs;
      const snap = await getDocs(collection(env.db, 'wixStudentEmails'));
      const links = new Map();
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const email = normalizeEmail(data.email || docSnap.id);
        const savedName = String(data.estudiante || data.name || '').trim();
        const canonical = findLocalStudentByName(savedName);
        const name = String(canonical?.name || savedName).trim();
        const key = norm(name || data.estudianteKey || '');
        if (email && name) links.set(email, {
          id: data.estudianteKey || key || docSnap.id,
          sourceCollection: 'rip/wixStudentEmails',
          name,
          nameKey: key,
          emails: [email],
          active: true
        });
      });
      localEmailLinks = links;
    } catch (err) {
      console.warn('No se pudieron leer relaciones correo-estudiante locales:', err);
      localEmailLinks = new Map();
    }
  }

  async function saveLocalEmailLink(row) {
    const email = normalizeEmail(row?.correo);
    const name = String(row?.estudianteOficial || row?.estudiante || '').trim();
    if (!email || !name) return;
    try {
      const env = await window.RIPFirebase.ready;
      const { doc, setDoc, serverTimestamp } = env.fs;
      await setDoc(doc(env.db, 'wixStudentEmails', email), {
        email,
        estudiante: name,
        estudianteKey: norm(name),
        estudianteWix: String(row.estudianteWix || '').trim(),
        source: row.officialStudentCollection || 'rip/importador',
        updatedAt: serverTimestamp(),
        updatedBy: env.user?.email || ''
      }, { merge: true });
      localEmailLinks.set(email, {
        id: norm(name),
        sourceCollection: 'rip/wixStudentEmails',
        name,
        nameKey: norm(name),
        emails: [email],
        active: true
      });
    } catch (err) {
      console.warn('No se pudo guardar relacion correo-estudiante:', err);
    }
  }

  function findLocalStudentByName(name) {
    const target = norm(name);
    if (!target) return null;
    const targetParts = target.split(' ').filter(p => p.length >= 3);
    const matches = localStudents.filter((student) => {
      const candidate = student.nameKey || norm(student.name);
      if (!candidate) return false;
      if (candidate === target || candidate.includes(target)) return true;
      if (targetParts.length >= 2) return targetParts.every(part => candidate.includes(part));
      return targetParts.length === 1 && targetParts[0].length >= 5 && candidate.includes(targetParts[0]);
    });
    const unique = [];
    const seen = new Set();
    for (const student of matches) {
      const key = student.nameKey || norm(student.name);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(student);
    }
    if (!unique.length) return null;
    unique.sort((a, b) => studentNameScore(b.name) - studentNameScore(a.name));
    return unique[0];
  }
  function normalizeEmail(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[<>"']/g, '');
  }

  function extractEmails(value) {
    const out = [];
    const visit = (v) => {
      if (v === null || v === undefined) return;
      if (Array.isArray(v)) return v.forEach(visit);
      if (typeof v === 'object') return Object.values(v).forEach(visit);
      const text = String(v || '').toLowerCase();
      const matches = text.match(/[a-z0-9._%+-]+\s*@\s*[a-z0-9.-]+\s*\.\s*[a-z]{2,}/gi) || [];
      matches.forEach(m => {
        const email = normalizeEmail(m);
        if (email.includes('@')) out.push(email);
      });
    };
    visit(value);
    return out;
  }

  function findOfficialStudentByEmail(email) {
    const target = normalizeEmail(email);
    if (!target) return null;
    const exact = officialStudentsByEmail.get(target);
    if (exact) return exact;
    const localExact = localEmailLinks.get(target);
    if (localExact) return localExact;

    const targetUser = target.split('@')[0] || target;
    const matches = [];
    for (const [candidate, student] of officialStudentsByEmail.entries()) {
      const c = normalizeEmail(candidate);
      if (!c) continue;
      const cUser = c.split('@')[0] || c;
      if (
        c.includes(target) ||
        target.includes(c) ||
        (targetUser.length >= 5 && cUser.includes(targetUser)) ||
        (cUser.length >= 5 && targetUser.includes(cUser))
      ) {
        matches.push(student);
      }
    }

    const unique = [];
    const seen = new Set();
    for (const student of matches) {
      const key = `${student.sourceCollection || ''}:${student.id || student.name || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(student);
    }
    return unique.length === 1 ? unique[0] : null;
  }

  function pickObjectValue(data, names) {
    const map = new Map(Object.keys(data || {}).map(k => [norm(k), data[k]]));
    for (const name of names) {
      const value = map.get(norm(name));
      if (value !== undefined && value !== null && String(value).trim()) return value;
    }
    return '';
  }

  function collectEmails(data, id) {
    const raw = [];
    raw.push(id);
    raw.push(pickObjectValue(data, ['email', 'correo', 'correo electronico', 'correo electrónico', 'mail', 'emailEstudiante', 'email estudiante', 'correoEstudiante', 'correo estudiante', 'emailAlumno', 'email alumno', 'correoAlumno', 'correo alumno', 'emailAcudiente', 'correoAcudiente', 'correo electronico envio de guias e informacion adicional', 'correo electrónico envío de guías e información adicional', 'correo_electronico_envio_de_guias_e_informacion_adicional']));
    for (const key of ['emails', 'correos']) {
      const value = data?.[key];
      if (Array.isArray(value)) raw.push(...value);
      else if (value && typeof value === 'object') raw.push(...Object.values(value));
      else if (value) raw.push(value);
    }
    raw.push(...extractEmails(data));
    return Array.from(new Set(raw.flatMap(extractEmails).concat(raw.map(normalizeEmail)).filter(v => v.includes('@'))));
  }

  function normalizeOfficialStudent(data, id, sourceCollection) {
    const first = String(pickObjectValue(data, ['nombre', 'name', 'nombres', 'firstName', 'first name', 'nombreEstudiante', 'nombre estudiante', 'nombreAlumno', 'nombre alumno']) || '').trim();
    const last = String(pickObjectValue(data, ['apellido', 'apellidos', 'lastName', 'last name', 'apellidoEstudiante', 'apellido estudiante', 'apellidoAlumno', 'apellido alumno']) || '').trim();
    const full = String(pickObjectValue(data, ['nombre completo', 'nombreCompleto', 'fullName', 'displayName', 'estudiante', 'studentName', 'nombreEstudianteCompleto', 'nombre estudiante completo', 'nombre del estudiante', 'nombre_del_estudiante', 'nombre y apellido', 'nombre_y_apellido', 'nombres y apellidos', 'nombres_y_apellidos', 'nombre acudiente estudiante', 'alumno', 'cliente']) || '').trim();
    const firstEmail = collectEmails(data, id)[0] || '';
    const name = full || [first, last].filter(Boolean).join(' ').trim() || String(data?.nombre || data?.name || id || firstEmail).trim();
    const activeRaw = pickObjectValue(data, ['activo', 'active', 'estado', 'status', 'clasificacion', 'clasificación']);
    const activeText = norm(activeRaw);
    const inactive = activeText.includes('inactivo') || activeText.includes('inactiva') || activeText.includes('exestudiante') || activeText.includes('retirado');
    const active = activeRaw === false ? false : !inactive;
    return {
      id,
      sourceCollection,
      name,
      emails: collectEmails(data, id),
      active,
      raw: data
    };
  }

  function getWixName(row) {
    const direct = pick(row, ['Nombre del cliente', 'Cliente', 'Nombre completo', 'Name']);
    const first = pick(row, ['Nombre']);
    const last = pick(row, ['Apellido']);
    return direct || [first, last].filter(Boolean).join(' ').trim();
  }

  function fromWixRow(row, idx) {
    const correo = normalizeEmail(pick(row, ['Email', 'Correo electronico', 'Correo electrónico', 'Email del cliente']));
    const wixName = getWixName(row);
    const official = (correo ? findOfficialStudentByEmail(correo) : null) || findLocalStudentByName(wixName);
    const fechaW = pick(row, ['Hora de inicio de reserva', 'Fecha', 'Fecha de reserva', 'Start Time', 'Booking start time']);
    const item = {
      sourceIndex: idx,
      tipo: 'Clase',
      estudiante: official?.name || wixName || correo,
      estudianteWix: wixName,
      estudianteOficial: official?.name || '',
      correo,
      officialStudentId: official?.id || '',
      officialStudentCollection: official?.sourceCollection || '',
      officialMatchStatus: official ? 'matched' : (correo ? 'missing' : 'no-email'),
      fechaW,
      fecha: parseWixDate(fechaW),
      hora: parseWixTime(fechaW),
      servicio: pick(row, ['Nombre del servicio', 'Servicio', 'Service name']),
      profesor: pick(row, ['Miembro del personal', 'Profesor', 'Staff member']),
      pago: '',
      comentario: pick(row, ['Asistencia', 'Comentario', 'Comentarios', 'Notes']),
      importedFrom: 'Wix CSV'
    };
    return recompute(item);
  }
  function recompute(row) {
    const normalized = window.RIPRepository.normalizeRegistro(row);
    return {
      ...row,
      fecha: normalized.fecha,
      fechaRaw: normalized.fecha,
      fechaTs: normalized.fechaTs,
      estudianteKey: normalized.estudianteKey,
      recordHash: normalized.recordHash,
      classUniqueId: normalized.classUniqueId,
      validation: validate(normalized)
    };
  }

  function validate(normalized) {
    const issues = [];
    if (officialStudentsError) issues.push('sin validar estudiantes activos');
    if (!normalized.correo) issues.push('sin correo');
    if (!normalized.estudianteKey) issues.push('sin estudiante');
    if (!normalized.fecha) issues.push('sin fecha');
    if (!normalized.servicio) issues.push('sin servicio');
    if (normalized.fecha && !shouldCountClassDate(normalized.fecha)) issues.push(skipReason(normalized.fecha));
    return issues;
  }

  function applyDedupe() {
    const seen = new Map();
    uploadRows = [];
    duplicateRows = [];
    invalidRows = [];
    previewRows = [];

    for (const row of rawRows) {
      const item = { ...row, status: 'ok', label: row.officialMatchStatus === 'matched' ? 'Correo OK' : 'Nombre Wix', reason: '' };
      if (row.validation && row.validation.length) {
        item.status = 'bad';
        item.label = 'Incompleta';
        item.reason = row.validation.join(', ');
        invalidRows.push(item);
      } else if (seen.has(row.recordHash)) {
        item.status = 'warn';
        item.label = 'Duplicada CSV';
        item.reason = `Repetida de la fila ${seen.get(row.recordHash) + 1}`;
        duplicateRows.push(item);
      } else if (existingHashes.has(row.recordHash)) {
        item.status = 'warn';
        item.label = 'Ya existe';
        item.reason = 'Ya esta subida en RIP/Firebase';
        duplicateRows.push(item);
      } else {
        seen.set(row.recordHash, row.sourceIndex);
        uploadRows.push(row);
      }
      previewRows.push(item);
    }
  }

  function onEditCell(ev) {
    const cell = ev.target.closest('[data-field]');
    if (!cell) return;
    const tr = cell.closest('tr');
    const idx = Number(tr && tr.dataset.index);
    const field = cell.dataset.field;
    const row = rawRows[idx];
    if (!row) return;
    row[field] = cell.textContent.trim();
    if (field === 'estudiante') {
      const local = findLocalStudentByName(row.estudiante);
      if (local) {
        row.estudiante = local.name;
        row.estudianteOficial = local.name;
        row.officialStudentId = local.id || local.nameKey || '';
        row.officialStudentCollection = local.sourceCollection || 'rip/local';
        row.officialMatchStatus = 'matched';
      } else {
        row.estudianteOficial = '';
        row.officialStudentId = '';
        row.officialStudentCollection = '';
        row.officialMatchStatus = row.correo ? 'missing' : 'no-email';
      }
    }
    if (field === 'fechaW') {
      row.fecha = parseWixDate(row.fechaW);
      row.hora = parseWixTime(row.fechaW);
    }
    rawRows[idx] = recompute(row);
    applyDedupe();
    render();
  }

  async function upload() {
    if (!uploadRows.length) return;
    els.btnUpload.disabled = true;
    setStatus('Subiendo clases al RIP...');
    let inserted = 0;
    let skipped = 0;
    try {
      await refreshExisting();
      const batch = [...uploadRows];
      for (const row of batch) {
        if (existingHashes.has(row.recordHash)) {
          skipped++;
          continue;
        }
        await saveLocalEmailLink(row);
        const saved = await window.RIPRepository.addRegistroRow(row);
        existingHashes.add(saved.recordHash);
        if (shouldCountClassDate(saved.fecha || saved.fechaRaw)) existingDates.add(saved.fecha || saved.fechaRaw);
        inserted++;
      }
      showUploadSuccess(inserted, skipped);
      applyDedupe();
      render();
      renderCalendar();
    } catch (err) {
      console.error(err);
      toast('Error al subir: ' + (err.message || err), 'warn');
      setStatus('Error al subir clases.');
    }
  }

  function render() {
    els.kpiReady.textContent = String(uploadRows.length);
    els.kpiDupes.textContent = String(duplicateRows.length);
    els.kpiInvalid.textContent = String(invalidRows.length);
    els.btnUpload.disabled = uploadRows.length === 0;
    els.btnClear.disabled = rawRows.length === 0;

    if (!previewRows.length) {
      els.previewBody.innerHTML = '<tr><td colspan="6" class="empty-td">Carga un CSV para revisar las clases.</td></tr>';
      return;
    }

    els.previewBody.innerHTML = previewRows.slice(0, 200).map((row) => `
      <tr data-index="${row.sourceIndex}" title="${escapeHTML(row.reason || '')}">
        <td><span class="status-pill ${row.status}">${escapeHTML(row.label)}</span></td>
        <td contenteditable="true" data-field="estudiante" title="Wix: ${escapeHTML(row.estudianteWix || '')} · Correo: ${escapeHTML(row.correo || '')}">${escapeHTML(row.estudiante)}</td>
        <td contenteditable="true" data-field="fechaW">${escapeHTML(row.fechaW)}</td>
        <td contenteditable="true" data-field="servicio">${escapeHTML(row.servicio)}</td>
        <td contenteditable="true" data-field="profesor">${escapeHTML(row.profesor)}</td>
        <td contenteditable="true" data-field="comentario">${escapeHTML(row.comentario)}</td>
      </tr>
    `).join('');
  }

  function renderCalendar() {
    const year = calendarYear;
    holidayDates = getColombiaHolidays(year);
    const stats = getMonthStats(year, calendarMonth);
    const title = monthLabel(year, calendarMonth);
    els.calendarTitle.textContent = 'Calendario';
    els.monthNavTitle.textContent = title;
    els.calendarSub.textContent = `${stats.uploaded} dias subidos, ${stats.missing} faltan. Domingos y festivos no cuentan.`;
    els.calendarGrid.innerHTML = renderMonth(year, calendarMonth);
  }

  function renderMonth(year, month) {
    const title = new Date(year, month, 1).toLocaleDateString('es-CO', { month: 'long' });
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const stats = getMonthStats(year, month);
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const firstDay = (first.getDay() + 6) % 7;
    const total = Math.ceil((firstDay + last.getDate()) / 7) * 7;
    const todayISO = toISO(new Date());
    const days = Array.from({ length: total }, (_, i) => {
      const day = i - firstDay + 1;
      const muted = day < 1 || day > last.getDate();
      const iso = muted ? '' : `${monthKey}-${String(day).padStart(2, '0')}`;
      const skip = iso && !shouldCountClassDate(iso);
      const uploaded = iso && existingDates.has(iso);
      const missing = iso && !skip && !uploaded;
      return `<div class="calendar-day ${muted ? 'muted' : ''} ${uploaded ? 'has-data' : ''} ${missing ? 'missing' : ''} ${skip ? 'skip' : ''} ${iso === todayISO ? 'today' : ''}" title="${escapeHTML(iso ? dayTitle(iso) : '')}">
        ${muted ? '' : `<strong>${day}</strong><div>${uploaded ? 'Subido' : (skip ? 'No cuenta' : 'Falta')}</div>`}
      </div>`;
    }).join('');
    return `<section class="calendar-month">
      <h4>${escapeHTML(title.charAt(0).toUpperCase() + title.slice(1))}</h4>
      <div class="mini-sub">${stats.uploaded} subidos Â· ${stats.missing} faltan</div>
      <div class="calendar-head"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div>
      <div class="calendar-mini">${days}</div>
    </section>`;
  }

  function clearAll() {
    rawRows = [];
    previewRows = [];
    uploadRows = [];
    duplicateRows = [];
    invalidRows = [];
    els.csvFile.value = '';
    hideUploadSuccess();
    render();
    setStatus('Esperando archivo');
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    const src = String(text || '').replace(/\r/g, '');
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (ch === '"' && quoted && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = !quoted;
      } else if (ch === ',' && !quoted) {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' && !quoted) {
        row.push(field.trim());
        if (row.some(Boolean)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
    row.push(field.trim());
    if (row.some(Boolean)) rows.push(row);
    const headers = (rows.shift() || []).map(h => h.trim());
    return rows.map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i] || ''; });
      return obj;
    });
  }

  function pick(row, names) {
    const map = new Map(Object.keys(row || {}).map(k => [norm(k), row[k]]));
    for (const name of names) {
      const value = map.get(norm(name));
      if (String(value || '').trim()) return String(value).trim();
    }
    return '';
  }

  function parseWixDate(value) {
    const raw = String(value || '').trim();
    let m = raw.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    m = raw.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
    if (m) {
      let yy = Number(m[3]);
      if (yy < 100) yy += 2000;
      return `${yy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    }
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? '' : toISO(d);
  }

  function parseWixTime(value) {
    const m = String(value || '').match(/(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?/i);
    if (!m) return '';
    let hh = Number(m[1]);
    const ap = String(m[3] || '').toLowerCase();
    if (ap.startsWith('p') && hh < 12) hh += 12;
    if (ap.startsWith('a') && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${m[2]}`;
  }

  function toISO(date) {
    const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 10);
  }

  function parseISODate(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function shouldCountClassDate(iso) {
    const d = parseISODate(iso);
    if (!d) return false;
    return d.getDay() !== 0 && !holidayDates.has(iso);
  }

  function skipReason(iso) {
    const d = parseISODate(iso);
    if (!d) return 'fecha invalida';
    if (d.getDay() === 0) return 'domingo no cuenta';
    if (holidayDates.has(iso)) return 'festivo no cuenta';
    return '';
  }

  function dayTitle(iso) {
    if (existingDates.has(iso)) return `${iso}: subido al RIP`;
    const reason = skipReason(iso);
    return reason ? `${iso}: ${reason}` : `${iso}: falta registrar`;
  }

  function getYearStats(year) {
    return Array.from({ length: 12 }, (_, month) => getMonthStats(year, month))
      .reduce((acc, item) => ({ uploaded: acc.uploaded + item.uploaded, missing: acc.missing + item.missing }), { uploaded: 0, missing: 0 });
  }

  function monthLabel(year, month) {
    const title = new Date(year, month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  function getMonthStats(year, month) {
    const last = new Date(year, month + 1, 0).getDate();
    let uploaded = 0;
    let missing = 0;
    for (let day = 1; day <= last; day++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!shouldCountClassDate(iso)) continue;
      if (existingDates.has(iso)) uploaded++;
      else missing++;
    }
    return { uploaded, missing };
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
    const easter = getEasterDate(year);
    [-3, -2, 43, 64, 71].forEach(offset => dates.add(toISO(addDays(easter, offset))));
    return dates;
  }

  function isoFromParts(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function nextMonday(year, month, day) {
    const date = new Date(year, month - 1, day);
    const offset = (8 - date.getDay()) % 7;
    return toISO(addDays(date, offset));
  }

  function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + days);
    return copy;
  }

  function getEasterDate(year) {
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

  function norm(value) {
    return window.RIPCalculations.norm(value);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function toast(message, tone) {
    if (window.RIPUI?.shared?.toast) window.RIPUI.shared.toast(els.toastWrap, message, tone);
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function showUploadSuccess(inserted, skipped) {
    const suffix = skipped ? ` (${skipped} duplicadas omitidas)` : '';
    els.uploadSuccess.classList.add('show');
    els.uploadSuccess.querySelector('span:last-child').textContent = `Registro subido: ${inserted} clase(s)${suffix}`;
    toast(`Registro subido: ${inserted} clase(s).`, 'ok');
    setStatus('Registro subido. Calendario actualizado.');
  }

  function hideUploadSuccess() {
    els.uploadSuccess.classList.remove('show');
  }
})();
