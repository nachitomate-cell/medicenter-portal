import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const VALID_ROLES = ["admin", "doctor", "secretary"] as const;

/**
 * POST /api/admin/update-role
 * Body: { uid, role }
 *
 * Salvaguarda: un admin no puede degradarse a sí mismo si es el último admin.
 * Esto previene quedar bloqueado fuera del panel.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Body inválido" }, { status: 400 });

  const { uid, role } = body;
  if (typeof uid !== "string" || !VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  // Salvaguarda: si el admin se está degradando a sí mismo, verificar que no sea el último
  if (uid === auth.uid && role !== "admin") {
    const adminsSnapshot = await adminDb
      .collection("users")
      .where("role", "==", "admin")
      .where("status", "in", ["active", "invited"])
      .get();

    if (adminsSnapshot.size <= 1) {
      return NextResponse.json(
        { error: "No puedes degradarte: eres el único admin activo" },
        { status: 400 },
      );
    }
  }

  try {
    await adminDb.collection("users").doc(uid).update({
      role,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: auth.uid,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error actualizando rol:", err);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
