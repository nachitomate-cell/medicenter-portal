import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * POST /api/admin/disable
 * Body: { uid }
 *
 * "Eliminar" = desactivación lógica.
 * - Firebase Auth: disabled=true (no puede iniciar sesión)
 * - Firestore: status="disabled" (UI lo muestra como inactivo)
 * - Historial de pacientes intacto (cumplimiento normativo).
 *
 * Salvaguardas:
 * - No puede desactivarse a sí mismo
 * - No puede dejar el sistema sin admins activos
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.uid !== "string") {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  const { uid } = body;

  if (uid === auth.uid) {
    return NextResponse.json(
      { error: "No puedes desactivar tu propia cuenta" },
      { status: 400 },
    );
  }

  // Verificar que el usuario a desactivar no sea el último admin activo
  const targetDoc = await adminDb.collection("users").doc(uid).get();
  if (!targetDoc.exists) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (targetDoc.data()?.role === "admin") {
    const activeAdmins = await adminDb
      .collection("users")
      .where("role", "==", "admin")
      .where("status", "in", ["active", "invited"])
      .get();

    if (activeAdmins.size <= 1) {
      return NextResponse.json(
        { error: "No puedes desactivar al último admin activo" },
        { status: 400 },
      );
    }
  }

  try {
    await adminAuth.updateUser(uid, { disabled: true });
    await adminDb.collection("users").doc(uid).update({
      status: "disabled",
      disabledAt: FieldValue.serverTimestamp(),
      disabledBy: auth.uid,
    });
    // Revoca todos los refresh tokens — la sesión activa muere en <1h
    await adminAuth.revokeRefreshTokens(uid);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error desactivando usuario:", err);
    return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
  }
}
