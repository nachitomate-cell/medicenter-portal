"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = await signIn(email, password);
      if (u.role === "admin") router.replace("/admin");
      else if (u.role === "doctor") router.replace("/doctor");
      else router.replace("/secretary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Lado izquierdo: marca */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r border-paper stark-grid">
        <div>
          <p className="font-mono text-micro uppercase tracking-[0.25em] text-paper/60">
            Portal · Medicenter
          </p>
        </div>
        <div>
          <h1 className="font-display text-h1 leading-none mb-4">
            Imagenología,
            <br />
            sin fricción.
          </h1>
          <p className="font-mono text-caption text-paper/60 max-w-sm">
            Gestión clínica entre secretaría y médico tratante en tiempo real.
          </p>
        </div>
        <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/40">
          v0.1 · MVP
        </p>
      </div>

      {/* Lado derecho: form */}
      <div className="flex items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <p className="font-mono text-micro uppercase tracking-[0.25em] text-paper/60 mb-3">
            Acceso
          </p>
          <h2 className="font-display text-h2 mb-12">Inicia sesión</h2>

          <div className="space-y-8">
            <div>
              <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 block mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="w-full bg-transparent border-0 border-b border-paper py-2 font-mono text-body focus:outline-none disabled:opacity-40"
              />
            </div>
            <div>
              <label className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60 block mb-2">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                className="w-full bg-transparent border-0 border-b border-paper py-2 font-mono text-body focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>

          {error && (
            <div className="border border-paper p-4 mt-8 animate-fade-in">
              <p className="font-mono text-caption">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-paper text-ink py-3 mt-12 font-mono text-caption uppercase tracking-[0.15em] hover:bg-paper/90 transition-colors disabled:opacity-30"
          >
            {loading ? "Verificando..." : "Entrar →"}
          </button>
        </form>
      </div>
    </div>
  );
}
