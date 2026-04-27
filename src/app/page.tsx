"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role === "admin") {
      router.replace("/admin");
    } else if (user.role === "doctor") {
      router.replace("/doctor");
    } else if (user.role === "secretary") {
      router.replace("/secretary");
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="font-mono text-micro uppercase tracking-[0.2em] text-paper/60">
        Cargando...
      </p>
    </div>
  );
}
