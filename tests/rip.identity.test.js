'use strict';

/*
  Pruebas del resolutor de identidad compartido de RIP (sin Firebase).
  Ejecutar: node tests/rip.identity.test.js  (desde la carpeta de RIP)
*/

const assert = require('node:assert');
const identity = require('../rip.identity.js');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Directorio local simulado (rip-musicala/students tras el sync de identidad).
const students = [
  {
    id: 'aB3xK9mP2vR7sT4wX8Zz',
    studentId: 'aB3xK9mP2vR7sT4wX8Zz',
    identitySource: 'estudiantes-musicala',
    name: 'Ana María Pérez',
    nameKey: 'ana maria perez',
    emails: ['ana@test.com'],
    aliases: ['stu_ana_maria_perez_45', 'CC1030599272', 'uuid-contact-1']
  },
  // Homónimos: dos "Juan Gómez" distintos.
  {
    id: 'Jh7wQ2nL5xT9rB4vC6Ma',
    studentId: 'Jh7wQ2nL5xT9rB4vC6Ma',
    identitySource: 'estudiantes-musicala',
    name: 'Juan Gómez',
    nameKey: 'juan gomez',
    emails: ['juan1@test.com'],
    aliases: []
  },
  {
    id: 'Kp3sD8fG1hJ6kL9mN2Qr',
    studentId: 'Kp3sD8fG1hJ6kL9mN2Qr',
    identitySource: 'estudiantes-musicala',
    name: 'Juan Gómez',
    nameKey: 'juan gomez',
    emails: ['juan2@test.com'],
    aliases: []
  },
  // Doc legado por nombre con officialStudentId anotado.
  {
    id: 'carlos ruiz',
    nameKey: 'carlos ruiz',
    name: 'Carlos Ruiz',
    officialStudentId: 'Zt5yU1iO7pA3sD9fG2Hj'
  }
];

const index = identity.buildIndex(students);

test('studentId explícito se respeta tal cual', () => {
  const r = identity.resolveWithIndex(index, { studentId: 'aB3xK9mP2vR7sT4wX8Zz' });
  assert.strictEqual(r.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
  assert.strictEqual(r.source, 'explicit');
});

test('studentId explícito con forma canónica se acepta aunque el índice no lo tenga', () => {
  const r = identity.resolveWithIndex(index, { studentId: 'Xx9nUeVa1CuEnTa2NuEv' });
  assert.strictEqual(r.studentId, 'Xx9nUeVa1CuEnTa2NuEv');
  assert.strictEqual(r.source, 'explicit');
});

test('officialStudentId resuelve (doc legado anotado)', () => {
  const r = identity.resolveWithIndex(index, { officialStudentId: 'Zt5yU1iO7pA3sD9fG2Hj' });
  assert.strictEqual(r.studentId, 'Zt5yU1iO7pA3sD9fG2Hj');
});

test('correo único resuelve', () => {
  const r = identity.resolveWithIndex(index, { email: 'ANA@test.com' });
  assert.strictEqual(r.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
  assert.strictEqual(r.source, 'email');
});

test('alias heredado (documento) resuelve sin usarlo como ID', () => {
  const r = identity.resolveWithIndex(index, { aliases: ['CC1030599272'] });
  assert.strictEqual(r.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
  assert.strictEqual(r.source, 'alias');
});

test('nombre único resuelve como último recurso', () => {
  const r = identity.resolveWithIndex(index, { name: 'Ana María Pérez' });
  assert.strictEqual(r.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
  assert.strictEqual(r.source, 'nameKey');
});

test('HOMÓNIMOS: dos estudiantes con el mismo nombre NO se mezclan', () => {
  const r = identity.resolveWithIndex(index, { name: 'Juan Gómez' });
  assert.strictEqual(r.studentId, '');
  assert.strictEqual(r.ambiguous, true);
  assert.strictEqual(r.candidates.length, 2);
});

test('el homónimo se distingue por correo', () => {
  const r = identity.resolveWithIndex(index, { name: 'Juan Gómez', email: 'juan2@test.com' });
  assert.strictEqual(r.studentId, 'Kp3sD8fG1hJ6kL9mN2Qr');
});

test('un studentId canónico NUNCA se normaliza como llave de documento', () => {
  const key = identity.resolveDocKeyWithIndex(index, 'aB3xK9mP2vR7sT4wX8Zz');
  assert.strictEqual(key, 'aB3xK9mP2vR7sT4wX8Zz');
  const unknownCanonical = identity.resolveDocKeyWithIndex(index, 'Xx9nUeVa1CuEnTa2NuEv');
  assert.strictEqual(unknownCanonical, 'Xx9nUeVa1CuEnTa2NuEv');
});

test('un nombre mapea a su doc canónico cuando es único', () => {
  const key = identity.resolveDocKeyWithIndex(index, 'Ana María Pérez');
  assert.strictEqual(key, 'aB3xK9mP2vR7sT4wX8Zz');
});

test('un nombre ambiguo conserva el nameKey heredado (no adivina)', () => {
  const key = identity.resolveDocKeyWithIndex(index, 'Juan Gómez');
  assert.strictEqual(key, 'juan gomez');
});

test('cambio de nombre: el studentId no cambia (el índice re-resuelve por id)', () => {
  const renamed = students.map((s) =>
    s.id === 'aB3xK9mP2vR7sT4wX8Zz' ? { ...s, name: 'Ana M. Pérez Casada', nameKey: 'ana m. perez casada' } : s
  );
  const idx2 = identity.buildIndex(renamed);
  const r = identity.resolveWithIndex(idx2, { studentId: 'aB3xK9mP2vR7sT4wX8Zz' });
  assert.strictEqual(r.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
  const byEmail = identity.resolveWithIndex(idx2, { email: 'ana@test.com' });
  assert.strictEqual(byEmail.studentId, 'aB3xK9mP2vR7sT4wX8Zz');
});

console.log(`\n${passed} pruebas OK (rip.identity)`);
