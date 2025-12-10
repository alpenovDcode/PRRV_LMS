import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-muted px-4">
      <Card className="max-w-md w-full text-center">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-6xl font-bold text-muted-foreground">404</div>
            <h1 className="text-2xl font-bold">Страница не найдена</h1>
            <p className="text-muted-foreground">
              К сожалению, запрашиваемая страница не существует или была перемещена.
            </p>
            <div className="flex gap-2 justify-center pt-4">
              <Button asChild>
                <Link href="/dashboard">
                  <Home className="mr-2 h-4 w-4" />
                  На главную
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/courses">
                  <Search className="mr-2 h-4 w-4" />
                  К каталогу
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

