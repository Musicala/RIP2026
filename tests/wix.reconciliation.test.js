// Ejecutar: node tests/wix.reconciliation.test.js
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'wix.reconciliation.js'), 'utf8');
const sandbox = { window: {}, Intl, Date, String, Set, RegExp }; vm.createContext(sandbox); vm.runInContext(source, sandbox);
const W = sandbox.window.RIPWix;
const identity = { wixContactId: '2156da2d-770c-4c60-957c-d3bdfb46f657', emails: new Set(['paolita 88 hotmail com']) };
const base = { fecha: '2026-08-29', hora: '09:00', servicio: 'Exploración Musical' };
const music = { id: 'booking-1', wixContactId: identity.wixContactId, wixServiceId: '5deada35-b8be-423c-9ba9-f1a560f2dadb', inicio: '2026-08-29T14:00:00Z', estado: 'CONFIRMED' };
assert.equal(W.normalizeWixDateTime(music.inicio).hora, '09:00');
assert.equal(W.reconcile(base, music, identity).state, 'MATCHED_CONFIRMED');
assert.equal(W.reconcile({ fecha: '2026-08-29', hora: '10:00', servicio: 'Exploración corporal' }, { ...music, wixServiceId: 'e93935b9-1259-40d0-bb57-7b5e25251bcf', inicio: '2026-08-29T15:00:00Z' }, identity).state, 'MATCHED_CONFIRMED');
assert.equal(W.reconcile({ fecha: '2026-08-29', hora: '11:00', servicio: 'Exploración artística' }, { ...music, wixServiceId: 'eb3a098b-be92-4845-8b68-610a3fd40a5d', inicio: '2026-08-29T16:00:00Z' }, identity).state, 'MATCHED_CONFIRMED');
assert.equal(W.reconcile({ fecha: '2026-08-22', hora: '10:00', servicio: 'Exploración corporal' }, { ...music, wixServiceId: 'e93935b9-1259-40d0-bb57-7b5e25251bcf', inicio: '2026-08-22T15:00:00Z', estado: 'CANCELED' }, identity).state, 'MATCHED_CANCELED');
console.log('OK: casos Felipe y conversión UTC → Bogotá');
