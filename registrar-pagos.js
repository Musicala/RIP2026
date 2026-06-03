/* global window, document */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    form: $('paymentForm'),
    fechaPago: $('fechaPago'),
    tipoEstudiante: $('tipoEstudiante'),
    usersWrap: $('usersWrap'),
    medioPago: $('medioPago'),
    comentario: $('comentario'),
    recargo: $('recargo'),
    descuento: $('descuento'),
    FEVM: $('FEVM'),
    totalGeneral: $('totalGeneral'),
    btnReset: $('btnReset'),
    status: $('status'),
    paySuccess: $('paySuccess'),
    studentsList: $('studentsList'),
    servicesList: $('servicesList'),
    toastWrap: $('toastWrap')
  };

  let meta = { estudiantes: [], servicios: [], tiposEstudiante: [], mediosPago: [] };

  init();

  async function init() {
    renderUsers();
    wire();
    els.fechaPago.value = todayISO();
    setStatus('Conectando con Firebase...');
    await window.RIPFirebase.ready;
    meta = await window.RIPRepository.loadPaymentMeta();
    meta = await mergePricesMeta(meta);
    fillMeta();
    setStatus('Listo para registrar pago.');
    calcTotal();
  }

  function renderUsers() {
    els.usersWrap.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      return `
        <section class="pay-user">
          <h4>Usuario ${n}${n === 1 ? ' · obligatorio' : ''}</h4>
          <div class="pay-grid">
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
              <button class="btn small ghost" type="button" data-suggest-price="${n}">Sugerido</button>
            </label>
            <label class="field">
              <span>Ciclo</span>
              <input id="ciclo${n}" class="control" type="number" min="0" step="1" placeholder="Opcional">
            </label>
          </div>
        </section>`;
    }).join('');
  }

  function wire() {
    els.form.addEventListener('submit', save);
    els.btnReset.addEventListener('click', () => resetForm());
    els.form.addEventListener('input', (ev) => {
      if (ev.target.classList.contains('money')) calcTotal();
      const serviceMatch = ev.target.id && ev.target.id.match(/^servicio(\d+)$/);
      if (serviceMatch) {
        const priceInput = $(`precio${serviceMatch[1]}`);
        if (priceInput && !String(priceInput.value || '').trim()) suggestPrice(serviceMatch[1], { silent: true });
      }
      hideSuccess();
    });
    els.form.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-suggest-price]');
      if (!btn) return;
      suggestPrice(btn.getAttribute('data-suggest-price'));
    });
  }

  function fillMeta() {
    fillSelect(els.tipoEstudiante, meta.tiposEstudiante, 'Seleccionar...');
    fillSelect(els.medioPago, meta.mediosPago, 'Seleccionar...');
    els.studentsList.innerHTML = (meta.estudiantes || []).map(v => `<option value="${escapeHTML(v)}"></option>`).join('');
    els.servicesList.innerHTML = (meta.servicios || []).map(s => `<option value="${escapeHTML(s.name || s)}"></option>`).join('');
  }

  async function mergePricesMeta(baseMeta) {
    const url = window.RIP_PRICES_TSV_URL || '';
    if (!url) return baseMeta;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      const priceMeta = parsePricesTSV(text);
      if (!priceMeta.servicios.length) return baseMeta;
      return {
        ...baseMeta,
        tiposEstudiante: priceMeta.tiposEstudiante,
        servicios: priceMeta.servicios
      };
    } catch (err) {
      console.warn('No se pudieron cargar precios TSV', err);
      setStatus('Precios no cargaron; puedes escribirlos manualmente.');
      return baseMeta;
    }
  }

  function parsePricesTSV(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').filter(Boolean);
    const rows = lines.map(line => line.split('\t'));
    const header = rows.shift() || [];
    const norm = (v) => window.RIPCalculations.norm(v);
    const idxServicio = header.findIndex(h => norm(h).includes('servicio'));
    const idxNuevos = header.findIndex(h => norm(h).includes('nuevo'));
    const idxConvenios = header.findIndex(h => norm(h).includes('beneficio') || norm(h).includes('convenio') || norm(h).includes('antiguo'));
    const map = new Map();
    for (const row of rows) {
      const name = String(row[idxServicio] || '').trim();
      if (!name) continue;
      const prices = {};
      const nuevo = money(row[idxNuevos]);
      const antiguo = money(row[idxConvenios]);
      if (nuevo > 0) prices.Nuevos = nuevo;
      if (antiguo > 0) prices['Antiguos/Convenios'] = antiguo;
      map.set(name, { name, prices });
    }
    return {
      tiposEstudiante: ['Antiguos/Convenios', 'Nuevos'],
      servicios: Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
    };
  }

  function suggestPrice(index, opts = {}) {
    const servicio = $(`servicio${index}`)?.value || '';
    const tipo = els.tipoEstudiante.value || 'Antiguos/Convenios';
    const item = (meta.servicios || []).find(s => String(s.name || s) === servicio);
    const price = item?.prices?.[tipo] || item?.prices?.Nuevos || item?.prices?.['Antiguos/Convenios'] || 0;
    if (!price) {
      if (!opts.silent) toast('No encontre precio sugerido para ese servicio.', 'warn');
      return;
    }
    const input = $(`precio${index}`);
    if (input) input.value = String(price);
    calcTotal();
  }

  function fillSelect(select, items, placeholder) {
    select.innerHTML = `<option value="">${escapeHTML(placeholder || 'Seleccionar...')}</option>` +
      (items || []).map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join('');
  }

  function readUsers() {
    return Array.from({ length: 5 }, (_, i) => {
      const n = i + 1;
      return {
        estudiante: $(`usuario${n}`)?.value || '',
        servicio: $(`servicio${n}`)?.value || '',
        precio: $(`precio${n}`)?.value || '',
        ciclo: $(`ciclo${n}`)?.value || ''
      };
    });
  }

  function readPayload() {
    return {
      fechaPago: els.fechaPago.value || '',
      tipoEstudiante: els.tipoEstudiante.value || '',
      usuarios: readUsers(),
      medioPago: els.medioPago.value || '',
      comentario: els.comentario.value || '',
      recargo: els.recargo.value || '',
      descuento: els.descuento.value || '',
      FEVM: els.FEVM.value || ''
    };
  }

  function validate(data) {
    const valid = data.usuarios.filter(u => String(u.estudiante || '').trim() && String(u.servicio || '').trim() && money(u.precio) > 0);
    if (!data.fechaPago) return 'Falta fecha de pago.';
    if (!valid.length) return 'Agrega al menos un usuario con estudiante, servicio y precio.';
    if (!data.medioPago) return 'Falta medio de pago.';
    return '';
  }

  async function save(ev) {
    ev.preventDefault();
    const data = readPayload();
    const err = validate(data);
    if (err) {
      setStatus(err);
      toast(err, 'warn');
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

  function resetForm(opts = {}) {
    els.form.reset();
    els.fechaPago.value = todayISO();
    calcTotal();
    if (!opts.keepStatus) {
      hideSuccess();
      setStatus('Listo para registrar pago.');
    }
  }

  function calcTotal() {
    const users = readUsers();
    const subtotal = users.reduce((sum, u) => sum + money(u.precio), 0);
    const total = subtotal + money(els.recargo.value) - money(els.descuento.value);
    els.totalGeneral.textContent = formatCOP(total);
    return total;
  }

  function money(value) {
    return window.RIPCalculations.safeNum(value);
  }

  function formatCOP(value) {
    return '$' + (Number(value) || 0).toLocaleString('es-CO');
  }

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }

  function showSuccess(msg) {
    els.paySuccess.textContent = msg;
    els.paySuccess.classList.add('show');
    setStatus('Pago guardado.');
  }

  function hideSuccess() {
    els.paySuccess.classList.remove('show');
  }

  function setStatus(message) {
    els.status.textContent = message || '';
  }

  function toast(message, tone) {
    if (window.RIPUI?.shared?.toast) window.RIPUI.shared.toast(els.toastWrap, message, tone);
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
})();
