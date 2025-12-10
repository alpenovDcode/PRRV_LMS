import { StudentLayout } from "@/components/layouts/student-layout";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return <StudentLayout>{children}</StudentLayout>;
}

