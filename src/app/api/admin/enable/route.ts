import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * POST /api/admin/enable
 * Body: { uid }
 *
 * Reactiva una cuenta previamente desactivada.
 * Restaura status según corresponda: si nunca activó, "invited"; si sí, "active".
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.uid !== "string") {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { uid } = body;

  try {
    const userDoc = await adminDb.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Si ya activó la cuenta antes, vuelve a "active". Si no, sigue como "invited".
    const wasActivated = userDoc.data()?.activatedAt != null;
    const newStatus = wasActivated ? "active" : "invited";

    await adminAuth.updateUser(uid, { disabled: false });
    await adminDb.collection("users").doc(uid).update({
      status: newStatus,
      enabledAt: FieldValue.serverTimestamp(),
      enabledBy: auth.uid,
    });

    return NextResponse.json({ ok: true, status: newStatus });
  } catch (err) {
    console.error("Error reactivando usuario:", err);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
