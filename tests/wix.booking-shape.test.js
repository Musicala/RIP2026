const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../functions/index.js'), 'utf8');
const contactId = 'test-contact';
const serviceId = 'eb3a098b-be92-4845-8b68-610a3fd40a5d';
const booking = { id: 'test-booking', contactDetails: { contactId }, status: 'CONFIRMED',
  startDate: '2026-09-05T16:00:00Z', bookedEntity: {
    title: 'MS: Musicalitos exploración artística',
    slot: { startDate: '2026-09-05T11:00:00-05:00', serviceId, eventId: 'event', sessionId: 'session' }
  } };
let requestCount = 0;
const sandbox = { window: {}, Intl, Date, HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } }, wixRequest: async (url, body) => {
  requestCount += 1;
  if (requestCount === 1) {
    assert.equal(body.query.filter['contactDetails.contactId'], contactId);
    return { extendedBookings: [{ booking }, { booking: { ...booking, contactDetails: { contactId: 'other' } } }], pagingMetadata: { cursors: { next: 'next-page' } } };
  }
  assert.equal(body.query.filter, undefined);
  assert.equal(body.query.cursorPaging.cursor, 'next-page');
  return { extendedBookings: [], pagingMetadata: {} };
} };
vm.createContext(sandbox);
vm.runInContext(source.slice(source.indexOf('function wixClassTime('), source.indexOf('async function findMemberByEmail(')), sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../wix.reconciliation.js'), 'utf8'), sandbox);
(async () => {
  assert.equal(sandbox.getStudentWixEmail({ email: ' Edurendon@Yahoo.com ', emails: ['edurendon@yahoo.com'] }), 'edurendon@yahoo.com');
  assert.equal(sandbox.getStudentWixEmail({ correoWix: 'explicit@example.com', email: 'other@example.com' }), 'explicit@example.com');
  assert.equal(sandbox.getStudentWixEmail({ name: 'Julieta', emails: [] }), '');
  assert.throws(() => sandbox.getStudentWixEmail({ email: 'one@example.com', emails: ['two@example.com'] }), /WIX_EMAIL_AMBIGUOUS/);
  assert.equal(sandbox.getStudentWixEmail({ correoWix: 'invalid', email: 'other@example.com' }), 'invalid');
  const classes = await sandbox.queryWixBookings(contactId, '2026-01-01', '2026-12-31');
  assert.equal(requestCount, 2);
  assert.equal(classes.length, 1);
  assert.equal(classes[0].wixServiceId, serviceId);
  assert.equal(classes[0].wixSessionId, 'session');
  const result = sandbox.window.RIPWix.reconcile({ fecha: '2026-09-05', hora: '11:00', servicio: booking.bookedEntity.title }, classes[0], { wixContactId: contactId });
  assert.equal(result.state, 'MATCHED_CONFIRMED');
  assert.equal(result.local.hora, '11:00');
  assert.equal(sandbox.wixClassTime({ ...booking, startDate: undefined }), '2026-09-05T11:00:00-05:00');
  console.log('OK: extendedBookings.booking, slot IDs, contact isolation, UTC and Bogotá match');
})().catch(error => { console.error(error); process.exitCode = 1; });
