"use strict";

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp, getApps } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { createHash } = require("node:crypto");

if (!getApps().length) initializeApp();

const WIX_API_KEY = defineSecret("WIX_API_KEY");
// Identificador público del sitio Musicala. La llave sigue siendo el único
// dato sensible y se guarda exclusivamente en Secret Manager.
const WIX_SITE_ID = "1c8e0ead-65dd-4028-aad4-eaa3dda243c0";
const WIX_API = "https://www.wixapis.com";
const RIP_USERS = new Set([
  "catalina.medina.leal@gmail.com",
  "alekcaballeromusic@gmail.com",
  "adminmusicala@gmail.com",
  "musicalaasesor@gmail.com"
]);

function normalise(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function wixHeaders() {
  return {
    Authorization: WIX_API_KEY.value(),
    "wix-site-id": WIX_SITE_ID,
    "Content-Type": "application/json"
  };
}

async function wixRequest(path, body) {
  const response = await fetch(`${WIX_API}${path}`, {
    method: "POST",
    headers: wixHeaders(),
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || payload?.details?.applicationError?.description || `HTTP ${response.status}`;
    throw new Error(`Wix: ${detail}`);
  }
  return payload;
}

async function wixGet(path) {
  const response = await fetch(`${WIX_API}${path}`, {
    method: "GET",
    headers: wixHeaders()
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.message || payload?.details?.applicationError?.description || `HTTP ${response.status}`;
    throw new Error(`Wix: no se pudo verificar la orden (${detail}).`);
  }
  return payload;
}

function wixClassTime(booking) {
  const slot = booking?.bookedEntity?.slot || booking?.bookedEntity?.item?.slot || booking?.slot || {};
  return String(booking?.startDate || slot?.startDate || slot?.start || booking?.session?.startDate || "");
}

function wixClassService(booking) {
  const item = booking?.bookedEntity?.item || {};
  return String(booking?.bookedEntity?.title || item?.serviceName || item?.service?.name || booking?.serviceName || booking?.service?.name || "Clase Wix");
}

function wixAttendanceStatus(booking) {
  const attendance = booking?.attendance || booking?.attendanceInfo || booking?.attendanceStatus || {};
  return String(attendance?.status || attendance || "").toUpperCase();
}

function wixBookingEmail(booking) {
  const contact = booking?.contactDetails || booking?.customerDetails || booking?.customer || {};
  return String(contact?.email || booking?.email || "").trim().toLowerCase();
}

function wixBookingContactId(booking) {
  const contact = booking?.contactDetails || booking?.customerDetails || booking?.customer || {};
  return String(contact?.contactId || contact?.id || booking?.contactId || booking?.customerId || '');
}

function wixBookingServiceId(booking) {
  const item = booking?.bookedEntity?.item || {};
  return String(booking?.bookedEntity?.slot?.serviceId || item?.slot?.serviceId || item?.serviceId || item?.service?.id || booking?.serviceId || booking?.service?.id || '');
}

function normalizeWixEmail(value) {
  return String(value || "").trim().toLowerCase();
}

// Wix v4 returns the primary address separately from the collection.  Keep
// this in one place: the collection is an object with `items`, not an array.
function getPrimaryWixEmail(contact) {
  return normalizeWixEmail(
    contact?.primaryInfo?.email
    || contact?.info?.emails?.items?.find((entry) => entry?.primary)?.email
    || contact?.info?.emails?.items?.[0]?.email
  );
}

function contactHasWixEmail(contact, email) {
  const expected = normalizeWixEmail(email);
  return [
    contact?.primaryInfo?.email,
    ...(contact?.info?.emails?.items || []).map((entry) => entry?.email)
  ].some((value) => normalizeWixEmail(value) === expected);
}

function wixContactDisplayName(contact) {
  // Wix commonly stores the complete name in `first`; this is diagnostic only.
  return [contact?.info?.name?.first, contact?.info?.name?.last].filter(Boolean).join(" ").trim();
}

async function queryWixContactsByEmail(email) {
  const query = (field) => wixRequest("/contacts/v4/contacts/query", {
    query: { filter: { [field]: { $eq: email } }, paging: { limit: 100, offset: 0 } }
  });
  // `primaryInfo.email` is the authoritative primary lookup.  The second
  // lookup covers contacts where the supplied address is an item in the email
  // collection.  Neither query ever uses a name.
  const [primary, collection] = await Promise.all([
    query("primaryInfo.email"),
    query("info.emails.email")
  ]);
  const contacts = [...(primary.contacts || []), ...(collection.contacts || [])];
  return Array.from(new Map(
    contacts.filter((contact) => contactHasWixEmail(contact, email)).map((contact) => [String(contact?.id || ""), contact])
  ).values()).filter((contact) => contact.id);
}

function getStudentWixEmail(student) {
  const explicit = normalizeWixEmail(student?.correoWix);
  if (explicit) return explicit;
  const candidates = [...new Set([
    student?.wixEmail, student?.email, student?.correo,
    ...(Array.isArray(student?.emails) ? student.emails : [])
  ].map(normalizeWixEmail).filter(value => /^\S+@\S+\.\S+$/.test(value)))];
  if (candidates.length > 1) {
    throw new HttpsError('failed-precondition', 'WIX_EMAIL_AMBIGUOUS: hay varios correos relacionados. Guarda el correo Wix correcto en el directorio.');
  }
  return candidates[0] || '';
}

function wixContactChoice(contact) {
  return {
    contactId: String(contact?.id || ''),
    name: wixContactDisplayName(contact),
    primaryEmail: getPrimaryWixEmail(contact)
  };
}

async function resolveWixContact(studentId, selectedContactId = '') {
  const id = String(studentId || "").trim();
  if (!id) throw new HttpsError("invalid-argument", "La conciliación requiere el ID del estudiante RIP.");
  const ref = getFirestore().collection("students").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "No existe la ficha RIP del estudiante.");
  const student = snapshot.data() || {};
  const existingId = String(student.wixContactId || "").trim();
  if (existingId) return { contactId: existingId, correoWix: normalizeWixEmail(student.correoWix), source: "stored" };
  const correoWix = getStudentWixEmail(student);
  if (!/^\S+@\S+\.\S+$/.test(correoWix)) {
    throw new HttpsError("failed-precondition", "WIX_CONTACT_NOT_FOUND: la ficha RIP no tiene un correoWix válido.");
  }
  const contacts = await queryWixContactsByEmail(correoWix);
  if (!contacts.length) throw new HttpsError("not-found", "WIX_CONTACT_NOT_FOUND");
  const selectedId = String(selectedContactId || '').trim();
  if (contacts.length > 1 && !selectedId) {
    return { ambiguous: true, correoWix, candidates: contacts.map(wixContactChoice) };
  }
  const contact = selectedId ? contacts.find(item => String(item?.id || '') === selectedId) : contacts[0];
  if (!contact) {
    throw new HttpsError('invalid-argument', 'El contacto Wix elegido ya no corresponde al correo de esta ficha.');
  }
  const contactId = String(contact.id);
  await ref.set({ correoWix, wixContactId: contactId, wixContactResolvedAt: FieldValue.serverTimestamp() }, { merge: true });
  return {
    contactId,
    correoWix,
    source: "resolved-by-correoWix",
    wixContactName: wixContactDisplayName(contact),
    wixPrimaryEmail: getPrimaryWixEmail(contact)
  };
}

async function queryWixBookings(contactId, from, to) {
  const classes = [];
  const now = Date.now();
  const fromTs = new Date(from).getTime();
  const toTs = new Date(to).getTime();
  let cursor = "";
  let pages = 0;
  do {
    // Wix conserva el filtro dentro del cursor. En páginas posteriores no
    // permite volver a enviarlo junto al cursor.
    const query = cursor
      ? { cursorPaging: { limit: 100, cursor } }
      : {
          // Las reservas se aíslan por la identidad ya resuelta, nunca por
          // nombre ni por una coincidencia posterior de correo.
          filter: { "contactDetails.contactId": contactId },
          cursorPaging: { limit: 100 }
        };
    const result = await wixRequest("/_api/bookings-reader/v2/extended-bookings/query", { query });
    const bookings = result.extendedBookings || result.bookings || [];
    for (const extended of bookings) {
      const booking = extended.booking || extended;
      const start = wixClassTime(booking);
      const email = wixBookingEmail(booking);
      if (!start || wixBookingContactId(booking) !== contactId) continue;
      const startTs = new Date(start).getTime();
      if (!Number.isFinite(startTs) || startTs < fromTs || startTs > toTs) continue;
      const status = String(booking?.status || "").toUpperCase();
      const attendance = wixAttendanceStatus(extended.attendance ? extended : booking);
      const isPast = new Date(start).getTime() < now;
      // Una reserva pendiente pasada no prueba que la clase ocurrió. Para
      // alertar faltantes usamos solo confirmadas o con asistencia registrada.
      if (isPast && !status.includes("CONFIRM") && !status.includes("CANCEL") && !attendance.includes("ATTEND")) continue;
      classes.push({
        id: String(booking?.id || ""),
        wixBookingId: String(booking?.id || ''),
        wixEventId: String(booking?.bookedEntity?.slot?.eventId || booking?.bookedEntity?.item?.slot?.eventId || booking?.bookedEntity?.item?.eventId || booking?.eventId || ''),
        wixSessionId: String(booking?.bookedEntity?.slot?.sessionId || booking?.bookedEntity?.item?.slot?.sessionId || booking?.bookedEntity?.item?.sessionId || booking?.sessionId || ''),
        wixContactId: wixBookingContactId(booking),
        wixServiceId: wixBookingServiceId(booking),
        correo: email,
        inicio: start,
        servicio: wixClassService(booking),
        estado: status || "CONFIRMED",
        asistencia: attendance
      });
    }
    cursor = String(result?.pagingMetadata?.cursors?.next || result?.pagingMetadata?.nextCursor || "");
    pages += 1;
    if (!bookings.length) break;
  } while (cursor && pages < 10);
  return classes;
}

async function findMemberByEmail(email) {
  const result = await wixRequest("/members/v1/members/query", {
    query: { filter: { loginEmail: email }, paging: { limit: 2 } }
  });
  const members = result.members || [];
  if (members.length !== 1) {
    throw new Error(members.length ? "Hay más de un miembro Wix con este correo." : "No existe un miembro Wix con este correo.");
  }
  return members[0];
}

async function findPlan(service) {
  const db = getFirestore();
  const key = normalise(service);
  const configured = await db.collection("wixPlanMappings").doc(key).get();
  if (configured.exists && configured.data()?.planId) return configured.data();

  const result = await wixRequest("/pricing-plans/v3/plans/query", {
    query: { cursorPaging: { limit: 100 } }
  });
  const plans = result.plans || [];
  const matches = plans.filter(plan => normalise(plan.name) === key);
  if (matches.length !== 1) {
    throw new Error(matches.length ? `El servicio coincide con varios planes Wix: ${service}.` : `No hay un plan Wix llamado exactamente: ${service}.`);
  }
  const plan = matches[0];
  const mapping = { planId: plan.id, planName: plan.name, source: "automatic-exact-match" };
  await configured.ref.set({ ...mapping, service, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return mapping;
}

function wixStartDateIso(value) {
  const date = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const parsed = new Date(`${date}T00:00:00-05:00`);
  if (!Number.isFinite(parsed.getTime())) throw new Error("La fecha de inicio Wix no es válida.");
  return parsed.toISOString();
}

async function activateUser(user, requestedStartDate = "") {
  let email = String(user.correo || "").trim().toLowerCase();
  if (!email && user.studentId) {
    const student = await getFirestore().collection("students").doc(String(user.studentId)).get();
    const data = student.exists ? student.data() : {};
    email = String(data.wixEmail || data.email || (Array.isArray(data.emails) ? data.emails[0] : "") || "")
      .trim().toLowerCase();
  }
  if (!email) throw new Error("Falta el correo Wix.");
  const [member, plan] = await Promise.all([findMemberByEmail(email), findPlan(user.servicio)]);
  const startDate = wixStartDateIso(requestedStartDate);
  const checkout = {
    memberId: member.id,
    planId: plan.planId,
    paid: true
  };
  if (startDate) checkout.startDate = startDate;
  const result = await wixRequest("/pricing-plans/v2/checkout/orders/offline", checkout);
  const order = result.order || {};
  if (!order.id || !order.subscriptionId) {
    throw new Error("Wix respondió sin identificadores de orden y suscripción; no se confirmó la activación.");
  }
  // La creación por sí sola no es evidencia suficiente: leemos la orden desde
  // Wix y comprobamos que pertenece al miembro y plan solicitados.
  const verified = (await wixGet(`/pricing-plans/v2/orders/${encodeURIComponent(order.id)}`)).order || {};
  if (verified.id !== order.id || verified.planId !== plan.planId || verified.buyer?.memberId !== member.id) {
    throw new Error("La orden devuelta por Wix no coincide con el miembro o el plan solicitado.");
  }
  if (!verified.subscriptionId || !["ACTIVE", "PENDING"].includes(verified.status)) {
    throw new Error(`Wix no confirmó una suscripción activa (estado: ${verified.status || "sin estado"}).`);
  }
  return {
    status: "active",
    verified: true,
    correo: email,
    memberId: member.id,
    planId: plan.planId,
    planName: plan.planName,
    orderId: verified.id,
    subscriptionId: verified.subscriptionId,
    orderStatus: verified.status,
    requestedStartDate: requestedStartDate || "",
    wixStartDate: String(verified.startDate || startDate || ""),
    activatedAt: new Date().toISOString()
  };
}

// El trigger no lanza errores después de tomar el pago: así un reintento de
// Firestore nunca crea una segunda suscripción Wix. Los fallos se conservan
// en el documento para revisión y reactivación manual controlada.
exports.activateWixSubscriptions = onDocumentCreated(
  {
    document: "clientesB2C/{paymentId}",
    region: "us-central1",
    secrets: [WIX_API_KEY],
    retry: false
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    const db = getFirestore();
    const ref = snapshot.ref;
    const payment = snapshot.data();
    const users = Array.isArray(payment.usuarios) ? payment.usuarios : [];

    await ref.set({ wixActivation: { status: "processing", eventId: event.id, startedAt: FieldValue.serverTimestamp() } }, { merge: true });
    const results = [];
    for (const user of users) {
      try {
        results.push({ estudiante: user.estudiante || "", servicio: user.servicio || "", ...(await activateUser(user, payment.wixStartDate)) });
      } catch (error) {
        results.push({
          estudiante: user.estudiante || "",
          servicio: user.servicio || "",
          correo: String(user.correo || "").trim().toLowerCase(),
          status: "failed",
          error: String(error.message || error),
          failedAt: new Date().toISOString()
        });
      }
    }
    const failed = results.filter(item => item.status === "failed");
    await ref.set({
      wixActivation: {
        status: failed.length ? (failed.length === results.length ? "failed" : "partial") : "active",
        eventId: event.id,
        completedAt: FieldValue.serverTimestamp(),
        results
      }
    }, { merge: true });
  }
);

// Consulta y caché por estudiante. El navegador nunca recibe la llave de Wix:
// solo los datos mínimos para comparar la ficha con Registro.
exports.checkWixClasses = onCall(
  { region: "us-central1", secrets: [WIX_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    try {
      const caller = String(request.auth?.token?.email || "").trim().toLowerCase();
      if (!RIP_USERS.has(caller)) throw new HttpsError("permission-denied", "No tienes acceso a la conciliación con Wix.");
      const identity = await resolveWixContact(request.data?.studentId, request.data?.selectedWixContactId);
      if (identity.ambiguous) {
        return { status: 'WIX_CONTACT_AMBIGUOUS', correoWix: identity.correoWix, candidates: identity.candidates };
      }
      const contactId = identity.contactId;
      const pastDays = Math.min(180, Math.max(1, Number(request.data?.pastDays) || 45));
      const futureDays = Math.min(365, Math.max(1, Number(request.data?.futureDays) || 90));
      const cacheKey = createHash("sha256").update(`booking-v2|${contactId}|${pastDays}|${futureDays}`).digest("hex");
      const cacheRef = getFirestore().collection("wixClassChecks").doc(cacheKey);
      const cached = await cacheRef.get();
      const cachedData = cached.exists ? cached.data() : null;
      const checkedAtMs = Date.parse(cachedData?.checkedAt || "");
      const cacheMaxAge = 12 * 60 * 60 * 1000;
      if (Array.isArray(cachedData?.classes) && Number.isFinite(checkedAtMs) && Date.now() - checkedAtMs < cacheMaxAge) {
        return { classes: cachedData.classes, contactId, correoWix: identity.correoWix, wixContactName: identity.wixContactName || cachedData.wixContactName || "", wixPrimaryEmail: identity.wixPrimaryEmail || cachedData.wixPrimaryEmail || "", checkedAt: cachedData.checkedAt, pastDays, futureDays, source: "cache" };
      }
      const now = Date.now();
      const classes = await queryWixBookings(
        contactId,
        new Date(now - pastDays * 86400000).toISOString(),
        new Date(now + futureDays * 86400000).toISOString()
      );
      const checkedAt = new Date().toISOString();
      await cacheRef.set({ contactId, correoWix: identity.correoWix, wixContactName: identity.wixContactName || "", wixPrimaryEmail: identity.wixPrimaryEmail || "", classes, checkedAt, updatedAt: FieldValue.serverTimestamp() });
      return { classes, contactId, correoWix: identity.correoWix, wixContactName: identity.wixContactName || "", wixPrimaryEmail: identity.wixPrimaryEmail || "", checkedAt, pastDays, futureDays, source: "wix" };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error('checkWixClasses failed', error);
      throw new HttpsError('internal', String(error?.message || error || 'No se pudo consultar Wix.'));
    }
  }
);
