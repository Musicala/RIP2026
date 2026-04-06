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

  const { escapeHTML, fmtMoney } = window.RIPUI.shared;
  const RIPUI = (window.RIPUI = window.RIPUI || {});

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
  // =========================
  function renderStudentList(ctx, title, items, onPickStudent) {
    const { el } = ctx;
    if (!el.fichaView || !el.tableBody) return;

    el.fichaView.style.display = '';
    if (el.dashboardClasView)  el.dashboardClasView.style.display  = 'none';
    if (el.dashboardSaldoView) el.dashboardSaldoView.style.display = 'none';
    if (el.btnBackToDash) el.btnBackToDash.style.display = '';

    if (el.fichaTitle) el.fichaTitle.textContent = title;
    if (el.fichaSub)   el.fichaSub.textContent   = 'Selecciona un estudiante para abrir su ficha';

    if (el.fichaStudent)   el.fichaStudent.textContent  = '—';
    if (el.fichaFecha)     el.fichaFecha.textContent     = '—';
    if (el.fichaUltPago)   el.fichaUltPago.textContent   = '—';
    if (el.fichaProxPago)  el.fichaProxPago.textContent  = '—';
    if (el.fichaSaldosMini) el.fichaSaldosMini.innerHTML = '';

    if (el.btnPDF)       el.btnPDF.style.display       = 'none';
    if (el.btnVolverDash) el.btnVolverDash.style.display = 'none';

    const rowsHTML = (items || [])
      .map((s) => {
        const badge =
          typeof s.saldo === 'number'
            ? `${s.saldo > 0 ? '+' : ''}${fmtMoney(s.saldo)}`
            : (s.paramClasif || '');

        return `
          <tr>
            <td colspan="12" style="padding:0; border-bottom: 1px solid rgba(15,23,42,.08);">
              <button type="button"
                class="student-row"
                data-skey="${escapeHTML(s.key)}"
                style="
                  width:100%; display:flex; align-items:center;
                  justify-content:space-between; gap:12px;
                  padding:12px 14px; border:0; background:transparent;
                  cursor:pointer; font-weight:800;
                ">
                <span>${escapeHTML(s.name)}</span>
                <span class="pill soft">${escapeHTML(badge)}</span>
              </button>
            </td>
          </tr>
        `;
      })
      .join('');

    el.tableBody.innerHTML =
      rowsHTML || `<tr><td colspan="12" class="empty-td">No hay estudiantes en este grupo.</td></tr>`;

    el.fichaView.querySelectorAll('.student-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        const skey = btn.getAttribute('data-skey') || '';
        if (skey) onPickStudent(skey);
      });
    });
  }

  // =========================
  // Render dashboard clasificación
  // CON "Por revisar" dividido en sub-tarjetas por estado
  // =========================
  function renderDashClas(ctx, students, onOpenList) {
    const { el } = ctx;
    if (!el.dashGridClas) return;

    const groups = RIPCore.buildClasificacionDashboard(students);

    // ── Sub-grupos para "Por revisar" ──────────────────────────────────────────
    // Agrupa por sub-estado para tarjetas individuales
    const subGroups = new Map(); // label -> [students]
    for (const s of groups.porRevisar) {
      const label = getPorRevisarSubLabel(s.paramClasif);
      if (!subGroups.has(label)) subGroups.set(label, []);
      subGroups.get(label).push(s);
    }

    // Ordenar: primero los de mayor cantidad
    const subGroupsSorted = Array.from(subGroups.entries())
      .sort((a, b) => b[1].length - a[1].length);

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
          onOpenList('Activos netos', groups.activosNetos);
          return;
        }
        if (t === 'Por revisar (total)') {
          onOpenList('Por revisar (todos)', groups.porRevisar);
          return;
        }
        if (t === 'Inactivos') {
          onOpenList('Inactivos', groups.inactivos);
          return;
        }

        // Sub-estados de "Por revisar"
        const subItems = subGroups.get(t);
        if (subItems) {
          onOpenList(`Por revisar · ${t}`, subItems);
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
        if (t.startsWith('Deben')) onOpenList('Deben (saldo < 0)', cats.deben);
        else if (t.startsWith('Se acabó')) onOpenList('Se acabó (saldo = 0)', cats.seAcabo);
        else onOpenList('Les debemos / Clases activas (saldo > 0)', cats.lesDebemos);
      });
    });
  }

  // =========================
  // Exports
  // =========================
  RIPUI.dashboard = {
    renderDashClas,
    renderDashSaldo,
    renderStudentList
  };
})();
