/* =========================================================
   RIP 2026 · app.js (UI + Bootstrap)
   - Controla el estado global
   - Maneja eventos
   - Llama funciones del core
========================================================= */

'use strict';

/* =========================
   CONFIG URLs (PEGAR LAS TUYAS)
========================= */

const TSV_REGISTRO_URL = 'PEGAR_TSV_REGISTRO_COLUMNA_C';
const TSV_PARAMS_URL   = 'PEGAR_TSV_PARAMETROS';

/* =========================
   ESTADO GLOBAL
========================= */

const state = {
  registro: [],
  paramsMap: new Map(),

  allStudents: [],
  filteredRows: [],

  currentStudent: null,

  filters: {
    student: '',
    servicios: new Set(),
    profesor: '',
    tipo: '',
    desde: '',
    hasta: ''
  }
};

/* =========================
   DOM REFERENCES
========================= */

const dom = {
  btnRefresh: document.getElementById('btnRefresh'),
  badgeCount: document.getElementById('badgeCount'),
  toastWrap: document.getElementById('toastWrap'),

  dashGridClas: document.getElementById('dashGridClas'),
  dashGridSaldo: document.getElementById('dashGridSaldo'),
  dashKpisSaldo: document.getElementById('dashKpisSaldo'),

  fichaView: document.getElementById('fichaView'),
  fichaSaldosMini: document.getElementById('fichaSaldosMini'),

  tableBody: document.getElementById('tableBody'),

  fStudent: document.getElementById('fStudent'),
  fProfesor: document.getElementById('fProfesor'),
  fTipo: document.getElementById('fTipo'),
  fDesde: document.getElementById('fDesde'),
  fHasta: document.getElementById('fHasta'),

  btnApply: document.getElementById('btnApply'),
  btnReset: document.getElementById('btnReset'),

  dashboardClasView: document.getElementById('dashboardClasView'),
  dashboardSaldoView: document.getElementById('dashboardSaldoView'),

  tabClas: document.getElementById('tabClas'),
  tabSaldos: document.getElementById('tabSaldos'),

  btnVolverDash: document.getElementById('btnVolverDash'),
};

/* =========================
   INIT
========================= */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  toast("Cargando RIP 2026…", "info");

  await ripLoadAll(state, TSV_REGISTRO_URL, TSV_PARAMS_URL);

  ripBuildDashboards(state, dom);
  ripPopulateFilters(state, dom);

  dom.btnRefresh.addEventListener('click', async () => {
    toast("Actualizando datos…", "info");
    await ripLoadAll(state, TSV_REGISTRO_URL, TSV_PARAMS_URL);
    ripBuildDashboards(state, dom);
  });

  dom.btnApply.addEventListener('click', () => {
    ripApplyFilters(state, dom);
  });

  dom.btnReset.addEventListener('click', () => {
    ripResetFilters(state, dom);
  });

  dom.tabClas.addEventListener('click', () => {
    ripShowDashboard("clas", dom);
  });

  dom.tabSaldos.addEventListener('click', () => {
    ripShowDashboard("saldo", dom);
  });

  dom.btnVolverDash.addEventListener('click', () => {
    ripBackToDash(dom);
  });

  toast(`Listo. ${state.registro.length} registros · ${state.allStudents.length} estudiantes`, "ok");
}

/* =========================
   TOAST SIMPLE
========================= */

function toast(msg, type="ok") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  dom.toastWrap.appendChild(el);

  setTimeout(() => el.remove(), 3200);
}
