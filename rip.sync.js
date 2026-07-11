/* global window, document, localStorage, setInterval, clearInterval, setTimeout, clearTimeout */
(function () {
  'use strict';

  const KEY = 'rip2026_sync_settings';
  let timer = null;
  let writeTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return {
        mode: saved.mode || 'afterEdit',
        intervalMinutes: Number(saved.intervalMinutes) || 5
      };
    } catch (_) {
      return { mode: 'afterEdit', intervalMinutes: 5 };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(KEY, JSON.stringify({
      mode: settings.mode || 'afterEdit',
      intervalMinutes: Number(settings.intervalMinutes) || 5
    }));
    setupTimer();
  }

  function refreshNow() {
    const btn = $('btnRefresh');
    if (btn) btn.click();
  }

  function setupTimer() {
    if (timer) clearInterval(timer);
    timer = null;
    const settings = readSettings();
    if (settings.mode !== 'interval') return;
    const minutes = Math.max(1, Number(settings.intervalMinutes) || 5);
    timer = setInterval(refreshNow, minutes * 60000);
  }

  window.RIPAppFirestoreChanged = function () {
    const settings = readSettings();
    if (settings.mode !== 'afterEdit') return;
    if (writeTimer) clearTimeout(writeTimer);
    writeTimer = setTimeout(refreshNow, 800);
  };

  function closeModal(modal) {
    modal.classList.remove('rip-modal-in');
    setTimeout(() => modal.remove(), 160);
  }

  function openSettings() {
    const prev = $('ripSyncSettingsModal');
    if (prev) prev.remove();

    const current = readSettings();
    const modal = document.createElement('div');
    modal.id = 'ripSyncSettingsModal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="rip-modal-box rip-editor-box">
        <div class="rip-modal-head">
          <span class="rip-modal-title">Configuracion de actualizacion</span>
          <button class="rip-modal-close" type="button" aria-label="Cerrar">x</button>
        </div>
        <div class="rip-modal-body rip-editor-body">
          <div class="ripedit-grid">
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Cuando se guarden cambios</span>
              <select id="ripSyncMode" class="control">
                <option value="afterEdit" ${current.mode === 'afterEdit' ? 'selected' : ''}>Actualizar de una al editar</option>
                <option value="interval" ${current.mode === 'interval' ? 'selected' : ''}>Actualizar cada cierto tiempo</option>
                <option value="manual" ${current.mode === 'manual' ? 'selected' : ''}>Solo con el boton Actualizar</option>
              </select>
            </label>
            <label class="ripedit-field" style="grid-column:1/-1">
              <span class="ripedit-label">Intervalo en minutos</span>
              <input id="ripSyncInterval" type="number" min="1" class="control" value="${String(current.intervalMinutes || 5)}">
            </label>
          </div>
        </div>
        <div class="rip-modal-foot">
          <button class="btn ghost rip-modal-cancel" type="button">Cancelar</button>
          <button class="btn primary rip-modal-save" type="button">Guardar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('rip-modal-in'));

    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', () => closeModal(modal));
    modal.querySelector('.rip-modal-close')?.addEventListener('click', () => closeModal(modal));
    modal.querySelector('.rip-modal-cancel')?.addEventListener('click', () => closeModal(modal));
    modal.querySelector('.rip-modal-save')?.addEventListener('click', () => {
      saveSettings({
        mode: modal.querySelector('#ripSyncMode')?.value || 'afterEdit',
        intervalMinutes: modal.querySelector('#ripSyncInterval')?.value || 5
      });
      closeModal(modal);
    });
  }

  function init() {
    $('btnSyncSettings')?.addEventListener('click', openSettings);
    setupTimer();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
