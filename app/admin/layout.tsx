import { AdminLayout } from "@/components/layouts/admin-layout";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <AdminLayout>{children}</AdminLayout>;
}


