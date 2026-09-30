'use strict';

const assert = require('node:assert');

global.window = {};
require('../rip.calculations.js');

const calc = global.window.RIPCalculations;

const interest = calc.calculateStudentInterest([
  { tipo: 'Clase', servicio: 'MS: Musigrandes Cuerdas Frotadas', fecha: '2026-09-22' }
], null, { today: '2026-09-30' });

assert.deepStrictEqual(interest.cursos, ['Música']);
assert.deepStrictEqual(interest.instrumentos, ['Cuerdas frotadas']);
assert.strictEqual(interest.instrumentoDisplay, 'Cuerdas frotadas');

console.log('ok - Musigrandes Cuerdas Frotadas se clasifica para los filtros de Muestras');
