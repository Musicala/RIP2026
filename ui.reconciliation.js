/* global window */
(function () {
  'use strict';
  const S = () => window.RIPUI?.shared;
  const canonicalId = value => /^[A-Za-z0-9_-]{16,}$/.test(String(value || '').trim());
  const key = value => S().norm(value || '');
  const email = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  const looksLikeEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email(value));

  function canonicalStudents(students) {
    const out = new Map();
    for (const student of students || []) {
      const id = String(student.officialStudentId || student.canonicalStudentId ||
        (String(student.studentId || '') === String(student.id || '') ? student.studentId : '') || '').trim();
      const name = String(student.name || student.estudiante || '').trim();
      if (!canonicalId(id) || !name) continue;
      const nameKey = key(student.nameKey || student.estudianteKey || name);
      if (!out.has(id)) out.set(id, {
        id, name, nameKey,
        emails: (Array.isArray(student.emails) ? student.emails : [student.email || student.correo || ''])
          .map(value => String(value || '').trim()).filter(Boolean)
      });
    }
    return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // El Directorio es una vista de consulta: debe mostrar todas las fichas
  // guardadas, incluso las antiguas cuyos IDs no usan el formato canónico.
  function directoryStudents(students) {
    const out = new Map();
    for (const student of students || []) {
      const name = String(student.name || student.estudiante || '').trim();
      if (!name) continue;
      const nameKey = key(student.nameKey || student.estudianteKey || name);
      const storedId = String(student.officialStudentId || student.canonicalStudentId || student.studentId || student.id || '').trim();
      const id = storedId || `name:${nameKey}`;
      const emails = (Array.isArray(student.emails) ? student.emails : [student.wixEmail || student.email || student.correo || ''])
        .map(value => email(value)).filter(Boolean);
      const existing = out.get(id);
      if (existing) {
        emails.forEach(value => existing.emails.add(value));
        continue;
      }
      out.set(id, { id, name, nameKey, emails: new Set(emails), storedId: Boolean(storedId) });
    }
    return Array.from(out.values()).map(student => ({ ...student, emails: Array.from(student.emails).sort() }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function masterStudents(students, records) {
    const out = new Map();
    const add = (raw, source) => {
      const name = String(raw?.name || raw?.estudiante || '').trim();
      const id = String(raw?.officialStudentId || raw?.canonicalStudentId || raw?.studentId || raw?.id || '').trim();
      const nameKey = key(raw?.nameKey || raw?.estudianteKey || name);
      const canonical = canonicalId(id);
      if (!nameKey) return;
      const value = canonical ? id : `name:${nameKey}`;
      if (!out.has(value)) out.set(value, {
        value, id: canonical ? id : '', name: name || nameKey, nameKey, canonical, source,
        emails: (Array.isArray(raw?.emails) ? raw.emails : [raw?.email || raw?.correo || ''])
          .map(email => String(email || '').trim()).filter(Boolean)
      });
    };
    (students || []).forEach(student => add(student, 'directorio'));
    (records || []).forEach(record => add(record, 'bitacoras'));
    return Array.from(out.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function buildCases(records, students) {
    const canonicals = canonicalStudents(students);
    const byName = new Map();
    const byEmail = new Map();
    canonicals.forEach(s => {
      if (!byName.has(s.nameKey)) byName.set(s.nameKey, []);
      byName.get(s.nameKey).push(s);
      s.emails.forEach(value => {
        const address = email(value);
        if (!address) return;
        if (!byEmail.has(address)) byEmail.set(address, []);
        byEmail.get(address).push(s);
      });
    });
    const groups = new Map();
    for (const row of records || []) {
      const visibleName = String(row.estudiante || row.name || '').trim();
      const rowEmail = email(row.correo || row.email || (looksLikeEmail(visibleName) ? visibleName : ''));
      const nameKey = key(row.estudianteKey || visibleName);
      // Los registros incompletos también deben poder repararse desde esta
      // lista: se agrupan por correo, sin fabricar una ficha provisional.
      if (!nameKey && !rowEmail) continue;
      const sourceId = String(row.studentId || row.canonicalStudentId || row.estudianteKey || nameKey).trim();
      const cluster = String(row.identityClusterKey || '').trim();
      const candidates = rowEmail ? (byEmail.get(rowEmail) || []) : (byName.get(nameKey) || []);
      // Solo se oculta cuando TODA la identidad ya está limpia. Antes una
      // fila desaparecía de Conciliación apenas studentId coincidía, aunque
      // conservara un canónico, groupKey o clúster anterior que luego volvía
      // a dividir la ficha en Buscar estudiante.
      const candidateId = candidates.length === 1 ? candidates[0].id : '';
      const storedCanonical = String(row.canonicalStudentId || '').trim();
      const storedGroup = String(row.groupKey || '').trim();
      const hasStaleIdentity = Boolean(
        (storedCanonical && storedCanonical !== candidateId) ||
        (storedGroup && storedGroup !== candidateId) ||
        cluster || String(row.identityStatus || '').trim() === 'provisional'
      );
      if (!looksLikeEmail(visibleName) && candidateId && sourceId === candidateId && !hasStaleIdentity) continue;
      // When there is no official candidate, different legacy IDs belonging
      // to the exact same normalized name are one pending case. This makes
      // aliases such as nameKey + old email link in a single action.
      const caseKey = nameKey || `correo:${rowEmail}`;
      const groupKey = cluster || ((candidates.length || canonicalId(sourceId)) ? `${caseKey}::${sourceId}` : `${caseKey}::pending`);
      if (!groups.has(groupKey)) groups.set(groupKey, {
        groupKey, name: visibleName || rowEmail || nameKey, nameKey, rowEmail, sourceId,
        sourceIds: new Set(), candidates, records: []
      });
      const group = groups.get(groupKey);
      group.sourceIds.add(sourceId);
      group.records.push(row);
    }
    return Array.from(groups.values()).map(group => ({ ...group, sourceIds: Array.from(group.sourceIds) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.sourceId.localeCompare(b.sourceId, 'es'));
  }

  // Directorio legible de relaciones. No modifica datos: permite comprobar
  // exactamente qué identificadores y nombres heredados terminan en cada
  // ficha canónica antes de hacer una conciliación o una fusión.
  function buildLinkedStudentDirectory(records, students) {
    const directoryStudentsList = directoryStudents(students);
    const byId = new Map(directoryStudentsList.map(student => [student.id, student]));
    const byName = new Map();
    const byEmail = new Map();
    directoryStudentsList.forEach(student => {
      if (!byName.has(student.nameKey)) byName.set(student.nameKey, []);
      byName.get(student.nameKey).push(student.id);
      student.emails.forEach(value => {
        const address = email(value);
        if (!address) return;
        if (!byEmail.has(address)) byEmail.set(address, []);
        byEmail.get(address).push(student.id);
      });
    });
    const out = new Map(directoryStudentsList.map(student => [student.id, {
      ...student, emails: new Set(student.emails || []), ids: new Set([student.id]), aliases: new Set(), records: 0
    }]));
    const addValues = (item, values, destination) => {
      (values || []).map(value => String(value || '').trim()).filter(Boolean)
        .forEach(value => destination.add(value));
    };
    const addStudentDocument = raw => {
      const target = String(raw?.officialStudentId || raw?.canonicalStudentId ||
        raw?.studentId || raw?.id || raw?.legacyAliasOf || '').trim();
      const item = out.get(target);
      if (!item) return;
      addValues(item, [raw.id, raw.studentId, raw.canonicalStudentId, raw.officialStudentId, ...(raw.linkedStudentIds || [])], item.ids);
      addValues(item, Array.isArray(raw.emails) ? raw.emails : [raw.wixEmail, raw.email, raw.correo], item.emails);
      addValues(item, [raw.nameKey, raw.estudianteKey, ...(raw.aliases || []), ...(raw.mergedFrom || [])], item.aliases);
      const name = String(raw.name || raw.estudiante || '').trim();
      if (name && key(name) !== item.nameKey) item.aliases.add(name);
    };
    (students || []).forEach(addStudentDocument);

    for (const record of records || []) {
      const directIds = [record.studentId, record.canonicalStudentId, ...(record.linkedStudentIds || [])]
        .map(value => String(value || '').trim()).filter(Boolean);
      const matchedIds = new Set(directIds.filter(value => out.has(value)));
      if (!matchedIds.size) {
        const rowEmail = email(record.correo || record.email || '');
        const nameKey = key(record.estudianteKey || record.estudiante || record.name);
        // El correo puede cambiar en Wix. Si no encuentra una ficha por ese
        // correo, una coincidencia única por nombre conserva ambos correos e
        // IDs en el Directorio sin mezclar homónimos.
        const emailCandidates = rowEmail ? (byEmail.get(rowEmail) || []) : [];
        const candidates = emailCandidates.length ? emailCandidates : (byName.get(nameKey) || []);
        if (candidates.length === 1) matchedIds.add(candidates[0]);
      }
      // Si un registro tiene dos IDs canónicos distintos no se adjudica a
      // ninguno: es un conflicto que debe seguir visible en pendientes.
      if (matchedIds.size !== 1) continue;
      const item = out.get(Array.from(matchedIds)[0]);
      item.records += 1;
      addValues(item, directIds, item.ids);
      addValues(item, [record.correo, record.email], item.emails);
      const name = String(record.estudiante || record.name || '').trim();
      const nameKey = key(record.estudianteKey || name);
      if (name && nameKey !== item.nameKey) item.aliases.add(name);
      else if (nameKey && nameKey !== item.nameKey) item.aliases.add(nameKey);
    }
    return Array.from(out.values()).map(item => ({
      ...item,
      ids: Array.from(item.ids).filter(value => value !== item.id).sort(),
      emails: Array.from(item.emails).map(email).filter(Boolean).sort(),
      aliases: Array.from(item.aliases).filter(value => value && value !== item.nameKey && key(value) !== item.nameKey).sort()
    })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // Conservative variant rule: only names with at least two words where the
  // shorter full name is contained in the longer one are offered together.
  // This joins “Mariana Ballen” + “Mariana Ballen Pinzon”, but not names that
  // merely share one surname.
  function samePersonVariant(a, b) {
    if (a === b) return true;
    const left = String(a || '').split(' ').filter(Boolean);
    const right = String(b || '').split(' ').filter(Boolean);
    const shorter = left.length <= right.length ? left : right;
    const longer = left.length <= right.length ? right : left;
    return shorter.length >= 2 && shorter.every(part => longer.includes(part));
  }

  function wixDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return { date: '', minute: -1, label: String(value || '') };
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).reduce((out, part) => ({ ...out, [part.type]: part.value }), {});
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    return { date: day, minute, label: `${day} ${parts.hour}:${parts.minute}` };
  }

  function registroMinute(value) {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
  }

  function isPastWixClass(item) {
    return new Date(item.inicio).getTime() < Date.now();
  }

  function renderWixClassCheck(ctx, source, wixClasses) {
    const body = document.getElementById('wixClassCheckBody');
    const status = document.getElementById('wixClassCheckStatus');
    if (!body) return;
    const directory = [...(source?.students || []), ...(source?.remoteStudents || [])];
    const emailByStudentId = new Map();
    directory.forEach(student => {
      const id = String(student.officialStudentId || student.canonicalStudentId || student.studentId || student.id || '').trim();
      const address = email((Array.isArray(student.emails) && student.emails[0]) || student.wixEmail || student.email || student.correo || '');
      if (id && address) emailByStudentId.set(id, address);
    });
    const ripClasses = (source?.records || []).filter(row => key(row?.tipo) === 'clase').map(row => ({
      row,
      correo: email(row?.correo || row?.email || emailByStudentId.get(String(row?.studentId || '').trim()) || ''),
      date: String(row?.fecha || row?.fechaRaw || '').slice(0, 10),
      minute: registroMinute(row?.hora)
    })).filter(item => item.correo && item.date);
    const usedRIP = new Set();
    const rows = [];
    (wixClasses || []).forEach(wix => {
      const at = wixDateTime(wix.inicio);
      const ripIndex = ripClasses.findIndex((rip, index) => !usedRIP.has(index) && rip.correo === email(wix.correo) && rip.date === at.date && rip.minute >= 0 && at.minute >= 0 && Math.abs(rip.minute - at.minute) <= 30);
      const past = isPastWixClass(wix);
      if (ripIndex >= 0) {
        usedRIP.add(ripIndex);
        rows.push({ tone: 'ok', status: '✓ En RIP y Wix', student: ripClasses[ripIndex].row.estudiante || wix.correo, at: at.label, rip: ripClasses[ripIndex].row.servicio || 'Clase', wix: wix.servicio || 'Clase Wix' });
      } else if (past) {
        rows.push({ tone: 'warn', status: '⚠ Falta registrar en RIP', student: wix.correo, at: at.label, rip: '—', wix: wix.servicio || 'Clase Wix' });
      } else {
        rows.push({ tone: 'info', status: '↗ Próxima clase Wix', student: wix.correo, at: at.label, rip: '—', wix: wix.servicio || 'Clase Wix' });
      }
    });
    ripClasses.forEach((rip, index) => {
      if (usedRIP.has(index) || new Date(`${rip.date}T00:00:00`).getTime() >= Date.now()) return;
      rows.push({ tone: 'warn', status: '⚠ En RIP, no en Wix', student: rip.row.estudiante || rip.correo, at: `${rip.date} ${rip.row.hora || ''}`.trim(), rip: rip.row.servicio || 'Clase', wix: '—' });
    });
    rows.sort((a, b) => a.at.localeCompare(b.at));
    body.innerHTML = rows.map(item => `<tr><td><span class="pilltag ${item.tone === 'ok' ? 'success' : item.tone === 'warn' ? 'warn' : 'muted'}">${S().escapeHTML(item.status)}</span></td><td>${S().escapeHTML(item.student)}</td><td>${S().escapeHTML(item.at)}</td><td>${S().escapeHTML(item.rip)}</td><td>${S().escapeHTML(item.wix)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-td">No se encontraron clases para comparar.</td></tr>';
    if (status) status.textContent = `${rows.length} clase(s) revisadas: ✓ coinciden, ⚠ requieren revisión y ↗ son próximas.`;
  }

  async function checkWixClasses(ctx, source) {
    const button = document.getElementById('btnWixClassCheck');
    const status = document.getElementById('wixClassCheckStatus');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Consultando clases de Wix…';
    try {
      const env = await window.RIPFirebase.ready;
      const mod = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js');
      const call = mod.httpsCallable(mod.getFunctions(env.app, 'us-central1'), 'checkWixClasses');
      const result = await call({ pastDays: 45, futureDays: 90 });
      renderWixClassCheck(ctx, source, result.data?.classes || []);
    } catch (err) {
      console.error(err);
      if (status) status.textContent = err?.message || 'No se pudo consultar Wix.';
      S().toast(ctx?.el?.toastWrap, err?.message || 'No se pudo consultar Wix.', 'warn');
    } finally {
      if (button) button.disabled = false;
    }
  }

  function bindPanels(ctx) {
    const view = ctx?.el?.reconciliationView;
    const reconciliation = document.getElementById('reconciliationPanel');
    const directory = document.getElementById('reconciliationDirectoryPanel');
    const tabs = Array.from(document.querySelectorAll('[data-reconciliation-panel]'));
    if (!view || !reconciliation || !directory || !tabs.length) return;
    const showPanel = (panel) => {
      const active = panel === 'directory' ? 'directory' : 'reconciliation';
      view.dataset.panel = active;
      reconciliation.hidden = active !== 'reconciliation';
      directory.hidden = active !== 'directory';
      tabs.forEach(tab => {
        const selected = tab.dataset.reconciliationPanel === active;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
    };
    tabs.forEach(tab => { tab.onclick = () => showPanel(tab.dataset.reconciliationPanel); });
    const settings = document.getElementById('btnReconciliationSettings');
    if (settings) settings.onclick = () => showPanel('directory');
    showPanel(view.dataset.panel || 'reconciliation');
  }

  function render(ctx, source) {
    const el = ctx?.el;
    if (!el?.reconciliationBody) return;
    const directory = [...(source?.students || []), ...(source?.remoteStudents || [])];
    const cases = buildCases(source?.records || [], directory);
    const linkedDirectory = buildLinkedStudentDirectory(source?.records || [], directory);
    const masters = masterStudents(directory, source?.records || []);
    bindPanels(ctx);
    el.reconciliationCount.textContent = String(cases.length);
    const recordCountById = new Map();
    (source?.records || []).forEach(record => {
      const id = String(record.studentId || record.canonicalStudentId || '').trim();
      if (canonicalId(id)) recordCountById.set(id, (recordCountById.get(id) || 0) + 1);
    });
    const options = masters.map(s => {
      const detail = s.canonical
        ? `${recordCountById.get(s.id) || 0} registros${s.emails?.length ? ` · ${s.emails.join(', ')}` : ''}`
        : 'nombre maestro provisional';
      return `<option value="${S().escapeHTML(s.value)}">${S().escapeHTML(s.name)} · ${detail} · ${S().escapeHTML(s.source)}</option>`;
    }).join('');
    el.reconciliationOptions.innerHTML = options;
    el.reconciliationBody.innerHTML = cases.map((item, index) => {
      const suggested = item.candidates.length === 1 ? item.candidates[0].id : '';
      const provisional = !item.candidates.length && item.sourceIds.length === 1 && item.sourceId === item.nameKey;
      const pendingExact = !item.candidates.length && item.sourceIds.length > 1;
      const provisionalMaster = masters.find(s => !s.canonical && s.nameKey === item.nameKey);
      const defaultTarget = item.candidates.length === 1 ? item.candidates[0].id :
        (pendingExact ? provisionalMaster?.value || '' : '');
      const isEmailOnly = looksLikeEmail(item.name) || !item.nameKey;
      const status = item.candidates.length === 1 ? (isEmailOnly ? 'Correo encontrado: falta nombre' : 'Coincidencia por nombre') :
        item.candidates.length > 1 ? 'Homónimo: elige manualmente' :
          isEmailOnly ? 'Correo sin ficha encontrada' :
          provisional ? 'Grupo provisional: falta ID canónico' :
            `${item.sourceIds.length} IDs por vincular`;
      const first = item.records.map(r => String(r.fecha || r.fechaRaw || '')).filter(Boolean).sort()[0] || '—';
      const last = item.records.map(r => String(r.fecha || r.fechaRaw || '')).filter(Boolean).sort().at(-1) || '—';
      const variants = cases.filter(other => samePersonVariant(item.nameKey, other.nameKey));
      const variantLabel = variants.length > 1 ? `Vincular ${variants.length} variantes` : 'Vincular';
      return `<tr data-case="${index}">
        <td><strong>${S().escapeHTML(item.name || 'Sin nombre')}</strong><br><small>${S().escapeHTML(item.rowEmail || item.nameKey || 'sin nombre')}</small></td>
        <td><code>${S().escapeHTML(item.sourceIds.join(' · ') || 'Sin ID')}</code></td>
        <td>${item.records.length}<br><small>${S().escapeHTML(first)} a ${S().escapeHTML(last)}</small></td>
        <td><span class="pilltag ${suggested ? 'warn' : 'muted'}">${S().escapeHTML(status)}</span></td>
        <td><input class="control" list="reconciliationOptions" data-target value="${S().escapeHTML(defaultTarget)}" placeholder="ID canónico o nombre maestro"></td>
        <td><button class="btn primary" type="button" data-reconcile>${variantLabel}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-td">No hay registros pendientes de conciliación.</td></tr>';
    if (el.reconciliationDirectoryCount) el.reconciliationDirectoryCount.textContent = String(linkedDirectory.length);
    if (el.reconciliationDirectoryBody) {
      el.reconciliationDirectoryBody.innerHTML = linkedDirectory.map(item => {
        const relatedIds = item.ids.length
          ? item.ids.map(value => `<div class="reconciliation-related-id"><code>${S().escapeHTML(value)}</code><button class="btn ghost small" type="button" data-remove-linked-id="${S().escapeHTML(value)}" title="Quitar este ID relacionado">Quitar</button></div>`).join('')
          : '—';
        const aliases = item.aliases.length ? item.aliases.map(value => S().escapeHTML(value)).join('<br>') : '—';
        const wixEmail = email(item.emails?.[0] || '');
        const relatedEmails = item.emails?.slice(1).map(value => S().escapeHTML(value)).join('<br>') || '';
        const canSaveEmail = item.storedId;
        return `<tr>
          <td><strong>${S().escapeHTML(item.name)}</strong></td>
          <td><code>${S().escapeHTML(item.id)}</code></td>
          <td><div class="reconciliation-email-editor"><input class="control" type="email" data-wix-email value="${S().escapeHTML(wixEmail)}" placeholder="correo@ejemplo.com" aria-label="Correo Wix de ${S().escapeHTML(item.name)}"><button class="btn ghost" type="button" data-save-wix-email ${canSaveEmail ? '' : 'disabled title="Este registro aún no tiene ID canónico"'}>Guardar</button></div>${relatedEmails ? `<small>${relatedEmails}</small>` : ''}</td>
          <td>${relatedIds}</td>
          <td>${aliases}</td>
          <td>${item.records}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="empty-td">No hay estudiantes canónicos en el directorio.</td></tr>';

      el.reconciliationDirectoryBody.querySelectorAll('[data-save-wix-email]').forEach(button => button.addEventListener('click', async () => {
        const row = button.closest('tr');
        const studentId = String(row.querySelector('code')?.textContent || '').trim();
        const input = row.querySelector('[data-wix-email]');
        const wixEmail = email(input?.value || '');
        if (!looksLikeEmail(wixEmail)) {
          window.alert('Escribe un correo válido de Wix.');
          input?.focus();
          return;
        }
        const student = linkedDirectory.find(item => item.id === studentId);
        if (!student) return;
        if (!window.confirm(`¿Guardar ${wixEmail} como el correo de Wix de ${student.name}? El correo anterior dejará de resolver clases nuevas.`)) return;
        button.disabled = true;
        try {
          const result = await window.RIPRepository.updateStudentWixEmail(studentId, wixEmail, student);
          S().toast(ctx.el.toastWrap, `Correo Wix actualizado: ${result.email}`, 'ok');
          await source.refresh?.();
        } catch (err) {
          console.error(err);
          S().toast(ctx.el.toastWrap, err?.message || 'No se pudo actualizar el correo Wix.', 'warn');
          button.disabled = false;
        }
      }));
      el.reconciliationDirectoryBody.querySelectorAll('[data-remove-linked-id]').forEach(button => button.addEventListener('click', async () => {
        const row = button.closest('tr');
        const studentId = String(row.querySelector('code')?.textContent || '').trim();
        const relatedId = String(button.dataset.removeLinkedId || '').trim();
        const student = linkedDirectory.find(item => item.id === studentId);
        if (!student || !relatedId) return;
        if (!window.confirm(`¿Quitar el ID relacionado ${relatedId} de ${student.name}? Sus registros dejarán de estar vinculados a esta ficha.`)) return;
        button.disabled = true;
        try {
          const result = await window.RIPRepository.unlinkStudentRelatedId(studentId, relatedId);
          S().toast(ctx.el.toastWrap, `ID eliminado de la relación. ${result.recordsUpdated} registro(s) actualizado(s).`, 'ok');
          await source.refresh?.();
        } catch (err) {
          console.error(err);
          S().toast(ctx.el.toastWrap, err?.message || 'No se pudo quitar el ID.', 'warn');
          button.disabled = false;
        }
      }));
    }
    el.reconciliationBody.querySelectorAll('[data-reconcile]').forEach(button => button.addEventListener('click', async () => {
      const row = button.closest('tr');
      const item = cases[Number(row.dataset.case)];
      const variants = cases.filter(other => samePersonVariant(item.nameKey, other.nameKey));
      const recordsToLink = variants.flatMap(other => other.records);
      const target = String(row.querySelector('[data-target]')?.value || '').trim();
      const selected = masters.find(s => s.value === target);
      if (!selected) { window.alert('Elige un ID o un nombre maestro de la lista.'); return; }
      const destination = selected.canonical ? `al ID canónico de ${selected.name}` : `al nombre maestro provisional “${selected.name}”`;
      if (!window.confirm(`Vincular ${recordsToLink.length} registro(s) de ${variants.length} variante(s) ${destination}? No se borrará ningún registro.`)) return;
      button.disabled = true;
      try {
        const result = await window.RIPRepository.reconcileRegistroStudentIds({
          recordIds: recordsToLink.map(r => r.id), targetStudentId: selected.id, targetName: selected.name,
          expectedNameKeys: variants.map(other => other.nameKey)
    });
        S().toast(ctx.el.toastWrap, `${result.changed} registro(s) vinculados.`, 'ok');
        await source.refresh?.();
      } catch (err) {
        console.error(err);
        S().toast(ctx.el.toastWrap, err?.message || 'No se pudo conciliar.', 'warn');
        button.disabled = false;
      }
    }));

    const wixButton = document.getElementById('btnWixClassCheck');
    if (wixButton) wixButton.onclick = () => checkWixClasses(ctx, source);

    const bulkButton = document.getElementById('btnReconciliationLinkPending');
    const pendingExact = cases.filter(item => !item.candidates.length && item.sourceIds.length > 1);
    if (bulkButton) {
      bulkButton.disabled = !pendingExact.length;
      bulkButton.title = pendingExact.length
        ? `Vincular ${pendingExact.length} grupo(s) con mismo nombre y varios IDs heredados.`
        : 'No hay coincidencias exactas pendientes.';
      bulkButton.onclick = async () => {
        if (!pendingExact.length) return;
        if (!window.confirm(
          `Vincular ${pendingExact.length} grupo(s) con el mismo nombre normalizado y varios IDs heredados? ` +
          'Se conservarán todos sus IDs como alias. Los homónimos y nombres parecidos no se tocarán.'
        )) return;
        bulkButton.disabled = true;
        let linked = 0;
        const failed = [];
        for (const item of pendingExact) {
          const master = masters.find(s => !s.canonical && s.nameKey === item.nameKey);
          if (!master) { failed.push(item.name); continue; }
          try {
            const result = await window.RIPRepository.reconcileRegistroStudentIds({
              recordIds: item.records.map(r => r.id), targetName: master.name, expectedNameKeys: [item.nameKey]
            });
            linked += result.changed;
          } catch (err) { failed.push(item.name); console.error(err); }
        }
        if (failed.length) {
          S().toast(ctx.el.toastWrap, `${linked} registro(s) vinculados; revisa ${failed.length} grupo(s).`, 'warn');
          bulkButton.disabled = false;
          return;
        }
        S().toast(ctx.el.toastWrap, `${linked} registro(s) vinculados; todos los IDs quedaron guardados.`, 'ok');
        await source.refresh?.();
      };
    }
  }
  window.RIPUI = window.RIPUI || {};
  window.RIPUI.reconciliation = { render, buildCases, buildLinkedStudentDirectory };
})();
