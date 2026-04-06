/* =============================================================================
  ui.editor.js — RIP 2026 · Módulo de Edición del Registro
  Módulo aparte (no modifica ningún archivo existente).

  USO:
    1. Carga este archivo DESPUÉS de app.js en index.html:
       <script src="./ui.editor.js?v=2026.5"></script>

    2. Agrega estos botones en index.html donde quieras:
       <!-- Dentro de .ficha-actions o .filters-actions -->
       <button class="btn ghost" id="btnEditRow" style="display:none">✏️ Editar fila</button>

    3. El módulo expone:
       - RIPUI.editor.openEditModal(ctx, state, rowId)
       - RIPUI.editor.openNewRowModal(ctx, state)
       - RIPUI.editor.wireEditButtons(ctx, state)

  ARQUITECTURA:
    - El modal se inyecta en <body> al abrirse, se destruye al cerrarse.
    - Llama a tu Google Apps Script (EDITOR_API_URL) con acción 'editRow' | 'addRow'.
    - Actualiza state.registro en memoria después de guardar.
    - Muestra toast de éxito/error.

  ENDPOINTS ESPERADOS del Apps Script (ver rip.editor.gs):
    POST (form) o GET con params:
      action=editRow  → token, rowId, field, value  → { ok: true }
      action=addRow   → token, data (JSON)           → { ok: true, newId }
      action=deleteRow → token, rowId               → { ok: true }
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.editor.js necesita rip.core.js + ui.shared.js');
    return;
  }

  // ─── CONFIGURA AQUÍ TU APPS SCRIPT DE EDICIÓN ───────────────────────────────
  // Pega la URL de deployment del script rip.editor.gs
  const EDITOR_API_URL = window.RIP_EDITOR_API_URL || '';
  const EDITOR_TOKEN   = window.RIP_EDITOR_TOKEN   || 'MUSICALA-EDITOR-2026';
  // ────────────────────────────────────────────────────────────────────────────

  const { escapeHTML, toast, norm } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  // =========================
  // Campos editables y sus etiquetas
  // =========================
  const FIELDS = [
    { key: 'tipo',        label: 'Tipo',              type: 'select',   options: ['Clase', 'Pago'] },
    { key: 'estudiante',  label: 'Estudiante',        type: 'text'  },
    { key: 'fechaRaw',    label: 'Fecha',             type: 'date'  },
    { key: 'hora',        label: 'Hora',              type: 'text'  },
    { key: 'servicio',    label: 'Servicio',          type: 'text'  },
    { key: 'profesor',    label: 'Profesor',          type: 'text'  },
    { key: 'pago',        label: 'Pago',              type: 'text'  },
    { key: 'comentario',  label: 'Comentario',        type: 'textarea' },
    { key: 'clasif',      label: 'Clasificación',     type: 'text'  },
    { key: 'clasifPago',  label: 'Clasif. pagos',     type: 'text'  },
    { key: 'movimiento',  label: 'Movimiento',        type: 'number' }
  ];

  // =========================
  // API call (JSONP — igual que programación)
  // =========================
  function apiCall(params = {}) {
    const url = EDITOR_API_URL;
    if (!url) return Promise.reject(new Error('RIP_EDITOR_API_URL no está configurada.'));

    return new Promise((resolve, reject) => {
      const cb = '__ripEditor_' + Math.random().toString(36).slice(2);
      const s  = document.createElement('script');
      const u  = new URL(url);
      let done = false;

      Object.entries({ ...params, callback: cb }).forEach(([k, v]) => {
        u.searchParams.set(k, String(v));
      });

      const cleanup = () => {
        if (s.parentNode) s.parentNode.removeChild(s);
        try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      };

      const timer = setTimeout(() => {
        if (!done) { done = true; cleanup(); reject(new Error('Tiempo de espera agotado.')); }
      }, 20000);

      window[cb] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      s.onerror = () => {
        clearTimeout(timer);
        done = true;
        cleanup();
        reject(new Error('No se pudo conectar con la API de edición.'));
      };

      s.src = u.toString();
      document.body.appendChild(s);
    });
  }

  // =========================
  // Helpers de modal
  // =========================
  function removeModal() {
    const prev = document.getElementById('ripEditorModal');
    if (prev) prev.remove();
  }

  function createModal(title, bodyHTML, onSave) {
    removeModal();

    const m = document.createElement('div');
    m.id = 'ripEditorModal';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">${escapeHTML(title)}</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">✕</button>
        </div>
        <div class="rip-modal-body rip-editor-body">${bodyHTML}</div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">💾 Guardar</button>
        </div>
      </div>
    `;

    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('rip-modal-in'));

    function close() {
      m.classList.remove('rip-modal-in');
      setTimeout(() => m.remove(), 200);
    }

    m.querySelector('.rip-modal-overlay').addEventListener('click', close);
    m.querySelector('.rip-modal-close').addEventListener('click', close);
    m.querySelector('.rip-modal-cancel').addEventListener('click', close);
    m.querySelector('.rip-modal-save').addEventListener('click', () => {
      onSave(m, close);
    });

    const keyFn = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', keyFn);
    m.addEventListener('transitionend', () => {
      if (!m.classList.contains('rip-modal-in')) {
        document.removeEventListener('keydown', keyFn);
      }
    }, { once: true });

    // Foco inicial
    const first = m.querySelector('input, textarea, select');
    if (first) setTimeout(() => first.focus(), 80);

    return m;
  }

  function buildFieldsHTML(rowData) {
    return FIELDS.map((f) => {
      const val = String(rowData?.[f.key] ?? '');

      let input = '';
      if (f.type === 'textarea') {
        input = `<textarea id="ripedit_${f.key}" class="control" rows="2">${escapeHTML(val)}</textarea>`;
      } else if (f.type === 'select') {
        const opts = (f.options || [])
          .map(o => `<option value="${escapeHTML(o)}" ${o === val ? 'selected' : ''}>${escapeHTML(o)}</option>`)
          .join('');
        input = `<select id="ripedit_${f.key}" class="control">${opts}</select>`;
      } else {
        const itype = f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text';
        // Convertir dd/mm/yyyy → yyyy-mm-dd para input type=date
        let inputVal = val;
        if (f.type === 'date' && val) {
          const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m) inputVal = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
        }
        input = `<input type="${itype}" id="ripedit_${f.key}" class="control" value="${escapeHTML(inputVal)}"/>`;
      }

      return `
        <div class="ripedit-field">
          <label for="ripedit_${f.key}" class="ripedit-label">${escapeHTML(f.label)}</label>
          ${input}
        </div>
      `;
    }).join('');
  }

  function readFieldValues(modal) {
    const data = {};
    FIELDS.forEach((f) => {
      const el = modal.querySelector(`#ripedit_${f.key}`);
      if (!el) return;
      let val = el.value || '';
      // Revertir date de yyyy-mm-dd → dd/mm/yyyy
      if (f.type === 'date' && val) {
        const m = val.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) val = `${m[3]}/${m[2]}/${m[1]}`;
      }
      data[f.key] = val;
    });
    return data;
  }

  // =========================
  // Actualizar estado en memoria
  // =========================
  function applyEditToState(state, rowId, newData) {
    if (!Array.isArray(state.registro)) return;
    const idx = state.registro.findIndex(r => r.id === rowId);
    if (idx === -1) return;

    const r = state.registro[idx];
    Object.assign(r, newData);

    // Recalcular estudianteKey si cambió el estudiante
    if (newData.estudiante !== undefined) {
      r.estudianteKey = norm(newData.estudiante);
    }
    if (newData.movimiento !== undefined) {
      r.movimiento = Number(newData.movimiento) || 0;
    }
  }

  function applyNewRowToState(state, row) {
    if (!Array.isArray(state.registro)) return;
    const norm_ = norm;
    state.registro.unshift({
      ...row,
      estudianteKey: norm_(row.estudiante || ''),
      servicioKey:   norm_(row.servicio   || ''),
      profesorKey:   norm_(row.profesor   || ''),
      movimiento:    Number(row.movimiento) || 0,
      fechaTs:       0,
      fechaObj:      null
    });
  }

  // =========================
  // API: Guardar edición
  // =========================
  async function saveEdit(ctx, state, rowId, newData) {
    const tw = ctx?.el?.toastWrap;
    const t  = (msg, tone) => toast(tw, msg, tone);

    if (!EDITOR_API_URL) {
      t('RIP_EDITOR_API_URL no está configurada. Edición solo en memoria.', 'warn');
      applyEditToState(state, rowId, newData);
      refreshTableAfterEdit(ctx, state);
      return;
    }

    t('Guardando cambios…', 'info');

    try {
      const res = await apiCall({
        action: 'editRow',
        token:  EDITOR_TOKEN,
        rowId,
        data:   JSON.stringify(newData)
      });

      if (!res?.ok) {
        t(res?.error || 'Error al guardar.', 'warn');
        return;
      }

      applyEditToState(state, rowId, newData);
      refreshTableAfterEdit(ctx, state);
      t('Fila actualizada ✓', 'ok');

    } catch (err) {
      console.error(err);
      t('No se pudo guardar: ' + (err?.message || err), 'warn');
    }
  }

  async function saveNewRow(ctx, state, data) {
    const tw = ctx?.el?.toastWrap;
    const t  = (msg, tone) => toast(tw, msg, tone);

    if (!EDITOR_API_URL) {
      t('RIP_EDITOR_API_URL no está configurada. Fila solo en memoria.', 'warn');
      applyNewRowToState(state, { ...data, id: 'LOCAL-' + Date.now() });
      refreshTableAfterEdit(ctx, state);
      return;
    }

    t('Agregando fila…', 'info');

    try {
      const res = await apiCall({
        action: 'addRow',
        token:  EDITOR_TOKEN,
        data:   JSON.stringify(data)
      });

      if (!res?.ok) {
        t(res?.error || 'Error al agregar.', 'warn');
        return;
      }

      applyNewRowToState(state, { ...data, id: res.newId || ('LOCAL-' + Date.now()) });
      refreshTableAfterEdit(ctx, state);
      t('Fila agregada ✓', 'ok');

    } catch (err) {
      console.error(err);
      t('No se pudo agregar: ' + (err?.message || err), 'warn');
    }
  }

  function refreshTableAfterEdit(ctx, state) {
    if (window.RIPUI?.table?.applyAndRender) {
      window.RIPUI.table.applyAndRender(ctx, state);
    }
  }

  // =========================
  // Modal: Editar fila existente
  // =========================
  function openEditModal(ctx, state, rowId) {
    const row = (state.registro || []).find(r => r.id === rowId);
    if (!row) {
      toast(ctx?.el?.toastWrap, 'No encontré la fila con ID: ' + rowId, 'warn');
      return;
    }

    const body = `
      <p class="ripedit-id">ID: <code>${escapeHTML(rowId)}</code></p>
      <div class="ripedit-grid">${buildFieldsHTML(row)}</div>
    `;

    createModal('✏️ Editar registro', body, async (modal, close) => {
      const newData = readFieldValues(modal);
      close();
      await saveEdit(ctx, state, rowId, newData);
    });
  }

  // =========================
  // Modal: Nueva fila
  // =========================
  function openNewRowModal(ctx, state) {
    const body = `
      <div class="ripedit-grid">${buildFieldsHTML({})}</div>
    `;

    createModal('➕ Nueva fila', body, async (modal, close) => {
      const data = readFieldValues(modal);
      if (!data.estudiante) {
        toast(ctx?.el?.toastWrap, 'El campo Estudiante es requerido.', 'warn');
        return;
      }
      close();
      await saveNewRow(ctx, state, data);
    });
  }

  // =========================
  // Wiring: botones de edición en la tabla
  // ─ Agrega botones inline en cada fila de la tabla (columna extra) ─
  // Llama a esta función DESPUÉS de renderizar la tabla.
  // =========================
  function wireEditButtons(ctx, state) {
    const tbody = ctx?.el?.tableBody;
    if (!tbody) return;

    // Agregar columna de edición si no existe en thead
    const thead = tbody.closest('table')?.querySelector('thead tr');
    if (thead && !thead.querySelector('.th-edit')) {
      const th = document.createElement('th');
      th.className = 'th-edit';
      th.textContent = '✏️';
      thead.appendChild(th);
    }

    // Agregar botón de edición en cada fila de la tabla actual
    // Para que funcione, el renderTable de ui.table.js pinta filas con datos
    // pero NO incluye IDs. Necesitamos extender el render o usar dataset.
    // Por ahora, este wiring asume que las filas en state.filteredRows están
    // en el mismo orden que en el DOM.
    const rows = tbody.querySelectorAll('tr');
    const filtered = state.filteredRows || [];

    rows.forEach((tr, i) => {
      if (tr.querySelector('.td-edit')) return; // ya tiene botón
      const record = filtered[i];
      if (!record?.id) return;

      const td = document.createElement('td');
      td.className = 'td-edit';
      td.innerHTML = `
        <button class="btn small ghost edit-row-btn" data-rowid="${escapeHTML(record.id)}"
                title="Editar esta fila">✏️</button>
      `;
      tr.appendChild(td);
    });

    // Event delegation
    if (!tbody.__editorBound) {
      tbody.__editorBound = true;
      tbody.addEventListener('click', (e) => {
        const btn = e.target.closest('.edit-row-btn');
        if (!btn) return;
        const rowId = btn.getAttribute('data-rowid') || '';
        if (rowId) openEditModal(ctx, state, rowId);
      });
    }
  }

  // =========================
  // CSS del módulo (inyecta estilos propios)
  // =========================
  function injectStyles() {
    if (document.getElementById('ripEditorStyles')) return;
    const style = document.createElement('style');
    style.id = 'ripEditorStyles';
    style.textContent = `
      .rip-editor-box {
        width: min(560px, 96vw);
        max-height: 88vh;
        overflow-y: auto;
      }
      .rip-editor-body {
        padding: 8px 0;
      }
      .ripedit-id {
        font-size: 11px;
        color: var(--muted, #64748b);
        margin-bottom: 12px;
      }
      .ripedit-id code {
        background: rgba(0,0,0,.06);
        padding: 1px 6px;
        border-radius: 4px;
        font-family: monospace;
      }
      .ripedit-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px 16px;
      }
      @media (max-width: 480px) {
        .ripedit-grid { grid-template-columns: 1fr; }
      }
      .ripedit-field {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .ripedit-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: var(--muted, #64748b);
      }
      .ripedit-field .control {
        padding: 7px 10px;
        border: 1.5px solid var(--bd, #e2e8f0);
        border-radius: 8px;
        font-size: 14px;
        background: var(--bg, #fff);
        color: var(--fg, #0f172a);
        width: 100%;
        box-sizing: border-box;
      }
      .ripedit-field textarea.control {
        resize: vertical;
        min-height: 56px;
      }
      .ripedit-field .control:focus {
        outline: none;
        border-color: var(--accent, #1A3B6E);
        box-shadow: 0 0 0 3px rgba(26,59,110,.12);
      }
      .td-edit { width: 36px; text-align: center; }
      .edit-row-btn { padding: 2px 6px !important; font-size: 12px !important; }
    `;
    document.head.appendChild(style);
  }

  // =========================
  // Init automático: agrega botón "Nueva fila" al header de acciones
  // =========================
  function autoWireNewRowButton(ctx, state) {
    const actionsEl = document.querySelector('.filters-actions');
    if (!actionsEl || actionsEl.querySelector('#btnEditorNewRow')) return;

    const btn = document.createElement('button');
    btn.id = 'btnEditorNewRow';
    btn.className = 'btn ghost';
    btn.textContent = '➕ Nueva fila';
    btn.addEventListener('click', () => openNewRowModal(ctx, state));
    actionsEl.appendChild(btn);
  }

  // =========================
  // Exports
  // =========================
  RIPUI.editor = {
    openEditModal,
    openNewRowModal,
    wireEditButtons,
    injectStyles,
    autoWireNewRowButton
  };

  // Auto-inyecta estilos al cargar
  injectStyles();

})();
