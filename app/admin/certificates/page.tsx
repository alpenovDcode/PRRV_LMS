"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatesList } from "@/components/admin/certificates/templates-list";
import { IssuedCertificatesList } from "@/components/admin/certificates/issued-certificates-list";

export default function CertificatesPage() {
  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Сертификаты</h1>
        <p className="text-gray-600 mt-1">
          Управление шаблонами и выданными сертификатами
        </p>
      </div>

      <Tabs defaultValue="issued" className="space-y-6">
        <TabsList>
          <TabsTrigger value="issued">Выданные сертификаты</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
        </TabsList>

        <TabsContent value="issued" className="space-y-6">
          <IssuedCertificatesList />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <TemplatesList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
