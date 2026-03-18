"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";
import { generateInvoicePDF } from "@/lib/generate-invoice";

interface PublicAccount {
  resolved: boolean;
  exists: boolean;
  userId?: string;
  balance?: number;
  is_free_account?: number;
  error?: string;
  hint?: string;
}

interface Transaction {
  id: number;
  userId: string;
  amount: number;
  pages: number;
  type: string;
  status: string;
  timestamp: string;
  paymentMethod?: string | null;
  description?: string | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function PublicPage() {
  const { t, locale, setLocale, formatCurrency, formatDateTime } = useI18n();
  const { setTheme, theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [account, setAccount] = useState<PublicAccount | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchTransactions = useCallback(
    async (page = 1) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pagination.limit),
      });

      const res = await fetch(`/api/public/transactions?${params.toString()}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch transactions");
      }

      setTransactions(data.transactions || []);
      setPagination(
        data.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 },
      );
    },
    [pagination.limit],
  );

  const fetchAccount = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/public/me");
      const data = (await res.json()) as PublicAccount;
      setAccount(data);

      if (res.ok && data.resolved && data.exists) {
        await fetchTransactions(1);
      } else {
        setTransactions([]);
        setPagination({ page: 1, limit: 20, total: 0, totalPages: 0 });
      }
    } catch (error) {
      console.error("Failed to load public account:", error);
      toast.error(t("public.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [fetchTransactions, t]);

  useEffect(() => {
    fetchAccount();
  }, [fetchAccount]);

  const handleCreateAccount = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/public/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to create account");
      }

      toast.success(t("public.accountCreated"));
      await fetchAccount();
    } catch (error) {
      console.error("Failed to create account:", error);
      toast.error(t("public.accountCreateFailed"));
    } finally {
      setCreating(false);
    }
  };

  const typeLabel = (type: string) => {
    switch (type) {
      case "deposit":
        return t("type.deposit");
      case "print_bw":
        return t("type.print_bw");
      case "print_color":
        return t("type.print_color");
      case "manual":
        return t("type.manual");
      default:
        return type;
    }
  };

  const statusLabel = (status: string) => {
    const key = `status.${status}` as
      | "status.completed"
      | "status.pending"
      | "status.refunded"
      | "status.failed";
    return t(key);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default" as const;
      case "pending":
        return "secondary" as const;
      case "refunded":
        return "outline" as const;
      case "failed":
        return "destructive" as const;
      default:
        return "default" as const;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t("public.title")}</h1>
            <p className="text-muted-foreground">{t("public.subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={fetchAccount}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title={t("nav.language")}>
                  <Globe className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setLocale("de")}
                  className={locale === "de" ? "font-bold" : ""}
                >
                  🇩🇪 Deutsch
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLocale("en")}
                  className={locale === "en" ? "font-bold" : ""}
                >
                  🇬🇧 English
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" title={t("nav.theme")}>
                  <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                  <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => setTheme("light")}
                  className={theme === "light" ? "font-bold" : ""}
                >
                  <Sun className="h-4 w-4 mr-2" /> {t("nav.light")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("dark")}
                  className={theme === "dark" ? "font-bold" : ""}
                >
                  <Moon className="h-4 w-4 mr-2" /> {t("nav.dark")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setTheme("system")}
                  className={theme === "system" ? "font-bold" : ""}
                >
                  <Monitor className="h-4 w-4 mr-2" /> {t("nav.system")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("public.accountTitle")}</CardTitle>
            <CardDescription>{t("public.accountDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-muted-foreground">{t("common.loading")}</p>
            ) : !account?.resolved ? (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="font-medium">
                  {t("public.userResolveFailedTitle")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("public.userResolveFailedDesc")}
                </p>
                {account?.hint && (
                  <p className="text-xs text-muted-foreground">
                    {account.hint}
                  </p>
                )}
              </div>
            ) : !account.exists ? (
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <p className="font-medium">{t("public.accountMissingTitle")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("public.accountMissingDesc", {
                    userId: account.userId || "",
                  })}
                </p>
                <Button onClick={handleCreateAccount} disabled={creating}>
                  {creating ? t("common.loading") : t("public.createAccount")}
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-sm text-muted-foreground">
                    {t("users.userId")}
                  </p>
                  <p className="font-medium">{account.userId}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm text-muted-foreground">
                    {t("common.balance")}
                  </p>
                  <p className="font-medium">
                    {formatCurrency(account.balance || 0)}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {account?.resolved && account.exists && (
          <Card>
            <CardHeader>
              <CardTitle>{t("public.transactionsTitle")}</CardTitle>
              <CardDescription>
                {t("public.transactionsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.type")}</TableHead>
                      <TableHead>{t("common.amount")}</TableHead>
                      <TableHead>{t("common.pages")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("common.date")}</TableHead>
                      <TableHead className="w-[70px]">
                        {t("common.actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-muted-foreground"
                        >
                          {t("jobs.noTransactions")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions.map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell>{typeLabel(tx.type)}</TableCell>
                          <TableCell
                            className={
                              tx.amount >= 0 ? "text-green-600" : "text-red-600"
                            }
                          >
                            {tx.amount >= 0 ? "+" : ""}
                            {formatCurrency(tx.amount)}
                          </TableCell>
                          <TableCell>
                            {tx.type === "print_bw" || tx.type === "print_color"
                              ? (tx.pages ?? 1)
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColor(tx.status)}>
                              {statusLabel(tx.status)}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatDateTime(tx.timestamp)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => generateInvoicePDF(tx, locale)}
                              title={t("common.downloadReceipt")}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {pagination.totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t("jobs.pageOf", {
                      page: pagination.page,
                      totalPages: pagination.totalPages,
                      total: pagination.total,
                    })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={pagination.page <= 1}
                      onClick={() => fetchTransactions(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={pagination.page >= pagination.totalPages}
                      onClick={() => fetchTransactions(pagination.page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
