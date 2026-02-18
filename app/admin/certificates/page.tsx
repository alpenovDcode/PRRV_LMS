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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Input } from "@/components/ui/input";

interface Certificate {
  id: string;
  certificateNumber: string;
  pdfUrl: string;
  issuedAt: string;
  user: {
    id: string;
    fullName: string;
    email: string;
  };
  course: {
    id: string;
    title: string;
  };
}

export default function CertificatesPage() {
  const [search, setSearch] = useState("");

  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["admin", "certificates"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/certificates");
      return response.data.data;
    },
  });

  const filteredCertificates = certificates?.filter((cert) => {
    const searchLower = search.toLowerCase();
    return (
      cert.certificateNumber.toLowerCase().includes(searchLower) ||
      cert.user.fullName?.toLowerCase().includes(searchLower) ||
      cert.user.email.toLowerCase().includes(searchLower) ||
      cert.course.title.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Выданные сертификаты</h1>
          <p className="text-gray-600 mt-1">
            Список всех выданных сертификатов студентам
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список сертификатов</CardTitle>
          <CardDescription>
            Просмотр и скачивание сертификатов
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Поиск по номеру, студенту или курсу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />

          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : !filteredCertificates || filteredCertificates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Сертификаты не найдены
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Номер</TableHead>
                  <TableHead>Студент</TableHead>
                  <TableHead>Курс</TableHead>
                  <TableHead>Дата выдачи</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCertificates.map((cert) => (
                  <TableRow key={cert.id}>
                    <TableCell className="font-medium font-mono">
                      {cert.certificateNumber}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{cert.user.fullName || "—"}</div>
                      <div className="text-xs text-gray-500">{cert.user.email}</div>
                    </TableCell>
                    <TableCell>{cert.course.title}</TableCell>
                    <TableCell>
                      {new Date(cert.issuedAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => window.open(cert.pdfUrl, "_blank")}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Скачать PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
