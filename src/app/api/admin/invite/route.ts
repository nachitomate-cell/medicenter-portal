import { NextResponse, type NextRequest } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
import { requireAdmin } from "@/lib/api-auth";
import { sendInvitationEmail } from "@/lib/email";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs"; // Admin SDK requiere Node, no Edge

const VALID_ROLES = ["admin", "doctor", "secretary"] as const;

/**
 * POST /api/admin/invite
 * Body: { email, displayName, role }
 *
 * Flujo:
 * 1. Crea usuario en Firebase Auth (con password temporal random — el usuario nunca la verá)
 * 2. Crea perfil en Firestore con status "invited"
 * 3. Genera link de reset password — el usuario lo usa para definir su clave
 * 4. Envía email con el link
 *
 * Si falla el email, hacemos rollback (borrar Auth user + Firestore doc).
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { email, displayName, role } = body;

  // Validaciones
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (typeof displayName !== "string" || displayName.trim().length < 2) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  // ¿Ya existe?
  try {
    await adminAuth.getUserByEmail(email);
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese email" },
      { status: 409 },
    );
  } catch (err: unknown) {
    // auth/user-not-found = OK, continuamos
    const code = (err as { code?: string })?.code;
    if (code !== "auth/user-not-found") {
      console.error("Error consultando usuario:", err);
      return NextResponse.json({ error: "Error de servidor" }, { status: 500 });
    }
  }

  let createdUid: string | null = null;

  try {
    // 1. Crear usuario en Auth con password temporal aleatorio
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();
    const userRecord = await adminAuth.createUser({
      email,
      password: tempPassword,
      displayName: displayName.trim(),
      disabled: false,
    });
    createdUid = userRecord.uid;

    // 2. Crear perfil en Firestore
    await adminDb.collection("users").doc(userRecord.uid).set({
      email,
      displayName: displayName.trim(),
      role,
      status: "invited", // "invited" | "active" | "disabled"
      invitedBy: auth.uid,
      invitedAt: FieldValue.serverTimestamp(),
      activatedAt: null,
    });

    // 3. Generar link de seteo de password
    const setupLink = await adminAuth.generatePasswordResetLink(email, {
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/login`,
      handleCodeInApp: false,
    });

    // 4. Enviar email
    await sendInvitationEmail({
      to: email,
      displayName: displayName.trim(),
      role,
      setupLink,
    });

    return NextResponse.json({ ok: true, uid: userRecord.uid });
  } catch (err) {
    // Rollback: si fallamos después de crear, limpiamos
    console.error("Error en invite:", err);
    if (createdUid) {
      await adminAuth.deleteUser(createdUid).catch(() => {});
      await adminDb.collection("users").doc(createdUid).delete().catch(() => {});
    }
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
