import { type NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase-admin";

/**
 * Valida que el request venga de un admin autenticado.
 *
 * Flujo: el cliente envía el ID token de Firebase en el header
 * `Authorization: Bearer <token>`. Lo verificamos con Admin SDK,
 * obtenemos el uid, y leemos el rol desde Firestore.
 *
 * Retorna NextResponse de error si falla, o el uid si OK.
 */
export async function requireAdmin(req: NextRequest): Promise<
  | { ok: true; uid: string; email: string }
  | { ok: false; response: NextResponse }
> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Token requerido" }, { status: 401 }),
    };
  }

  const idToken = authHeader.slice(7);

  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Perfil no encontrado" }, { status: 403 }),
      };
    }

    const role = userDoc.data()?.role;
    if (role !== "admin") {
      return {
        ok: false,
        response: NextResponse.json({ error: "Requiere rol admin" }, { status: 403 }),
      };
    }

    return { ok: true, uid: decoded.uid, email: decoded.email ?? "" };
  } catch (err) {
    console.error("Token verification failed:", err);
    return {
      ok: false,
      response: NextResponse.json({ error: "Token inválido" }, { status: 401 }),
    };
  }
}
