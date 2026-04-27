"use client";

import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminUsers, type AdminUserView } from "@/hooks/useAdminUsers";
import { cn, timeAgo } from "@/lib/utils";
import type { UserRole } from "@/types";

type StatusFilter = "all" | "invited" | "active" | "disabled";

/**
 * AdminPanel — Gestión de usuarios.
 *
 * Layout: tabla a pantalla completa + drawer lateral para invitar/editar.
 * El admin pasa la mayor parte del tiempo escaneando la tabla, así que
 * la jerarquía visual premia los datos sobre los controles.
 */
export default function AdminPanel() {
  const { user: currentUser } = useAuth();
  const { users, loading, error, invite, updateRole, disable, enable, resendInvite } =
    useAdminUsers();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return users
      .filter((u) => filter === "all" || u.status === filter)
      .filter((u) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          u.email.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q)
        );
      });
  }, [users, filter, search]);

  const counts = useMemo(
    () => ({
      all: users.length,
      invited: users.filter((u) => u.status === "invited").length,
      active: users.filter((u) => u.status === "active").length,
      disabled: users.filter((u) => u.status === "disabled").length,
    }),
    [users],
  );

  const wrapAction = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Error");
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Toolbar superior */}
      <section className="border-b border-paper px-8 py-6">
        <div className="flex items-end justify-between gap-6 mb-6">
          <div>
            <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 mb-2">
              Administración
            </p>
            <h2 className="font-display text-h1 leading-none">Usuarios</h2>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
            className="bg-paper text-ink px-6 py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors"
          >
            + Invitar usuario
          </button>
        </div>

        {/* Tabs de status + búsqueda */}
        <div className="flex items-center justify-between gap-6">
          <div className="flex border border-paper">
            <FilterTab
              label="Todos"
              count={counts.all}
              active={filter === "all"}
              onClick={() => setFilter("all")}
            />
            <FilterTab
              label="Pendientes"
              count={counts.invited}
              active={filter === "invited"}
              onClick={() => setFilter("invited")}
            />
            <FilterTab
              label="Activos"
              count={counts.active}
              active={filter === "active"}
              onClick={() => setFilter("active")}
            />
            <FilterTab
              label="Desactivados"
              count={counts.disabled}
              active={filter === "disabled"}
              onClick={() => setFilter("disabled")}
            />
          </div>
          <input
            type="search"
            placeholder="Buscar por nombre o email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-paper px-4 py-2 font-mono text-body w-72 focus:outline-none placeholder:text-paper/30"
          />
        </div>
      </section>

      {/* Tabla */}
      <section className="flex-1">
        {actionError && (
          <div className="border-b border-paper px-8 py-4 animate-fade-in">
            <p className="font-mono text-caption uppercase tracking-wider mb-1">Error</p>
            <p className="font-mono text-body">{actionError}</p>
          </div>
        )}

        {loading && (
          <div className="p-12 text-center font-mono text-caption uppercase tracking-wider text-paper/60">
            Cargando usuarios...
          </div>
        )}
        {error && (
          <div className="p-8 border-b border-paper">
            <p className="font-mono text-caption uppercase tracking-wider mb-1">
              Error de carga
            </p>
            <p className="font-mono text-body">{error}</p>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="p-16 text-center">
            <p className="font-display text-h3 text-paper/60">Sin resultados</p>
          </div>
        )}

        {filtered.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-paper">
                <Th>Usuario</Th>
                <Th>Rol</Th>
                <Th>Status</Th>
                <Th>Último ingreso</Th>
                <Th>Creado</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <UserRow
                  key={u.uid}
                  user={u}
                  isSelf={u.uid === currentUser?.uid}
                  onUpdateRole={(role) => wrapAction(() => updateRole(u.uid, role))}
                  onDisable={() => wrapAction(() => disable(u.uid))}
                  onEnable={() => wrapAction(() => enable(u.uid))}
                  onResendInvite={() => wrapAction(() => resendInvite(u.uid))}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Drawer de invitación */}
      {inviteOpen && (
        <InviteDrawer
          onClose={() => setInviteOpen(false)}
          onInvite={async (params) => {
            await invite(params);
            setInviteOpen(false);
          }}
        />
      )}
    </div>
  );
}

/* ────────── Subcomponentes ────────── */

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "font-mono text-micro uppercase tracking-[0.2em] text-paper/60 px-6 py-3 font-normal",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function FilterTab({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-4 py-2 font-mono text-micro uppercase tracking-[0.15em] transition-colors border-r border-paper last:border-r-0",
        active ? "bg-paper text-ink" : "hover:bg-paper/10",
      )}
    >
      {label}
      <span className="ml-2 tabular-nums opacity-60">[{count}]</span>
    </button>
  );
}

function UserRow({
  user,
  isSelf,
  onUpdateRole,
  onDisable,
  onEnable,
  onResendInvite,
}: {
  user: AdminUserView;
  isSelf: boolean;
  onUpdateRole: (role: UserRole) => Promise<void>;
  onDisable: () => Promise<void>;
  onEnable: () => Promise<void>;
  onResendInvite: () => Promise<void>;
}) {
  const [editingRole, setEditingRole] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [busy, setBusy] = useState(false);

  const lastSignIn = user.lastSignInTime ? new Date(user.lastSignInTime) : null;
  const created = user.creationTime ? new Date(user.creationTime) : null;

  const wrapBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className={cn("border-b border-paper transition-colors hover:bg-paper/5", busy && "opacity-50")}>
      {/* Usuario */}
      <td className="px-6 py-4">
        <p className="font-display text-lead">
          {user.displayName}
          {isSelf && (
            <span className="ml-2 font-mono text-micro uppercase tracking-[0.15em] text-paper/50">
              (tú)
            </span>
          )}
        </p>
        <p className="font-mono text-caption text-paper/60 mt-0.5">{user.email}</p>
      </td>

      {/* Rol — editable inline */}
      <td className="px-6 py-4">
        {editingRole ? (
          <select
            value={user.role}
            onChange={async (e) => {
              await wrapBusy(() => onUpdateRole(e.target.value as UserRole));
              setEditingRole(false);
            }}
            onBlur={() => setEditingRole(false)}
            autoFocus
            disabled={busy}
            className="border border-paper bg-ink font-mono text-caption px-2 py-1 focus:outline-none"
          >
            <option value="admin">admin</option>
            <option value="doctor">doctor</option>
            <option value="secretary">secretary</option>
          </select>
        ) : (
          <button
            onClick={() => setEditingRole(true)}
            className="font-mono text-caption uppercase tracking-wider border border-paper px-2 py-1 hover:bg-paper hover:text-ink transition-colors"
          >
            {user.role}
          </button>
        )}
      </td>

      {/* Status */}
      <td className="px-6 py-4">
        <StatusBadge status={user.status} />
      </td>

      {/* Último ingreso */}
      <td className="px-6 py-4 font-mono text-caption text-paper/70">
        {lastSignIn ? timeAgo(lastSignIn) : "—"}
      </td>

      {/* Creado */}
      <td className="px-6 py-4 font-mono text-caption text-paper/70">
        {created ? timeAgo(created) : "—"}
      </td>

      {/* Acciones */}
      <td className="px-6 py-4 text-right whitespace-nowrap">
        <div className="inline-flex items-center gap-2">
          {user.status === "invited" && (
            <ActionButton
              onClick={() => wrapBusy(onResendInvite)}
              disabled={busy}
            >
              Reenviar
            </ActionButton>
          )}

          {user.status === "disabled" ? (
            <ActionButton onClick={() => wrapBusy(onEnable)} disabled={busy}>
              Reactivar
            </ActionButton>
          ) : !isSelf && (
            confirmDisable ? (
              <>
                <ActionButton
                  onClick={async () => {
                    await wrapBusy(onDisable);
                    setConfirmDisable(false);
                  }}
                  disabled={busy}
                  variant="solid"
                >
                  Confirmar
                </ActionButton>
                <ActionButton onClick={() => setConfirmDisable(false)} disabled={busy}>
                  Cancelar
                </ActionButton>
              </>
            ) : (
              <ActionButton
                onClick={() => setConfirmDisable(true)}
                disabled={busy}
              >
                Desactivar
              </ActionButton>
            )
          )}
        </div>
      </td>
    </tr>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = "outline",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "outline" | "solid";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "px-3 py-1.5 font-mono text-micro uppercase tracking-[0.15em] transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
        variant === "solid"
          ? "bg-paper text-ink hover:bg-paper/90"
          : "border border-paper hover:bg-paper hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: AdminUserView["status"] }) {
  const labels = {
    invited: "Pendiente",
    active: "Activo",
    disabled: "Desactivado",
  };
  // Variación visual: pendiente con borde punteado, desactivado con strikethrough sutil
  return (
    <span
      className={cn(
        "inline-block font-mono text-micro uppercase tracking-[0.15em] px-2 py-0.5 border",
        status === "invited" && "border-dashed border-paper",
        status === "active" && "border-paper",
        status === "disabled" && "border-paper/40 text-paper/40 line-through",
      )}
    >
      {labels[status]}
    </span>
  );
}

/* ────────── Drawer de invitación ────────── */

function InviteDrawer({
  onClose,
  onInvite,
}: {
  onClose: () => void;
  onInvite: (params: { email: string; displayName: string; role: UserRole }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("doctor");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await onInvite({ email, displayName, role });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <aside
        className="absolute right-0 top-0 bottom-0 w-full max-w-md border-l border-paper bg-ink overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-paper px-8 py-6 flex items-center justify-between">
          <div>
            <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
              Nueva invitación
            </p>
            <h3 className="font-display text-h2 mt-1">Invitar</h3>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-caption uppercase tracking-wider hover:underline"
          >
            Cerrar
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-8 space-y-8">
          <div>
            <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 block mb-2">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitting}
              placeholder="doctor@medicenter.cl"
              className="w-full bg-transparent border-0 border-b border-paper py-2 font-mono text-body focus:outline-none placeholder:text-paper/30"
            />
          </div>

          <div>
            <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 block mb-2">
              Nombre completo
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              placeholder="Dra. Pérez"
              className="w-full bg-transparent border-0 border-b border-paper py-2 font-display text-h3 focus:outline-none placeholder:text-paper/30"
            />
          </div>

          <div>
            <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 block mb-3">
              Rol
            </label>
            <div className="space-y-px">
              <RoleOption
                value="doctor"
                checked={role === "doctor"}
                onChange={setRole}
                title="Médico"
                desc="Ve la cola en tiempo real, previsualiza y atiende pacientes."
              />
              <RoleOption
                value="secretary"
                checked={role === "secretary"}
                onChange={setRole}
                title="Secretaría"
                desc="Carga pacientes y sube archivos al sistema."
              />
              <RoleOption
                value="admin"
                checked={role === "admin"}
                onChange={setRole}
                title="Administrador"
                desc="Gestiona usuarios y tiene acceso completo al portal."
              />
            </div>
          </div>

          {error && (
            <div className="border border-paper p-4 animate-fade-in">
              <p className="font-mono text-caption uppercase tracking-wider mb-1">Error</p>
              <p className="font-mono text-body break-words">{error}</p>
            </div>
          )}

          <div className="border-t border-paper pt-6">
            <p className="font-mono text-micro text-paper/50 mb-4 leading-relaxed">
              Al enviar, se creará la cuenta y recibirá un email para definir su contraseña.
              El enlace expira en 1 hora — puedes reenviarlo desde la lista.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-paper text-ink py-3 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors disabled:opacity-30"
            >
              {submitting ? "Enviando invitación..." : "Enviar invitación →"}
            </button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function RoleOption({
  value,
  checked,
  onChange,
  title,
  desc,
}: {
  value: UserRole;
  checked: boolean;
  onChange: (v: UserRole) => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={cn(
        "block border border-paper p-4 cursor-pointer transition-colors",
        checked ? "bg-paper text-ink" : "hover:bg-paper/5",
      )}
    >
      <input
        type="radio"
        name="role"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <div className="flex items-start gap-3">
        {/* Radio custom */}
        <span
          className={cn(
            "mt-1 w-3 h-3 border flex-shrink-0",
            checked ? "border-ink bg-ink" : "border-paper",
          )}
        />
        <div>
          <p className="font-mono text-caption uppercase tracking-[0.15em] mb-1">{title}</p>
          <p className={cn("font-mono text-micro leading-relaxed", checked ? "text-ink/70" : "text-paper/60")}>
            {desc}
          </p>
        </div>
      </div>
    </label>
  );
}
