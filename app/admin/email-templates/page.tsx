"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

interface EmailTemplate {
  id: string;
  event: string;
  name: string;
  subject: string;
  isActive: boolean;
  updatedAt: string;
}

export default function EmailTemplatesPage() {
  const { data: templates, isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["admin", "email-templates"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/email-templates");
      return response.data.data;
    },
  });

  // Group templates by event
  const groupedTemplates = templates?.reduce((acc, template) => {
    if (!acc[template.event]) {
      acc[template.event] = [];
    }
    acc[template.event].push(template);
    return acc;
  }, {} as Record<string, EmailTemplate[]>) || {};

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Шаблоны Email-уведомлений</CardTitle>
          <Link href="/admin/email-templates/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Создать шаблон
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedTemplates).length === 0 && (
                <div className="text-center text-muted-foreground py-10">
                  Шаблоны не найдены
                </div>
              )}
              
              {Object.entries(groupedTemplates).map(([event, eventTemplates]) => (
                <div key={event} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted px-4 py-2 font-medium border-b flex justify-between items-center">
                    <span>Событие: {event}</span>
                    <Badge variant="outline" className="bg-background">
                      {eventTemplates.length} вариантов
                    </Badge>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[30%]">Название</TableHead>
                        <TableHead className="w-[40%]">Тема письма</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Обновлено</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell className="font-medium">
                            {template.name}
                          </TableCell>
                          <TableCell className="truncate max-w-[300px]" title={template.subject}>
                            {template.subject}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={template.isActive ? "default" : "secondary"}
                            >
                              {template.isActive ? "Активен" : "Отключен"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {format(new Date(template.updatedAt), "dd MMM yyyy HH:mm", {
                              locale: ru,
                            })}
                          </TableCell>
                          <TableCell className="text-right">
                            <Link href={`/admin/email-templates/${template.id}`}>
                              <Button variant="ghost" size="icon">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
