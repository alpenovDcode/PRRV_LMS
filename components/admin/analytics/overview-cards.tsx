import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, GraduationCap, FileText, Activity, Layers } from "lucide-react";
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

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <Card>
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24 mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard
        title="Студентов"
        value={data.totalStudents}
        sub={`+${data.newStudentsLast30Days} за 30 дней`}
        icon={Users}
        iconColor="text-blue-500"
      />
      <StatCard
        title="Активных (7 дней)"
        value={data.activeStudentsLast7Days}
        sub={
          data.totalStudents > 0
            ? `${Math.round((data.activeStudentsLast7Days / data.totalStudents) * 100)}% от всех`
            : "нет студентов"
        }
        icon={Activity}
        iconColor="text-green-500"
      />
      <StatCard
        title="Потоков / Групп"
        value={data.totalGroups}
        icon={Layers}
        iconColor="text-purple-500"
      />
      <StatCard
        title="Курсов"
        value={data.totalCourses}
        sub="опубликованных"
        icon={BookOpen}
        iconColor="text-orange-500"
      />
      <StatCard
        title="Активных зачислений"
        value={data.totalEnrollments}
        icon={GraduationCap}
        iconColor="text-cyan-500"
      />
      <StatCard
        title="ДЗ на проверке"
        value={data.pendingHomeworks}
        sub="ожидают проверки"
        icon={FileText}
        iconColor="text-red-500"
      />
    </div>
  );
}
