import { StudentLayout } from "@/components/layouts/student-layout";
import { LogSuppressor } from "@/components/providers/log-suppressor";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentLayout>
      <LogSuppressor />
      {children}
    </StudentLayout>
  );
}

