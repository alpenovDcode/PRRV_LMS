"use client";

import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
// import { useRouter } from "next/navigation";
import { toast } from "sonner";
import axios from "axios";

export function ImpersonationBanner() {
  // const router = useRouter();

  const handleStopImpersonation = async () => {
    try {
      await axios.post("/api/auth/stop-impersonation");
      toast.success("Сессия администратора восстановлена");
      
      // Жесткая перезагрузка для обновления состояния и редиректа
      window.location.href = "/admin/users";
    } catch (error) {

      toast.error("Не удалось выйти из режима просмотра");
    }
  };

  return (
    <div className="bg-orange-600 text-white px-4 py-2 flex items-center justify-between shadow-md relative z-50">
      <div className="flex items-center gap-2 text-sm font-medium">
        <LogOut className="h-4 w-4" />
        <span>Режим просмотра от имени пользователя</span>
      </div>
      <Button 
        variant="secondary" 
        size="sm" 
        onClick={handleStopImpersonation}
        className="bg-white text-orange-600 hover:bg-orange-50 border-0 h-8 text-xs font-bold"
      >
        Вернуться в админку
      </Button>
    </div>
  );
}
