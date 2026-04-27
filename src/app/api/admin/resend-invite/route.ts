import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/email";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

/**
 * POST /api/admin/resend-invite
 * Body: { uid }
 *
 * Re-genera el link de seteo de password y reenvía el email.
 * Solo aplicable a usuarios con status="invited" (que aún no han activado).
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

    const data = userDoc.data()!;
    if (data.status !== "invited") {
      return NextResponse.json(
        { error: `No se puede reenviar invitación a usuario con status "${data.status}"` },
        { status: 400 },
      );
    }

    const userRecord = await adminAuth.getUser(uid);
    const email = userRecord.email;
    if (!email) {
      return NextResponse.json({ error: "Usuario sin email" }, { status: 400 });
    }

    const setupLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
      handleCodeInApp: false,
    });

    await sendInvitationEmail({
      to: email,
      displayName: data.displayName,
      role: data.role,
      setupLink,
    });

    await adminDb.collection("users").doc(uid).update({
      lastInvitedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Error reenviando invitación:", err);
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
