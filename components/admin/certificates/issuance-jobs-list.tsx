"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type IssuanceJob = {
  id: string;
  status: "pending" | "processing" | "retrying" | "completed" | "failed" | "cancelled";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  user: { fullName: string | null; email: string } | null;
  course: { title: string } | null;
};

const labels: Record<IssuanceJob["status"], string> = {
  pending: "Ожидает",
  processing: "Создаётся",
  retrying: "Повторная попытка",
  completed: "Выдан",
  failed: "Ошибка",
  cancelled: "Остановлен",
};

export function IssuanceJobsList() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<IssuanceJob[]>({
    queryKey: ["admin", "certificate-jobs"],
    queryFn: async () => (await apiClient.get("/admin/certificates/jobs")).data.data,
    refetchInterval: 15_000,
  });
  const retry = useMutation({
    mutationFn: async (jobId: string) => apiClient.patch("/admin/certificates/jobs", { jobId }),
    onSuccess: () => {
      toast.success("Задача возвращена в очередь");
      queryClient.invalidateQueries({ queryKey: ["admin", "certificate-jobs"] });
    },
    onError: () => toast.error("Не удалось перезапустить задачу"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Автоматическая выдача</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="py-8 text-center text-gray-500">Загрузка...</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Студент</TableHead>
                <TableHead>Курс</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Попытки</TableHead>
                <TableHead>Ошибка</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-gray-500">
                    Задач пока нет
                  </TableCell>
                </TableRow>
              ) : (
                data.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>
                      <div className="font-medium">{job.user?.fullName || "—"}</div>
                      <div className="text-xs text-gray-500">{job.user?.email}</div>
                    </TableCell>
                    <TableCell>{job.course?.title || "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          job.status === "failed"
                            ? "destructive"
                            : job.status === "completed"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {labels[job.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>{job.attempts}/5</TableCell>
                    <TableCell
                      className="max-w-xs truncate text-xs text-red-600"
                      title={job.lastError || undefined}
                    >
                      {job.lastError || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {(["failed", "cancelled"] as string[]).includes(job.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retry.mutate(job.id)}
                          disabled={retry.isPending}
                        >
                          <RotateCcw className="mr-2 h-3 w-3" />
                          Повторить
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
