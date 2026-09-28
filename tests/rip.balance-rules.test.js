/* Pruebas de regresión de las reglas de saldos y paquetes de RIP. */
const assert = require('assert');
global.window = global;
require('../rip.calculations.js');
require('../rip.repository.js');

const C = global.RIPCalculations;
const R = global.RIPRepository;
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

test('movimiento manual se conserva y un +1 histórico no anula el tamaño del paquete', () => {
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Servicio', movimiento: 7 }), 7);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Servicio', movimiento: 7, movimientoManual: true }), 7);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Sede Grupal P9', movimiento: 1 }), 9);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Sede Personalizado Paquete de 17 clases', movimiento: 1 }), 17);
  assert.equal(C.computeMovimiento({ tipo: 'Pago', servicio: 'Paquete P9', movimiento: 4, movimientoManual: true }), 4);
  assert.equal(C.computeMovimiento({ tipo: 'Clase', servicio: 'CP prueba', movimiento: 7 }), -1);
});

test('la corrección manual prima sobre clasificaciones históricas de prueba o cortesía', () => {
  assert.equal(C.computeMovimiento({
    id: 'aVMb0lxzDKj30SI8nDJb', tipo: 'Pago', servicio: 'Sede Personalizado P17 clases',
    clasifPago: 'CP de Clase de prueba', movimiento: 17, movimientoSaldo: 17, movimientoManual: true
  }), 17);
  assert.equal(C.computeMovimiento({
    id: 'jXdqxs1RbgRqq9E0dopf', tipo: 'Pago', servicio: 'Sede Grupal P9',
    clasifPago: 'CP de Clase de prueba', movimiento: 9, movimientoSaldo: 9, movimientoManual: true
  }), 9);
  assert.equal(C.computeMovimiento({
    id: 'yOu361GcHozH6AvWuAvr', tipo: 'Pago', servicio: 'Sede Personalizado P7 clases',
    clasifPago: 'CC de Clase de cortesía', movimiento: 7, movimientoSaldo: 7, movimientoManual: true
  }), 7);
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

test('Mañanas con Arte se comporta como MS G', () => {
  assert.deepEqual(
    C.classifyMovimiento({ tipo: 'Clase', servicio: 'Mañanas con Arte' }),
    { clasif: 'MS G', clasifPago: '' }
  );
  assert.deepEqual(
    C.classifyMovimiento({ tipo: 'Pago', servicio: 'Mañanas con Arte Paquete de 8 clases' }),
    { clasif: 'Pago', clasifPago: 'MS G' }
  );
  assert.equal(
    C.getPackageRedemptionKey({ tipo: 'Clase', servicio: 'Mañanas con Arte' }),
    C.getPackageRedemptionKey({ tipo: 'Clase', servicio: 'Musicalitos grupal' })
  );
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

test('la redención usa el servicio actual aunque la clasificación guardada esté desactualizada', () => {
  assert.equal(C.getPackageRedemptionKey({
    tipo: 'Pago', servicio: 'Sede Personalizado Paquete de 4 clases', clasif: 'Pago', clasifPago: 'Ensamble'
  }), 'ms p');
  assert.equal(C.getPackageRedemptionKey({
    tipo: 'Clase', servicio: 'MS: Batería (Personalizado)', clasif: 'Ensamble'
  }), 'ms p');
  assert.equal(C.getPackageRedemptionKey({
    tipo: 'Clase', servicio: 'Servicio libre', clasif: 'Familia manual'
  }), 'familia manual');
});

test('al cambiar el nombre del paquete también cambia el movimiento', () => {
  const updated = R.normalizeRegistroUpdate(
    { tipo: 'Pago', servicio: 'Sede Personalizado Paquete de 8 clases', movimiento: 8 },
    { servicio: 'Sede Personalizado Paquete de 12 clases', movimiento: 8 }
  );
  assert.equal(updated.movimiento, 12);
  assert.equal(updated.movimientoSaldo, 12);

  const alreadyRenamed = R.normalizeRegistroUpdate(
    { tipo: 'Pago', servicio: 'Sede Grupal Paquete de 9 clases', movimiento: 1 },
    { servicio: 'Sede Grupal Paquete de 9 clases' }
  );
  assert.equal(alreadyRenamed.movimiento, 9);

  const unchanged = R.normalizeRegistroUpdate(
    { tipo: 'Pago', servicio: 'Servicio manual', movimiento: 7 },
    { comentario: 'Conservar movimiento manual' }
  );
  assert.equal(unchanged.movimiento, 7);
});

test('al editar manualmente el movimiento se reemplaza el movimientoSaldo antiguo', () => {
  const updated = R.normalizeRegistroUpdate(
    {
      tipo: 'Pago',
      servicio: 'Sede Grupal Paquete de 9 clases',
      movimiento: 1,
      movimientoSaldo: 1
    },
    { movimiento: 9 }
  );
  assert.equal(updated.movimiento, 9);
  assert.equal(updated.movimientoSaldo, 9);
});

test('el movimiento manual prima incluso si también cambia el nombre del paquete', () => {
  const updated = R.normalizeRegistroUpdate(
    { tipo: 'Pago', servicio: 'Sede Grupal Paquete de 9 clases', movimiento: 1, movimientoSaldo: 1 },
    { servicio: 'Sede Grupal Paquete de 9 clases', movimiento: 7 }
  );
  assert.equal(updated.movimiento, 7);
  assert.equal(updated.movimientoSaldo, 7);
  assert.equal(updated.movimientoManual, true);
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

test('CC/CP redime exclusivamente la clase más cercana posterior al pago', () => {
  const rows = C.markTrialCourtesyRedemptions([
    { id: 'before', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-01', servicio: 'MS P', movimiento: -1 },
    { id: 'cp', tipo: 'Pago', estudiante: 'Ana', fecha: '2026-07-03', servicio: 'Clase de prueba CP', movimiento: 1 },
    { id: 'nearest', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-04', servicio: 'MS P', movimiento: -1 },
    { id: 'later', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-07-05', servicio: 'MS P', movimiento: -1 }
  ]);
  assert.equal(rows.find(r => r.id === 'before').trialCourtesyRedeemed, undefined);
  assert.equal(rows.find(r => r.id === 'nearest').trialCourtesyRedeemed, true);
  assert.equal(rows.find(r => r.id === 'nearest').trialCourtesyCode, 'CP');
  assert.equal(rows.find(r => r.id === 'nearest').trialCourtesyPaymentId, 'cp');
  assert.equal(rows.find(r => r.id === 'later').trialCourtesyRedeemed, undefined);
});

test('pagos de prueba/cortesía sin sigla se redimen en orden y no comparten clase', () => {
  const rows = C.markTrialCourtesyRedemptions([
    { id: 'cp', tipo: 'Pago', estudiante: 'Ana', fecha: '2026-09-04', servicio: 'Sede Grupal Clase de prueba', movimiento: 1 },
    { id: 'cc', tipo: 'Pago', estudiante: 'Ana', fecha: '2026-09-05', servicio: 'Clase de cortesía', movimiento: 1 },
    { id: 'first', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-09-05', hora: '10:00', servicio: 'MS G', movimiento: -1 },
    { id: 'second', tipo: 'Clase', estudiante: 'Ana', fecha: '2026-09-05', hora: '11:00 a. m.', servicio: 'MS G', movimiento: -1 }
  ]);
  assert.equal(rows.find(r => r.id === 'first').trialCourtesyCode, 'CP');
  assert.equal(rows.find(r => r.id === 'first').trialCourtesyPaymentId, 'cp');
  assert.equal(rows.find(r => r.id === 'second').trialCourtesyCode, 'CC');
  assert.equal(rows.find(r => r.id === 'second').trialCourtesyPaymentId, 'cc');
});

test('ME anual no descuenta las clases de práctica durante su vigencia', () => {
  const rows = C.markMusigymSubscriptions([
    { id: 'me', tipo: 'Pago', servicio: 'ME matrícula anual', estudiante: 'Ana', estudianteKey: 'ana', fecha: '2026-01-10', fechaTs: new Date('2026-01-10').getTime(), movimiento: 0 },
    { id: 'clase-me', tipo: 'Clase', servicio: 'ME práctica', estudiante: 'Ana', estudianteKey: 'ana', fecha: '2026-08-10', fechaTs: new Date('2026-08-10').getTime(), movimiento: -1 },
    { id: 'clase-vencida', tipo: 'Clase', servicio: 'ME práctica', estudiante: 'Ana', estudianteKey: 'ana', fecha: '2027-01-10', fechaTs: new Date('2027-01-10').getTime(), movimiento: -1 }
  ]);
  assert.equal(rows.find(r => r.id === 'clase-me').movimientoSaldo, 0);
  assert.equal(rows.find(r => r.id === 'clase-me').matriculaEnrollmentRedeemed, true);
  assert.equal(rows.find(r => r.id === 'clase-vencida').movimientoSaldo, -1);
});

console.log(`\n${passed} pruebas OK (rip.balance-rules)`);
