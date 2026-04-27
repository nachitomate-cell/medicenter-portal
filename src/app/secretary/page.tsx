import RoleGuard from "@/components/RoleGuard";
import Header from "@/components/Header";
import UploadForm from "@/components/UploadForm";

export default function SecretaryPage() {
  return (
    <RoleGuard allow={["secretary", "admin"]}>
      <div className="min-h-screen flex flex-col">
        <Header context="Secretaría" />
        <main className="flex-1 px-8 py-16 flex justify-center">
          <UploadForm />
        </main>
      </div>
    </RoleGuard>
  );
}
