/*
  Reconciliación masiva segura de RIP.

  Uso:
    node tools/reconcile-identities-bulk.js          # solo diagnóstico
    node tools/reconcile-identities-bulk.js --apply  # escribe los cambios

  Criterios:
  - asigna studentId únicamente si correo o nombre lleva a UN solo ID canónico;
  - los casos sin candidato se agrupan provisionalmente por nombre;
  - homónimos/conflictos se dejan intactos para conciliación manual.
*/
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const apply = process.argv.includes('--apply');
const configPath = path.join(process.env.USERPROFILE || '', '.config', 'configstore', 'firebase-tools.json');
const token = JSON.parse(fs.readFileSync(configPath, 'utf8'))?.tokens?.access_token;
if (!token) throw new Error('No hay una sesión local activa de Firebase. Ejecuta firebase login.');

const base = 'https://firestore.googleapis.com/v1/projects/rip-musicala/databases/(default)/documents';
const documentRoot = 'projects/rip-musicala/databases/(default)/documents';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const canonicalPattern = /^[A-Za-z0-9_-]{16,}$/;

function norm(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase().replace(/\s+/g, ' ');
}
function text(value) { return String(value || '').trim(); }
function value(field) {
  if (!field) return null;
  for (const key of ['stringValue', 'integerValue', 'doubleValue', 'booleanValue', 'timestampValue']) {
    if (field[key] !== undefined) return field[key];
  }
  if (field.arrayValue?.values) return field.arrayValue.values.map(value);
  return null;
}
function row(document) {
  return {
    id: document.name.split('/').pop(),
    ...Object.fromEntries(Object.entries(document.fields || {}).map(([key, field]) => [key, value(field)]))
  };
}
function add(index, key, id) {
  const normalized = norm(key);
  if (!normalized) return;
  if (!index.has(normalized)) index.set(normalized, new Set());
  index.get(normalized).add(id);
}
function unique(index, key) {
  const candidates = [...(index.get(norm(key)) || [])];
  return candidates.length === 1 ? candidates[0] : '';
}
async function queryCollection(collectionId) {
  const response = await fetch(`${base}:runQuery`, {
    method: 'POST', headers,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], limit: 10000 } })
  });
  if (!response.ok) throw new Error(`No se pudo leer ${collectionId}: ${response.status} ${await response.text()}`);
  return (await response.json()).filter(item => item.document).map(item => row(item.document));
}
function stringField(value) { return { stringValue: String(value || '') }; }
function arrayField(values) { return { arrayValue: { values: values.map(stringField) } }; }
async function batchWrite(writes) {
  const response = await fetch(`${base}:batchWrite`, {
    method: 'POST', headers, body: JSON.stringify({ writes })
  });
  if (!response.ok) throw new Error(`No se pudo escribir el lote: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const failed = (payload.status || []).filter(status => Number(status.code || 0) !== 0);
  if (failed.length) throw new Error(`${failed.length} escritura(s) fallaron.`);
}
async function writeAll(writes) {
  for (let start = 0; start < writes.length; start += 400) {
    const batch = writes.slice(start, start + 400);
    await batchWrite(batch);
    console.log(`Aplicados ${Math.min(start + batch.length, writes.length)} de ${writes.length}`);
  }
}

(async () => {
  const [students, records] = await Promise.all([queryCollection('students'), queryCollection('registro')]);
  // Una ficha sincronizada puede usar un auto-ID de Firestore o un correo
  // como ID canónico; ambos se aceptan si el propio documento lo declara.
  const canonical = students.filter(student =>
    text(student.studentId) === text(student.id) &&
    (student.identitySource === 'estudiantes-musicala' || canonicalPattern.test(student.id) || text(student.email))
  );
  const byEmail = new Map();
  const byName = new Map();
  for (const student of canonical) {
    add(byName, student.nameKey || student.estudianteKey || student.name || student.estudiante, student.id);
    for (const email of [...(Array.isArray(student.emails) ? student.emails : []), student.email, student.correo]) {
      add(byEmail, email, student.id);
    }
  }

  const writes = [];
  const summary = { canonical: 0, byEmail: 0, byName: 0, cleanedCanonical: 0, provisionalRecords: 0, provisionalGroups: new Set(), conflicts: 0, unchanged: 0 };
  for (const record of records) {
    const existing = text(record.studentId);
    if (existing && canonical.some(student => student.id === existing)) {
      // Una conciliación anterior pudo dejar el cluster provisional aunque
      // después llegara el ID oficial. Ya no debe aparecer como pendiente.
      if (text(record.identityClusterKey) || text(record.identityStatus) === 'provisional') {
        summary.cleanedCanonical++;
        writes.push({
          update: { name: `${documentRoot}/registro/${encodeURIComponent(record.id)}`, fields: {} },
          // Un campo incluido en updateMask pero omitido de fields se elimina.
          updateMask: { fieldPaths: ['identityClusterKey', 'identityStatus'] },
          updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
        });
      } else {
        summary.unchanged++;
      }
      continue;
    }
    const email = text(record.correo || record.email);
    const nameKey = norm(record.estudianteKey || record.estudiante);
    const emailCandidates = [...(byEmail.get(norm(email)) || [])];
    const nameCandidates = [...(byName.get(nameKey) || [])];
    const target = unique(byEmail, email) || unique(byName, nameKey);
    if (target) {
      const source = unique(byEmail, email) ? 'byEmail' : 'byName';
      summary[source]++;
      const linked = [...new Set([existing, text(record.estudianteKey), target].filter(Boolean))];
      writes.push({
        update: {
          name: `${documentRoot}/registro/${encodeURIComponent(record.id)}`,
          fields: {
            studentId: stringField(target),
            canonicalStudentId: stringField(target),
            linkedStudentIds: arrayField(linked)
          }
        },
        // Borrar cualquier cluster heredado, no reemplazarlo por texto vacío.
        updateMask: { fieldPaths: ['studentId', 'canonicalStudentId', 'linkedStudentIds', 'identityClusterKey', 'identityStatus'] },
        updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
      });
      continue;
    }
    if (emailCandidates.length > 1 || nameCandidates.length > 1) {
      summary.conflicts++;
      continue;
    }
    if (!nameKey) { summary.conflicts++; continue; }
    const cluster = `cluster:${nameKey}`;
    summary.provisionalRecords++;
    summary.provisionalGroups.add(cluster);
    writes.push({
      update: {
        name: `${documentRoot}/registro/${encodeURIComponent(record.id)}`,
        fields: {
          identityClusterKey: stringField(cluster),
          identityStatus: stringField('provisional')
        }
      },
      updateMask: { fieldPaths: ['identityClusterKey', 'identityStatus'] },
      updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }]
    });
  }
  summary.canonical = canonical.length;
  summary.provisionalGroups = summary.provisionalGroups.size;
  summary.totalWrites = writes.length;
  console.log(JSON.stringify(summary, null, 2));
  if (!apply) return;
  await writeAll(writes);
  console.log('Reconciliación masiva terminada. Los conflictos quedaron sin modificar para revisión manual.');
})().catch(error => { console.error(error); process.exitCode = 1; });
