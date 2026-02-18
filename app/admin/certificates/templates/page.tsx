import { redirect } from "next/navigation";

export default function CertificateTemplatesPage() {
  redirect("/admin/certificates?tab=templates");
}
