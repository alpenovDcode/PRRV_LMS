"use client";

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
import { format } from "date-fns";
import { ru } from "date-fns/locale";

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

export function TemplatesList() {
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Все шаблоны</CardTitle>
          <CardDescription>
            Список всех шаблонов сертификатов в системе
          </CardDescription>
        </div>
        <Link href="/admin/certificates/templates/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Создать шаблон
          </Button>
        </Link>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Загрузка...</div>
        ) : !templates || templates.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Шаблоны не найдены. Создайте первый шаблон.
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
                      <span className="text-blue-600">{template.course.title}</span>
                    ) : (
                      <span className="text-gray-400">Общий</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={template.isActive ? "default" : "secondary"}>
                      {template.isActive ? "Активен" : "Неактивен"}
                    </Badge>
                  </TableCell>
                  <TableCell>{template._count.certificates}</TableCell>
                  <TableCell>
                    {format(new Date(template.createdAt), "dd.MM.yyyy", {
                      locale: ru,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                       {/* Preview button (optional, maybe link to edit) */}
                      <Button variant="ghost" size="icon" asChild>
                         <Link href={`/admin/certificates/templates/${template.id}/edit`}>
                             <Eye className="h-4 w-4" />
                         </Link>
                      </Button>

                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/admin/certificates/templates/${template.id}/edit`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDelete(template.id, template.name)}
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}
