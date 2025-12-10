"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings, Save, Mail, Globe, Wrench } from "lucide-react";

export default function SettingsPage() {
  const [formData, setFormData] = useState({
    platformName: "",
    supportEmail: "",
    maintenanceMode: false,
    smtpHost: "",
    smtpPort: "",
    smtpUser: "",
    smtpPass: "",
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin", "settings"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/settings");
      return response.data.data;
    },
  });

  const { data: maintenanceStatus } = useQuery({
    queryKey: ["admin", "maintenance"],
    queryFn: async () => {
      const response = await apiClient.get("/admin/maintenance");
      return response.data.data;
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData((prev) => ({ ...prev, ...settings }));
    }
    if (maintenanceStatus) {
      setFormData((prev) => ({ ...prev, maintenanceMode: maintenanceStatus.isMaintenance }));
    }
  }, [settings, maintenanceStatus]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      // Save general settings
      await apiClient.post("/admin/settings", {
        platformName: formData.platformName,
        supportEmail: formData.supportEmail,
        smtpHost: formData.smtpHost,
        smtpPort: formData.smtpPort,
        smtpUser: formData.smtpUser,
        smtpPass: formData.smtpPass,
      });

      // Save maintenance mode separately
      await apiClient.post("/admin/maintenance", {
        enabled: formData.maintenanceMode,
      });
    },
    onSuccess: () => {
      toast.success("Настройки сохранены");
    },
    onError: () => {
      toast.error("Не удалось сохранить настройки");
    },
  });

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (isLoading) {
    return <div className="p-8">Загрузка настроек...</div>;
  }

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-12 w-12 rounded-lg bg-blue-100 flex items-center justify-center">
          <Settings className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Настройки платформы</h1>
          <p className="text-gray-600">Управление основными параметрами системы</p>
        </div>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Общие настройки
            </CardTitle>
            <CardDescription>Основные параметры отображения</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="platformName">Название платформы</Label>
              <Input
                id="platformName"
                value={formData.platformName}
                onChange={(e) => handleChange("platformName", e.target.value)}
                placeholder="Прорыв.ру"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Email поддержки</Label>
              <Input
                id="supportEmail"
                value={formData.supportEmail}
                onChange={(e) => handleChange("supportEmail", e.target.value)}
                placeholder="support@example.com"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              Режим обслуживания
            </CardTitle>
            <CardDescription>
              Управление доступностью платформы для пользователей
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Технические работы</Label>
                <p className="text-sm text-gray-500">
                  Если включено, только администраторы смогут зайти на сайт.
                  Остальные увидят заглушку.
                </p>
              </div>
              <Switch
                checked={formData.maintenanceMode}
                onCheckedChange={(checked) => handleChange("maintenanceMode", checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Настройки SMTP
            </CardTitle>
            <CardDescription>
              Конфигурация для отправки email-уведомлений
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtpHost">SMTP Host</Label>
                <Input
                  id="smtpHost"
                  value={formData.smtpHost}
                  onChange={(e) => handleChange("smtpHost", e.target.value)}
                  placeholder="smtp.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPort">SMTP Port</Label>
                <Input
                  id="smtpPort"
                  value={formData.smtpPort}
                  onChange={(e) => handleChange("smtpPort", e.target.value)}
                  placeholder="587"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="smtpUser">SMTP User</Label>
                <Input
                  id="smtpUser"
                  value={formData.smtpUser}
                  onChange={(e) => handleChange("smtpUser", e.target.value)}
                  placeholder="user@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="smtpPass">SMTP Password</Label>
                <Input
                  id="smtpPass"
                  type="password"
                  value={formData.smtpPass}
                  onChange={(e) => handleChange("smtpPass", e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => saveSettingsMutation.mutate()}
            disabled={saveSettingsMutation.isPending}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveSettingsMutation.isPending ? "Сохранение..." : "Сохранить настройки"}
          </Button>
        </div>
      </div>
    </div>
  );
}
