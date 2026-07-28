'use strict';

/*
  Regresiones de consistencia entre Revisar Hoy y la ficha completa.
  Ejecutar: node tests/rip.ficha-consistency.test.js
*/

const assert = require('node:assert');

global.window = {};
require('../rip.calculations.js');
require('../rip.core.js');

const calc = global.window.RIPCalculations;
const core = global.window.RIPCore;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const ABBIE_CANONICAL = 'f_alarcon_p@hotmail.com';
const ABBIE_LEGACY = 'abbie helena reyes quiroga';

test('alias legado explícito reúne todos los movimientos en la ficha canónica', () => {
  core.setIdentityDirectory([
    {
      id: ABBIE_LEGACY,
      studentId: ABBIE_LEGACY,
      officialStudentId: ABBIE_LEGACY,
      legacyAliasOf: ABBIE_CANONICAL,
      nameKey: ABBIE_LEGACY,
      name: 'Abbie Helena Reyes Quiroga'
    },
    {
      id: ABBIE_CANONICAL,
      studentId: ABBIE_CANONICAL,
      officialStudentId: ABBIE_CANONICAL,
      nameKey: ABBIE_LEGACY,
      name: 'Abbie Helena Reyes Quiroga'
    }
  ]);

  const records = [
    { estudiante: 'Abbie Helena Reyes Quiroga', estudianteKey: ABBIE_LEGACY, tipo: 'Clase', fechaTs: 1, movimiento: -1 },
    { estudiante: 'Abbie Helena Reyes Quiroga', estudianteKey: ABBIE_LEGACY, studentId: ABBIE_LEGACY, tipo: 'Pago', fechaTs: 2, movimiento: 8 },
    { estudiante: 'Abbie Helena Reyes Quiroga', estudianteKey: ABBIE_LEGACY, studentId: ABBIE_CANONICAL, tipo: 'Clase', fechaTs: 3, movimiento: -1 }
  ];

  const byCanonical = core.getStudentFicha(records, ABBIE_CANONICAL);
  const byLegacy = core.getStudentFicha(records, ABBIE_LEGACY);

  assert.strictEqual(byCanonical.rows.length, 3);
  assert.strictEqual(byLegacy.rows.length, 3);
  assert.strictEqual(byCanonical.saldo, 6);
  assert.strictEqual(byLegacy.saldo, 6);
});

test('dos homónimos con IDs distintos no se fusionan por nombre', () => {
  const idA = 'student-a';
  const idB = 'student-b';
  core.setIdentityDirectory([
    { id: idA, studentId: idA, officialStudentId: idA, nameKey: 'juan gomez', name: 'Juan Gómez' },
    { id: idB, studentId: idB, officialStudentId: idB, nameKey: 'juan gomez', name: 'Juan Gómez' }
  ]);

  const records = [
    { studentId: idA, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez', tipo: 'Clase', fechaTs: 1 },
    { studentId: idB, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez', tipo: 'Clase', fechaTs: 2 },
    { estudianteKey: 'juan gomez', estudiante: 'Juan Gómez', tipo: 'Clase', fechaTs: 3 }
  ];

  assert.strictEqual(core.getStudentFicha(records, idA).rows.length, 1);
  assert.strictEqual(core.getStudentFicha(records, idB).rows.length, 1);
});

test('24 días sin clase usa el estado central Activo En pausa', () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const lastClass = today.getTime() - (24 * 86400000);
  const status = calc.calculateStudentStatus([{ tipo: 'Clase', fechaTs: lastClass }]);
  assert.strictEqual(status, 'Activo En pausa (15-30 dias)');
});

test('próxima clase solo puede salir de una fecha presente o futura', () => {
  const status = calc.calculateProgramacionStatus(
    ['2026-06-16', '2026-06-26', '2026-07-30'],
    '2026-07-28',
    8
  );
  assert.strictEqual(status.futureCount, 1);
  assert.strictEqual(status.nextClassDate, '2026-07-30');

  const onlyPast = calc.calculateProgramacionStatus(
    ['2026-06-16', '2026-06-26'],
    '2026-07-28',
    8
  );
  assert.strictEqual(onlyPast.futureCount, 0);
  assert.strictEqual(onlyPast.nextClassDate, '');
});

console.log(`\n${passed} pruebas OK (rip.ficha-consistency)`);
