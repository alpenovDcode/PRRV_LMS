import { LogSuppressor } from "@/components/providers/log-suppressor";

export default function LearnLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <LogSuppressor />
      {children}
    </>
  );
}
