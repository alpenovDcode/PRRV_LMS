"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface Certificate {
  id: string;
  certificateNumber: string;
  pdfUrl: string;
  issuedAt: string;
  course: {
    id: string;
    title: string;
    slug: string;
  };
  template: {
    id: string;
    name: string;
  };
}

export default function MyCertificatesPage() {
  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["student", "certificates"],
    queryFn: async () => {
      const response = await apiClient.get("/student/certificates");
      return response.data.data;
    },
  });

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Мои сертификаты</h1>
        <p className="text-gray-600 mt-1">
          Сертификаты об окончании курсов
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Загрузка...</div>
      ) : !certificates || certificates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            У вас пока нет сертификатов. Завершите курс, чтобы получить сертификат.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {certificates.map((cert) => (
            <Card key={cert.id}>
              <CardHeader>
                <CardTitle className="text-lg">{cert.course.title}</CardTitle>
                <CardDescription>
                  Выдан {format(new Date(cert.issuedAt), "d MMMM yyyy", { locale: ru })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-[4/3] bg-gray-100 rounded overflow-hidden">
                  <img
                    src={cert.pdfUrl}
                    alt={`Сертификат ${cert.course.title}`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  <p>Номер: <span className="font-mono">{cert.certificateNumber}</span></p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(cert.pdfUrl, "_blank")}
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Скачать
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`/verify/${cert.certificateNumber}`, "_blank")}
                    className="flex-1"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Проверить
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
