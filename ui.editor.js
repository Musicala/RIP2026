/* global window, document */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.editor.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, toast, norm } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

  const FIELDS = [
    { key: 'tipo', label: 'Tipo', type: 'select', options: ['Clase', 'Pago', 'Multa', 'Otro'] },
    { key: 'estudiante', label: 'Estudiante', type: 'text' },
    { key: 'fechaRaw', label: 'Fecha', type: 'date' },
    { key: 'hora', label: 'Hora', type: 'text' },
    { key: 'servicio', label: 'Servicio', type: 'text' },
    { key: 'profesor', label: 'Profesor', type: 'text' },
    { key: 'pago', label: 'Pago', type: 'text' },
    { key: 'comentario', label: 'Comentario', type: 'textarea' }
  ];

  function notify(ctx, msg, tone) {
    toast(ctx?.el?.toastWrap, msg, tone);
  }

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
          <button class="rip-modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        <div class="rip-modal-body rip-editor-body">${bodyHTML}</div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(m);
    requestAnimationFrame(() => m.classList.add('rip-modal-in'));
    const close = () => {
      m.classList.remove('rip-modal-in');
      setTimeout(() => m.remove(), 160);
    };
    m.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    m.querySelector('.rip-modal-close')?.addEventListener('click', close);
    m.querySelector('.rip-modal-cancel')?.addEventListener('click', close);
    m.querySelector('.rip-modal-save')?.addEventListener('click', () => onSave(m, close));
    setTimeout(() => m.querySelector('input, textarea, select')?.focus(), 80);
  }

  function asDateInput(value) {
    const raw = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
  }

  function buildFieldsHTML(rowData) {
    return FIELDS.map((f) => {
      const val = f.type === 'date' ? asDateInput(rowData?.[f.key] || rowData?.fecha) : String(rowData?.[f.key] ?? '');
      if (f.type === 'textarea') {
        return `<label class="ripedit-field"><span class="ripedit-label">${escapeHTML(f.label)}</span><textarea id="ripedit_${f.key}" class="control" rows="2">${escapeHTML(val)}</textarea></label>`;
      }
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => `<option value="${escapeHTML(o)}" ${o === val ? 'selected' : ''}>${escapeHTML(o)}</option>`).join('');
        return `<label class="ripedit-field"><span class="ripedit-label">${escapeHTML(f.label)}</span><select id="ripedit_${f.key}" class="control">${opts}</select></label>`;
      }
      return `<label class="ripedit-field"><span class="ripedit-label">${escapeHTML(f.label)}</span><input type="${f.type === 'date' ? 'date' : 'text'}" id="ripedit_${f.key}" class="control" value="${escapeHTML(val)}"></label>`;
    }).join('');
  }

  function readFieldValues(modal) {
    const data = {};
    FIELDS.forEach((f) => {
      const el = modal.querySelector(`#ripedit_${f.key}`);
      if (el) data[f.key] = el.value || '';
    });
    if (data.fechaRaw) data.fecha = data.fechaRaw;
    return data;
  }

  function refreshTableAfterEdit(ctx, state) {
    if (window.RIPUI?.table?.applyAndRender) window.RIPUI.table.applyAndRender(ctx, state);
  }

  function upsertStateRow(state, row) {
    if (!Array.isArray(state.registro)) state.registro = [];
    const idx = state.registro.findIndex(r => r.id === row.id);
    const prepared = {
      ...row,
      estudianteKey: row.estudianteKey || norm(row.estudiante),
      servicioKey: row.servicioKey || norm(row.servicio),
      profesorKey: row.profesorKey || norm(row.profesor),
      movimiento: Number(row.movimiento) || 0
    };
    if (idx >= 0) state.registro[idx] = { ...state.registro[idx], ...prepared };
    else state.registro.unshift(prepared);
  }

  async function saveEdit(ctx, state, rowId, newData) {
    notify(ctx, 'Guardando...', 'info');
    try {
      const saved = await window.RIPRepository.updateRegistroRow(rowId, newData);
      upsertStateRow(state, saved);
      refreshTableAfterEdit(ctx, state);
      notify(ctx, 'Guardado correctamente', 'ok');
    } catch (err) {
      console.error(err);
      notify(ctx, 'Error al guardar: ' + (err?.message || err), 'warn');
    }
  }

  async function saveNewRow(ctx, state, data) {
    notify(ctx, 'Guardando...', 'info');
    try {
      const saved = await window.RIPRepository.addRegistroRow(data);
      upsertStateRow(state, saved);
      refreshTableAfterEdit(ctx, state);
      notify(ctx, 'Guardado correctamente', 'ok');
    } catch (err) {
      console.error(err);
      notify(ctx, 'Error al guardar: ' + (err?.message || err), 'warn');
    }
  }

  async function deleteRow(ctx, state, rowId) {
    if (!rowId) return;
    notify(ctx, 'Guardando...', 'info');
    try {
      await window.RIPRepository.deleteRegistroRow(rowId);
      state.registro = (state.registro || []).filter(r => r.id !== rowId);
      refreshTableAfterEdit(ctx, state);
      notify(ctx, 'Guardado correctamente', 'ok');
    } catch (err) {
      console.error(err);
      notify(ctx, 'Error al guardar: ' + (err?.message || err), 'warn');
    }
  }

  function openEditModal(ctx, state, rowId) {
    const row = (state.registro || []).find(r => r.id === rowId);
    if (!row) return notify(ctx, 'No encontre la fila con ID: ' + rowId, 'warn');
    const body = `<p class="ripedit-id">ID: <code>${escapeHTML(rowId)}</code></p><div class="ripedit-grid">${buildFieldsHTML(row)}</div>`;
    createModal('Editar registro', body, async (modal, close) => {
      const data = readFieldValues(modal);
      close();
      await saveEdit(ctx, state, rowId, data);
    });
  }

  function openNewRowModal(ctx, state) {
    const body = `<div class="ripedit-grid">${buildFieldsHTML({ tipo: 'Clase' })}</div>`;
    createModal('Nuevo registro', body, async (modal, close) => {
      const data = readFieldValues(modal);
      if (!data.estudiante) return notify(ctx, 'El campo Estudiante es requerido.', 'warn');
      close();
      await saveNewRow(ctx, state, data);
    });
  }

  function wireEditButtons(ctx, state) {
    const tbody = ctx?.el?.tableBody;
    if (!tbody || tbody.__ripEditorBound) return;
    tbody.__ripEditorBound = true;
    tbody.addEventListener('click', (ev) => {
      const edit = ev.target.closest('[data-edit-row]');
      if (edit) return openEditModal(ctx, state, edit.getAttribute('data-edit-row'));
      const del = ev.target.closest('[data-delete-row]');
      if (del && confirm('Eliminar este registro?')) deleteRow(ctx, state, del.getAttribute('data-delete-row'));
    });
  }

  RIPUI.editor = { openEditModal, openNewRowModal, wireEditButtons, deleteRow };
})();
