/* =============================================================================
  ui.dashboard.js — RIP 2026 UI Dashboard — v2 (POR REVISAR dividido)
  CAMBIOS:
    - "Por revisar" ahora se divide en sub-grupos por estado exacto de clasificación
    - Cada sub-grupo muestra su propia tarjeta con color diferente
    - Saldos y clasificación sin cambios
============================================================================= */
(function () {
  'use strict';

  if (!window.RIPCore || !window.RIPUI?.shared) {
    console.error('ui.dashboard.js necesita rip.core.js + ui.shared.js');
    return;
  }

  const { escapeHTML, fmtMoney, norm } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});
  let __registroTableHeadHTML = '';

  function isClassRow(row) {
    const tipo = norm(row?.tipo || '');
    return tipo === 'clase' || (tipo !== 'pago' && !String(row?.pago || '').trim());
  }

  function isPaymentRow(row) {
    const tipo = norm(row?.tipo || '');
    return tipo === 'pago' || Number(row?.valorPago || 0) > 0 || String(row?.pago || '').trim();
  }

  function inlineFichaHTML(ctx, s) {
    const key = s.key || norm(s.name);
    const ficha = window.RIPCore?.getStudentFicha?.(ctx?.state?.registro || [], key) || { saldo: 0, rows: [] };
    const rows = ficha.rows || [];
    const lastClass = rows.find(isClassRow);
    const lastPayment = rows.find(isPaymentRow);
    const totalClasses = rows.filter(isClassRow).length;
    const totalPayments = rows.filter(isPaymentRow).length;
    const recentRows = rows.slice(0, 4);
    const saldo = Number(ficha.saldo) || 0;
    const days = daysSinceValue(s);
    return `
      <div class="inline-ficha">
        <div class="inline-ficha-head">
          <div>
            <h4>${escapeHTML(s.name || 'Estudiante')}</h4>
            <p>${escapeHTML(saldoStatusText(s))}</p>
          </div>
          <button class="btn small ghost" type="button" data-inline-close>Cerrar</button>
        </div>
        <div class="inline-ficha-grid">
          <div><span>Dias sin venir</span><strong>${days >= 0 ? escapeHTML(`${days} dias`) : '-'}</strong></div>
          <div><span>Ultima clase</span><strong>${escapeHTML(lastClass?.fecha || lastClass?.fechaRaw || saldoLastClassDate(ctx, s) || '-')}</strong></div>
          <div><span>Programacion</span><strong>${escapeHTML(saldoProgramacionText(ctx, s))}</strong></div>
          <div><span>Saldo</span><strong>${escapeHTML(`${saldo > 0 ? '+' : ''}${fmtMoney(saldo)}`)}</strong></div>
          <div><span>Ultimo pago</span><strong>${escapeHTML(lastPayment?.fecha || lastPayment?.fechaRaw || '-')}</strong></div>
          <div><span>Clases / pagos</span><strong>${escapeHTML(`${totalClasses} / ${totalPayments}`)}</strong></div>
        </div>
        <div class="inline-ficha-recent">
          ${recentRows.length ? recentRows.map(row => `
            <div>
              <strong>${escapeHTML(row.fecha || row.fechaRaw || '-')}</strong>
              <span>${escapeHTML([row.tipo, row.servicio, row.profesor].filter(Boolean).join(' · ') || row.comentario || 'Registro')}</span>
            </div>
          `).join('') : '<div><span>Sin registros para mostrar.</span></div>'}
        </div>
      </div>
    `;
  }

  function toggleInlineFicha(ctx, btn, s) {
    const row = btn.closest('tr');
    if (!row) return;
    const next = row.nextElementSibling;
    if (next?.classList?.contains('inline-ficha-row')) {
      next.remove();
      btn.textContent = 'Abrir';
      return;
    }
    row.parentElement?.querySelectorAll('.inline-ficha-row').forEach(r => r.remove());
    row.parentElement?.querySelectorAll('[data-inline-open]').forEach(b => { b.textContent = 'Abrir'; });
    const detail = document.createElement('tr');
    detail.className = 'inline-ficha-row';
    detail.innerHTML = `<td colspan="7">${inlineFichaHTML(ctx, s)}</td>`;
    row.insertAdjacentElement('afterend', detail);
    btn.textContent = 'Cerrar';
    detail.querySelector('[data-inline-close]')?.addEventListener('click', () => {
      detail.remove();
      btn.textContent = 'Abrir';
    });
  }

  // =========================
  // Base de datos externa
  // =========================
  const BD_URL = 'https://musicala.github.io/basededatosmusicala/';
  let __bdData = null;      // null = no cargado, Array = cargado
  let __bdLoading = false;

  async function fetchBDData() {
    if (__bdData !== null) return __bdData;
    if (__bdLoading) {
      // espera a que termine la carga en curso
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (!__bdLoading) { clearInterval(check); resolve(__bdData || []); }
        }, 120);
      });
    }
    __bdLoading = true;
    try {
      // Intento 1: data.json
      let res = await fetch(BD_URL + 'data.json', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        __bdData = Array.isArray(json) ? json : (json.data || json.estudiantes || json.records || []);
        return __bdData;
      }
    } catch (_) {}
    try {
      // Intento 2: estudiantes.json
      const res = await fetch(BD_URL + 'estudiantes.json', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        __bdData = Array.isArray(json) ? json : [];
        return __bdData;
      }
    } catch (_) {}
    // No se pudo obtener datos estructurados → array vacío (se mostrará link directo)
    __bdData = [];
    return __bdData;
  }

  function findInBD(bdData, studentName) {
    if (!bdData || !bdData.length) return null;
    const target = norm(studentName);
    return bdData.find(r => {
      const n = norm(
        r.nombre || r.name || r.estudiante || r.Nombre || r.Estudiante || ''
      );
      return n === target || (n && target && (n.includes(target) || target.includes(n)));
    }) || null;
  }

  function getBDStatusFromRecord(r) {
    if (!r) return null;
    const keys = Object.keys(r);
    // Detectar campo de contacto
    const contactKey = keys.find(k => /contact|contacta|llam|whats/i.test(k));
    const stepKey    = keys.find(k => /paso|step|etapa|estado|estatus|fase/i.test(k));
    const noteKey    = keys.find(k => /nota|note|comment|observ/i.test(k));
    return {
      contacto: contactKey ? String(r[contactKey] || '—').trim() : '—',
      paso:     stepKey    ? String(r[stepKey]    || '—').trim() : '—',
      nota:     noteKey    ? String(r[noteKey]    || '').trim()  : ''
    };
  }

  function openBDModal(studentName) {
    const prev = document.getElementById('ripBDModal');
    if (prev) prev.remove();

    const url = `${BD_URL}?buscar=${encodeURIComponent(studentName)}&search=${encodeURIComponent(studentName)}`;

    const modal = document.createElement('div');
    modal.id = 'ripBDModal';
    modal.className = 'bd-iframe-modal';
    modal.innerHTML = `
      <div class="rip-modal-overlay"></div>
      <div class="bd-iframe-box">
        <div class="bd-iframe-head">
          <span class="bd-iframe-title">🗄️ Base de datos · ${escapeHTML(studentName)}</span>
          <button class="rip-modal-close" type="button">×</button>
        </div>
        <iframe class="bd-iframe-frame" src="${escapeHTML(url)}" sandbox="allow-scripts allow-same-origin allow-forms" loading="lazy"></iframe>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('.rip-modal-overlay')?.addEventListener('click', close);
    modal.querySelector('.rip-modal-close')?.addEventListener('click', close);
    document.body.appendChild(modal);
  }

  // =========================
  // Helpers: normalización de estados "Por revisar"
  // =========================

  /**
   * Dado un string de clasificación (paramClasif), devuelve el sub-estado
   * legible para mostrarlo como tarjeta separada.
   * Ajusta los prefijos según lo que uses en tu hoja de params.
   */
  function getPorRevisarSubLabel(paramClasif) {
    const c = String(paramClasif || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // "Activo no registro (8–15 días)" → "Sin registro (8-15 días)"
    if (c.includes('no registro') && (c.includes('8') || c.includes('15'))) {
      return 'Sin registro (8-15 días)';
    }
    // "Activo En pausa (15–30 días)" → "En pausa (15-30 días)"
    if (c.includes('pausa') && (c.includes('15') || c.includes('30'))) {
      return 'En pausa (15-30 días)';
    }
    // Cualquier otro "activo no registro"
    if (c.includes('no registro')) return 'Sin registro';
    // Cualquier otro "en pausa"
    if (c.includes('pausa')) return 'En pausa';

    // Fallback: devuelve el texto original limpio
    return String(paramClasif || 'Sin estado').trim();
  }

  /**
   * Tono CSS según sub-estado "Por revisar"
   */
  function getPorRevisarTone(label) {
    const l = label.toLowerCase();
    if (l.includes('pausa')) return 'warn-soft';   // amarillo suave
    if (l.includes('8-15') || l.includes('8–15'))  return 'info';    // azul
    if (l.includes('15-30') || l.includes('15–30')) return 'warn';   // ámbar
    return 'info';
  }

  function daysSinceValue(student) {
    const n = Number(student?.daysSinceLastClass);
    return Number.isFinite(n) ? n : -1;
  }

  function sortByReviewTime(items) {
    return [...(items || [])].sort((a, b) => {
      const da = daysSinceValue(a);
      const db = daysSinceValue(b);
      if (da !== db) return db - da;
      const ta = Number(a?.lastClassTs) || 0;
      const tb = Number(b?.lastClassTs) || 0;
      if (ta !== tb) return ta - tb;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'es');
    });
  }

  function sortByRecentAttendance(items) {
    return [...(items || [])].sort((a, b) => {
      const ai = norm(a?.finalClasif || a?.paramClasif || '').startsWith('inactivo') ? 1 : 0;
      const bi = norm(b?.finalClasif || b?.paramClasif || '').startsWith('inactivo') ? 1 : 0;
      if (ai !== bi) return ai - bi;
      const at = Number(a?.lastClassTs) || 0;
      const bt = Number(b?.lastClassTs) || 0;
      if (at !== bt) return bt - at;
      const da = daysSinceValue(a);
      const db = daysSinceValue(b);
      if (da !== db) return da - db;
      return String(a?.name || '').localeCompare(String(b?.name || ''), 'es');
    });
  }

  function saldoStatusText(s) {
    return s.finalClasif || s.paramClasif || s.statusText || 'Sin estado';
  }

  // Mantiene el color de los días alineado con el estado del estudiante.
  function saldoStatusTone(s) {
    const status = norm(saldoStatusText(s));
    if (status.includes('sin registro')) return 'info';
    if (status.includes('pausa') || status.includes('inactivo')) return 'warn';
    if (status.includes('activo')) return 'ok';
    return '';
  }

  function saldoLastClassDate(ctx, s) {
    const key = s.key || norm(s.name);
    const rows = (ctx?.state?.registro || []).filter(r => r.estudianteKey === key);
    rows.sort((a, b) => (Number(b.fechaTs) || 0) - (Number(a.fechaTs) || 0));
    const lastClass = rows.find(r => norm(r.tipo) === 'clase');
    if (lastClass?.fecha || lastClass?.fechaRaw || s.lastClassDate) {
      return lastClass?.fecha || lastClass?.fechaRaw || s.lastClassDate || '';
    }
    const ts = Number(s?.lastClassTs) || 0;
    if (!ts) return '';
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }

  function saldoProgramacionText(ctx, s) {
    const row = (ctx?.state?.prog?.data?.dashboard || []).find(p => norm(p.name) === norm(s.name));
    if (!row) return 'Sin programacion';
    if (row.noSchedule) return 'Sin programacion';
    return `${row.futureCount || 0} futuras${row.nextClassDate ? ' · prox. ' + row.nextClassDate : ''}`;
  }

  // =========================
  // Card HTML
  // =========================
  function cardHTML({ title, subtitle, value, tone, icon }) {
    return `
      <button class="pocket ${tone || ''}" type="button" data-title="${escapeHTML(title)}">
        <div class="pocket-top">
          <h3>${escapeHTML(title)}</h3>
          ${icon ? `<span class="pilltag ${tone || ''}">${escapeHTML(icon)}</span>` : ''}
        </div>
        <div class="big">${escapeHTML(value)}</div>
        ${subtitle ? `<div class="mini">${escapeHTML(subtitle)}</div>` : ''}
      </button>
    `;
  }

  // =========================
  // Render lista intermedia (SIN destruir la tabla)
  // bdEligible = true → muestra botón "Base de datos" para inactivos/pausa
  // =========================
  function getDuplicateReviewRowsForItems(ctx, items) {
    const wanted = new Set((items || []).map(s => s.key || norm(s.name)).filter(Boolean));
    const rows = window.RIPCalculations?.markDuplicateClasses
      ? window.RIPCalculations.markDuplicateClasses(ctx?.state?.registro || [])
      : (ctx?.state?.registro || []);
    return rows.filter(r => r?.duplicateReview && (
      wanted.has(r.groupKey || '') ||
      wanted.has(String(r.studentId || '').trim()) ||
      wanted.has(r.estudianteKey || norm(r.estudiante))
    ));
  }

  async function verifyAndDeleteDuplicateRows(ctx, title, items, onPickStudent, options) {
    const rows = getDuplicateReviewRowsForItems(ctx, items);
    const deletable = rows.filter(r => r.id);
    const missingId = rows.length - deletable.length;
    if (!rows.length) {
      window.RIPUI?.shared?.toast?.(ctx?.el?.toastWrap, 'No hay duplicadas por eliminar.', 'info');
      return;
    }
    if (!window.RIPRepository?.deleteRegistroRow) {
      window.RIPUI?.shared?.toast?.(ctx?.el?.toastWrap, 'No hay conexi�n de edici�n para eliminar registros.', 'warn');
      return;
    }
    const msg = `Se eliminaran ${deletable.length} clase(s) duplicada(s).${missingId ? ` ${missingId} no tienen ID y se dejan para revision manual.` : ''} �Continuar?`;
    if (!deletable.length || !confirm(msg)) return;
    window.RIPUI?.shared?.toast?.(ctx?.el?.toastWrap, 'Eliminando duplicadas...', 'info');
    let deleted = 0;
    for (const row of deletable) {
      await window.RIPRepository.deleteRegistroRow(row.id);
      deleted++;
    }
    const deletedIds = new Set(deletable.map(r => r.id));
    const remaining = (ctx?.state?.registro || []).filter(r => !deletedIds.has(r.id));
    if (ctx?.state) {
      ctx.state.registro = window.RIPCalculations?.markDuplicateClasses ? window.RIPCalculations.markDuplicateClasses(remaining) : remaining;
    }
    try { window.RIPCore?.clearCaches?.(); } catch (_) {}
    try { window.RIPApp?.clearAppCaches?.(); } catch (_) {}
    window.RIPUI?.table?.applyAndRender?.(ctx, ctx?.state || {});
    window.RIPUI?.shared?.toast?.(ctx?.el?.toastWrap, 'Duplicadas eliminadas: ' + deleted, 'ok');
    const refreshedItems = (items || []).map(s => {
      const count = getDuplicateReviewRowsForItems(ctx, [s]).length;
      return { ...s, duplicateCount: count };
    }).filter(s => (s.duplicateCount || 0) > 0);
    renderStudentList(ctx, title, refreshedItems, onPickStudent, options);
  }

  function renderStudentList(ctx, title, items, onPickStudent, options = {}) {
    const { bdEligible = false } = options || {};
    const isDuplicateList = norm(title).includes('clases duplicadas');
    const { el } = ctx;
    if (!el.fichaView || !el.tableBody) return;

    el.fichaView.style.display = '';
    if (el.dashboardClasView)  el.dashboardClasView.style.display  = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.btnBackToDash) el.btnBackToDash.style.display = '';

    if (el.fichaTitle) el.fichaTitle.textContent = title;
    if (el.fichaStudent)   el.fichaStudent.textContent  = '—';
    if (el.fichaFecha)     el.fichaFecha.textContent     = '—';
    if (el.fichaUltPago)   el.fichaUltPago.textContent   = '—';
    if (el.fichaProxPago)  el.fichaProxPago.textContent  = '—';
    if (el.fichaSaldosMini) el.fichaSaldosMini.innerHTML = '';

    if (el.btnPDF)       el.btnPDF.style.display       = 'none';
    if (el.btnVolverDash) el.btnVolverDash.style.display = 'none';

    // Sub-texto: con o sin botón BD
    if (el.fichaSub) {
      if (bdEligible) {
        el.fichaSub.innerHTML =
          `Selecciona un estudiante para abrir su ficha &nbsp;·&nbsp; ` +
          `<button type="button" id="btnCargarBD" class="btn small ghost" style="vertical-align:middle;">` +
          `🗄️ Cargar base de datos</button>`;
      } else if (isDuplicateList) {
        el.fichaSub.innerHTML = 'Revisa los estudiantes y elimina solo las filas marcadas como duplicadas &nbsp;�&nbsp; <button type="button" id="btnDeleteDuplicateClasses" class="btn small danger" style="vertical-align:middle;">Verificar y eliminar duplicadas</button>';
      } else {
        el.fichaSub.textContent = 'Selecciona un estudiante para abrir su ficha';
      }
    }

    const isSaldoList = isDuplicateList || (items || []).some(s => typeof s.saldo === 'number');
    const isSeAcaboList = norm(title).includes('se acabo');
    const tableHead = el.tablaContainer?.querySelector('thead');

    if (bdEligible) {
      if (tableHead && !__registroTableHeadHTML) __registroTableHeadHTML = tableHead.innerHTML;
      if (tableHead) {
        tableHead.innerHTML = `
          <tr>
            <th>Estado</th>
            <th>Estudiante</th>
            <th>Dias sin venir</th>
            <th>Ultima clase</th>
            <th>Programacion</th>
            <th>BD</th>
            <th></th>
          </tr>
        `;
      }
      el.tableBody.innerHTML = sortByRecentAttendance(items).map((s) => {
        const days = daysSinceValue(s);
        return `
          <tr>
            <td><span class="pill soft">${escapeHTML(saldoStatusText(s))}</span></td>
            <td style="font-weight:800">${escapeHTML(s.name)}</td>
            <td style="font-weight:800">${days >= 0 ? escapeHTML(`${days} dias`) : '—'}</td>
            <td>${escapeHTML(saldoLastClassDate(ctx, s) || '—')}</td>
            <td>${escapeHTML(saldoProgramacionText(ctx, s))}</td>
            <td><span class="bd-badge" data-bd-name="${escapeHTML(s.name)}">BD</span></td>
            <td><button class="btn small primary" type="button" data-inline-open data-skey="${escapeHTML(s.key || '')}" data-sname="${escapeHTML(s.name || '')}">Abrir</button></td>
          </tr>
        `;
      }).join('') || `<tr><td colspan="7" class="empty-td">No hay estudiantes en este grupo.</td></tr>`;
      const reviewByKey = new Map(sortByRecentAttendance(items).map(s => [s.key || norm(s.name), s]));
      el.tableBody.querySelectorAll('[data-inline-open]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const skey = btn.getAttribute('data-skey') || '';
          const sname = btn.getAttribute('data-sname') || '';
          const item = reviewByKey.get(skey || norm(sname)) || { key: skey || norm(sname), name: sname };
          toggleInlineFicha(ctx, btn, item);
        });
      });
      wireBDLookup(el);
      el.fichaSub?.querySelector('#btnDeleteDuplicateClasses')?.addEventListener('click', () => verifyAndDeleteDuplicateRows(ctx, title, items, onPickStudent, options));
      return;
    }

    if (isSaldoList) {
      if (tableHead && !__registroTableHeadHTML) __registroTableHeadHTML = tableHead.innerHTML;
      if (tableHead) {
        tableHead.innerHTML = `
          <tr>
            <th>Estado</th>
            <th>Estudiante</th>
            <th>${isSeAcaboList ? 'Días sin clase' : 'Saldo pendiente'}</th>
            ${isDuplicateList ? '<th>Duplicadas</th>' : ''}
            <th>Ultima clase</th>
            <th>Programacion</th>
            <th></th>
          </tr>
        `;
      }
      el.tableBody.innerHTML = (items || []).map((s) => `
        <tr>
          <td>${isSeAcaboList
            ? `<span class="pilltag ${saldoStatusTone(s)}">${escapeHTML(saldoStatusText(s))}</span>`
            : `<span class="pill soft">${escapeHTML(saldoStatusText(s))}</span>`}</td>
          <td style="font-weight:800">${escapeHTML(s.name)}</td>
          <td style="font-weight:800">${isSeAcaboList
            ? (() => { const days = daysSinceValue(s); return days >= 0 ? `<span class="pilltag ${saldoStatusTone(s)}">${escapeHTML(`${days} días`)}</span>` : '—'; })()
            : escapeHTML(`${s.saldo > 0 ? '+' : ''}${fmtMoney(s.saldo)}`)}</td>
          ${isDuplicateList ? `<td><span class="tag duplicate">${Number(s.duplicateCount) || 0}</span></td>` : ''}
          <td>${escapeHTML(saldoLastClassDate(ctx, s) || '—')}</td>
          <td>${escapeHTML(saldoProgramacionText(ctx, s))}</td>
          <td><button class="btn small primary" type="button" data-skey="${escapeHTML(s.key || '')}" data-sname="${escapeHTML(s.name || '')}">Abrir</button></td>
        </tr>
      `).join('') || `<tr><td colspan="${isDuplicateList ? 7 : 6}" class="empty-td">No hay estudiantes en este grupo.</td></tr>`;
      el.tableBody.querySelectorAll('[data-skey]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const skey = btn.getAttribute('data-skey') || '';
          const sname = btn.getAttribute('data-sname') || '';
          onPickStudent(skey, sname);
        });
      });
      el.fichaSub?.querySelector('#btnDeleteDuplicateClasses')?.addEventListener('click', () => verifyAndDeleteDuplicateRows(ctx, title, items, onPickStudent, options));
      return;
    }

    if (tableHead && __registroTableHeadHTML) tableHead.innerHTML = __registroTableHeadHTML;

    // Renderizar filas (con data-name para BD)
    const rowsHTML = (items || [])
      .map((s) => {
        const days = daysSinceValue(s);
        const badge =
          typeof s.saldo === 'number'
            ? `${s.saldo > 0 ? '+' : ''}${fmtMoney(s.saldo)}`
            : days >= 0
              ? `${days} dias · ${s.finalClasif || s.paramClasif || ''}`
              : (s.finalClasif || s.paramClasif || '');

        return `
          <tr>
            <td colspan="12" style="padding:0; border-bottom: 1px solid rgba(15,23,42,.08);">
              <button type="button"
                class="student-row"
                data-skey="${escapeHTML(s.key)}"
                data-sname="${escapeHTML(s.name)}"
                style="
                  width:100%; display:flex; align-items:center;
                  justify-content:space-between; gap:12px;
                  padding:12px 14px; border:0; background:transparent;
                  cursor:pointer; font-weight:800;
                ">
                <span>${escapeHTML(s.name)}</span>
                <div style="display:flex;align-items:center;gap:8px;">
                  ${bdEligible ? `<span class="bd-badge" data-bd-name="${escapeHTML(s.name)}">BD</span>` : ''}
                  <span class="pill soft">${escapeHTML(badge)}</span>
                </div>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML =
      rowsHTML || `<tr><td colspan="12" class="empty-td">No hay estudiantes en este grupo.</td></tr>`;

    // Listener: abrir ficha
    el.fichaView.querySelectorAll('.student-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skey = btn.getAttribute('data-skey') || '';
        if (skey) onPickStudent(skey);
      });
    });

    // Listener: cargar BD
    if (bdEligible) {
      wireBDLookup(el);
    }
  }

  function wireBDLookup(el) {
      const btnBD = document.getElementById('btnCargarBD');
      if (btnBD) {
        btnBD.addEventListener('click', async () => {
          btnBD.disabled = true;
          btnBD.textContent = '⏳ Cargando BD…';
          const data = await fetchBDData();
          btnBD.textContent = data.length
            ? `🗄️ BD cargada (${data.length} registros)`
            : '🗄️ BD (sin datos estructurados — click por estudiante)';
          btnBD.disabled = false;

          // Actualizar badges
          el.fichaView.querySelectorAll('.bd-badge[data-bd-name]').forEach((badge) => {
            const name = badge.getAttribute('data-bd-name') || '';
            if (!name) return;

            if (!data.length) {
              // Sin datos: muestra botón para abrir en ventana
              badge.textContent = '🔗 Ver';
              badge.classList.add('bd-info');
              badge.style.cursor = 'pointer';
              badge.title = 'Abrir en base de datos';
              badge.addEventListener('click', (e) => {
                e.stopPropagation();
                openBDModal(name);
              }, { once: true });
              return;
            }

            const rec = findInBD(data, name);
            if (!rec) {
              badge.textContent = '—';
              badge.title = 'No encontrado en BD';
              return;
            }

            const status = getBDStatusFromRecord(rec);
            badge.textContent = status.paso !== '—' ? `Paso: ${status.paso}` : '✓ En BD';
            badge.title = `Contacto: ${status.contacto} | Paso: ${status.paso}${status.nota ? ' | ' + status.nota : ''}`;
            badge.classList.add(
              status.contacto && status.contacto !== '—' && status.contacto !== 'No' ? 'bd-ok' : 'bd-warn'
            );
            // Click: abrir modal con iframe como detalle
            badge.style.cursor = 'pointer';
            badge.addEventListener('click', (e) => {
              e.stopPropagation();
              openBDModal(name);
            }, { once: true });
          });
        });
      }
  }

  // =========================
  // Render dashboard clasificación
  // CON "Por revisar" dividido en sub-tarjetas por estado
  // =========================
  function renderDashClas(ctx, students, onOpenList) {
    const { el } = ctx;
    if (!el.dashGridClas) return;

    const groups = RIPCore.buildClasificacionDashboard(students);
    groups.porRevisar = sortByReviewTime(groups.porRevisar);

    // ── Sub-grupos para "Por revisar" ──────────────────────────────────────────
    // Agrupa por sub-estado para tarjetas individuales
    const subGroups = new Map(); // label -> [students]
    for (const s of groups.porRevisar) {
      const label = getPorRevisarSubLabel(s.finalClasif || s.paramClasif);
      if (!subGroups.has(label)) subGroups.set(label, []);
      subGroups.get(label).push(s);
    }
    subGroups.forEach((items, label) => subGroups.set(label, sortByReviewTime(items)));

    // Ordenar: primero el grupo mas urgente por tiempo, luego cantidad
    const subGroupsSorted = Array.from(subGroups.entries())
      .sort((a, b) => {
        const maxA = daysSinceValue(a[1][0]);
        const maxB = daysSinceValue(b[1][0]);
        if (maxA !== maxB) return maxB - maxA;
        return b[1].length - a[1].length;
      });

    // ── HTML de tarjetas ───────────────────────────────────────────────────────
    let html = '';

    // Activos netos
    html += cardHTML({
      title: 'Activos netos',
      subtitle: '"Activo" confirmado',
      value: `${groups.activosNetos.length}`,
      tone: 'ok',
      icon: '🟦'
    });

    // Por revisar: total (colapsado) + sub-tarjetas
    if (subGroupsSorted.length === 0) {
      html += cardHTML({
        title: 'Por revisar',
        subtitle: 'pausa / sin registro',
        value: '0',
        tone: 'info',
        icon: '🟨'
      });
    } else if (subGroupsSorted.length === 1) {
      // Un solo sub-estado: una sola tarjeta con etiqueta exacta
      const [label, items] = subGroupsSorted[0];
      html += cardHTML({
        title: label,
        subtitle: 'Por revisar',
        value: `${items.length}`,
        tone: getPorRevisarTone(label),
        icon: '🟨'
      });
    } else {
      // Múltiples sub-estados: tarjeta resumen + tarjeta por sub-estado
      html += cardHTML({
        title: 'Por revisar (total)',
        subtitle: `${subGroupsSorted.length} sub-estados`,
        value: `${groups.porRevisar.length}`,
        tone: 'info',
        icon: '🟨'
      });

      for (const [label, items] of subGroupsSorted) {
        html += cardHTML({
          title: label,
          subtitle: 'Por revisar',
          value: `${items.length}`,
          tone: getPorRevisarTone(label),
          icon: '↳'
        });
      }
    }

    // Inactivos
    html += cardHTML({
      title: 'Inactivos',
      subtitle: 'inactivo / ex-estudiante',
      value: `${groups.inactivos.length}`,
      tone: '',
      icon: '⬛'
    });

    el.dashGridClas.innerHTML = html;

    // ── Listeners ────────────────────────────────────────────────────────────
    el.dashGridClas.querySelectorAll('.pocket').forEach((c) => {
      c.addEventListener('click', () => {
        const t = c.getAttribute('data-title') || '';

        if (t === 'Activos netos') {
          onOpenList('Activos netos', groups.activosNetos, { bdEligible: false });
          return;
        }
        if (t === 'Por revisar (total)') {
          onOpenList('Por revisar (todos por tiempo)', groups.porRevisar, { bdEligible: true });
          return;
        }
        if (t === 'Inactivos') {
          onOpenList('Inactivos', groups.inactivos, { bdEligible: true });
          return;
        }

        // Sub-estados de "Por revisar"
        const subItems = subGroups.get(t);
        if (subItems) {
          const isEnPausa = t.toLowerCase().includes('pausa') || t.toLowerCase().includes('registro');
          onOpenList(`Por revisar · ${t}`, subItems, { bdEligible: isEnPausa });
          return;
        }
      });
    });
  }

  // =========================
  // Render dashboard saldos + KPIs
  // =========================
  function renderDashSaldo(ctx, students, registro, onOpenList) {
    const { el } = ctx;
    if (!el.dashGridSaldo) return;

    const cats = RIPCore.buildSaldosDashboard(students, registro);

    el.dashGridSaldo.innerHTML =
      cardHTML({
        title: 'Deben',
        subtitle: 'SUM(Movimiento) < 0',
        value: `${cats.deben.length}`,
        tone: 'warn',
        icon: '🔻'
      }) +
      cardHTML({
        title: 'Se acabó',
        subtitle: 'SUM(Movimiento) = 0',
        value: `${cats.seAcabo.length}`,
        tone: '',
        icon: '⏹️'
      }) +
      cardHTML({
        title: 'Les debemos / Clases activas',
        subtitle: 'SUM(Movimiento) > 0',
        value: `${cats.lesDebemos.length}`,
        tone: 'ok',
        icon: '🔺'
      }) +
      cardHTML({
        title: 'Clases duplicadas',
        subtitle: 'No afectan saldo, revisar registro',
        value: `${cats.duplicadas?.length || 0}`,
        tone: 'warn',
        icon: '!'
      });

    if (el.dashKpisSaldo) {
      const sumMap = RIPCore.sumMovimientoByStudent(registro);
      let total = 0;
      for (const v of sumMap.values()) total += v;
      const withNonZero = Array.from(sumMap.values()).filter((v) => v !== 0).length;

      el.dashKpisSaldo.innerHTML = `
        <div class="kpi-card">
          <div class="k">Saldo global</div>
          <div class="v">${total > 0 ? '+' : ''}${fmtMoney(total)}</div>
        </div>
        <div class="kpi-card">
          <div class="k">Estudiantes con saldo ≠ 0</div>
          <div class="v">${withNonZero}</div>
        </div>
      `;
    }

    el.dashGridSaldo.querySelectorAll('.pocket').forEach((c) => {
      c.addEventListener('click', () => {
        const t = c.getAttribute('data-title') || '';
        if (t.startsWith('Deben')) onOpenList('Deben (saldo < 0)', cats.deben, { bdEligible: false });
        else if (t.startsWith('Se acabó')) onOpenList('Se acabó (saldo = 0)', cats.seAcabo, { bdEligible: false });
        else if (t.startsWith('Clases duplicadas')) onOpenList('Clases duplicadas por revisar', cats.duplicadas || [], { bdEligible: false });
        else onOpenList('Les debemos / Clases activas (saldo > 0)', cats.lesDebemos, { bdEligible: false });
      });
    });
  }

  function restoreRegistroTableHead(ctx) {
    const tableHead = ctx?.el?.tablaContainer?.querySelector('thead');
    if (tableHead && __registroTableHeadHTML) tableHead.innerHTML = __registroTableHeadHTML;
  }

  // =========================
  // Exports
  // =========================
  RIPUI.dashboard = {
    renderDashClas,
    renderDashSaldo,
    renderStudentList,
    toggleInlineFicha,
    restoreRegistroTableHead
  };
})();

