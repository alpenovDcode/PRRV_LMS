"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Award, Download, ExternalLink } from "lucide-react";
import Link from "next/link";

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
}

export function CertificatesWidget() {
  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["student", "certificates"],
    queryFn: async () => {
      const response = await apiClient.get("/student/certificates");
      return response.data.data;
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Мои сертификаты
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-gray-500">Загрузка...</div>
        </CardContent>
      </Card>
    );
  }

  if (!certificates || certificates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Мои сертификаты
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Award className="h-12 w-12 mx-auto mb-3 text-gray-300" />
            <p>У вас пока нет сертификатов</p>
            <p className="text-sm mt-1">Завершите курс, чтобы получить сертификат</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5" />
          Мои сертификаты
        </CardTitle>
        {certificates.length > 2 && (
          <Link href="/certificates">
            <Button variant="ghost" size="sm">
              Показать все
            </Button>
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {certificates.slice(0, 3).map((cert) => (
            <div
              key={cert.id}
              className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors"
            >
              <div className="h-14 w-20 bg-gray-100 rounded overflow-hidden flex-shrink-0">
                <img
                  src={cert.pdfUrl}
                  alt={cert.course.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-sm text-gray-900 truncate">
                  {cert.course.title}
                </h4>
                <p className="text-xs text-gray-500">
                  {new Date(cert.issuedAt).toLocaleDateString("ru-RU")}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(cert.pdfUrl, "_blank")}
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
