"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDbTables, getTableData, updateRecord, deleteRecord } from "@/app/actions/admin-db";
import { verifyAdminDbAccess } from "@/app/actions/admin-auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Lock, Database, Search, Edit, Trash2, ChevronLeft, ChevronRight, RefreshCcw, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function DatabaseManagerPage() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState("");
  const [isLoadingUnlock, setIsLoadingUnlock] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>("user");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editingRecord, setEditingRecord] = useState<any>(null);
  const [editJson, setEditJson] = useState("");

  const queryClient = useQueryClient();

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingUnlock(true);
    try {
        const result = await verifyAdminDbAccess(password);
        if (result.success) {
            setIsUnlocked(true);
            toast.success("Доступ разрешен");
        } else {
            toast.error(result.error);
        }
    } catch (e) {
        toast.error("Ошибка проверки пароля");
    } finally {
        setIsLoadingUnlock(false);
    }
  };

  const { data: tables = [] } = useQuery({
    queryKey: ["admin", "db", "tables"],
    queryFn: getDbTables,
    enabled: isUnlocked,
  });

  const { data: tableData, isLoading, error } = useQuery({
    queryKey: ["admin", "db", "data", selectedTable, page, search],
    queryFn: () => getTableData(selectedTable, page, 20, search),
    enabled: isUnlocked && !!selectedTable,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      try {
        const parsed = JSON.parse(editJson);
        const result = await updateRecord(selectedTable, data.id, parsed);
        if (!result.success) throw new Error(result.error);
        return result;
      } catch (e: any) {
        throw new Error(e.message || "Invalid JSON");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "db", "data"] });
      toast.success("Запись обновлена");
      setEditingRecord(null);
    },
    onError: (e: any) => {
      toast.error(`Ошибка: ${e.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
        if (!confirm("Вы уверены? Это действие нельзя отменить.")) throw new Error("Cancelled");
        const result = await deleteRecord(selectedTable, id);
        if (!result.success) throw new Error(result.error);
        return result;
    },
    onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["admin", "db", "data"] });
        toast.success("Запись удалена");
    },
    onError: (e: any) => {
        if (e.message !== "Cancelled") toast.error(`Ошибка: ${e.message}`);
    }
  });

  // Reset page when table changes
  useEffect(() => {
    setPage(1);
    setSearch("");
  }, [selectedTable]);

  if (!isUnlocked) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-gray-100 p-3 rounded-full w-fit mb-2">
                <Lock className="h-6 w-6 text-gray-500" />
            </div>
            <CardTitle>Доступ ограничен</CardTitle>
            <CardDescription>Введите пароль администратора базы данных</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUnlock} className="space-y-4">
              <Input
                type="password"
                placeholder="Пароль..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={isLoadingUnlock}>
                {isLoadingUnlock ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Войти
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 max-w-[1600px] h-[calc(100vh-100px)] flex flex-col">
      <div className="flex items-center justify-between mb-6">
         <div className="flex items-center gap-3">
            <Database className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Менеджер Базы Данных</h1>
         </div>
         <Badge variant="outline" className="px-3 py-1 bg-yellow-50 text-yellow-700 border-yellow-200">
            Режим прямого редактирования
         </Badge>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 bg-white border rounded-lg overflow-y-auto hidden md:block">
           <div className="p-4 border-b bg-gray-50 font-medium text-sm text-gray-500">
              Таблицы ({tables.length})
           </div>
           <div className="p-2 space-y-1">
              {tables.map(table => (
                 <button
                    key={table}
                    onClick={() => setSelectedTable(table)}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                       selectedTable === table 
                         ? "bg-blue-50 text-blue-700 font-medium" 
                         : "text-gray-700 hover:bg-gray-100"
                    }`}
                 >
                    {table}
                 </button>
              ))}
           </div>
        </div>

        {/* Main Content */}
        <Card className="flex-1 flex flex-col overflow-hidden border shadow-sm">
           {/* Toolbar */}
           <div className="p-4 border-b flex items-center justify-between gap-4 bg-white">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                 <Search className="h-4 w-4 text-gray-400" />
                 <Input 
                    placeholder={`Поиск в ${selectedTable}... (ID, Email, Title)`} 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-9"
                 />
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                 {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                 {!isLoading && tableData && (
                    <span>Всего: {tableData.total}</span>
                 )}
                 <Button variant="ghost" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["admin", "db", "data"] })}>
                     <RefreshCcw className="h-4 w-4" />
                 </Button>
              </div>
           </div>

           {/* Data Grid */}
           <div className="flex-1 overflow-auto bg-slate-50 relative">
              {isLoading ? (
                 <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                 </div>
              ) : error ? (
                 <div className="absolute inset-0 flex items-center justify-center text-red-500">
                    Ошибка: {(error as any).message}
                 </div>
              ) : (
                 <Table>
                    <TableHeader className="sticky top-0 bg-white shadow-sm z-10">
                       <TableRow>
                          <TableHead className="w-[100px]">Actions</TableHead>
                          {tableData?.data[0] && Object.keys(tableData.data[0]).map(key => (
                              <TableHead key={key} className="whitespace-nowrap font-semibold text-gray-700 min-w-[150px]">
                                 {key}
                              </TableHead>
                          ))}
                       </TableRow>
                    </TableHeader>
                    <TableBody className="bg-white">
                       {tableData?.data.map((row: any) => (
                           <TableRow key={row.id || JSON.stringify(row)} className="hover:bg-gray-50">
                               <TableCell className="sticky left-0 bg-white/95 backdrop-blur z-9 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                  <div className="flex items-center gap-1">
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => {
                                          setEditingRecord(row);
                                          setEditJson(JSON.stringify(row, null, 2));
                                      }}>
                                          <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteMutation.mutate(row.id)}>
                                          <Trash2 className="h-4 w-4" />
                                      </Button>
                                  </div>
                               </TableCell>
                               {Object.entries(row).map(([key, value]) => (
                                   <TableCell key={key} className="max-w-[300px] truncate text-xs" title={typeof value === 'object' ? JSON.stringify(value) : String(value)}>
                                       {typeof value === 'object' && value !== null 
                                          ? (key === 'createdAt' || key === 'updatedAt' ? new Date(value as any).toLocaleString('ru-RU') : JSON.stringify(value))
                                          : String(value)
                                       }
                                   </TableCell>
                               ))}
                           </TableRow>
                       ))}
                       {tableData?.data.length === 0 && (
                          <TableRow>
                             <TableCell colSpan={10} className="text-center py-10 text-gray-500">
                                Нет данных
                             </TableCell>
                          </TableRow>
                       )}
                    </TableBody>
                 </Table>
              )}
           </div>

           {/* Pagination */}
           <div className="p-2 border-t bg-white flex items-center justify-between">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
              >
                  <ChevronLeft className="h-4 w-4 mr-2" /> Назад
              </Button>
              <span className="text-sm font-medium text-gray-600">Страница {page}</span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={!tableData || tableData.data.length < 20 || isLoading}
              >
                  Вперед <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
           </div>
        </Card>
      </div>

      {/* Edit Modal */}
      <Dialog open={!!editingRecord} onOpenChange={(open) => !open && setEditingRecord(null)}>
        <DialogContent className="sm:max-w-2xl">
           <DialogHeader>
              <DialogTitle>Редактирование записи ({selectedTable})</DialogTitle>
              <DialogDescription>
                 Осторожно! Вы редактируете данные напрямую в базе. JSON формат.
              </DialogDescription>
           </DialogHeader>
           
           <div className="space-y-4 py-2">
              <Label>JSON Data</Label>
              <Textarea 
                value={editJson} 
                onChange={(e) => setEditJson(e.target.value)} 
                className="font-mono text-xs min-h-[300px]" 
              />
           </div>

           <DialogFooter>
              <Button variant="outline" onClick={() => setEditingRecord(null)}>Отмена</Button>
              <Button onClick={() => updateMutation.mutate(editingRecord)} disabled={updateMutation.isPending}>
                 {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                 <Save className="mr-2 h-4 w-4" />
                 Сохранить
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
