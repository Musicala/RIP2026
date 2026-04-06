/* =============================================================================
  ui.table.js — RIP 2026 UI Table + Filters — v4 FILTROS ACUMULATIVOS
  CAMBIOS:
    - Al seleccionar estudiante: servicios y profesores se restringen a los suyos
    - Al limpiar estudiante: servicios y profesores vuelven al universo completo
    - Filtros siempre acumulativos entre sí (AND)
    - Servicios y profesores también funcionan solos sin estudiante seleccionado
    - Exact match por nombre sigue abriendo la ficha completa igual que antes
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.table.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, setBadge, norm } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  // =========================
  // Helpers de lista
  // =========================

  function setStatus(ctx, msg) {
    if (ctx.el.status) ctx.el.status.textContent = msg || '';
  }

  function openServicePop(ctx, open) {
    const { el } = ctx;
    if (!el.servicePop) return;
    el.servicePop.classList.toggle('open', !!open);
    el.servicePop.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  /**
   * Devuelve los servicios únicos presentes en un subconjunto del registro.
   * Si se pasa un estudianteKey, filtra solo sus filas.
   */
  function getServiciosUnique(registro, estudianteKey) {
    const m = new Map();
    for (const r of registro) {
      if (estudianteKey && r.estudianteKey !== estudianteKey) continue;
      if (!r.servicioKey) continue;
      if (!m.has(r.servicioKey)) m.set(r.servicioKey, r.servicio || '');
    }
    return Array.from(m.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  /**
   * Devuelve los profesores únicos presentes en un subconjunto del registro.
   * Si se pasa un estudianteKey, filtra solo sus filas.
   */
  function getProfesoresUnique(registro, estudianteKey) {
    const m = new Map();
    for (const r of registro) {
      if (estudianteKey && r.estudianteKey !== estudianteKey) continue;
      const k = norm(r.profesor);
      if (!k) continue;
      if (!m.has(k)) m.set(k, r.profesor || '');
    }
    return Array.from(m.entries())
      .map(([k, name]) => ({ key: k, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // =========================
  // Datalist de estudiantes
  // =========================

  function ensureDatalist() {
    return document.getElementById('nombresLista');
  }

  function getSearchStudents(state) {
    const pool =
      state.searchStudents ||
      state.studentSearchIndex ||
      state.globalStudentIndex ||
      state.allStudents ||
      [];
    return Array.isArray(pool) ? pool : [];
  }

  function getCurrentYearStudents(state) {
    return Array.isArray(state.allStudents) ? state.allStudents : [];
  }

  function dedupeStudentsByName(students) {
    const seen = new Set();
    const out = [];
    for (const s of students || []) {
      const name = String(s?.name || '').trim();
      const k = norm(name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  function getStudentDisplayName(s) {
    return String(s?.name || '').trim();
  }

  function getStudentYearsLabel(s) {
    const years = Array.isArray(s?.years) ? s.years.filter(Boolean) : [];
    return years.length ? ` · ${years.join(', ')}` : '';
  }

  function renderStudentDatalist(ctx, students, query) {
    const dl = ensureDatalist();
    if (!dl) return;

    const q = norm(query || '');
    const pool = dedupeStudentsByName(students);

    const list = q
      ? pool.filter((s) => norm(getStudentDisplayName(s)).includes(q)).slice(0, 80)
      : pool.slice(0, 120);

    dl.innerHTML = list
      .map((s) => {
        const label = `${getStudentDisplayName(s)}${getStudentYearsLabel(s)}`;
        return `<option value="${escapeHTML(getStudentDisplayName(s))}" label="${escapeHTML(label)}"></option>`;
      })
      .join('');
  }

  function findStudentEntryByName(students, name) {
    const target = norm(name);
    if (!target) return null;
    return (students || []).find((s) => norm(s?.name) === target) || null;
  }

  function findStudentKeyByName(students, name) {
    const hit = findStudentEntryByName(students, name);
    if (!hit) return '';
    return String(hit.currentKey || hit.key || '').trim();
  }

  function openStudentFromInput(ctx, state, typedName) {
    const pool = getSearchStudents(state);
    const entry = findStudentEntryByName(pool, typedName);
    if (!entry) return false;

    if (window.RIPUI?.ficha?.openStudentFromSearch) {
      window.RIPUI.ficha.openStudentFromSearch(ctx, state, entry);
      return true;
    }

    const key = String(entry.currentKey || entry.key || '').trim();
    if (key && window.RIPUI?.ficha?.openFichaByKey) {
      window.RIPUI.ficha.openFichaByKey(ctx, state, key);
      return true;
    }

    const years = Array.isArray(entry.years) ? entry.years.join(', ') : '';
    setStatus(
      ctx,
      years
        ? `Encontré a ${entry.name} en histórico (${years}), pero aún falta conectar la ficha histórica.`
        : `Encontré a ${entry.name}, pero aún falta conectar la ficha histórica.`
    );
    return true;
  }

  // =========================
  // Servicios multi — CON contexto de estudiante
  // =========================

  function updateServiceCount(ctx, state) {
    if (ctx.el.fServiceCount)
      ctx.el.fServiceCount.textContent = String(state.selectedServicios?.size || 0);
  }

  /**
   * Renderiza la lista de servicios filtrada opcionalmente por estudianteKey.
   * Si el estudiante tiene servicios, solo muestra los suyos.
   * Si no hay estudiante, muestra todos.
   */
  function renderServiceList(ctx, state, registro, { keepSearch = true, estudianteKey = '' } = {}) {
    const { el } = ctx;
    if (!el.serviceList) return;

    // Resolver la clave del estudiante actualmente escrito (si no se pasó explícito)
    const eKey = estudianteKey ||
      findStudentKeyByName(getCurrentYearStudents(state), el.fStudent?.value || '') ||
      '';

    const servicios = getServiciosUnique(registro, eKey);
    const q = keepSearch && el.serviceSearch ? norm(el.serviceSearch.value) : '';
    const filtered = q ? servicios.filter((s) => norm(s.name).includes(q)) : servicios;

    el.serviceList.innerHTML = filtered
      .map((s) => {
        const checked = state.selectedServicios.has(s.key) ? 'checked' : '';
        return `
          <label class="multi-item">
            <input type="checkbox" data-svc="${escapeHTML(s.key)}" ${checked}/>
            <span class="t">${escapeHTML(s.name)}</span>
          </label>
        `;
      })
      .join('');

    el.serviceList.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const k = cb.getAttribute('data-svc') || '';
        if (!k) return;
        if (cb.checked) state.selectedServicios.add(k);
        else state.selectedServicios.delete(k);
        updateServiceCount(ctx, state);
        // Al cambiar servicio, re-aplica filtros inmediatamente
        applyAndRender(ctx, state);
      });
    });

    updateServiceCount(ctx, state);
  }

  function clearServicios(ctx, state) {
    state.selectedServicios.clear();
    updateServiceCount(ctx, state);
    renderServiceList(ctx, state, state.registro, { keepSearch: true });
  }

  // =========================
  // Profesores — CON contexto de estudiante
  // =========================

  /**
   * Renderiza el select de profesores filtrado por estudianteKey.
   * Preserva la selección si el profesor elegido sigue disponible.
   */
  function renderProfesorOptions(ctx, registro, estudianteKey) {
    const { el } = ctx;
    if (!el.fProfesor) return;

    const current = el.fProfesor.value || '';
    const eKey = estudianteKey ||
      findStudentKeyByName(getCurrentYearStudents(
        window.RIPApp?.state || {}
      ), el.fStudent?.value || '') || '';

    const list = getProfesoresUnique(registro, eKey);

    el.fProfesor.innerHTML =
      `<option value="">Todos</option>` +
      list.map((p) =>
        `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`
      ).join('');

    // Mantener selección si sigue siendo válida
    if (current && list.some((p) => p.name === current)) {
      el.fProfesor.value = current;
    }
  }

  // =========================
  // Leer filtros actuales
  // =========================

  function readFilters(ctx, state) {
    const { el } = ctx;

    const typedName = el.fStudent ? (el.fStudent.value || '') : '';
    const estudianteKey = findStudentKeyByName(getCurrentYearStudents(state), typedName);

    const profesor = el.fProfesor ? (el.fProfesor.value || '') : '';
    const uiTipo = el.fTipo ? (el.fTipo.value || '') : '';
    const tipo =
      uiTipo === 'Clase' ? 'clase' :
      uiTipo === 'Pago'  ? 'pago'  :
      'all';

    const fromD  = el.fDesde ? RIPCore.util.parseDate(el.fDesde.value) : null;
    const toD    = el.fHasta ? RIPCore.util.parseDate(el.fHasta.value) : null;
    const fromTs = fromD ? fromD.setHours(0,  0,  0,   0) : 0;
    const toTs   = toD   ? toD.setHours(23, 59, 59, 999) : 0;

    return {
      estudianteKey,
      profesores: profesor,
      tipo,
      serviciosSet: state.selectedServicios,
      fromTs,
      toTs
    };
  }

  // =========================
  // Render tabla
  // =========================

  function inferTipoLabel(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;
    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  function renderTable(ctx, rows) {
    const { el } = ctx;
    if (!el.tableBody) return;

    if (!rows || !rows.length) {
      el.tableBody.innerHTML = `<tr><td colspan="12" class="empty-td">No hay registros con estos filtros.</td></tr>`;
      setBadge(el.badgeCount, 0);
      return;
    }

    const html = rows
      .slice(0, 1400)
      .map((r) => {
        const tipo = inferTipoLabel(r);
        const mov = Number(r.movimiento) || 0;
        const movClass = mov < 0 ? 'mov-neg' : mov > 0 ? 'mov-pos' : 'mov-zero';
        const movText = `${mov > 0 ? '+' : ''}${fmtMoney(mov)}`;

        return `
          <tr>
            <td>${escapeHTML(r.estudiante)}</td>
            <td>${escapeHTML(tipo)}</td>
            <td>${escapeHTML(r.fechaRaw)}</td>
            <td>${escapeHTML(r.hora)}</td>
            <td>${escapeHTML(r.servicio)}</td>
            <td>${escapeHTML(r.profesor)}</td>
            <td>${escapeHTML(r.pago)}</td>
            <td>${escapeHTML(r.comentario)}</td>
            <td class="mono">${escapeHTML(r.id)}</td>
            <td>${escapeHTML(r.clasif)}</td>
            <td>${escapeHTML(r.clasifPago)}</td>
            <td class="${movClass}">${movText}</td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML = html;
    setBadge(el.badgeCount, rows.length);
  }

  // =========================
  // Aplicar filtros
  // =========================

  function applyAndRender(ctx, state) {
    const filters = readFilters(ctx, state);
    const rows = RIPCore.applyFilters(state.registro, filters);
    state.filteredRows = rows;
    renderTable(ctx, rows);
    setStatus(ctx, `Mostrando ${rows.length} registro(s)`);
    return rows;
  }

  function resetFilters(ctx, state) {
    const { el } = ctx;
    if (el.fStudent)  el.fStudent.value  = '';
    if (el.fProfesor) el.fProfesor.value = '';
    if (el.fTipo)     el.fTipo.value     = '';
    if (el.fDesde)    el.fDesde.value    = '';
    if (el.fHasta)    el.fHasta.value    = '';

    // Restaurar listas completas (sin filtro de estudiante)
    clearServicios(ctx, state);
    renderProfesorOptions(ctx, state.registro, '');
    renderServiceList(ctx, state, state.registro, { keepSearch: false, estudianteKey: '' });

    applyAndRender(ctx, state);
    setStatus(ctx, 'Filtros limpiados.');
    renderStudentDatalist(ctx, getSearchStudents(state), '');
  }

  // =========================
  // Wiring de eventos
  // =========================

  function wire(ctx, state) {
    const { el } = ctx;

    // Pop de servicios
    if (el.serviceBtn && el.servicePop) {
      el.serviceBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openServicePop(ctx, !el.servicePop.classList.contains('open'));
      });

      document.addEventListener('click', (e) => {
        if (!el.servicePop.classList.contains('open')) return;
        if (el.servicePop.contains(e.target)) return;
        if (el.serviceBtn.contains(e.target)) return;
        openServicePop(ctx, false);
      });
    }

    if (el.serviceSearch) {
      el.serviceSearch.addEventListener('input', () => {
        renderServiceList(ctx, state, state.registro, { keepSearch: true });
      });
    }

    if (el.serviceClear) {
      el.serviceClear.addEventListener('click', () => {
        if (el.serviceSearch) el.serviceSearch.value = '';
        clearServicios(ctx, state);
        renderServiceList(ctx, state, state.registro, { keepSearch: true });
        applyAndRender(ctx, state);
      });
    }

    if (el.btnApply) el.btnApply.addEventListener('click', () => applyAndRender(ctx, state));
    if (el.btnReset) el.btnReset.addEventListener('click', () => resetFilters(ctx, state));

    // ── Estudiante: al escribir/cambiar, restringe servicios + profes ──────────
    if (el.fStudent) {
      el.fStudent.addEventListener('input', () => {
        const v = el.fStudent.value || '';
        renderStudentDatalist(ctx, getSearchStudents(state), v);

        // Actualizar contexto de servicios y profes según el estudiante escrito
        const eKey = findStudentKeyByName(getCurrentYearStudents(state), v);
        renderProfesorOptions(ctx, state.registro, eKey);
        renderServiceList(ctx, state, state.registro, { keepSearch: true, estudianteKey: eKey });

        // Exact match → abre ficha (y detiene el filtrado normal)
        if (v && openStudentFromInput(ctx, state, v)) return;

        if (!v) {
          // Sin nombre: restaura listas completas
          renderProfesorOptions(ctx, state.registro, '');
          renderServiceList(ctx, state, state.registro, { keepSearch: true, estudianteKey: '' });
          applyAndRender(ctx, state);
        }
      });

      el.fStudent.addEventListener('change', () => {
        const v = el.fStudent.value || '';

        const eKey = findStudentKeyByName(getCurrentYearStudents(state), v);
        renderProfesorOptions(ctx, state.registro, eKey);
        renderServiceList(ctx, state, state.registro, { keepSearch: true, estudianteKey: eKey });

        if (v && openStudentFromInput(ctx, state, v)) return;

        if (!v) {
          renderProfesorOptions(ctx, state.registro, '');
          renderServiceList(ctx, state, state.registro, { keepSearch: true, estudianteKey: '' });
          applyAndRender(ctx, state);
        }
      });
    }

    if (el.fProfesor) el.fProfesor.addEventListener('change', () => applyAndRender(ctx, state));
    if (el.fTipo)     el.fTipo.addEventListener('change',     () => applyAndRender(ctx, state));
    if (el.fDesde)    el.fDesde.addEventListener('change',    () => applyAndRender(ctx, state));
    if (el.fHasta)    el.fHasta.addEventListener('change',    () => applyAndRender(ctx, state));
  }

  // =========================
  // Init
  // =========================

  function init(ctx, state) {
    if (!state.selectedServicios) state.selectedServicios = new Set();

    // Inicializar listas completas (sin filtro de estudiante)
    renderProfesorOptions(ctx, state.registro, '');
    renderServiceList(ctx, state, state.registro, { keepSearch: true, estudianteKey: '' });
    updateServiceCount(ctx, state);

    renderStudentDatalist(ctx, getSearchStudents(state), '');

    wire(ctx, state);
    applyAndRender(ctx, state);
  }

  RIPUI.table = { init, applyAndRender, resetFilters, readFilters, renderProfesorOptions, renderServiceList };
})();
