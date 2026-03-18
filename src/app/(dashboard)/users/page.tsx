"use client";

import { useEffect, useState, useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  Search,
  Plus,
  Euro,
  UserCheck,
  UserX,
  Download,
  MinusCircle,
  Trash2,
} from "lucide-react";
import { generateInvoicePDF } from "@/lib/generate-invoice";
import { useAppStore } from "@/lib/useAppStore";

interface User {
  userId: string;
  balance: number;
  is_free_account: number;
}

interface Transaction {
  id: number;
  userId: string;
  amount: number;
  pages: number;
  type: string;
  status: string;
  paymentMethod?: string | null;
  description?: string | null;
  timestamp: string;
}

export default function UsersPage() {
  const { t, locale, formatCurrency, formatDateTime } = useI18n();
  const { selectedUserId, setSelectedUserId, clearSelectedUserId } =
    useAppStore();
  const [searchQuery, setSearchQuery] = useState(selectedUserId || "");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userTransactions, setUserTransactions] = useState<Transaction[]>([]);
  const [depositAmount, setDepositAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card">("cash");
  const [newUserId, setNewUserId] = useState("");
  const [newUserIsFree, setNewUserIsFree] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingUserTransactions, setLoadingUserTransactions] = useState(false);
  const [chargeAmount, setChargeAmount] = useState("");
  const [chargeDescription, setChargeDescription] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const searchUsers = useCallback(async (query?: string) => {
    setLoadingUsers(true);
    try {
      const searchVal = (query ?? "").toLowerCase();
      const url = searchVal
        ? `/api/users?search=${encodeURIComponent(searchVal)}`
        : "/api/users";
      const res = await fetch(url);
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error("Failed to search users:", error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchUserTransactions = useCallback(async (userId: string) => {
    setLoadingUserTransactions(true);
    try {
      const res = await fetch(
        `/api/transactions?userId=${encodeURIComponent(userId)}&exact=1&limit=20`,
      );
      const data = await res.json();
      setUserTransactions(data.transactions || []);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    } finally {
      setLoadingUserTransactions(false);
    }
  }, []);

  useEffect(() => {
    searchUsers(searchQuery);
  }, [searchUsers, searchQuery]);

  const selectUser = useCallback(
    (user: User) => {
      setSelectedUser(user);
      setSelectedUserId(user.userId);
      fetchUserTransactions(user.userId);
    },
    [setSelectedUserId, fetchUserTransactions],
  );

  useEffect(() => {
    if (selectedUserId && users.length > 0) {
      const found = users.find((u) => u.userId === selectedUserId);
      if (found && !selectedUser) {
        selectUser(found);
      }
    }
  }, [selectedUserId, users, selectedUser, selectUser]);

  const handleDeposit = async () => {
    if (!selectedUser || !depositAmount) return;
    const amountCents = Math.round(parseFloat(depositAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast.error(t("toast.depositInvalid"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.userId,
          amount: amountCents,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          t("toast.depositSuccess", {
            amount: formatCurrency(amountCents),
            userId: selectedUser.userId,
            balance: formatCurrency(data.newBalance),
          }),
        );
        setDepositAmount("");
        setSelectedUser({ ...selectedUser, balance: data.newBalance });
        fetchUserTransactions(selectedUser.userId);
        searchUsers(searchQuery);
      } else {
        toast.error(t("toast.depositFailed"));
      }
    } catch {
      toast.error(t("toast.depositFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCharge = async () => {
    if (!selectedUser || !chargeAmount || !chargeDescription.trim()) return;
    const amountCents = Math.round(parseFloat(chargeAmount) * 100);
    if (isNaN(amountCents) || amountCents <= 0) {
      toast.error(t("toast.chargeInvalid"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users/charge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.userId,
          amount: amountCents,
          description: chargeDescription.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          t("toast.chargeSuccess", {
            amount: formatCurrency(amountCents),
            userId: selectedUser.userId,
            balance: formatCurrency(data.newBalance),
          }),
        );
        setChargeAmount("");
        setChargeDescription("");
        setSelectedUser({ ...selectedUser, balance: data.newBalance });
        fetchUserTransactions(selectedUser.userId);
        searchUsers(searchQuery);
      } else if (res.status === 400) {
        toast.error(t("toast.chargeInsufficientBalance"));
      } else {
        toast.error(t("toast.chargeFailed"));
      }
    } catch {
      toast.error(t("toast.chargeFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newUserId.trim()) {
      toast.error(t("toast.userIdRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: newUserId.trim().toLowerCase(),
          is_free_account: newUserIsFree,
        }),
      });
      if (res.ok) {
        toast.success(t("toast.userCreated", { name: newUserId }));
        setNewUserId("");
        setNewUserIsFree(false);
        setCreateDialogOpen(false);
        searchUsers(searchQuery);
      } else if (res.status === 409) {
        toast.error(t("toast.userAlreadyExists"));
      } else {
        toast.error(t("toast.userCreateFailed"));
      }
    } catch {
      toast.error(t("toast.userCreateFailed"));
    } finally {
      setLoading(false);
    }
  };

  const toggleFreeAccount = async (user: User) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.userId,
          is_free_account: !user.is_free_account,
        }),
      });
      if (res.ok) {
        toast.success(
          user.is_free_account
            ? t("toast.userNowNormal", { userId: user.userId })
            : t("toast.userNowFree", { userId: user.userId }),
        );
        searchUsers(searchQuery);
        if (selectedUser?.userId === user.userId) {
          setSelectedUser({
            ...selectedUser,
            is_free_account: user.is_free_account ? 0 : 1,
          });
        }
      }
    } catch {
      toast.error(t("toast.userUpdateFailed"));
    }
  };

  const handleDeleteUser = async (userId: string) => {
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        toast.success(t("toast.userDeleted", { userId }));
        setSelectedUser(null);
        clearSelectedUserId();
        searchUsers(searchQuery);
      } else {
        toast.error(t("toast.userDeleteFailed"));
      }
    } catch {
      toast.error(t("toast.userDeleteFailed"));
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "default";
      case "pending":
        return "secondary";
      case "refunded":
        return "outline";
      case "failed":
        return "destructive";
      default:
        return "default";
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

  const isCreditTransaction = (type: string) => type === "deposit";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t("users.title")}</h1>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> {t("users.newUser")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("users.createNewUser")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="newUserId">{t("users.userId")}</Label>
                <Input
                  id="newUserId"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder={t("users.userIdPlaceholder")}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isFree"
                  checked={newUserIsFree}
                  onChange={(e) => setNewUserIsFree(e.target.checked)}
                  className="h-4 w-4"
                />
                <Label htmlFor="isFree">{t("users.freeAccount")}</Label>
              </div>
              <Button
                onClick={handleCreateUser}
                disabled={loading}
                className="w-full"
              >
                {t("users.createUser")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("users.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* User Cards Grid */}
      {loadingUsers ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(8)].map((_, index) => (
            <Card key={`user-skeleton-${index}`}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : users.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("users.noUsersFound")}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {users.map((user) => (
            <Card
              key={user.userId}
              className="cursor-pointer transition-colors hover:bg-accent"
              onClick={() => selectUser(user)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium truncate">{user.userId}</p>
                  {user.is_free_account ? (
                    <Badge variant="secondary">
                      {t("users.freeAccountBadge")}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {t("common.balance")}: {formatCurrency(user.balance)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* User Detail Dialog */}
      <Dialog
        open={!!selectedUser}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedUser(null);
            setDepositAmount("");
            clearSelectedUserId();
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[85vh] overflow-y-auto overflow-x-hidden">
          {selectedUser && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between pr-6">
                  <span>{selectedUser.userId}</span>
                  {selectedUser.is_free_account ? (
                    <Badge variant="secondary">
                      {t("users.freeAccountLabel")}
                    </Badge>
                  ) : (
                    <Badge>
                      {t("common.balance")}:{" "}
                      {formatCurrency(selectedUser.balance)}
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-6 pt-2">
                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleFreeAccount(selectedUser)}
                  >
                    {selectedUser.is_free_account ? (
                      <>
                        <UserX className="h-4 w-4 mr-2" />{" "}
                        {t("users.makeNormal")}
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4 mr-2" />{" "}
                        {t("users.makeFree")}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> {t("users.deleteUser")}
                  </Button>
                  <AlertDialog
                    open={deleteConfirmOpen}
                    onOpenChange={setDeleteConfirmOpen}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t("users.deleteUser")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("toast.userDeleteConfirm", {
                            userId: selectedUser.userId,
                          })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t("common.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDeleteUser(selectedUser.userId)}
                        >
                          {t("common.confirm")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Deposit */}
                <div className="space-y-2">
                  <Label>{t("users.addDeposit")}</Label>
                  <div className="flex gap-2 mb-2">
                    <Button
                      variant={paymentMethod === "cash" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMethod("cash")}
                    >
                      {t("users.paymentCash")}
                    </Button>
                    <Button
                      variant={paymentMethod === "card" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentMethod("card")}
                    >
                      {t("users.paymentCard")}
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder={t("users.depositPlaceholder")}
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                    />
                    <Button
                      onClick={handleDeposit}
                      disabled={loading || !depositAmount}
                    >
                      <Euro className="h-4 w-4 mr-2" /> {t("common.deposit")}
                    </Button>
                  </div>
                </div>

                {/* Manual Charge */}
                <div className="space-y-2">
                  <Label>{t("users.manualCharge")}</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("users.chargeDescriptionPlaceholder")}
                      value={chargeDescription}
                      onChange={(e) => setChargeDescription(e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder={t("users.chargePlaceholder")}
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      className="w-40 shrink-0"
                    />
                    <Button
                      onClick={handleCharge}
                      disabled={loading || !chargeAmount || !chargeDescription}
                      variant="destructive"
                      className="shrink-0"
                    >
                      <MinusCircle className="h-4 w-4 mr-2" />{" "}
                      {t("users.charge")}
                    </Button>
                  </div>
                </div>

                {/* Recent Transactions */}
                <div className="space-y-2">
                  <h3 className="font-semibold text-sm">
                    {t("users.recentTransactions")}
                  </h3>
                  {loadingUserTransactions ? (
                    <div className="space-y-2">
                      {[...Array(4)].map((_, index) => (
                        <div
                          key={`tx-skeleton-${index}`}
                          className="grid grid-cols-6 gap-3 rounded-md border p-3"
                        >
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-8" />
                          <Skeleton className="h-6 w-24 rounded-full" />
                          <Skeleton className="h-4 w-full" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      ))}
                    </div>
                  ) : userTransactions.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {t("users.noTransactions")}
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("common.type")}</TableHead>
                            <TableHead>{t("common.amount")}</TableHead>
                            <TableHead>{t("common.pages")}</TableHead>
                            <TableHead>{t("common.status")}</TableHead>
                            <TableHead>{t("common.date")}</TableHead>
                            <TableHead className="w-[50px]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {userTransactions.map((tx) => (
                            <TableRow key={tx.id}>
                              <TableCell>
                                {tx.type === "manual" && tx.description
                                  ? `${typeLabel(tx.type)}: ${tx.description}`
                                  : typeLabel(tx.type)}
                              </TableCell>
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
                              <TableCell>{tx.pages || "-"}</TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    statusColor(tx.status) as
                                      | "default"
                                      | "secondary"
                                      | "outline"
                                      | "destructive"
                                  }
                                >
                                  {statusLabel(tx.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDateTime(tx.timestamp)}
                              </TableCell>
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    void generateInvoicePDF(tx, locale)
                                  }
                                  title={t("common.downloadReceipt")}
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
