"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FieldConfig {
  x: number;
  y: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  align: "left" | "center" | "right";
  format?: string;
  hidden?: boolean;
}

interface CertificateFieldConfig {
  fullName: FieldConfig;
  courseName: FieldConfig;
  date: FieldConfig;
  certificateNumber: FieldConfig;
}

interface CertificateEditorProps {
  imageUrl: string;
  fieldConfig: CertificateFieldConfig;
  onChange: (config: CertificateFieldConfig) => void;
}

const DEFAULT_WIDTH = 800; // Preview width

export function CertificateEditor({
  imageUrl,
  fieldConfig,
  onChange,
}: CertificateEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [draggingField, setDraggingField] = useState<keyof CertificateFieldConfig | null>(null);
  const [selectedField, setSelectedField] = useState<keyof CertificateFieldConfig | null>(null);

  // Handle image load to calculate scale vs natural size
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.target as HTMLImageElement;
    if (containerRef.current) {
      const renderedWidth = containerRef.current.clientWidth;
      setScale(renderedWidth / img.naturalWidth);
    }
  };

  const handleDragStart = (e: React.MouseEvent, field: keyof CertificateFieldConfig) => {
    e.preventDefault();
    setDraggingField(field);
    setSelectedField(field);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingField || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    onChange({
      ...fieldConfig,
      [draggingField]: {
        ...fieldConfig[draggingField],
        x: Math.round(x),
        y: Math.round(y),
      },
    });
  };

  const handleMouseUp = () => {
    setDraggingField(null);
  };

  const updateFieldStyle = (
    field: keyof CertificateFieldConfig,
    key: keyof FieldConfig,
    value: any
  ) => {
    onChange({
      ...fieldConfig,
      [field]: {
        ...fieldConfig[field],
        [key]: value,
      },
    });
  };

  const toggleFieldVisibility = (field: keyof CertificateFieldConfig) => {
    const current = fieldConfig[field].hidden;
    updateFieldStyle(field, "hidden", !current);
  };

  const renderField = (key: keyof CertificateFieldConfig, label: string, sampleText: string) => {
    const config = fieldConfig[key];
    if (config.hidden) return null;
    
    const isSelected = selectedField === key;

    return (
      <div
        style={{
          position: "absolute",
          left: config.x * scale,
          top: config.y * scale,
          fontSize: config.fontSize * scale,
          color: config.color,
          transform: "translate(-50%, -50%)", // Center align anchor point
          cursor: "move",
          whiteSpace: "nowrap",
          border: isSelected ? "2px dashed blue" : "1px dashed transparent",
          padding: "4px",
          backgroundColor: isSelected ? "rgba(255, 255, 255, 0.5)" : "transparent",
        }}
        onMouseDown={(e) => handleDragStart(e, key)}
      >
        {sampleText}
      </div>
    );
  };

  const fieldLabels: Record<keyof CertificateFieldConfig, string> = {
    fullName: "Имя студента",
    courseName: "Название курса",
    date: "Дата выдачи",
    certificateNumber: "Номер сертификата",
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <Card className="p-4 overflow-hidden bg-gray-100">
          <div
            ref={containerRef}
            className="relative select-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Certificate Template"
                className="w-full h-auto pointer-events-none"
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="aspect-video bg-gray-200 flex items-center justify-center text-gray-500">
                Загрузите изображение
              </div>
            )}

            {imageUrl && (
              <>
                {renderField("fullName", "Имя студента", "Иванов Иван Иванович")}
                {renderField("courseName", "Название курса", "Название курса")}
                {renderField("date", "Дата выдачи", "01.01.2024")}
                {renderField("certificateNumber", "Номер сертификата", "CERT-12345")}
              </>
            )}
          </div>
        </Card>
        <p className="text-sm text-gray-500 mt-2">
          Перетаскивайте элементы мышкой для позиционирования. Кликните на элемент для настройки стиля.
        </p>
      </div>

      <div className="bg-white p-4 rounded-lg border h-fit space-y-6">
        
        {/* Fields Toggle List */}
        <div>
            <h3 className="font-semibold mb-2">Элементы сертификата</h3>
            <div className="space-y-2">
                {(Object.keys(fieldLabels) as Array<keyof CertificateFieldConfig>).map((key) => (
                    <div key={key} className="flex items-center justify-between p-2 border rounded hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedField(key)}>
                        <span className={cn("text-sm", selectedField === key && "font-medium text-blue-600")}>
                            {fieldLabels[key]}
                        </span>
                        <div className="flex items-center gap-2">
                             <Button 
                                variant="ghost" 
                                size="sm" 
                                className="h-6 px-2 text-xs"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleFieldVisibility(key);
                                }}
                             >
                                {fieldConfig[key].hidden ? "Показать" : "Скрыть"}
                             </Button>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Настройки полей</h3>
            
            {!selectedField ? (
            <div className="text-gray-500 text-sm">
                Выберите поле на шаблоне для редактирования
            </div>
            ) : (
            <div className="space-y-4">
                <div className="font-medium border-b pb-2 mb-2">
                {fieldLabels[selectedField]}
                {fieldConfig[selectedField].hidden && <span className="ml-2 text-red-500 text-xs">(Скрыто)</span>}
                </div>

                <div className="space-y-2">
                <Label>Размер шрифта (px)</Label>
                <Input
                    type="number"
                    value={fieldConfig[selectedField].fontSize}
                    onChange={(e) =>
                    updateFieldStyle(selectedField, "fontSize", Number(e.target.value))
                    }
                />
                </div>

                <div className="space-y-2">
                <Label>Цвет текста</Label>
                <div className="flex gap-2">
                    <Input
                    type="color"
                    value={fieldConfig[selectedField].color}
                    onChange={(e) =>
                        updateFieldStyle(selectedField, "color", e.target.value)
                    }
                    className="w-12 p-1 h-10"
                    />
                    <Input
                    type="text"
                    value={fieldConfig[selectedField].color}
                    onChange={(e) =>
                        updateFieldStyle(selectedField, "color", e.target.value)
                    }
                    className="flex-1"
                    />
                </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                    <Label>Координата X</Label>
                    <Input
                    type="number"
                    value={fieldConfig[selectedField].x}
                    onChange={(e) =>
                        updateFieldStyle(selectedField, "x", Number(e.target.value))
                    }
                    />
                </div>
                <div className="space-y-2">
                    <Label>Координата Y</Label>
                    <Input
                    type="number"
                    value={fieldConfig[selectedField].y}
                    onChange={(e) =>
                        updateFieldStyle(selectedField, "y", Number(e.target.value))
                    }
                    />
                </div>
                </div>
                {selectedField === "date" && (
                    <div className="space-y-2">
                        <Label>Формат даты</Label>
                        <Select
                            value={(fieldConfig.date as any).format || "DD.MM.YYYY"}
                            onValueChange={(val) => updateFieldStyle("date", "format", val)} // Use "date" explicitly
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="DD.MM.YYYY">DD.MM.YYYY</SelectItem>
                                <SelectItem value="DD MMMM YYYY">DD MMMM YYYY</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
            )}
        </div>
      </div>
    </div>
  );
}
