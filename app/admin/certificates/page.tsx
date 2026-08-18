"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplatesList } from "@/components/admin/certificates/templates-list";
import { IssuedCertificatesList } from "@/components/admin/certificates/issued-certificates-list";
import { IssuanceJobsList } from "@/components/admin/certificates/issuance-jobs-list";

export default function CertificatesPage() {
  return (
    <div className="container mx-auto max-w-7xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-3xl font-bold">Сертификаты</h1>
        <p className="mt-1 text-gray-600">Управление шаблонами и выданными сертификатами</p>
      </div>

      <Tabs defaultValue="issued" className="space-y-6">
        <TabsList>
          <TabsTrigger value="issued">Выданные сертификаты</TabsTrigger>
          <TabsTrigger value="templates">Шаблоны</TabsTrigger>
          <TabsTrigger value="automation">Автоматическая выдача</TabsTrigger>
        </TabsList>

        <TabsContent value="issued" className="space-y-6">
          <IssuedCertificatesList />
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <TemplatesList />
        </TabsContent>

        <TabsContent value="automation" className="space-y-6">
          <IssuanceJobsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
