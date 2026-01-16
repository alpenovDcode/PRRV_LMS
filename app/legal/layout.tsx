export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
        {children}
      </main>
    </div>
  );
}
