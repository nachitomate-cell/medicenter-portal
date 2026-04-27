import RoleGuard from "@/components/RoleGuard";
import DoctorDashboard from "@/components/DoctorDashboard";

export default function DoctorPage() {
  return (
    <RoleGuard allow={["doctor", "admin"]}>
      <DoctorDashboard />
    </RoleGuard>
  );
}
