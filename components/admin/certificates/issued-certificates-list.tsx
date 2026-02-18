"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Download, Plus, Trash } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { IssueCertificateDialog } from "./issue-certificate-dialog";
import { toast } from "sonner";

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

export function IssuedCertificatesList() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["admin", "certificates"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/certificates");
      return response.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/certificates/${id}`);
    },
    onSuccess: () => {
      toast.success("Сертификат удален");
      queryClient.invalidateQueries({ queryKey: ["admin", "certificates"] });
    },
    onError: () => {
      toast.error("Не удалось удалить сертификат");
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Вы уверены, что хотите удалить этот сертификат?")) {
      deleteMutation.mutate(id);
    }
  };

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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Список сертификатов</CardTitle>
          <CardDescription>
            Просмотр и скачивание выданных сертификатов
          </CardDescription>
        </div>
        <IssueCertificateDialog>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Выдать сертификат
          </Button>
        </IssueCertificateDialog>
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
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(cert.pdfUrl, "_blank")}
                      className="mr-2"
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Скачать
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(cert.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
