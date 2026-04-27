import RoleGuard from "@/components/RoleGuard";
import Header from "@/components/Header";
import AdminPanel from "@/components/AdminPanel";

export default function AdminPage() {
  return (
    <RoleGuard allow={["admin"]}>
      <div className="min-h-screen flex flex-col">
        <Header context="Administración" />
        <AdminPanel />
      </div>
    </RoleGuard>
  );
}
