"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import { Shield, User, FileText, Settings, Activity } from "lucide-react";

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: any;
  createdAt: string;
  user: {
    fullName: string | null;
    email: string;
  };
}

export default function AuditLogsPage() {
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["admin", "audit-logs"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/audit-logs");
      return response.data.data;
    },
    refetchInterval: 10000, // Live updates every 10s
  });

  const getActionIcon = (action: string) => {
    if (action.includes("login") || action.includes("auth")) return <Shield className="h-4 w-4" />;
    if (action.includes("user")) return <User className="h-4 w-4" />;
    if (action.includes("course") || action.includes("lesson")) return <FileText className="h-4 w-4" />;
    if (action.includes("settings")) return <Settings className="h-4 w-4" />;
    return <Activity className="h-4 w-4" />;
  };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Shield className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Логи действий</h1>
          <p className="text-gray-600">История активности администраторов и системы</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Последние события</CardTitle>
          <CardDescription>
            Отображаются последние 50 действий
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>Логов пока нет</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-4 p-4 rounded-lg border border-gray-100 bg-white hover:bg-gray-50 transition-colors"
                >
                  <div className="mt-1 h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                    {getActionIcon(log.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {log.action}
                      </p>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.createdAt), { locale: ru, addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-medium text-gray-900">
                        {log.user.fullName || log.user.email}
                      </span>{" "}
                      {log.entity && (
                        <>
                          в <Badge variant="outline" className="text-xs">{log.entity}</Badge>
                        </>
                      )}
                    </p>
                    {log.details && (
                      <pre className="mt-2 text-xs bg-gray-50 p-2 rounded border border-gray-200 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
