"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export default function NewCertificateTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiClient.post("/admin/certificates/templates", data);
    },
    onSuccess: () => {
      toast.success("Шаблон создан");
      router.push("/admin/certificates/templates");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Ошибка при создании");
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post(
        "/admin/certificates/templates-upload",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setImageUrl(response.data.data.url);
      toast.success("Изображение загружено");
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || "Ошибка загрузки");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !imageUrl) {
      toast.error("Заполните все поля");
      return;
    }

    // Default field configuration
    const fieldConfig = {
      fullName: {
        x: 400,
        y: 300,
        fontSize: 48,
        fontFamily: "Arial",
        color: "#000000",
        align: "center" as const,
      },
      courseName: {
        x: 400,
        y: 400,
        fontSize: 32,
        fontFamily: "Arial",
        color: "#000000",
        align: "center" as const,
      },
      date: {
        x: 400,
        y: 500,
        fontSize: 24,
        fontFamily: "Arial",
        color: "#000000",
        align: "center" as const,
        format: "DD.MM.YYYY" as const,
      },
      certificateNumber: {
        x: 400,
        y: 550,
        fontSize: 18,
        fontFamily: "Arial",
        color: "#666666",
        align: "center" as const,
      },
    };

    createMutation.mutate({
      courseId: null,
      name,
      imageUrl,
      fieldConfig,
    });
  };

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Создать шаблон сертификата</CardTitle>
          <CardDescription>
            Загрузите изображение шаблона. Поля будут размещены автоматически.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Название шаблона</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Сертификат об окончании курса"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="image">Изображение шаблона (PNG)</Label>
              <Input
                id="image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileUpload}
                disabled={uploading}
              />
              {uploading && <p className="text-sm text-gray-500">Загрузка...</p>}
              {imageUrl && (
                <div className="mt-4">
                  <img
                    src={imageUrl}
                    alt="Preview"
                    className="max-w-full h-auto border rounded"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                Отмена
              </Button>
              <Button type="submit" disabled={createMutation.isPending || uploading}>
                {createMutation.isPending ? "Создание..." : "Создать шаблон"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
