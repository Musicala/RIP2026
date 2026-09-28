'use strict';

const assert = require('node:assert/strict');

global.window = {};
require('../rip.calculations.js');
require('../rip.core.js');

const calc = window.RIPCalculations;
const core = window.RIPCore;
const name = 'Santiago Gómez Iregui';
const nameKey = 'santiago gomez iregui';
const cluster = `cluster:${nameKey}`;

const registro = [
  { id: 'old', estudiante: name, estudianteKey: nameKey, studentId: nameKey, tipo: 'Clase', fecha: '2026-09-17', fechaTs: Date.parse('2026-09-17'), movimiento: -1 },
  { id: 'new', estudiante: name, estudianteKey: nameKey, studentId: nameKey, identityClusterKey: cluster, tipo: 'Pago', fecha: '2026-09-18', fechaTs: Date.parse('2026-09-18'), movimiento: 4 }
];
const students = [{ id: nameKey, name, nameKey, studentId: nameKey, officialStudentId: nameKey, identityClusterKey: cluster, identityStatus: 'provisional' }];
window.RIPRepository = {
  loadRegistro: async () => registro,
  loadStudents: async () => students,
  loadProgramacion: async () => [],
  loadComputed: async () => []
};

(async () => {
  const pack = await core.loadAll();
  assert.deepEqual(pack.allStudents.map(s => s.key), [cluster]);
  assert.deepEqual(pack.registro.map(r => r.groupKey), [cluster, cluster]);
  const card = core.buildSaldosDashboard(pack.allStudents, pack.registro).lesDebemos[0];
  const detail = core.getStudentFicha(pack.registro, cluster);
  assert.equal(card.saldo, 3);
  assert.equal(detail.saldo, card.saldo);
  assert.equal(detail.rows.length, 2);

  // La ficha de una persona con ID realmente distinto no puede absorber
  // filas solo porque el nombre visible sea igual.
  const different = { ...registro[0], id: 'homonym', groupKey: 'another-canonical-id', studentId: 'another-canonical-id' };
  assert.equal(core.getStudentFicha([...pack.registro, different], cluster).rows.length, 2);
  assert.equal(calc.getStudentGroupingKey(different), 'another-canonical-id');
  console.log('OK: grupo provisional único, saldo coherente y homónimos separados');
})().catch(error => { console.error(error); process.exitCode = 1; });
