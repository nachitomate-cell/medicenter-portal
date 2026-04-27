import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin SDK — solo para uso server-side (API routes).
 *
 * NUNCA importar desde un Client Component. La service account key
 * tiene permisos totales sobre el proyecto; si llegara al bundle del
 * navegador es un compromiso de seguridad mayor.
 *
 * Idempotente: getApps() previene re-inicialización en HMR.
 */

function buildCredentials() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Variables FIREBASE_ADMIN_* faltantes. Revisa .env.local — necesitas la service account de Firebase."
    );
  }

  return {
    projectId,
    clientEmail,
    // En .env.local la private key viene con \n escapados; los reemplazamos.
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

const adminApp: App =
  getApps().length === 0 ? initializeApp({ credential: cert(buildCredentials()) }) : getApps()[0];

export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = getFirestore(adminApp);
export default adminApp;
