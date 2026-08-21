/* Pruebas de regresión de las reglas de saldos y paquetes de RIP. */
const assert = require('assert');
global.window = global;
require('../rip.calculations.js');

const C = global.RIPCalculations;
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

test('paquetes, clases, matrícula y servicios no reconocibles mueven lo indicado', () => {
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Paquete P12' }), 12);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'MS P' }), -1);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Matrícula ME' }), 0);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Servicio desconocido' }), 0);
});

test('movimiento importado no nulo se conserva, salvo reglas CP/CC', () => {
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Servicio', movimiento: 7 }), 7);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'CP prueba', movimiento: 7 }), -1);
});

test('CP/CC y prueba/cortesía directa siguen su regla de saldo', () => {
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'CP prueba' }), 1);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'CC cortesía' }), -1);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'clase de prueba' }), 0);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'clase gratis' }), 0);
});

test('la clasificación respeta prioridad y separa pago de familia', () => {
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Clase', servicio: 'Sede Personalizado, clase de prueba' }), { clasif: 'Prueba', clasifPago: '' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Multa', servicio: 'CP prueba' }), { clasif: 'Multa', clasifPago: '' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Pago', servicio: 'Sede Personalizado Paquete de 8 clases' }), { clasif: 'Pago', clasifPago: 'MS P' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Pago', servicio: 'Ensambles P8' }), { clasif: 'Pago', clasifPago: 'Ensamble' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Pago', servicio: 'Vacacional P20' }), { clasif: 'Pago', clasifPago: 'TV' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Pago', servicio: 'Taller MS P24' }), { clasif: 'Taller', clasifPago: '' });
  assert.deepEqual(C.classifyMovimiento({ tipo: 'Clase', servicio: 'Servicio libre' }), { clasif: 'No clasificado', clasifPago: '' });
});

test('un No clasificado heredado no bloquea el reconocimiento actualizado', () => {
  assert.deepEqual(
    C.classifyMovimiento({ tipo: 'Clase', servicio: 'MS: Piano', clasif: 'No clasificado' }),
    { clasif: 'MS P', clasifPago: '' }
  );
  assert.deepEqual(
    C.classifyMovimiento({ tipo: 'Clase', servicio: 'MS: Piano', clasif: 'Clasificación manual' }),
    { clasif: 'Clasificación manual', clasifPago: '' }
  );
});

test('las variantes de texto de paquete extraen el número', () => {
  ['P4', 'P 4', 'Paquete 4', 'Paquete de 4'].forEach(servicio => {
    assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio }), 4);
  });
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Taller P48' }), 48);
});

test('MusiGym mensual cubre solo las clases del mes de vigencia', () => {
  const rows = C.markMusigymSubscriptions([
    { tipo: 'Pago', estudiante: 'Ana', fecha: '2026-07-05', servicio: 'MusiGym mensual', movimiento: 0 },
    { tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-12', servicio: 'MusiGym', movimiento: -1 },
    { tipo: 'Clase', estudiante: 'Ana', fecha: '2026-08-05', servicio: 'MusiGym', movimiento: -1 }
  ]);
  assert.equal(rows[1].movimientoSaldo, 0);
  assert.equal(rows[2].movimientoSaldo, -1);
});

test('la segunda clase duplicada no afecta el saldo', () => {
  const rows = C.markDuplicateClasses([
    { id: 'a', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-10', hora: '10:00', profesor: 'P', movimiento: -1 },
    { id: 'b', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-10', hora: '10:00', profesor: 'P', movimiento: -1 }
  ]);
  assert.equal(rows[0].movimientoSaldo, -1);
  assert.equal(rows[1].movimientoSaldo, 0);
});

test('el último paquete válido define el límite de programación', () => {
  assert.equal(C.getStudentClassLimit([
    { tipo: 'Pago', fecha: '2026-01-01', servicio: 'Paquete P24', movimiento: 24 },
    { tipo: 'Clase', fecha: '2026-01-02', servicio: 'MS P', movimiento: -1 },
    { tipo: 'Pago', fecha: '2026-02-01', servicio: 'Paquete P4', movimiento: 4 }
  ]), 4);
  assert.equal(C.getStudentClassLimit([{ tipo: 'Pago', fecha: '2026-01-01', servicio: 'Taller P48', movimiento: 48 }]), 24);
});

console.log(`\n${passed} pruebas OK (rip.balance-rules)`);
