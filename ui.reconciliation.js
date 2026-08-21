/* global window */
(function () {
  'use strict';
  const S = () => window.RIPUI?.shared;
  const canonicalId = value => /^[A-Za-z0-9_-]{16,}$/.test(String(value || '').trim());
  const key = value => S().norm(value || '');

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
    canonicals.forEach(s => {
      if (!byName.has(s.nameKey)) byName.set(s.nameKey, []);
      byName.get(s.nameKey).push(s);
    });
    const groups = new Map();
    for (const row of records || []) {
      const nameKey = key(row.estudianteKey || row.estudiante || row.name);
      if (!nameKey) continue;
      const sourceId = String(row.studentId || row.canonicalStudentId || row.estudianteKey || nameKey).trim();
      const cluster = String(row.identityClusterKey || '').trim();
      const candidates = byName.get(nameKey) || [];
      // Ya está enlazado inequívocamente al canónico del mismo nombre.
      if (candidates.length === 1 && sourceId === candidates[0].id) continue;
      // When there is no official candidate, different legacy IDs belonging
      // to the exact same normalized name are one pending case. This makes
      // aliases such as nameKey + old email link in a single action.
      const groupKey = cluster || ((candidates.length || canonicalId(sourceId)) ? `${nameKey}::${sourceId}` : `${nameKey}::pending`);
      if (!groups.has(groupKey)) groups.set(groupKey, {
        groupKey, name: String(row.estudiante || row.name || nameKey).trim(), nameKey, sourceId,
        sourceIds: new Set(), candidates, records: []
      });
      const group = groups.get(groupKey);
      group.sourceIds.add(sourceId);
      group.records.push(row);
    }
    return Array.from(groups.values()).map(group => ({ ...group, sourceIds: Array.from(group.sourceIds) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.sourceId.localeCompare(b.sourceId, 'es'));
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

  function render(ctx, source) {
    const el = ctx?.el;
    if (!el?.reconciliationBody) return;
    const directory = [...(source?.students || []), ...(source?.remoteStudents || [])];
    const cases = buildCases(source?.records || [], directory);
    const masters = masterStudents(directory, source?.records || []);
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
      const status = item.candidates.length === 1 ? 'Coincidencia por nombre' :
        item.candidates.length > 1 ? 'Homónimo: elige manualmente' :
          provisional ? 'Grupo provisional: falta ID canónico' :
            `${item.sourceIds.length} IDs por vincular`;
      const first = item.records.map(r => String(r.fecha || r.fechaRaw || '')).filter(Boolean).sort()[0] || '—';
      const last = item.records.map(r => String(r.fecha || r.fechaRaw || '')).filter(Boolean).sort().at(-1) || '—';
      const variants = cases.filter(other => samePersonVariant(item.nameKey, other.nameKey));
      const variantLabel = variants.length > 1 ? `Vincular ${variants.length} variantes` : 'Vincular';
      return `<tr data-case="${index}">
        <td><strong>${S().escapeHTML(item.name)}</strong><br><small>${S().escapeHTML(item.nameKey)}</small></td>
        <td><code>${S().escapeHTML(item.sourceIds.join(' · ') || 'Sin ID')}</code></td>
        <td>${item.records.length}<br><small>${S().escapeHTML(first)} a ${S().escapeHTML(last)}</small></td>
        <td><span class="pilltag ${suggested ? 'warn' : 'muted'}">${S().escapeHTML(status)}</span></td>
        <td><input class="control" list="reconciliationOptions" data-target value="${S().escapeHTML(defaultTarget)}" placeholder="ID canónico o nombre maestro"></td>
        <td><button class="btn primary" type="button" data-reconcile>${variantLabel}</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-td">No hay registros pendientes de conciliación.</td></tr>';
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
  window.RIPUI.reconciliation = { render, buildCases };
})();
