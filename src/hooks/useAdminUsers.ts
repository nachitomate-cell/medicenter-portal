"use client";

import { useState, useCallback, useEffect } from "react";
import { auth } from "@/lib/firebase";
import type { UserRole } from "@/types";

export interface AdminUserView {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: "invited" | "active" | "disabled";
  invitedAt: string | null;
  activatedAt: string | null;
  disabledAt: string | null;
  lastInvitedAt: string | null;
  lastSignInTime: string | null;
  creationTime: string | null;
  invitedBy?: string;
}

/**
 * Helper para llamadas autenticadas a /api/admin/*.
 * Adjunta el ID token actual en el header Authorization.
 */
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("No autenticado");
  const token = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

/** Centraliza el manejo de respuesta + parsing de error. */
async function handleResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return data as T;
}

/**
 * Hook que combina lista de usuarios + acciones de admin.
 *
 * No usamos onSnapshot aquí porque necesitamos metadata de Auth
 * (lastSignInTime) que solo viene del Admin SDK. Refrescamos manual
 * tras cada acción y exponemos `refresh()` para uso explícito.
 */
export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await authedFetch("/api/admin/users");
      const data = await handleResponse<{ users: AdminUserView[] }>(res);
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const invite = async (params: { email: string; displayName: string; role: UserRole }) => {
    const res = await authedFetch("/api/admin/invite", {
      method: "POST",
      body: JSON.stringify(params),
    });
    await handleResponse<{ ok: true }>(res);
    await refresh();
  };

  const updateRole = async (uid: string, role: UserRole) => {
    const res = await authedFetch("/api/admin/update-role", {
      method: "POST",
      body: JSON.stringify({ uid, role }),
    });
    await handleResponse<{ ok: true }>(res);
    await refresh();
  };

  const disable = async (uid: string) => {
    const res = await authedFetch("/api/admin/disable", {
      method: "POST",
      body: JSON.stringify({ uid }),
    });
    await handleResponse<{ ok: true }>(res);
    await refresh();
  };

  const enable = async (uid: string) => {
    const res = await authedFetch("/api/admin/enable", {
      method: "POST",
      body: JSON.stringify({ uid }),
    });
    await handleResponse<{ ok: true }>(res);
    await refresh();
  };

  const resendInvite = async (uid: string) => {
    const res = await authedFetch("/api/admin/resend-invite", {
      method: "POST",
      body: JSON.stringify({ uid }),
    });
    await handleResponse<{ ok: true }>(res);
    await refresh();
  };

  return {
    users,
    loading,
    error,
    refresh,
    invite,
    updateRole,
    disable,
    enable,
    resendInvite,
  };
}
