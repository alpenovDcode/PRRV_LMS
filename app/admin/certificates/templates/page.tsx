"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface CertificateTemplate {
  id: string;
  name: string;
  imageUrl: string;
  isActive: boolean;
  createdAt: string;
  course: {
    id: string;
    title: string;
  } | null;
  _count: {
    certificates: number;
  };
}

export default function CertificateTemplatesPage() {
  const queryClient = useQueryClient();

  const { data: templates, isLoading } = useQuery<CertificateTemplate[]>({
    queryKey: ["admin", "certificate-templates"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/certificates/templates");
      return response.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/admin/certificates/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "certificate-templates"] });
      toast.success("Шаблон удален");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Ошибка при удалении");
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Удалить шаблон "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Шаблоны сертификатов</h1>
          <p className="text-gray-600 mt-1">
            Управление шаблонами для автоматической выдачи сертификатов
          </p>
        </div>
        <Link href="/admin/certificates/templates/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Создать шаблон
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Все шаблоны</CardTitle>
          <CardDescription>
            Список всех шаблонов сертификатов в системе
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Загрузка...</div>
          ) : !templates || templates.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Нет созданных шаблонов. Создайте первый шаблон.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Курс</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Выдано</TableHead>
                  <TableHead>Создан</TableHead>
                  <TableHead className="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>
                      {template.course ? (
                        <Link
                          href={`/admin/courses/${template.course.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          {template.course.title}
                        </Link>
                      ) : (
                        <span className="text-gray-400">Общий</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {template.isActive ? (
                        <Badge variant="default">Активен</Badge>
                      ) : (
                        <Badge variant="secondary">Неактивен</Badge>
                      )}
                    </TableCell>
                    <TableCell>{template._count.certificates}</TableCell>
                    <TableCell>
                      {new Date(template.createdAt).toLocaleDateString("ru-RU")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(template.imageUrl, "_blank")}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Link href={`/admin/certificates/templates/${template.id}/edit`}>
                          <Button variant="ghost" size="sm">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(template.id, template.name)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
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
