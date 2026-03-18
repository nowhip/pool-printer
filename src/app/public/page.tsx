"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  Monitor,
  Moon,
  Printer,
  RefreshCw,
  Sun,
  Wallet,
  ReceiptText,
} from "lucide-react";
import Image from "next/image";
import { toast } from "sonner";
import { generateInvoicePDF } from "@/lib/generate-invoice";

interface PublicAccount {
  resolved: boolean;
  exists: boolean;
  userId?: string;
  balance?: number;
  is_free_account?: number;
  account_state?: "active" | "deletion_requested";
  deletion_requested_at?: string | null;
  deletion_expires_at?: string | null;
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
  const [deletionMenuOpen, setDeletionMenuOpen] = useState(false);
  const [deletionConfirmOpen, setDeletionConfirmOpen] = useState(false);
  const [logoError, setLogoError] = useState(false);
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

  const handleAccountDeletionAction = async (action: "request" | "restore") => {
    try {
      const res = await fetch("/api/public/account-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed account deletion action");
      }

      toast.success(
        action === "request"
          ? t("public.deletionRequested")
          : t("public.accountRestored"),
      );
      await fetchAccount();
    } catch (error) {
      console.error("Failed account deletion action:", error);
      toast.error(
        action === "request"
          ? t("public.deletionRequestFailed")
          : t("public.restoreFailed"),
      );
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

  const isCreditTransaction = (type: string) => type === "deposit";

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoError ? (
              <Printer className="h-10 w-10 text-primary" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[oklch(0.9846_0.0017_247.8389)] p-1.5">
                <Image
                  src="/logo.svg"
                  alt="Logo"
                  width={48}
                  height={48}
                  className="h-full w-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            )}
            <div>
              <p className="text-lg font-bold leading-tight">{t("app.name")}</p>
              <h1 className="text-3xl font-bold">{t("public.title")}</h1>
              <p className="text-muted-foreground">{t("public.subtitle")}</p>
            </div>
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
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              {t("public.accountTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-5 w-44" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-28" />
                  </div>
                  <div className="rounded-md border p-3 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-24" />
                  </div>
                </div>
              </div>
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
                  {creating ? (
                    <Skeleton className="h-4 w-28" />
                  ) : (
                    t("public.createAccount")
                  )}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {account.account_state === "deletion_requested" ? (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/20 dark:border-amber-800">
                    <p className="font-medium">
                      {t("public.deletionPendingTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("public.deletionPendingDesc")}
                    </p>
                    {account.deletion_expires_at ? (
                      <p className="text-sm mt-2">
                        {t("public.restoreUntil", {
                          date: formatDateTime(account.deletion_expires_at),
                        })}
                      </p>
                    ) : null}
                    <Button
                      variant="outline"
                      className="mt-3"
                      onClick={() => handleAccountDeletionAction("restore")}
                    >
                      {t("public.restoreAccount")}
                    </Button>
                  </div>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {t("users.userId")}
                    </p>
                    <p className="font-medium">{account.userId}</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      {t("common.balance")}
                    </p>
                    <p className="font-medium">
                      {formatCurrency(account.balance || 0)}
                    </p>
                  </div>
                </div>

                {account.account_state === "active" ? (
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between text-left"
                      onClick={() => setDeletionMenuOpen((prev) => !prev)}
                    >
                      <p className="text-sm font-medium text-muted-foreground">
                        {t("public.requestDeletionTitle")}
                      </p>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${deletionMenuOpen ? "rotate-180" : "rotate-0"}`}
                      />
                    </button>
                    {deletionMenuOpen ? (
                      <>
                        <p className="text-xs text-muted-foreground">
                          {t("public.requestDeletionWarning")}
                        </p>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="mt-1 w-fit text-xs"
                          onClick={() => setDeletionConfirmOpen(true)}
                        >
                          {t("public.requestDeletion")}
                        </Button>

                        <AlertDialog
                          open={deletionConfirmOpen}
                          onOpenChange={setDeletionConfirmOpen}
                        >
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("public.requestDeletionTitle")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("public.requestDeletionWarning")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("common.cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() =>
                                  handleAccountDeletionAction("request")
                                }
                              >
                                {t("common.confirm")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {account?.resolved && account.exists && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5 text-muted-foreground" />
                {t("public.transactionsTitle")}
              </CardTitle>
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
                              isCreditTransaction(tx.type)
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {isCreditTransaction(tx.type) ? "+" : "-"}
                            {formatCurrency(Math.abs(tx.amount))}
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
