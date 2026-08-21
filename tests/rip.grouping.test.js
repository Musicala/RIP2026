'use strict';

/*
  Pruebas de getStudentGroupingKey / matchesStudentKey (rip.calculations.js).
  Ejecutar: node tests/rip.grouping.test.js
*/

const assert = require('node:assert');

// rip.calculations.js es un IIFE de navegador: se le da un window simulado.
global.window = {};
require('../rip.calculations.js');
const calc = global.window.RIPCalculations;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const CANONICAL_A = 'aB3xK9mP2vR7sT4wX8Zz';
const CANONICAL_B = 'Kp3sD8fG1hJ6kL9mN2Qr';

test('studentId manda sobre estudianteKey', () => {
  const key = calc.getStudentGroupingKey({ studentId: CANONICAL_A, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez' });
  assert.strictEqual(key, CANONICAL_A);
});

test('groupKey pre-anotado manda sobre todo', () => {
  const key = calc.getStudentGroupingKey({ groupKey: CANONICAL_A, studentId: CANONICAL_B, estudianteKey: 'x' });
  assert.strictEqual(key, CANONICAL_A);
});

test('sin studentId usa aliasMap (nameKey → canónico)', () => {
  const aliasMap = new Map([['juan gomez', CANONICAL_A]]);
  const key = calc.getStudentGroupingKey({ estudianteKey: 'juan gomez', estudiante: 'Juan Gómez' }, aliasMap);
  assert.strictEqual(key, CANONICAL_A);
});

test('programación legada con studentId=nameKey usa el alias canónico', () => {
  const aliasMap = new Map([['juan gomez', CANONICAL_A]]);
  const key = calc.getStudentGroupingKey({ studentId: 'juan gomez', estudianteKey: 'juan gomez' }, aliasMap);
  assert.strictEqual(key, CANONICAL_A);
});

test('fallback histórico: estudianteKey / nombre normalizado', () => {
  assert.strictEqual(calc.getStudentGroupingKey({ estudianteKey: 'ana perez' }), 'ana perez');
  assert.strictEqual(calc.getStudentGroupingKey({ estudiante: 'Ana Pérez' }), 'ana perez');
});

test('HOMÓNIMOS: filas con studentId distinto agrupan separadas aunque el nombre coincida', () => {
  const rowA = { studentId: CANONICAL_A, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez' };
  const rowB = { studentId: CANONICAL_B, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez' };
  assert.notStrictEqual(calc.getStudentGroupingKey(rowA), calc.getStudentGroupingKey(rowB));
});

test('matchesStudentKey: canónico, alias y nombre', () => {
  const row = { studentId: CANONICAL_A, estudianteKey: 'ana perez', estudiante: 'Ana Pérez' };
  assert.strictEqual(calc.matchesStudentKey(row, CANONICAL_A), true);
  assert.strictEqual(calc.matchesStudentKey(row, 'ana perez'), true);
  assert.strictEqual(calc.matchesStudentKey(row, CANONICAL_B), false);
  assert.strictEqual(calc.matchesStudentKey(row, 'juan gomez'), false);
});

test('matchesStudentKey no confunde un canónico ajeno con un nombre', () => {
  const row = { estudianteKey: 'ana perez', estudiante: 'Ana Pérez' };
  assert.strictEqual(calc.matchesStudentKey(row, CANONICAL_A), false);
});

test('recalculateAllStudents agrupa por studentId cuando existe', () => {
  const records = [
    { studentId: CANONICAL_A, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez', tipo: 'Clase', fechaTs: 10 },
    { studentId: CANONICAL_B, estudianteKey: 'juan gomez', estudiante: 'Juan Gómez', tipo: 'Clase', fechaTs: 20 },
    { estudianteKey: 'ana perez', estudiante: 'Ana Pérez', tipo: 'Clase', fechaTs: 30 }
  ];
  const out = calc.recalculateAllStudents(records, new Map());
  const ids = out.map(c => c.studentId).sort();
  assert.deepStrictEqual(ids, [CANONICAL_A, CANONICAL_B, 'ana perez'].sort());
});

console.log(`\n${passed} pruebas OK (rip.grouping)`);
