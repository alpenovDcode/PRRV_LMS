import { StudentLayout } from "@/components/layouts/student-layout";
import { LogSuppressor } from "@/components/providers/log-suppressor";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <StudentLayout>
      <LogSuppressor />
      {children}
    </StudentLayout>
  );
}

