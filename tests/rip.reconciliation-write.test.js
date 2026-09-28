'use strict';

const assert = require('node:assert/strict');

global.window = global;
require('../rip.calculations.js');
require('../rip.repository.js');
global.RIPUI = { shared: { norm: global.RIPCalculations.norm } };
require('../ui.reconciliation.js');

const needsReconciliation = global.RIPRepository.needsRegistroIdentityReconciliation;
const canonical = 'FelipeGomezIregui001';
const legacy = 'felipe-gomez-old';
const name = 'Felipe Gómez Iregui';
const nameKey = 'felipe gomez iregui';
const cluster = `cluster:${nameKey}`;

assert.equal(needsReconciliation({
  estudiante: name,
  estudianteKey: nameKey,
  studentId: canonical,
  canonicalStudentId: legacy,
  groupKey: legacy,
  identityClusterKey: cluster,
  identityStatus: 'provisional',
  linkedStudentIds: [canonical, legacy]
}, {
  canonical,
  targetKey: nameKey,
  displayName: name,
  linkedIds: [canonical, legacy]
}), true, 'una fila no puede omitirse solo porque studentId ya coincide');

assert.equal(needsReconciliation({
  estudiante: name,
  estudianteKey: nameKey,
  studentId: canonical,
  canonicalStudentId: canonical,
  groupKey: canonical,
  linkedStudentIds: [canonical, legacy]
}, {
  canonical,
  targetKey: nameKey,
  displayName: name,
  linkedIds: [canonical, legacy]
}), false, 'una identidad canónica limpia no necesita otra escritura');

assert.equal(needsReconciliation({
  estudiante: name,
  estudianteKey: nameKey,
  studentId: legacy,
  canonicalStudentId: legacy,
  groupKey: legacy,
  linkedStudentIds: [legacy]
}, {
  provisionalCluster: cluster,
  targetKey: nameKey,
  displayName: name,
  linkedIds: [legacy]
}), true, 'el clúster provisional debe retirar el canónico y groupKey anteriores');

assert.equal(needsReconciliation({
  estudiante: name,
  estudianteKey: nameKey,
  studentId: legacy,
  groupKey: cluster,
  identityClusterKey: cluster,
  identityStatus: 'provisional',
  linkedStudentIds: [legacy]
}, {
  provisionalCluster: cluster,
  targetKey: nameKey,
  displayName: name,
  linkedIds: [legacy]
}), false, 'un clúster provisional limpio no necesita otra escritura');

const directory = [{
  id: canonical,
  studentId: canonical,
  officialStudentId: canonical,
  name,
  nameKey
}];
const dirtyCases = global.RIPUI.reconciliation.buildCases([{
  id: 'dirty-row',
  estudiante: name,
  estudianteKey: nameKey,
  studentId: canonical,
  canonicalStudentId: legacy,
  groupKey: legacy
}], directory);
assert.equal(dirtyCases.length, 1, 'la fila residual debe seguir visible en Conciliación para poder repararla');

const cleanCases = global.RIPUI.reconciliation.buildCases([{
  id: 'clean-row',
  estudiante: name,
  estudianteKey: nameKey,
  studentId: canonical,
  canonicalStudentId: canonical,
  groupKey: canonical
}], directory);
assert.equal(cleanCases.length, 0, 'la fila ya conciliada no debe reaparecer como pendiente');

console.log('OK: la conciliación repara campos de identidad residuales');
