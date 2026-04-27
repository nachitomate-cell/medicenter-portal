"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/types";

interface RoleGuardProps {
  allow: UserRole[];
  children: ReactNode;
}

/**
 * RoleGuard — protege una página exigiendo uno de los roles permitidos.
 * Redirige a /login si no hay sesión, o a / si el rol no calza.
 */
export default function RoleGuard({ allow, children }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (!allow.includes(user.role)) {
      router.replace("/");
    }
  }, [user, loading, allow, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
          Verificando acceso...
        </p>
      </div>
    );
  }

  if (!allow.includes(user.role)) {
    return null;
  }

  return <>{children}</>;
}
