/* global window */
(function () {
  'use strict';
  const programacion = window.RIPProgramacion;
  if (!programacion?.loadResumen) return;
  const norm = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
  const original = programacion.loadResumen;
  function isActiveOrPaused(name) {
    const state = window.RIPApp?.state;
    const key = norm(name);
    const student = (state?.allStudents || []).find(item => norm(item?.key || item?.name) === key || norm(item?.name) === key);
    if (norm(student?.finalClasif || student?.paramClasif).startsWith('activo')) return true;
    const lastClass = (state?.registro || []).filter(row => norm(row?.estudianteKey || row?.estudiante) === key && norm(row?.tipo) === 'clase').reduce((latest, row) => Math.max(latest, Number(row?.fechaTs) || 0), 0);
    if (!lastClass) return false;
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return Math.floor((today - lastClass) / 86400000) <= 30;
  }
  programacion.loadResumen = async function (...args) {
    const data = await original.apply(this, args);
    if (Array.isArray(data?.dashboard)) data.dashboard = data.dashboard.filter(row => !row.noSchedule || isActiveOrPaused(row.name));
    return data;
  };
})();
