"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useParams } from "next/navigation";
import { CertificateEditor } from "@/components/admin/certificates/certificate-editor";

export default function EditCertificateTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  const [fieldConfig, setFieldConfig] = useState<any>(null);

  // Fetch existing template
  const { data: template, isLoading } = useQuery({
    queryKey: ["admin", "certificate-templates", id],
    queryFn: async () => {
      const response = await apiClient.get(`/admin/certificates/templates/${id}`);
      return response.data.data;
    },
  });

  // Populate form when data loads
  useEffect(() => {
    if (template) {
      setName(template.name);
      setImageUrl(template.imageUrl);
      setFieldConfig(template.fieldConfig);
    }
  }, [template]);

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiClient.patch(`/admin/certificates/templates/${id}`, data);
    },
    onSuccess: () => {
      toast.success("Шаблон обновлен");
      router.push("/admin/certificates/templates");
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error?.message || "Ошибка при обновлении");
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

    updateMutation.mutate({
      name,
      imageUrl,
      fieldConfig,
    });
  };

  if (isLoading) {
    return <div className="container mx-auto max-w-3xl px-4 py-8">Загрузка...</div>;
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Редактировать шаблон сертификата</CardTitle>
          <CardDescription>
            Измените название или изображение шаблона.
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
              <Label htmlFor="image">Изображение и разметка шаблона</Label>
              <Input
                id="image"
                type="file"
                accept="image/png,image/jpeg"
                onChange={handleFileUpload}
                disabled={uploading}
                className="mb-4"
              />
              {uploading && <p className="text-sm text-gray-500">Загрузка...</p>}
              
              {fieldConfig && (
                <CertificateEditor
                  imageUrl={imageUrl}
                  fieldConfig={fieldConfig}
                  onChange={setFieldConfig}
                />
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
              <Button type="submit" disabled={updateMutation.isPending || uploading}>
                {updateMutation.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
