/* global window, document */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    form:           $('paymentForm'),
    fechaPago:      $('fechaPago'),
    tipoEstudiante: $('tipoEstudiante'),
    usersWrap:      $('usersWrap'),
    btnAddUser:     $('btnAddUser'),
    medioPago:      $('medioPago'),
    comentario:     $('comentario'),
    recargo:        $('recargo'),
    descuento:      $('descuento'),
    FEVM:           $('FEVM'),
    totalGeneral:   $('totalGeneral'),
    subtotalDisplay:$('subtotalDisplay'),
    ajustesDisplay: $('ajustesDisplay'),
    usuariosCount:  $('usuariosCount'),
    payPreviewBody: $('payPreviewBody'),
    btnReset:       $('btnReset'),
    status:         $('status'),
    paySuccess:     $('paySuccess'),
    paySuccessMsg:  $('paySuccessMsg'),
    studentsList:   $('studentsList'),
    servicesList:   $('servicesList'),
    toastWrap:      $('toastWrap')
  };

  const USER_COLORS = ['1','2','3','4','5'];
  const MAX_USERS = 5;
  let userCount = 0;

  let meta = { estudiantes: [], servicios: [], tiposEstudiante: [], mediosPago: [] };
  const PRICE_CACHE_KEY = 'rip2026_prices_meta_v1';
  const PRICE_CACHE_TTL = 6 * 60 * 60 * 1000;

  init().catch((err) => {
    console.error('No se pudo iniciar registro de pagos Firebase', err);
    setStatus('No se pudo cargar Firebase para registrar pagos.');
    toast(err?.message || 'No se pudo cargar el registro de pagos.', 'warn');
  });

  async function init() {
    addUser();
    wire();
    els.fechaPago.value = todayISO();
    setStatus('Conectando con Firebase...');
    await window.RIPFirebase.ready;
    if (!window.RIPRepository?.loadPaymentMeta || !window.RIPRepository?.savePaymentTransaction) {
      throw new Error('El registro de pagos necesita RIPRepository/Firebase para cargar y guardar datos.');
    }
    const [baseMeta, priceMeta] = await Promise.all([
      window.RIPRepository.loadPaymentMeta(),
      loadPricesMetaCached()
    ]);
    meta = mergePricesMeta(baseMeta, priceMeta);
    fillMeta();
    setStatus('Listo para registrar pago.');
    refreshTotals();
    renderPreview();
  }

  // ─── Dynamic user slots ─────────────────────────

  function addUser() {
    if (userCount >= MAX_USERS) return;
    userCount++;
    const n = userCount;
    const color = USER_COLORS[(n - 1) % USER_COLORS.length];
    const isFirst = n === 1;

    const section = document.createElement('section');
    section.className = 'pay-user';
    section.dataset.userId = n;
    section.dataset.color = color;
    section.innerHTML = `
      <div class="pay-user-header">
        <span class="pay-user-badge">${n}</span>
        <span class="pay-user-label">Usuario ${n}${isFirst ? ' <small>· obligatorio</small>' : ''}</span>
        ${!isFirst ? `<button class="pay-user-remove" type="button" data-remove-user="${n}" title="Eliminar usuario">×</button>` : ''}
      </div>
      <div class="pay-user-grid">
        <label class="field">
          <span>Estudiante</span>
          <input id="usuario${n}" class="control" list="studentsList" placeholder="Escribe para buscar...">
        </label>
        <label class="field">
          <span>Servicio</span>
          <input id="servicio${n}" class="control" list="servicesList" placeholder="Servicio...">
        </label>
        <label class="field">
          <span>Precio</span>
          <input id="precio${n}" class="control money" type="number" min="0" step="1" placeholder="0">
          <button class="pay-suggest-btn" type="button" data-suggest-price="${n}">✦ Precio sugerido</button>
        </label>
        <label class="field">
          <span>Ciclo</span>
          <input id="ciclo${n}" class="control" type="number" min="0" step="1" placeholder="Opcional">
        </label>
      </div>`;

    els.usersWrap.appendChild(section);
    updateAddButton();
    refreshTotals();
    renderPreview();
  }

  function removeUser(n) {
    const section = els.usersWrap.querySelector(`[data-user-id="${n}"]`);
    if (section) section.remove();
    updateAddButton();
    refreshTotals();
    renderPreview();
  }

  function updateAddButton() {
    const active = els.usersWrap.querySelectorAll('.pay-user').length;
    els.btnAddUser.disabled = active >= MAX_USERS;
    els.btnAddUser.textContent = active >= MAX_USERS
      ? `Máximo ${MAX_USERS} usuarios`
      : `+ Agregar usuario`;
  }

  // ─── Wire ────────────────────────────────────────

  function wire() {
    els.form.addEventListener('submit', save);
    els.btnReset.addEventListener('click', () => resetForm());
    els.btnAddUser.addEventListener('click', addUser);

    els.form.addEventListener('input', (ev) => {
      if (ev.target.classList.contains('money') ||
          ev.target.id === 'recargo' || ev.target.id === 'descuento') refreshTotals();
      const serviceMatch = ev.target.id?.match(/^servicio(\d+)$/);
      if (serviceMatch) {
        const priceInput = $(`precio${serviceMatch[1]}`);
        if (priceInput && !String(priceInput.value || '').trim()) suggestPrice(serviceMatch[1], { silent: true });
      }
      hideSuccess();
      renderPreview();
    });

    els.form.addEventListener('change', (ev) => {
      refreshTotals();
      renderPreview();
    });

    els.form.addEventListener('click', (ev) => {
      const suggestBtn = ev.target.closest('[data-suggest-price]');
      if (suggestBtn) { suggestPrice(suggestBtn.getAttribute('data-suggest-price')); return; }

      const removeBtn = ev.target.closest('[data-remove-user]');
      if (removeBtn) removeUser(Number(removeBtn.getAttribute('data-remove-user')));
    });
  }

  // ─── Meta ────────────────────────────────────────

  function fillMeta() {
    fillSelect(els.tipoEstudiante, meta.tiposEstudiante, 'Seleccionar...');
    fillSelect(els.medioPago, meta.mediosPago, 'Seleccionar...');
    els.studentsList.innerHTML = (meta.estudiantes || []).map(v => `<option value="${escapeHTML(v)}"></option>`).join('');
    els.servicesList.innerHTML = (meta.servicios || []).map(s => `<option value="${escapeHTML(s.name || s)}"></option>`).join('');
  }

  function mergePricesMeta(baseMeta, priceMeta) {
    const services = window.RIPRepository?.mergeServiceMeta
      ? window.RIPRepository.mergeServiceMeta(
        window.RIPRepository.getDefaultServices?.() || [],
        baseMeta?.servicios || [],
        priceMeta?.servicios || []
      )
      : [
        ...(baseMeta?.servicios || []),
        ...(priceMeta?.servicios || [])
      ];
    return {
      ...baseMeta,
      tiposEstudiante: priceMeta?.tiposEstudiante?.length ? priceMeta.tiposEstudiante : baseMeta.tiposEstudiante,
      servicios: services
    };
  }

  async function loadPricesMetaCached() {
    const url = window.RIP_PRICES_TSV_URL || '';
    if (!url) return null;
    const cached = readPriceCache();
    if (cached) return cached;
    try {
      const res = await fetch(url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const priceMeta = parsePricesTSV(text);
      if (priceMeta.servicios.length) writePriceCache(priceMeta);
      return priceMeta;
    } catch (err) {
      console.warn('No se pudieron cargar precios TSV', err);
      setStatus('Precios no cargaron; puedes escribirlos manualmente.');
      return null;
    }
  }

  function readPriceCache() {
    try {
      const raw = JSON.parse(localStorage.getItem(PRICE_CACHE_KEY) || 'null');
      if (!raw || !raw.stamp || !raw.data) return null;
      if (Date.now() - Number(raw.stamp) > PRICE_CACHE_TTL) return null;
      return raw.data;
    } catch (_) { return null; }
  }

  function writePriceCache(data) {
    try { localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ stamp: Date.now(), data })); } catch (_) {}
  }

  function parsePricesTSV(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(Boolean);
    const rows = lines.map(line => line.split('\t'));
    const header = rows.shift() || [];
    const norm = (v) => window.RIPCalculations.norm(v);
    const idxServicio  = header.findIndex(h => norm(h).includes('servicio'));
    const idxNuevos    = header.findIndex(h => norm(h).includes('nuevo'));
    const idxConvenios = header.findIndex(h => norm(h).includes('beneficio') || norm(h).includes('convenio') || norm(h).includes('antiguo'));
    const map = new Map();
    for (const row of rows) {
      const name = String(row[idxServicio] || '').trim();
      if (!name) continue;
      const prices = {};
      const nuevo   = money(row[idxNuevos]);
      const antiguo = money(row[idxConvenios]);
      if (nuevo > 0)   prices.Nuevos = nuevo;
      if (antiguo > 0) prices['Antiguos/Convenios'] = antiguo;
      map.set(name, { name, prices });
    }
    return {
      tiposEstudiante: ['Antiguos/Convenios', 'Nuevos'],
      servicios: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    };
  }

  // ─── Price suggest ───────────────────────────────

  function suggestPrice(index, opts = {}) {
    const servicio = $(`servicio${index}`)?.value || '';
    const tipo = els.tipoEstudiante.value || 'Antiguos/Convenios';
    const item = (meta.servicios || []).find(s => String(s.name || s) === servicio);
    const price = item?.prices?.[tipo] || item?.prices?.Nuevos || item?.prices?.['Antiguos/Convenios'] || 0;
    if (!price) {
      if (!opts.silent) toast('No encontré precio sugerido para ese servicio.', 'warn');
      return;
    }
    const input = $(`precio${index}`);
    if (input) input.value = String(price);
    refreshTotals();
    renderPreview();
  }

  // ─── Read ────────────────────────────────────────

  function readUsers() {
    return Array.from(els.usersWrap.querySelectorAll('.pay-user')).map(section => {
      const n = section.dataset.userId;
      return {
        estudiante: $(`usuario${n}`)?.value || '',
        servicio:   $(`servicio${n}`)?.value || '',
        precio:     $(`precio${n}`)?.value   || '',
        ciclo:      $(`ciclo${n}`)?.value    || ''
      };
    });
  }

  function readPayload() {
    return {
      fechaPago:      els.fechaPago.value      || '',
      tipoEstudiante: els.tipoEstudiante.value || '',
      usuarios:       readUsers(),
      medioPago:      els.medioPago.value      || '',
      comentario:     els.comentario.value     || '',
      recargo:        els.recargo.value        || '',
      descuento:      els.descuento.value      || '',
      FEVM:           els.FEVM.value           || ''
    };
  }

  // ─── Validate ────────────────────────────────────

  function getIssues(data) {
    const issues = [];
    if (!data.fechaPago)  issues.push({ type: 'err',  msg: 'Falta la fecha de pago.' });
    if (!data.medioPago)  issues.push({ type: 'err',  msg: 'Falta el medio de pago.' });

    const validUsers = data.usuarios.filter(u =>
      String(u.estudiante || '').trim() &&
      String(u.servicio   || '').trim() &&
      money(u.precio) > 0
    );
    const partialUsers = data.usuarios.filter(u => {
      const hasAny = String(u.estudiante || '').trim() || String(u.servicio || '').trim() || money(u.precio) > 0;
      const hasFull = String(u.estudiante || '').trim() && String(u.servicio || '').trim() && money(u.precio) > 0;
      return hasAny && !hasFull;
    });

    if (!validUsers.length) issues.push({ type: 'err', msg: 'Agrega al menos un usuario con nombre, servicio y precio.' });
    if (partialUsers.length) issues.push({ type: 'warn', msg: `${partialUsers.length} usuario(s) incompleto(s) — no se guardarán.` });

    const names = validUsers.map(u => String(u.estudiante || '').trim().toLowerCase());
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) issues.push({ type: 'warn', msg: `Estudiante duplicado: ${[...new Set(dupes)].join(', ')}.` });

    return issues;
  }

  // ─── Preview panel ───────────────────────────────

  function renderPreview() {
    const data = readPayload();
    const issues = getIssues(data);
    const validUsers = data.usuarios.filter(u =>
      String(u.estudiante || '').trim() &&
      String(u.servicio   || '').trim() &&
      money(u.precio) > 0
    );

    const subtotal  = validUsers.reduce((s, u) => s + money(u.precio), 0);
    const recargo   = money(data.recargo);
    const descuento = money(data.descuento);
    const total     = subtotal + recargo - descuento;

    const icon = (type) => {
      const map = { ok: '✓', err: '✕', warn: '!' };
      return `<span class="pay-preview-icon ${type}">${map[type] || '·'}</span>`;
    };

    const userColors = ['#3b82f6','#8b5cf6','#0d9488','#f59e0b','#ec4899'];

    let html = '';

    // Fecha
    html += `<div class="pay-preview-row">
      ${icon(data.fechaPago ? 'ok' : 'err')}
      <div class="pay-preview-content">
        <div class="pay-preview-key">Fecha de pago</div>
        <div class="pay-preview-val ${data.fechaPago ? '' : 'missing'}">${data.fechaPago || 'Sin fecha'}</div>
      </div>
    </div>`;

    // Medio de pago
    html += `<div class="pay-preview-row">
      ${icon(data.medioPago ? 'ok' : 'err')}
      <div class="pay-preview-content">
        <div class="pay-preview-key">Medio de pago</div>
        <div class="pay-preview-val ${data.medioPago ? '' : 'missing'}">${data.medioPago || 'Sin seleccionar'}</div>
      </div>
    </div>`;

    // Tipo + comentario (si hay)
    if (data.tipoEstudiante || data.comentario) {
      html += `<div class="pay-preview-row">
        ${icon('ok')}
        <div class="pay-preview-content">
          <div class="pay-preview-key">Tipo / Comentario</div>
          <div class="pay-preview-val">${[data.tipoEstudiante, data.comentario].filter(Boolean).join(' · ') || '—'}</div>
        </div>
      </div>`;
    }

    html += `<div class="pay-preview-divider"></div>`;

    // Usuarios
    html += `<div class="pay-preview-row">
      ${icon(validUsers.length ? 'ok' : 'err')}
      <div class="pay-preview-content">
        <div class="pay-preview-key">Usuarios (${validUsers.length} válido${validUsers.length !== 1 ? 's' : ''})</div>
        <div class="pay-preview-users">`;

    if (validUsers.length) {
      validUsers.forEach((u, idx) => {
        const color = userColors[idx % userColors.length];
        html += `<div class="pay-preview-user-row">
          <span class="pay-preview-user-dot" style="background:${color}"></span>
          <span class="pay-preview-user-name">${escapeHTML(u.estudiante)}</span>
          <span class="pay-preview-user-service">${escapeHTML(u.servicio)}${u.ciclo ? ' · ciclo ' + escapeHTML(u.ciclo) : ''}</span>
          <span class="pay-preview-user-price">${formatCOP(money(u.precio))}</span>
        </div>`;
      });
    } else {
      html += `<div class="pay-preview-user-err">Sin usuarios válidos todavía.</div>`;
    }

    html += `</div></div></div>`;

    html += `<div class="pay-preview-divider"></div>`;

    // Total breakdown
    html += `<div class="pay-preview-total-block">
      <div class="pay-preview-total-line"><span>Subtotal (${validUsers.length} usuario${validUsers.length !== 1 ? 's' : ''})</span><span>${formatCOP(subtotal)}</span></div>`;
    if (recargo)   html += `<div class="pay-preview-total-line"><span>Recargo</span><span>+ ${formatCOP(recargo)}</span></div>`;
    if (descuento) html += `<div class="pay-preview-total-line"><span>Descuento</span><span>− ${formatCOP(descuento)}</span></div>`;
    html += `<div class="pay-preview-total-line final"><span>Total a guardar</span><span>${formatCOP(total)}</span></div>
    </div>`;

    // Issues
    if (issues.length) {
      html += `<div class="pay-preview-issues">`;
      issues.forEach(issue => {
        const emoji = issue.type === 'err' ? '✕' : '⚠';
        html += `<div class="pay-preview-issue ${issue.type}">${emoji} ${escapeHTML(issue.msg)}</div>`;
      });
      html += `</div>`;
    }

    els.payPreviewBody.innerHTML = html;
  }

  // ─── Totals bar ──────────────────────────────────

  function refreshTotals() {
    const users = readUsers();
    const subtotal  = users.reduce((s, u) => s + money(u.precio), 0);
    const recargo   = money(els.recargo.value);
    const descuento = money(els.descuento.value);
    const total     = subtotal + recargo - descuento;

    els.subtotalDisplay.textContent = formatCOP(subtotal);
    els.totalGeneral.textContent    = formatCOP(total);

    const ajustes = [];
    if (recargo)   ajustes.push(`+${formatCOP(recargo)}`);
    if (descuento) ajustes.push(`−${formatCOP(descuento)}`);
    els.ajustesDisplay.textContent = ajustes.length ? ajustes.join(' / ') : '—';

    const validCount = users.filter(u =>
      String(u.estudiante || '').trim() && String(u.servicio || '').trim() && money(u.precio) > 0
    ).length;
    els.usuariosCount.textContent = validCount;
  }

  // ─── Save ────────────────────────────────────────

  async function save(ev) {
    ev.preventDefault();
    const data = readPayload();
    const errors = getIssues(data).filter(i => i.type === 'err');
    if (errors.length) {
      const msg = errors[0].msg;
      setStatus(msg);
      toast(msg, 'warn');
      return;
    }

    els.btnReset.disabled = true;
    $('btnSavePayment').disabled = true;
    setStatus('Guardando pago...');
    try {
      const res = await window.RIPRepository.savePaymentTransaction(data);
      showSuccess(`Pago guardado: ${res.registro.length} fila(s) en Registro y 1 en Clientes B2C.`);
      toast('Pago guardado correctamente.', 'ok');
      resetForm({ keepStatus: true });
    } catch (errSave) {
      console.error(errSave);
      setStatus('Error: ' + (errSave.message || errSave));
      toast('No se pudo guardar el pago.', 'warn');
    } finally {
      els.btnReset.disabled = false;
      $('btnSavePayment').disabled = false;
    }
  }

  // ─── Reset ───────────────────────────────────────

  function resetForm(opts = {}) {
    els.form.reset();
    els.fechaPago.value = todayISO();
    // Clear user slots and start fresh
    els.usersWrap.innerHTML = '';
    userCount = 0;
    addUser();
    refreshTotals();
    renderPreview();
    if (!opts.keepStatus) {
      hideSuccess();
      setStatus('Listo para registrar pago.');
    }
  }

  // ─── Helpers ─────────────────────────────────────

  function fillSelect(select, items, placeholder) {
    select.innerHTML = `<option value="">${escapeHTML(placeholder || 'Seleccionar...')}</option>` +
      (items || []).map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  }

  function money(value) { return window.RIPCalculations.safeNum(value); }

  function formatCOP(value) {
    return '$' + (Number(value) || 0).toLocaleString('es-CO');
  }

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function showSuccess(msg) {
    if (els.paySuccessMsg) els.paySuccessMsg.textContent = msg;
    els.paySuccess.classList.add('show');
    setStatus('Pago guardado.');
  }

  function hideSuccess() { els.paySuccess.classList.remove('show'); }
  function setStatus(message) { els.status.textContent = message || ''; }

  function toast(message, tone) {
    if (window.RIPUI?.shared?.toast) window.RIPUI.shared.toast(els.toastWrap, message, tone);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
})();
