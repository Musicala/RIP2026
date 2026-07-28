(function () {
  'use strict';

  const S = () => window.RIPUI?.shared;
  const DAY = 24 * 60 * 60 * 1000;

  function timestampMs(value) {
    if (!value) return 0;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value?.seconds)) return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }

  function formatDateTime(value) {
    const ms = timestampMs(value);
    if (!ms) return '—';
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'short', timeStyle: 'short', hour12: false
    }).format(new Date(ms));
  }

  function labelFor(entry) {
    const entity = String(entry?.entity || '').trim();
    const action = String(entry?.action || '').trim();
    const labels = {
      'registro:create': 'Registro creado',
      'registro:update': 'Registro editado',
      'registro:delete': 'Registro eliminado',
      'registro:merge-student': 'Registro fusionado',
      'clientesB2C:create': 'Pago creado',
      'clientesB2C:update': 'Pago editado',
      'clientesB2C:import': 'Pago importado',
      'clientesB2C:merge-student': 'Pago fusionado',
      'primeraVez:create': 'Primera vez creada',
      'primeraVez:update': 'Primera vez editada',
      'primeraVez:delete': 'Primera vez eliminada',
      'primeraVez:merge-student': 'Primera vez fusionada',
      'programacion:update': 'Programación actualizada',
      'programacion:merge-student': 'Programación fusionada',
      'students:merge-student': 'Contacto fusionado',
      'students:merge-mark': 'Alias de contacto creado',
      'students:merge-delete': 'Contacto duplicado archivado',
      'studentComputed:recalculate': 'Saldos recalculados'
    };
    return labels[`${entity}:${action}`] || `${entity || 'Registro'} · ${action || 'cambio'}`;
  }

  function detailFor(entry) {
    const data = entry?.after || entry?.before || {};
    const name = String(data?.estudiante || data?.name || data?.cliente || '').trim();
    if (name) return name;
    if (entry?.entityId && entry.entityId !== 'all') return `ID: ${entry.entityId}`;
    return 'Cambio general';
  }

  function dateCutoff(range) {
    if (range === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
    }
    if (range === '7d') return Date.now() - 7 * DAY;
    if (range === '30d') return Date.now() - 30 * DAY;
    return 0;
  }

  function dayKey(value) {
    const ms = timestampMs(value);
    if (!ms) return '';
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function setOptions(select, values, placeholder) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${S().escapeHTML(placeholder)}</option>` + values
      .map(value => `<option value="${S().escapeHTML(value)}">${S().escapeHTML(value)}</option>`).join('');
    select.value = values.includes(current) ? current : '';
  }

  function render(ctx, source) {
    const el = ctx?.el;
    if (!el?.performanceView) return;
    const range = el.performanceRange?.value || '7d';
    const isAdmin = Boolean(ctx?.state?.audit?.isAdmin);
    const cutoff = dateCutoff(range);
    const baseRows = (source || []).filter(r => timestampMs(r.createdAt) >= cutoff);
    if (isAdmin) {
      setOptions(el.performanceUser,
        Array.from(new Set(baseRows.map(r => String(r.userEmail || '').trim()).filter(Boolean))).sort(),
        'Todas las personas');
    }
    setOptions(el.performanceAction,
      Array.from(new Set(baseRows.map(labelFor))).sort((a, b) => a.localeCompare(b, 'es')),
      'Todas las actividades');

    const selectedUser = isAdmin ? String(el.performanceUser?.value || '') : '';
    const selectedDate = String(el.performanceDate?.value || '');
    const selectedAction = String(el.performanceAction?.value || '');
    const rows = baseRows
      .filter(r => !selectedUser || String(r.userEmail || '') === selectedUser)
      .filter(r => !selectedDate || dayKey(r.createdAt) === selectedDate)
      .filter(r => !selectedAction || labelFor(r) === selectedAction)
      .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayRows = rows.filter(r => timestampMs(r.createdAt) >= today.getTime());
    const users = new Set(rows.map(r => String(r.userEmail || '').trim()).filter(Boolean));
    const latest = rows[0];
    const hours = Array.from({ length: 24 }, () => 0);
    rows.forEach(r => { const ms = timestampMs(r.createdAt); if (ms) hours[new Date(ms).getHours()]++; });
    const maxHour = Math.max(...hours, 1);
    const tasks = new Map();
    rows.forEach(r => { const label = labelFor(r); tasks.set(label, (tasks.get(label) || 0) + 1); });
    const activeDays = new Set(rows.map(r => dayKey(r.createdAt)).filter(Boolean)).size;
    const averagePerDay = activeDays ? (rows.length / activeDays).toFixed(1) : '0';

    if (el.performanceKpis) {
      el.performanceKpis.hidden = !isAdmin;
      el.performanceKpis.innerHTML = isAdmin ? [
      ['Actividad hoy', todayRows.length, 'cambios registrados'],
      ['Promedio diario', averagePerDay, 'acciones por día activo'],
      ['Actividad del período', rows.length, 'acciones auditadas'],
      ['Personas activas', users.size, 'correos con actividad'],
      ['Último cambio', latest ? formatDateTime(latest.createdAt) : '—', latest ? String(latest.userEmail || 'Sin correo') : 'Sin actividad']
      ].map(([label, value, note]) => `
      <div class="kpi"><div class="n">${S().escapeHTML(String(value))}</div><div class="t">${S().escapeHTML(label)}</div><small>${S().escapeHTML(note)}</small></div>
      `).join('') : '';
    }

    el.performanceHours?.closest('.performance-layout')?.toggleAttribute('hidden', !isAdmin);

    if (el.performanceHours) el.performanceHours.innerHTML = hours.map((count, hour) => `
      <div class="performance-hour" title="${String(hour).padStart(2, '0')}:00 · ${count} cambios">
        <div class="performance-hour-bar" style="height:${Math.max(count ? 10 : 2, Math.round((count / maxHour) * 76))}px"></div>
        <span>${String(hour).padStart(2, '0')}</span>
      </div>
    `).join('');

    if (el.performanceTasksTitle) {
      el.performanceTasksTitle.textContent = selectedUser
        ? `Totales por acción · ${selectedUser}`
        : 'Tareas más realizadas';
    }
    if (el.performanceTasks) el.performanceTasks.innerHTML = Array.from(tasks.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, selectedUser ? undefined : 8)
      .map(([label, count]) => `<span class="pilltag info">${S().escapeHTML(label)} · ${count}</span>`).join('') || '<span class="muted">Sin actividad en este período.</span>';

    if (el.performanceBody) el.performanceBody.innerHTML = rows.map(r => `
      <tr>
        <td>${S().escapeHTML(formatDateTime(r.createdAt))}</td>
        <td>${S().escapeHTML(String(r.userEmail || 'Sin correo'))}</td>
        <td><span class="pilltag info">${S().escapeHTML(labelFor(r))}</span></td>
        <td>${S().escapeHTML(detailFor(r))}</td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="empty-td">No hay cambios registrados en este período.</td></tr>';
  }

  window.RIPUI = window.RIPUI || {};
  window.RIPUI.performance = { render };
})();
