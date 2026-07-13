/* =============================================================================
  rip.identity.js — Resolutor de identidad compartido de RIP.

  Contrato (ver DATA_CONTRACT.md en el repo de Bitácoras):
  - El studentId canónico es el ID del documento en
    estudiantes-musicala/estudiantes/{studentId}, replicado por Cloud Function
    hacia rip-musicala/students/{studentId} (directorio local de identidades).
  - `estudianteKey` (nombre normalizado) queda SOLO como alias de
    compatibilidad. Un studentId canónico se conserva tal cual: nunca se le
    aplica norm().

  Orden de resolución (Fase 2.3 del plan de integración):
    1. studentId explícito ya guardado.
    2. officialStudentId presente en la copia local rip-musicala/students.
    3. coincidencia ÚNICA por correo.
    4. (documento: no disponible de forma segura en el cliente; se resuelve
       en la migración backend con documentFingerprint).
    5. alias heredado (aliases[] del directorio local).
    6. nombre normalizado, ÚNICAMENTE como último recurso y si es único.

  Nunca asigna por nombre cuando hay más de un candidato: en ese caso
  devuelve ambiguous=true con los candidatos, para reporte manual.
============================================================================= */
(function (root) {
  'use strict';

  const state = {
    indexPromise: null,
    index: null
  };

  function toText(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  function norm(value) {
    return toText(value)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeEmail(value) {
    return toText(value).toLowerCase().replace(/\s+/g, '');
  }

  // Heurística de diagnóstico: un auto-ID de Firestore no se parece a un
  // nombre normalizado. La verdad la tiene el índice; esto es solo apoyo.
  function looksLikeCanonicalId(value) {
    const text = toText(value);
    return /^[A-Za-z0-9]{18,28}$/.test(text) && /[A-Z]/.test(text);
  }

  function buildIndex(students) {
    const byCanonicalId = new Map();
    const byNameKey = new Map();     // nameKey -> Set(canonicalId)
    const byEmail = new Map();       // email -> Set(canonicalId)
    const byAlias = new Map();       // alias heredado -> Set(canonicalId)

    const addTo = (map, key, canonicalId) => {
      const safeKey = toText(key);
      if (!safeKey || !canonicalId) return;
      if (!map.has(safeKey)) map.set(safeKey, new Set());
      map.get(safeKey).add(canonicalId);
    };

    for (const raw of students || []) {
      if (!raw) continue;
      const docId = toText(raw.id);
      const official = toText(raw.officialStudentId);
      // Solo el backend puede declarar una identidad canónica. La forma del
      // ID no basta: debe ser una copia sincronizada o un alias legado que ya
      // apunte explícitamente al officialStudentId.
      const canonicalId =
        (toText(raw.studentId) === docId && toText(raw.identitySource) === 'estudiantes-musicala')
          ? docId
          : official;

      if (!canonicalId) continue;

      const name = toText(raw.name || raw.estudiante);
      const nameKey = toText(raw.nameKey || raw.estudianteKey) || norm(name);

      const existing = byCanonicalId.get(canonicalId) || {
        studentId: canonicalId,
        name: '',
        nameKey: '',
        emails: [],
        aliases: []
      };
      if (name && (!existing.name || toText(raw.identitySource) === 'estudiantes-musicala')) {
        existing.name = name;
        existing.nameKey = nameKey;
      }
      const emails = Array.isArray(raw.emails) ? raw.emails : (raw.email ? [raw.email] : []);
      for (const email of emails) {
        const clean = normalizeEmail(email);
        if (clean && !existing.emails.includes(clean)) existing.emails.push(clean);
      }
      const aliases = Array.isArray(raw.aliases) ? raw.aliases : [];
      for (const alias of aliases) {
        const clean = toText(alias);
        if (clean && !existing.aliases.includes(clean)) existing.aliases.push(clean);
      }
      byCanonicalId.set(canonicalId, existing);

      addTo(byNameKey, nameKey, canonicalId);
      addTo(byNameKey, docId === canonicalId ? existing.nameKey : docId, canonicalId);
      for (const email of existing.emails) addTo(byEmail, email, canonicalId);
      for (const alias of existing.aliases) addTo(byAlias, alias, canonicalId);
    }

    return { byCanonicalId, byNameKey, byEmail, byAlias };
  }

  async function ensureIndex() {
    if (state.index) return state.index;
    if (!state.indexPromise) {
      const loadStudents = root.RIPRepository && root.RIPRepository.loadStudents;
      state.indexPromise = (loadStudents ? loadStudents() : Promise.resolve([]))
        .then((students) => {
          state.index = buildIndex(students || []);
          return state.index;
        })
        .catch((err) => {
          state.indexPromise = null;
          throw err;
        });
    }
    return state.indexPromise;
  }

  function invalidate() {
    state.index = null;
    state.indexPromise = null;
  }

  function uniqueMatch(setOrUndefined) {
    if (!setOrUndefined || setOrUndefined.size === 0) return { id: '', candidates: [] };
    const candidates = Array.from(setOrUndefined);
    return candidates.length === 1
      ? { id: candidates[0], candidates }
      : { id: '', candidates };
  }

  /*
    resolveWithIndex(index, hints) — resolución sincrónica con un índice ya
    construido (testeable en Node sin Firebase).
    hints: { studentId, officialStudentId, email, emails, name, aliases }
  */
  function resolveWithIndex(index, hints = {}) {
    const result = {
      studentId: '',
      estudianteKey: norm(hints.name || ''),
      source: 'unresolved',
      ambiguous: false,
      candidates: []
    };
    if (!index) return result;

    // 1. Un studentId explícito solo es válido si el directorio sincronizado
    // contiene exactamente esa identidad. La apariencia del ID nunca basta.
    const explicit = toText(hints.studentId);
    if (explicit && index.byCanonicalId.has(explicit)) {
      return { ...result, studentId: explicit, source: 'explicit' };
    }

    // 2. officialStudentId.
    const official = toText(hints.officialStudentId);
    if (official && index.byCanonicalId.has(official)) {
      return { ...result, studentId: official, source: 'officialStudentId' };
    }

    // 3. correo único.
    const emails = []
      .concat(Array.isArray(hints.emails) ? hints.emails : [])
      .concat(hints.email ? [hints.email] : [])
      .map(normalizeEmail)
      .filter(Boolean);
    for (const email of emails) {
      const match = uniqueMatch(index.byEmail.get(email));
      if (match.id) return { ...result, studentId: match.id, source: 'email' };
      if (match.candidates.length > 1) {
        return { ...result, ambiguous: true, candidates: match.candidates, source: 'email_ambiguous' };
      }
    }

    // 5. alias heredado.
    const aliases = (Array.isArray(hints.aliases) ? hints.aliases : [])
      .concat(explicit ? [explicit] : [])
      .map(toText)
      .filter(Boolean);
    for (const alias of aliases) {
      const match = uniqueMatch(index.byAlias.get(alias));
      if (match.id) return { ...result, studentId: match.id, source: 'alias' };
      if (match.candidates.length > 1) {
        return { ...result, ambiguous: true, candidates: match.candidates, source: 'alias_ambiguous' };
      }
    }

    // 6. nombre normalizado, último recurso y solo si es único.
    const nameKey = norm(hints.name || '');
    if (nameKey) {
      const match = uniqueMatch(index.byNameKey.get(nameKey));
      if (match.id) return { ...result, studentId: match.id, source: 'nameKey' };
      if (match.candidates.length > 1) {
        return { ...result, ambiguous: true, candidates: match.candidates, source: 'name_ambiguous' };
      }
    }

    return result;
  }

  async function resolveStudentId(hints = {}) {
    const index = await ensureIndex().catch(() => null);
    return resolveWithIndex(index, hints);
  }

  /*
    Llave de documento para students/programacion/studentComputed:
    - si el valor ya es un studentId canónico conocido, se usa tal cual
      (NUNCA se le aplica norm());
    - si el nombre mapea a un canónico único, se prefiere el canónico;
    - en cualquier otro caso se conserva el nameKey actual (compatibilidad).
  */
  function resolveDocKeyWithIndex(index, nameOrKey) {
    const text = toText(nameOrKey);
    if (!text) return '';
    if (index && index.byCanonicalId.has(text)) return text;
    // Un ID con forma canónica pero ausente del índice no se transforma en
    // nameKey ni se acepta como identidad alternativa.
    if (looksLikeCanonicalId(text)) return '';
    const nameKey = norm(text);
    if (index) {
      const match = uniqueMatch(index.byNameKey.get(nameKey));
      if (match.id) return match.id;
    }
    return nameKey;
  }

  async function resolveDocKey(nameOrKey) {
    const index = await ensureIndex().catch(() => null);
    return resolveDocKeyWithIndex(index, nameOrKey);
  }

  const api = {
    buildIndex,
    ensureIndex,
    invalidate,
    resolveWithIndex,
    resolveStudentId,
    resolveDocKey,
    resolveDocKeyWithIndex,
    looksLikeCanonicalId,
    norm,
    normalizeEmail
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // pruebas en Node
  }
  if (root) {
    root.RIPIdentity = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
