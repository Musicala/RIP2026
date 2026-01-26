/* =============================================================================
  ui.table.js — RIP 2026 UI Table + Filters (READ-ONLY) — v2
  - Estudiante: input escribible + datalist (sugerencias mientras escribes)
  - Exact match => abre ficha
  - Si borra => vuelve a tabla base
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
  // Helpers UI
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

  // =========================
  // Data builders
  // =========================
  function getServiciosUnique(registro) {
    const m = new Map();
    for (const r of registro) {
      if (!r.servicioKey) continue;
      if (!m.has(r.servicioKey)) m.set(r.servicioKey, r.servicio || '');
    }
    return Array.from(m.entries())
      .map(([key, name]) => ({ key, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function getProfesoresUnique(registro) {
    const m = new Map();
    for (const r of registro) {
      const k = norm(r.profesor);
      if (!k) continue;
      if (!m.has(k)) m.set(k, r.profesor || '');
    }
    return Array.from(m.entries())
      .map(([k, name]) => ({ key: k, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  // =========================
  // Estudiante: input + datalist
  // =========================
  function getDatalistEl() {
    return document.getElementById('nombresLista');
  }

  function renderStudentDatalist(ctx, students, query) {
    const dl = getDatalistEl();
    if (!dl) return;

    const q = norm(query || '');
    const list = q
      ? students.filter(s => norm(s.name).includes(q)).slice(0, 80)
      : students.slice(0, 120);

    dl.innerHTML = list.map(s => `<option value="${escapeHTML(s.name)}"></option>`).join('');
  }

  function findStudentKeyByName(students, name) {
    const target = norm(name);
    if (!target) return '';
    const hit = students.find(s => norm(s.name) === target);
    return hit ? hit.key : '';
  }

  // =========================
  // Render options filtros
  // =========================
  function renderProfesorOptions(ctx, registro) {
    const { el } = ctx;
    if (!el.fProfesor) return;

    const current = el.fProfesor.value || '';
    const list = getProfesoresUnique(registro);

    el.fProfesor.innerHTML =
      `<option value="">Todos</option>` +
      list.map((p) => `<option value="${escapeHTML(p.name)}">${escapeHTML(p.name)}</option>`).join('');

    el.fProfesor.value = current;
  }

  // =========================
  // Servicios multi-select
  // =========================
  function updateServiceCount(ctx, state) {
    const { el } = ctx;
    if (!el.fServiceCount) return;
    el.fServiceCount.textContent = String(state.selectedServicios?.size || 0);
  }

  function renderServiceList(ctx, state, registro, { keepSearch = true } = {}) {
    const { el } = ctx;
    if (!el.serviceList) return;

    const servicios = getServiciosUnique(registro);
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
  // Lectura de filtros -> RIPCore.applyFilters
  // =========================
  function readFilters(ctx, state) {
    const { el } = ctx;

    // Estudiante: viene por nombre -> se convierte a key solo si es EXACT match
    const typedName = el.fStudent ? (el.fStudent.value || '') : '';
    const estudianteKey = findStudentKeyByName(state.allStudents, typedName);

    const profesor = el.fProfesor ? (el.fProfesor.value || '') : '';

    const uiTipo = el.fTipo ? (el.fTipo.value || '') : '';
    const tipo =
      uiTipo === 'Clase' ? 'clase' :
      uiTipo === 'Pago'  ? 'pago'  :
      'all';

    const fromD = el.fDesde ? RIPCore.util.parseDate(el.fDesde.value) : null;
    const toD   = el.fHasta ? RIPCore.util.parseDate(el.fHasta.value) : null;

    const fromTs = fromD ? fromD.setHours(0, 0, 0, 0) : 0;
    const toTs   = toD ? toD.setHours(23, 59, 59, 999) : 0;

    return {
      estudianteKey,
      profesores: profesor,
      tipo,
      serviciosSet: state.selectedServicios,
      fromTs,
      toTs
    };
  }

  function inferTipoLabel(r) {
    const t = String(r.tipo || '').trim();
    if (t) return t;

    const hasPago = !!String(r.pago || '').trim();
    return hasPago ? 'Pago' : 'Clase';
  }

  // =========================
  // Render tabla base
  // =========================
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

    if (el.fStudent) el.fStudent.value = '';
    if (el.fProfesor) el.fProfesor.value = '';
    if (el.fTipo) el.fTipo.value = '';
    if (el.fDesde) el.fDesde.value = '';
    if (el.fHasta) el.fHasta.value = '';

    clearServicios(ctx, state);
    renderStudentDatalist(ctx, state.allStudents, '');

    applyAndRender(ctx, state);
    setStatus(ctx, 'Filtros limpiados.');
  }

  // =========================
  // Wiring
  // =========================
  function wire(ctx, state) {
    const { el } = ctx;

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

    if (el.serviceSearch) el.serviceSearch.addEventListener('input', () => renderServiceList(ctx, state, state.registro, { keepSearch: true }));
    if (el.serviceClear) el.serviceClear.addEventListener('click', () => {
      if (el.serviceSearch) el.serviceSearch.value = '';
      clearServicios(ctx, state);
      renderServiceList(ctx, state, state.registro, { keepSearch: true });
    });

    if (el.btnApply) el.btnApply.addEventListener('click', () => applyAndRender(ctx, state));
    if (el.btnReset) el.btnReset.addEventListener('click', () => resetFilters(ctx, state));

    // ✅ Estudiante escribible + sugerencias + exact match abre ficha
    if (el.fStudent) {
      el.fStudent.addEventListener('input', () => {
        const v = el.fStudent.value || '';
        renderStudentDatalist(ctx, state.allStudents, v);

        const key = findStudentKeyByName(state.allStudents, v);
        if (key && window.RIPUI?.ficha?.openFichaByKey) {
          window.RIPUI.ficha.openFichaByKey(ctx, state, key);
          return;
        }

        if (!v) applyAndRender(ctx, state);
      });

      el.fStudent.addEventListener('change', () => {
        const v = el.fStudent.value || '';
        const key = findStudentKeyByName(state.allStudents, v);
        if (key && window.RIPUI?.ficha?.openFichaByKey) {
          window.RIPUI.ficha.openFichaByKey(ctx, state, key);
          return;
        }
        if (!v) applyAndRender(ctx, state);
      });
    }

    if (el.fProfesor) el.fProfesor.addEventListener('change', () => applyAndRender(ctx, state));
    if (el.fTipo) el.fTipo.addEventListener('change', () => applyAndRender(ctx, state));
    if (el.fDesde) el.fDesde.addEventListener('change', () => applyAndRender(ctx, state));
    if (el.fHasta) el.fHasta.addEventListener('change', () => applyAndRender(ctx, state));
  }

  // =========================
  // Init
  // =========================
  function init(ctx, state) {
    if (!state.selectedServicios) state.selectedServicios = new Set();

    renderProfesorOptions(ctx, state.registro);
    renderServiceList(ctx, state, state.registro, { keepSearch: true });
    updateServiceCount(ctx, state);

    renderStudentDatalist(ctx, state.allStudents, '');

    wire(ctx, state);
    applyAndRender(ctx, state);
  }

  RIPUI.table = { init, applyAndRender, resetFilters, readFilters };
})();
