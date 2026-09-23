/* Shared, browser-safe Wix reconciliation primitives. No credentials live here. */
(function () {
  'use strict';
  const TIME_ZONE = 'America/Bogota';
  const SERVICE_MAPPINGS = [
    { serviceCode: 'MUSICALITOS_MUSICA', wixServiceId: '5deada35-b8be-423c-9ba9-f1a560f2dadb', ripName: 'Musicalitos - Exploración Musical', aliases: ['MS: Musicalitos - Exploración Músical', 'Musicalitos Exploración Musical', 'Exploración Musical'] },
    { serviceCode: 'MUSICALITOS_CORPORAL', wixServiceId: 'e93935b9-1259-40d0-bb57-7b5e25251bcf', ripName: 'Musicalitos - Exploración corporal', aliases: ['MS: Musicalitos - Exploración corporal', 'Exploración corporal'] },
    { serviceCode: 'MUSICALITOS_ARTES', wixServiceId: 'eb3a098b-be92-4845-8b68-610a3fd40a5d', ripName: 'Musicalitos - Exploración artística', aliases: ['MS: Musicalitos exploración artística', 'Exploración artística'] }
  ];
  let activeMappings = SERVICE_MAPPINGS.slice();
  function setServiceMappings(mappings) {
    // Firestore mappings override the built-in seed catalog. Seeds preserve
    // compatibility before the admin catalog has been populated.
    if (Array.isArray(mappings) && mappings.length) activeMappings = mappings.filter(m => m?.active !== false && m?.wixServiceId);
    return activeMappings;
  }
  function normalizeText(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' '); }
  function parts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const out = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).reduce((a, p) => { a[p.type] = p.value; return a; }, {});
    return out;
  }
  function normalizeWixDateTime(value) { const p = parts(value); return p ? { fecha: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, startUtc: new Date(value).toISOString(), startLocal: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second || '00'}-05:00`, timeZone: TIME_ZONE } : null; }
  function toBogotaDateTime(value) { return normalizeWixDateTime(value); }
  function toUtcDateTime(fecha, hora) { return new Date(`${fecha}T${hora}:00-05:00`).toISOString(); }
  function getLocalDate(value) { return normalizeWixDateTime(value)?.fecha || ''; }
  function getLocalTime(value) { return normalizeWixDateTime(value)?.hora || ''; }
  function getCanonicalDateTimeKey(fecha, hora) { return `${String(fecha || '').slice(0, 10)}|${String(hora || '').match(/\d{1,2}:\d{2}/)?.[0]?.padStart(5, '0') || ''}`; }
  function mappingForRip(name) { const key = normalizeText(name); return activeMappings.find(m => [m.ripName, ...(m.aliases || [])].some(x => normalizeText(x) === key || (key && normalizeText(x).includes(key)))); }
  function mappingForWix(id, name) { return activeMappings.find(m => m.wixServiceId === id || normalizeText(m.ripName) === normalizeText(name) || (m.aliases || []).some(x => normalizeText(x) === normalizeText(name))); }
  function reconcile(rip, wix, identity) {
    const local = normalizeWixDateTime(wix.inicio);
    const ripDate = String(rip.fecha || rip.fechaRaw || '').slice(0, 10), ripTime = String(rip.hora || '').match(/\d{1,2}:\d{2}/)?.[0]?.padStart(5, '0');
    const service = mappingForRip(rip.servicio), wixService = wix.wixServiceId || wix.serviceId || '';
    const exact = rip.wixBookingId && rip.wixBookingId === wix.id || rip.wixEventId && rip.wixEventId === wix.wixEventId;
    const sameTime = local && ripDate === local.fecha && ripTime === local.hora;
    const sameService = service ? service.wixServiceId === wixService : normalizeText(rip.servicio) === normalizeText(wix.servicio);
    const sameContact = identity?.wixContactId && wix.wixContactId && identity.wixContactId === wix.wixContactId;
    const sameEmail = identity?.emails?.has(normalizeText(wix.correo));
    if (exact) return { state: wix.estado?.includes('CANCEL') ? 'MATCHED_CANCELED' : 'MATCHED_CONFIRMED', method: 'booking/event ID', local };
    if (sameTime && sameService && (sameContact || sameEmail)) return { state: wix.estado?.includes('CANCEL') ? 'MATCHED_CANCELED' : 'MATCHED_CONFIRMED', method: sameContact ? 'contactId + serviceId + fecha/hora Bogotá' : 'email + serviceId + fecha/hora Bogotá', local };
    if ((sameContact || sameEmail) && sameService) return { state: 'TIME_MISMATCH', method: 'estudiante + servicio; fecha/hora distinta', local };
    if (!service) return { state: 'UNMAPPED_SERVICE', method: 'servicio RIP sin relación Wix', local };
    return null;
  }
  window.RIPWix = { TIME_ZONE, SERVICE_MAPPINGS, setServiceMappings, normalizeText, normalizeWixDateTime, toBogotaDateTime, toUtcDateTime, getLocalDate, getLocalTime, getCanonicalDateTimeKey, mappingForRip, mappingForWix, reconcile };
})();
