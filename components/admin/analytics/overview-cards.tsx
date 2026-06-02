import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, GraduationCap, FileText, Activity, Layers, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface OverviewData {
  totalUsers: number;
  totalStudents: number;
  newStudentsLast30Days: number;
  totalGroups: number;
  totalCourses: number;
  totalEnrollments: number;
  pendingHomeworks: number;
  activeStudentsLast7Days: number;
}

interface OverviewCardsProps {
  data: OverviewData;
  isLoading: boolean;
}

function PrimaryCard({
  title, value, sub, trend, icon: Icon, iconColor, accent,
}: {
  title: string;
  value: string | number;
  sub?: string;
  trend?: { label: string; positive: boolean };
  icon: React.ElementType;
  iconColor: string;
  accent: string; // Tailwind bg color class for left border
}) {
  return (
    <Card className={`border-l-4 ${accent}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${trend.positive ? "text-green-600" : "text-red-600"}`}>
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.label}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SecondaryCard({
  title, value, sub, icon: Icon, iconColor, warning,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
  warning?: boolean;
}) {
  return (
    <Card className={warning ? "border-orange-200 bg-orange-50/30 dark:bg-orange-950/10" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function OverviewCards({ data, isLoading }: OverviewCardsProps) {
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border-l-4 border-l-muted">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-28" /></CardHeader>
              <CardContent><Skeleton className="h-9 w-20" /><Skeleton className="h-3 w-32 mt-2" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-16" /><Skeleton className="h-3 w-20 mt-1" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const activePct = data.totalStudents > 0
    ? Math.round((data.activeStudentsLast7Days / data.totalStudents) * 100)
    : 0;

  const activityLabel =
    activePct >= 60 ? "Высокая активность"
    : activePct >= 35 ? "Средняя активность"
    : "Низкая активность";

  const activityPositive = activePct >= 35;

  return (
    <div className="space-y-4">
      {/* Row 1: primary metrics */}
      <div className="grid gap-4 md:grid-cols-2">
        <PrimaryCard
          title="Студентов"
          value={data.totalStudents}
          sub={`всего в системе`}
          trend={{ label: `+${data.newStudentsLast30Days} новых за 30 дней`, positive: data.newStudentsLast30Days > 0 }}
          icon={Users}
          iconColor="text-blue-500"
          accent="border-l-blue-500"
        />
        <PrimaryCard
          title="Активных за 7 дней"
          value={data.activeStudentsLast7Days}
          sub={`${activePct}% от всех студентов`}
          trend={{ label: activityLabel, positive: activityPositive }}
          icon={Activity}
          iconColor="text-green-500"
          accent={activePct >= 35 ? "border-l-green-500" : "border-l-red-400"}
        />
      </div>

      {/* Row 2: secondary metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SecondaryCard
          title="Потоков / Групп"
          value={data.totalGroups}
          icon={Layers}
          iconColor="text-purple-500"
        />
        <SecondaryCard
          title="Курсов"
          value={data.totalCourses}
          sub="опубликованных"
          icon={BookOpen}
          iconColor="text-orange-500"
        />
        <SecondaryCard
          title="Активных зачислений"
          value={data.totalEnrollments}
          icon={GraduationCap}
          iconColor="text-cyan-500"
        />
        <SecondaryCard
          title="ДЗ на проверке"
          value={data.pendingHomeworks}
          sub={data.pendingHomeworks > 0 ? "ожидают проверки" : "всё проверено"}
          icon={FileText}
          iconColor={data.pendingHomeworks > 0 ? "text-orange-500" : "text-green-500"}
          warning={data.pendingHomeworks > 0}
        />
      </div>
    </div>
  );
}
