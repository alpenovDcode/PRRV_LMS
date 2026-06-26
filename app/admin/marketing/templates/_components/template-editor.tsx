"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Save, Eye, Send, FileText } from "lucide-react";
import type { EmailBlock, EmailDocument } from "@/lib/email/editor/types";
import { createEmptyDocument } from "@/lib/email/editor/types";
import { BlockPalette } from "./block-palette";
import { BlockCanvas } from "./block-canvas";
import { BlockProperties } from "./block-properties";
import { PreviewPane } from "./preview-pane";

interface TemplateData {
  id: string;
  name: string;
  category: string;
  subject: string;
  preheader: string | null;
  blocks: EmailDocument | null;
  compiledHtml: string;
  updatedAt: string;
}

interface TemplateEditorProps {
  templateId: string;
}

export function TemplateEditor({ templateId }: TemplateEditorProps) {
  const queryClient = useQueryClient();
  const [showPreview, setShowPreview] = useState(false);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Локальный стейт для немедленной обратной связи. Синхронизируется с сервером при сохранении.
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [preheader, setPreheader] = useState("");
  const [document, setDocument] = useState<EmailDocument>(() => createEmptyDocument());

  const { data, isLoading } = useQuery({
    queryKey: ["marketing-template", templateId],
    queryFn: async () => {
      const r = await apiClient.get(`/admin/marketing/templates/${templateId}`);
      return r.data.data as TemplateData;
    },
    staleTime: Infinity, // редактируем локально, не перезагружаем
  });

  // Инициализация локального стейта после первой загрузки.
  // Используем useState с initializer через `useCallback`-trick — простой подход:
  if (data && document.blocks.length === 0 && !name && !subject) {
    if (data.blocks) {
      // Документ может быть валидным EmailDocument; если нет — fallback на пустой.
      const doc = data.blocks as EmailDocument;
      if (doc.settings && Array.isArray(doc.blocks)) {
        setDocument(doc);
      }
    }
    setName(data.name);
    setSubject(data.subject);
    setPreheader(data.preheader ?? "");
  }

  const selectedBlock = document.blocks.find((b) => b.id === selectedBlockId) ?? null;

  const updateBlock = useCallback((block: EmailBlock) => {
    setDocument((doc) => ({
      ...doc,
      blocks: doc.blocks.map((b) => (b.id === block.id ? block : b)),
    }));
  }, []);

  const addBlock = useCallback((block: EmailBlock) => {
    setDocument((doc) => ({ ...doc, blocks: [...doc.blocks, block] }));
    setSelectedBlockId(block.id);
  }, []);

  const moveBlock = useCallback((id: string, direction: "up" | "down") => {
    setDocument((doc) => {
      const idx = doc.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return doc;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= doc.blocks.length) return doc;
      const blocks = [...doc.blocks];
      [blocks[idx], blocks[newIdx]] = [blocks[newIdx], blocks[idx]];
      return { ...doc, blocks };
    });
  }, []);

  const deleteBlock = useCallback(
    (id: string) => {
      setDocument((doc) => ({ ...doc, blocks: doc.blocks.filter((b) => b.id !== id) }));
      if (selectedBlockId === id) setSelectedBlockId(null);
    },
    [selectedBlockId]
  );

  const duplicateBlock = useCallback((id: string) => {
    setDocument((doc) => {
      const idx = doc.blocks.findIndex((b) => b.id === id);
      if (idx === -1) return doc;
      const original = doc.blocks[idx];
      const copy = { ...original, id: crypto.randomUUID() };
      const blocks = [...doc.blocks];
      blocks.splice(idx + 1, 0, copy);
      return { ...doc, blocks };
    });
  }, []);

  const updateSettings = useCallback((settings: EmailDocument["settings"]) => {
    setDocument((doc) => ({ ...doc, settings }));
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const r = await apiClient.patch(`/admin/marketing/templates/${templateId}`, {
        name: name.trim() || data?.name,
        subject: subject.trim() || data?.subject,
        preheader: preheader.trim() || null,
        blocks: document,
      });
      return r.data.data as TemplateData;
    },
    onSuccess: () => {
      toast.success("Сохранено");
      queryClient.invalidateQueries({ queryKey: ["marketing-template", templateId] });
      queryClient.invalidateQueries({ queryKey: ["marketing-templates"] });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось сохранить";
      toast.error(msg);
    },
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post(`/admin/marketing/templates/${templateId}/test-send`, {});
      return r.data.data as { to: string; provider: string };
    },
    onSuccess: (res) => {
      toast.success(`Отправлено на ${res.to} через ${res.provider}`);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Не удалось отправить тестовое письмо";
      toast.error(msg);
    },
  });

  if (isLoading) {
    return <div className="container mx-auto max-w-7xl px-4 py-8 text-gray-500">Загрузка…</div>;
  }

  if (!data) {
    return (
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin/marketing/templates" className="text-sm text-gray-600 hover:text-gray-900">
          ← К списку шаблонов
        </Link>
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-gray-500">Шаблон не найден</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-[1400px] px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <Link
          href="/admin/marketing/templates"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />К списку
        </Link>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(true)}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            <Eye className="h-4 w-4" />
            Предпросмотр
          </Button>
          <Button
            variant="outline"
            onClick={() => testSendMutation.mutate()}
            disabled={testSendMutation.isPending}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {testSendMutation.isPending ? "Отправляем…" : "Тест на мой email"}
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-amber-600" />
            Тема и заголовок
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-0">
          <div>
            <Label htmlFor="ed-name" className="text-xs text-gray-600">Имя</Label>
            <Input id="ed-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-subj" className="text-xs text-gray-600">Тема письма</Label>
            <Input id="ed-subj" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ed-pre" className="text-xs text-gray-600">Прехедер</Label>
            <Input
              id="ed-pre"
              value={preheader}
              onChange={(e) => setPreheader(e.target.value)}
              placeholder="Скрытый текст под темой"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[200px,1fr,320px] gap-4 items-start">
        <div className="lg:sticky lg:top-20">
          <BlockPalette onAddBlock={addBlock} />
        </div>

        <div onClick={() => setSelectedBlockId(null)}>
          <BlockCanvas
            document={document}
            selectedId={selectedBlockId}
            onSelect={setSelectedBlockId}
            onMove={moveBlock}
            onDelete={deleteBlock}
            onDuplicate={duplicateBlock}
          />
        </div>

        <div className="lg:sticky lg:top-20 space-y-3">
          <BlockProperties
            block={selectedBlock}
            document={document}
            onChange={updateBlock}
            onSettingsChange={updateSettings}
          />
        </div>
      </div>

      {showPreview && (
        <PreviewPane templateId={templateId} onClose={() => setShowPreview(false)} />
      )}
    </div>
  );
}
