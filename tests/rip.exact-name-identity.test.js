'use strict';

const assert = require('node:assert/strict');

global.window = {};
require('../rip.calculations.js');
require('../rip.core.js');

const core = window.RIPCore;
const canonical = 'MariaCanonicalId001';
const legacy = 'legacy-maria-id';
const name = 'Maria jose bernal rodriguez';
const nameKey = 'maria jose bernal rodriguez';

window.RIPRepository = {
  loadRegistro: async () => [
    { id: 'old', estudiante: name, estudianteKey: nameKey, studentId: legacy, tipo: 'Clase', fecha: '2026-09-01', fechaTs: Date.parse('2026-09-01'), movimiento: -1 },
    { id: 'new', estudiante: name, estudianteKey: nameKey, studentId: canonical, tipo: 'Pago', fecha: '2026-09-02', fechaTs: Date.parse('2026-09-02'), movimiento: 4 }
  ],
  loadStudents: async () => [{ id: canonical, name, nameKey, studentId: canonical, officialStudentId: canonical }],
  loadProgramacion: async () => [],
  loadComputed: async () => []
};

(async () => {
  const pack = await core.loadAll({ force: true });
  assert.deepEqual(pack.registro.map(row => row.groupKey), [canonical, canonical]);
  assert.equal(core.getStudentFicha(pack.registro, canonical).rows.length, 2);
  assert.deepEqual(pack.allStudents.map(student => student.key), [canonical]);
  console.log('OK: ID legado se une al único perfil canónico con nombre exacto');
})().catch(error => { console.error(error); process.exitCode = 1; });
