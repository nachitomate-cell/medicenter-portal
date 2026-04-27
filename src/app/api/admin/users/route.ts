import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";

export const runtime = "nodejs";

/**
 * GET /api/admin/users
 *
 * Devuelve los usuarios con metadata combinada de Firestore + Firebase Auth.
 * Auth nos da `lastSignInTime` y `creationTime` gratis — no necesitamos
 * tabla de auditoría custom para "últimos logins".
 *
 * Nota: hace fetch en lote — para >1000 usuarios habría que paginar.
 * Para el MVP de una clínica esto está sobrado.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const usersSnapshot = await adminDb.collection("users").get();
    const userDocs = usersSnapshot.docs.map((doc) => ({
      uid: doc.id,
      ...doc.data(),
    }));

    // Trae metadata de Auth para cada uid en paralelo
    const authData = await Promise.all(
      userDocs.map(async (u) => {
        try {
          const record = await adminAuth.getUser(u.uid);
          return {
            uid: u.uid,
            lastSignInTime: record.metadata.lastSignInTime || null,
            creationTime: record.metadata.creationTime,
            authDisabled: record.disabled,
          };
        } catch {
          // Usuario en Firestore sin contraparte en Auth — corner case
          return { uid: u.uid, lastSignInTime: null, creationTime: null, authDisabled: false };
        }
      }),
    );

    const authMap = new Map(authData.map((a) => [a.uid, a]));

    const merged = userDocs.map((u) => {
      const authMeta = authMap.get(u.uid);
      return {
        ...u,
        lastSignInTime: authMeta?.lastSignInTime ?? null,
        creationTime: authMeta?.creationTime ?? null,
        // Convertimos timestamps de Firestore a ISO para JSON
        invitedAt: serializeTimestamp((u as Record<string, unknown>).invitedAt),
        activatedAt: serializeTimestamp((u as Record<string, unknown>).activatedAt),
        disabledAt: serializeTimestamp((u as Record<string, unknown>).disabledAt),
        lastInvitedAt: serializeTimestamp((u as Record<string, unknown>).lastInvitedAt),
      };
    });

    return NextResponse.json({ users: merged });
  } catch (err) {
    console.error("Error listando usuarios:", err);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}

function serializeTimestamp(value: unknown): string | null {
  if (!value) return null;
  // Firestore Timestamp tiene toDate()
  if (typeof value === "object" && value !== null && "toDate" in value) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}
