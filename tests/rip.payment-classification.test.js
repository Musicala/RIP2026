'use strict';

/*
  Regresiones para comentarios de pago que mencionan pruebas parciales.
  Ejecutar: node tests/rip.payment-classification.test.js
*/

const assert = require('node:assert');

global.window = {};
require('../rip.calculations.js');
const calc = global.window.RIPCalculations;

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('paquete personalizado conserva MS P aunque el comentario mencione una prueba', () => {
  const row = {
    tipo: 'Pago',
    servicio: 'Sede Personalizado Paquete de 17 clases',
    comentario: '17 individuales + 8 grupales + 1 prueba grupal',
    pago: '1.062.000,00'
  };
  assert.deepStrictEqual(calc.classifyMovimiento(row), { clasif: 'Pago', clasifPago: 'MS P' });
  assert.strictEqual(calc.computeMovimiento(row), 17);
});

test('paquete grupal conserva MS G aunque el comentario mencione una prueba', () => {
  const row = {
    tipo: 'Pago',
    servicio: 'Sede Grupal Paquete de 9 clases',
    comentario: '8 grupales + 1 prueba grupal',
    pago: '336.000,00'
  };
  assert.deepStrictEqual(calc.classifyMovimiento(row), { clasif: 'Pago', clasifPago: 'MS G' });
  assert.strictEqual(calc.computeMovimiento(row), 9);
});

test('un servicio que sí es una prueba conserva la clasificación Prueba', () => {
  const row = {
    tipo: 'Pago',
    servicio: 'Clase de prueba individual',
    comentario: '',
    pago: '1'
  };
  assert.deepStrictEqual(calc.classifyMovimiento(row), { clasif: 'Prueba', clasifPago: 'Prueba' });
  assert.strictEqual(calc.computeMovimiento(row), 1);
});

test('una clase marcada como prueba en el comentario sigue siendo Prueba', () => {
  const row = {
    tipo: 'Clase',
    servicio: 'MS: Piano',
    comentario: 'Clase de prueba'
  };
  assert.deepStrictEqual(calc.classifyMovimiento(row), { clasif: 'Prueba', clasifPago: '' });
  assert.strictEqual(calc.computeMovimiento(row), 0);
});

test('el caso Julieta distribuye +7 en MS P y +4 en MS G', () => {
  const rows = [
    ...Array.from({ length: 38 }, () => ({ tipo: 'Clase', servicio: 'MS: Piano' })),
    ...Array.from({ length: 17 }, () => ({ tipo: 'Clase', servicio: 'MS: Musigrandes Canto' })),
    { tipo: 'Pago', servicio: 'Sede Personalizado P12' },
    {
      tipo: 'Pago',
      servicio: 'Sede Personalizado Paquete de 17 clases',
      comentario: '17 individuales + 8 grupales + 1 prueba grupal'
    },
    { tipo: 'Pago', servicio: 'Sede Personalizado Paquete de 16 clases' },
    { tipo: 'Pago', servicio: 'Sede Grupal P4' },
    {
      tipo: 'Pago',
      servicio: 'Sede Grupal Paquete de 9 clases',
      comentario: '8 grupales + 1 prueba grupal'
    },
    { tipo: 'Pago', servicio: 'Sede Grupal Paquete de 8 clases' }
  ];
  const totals = new Map();
  for (const row of rows) {
    const classification = calc.classifyMovimiento(row);
    const key = row.tipo === 'Pago' ? classification.clasifPago : classification.clasif;
    totals.set(key, (totals.get(key) || 0) + calc.computeMovimiento(row));
  }
  assert.strictEqual(totals.get('MS P'), 7);
  assert.strictEqual(totals.get('MS G'), 4);
  assert.strictEqual(totals.has('Prueba'), false);
});

console.log(`\n${passed} pruebas OK (rip.payment-classification)`);
