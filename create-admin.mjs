/**
 * Bootstrap: crea el primer usuario admin.
 * Uso: node create-admin.mjs <email> <nombre>
 * Ejemplo: node create-admin.mjs admin@clinica.com "Dr. Admin"
 *
 * Si el usuario ya existe en Firebase Auth, solo crea/actualiza el doc en Firestore.
 * Borrar este archivo después de usarlo.
 */

import { readFileSync } from 'fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── Leer .env.local ───────────────────────────────────────────────────────
const envRaw = readFileSync(new URL('.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envRaw.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx === -1) continue;
  const key = trimmed.slice(0, idx).trim();
  let val = trimmed.slice(idx + 1).trim();
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const privateKey = env['FIREBASE_ADMIN_PRIVATE_KEY']?.replace(/\\n/g, '\n');
const clientEmail = env['FIREBASE_ADMIN_CLIENT_EMAIL'];
const projectId = env['FIREBASE_ADMIN_PROJECT_ID'];

// ─── Args ──────────────────────────────────────────────────────────────────
const [,, email, displayName] = process.argv;
if (!email || !displayName) {
  console.error('Uso: node create-admin.mjs <email> "<nombre completo>"');
  process.exit(1);
}

// ─── Init ──────────────────────────────────────────────────────────────────
initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
const auth = getAuth();
const db = getFirestore();

// ─── Buscar o crear usuario en Auth ───────────────────────────────────────
let uid;
try {
  const existing = await auth.getUserByEmail(email);
  uid = existing.uid;
  console.log(`Usuario encontrado en Auth: ${uid}`);
} catch {
  // No existe → crear con password temporal
  const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  const created = await auth.createUser({ email, password: tempPassword, displayName });
  uid = created.uid;

  // Generar link para que el usuario setee su propia contraseña
  const resetLink = await auth.generatePasswordResetLink(email, {
    url: `${env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'}/login`,
  });
  console.log(`Usuario creado en Auth: ${uid}`);
  console.log(`\nLink para setear contraseña:\n${resetLink}\n`);
}

// ─── Crear/sobrescribir perfil en Firestore ────────────────────────────────
await db.collection('users').doc(uid).set({
  email,
  displayName,
  role: 'admin',
  status: 'active',
  invitedBy: 'bootstrap',
  invitedAt: FieldValue.serverTimestamp(),
  activatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`✓ Perfil admin creado en Firestore para ${email}`);
console.log('  Podés iniciar sesión en http://localhost:3000');
console.log('\n  Borrá este archivo cuando termines: del create-admin.mjs');
