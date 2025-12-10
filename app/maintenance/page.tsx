import { Card, CardContent } from "@/components/ui/card";
import { Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted px-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Wrench className="h-12 w-12 text-muted-foreground mx-auto" />
            <h1 className="text-2xl font-bold">Технические работы</h1>
            <p className="text-muted-foreground">
              Платформа временно недоступна из-за технических работ. Мы вернемся в ближайшее время.
            </p>
            <p className="text-sm text-muted-foreground">
              Приносим извинения за неудобства.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

