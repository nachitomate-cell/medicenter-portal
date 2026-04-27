"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { AppUser, UserRole, AccountStatus } from "@/types";

interface AuthContextValue {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppUser>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * AuthProvider — encapsula auth + lectura del rol desde Firestore.
 *
 * Decisión: el rol vive en `users/{uid}.role`. Para producción real,
 * migrar a Firebase Custom Claims (vía Cloud Function) para que el rol
 * sea verificable en las reglas de Firestore/Storage sin lecturas extra.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser: User | null) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      // Leemos el doc del usuario para obtener el rol.
      const userDocRef = doc(db, "users", fbUser.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        // Usuario autenticado pero sin perfil — fuerza logout.
        // En un MVP esto no debería pasar; en producción registra error.
        console.error("Usuario sin perfil en Firestore");
        await signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }

      const data = userDoc.data();
      const status: AccountStatus = data.status ?? "active";

      // Bloquear cuentas desactivadas a nivel de cliente.
      // Defensa en profundidad — el Auth SDK ya bloquea cuentas con disabled=true,
      // pero esto cubre el caso donde sólo cambió el flag de Firestore.
      if (status === "disabled") {
        await signOut(auth);
        setUser(null);
        setLoading(false);
        return;
      }

      // Si entra por primera vez (invited → active), actualizar Firestore
      if (status === "invited") {
        await updateDoc(userDocRef, {
          status: "active",
          activatedAt: serverTimestamp(),
        }).catch((err) => console.error("Error activando cuenta:", err));
      }

      setUser({
        uid: fbUser.uid,
        email: fbUser.email ?? "",
        role: data.role as UserRole,
        displayName: data.displayName,
        status: status === "invited" ? "active" : status,
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<AppUser> => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userDoc = await getDoc(doc(db, "users", cred.user.uid));
    if (!userDoc.exists()) {
      await signOut(auth);
      throw new Error("Cuenta sin perfil asignado. Contacta al administrador.");
    }
    const data = userDoc.data();
    if (data.status === "disabled") {
      await signOut(auth);
      throw new Error("Esta cuenta está desactivada. Contacta al administrador.");
    }
    return {
      uid: cred.user.uid,
      email: cred.user.email ?? "",
      role: data.role as UserRole,
      displayName: data.displayName,
      status: data.status,
    };
  };

  const signOutUser = async () => {
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
