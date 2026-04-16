"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useI18n } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  LayoutDashboard,
  Users,
  FileText,
  Settings,
  LogOut,
  Printer,
  Sun,
  Moon,
  Monitor,
  Globe,
  Timer,
} from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems: {
  titleKey: TranslationKey;
  href: string;
  icon: typeof LayoutDashboard;
}[] = [
  { titleKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { titleKey: "nav.users", href: "/users", icon: Users },
  { titleKey: "nav.jobs", href: "/jobs", icon: FileText },
  { titleKey: "nav.settings", href: "/settings", icon: Settings },
];

function LogoIcon() {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <Printer className="h-6 w-6 text-primary" />;
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[oklch(0.9846_0.0017_247.8389)] p-1.5">
      <Image
        src="/logo.svg"
        alt="Logo"
        width={48}
        height={48}
        className="h-full w-full object-contain"
        onError={() => setImgError(true)}
      />
    </div>
  );
}

function useSessionTimer() {
  const [timeoutMinutes, setTimeoutMinutes] = useState<number>(60);
  const [secondsLeft, setSecondsLeft] = useState<number>(60 * 60);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef<number>(Date.now() + 60 * 60 * 1000);

  const resetTimer = useCallback((minutes: number) => {
    if (minutes <= 0) {
      // Disabled
      deadlineRef.current = 0;
      setSecondsLeft(0);
      return;
    }
    deadlineRef.current = Date.now() + minutes * 60 * 1000;
    setSecondsLeft(minutes * 60);
  }, []);

  // Fetch timeout setting on mount
  useEffect(() => {
    const fetchTimeout = async () => {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        const val = parseInt(data.session_timeout || "60", 10);
        setTimeoutMinutes(val);
        resetTimer(val);
      } catch {
        // Default 60 minutes
        setTimeoutMinutes(60);
        resetTimer(60);
      }
    };
    fetchTimeout();
  }, [resetTimer]);

  // Listen for settings changes from the settings page
  useEffect(() => {
    const handler = (e: Event) => {
      const val = (e as CustomEvent).detail as number;
      setTimeoutMinutes(val);
      resetTimer(val);
    };
    window.addEventListener("session-timeout-changed", handler);
    return () => window.removeEventListener("session-timeout-changed", handler);
  }, [resetTimer]);

  // Countdown interval
  useEffect(() => {
    if (timeoutMinutes <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      const remaining = Math.max(
        0,
        Math.round((deadlineRef.current - Date.now()) / 1000),
      );
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        signOut({ callbackUrl: `${window.location.origin}/login` });
      }
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeoutMinutes]);

  // Reset timer on user activity
  useEffect(() => {
    if (timeoutMinutes <= 0) return;

    const onActivity = () => {
      deadlineRef.current = Date.now() + timeoutMinutes * 60 * 1000;
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, onActivity));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [timeoutMinutes]);

  const isDisabled = timeoutMinutes <= 0;

  return { secondsLeft, isDisabled };
}

export function AppSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t, locale, setLocale } = useI18n();
  const { setTheme, theme } = useTheme();
  const { secondsLeft, isDisabled } = useSessionTimer();

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-6 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-lg font-bold">{t("app.name")}</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.titleKey)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-4 space-y-2">
        {/* Language & Theme Controls */}
        <div className="flex gap-1 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("nav.language")}
              >
                <Globe className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={t("nav.theme")}
              >
                <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
        {session?.user?.name && (
          <p className="text-sm text-muted-foreground px-2 truncate">
            {t("nav.signedInAs")}{" "}
            <span className="font-medium text-foreground">
              {session.user.name}
            </span>
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            className="flex-1 justify-start gap-2"
            onClick={() =>
              signOut({ callbackUrl: `${window.location.origin}/login` })
            }
          >
            <LogOut className="h-4 w-4" />
            {t("nav.logout")}
          </Button>
          {!isDisabled && (
            <div
              className="flex items-center gap-1 pr-2"
              title={t("nav.sessionExpires")}
            >
              <Timer className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span
                className={`text-xs font-mono ${secondsLeft <= 60 ? "text-destructive font-semibold" : "text-muted-foreground"}`}
              >
                {formatTime(secondsLeft)}
              </span>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
