"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  RefreshCw,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { FileUploader, type BriefFileItem } from "./_components/file-uploader";

interface BriefCase {
  id: string;
  orderIndex: number;
  name: string | null;
  age: string | null;
  goal: string | null;
  beforeText: string | null;
  duration: string | null;
  problems: string | null;
  afterText: string | null;
  reviewText: string | null;
}

interface BriefData {
  id: string;
  status: "in_progress" | "completed";
  currentStep: number;

  fio: string | null;
  subject: string | null;
  targetAudience: string | null;
  painsGoals: string | null;

  utp: string | null;
  educationText: string | null;
  experience: string | null;
  achievements: string | null;
  methods: string | null;
  formats: string | null;

  adIntro: string | null;
  adProcess: string | null;
  adResult: string | null;

  existingStyle: string | null;
  preferredStyle: string | null;
  characterImage: string | null;
  cardImpression: string | null;
  colorPreferences: string | null;

  completedAt: string | null;
  cases: BriefCase[];
  files: BriefFileItem[];
}

type StepKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEPS: { key: StepKey; title: string; color: string }[] = [
  { key: 1, title: "Основная информация", color: "bg-yellow-100 text-yellow-900" },
  { key: 2, title: "Фото", color: "bg-orange-100 text-orange-900" },
  { key: 3, title: "Кейсы и отзывы", color: "bg-blue-100 text-blue-900" },
  { key: 4, title: "Инфографика", color: "bg-green-100 text-green-900" },
  { key: 5, title: "Как проходит обучение", color: "bg-red-100 text-red-900" },
  { key: 6, title: "Визуальные предпочтения", color: "bg-purple-100 text-purple-900" },
  { key: 7, title: "Проверка и завершение", color: "bg-primary/10 text-primary" },
];

export default function BriefPage() {
  const qc = useQueryClient();
  const { user, isLoading: authLoading } = useAuth();

  // Бриф доступен только на тарифе «Лидер рынка» (LR). Админы видят
  // всегда (для проверки), остальные — только при tariff === "LR".
  // API endpoints дополнительно валидируют тариф на бэкенде —
  // это просто чтобы юзер не тратил сетевые запросы и видел понятный
  // экран вместо вечного скелетона.
  const hasAccess =
    user?.role === "admin" || user?.tariff === "LR";

  const { data: brief, isLoading } = useQuery<BriefData>({
    queryKey: ["brief"],
    queryFn: async () => {
      const r = await apiClient.get("/brief");
      return r.data.data;
    },
    // Не дёргаем API если тарифа нет — иначе на консоли будут 403'ки.
    enabled: hasAccess,
  });

  if (authLoading) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!hasAccess) {
    return <TariffLockedScreen />;
  }

  // Если бриф ещё не открывали — спрашиваем «продолжить или начать заново».
  // Если currentStep=1 и нет ни одного поля — это новый бриф, сразу в форму.
  const [showResumeChoice, setShowResumeChoice] = useState(false);
  const [step, setStep] = useState<StepKey>(1);

  useEffect(() => {
    if (!brief) return;
    const hasAnyContent =
      !!brief.fio ||
      !!brief.subject ||
      !!brief.targetAudience ||
      !!brief.painsGoals ||
      brief.cases.length > 0 ||
      brief.files.length > 0;
    // Если статус completed — открываем финальный экран на чтение.
    if (brief.status === "completed") {
      setStep(7);
      setShowResumeChoice(false);
      return;
    }
    // Если контент уже есть, currentStep > 1 — предложим продолжить.
    if (hasAnyContent && brief.currentStep > 1) {
      setShowResumeChoice(true);
    } else {
      setStep(brief.currentStep as StepKey);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brief?.id]);

  if (isLoading || !brief) {
    return (
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (showResumeChoice) {
    return (
      <ResumeChoice
        brief={brief}
        onContinue={() => {
          setShowResumeChoice(false);
          setStep((brief.currentStep as StepKey) || 1);
        }}
        onRestart={async () => {
          await apiClient.delete("/brief");
          qc.invalidateQueries({ queryKey: ["brief"] });
          setShowResumeChoice(false);
          setStep(1);
        }}
      />
    );
  }

  if (brief.status === "completed" && step !== 7) {
    // Защита на случай прямой навигации.
    setStep(7);
    return null;
  }

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
      <Header step={step} />
      <Progress value={(step / 7) * 100} className="h-1.5" />

      {step === 1 && <Block1 brief={brief} onNext={() => setStep(2)} />}
      {step === 2 && <Block2 brief={brief} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <Block3 brief={brief} onBack={() => setStep(2)} onNext={() => setStep(4)} />}
      {step === 4 && <Block4 brief={brief} onBack={() => setStep(3)} onNext={() => setStep(5)} />}
      {step === 5 && <Block5 brief={brief} onBack={() => setStep(4)} onNext={() => setStep(6)} />}
      {step === 6 && <Block6 brief={brief} onBack={() => setStep(5)} onNext={() => setStep(7)} />}
      {step === 7 && <FinalSummary brief={brief} onEdit={(s) => setStep(s)} />}
    </div>
  );
}

// Экран-заглушка для пользователей, чей тариф ниже LR. Показывает
// причину блокировки и CTA вернуться на дашборд. Соответствующие API-
// endpoints возвращают TARIFF_REQUIRED 403, но мы прячем заглушку
// до того, как UI пошлёт запросы, чтобы не было гонок и пустых
// скелетонов.
function TariffLockedScreen() {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-16">
      <Card>
        <CardContent className="space-y-5 pt-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Доступ только для «Лидер рынка»</h2>
            <p className="text-sm text-muted-foreground">
              Бриф для упаковки — расширенная функция для оформления вашей
              карточки на агрегаторах. Сейчас она входит только в тариф{" "}
              <strong>«Лидер рынка»</strong>.
            </p>
            <p className="text-sm text-muted-foreground">
              Чтобы получить доступ — обратитесь к куратору, и мы поможем
              перейти на нужный тариф.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href="/dashboard">Вернуться на главную</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/questions">Написать куратору</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({ step }: { step: StepKey }) {
  const cur = STEPS.find((s) => s.key === step)!;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Badge className={cur.color}>Блок {step} из 7</Badge>
        <h1 className="text-2xl font-bold tracking-tight">{cur.title}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Анкета для оформления вашей карточки на агрегаторах (Авито, Профи и др.).
        Прогресс сохраняется автоматически — вы можете продолжить позже.
      </p>
    </div>
  );
}

function ResumeChoice({
  brief,
  onContinue,
  onRestart,
}: {
  brief: BriefData;
  onContinue: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="container mx-auto max-w-2xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>У вас есть незаконченная анкета</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Хотите продолжить с того места, где остановились (блок {brief.currentStep}),
            или начать всё сначала?
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={onContinue}>
              <ArrowRight className="mr-2 h-4 w-4" />
              Продолжить заполнение
            </Button>
            <Button variant="outline" onClick={onRestart}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Начать заново
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------
// Хук: автосохранение блока при переходе вперёд.
// --------------------------------------------------------------------
function useSaveStep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Record<string, any>) => {
      const r = await apiClient.patch("/brief", patch);
      return r.data.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["brief"], data);
    },
    onError: (e: any) => {
      toast.error(e?.response?.data?.error?.message || "Не удалось сохранить");
    },
  });
}

// --------------------------------------------------------------------
// БЛОК 1: Основная информация
// --------------------------------------------------------------------
function Block1({ brief, onNext }: { brief: BriefData; onNext: () => void }) {
  const [fio, setFio] = useState(brief.fio || "");
  const [subject, setSubject] = useState(brief.subject || "");
  const [ta, setTa] = useState(brief.targetAudience || "");
  const [pg, setPg] = useState(brief.painsGoals || "");
  const save = useSaveStep();

  const handleNext = async () => {
    await save.mutateAsync({
      fio,
      subject,
      targetAudience: ta,
      painsGoals: pg,
      currentStep: 2,
    });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Начнём с базовой информации — это станет фундаментом вашей карточки.
        </p>
        <Field label="Как вас зовут? (ФИО для карточки)" required>
          <Input value={fio} onChange={(e) => setFio(e.target.value)} />
        </Field>
        <Field
          label="Предмет / специализация"
          hint="Например: «репетитор по английскому языку», «подготовка к ЕГЭ по математике»"
          required
        >
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </Field>
        <Field
          label="Кто ваши ученики (целевая аудитория)"
          hint="Школьники / студенты / взрослые / подготовка к ЕГЭ или ОГЭ / другое"
          required
        >
          <Textarea rows={3} value={ta} onChange={(e) => setTa(e.target.value)} />
        </Field>
        <Field
          label="Боли / цели учеников"
          hint="Например: подготовка к ЕГЭ на 80+ даже с нуля; регулярные 4–5 по предмету; английский для релокации; поступление в зарубежный вуз"
          required
        >
          <Textarea rows={5} value={pg} onChange={(e) => setPg(e.target.value)} />
        </Field>
        <Footer
          onNext={handleNext}
          nextDisabled={!fio || !subject || !ta || !pg}
          saving={save.isPending}
        />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 2: Фото
// --------------------------------------------------------------------
function Block2({
  brief,
  onBack,
  onNext,
}: {
  brief: BriefData;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveStep();
  const refresh = () => qc.invalidateQueries({ queryKey: ["brief"] });
  const portraitFiles = brief.files.filter((f) => f.fileType === "portrait");
  const selfieFiles = brief.files.filter((f) => f.fileType === "selfie");
  const contextFiles = brief.files.filter((f) => f.fileType === "context");

  const handleNext = async () => {
    await save.mutateAsync({ currentStep: 3 });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        <p className="text-sm text-muted-foreground">
          Загрузите фотографии для оформления профиля. Лучше — в хорошем качестве,
          с лёгкой улыбкой, нейтральный фон или фон в контексте преподавания.
        </p>

        <FileGroup
          title="Портретные фото"
          description="1–3 фото в хорошем качестве, где хорошо видно лицо."
        >
          <FileUploader
            fileType="portrait"
            files={portraitFiles}
            accept="image/*"
            onChange={refresh}
          />
        </FileGroup>

        <FileGroup
          title="Селфи"
          description="Селфи для генерации дополнительных вариантов изображений."
        >
          <FileUploader
            fileType="selfie"
            files={selfieFiles}
            accept="image/*"
            onChange={refresh}
          />
        </FileGroup>

        <FileGroup
          title="Фото в контексте преподавания"
          description="Фото с уроков, рабочего места, доски и т.п. — необязательно."
        >
          <FileUploader
            fileType="context"
            files={contextFiles}
            accept="image/*"
            onChange={refresh}
          />
        </FileGroup>

        <Footer onBack={onBack} onNext={handleNext} saving={save.isPending} />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 3: Кейсы и отзывы
// --------------------------------------------------------------------
function Block3({
  brief,
  onBack,
  onNext,
}: {
  brief: BriefData;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveStep();
  const refresh = () => qc.invalidateQueries({ queryKey: ["brief"] });

  const addCase = useMutation({
    mutationFn: async () => apiClient.post("/brief/cases", {}),
    onSuccess: refresh,
  });

  const handleNext = async () => {
    await save.mutateAsync({ currentStep: 4 });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Расскажите про 2–5 кейсов учеников. Покажите результаты через конкретные
          истории — это один из самых важных блоков карточки.
        </p>

        {brief.cases.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Кейсов пока нет. Добавьте первый.
          </div>
        )}

        <div className="space-y-4">
          {brief.cases.map((c, idx) => (
            <CaseEditor key={c.id} index={idx} caseData={c} brief={brief} onChange={refresh} />
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => addCase.mutate()}
          disabled={addCase.isPending}
        >
          {addCase.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Добавить кейс
        </Button>

        <Footer onBack={onBack} onNext={handleNext} saving={save.isPending} />
      </CardContent>
    </Card>
  );
}

function CaseEditor({
  index,
  caseData,
  brief,
  onChange,
}: {
  index: number;
  caseData: BriefCase;
  brief: BriefData;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(caseData.name || "");
  const [age, setAge] = useState(caseData.age || "");
  const [goal, setGoal] = useState(caseData.goal || "");
  const [beforeText, setBeforeText] = useState(caseData.beforeText || "");
  const [duration, setDuration] = useState(caseData.duration || "");
  const [problems, setProblems] = useState(caseData.problems || "");
  const [afterText, setAfterText] = useState(caseData.afterText || "");
  const [reviewText, setReviewText] = useState(caseData.reviewText || "");

  const reviewFiles = brief.files.filter(
    (f) => f.fileType === "review" && f.caseId === caseData.id
  );

  const saveField = async (patch: Record<string, any>) => {
    try {
      await apiClient.patch(`/brief/cases/${caseData.id}`, patch);
      qc.invalidateQueries({ queryKey: ["brief"] });
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Не удалось сохранить");
    }
  };

  const remove = async () => {
    if (!confirm("Удалить этот кейс?")) return;
    try {
      await apiClient.delete(`/brief/cases/${caseData.id}`);
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || "Не удалось удалить");
    }
  };

  return (
    <Card className="border-muted-foreground/20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Кейс №{index + 1}</CardTitle>
        <Button type="button" variant="ghost" size="sm" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Имя ученика">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => saveField({ name })}
            />
          </Field>
          <Field label="Класс или возраст">
            <Input
              value={age}
              onChange={(e) => setAge(e.target.value)}
              onBlur={() => saveField({ age })}
            />
          </Field>
        </div>
        <Field label="Цель занятий">
          <Textarea
            rows={2}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onBlur={() => saveField({ goal })}
          />
        </Field>
        <Field label="Что было до занятий (в цифрах и эмоциях)">
          <Textarea
            rows={2}
            value={beforeText}
            onChange={(e) => setBeforeText(e.target.value)}
            onBlur={() => saveField({ beforeText })}
          />
        </Field>
        <Field label="Длительность обучения">
          <Input
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            onBlur={() => saveField({ duration })}
          />
        </Field>
        <Field label="Проблемы или сложности, с которыми пришёл ученик">
          <Textarea
            rows={2}
            value={problems}
            onChange={(e) => setProblems(e.target.value)}
            onBlur={() => saveField({ problems })}
          />
        </Field>
        <Field label="Что стало после (результат в цифрах и эмоции)">
          <Textarea
            rows={2}
            value={afterText}
            onChange={(e) => setAfterText(e.target.value)}
            onBlur={() => saveField({ afterText })}
          />
        </Field>
        <Field label="Доп. информация / отзыв (текст)">
          <Textarea
            rows={3}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            onBlur={() => saveField({ reviewText })}
          />
        </Field>
        <Field label="Файлы отзыва (скриншоты, голосовые)" hint="Необязательно">
          <FileUploader
            fileType="review"
            caseId={caseData.id}
            files={reviewFiles}
            accept="image/*,audio/*,application/pdf"
            onChange={onChange}
          />
        </Field>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 4: Инфографика
// --------------------------------------------------------------------
function Block4({
  brief,
  onBack,
  onNext,
}: {
  brief: BriefData;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveStep();
  const refresh = () => qc.invalidateQueries({ queryKey: ["brief"] });

  const [utp, setUtp] = useState(brief.utp || "");
  const [edu, setEdu] = useState(brief.educationText || "");
  const [exp, setExp] = useState(brief.experience || "");
  const [ach, setAch] = useState(brief.achievements || "");
  const [met, setMet] = useState(brief.methods || "");
  const [fmt, setFmt] = useState(brief.formats || "");

  const eduFiles = brief.files.filter((f) => f.fileType === "education");
  const matFiles = brief.files.filter((f) => f.fileType === "materials");

  const handleNext = async () => {
    await save.mutateAsync({
      utp,
      educationText: edu,
      experience: exp,
      achievements: ach,
      methods: met,
      formats: fmt,
      currentStep: 5,
    });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Заполните информацию для блока «обо мне» — он будет оформлен как инфографика
          с фактами о вас.
        </p>
        <Field
          label="Ваше УТП"
          hint="Чем вы отличаетесь от других преподавателей? Почему выбирают именно вас?"
        >
          <Textarea rows={3} value={utp} onChange={(e) => setUtp(e.target.value)} />
        </Field>
        <Field label="Образование" hint="ВУЗ, факультет, год выпуска и др.">
          <Textarea rows={3} value={edu} onChange={(e) => setEdu(e.target.value)} />
        </Field>
        <Field label="Дипломы, сертификаты, грамоты">
          <FileUploader
            fileType="education"
            files={eduFiles}
            accept="image/*,application/pdf"
            onChange={refresh}
          />
        </Field>
        <Field label="Опыт преподавания" hint="Сколько лет, с кем работали, какие уровни">
          <Textarea rows={3} value={exp} onChange={(e) => setExp(e.target.value)} />
        </Field>
        <Field
          label="Достижения учеников"
          hint="3–6 примеров: баллы ОГЭ/ЕГЭ; вузы, в которые поступили; оффер за границу и т.д."
        >
          <Textarea rows={4} value={ach} onChange={(e) => setAch(e.target.value)} />
        </Field>
        <Field
          label="Методики, принципы, подход"
          hint="Как вы преподаёте, на чём строятся ваши занятия?"
        >
          <Textarea rows={3} value={met} onChange={(e) => setMet(e.target.value)} />
        </Field>
        <Field
          label="Форматы занятий"
          hint="Онлайн / оффлайн / индивидуально / мини-группы / сопровождение в чате. Также — предпочтения по цветовой гамме инфографики."
        >
          <Textarea rows={3} value={fmt} onChange={(e) => setFmt(e.target.value)} />
        </Field>
        <Field
          label="Дополнительные материалы"
          hint="Фото с уроков, сканы тетрадей, рабочие листы — необязательно"
        >
          <FileUploader
            fileType="materials"
            files={matFiles}
            accept="image/*,application/pdf"
            onChange={refresh}
          />
        </Field>
        <Footer onBack={onBack} onNext={handleNext} saving={save.isPending} />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 5: Как проходит обучение
// --------------------------------------------------------------------
function Block5({
  brief,
  onBack,
  onNext,
}: {
  brief: BriefData;
  onBack: () => void;
  onNext: () => void;
}) {
  const save = useSaveStep();
  const [intro, setIntro] = useState(brief.adIntro || "");
  const [proc, setProc] = useState(brief.adProcess || "");
  const [res, setRes] = useState(brief.adResult || "");

  const handleNext = async () => {
    await save.mutateAsync({
      adIntro: intro,
      adProcess: proc,
      adResult: res,
      currentStep: 6,
    });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Расскажите, как устроен учебный процесс.
        </p>
        <Field
          label="Как вы проводите уроки"
          hint="Как проходит пробное занятие, как структурируется обычный урок"
        >
          <Textarea rows={4} value={intro} onChange={(e) => setIntro(e.target.value)} />
        </Field>
        <Field
          label="Что используете при работе"
          hint="Планшет, запись уроков, платформа; как проверяете домашние задания; поддержка в чате"
        >
          <Textarea rows={4} value={proc} onChange={(e) => setProc(e.target.value)} />
        </Field>
        <Field
          label="Какой результат получит ученик"
          hint="Например: сдаст на нужный балл; поступит в учебное заведение мечты; полюбит предмет; перестанет бояться экзаменов"
        >
          <Textarea rows={4} value={res} onChange={(e) => setRes(e.target.value)} />
        </Field>
        <Footer onBack={onBack} onNext={handleNext} saving={save.isPending} />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 6: Визуальные предпочтения
// --------------------------------------------------------------------
function Block6({
  brief,
  onBack,
  onNext,
}: {
  brief: BriefData;
  onBack: () => void;
  onNext: () => void;
}) {
  const qc = useQueryClient();
  const save = useSaveStep();
  const refresh = () => qc.invalidateQueries({ queryKey: ["brief"] });

  const [existing, setExisting] = useState(brief.existingStyle || "");
  const [preferred, setPreferred] = useState(brief.preferredStyle || "");
  const [character, setCharacter] = useState(brief.characterImage || "");
  const [impression, setImpression] = useState(brief.cardImpression || "");
  const [colors, setColors] = useState(brief.colorPreferences || "");

  const styleFiles = brief.files.filter((f) => f.fileType === "style_example");

  const handleNext = async () => {
    await save.mutateAsync({
      existingStyle: existing,
      preferredStyle: preferred,
      characterImage: character,
      cardImpression: impression,
      colorPreferences: colors,
      currentStep: 7,
    });
    onNext();
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Эти ответы помогут оформить карточку в стиле, который подходит вашей аудитории
          и подчёркивает ваш образ.
        </p>
        <Field
          label="1. Есть ли у вас существующий стиль?"
          hint="Оформление Instagram, аватарка, логотип, фирменные цвета. Нужно ли его сохранить? (да / частично / нет)"
        >
          <Textarea rows={3} value={existing} onChange={(e) => setExisting(e.target.value)} />
        </Field>
        <Field
          label="2. Примеры дизайна, который вам нравится"
          hint="Карточки репетиторов, сайты, презентации, баннеры — 3–5 примеров, если есть"
        >
          <FileUploader
            fileType="style_example"
            files={styleFiles}
            accept="image/*,application/pdf"
            onChange={refresh}
          />
        </Field>
        <Field
          label="3. Какой визуальный стиль вам ближе"
          hint="Например: строгий и академический; мягкий и дружелюбный; яркий молодёжный; минималистичный экспертный; уютный «домашний преподаватель»; деловой профессиональный"
        >
          <Textarea rows={3} value={preferred} onChange={(e) => setPreferred(e.target.value)} />
        </Field>
        <Field
          label="4. Если представить вас как образ / персонажа, каким он был бы?"
          hint="Например: «Спокойный наставник, который объяснит без давления»; «Энергичный молодой учитель на одной волне с подростками»; «Строгий эксперт, который доводит до результата»"
        >
          <Textarea rows={3} value={character} onChange={(e) => setCharacter(e.target.value)} />
        </Field>
        <Field
          label="5. Какое впечатление должна производить ваша карточка?"
          hint="Например: внушать доверие; выглядеть современно и экспертно; показывать поддержку; быть «живой», человечной; быть строгой и серьёзной"
        >
          <Textarea rows={3} value={impression} onChange={(e) => setImpression(e.target.value)} />
        </Field>
        <Field
          label="6. Цвета или элементы, которые точно НЕ стоит использовать"
          hint="Например: «не хочу пастельные цвета», «не хочу тёмный фон», «не хочу подростковую подачу»"
        >
          <Textarea rows={3} value={colors} onChange={(e) => setColors(e.target.value)} />
        </Field>
        <Footer
          onBack={onBack}
          onNext={handleNext}
          nextLabel="К проверке"
          saving={save.isPending}
        />
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// БЛОК 7: Финальный экран
// --------------------------------------------------------------------
function FinalSummary({
  brief,
  onEdit,
}: {
  brief: BriefData;
  onEdit: (step: StepKey) => void;
}) {
  const qc = useQueryClient();
  const completeMutation = useMutation({
    mutationFn: async () => apiClient.post("/brief/complete"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brief"] });
      toast.success("Анкета отправлена! Спасибо!");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.error?.message || "Не удалось завершить"),
  });
  const reopenMutation = useMutation({
    mutationFn: async () => apiClient.post("/brief/reopen"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brief"] }),
  });

  const photosCount = brief.files.filter((f) =>
    ["portrait", "selfie", "context"].includes(f.fileType)
  ).length;
  const reviewFilesCount = brief.files.filter((f) => f.fileType === "review").length;
  const eduFilesCount = brief.files.filter((f) =>
    ["education", "materials"].includes(f.fileType)
  ).length;
  const styleFilesCount = brief.files.filter((f) => f.fileType === "style_example").length;

  if (brief.status === "completed") {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6 text-center">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
          <h2 className="text-xl font-bold">Анкета отправлена</h2>
          <p className="text-sm text-muted-foreground">
            Спасибо! Мы собрали полную информацию для оформления вашей карточки —
            с кейсами, фото, инфографикой и блоком о том, как проходит обучение.
            <br />
            Скоро вы получите продуманную и продающую карточку.
          </p>
          <Button
            variant="outline"
            onClick={() => reopenMutation.mutate()}
            disabled={reopenMutation.isPending}
          >
            {reopenMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Pencil className="mr-2 h-4 w-4" />
            )}
            Внести правки
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <h2 className="text-xl font-bold">Проверьте все данные</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Если всё верно, нажмите «Отправить анкету». Если хотите что-то исправить,
            нажмите «Редактировать» рядом с нужным блоком.
          </p>
        </div>

        <SummaryRow
          label="Блок 1. Основная информация"
          value={brief.fio ? `${brief.fio} · ${brief.subject || ""}` : "—"}
          onEdit={() => onEdit(1)}
        />
        <SummaryRow
          label="Блок 2. Фото"
          value={`${photosCount} ${pluralize(photosCount, ["файл", "файла", "файлов"])}`}
          onEdit={() => onEdit(2)}
        />
        <SummaryRow
          label="Блок 3. Кейсы и отзывы"
          value={`${brief.cases.length} ${pluralize(brief.cases.length, [
            "кейс",
            "кейса",
            "кейсов",
          ])} · ${reviewFilesCount} ${pluralize(reviewFilesCount, [
            "файл отзыва",
            "файла отзыва",
            "файлов отзывов",
          ])}`}
          onEdit={() => onEdit(3)}
        />
        <SummaryRow
          label="Блок 4. Инфографика"
          value={`${[brief.utp, brief.educationText, brief.experience]
            .filter(Boolean)
            .length}/6 полей · ${eduFilesCount} ${pluralize(eduFilesCount, [
            "файл",
            "файла",
            "файлов",
          ])}`}
          onEdit={() => onEdit(4)}
        />
        <SummaryRow
          label="Блок 5. Как проходит обучение"
          value={`${[brief.adIntro, brief.adProcess, brief.adResult].filter(Boolean).length}/3 полей`}
          onEdit={() => onEdit(5)}
        />
        <SummaryRow
          label="Блок 6. Визуальные предпочтения"
          value={`${[
            brief.existingStyle,
            brief.preferredStyle,
            brief.characterImage,
            brief.cardImpression,
            brief.colorPreferences,
          ].filter(Boolean).length}/5 полей · ${styleFilesCount} ${pluralize(styleFilesCount, [
            "пример",
            "примера",
            "примеров",
          ])}`}
          onEdit={() => onEdit(6)}
        />

        <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button
            size="lg"
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
          >
            {completeMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Отправить анкету
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({
  label,
  value,
  onEdit,
}: {
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{value}</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="mr-2 h-3.5 w-3.5" />
        Изменить
      </Button>
    </div>
  );
}

// --------------------------------------------------------------------
// Утилитарные компоненты
// --------------------------------------------------------------------
function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FileGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel = "Далее",
  nextDisabled = false,
  saving = false,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  saving?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-t pt-4">
      <div>
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack} disabled={saving}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Назад
          </Button>
        )}
      </div>
      <Button type="button" onClick={onNext} disabled={nextDisabled || saving}>
        {saving ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        {nextLabel}
        {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </div>
  );
}

function pluralize(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
