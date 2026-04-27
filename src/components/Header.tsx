"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

/**
 * Header común. Muestra navegación entre vistas a las que el usuario
 * tiene acceso por su rol. Admin ve los tres; otros solo su sección.
 */
export default function Header({ context }: { context: string }) {
  const { user, signOutUser } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOutUser();
    router.replace("/login");
  };

  // Determina qué links mostrar según rol
  const links: { href: string; label: string }[] = [];
  if (user?.role === "admin") {
    links.push(
      { href: "/admin", label: "Admin" },
      { href: "/secretary", label: "Secretaría" },
      { href: "/doctor", label: "Médico" },
    );
  }

  return (
    <header className="border-b border-paper px-8 py-5 flex items-center justify-between">
      <div className="flex items-baseline gap-6">
        <Link href="/" className="font-display text-h3 tracking-tight hover:opacity-80 transition-opacity">
          Medicenter
        </Link>
        <span className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
          / {context}
        </span>
      </div>

      <div className="flex items-center gap-6">
        {links.length > 0 && (
          <nav className="flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "font-mono text-micro uppercase tracking-[0.2em] px-3 py-1 transition-colors",
                  pathname === link.href ? "bg-paper text-ink" : "hover:bg-paper/10",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
        <span className="font-mono text-caption text-paper/60">
          {user?.displayName ?? user?.email}
        </span>
        <button
          onClick={handleSignOut}
          className="font-mono text-micro uppercase tracking-[0.2em] hover:underline"
        >
          Cerrar sesión
        </button>
      </div>
    </header>
  );
}
