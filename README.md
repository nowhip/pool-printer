# Pool-Printer – Druckmanagement & Abrechnungssystem

Ein schlankes System zur Verwaltung und Abrechnung von Druckaufträgen in einem PC-Pool (z. B. Uni, Copyshop, Bibliothek).

> 🌍 [English version below](#pool-printer--print-management--billing-system)

---

## Überblick

Das System besteht aus **drei Komponenten**:

| Komponente            | Beschreibung                                                                                                                                                                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js Web-App**   | Dashboard für Aufsichtspersonen: Guthaben aufladen, Druckjobs & Nutzer verwalten, Preise konfigurieren, Statistiken einsehen. Außerdem Public-Self-Service unter `/public` für normale PC-Nutzer.                                              |
| **Print Middleware**  | Node.js-Skript auf dem Windows Print Server. Kommuniziert mit dem Windows Print Spooler, fängt Druckaufträge ab, prüft Guthaben über die API, gibt Drucker kurzzeitig frei, druckt den Job und pausiert den Drucker danach wieder automatisch. |
| **Windows SSO Proxy** | Node.js-Proxy mit integrierter Windows-Authentifizierung (SSPI). Nimmt den Benutzer per AD/Windows-Session entgegen und leitet ihn als Header `x-remote-user` an die Web-App weiter.                                                           |

## Features

- 💸 **Guthaben aufladen** – Aufsichtspersonen laden Nutzerkonten über das Dashboard auf
- 🛠️ **Manuelle Abbuchung** – Sonderdienste (z. B. Buch binden, Laminieren) können von der Aufsichtsperson manuell vom Guthaben abgebucht werden
- 🖨️ **Automatische Abrechnung** – Druckjobs werden erkannt → Guthaben geprüft → bei Erfolg Drucker freigegeben, Job gedruckt & abgebucht → Drucker wieder pausiert
- 🔄 **Load Balancing** – Windows Printer Pooling: mehrere physische Drucker hinter einem virtuellen Drucker
- 🎨 **Farbe & S/W** – Getrennte, konfigurierbare Preise pro Seite
- 🖨️ **Einzeldrucker-Modus** – Funktioniert auch nur mit einem S/W-Drucker (Farbdrucker ist optional)
- 📊 **Statistiken** – Umsatz, Seitenanzahl, Druckaufträge (24h / 1 Woche / 1 Monat / 1 Jahr)
- 🛡️ **Aufsichts-Accounts** – Kostenloses Drucken, nicht in Statistiken erfasst
- 🔙 **Auto-Refund** – Automatische Rückerstattung bei Druckerfehlern (+ manuelle Stornierung im Dashboard)
- 🧾 **PDF-Belege** – Für jede Transaktion und jeden Druckauftrag als PDF herunterladbar (inkl. Firmendaten, Steuer & Logo)
- 🎨 **Eigenes Logo** – `public/logo.svg` ablegen → wird automatisch auf PDF-Belegen, in der Sidebar und als Favicon verwendet
- 🔡 **Automatische Kleinschreibung** – Alle Benutzer-IDs werden systemweit automatisch in Kleinbuchstaben umgewandelt (siehe [Benutzer-ID Normalisierung](#benutzer-id-normalisierung))
- 👤 **Auto-Erstellung** – Nutzer werden automatisch beim ersten Druckauftrag oder bei der ersten Einzahlung angelegt
- 👥 **Public Self-Service** – `/public` zeigt normalen PC-Nutzern ihr eigenes Guthaben, ihre eigene Transaktionshistorie und PDF-Belege (ohne Supervisor-Login)
- 🔐 **Windows SSO Integration** – Benutzerauflösung über `x-remote-user` (vom integrierten SSO-Proxy) mit automatischer Normalisierung (`DOMAIN\\user` / `user@domain` → `user`)
- 🌍 **i18n** – Deutsch (Standard) & Englisch umschaltbar
- 🌙 **Dark Mode** – Hell / Dunkel / System-Einstellung

## Tech Stack

| Technologie                       | Verwendung                    |
| --------------------------------- | ----------------------------- |
| Next.js (App Router)              | Frontend & API                |
| SQLite (better-sqlite3)           | Datenbank (Raw SQL, kein ORM) |
| Tailwind CSS + shadcn/ui          | Styling & UI-Komponenten      |
| Zustand                           | Client State Management       |
| jsPDF                             | PDF-Beleg-Generierung         |
| NextAuth (Credentials)            | Authentifizierung (JWT)       |
| next-themes                       | Dark Mode                     |
| Node.js + TypeScript + PowerShell | Print Middleware              |
| Node.js + node-expose-sspi        | Windows SSO Proxy             |

---

## Installation & Setup

### Voraussetzungen

- **Node.js** ≥ 18
- **Windows** (für die Print Middleware – nutzt PowerShell-Cmdlets)
- Mindestens ein installierter Drucker (S/W). Farbdrucker ist optional.

### 1. Repository klonen & Abhängigkeiten installieren

```bash
git clone <repo-url>
cd pool-printer
npm install
```

### 2. Umgebungsvariablen konfigurieren

Erstelle eine Datei **`.env.local`** im Projektroot (`pool-printer/.env.local`):

```env
NEXTAUTH_SECRET=ein-langes-zufaelliges-passwort
NEXTAUTH_URL=http://localhost:3000
API_KEY=dein-api-key-hier
LAN_ONLY=1
```

#### Alle Umgebungsvariablen – Web-App

| Variable          | Pflicht | Standard | Beschreibung                                                                                                                                          |
| ----------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_SECRET` | ✅ Ja   | –        | Geheimer Schlüssel für JWT-Token-Verschlüsselung. Muss ein langer, zufälliger String sein. Kann z. B. mit `openssl rand -base64 32` generiert werden. |
| `NEXTAUTH_URL`    | ✅ Ja   | –        | Die Basis-URL der Web-App. Lokal: `http://localhost:3000`. In Produktion die echte Domain. Wird auch von der Print Middleware als API-URL verwendet.  |
| `API_KEY`         | ✅ Ja   | –        | API-Schlüssel, den die Print Middleware verwendet, um sich bei der Web-App zu authentifizieren. Muss in Middleware und Web-App **identisch** sein.    |

#### Umgebungsvariablen – Windows SSO Proxy (Optional)

| Variable              | Pflicht | Standard    | Beschreibung                                                                                      |
| --------------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `SSO_PROXY_PORT`      | Nein    | `3000`      | Öffentlicher Port des SSO-Proxys. Hier greifen Benutzer im Browser zu.                            |
| `NEXT_INTERNAL_PORT`  | Nein    | `3100`      | Interner Next.js-Port hinter dem SSO-Proxy.                                                       |
| `NEXT_INTERNAL_HOST`  | Nein    | `127.0.0.1` | Host für den internen Next.js-Prozess.                                                            |
| `SSO_PROXY_SKIP_NEXT` | Nein    | `0`         | Bei `1` startet der Proxy **keinen** internen Next.js-Prozess (für externe Prozesssteuerung).     |
| `LAN_ONLY`            | Nein    | `1`         | Bei `1` sind nur Loopback + privates LAN erlaubt (Proxy + `/api/print`). Bei `0` keine IP-Sperre. |

#### Alle Umgebungsvariablen – Print Middleware

Diese Variablen liegen ebenfalls in derselben Root-Datei **`.env.local`** (keine separate Middleware-`.env`):

| Variable        | Pflicht | Standard         | Beschreibung                                                                                                                  |
| --------------- | ------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `API_KEY`       | ✅ Ja   | –                | API-Schlüssel – **muss identisch** mit `API_KEY` in `.env.local` sein.                                                        |
| `POLL_INTERVAL` | Nein    | `3000`           | Abfrage-Intervall in Millisekunden. Wie oft der Print Spooler nach neuen Jobs geprüft wird.                                   |
| `PRINTER_BW`    | Nein    | `PoolDrucker_SW` | Name des virtuellen S/W-Druckers in Windows.                                                                                  |
| `PRINTER_COLOR` | Nein    | _(leer)_         | Name des virtuellen Farbdruckers in Windows. **Optional** – wenn leer oder nicht gesetzt, wird nur der S/W-Drucker überwacht. |

#### Umgebungsvariablen – PDF-Belege (Optional)

Diese Werte erscheinen auf heruntergeladenen Belegen. Alle sind optional – ohne Angabe wird "Pool Printer" als Absender verwendet.

| Variable                              | Standard | Beschreibung                                                                           |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_INVOICE_COMPANY_NAME`    | –        | Firmen-/Organisationsname, z. B. `Uni Musterstadt – Copy Center`.                      |
| `NEXT_PUBLIC_INVOICE_COMPANY_ADDRESS` | –        | Adresse. Mehrere Zeilen mit `\|` trennen, z. B. `Musterstraße 1 \| 12345 Musterstadt`. |
| `NEXT_PUBLIC_INVOICE_COMPANY_PHONE`   | –        | Telefonnummer.                                                                         |
| `NEXT_PUBLIC_INVOICE_COMPANY_EMAIL`   | –        | E-Mail-Adresse.                                                                        |
| `NEXT_PUBLIC_INVOICE_TAX_ID`          | –        | Steuernummer oder USt-IdNr., z. B. `DE123456789`.                                      |
| `NEXT_PUBLIC_INVOICE_TAX_RATE`        | `0`      | Steuersatz in % (z. B. `19`). Bei `0` wird keine Steuer auf dem Beleg ausgewiesen.     |
| `NEXT_PUBLIC_INVOICE_CURRENCY`        | `EUR`    | Währung als ISO-4217-Code.                                                             |

#### Logo

Lege eine Datei **`public/logo.svg`** im Projektordner ab. Sie wird automatisch verwendet als:

- **Favicon** im Browser-Tab
- **Logo** in der Sidebar (anstelle des Drucker-Icons)
- **Briefkopf** auf PDF-Belegen (oben links)

Kein Env-Eintrag nötig – ohne `logo.svg` wird ein Standard-Drucker-Icon angezeigt.

> ⚠️ **Wichtig:** Alle Variablen (Web-App, Middleware, SSO) werden zentral in der Root-`.env.local` gepflegt.

### 3. Datenbank initialisieren

```bash
npm run db:init
```

Erstellt die SQLite-Datenbank unter `data/pool-printer.db` mit dem Standard-Login:

- **Benutzername:** `root`
- **Passwort:** `root`

> ⚠️ Erstelle nach dem ersten Login einen neuen eigenen Supervisor und lösche root!

### 4. Mit Windows SSO starten

```bash
# Produktion mit Windows SSO
npm run build
npm run start:sso
```

Der Proxy ist unter `http://localhost:3000` erreichbar und leitet intern an Next.js (`http://127.0.0.1:3100`) weiter.

---

## Drucker einrichten (Windows)

Die Middleware benötigt mindestens einen virtuellen S/W-Drucker (Standard: **`PoolDrucker_SW`**). Ein Farbdrucker (**`PRINTER_COLOR`**) ist optional.

### Drucker prüfen

```powershell
Get-Printer | Select-Object Name, PortName, DriverName, PrinterStatus
```

### Drucker umbenennen

```powershell
Rename-Printer -Name "Aktueller Druckername" -NewName "PoolDrucker_SW"

# Optional: Farbdrucker
Rename-Printer -Name "Aktueller Farbdrucker" -NewName "PoolDrucker_Farbe"
```

Oder alternativ die Middleware-Variablen `PRINTER_BW` / `PRINTER_COLOR` auf die echten Druckernamen setzen.

### Printer Pooling (Load Balancing für mehrere S/W-Drucker)

Wenn du **mehrere physische S/W-Drucker** hast, kannst du Windows Printer Pooling verwenden. Die Studenten sehen dann nur **einen** virtuellen Drucker, Windows verteilt die Jobs automatisch auf den nächsten freien Drucker.

**Einrichtung:**

1. Stelle sicher, dass beide physischen Drucker installiert sind und funktionieren
2. Merke dir die **Portnamen** beider Drucker:
   ```powershell
   Get-Printer | Select-Object Name, PortName
   ```
3. Einen Drucker auf `PoolDrucker_SW` umbenennen:
   ```powershell
   Rename-Printer -Name "HP LaserJet 1" -NewName "PoolDrucker_SW"
   ```
4. **Druckerpool aktivieren:**
   - **Systemsteuerung** → **Geräte und Drucker**
   - Rechtsklick auf `PoolDrucker_SW` → **Druckereigenschaften**
   - Tab **Anschlüsse** (Ports)
   - Haken bei **☑ Druckerpool aktivieren** (unten)
   - **Beide Ports** anhaken (den eigenen + den des zweiten Druckers)
   - **OK** klicken
5. Zweiten Drucker entfernen (läuft jetzt über den Pool):
   ```powershell
   Remove-Printer -Name "HP LaserJet 2"
   ```

> Das gleiche kann auch für den Farbdrucker gemacht werden, falls mehrere vorhanden sind.

### Drucker anhalten (WICHTIG!)

Damit die Middleware Jobs abfangen kann, müssen die Drucker initial auf **"Angehalten"** stehen. Die Middleware übernimmt danach das automatische Pausieren und Freigeben:

1. **Systemsteuerung** → **Geräte und Drucker**
2. Rechtsklick auf `PoolDrucker_SW` → **Alle Druckaufträge anzeigen**
3. Menü **Drucker** → **Drucker anhalten** ✅
4. Das gleiche für den Farbdrucker (falls vorhanden)

> ⚠️ **Ohne diesen Schritt werden Jobs sofort gedruckt und die Middleware kann sie nicht abfangen!**

---

## Print Middleware starten

In einem **separaten Terminal** (muss dauerhaft laufen):

```bash
npx tsx print-middleware/index.ts
```

Erwartete Ausgabe (mit Farbdrucker):

```
=== Print Middleware Starting ===
API URL: http://localhost:3000
BW Printer: PoolDrucker_SW
Color Printer: PoolDrucker_Farbe
Poll interval: 3000ms
================================
```

Ohne Farbdrucker (nur S/W):

```
=== Print Middleware Starting ===
API URL: http://localhost:3000
BW Printer: PoolDrucker_SW
Color Printer: (none)
Poll interval: 3000ms
================================
```

Um eigene Druckernamen und API-Key zu verwenden:

```bash
# Windows PowerShell
$env:API_KEY="mein-geheimer-key"; $env:PRINTER_BW="MeinDrucker"; npx tsx print-middleware/index.ts
```

Für den Dauerbetrieb die Werte direkt in der Root-`.env.local` setzen.

> 💡 Die Middleware-Logs werden auf **Englisch** ausgegeben.

---

## So funktioniert das System

```
Student druckt auf "PoolDrucker_SW"
        │
        ▼
Job wird in die Warteschlange eingereiht (Drucker ist pausiert)
        │
        ▼
Middleware erkennt neuen Job (Polling alle 3 Sekunden)
        │
        ▼
API prüft: Hat der Nutzer genug Guthaben?
        │
   ┌────┴────┐
   │         │
   ▼         ▼
  JA        NEIN
   │         │
   ▼         ▼
Guthaben    Job wird
abgebucht   gelöscht
   │
   ▼
Drucker wird per WMI freigegeben (Resume)
   │
   ▼
Job wird gedruckt
   │
   ▼
Middleware erkennt Job-Abschluss
   │
   ├── Erfolgreich → API bestätigt Druck
   │
   └── Fehler → Automatische Rückerstattung
   │
   ▼
Drucker wird wieder pausiert (Pause)
(Wenn keine weiteren Jobs in der Warteschlange sind)
```

### Public Self-Service (ohne Supervisor-Login)

- Route `/public` ist öffentlich erreichbar.
- Die API-Routen `/api/public/me`, `/api/public/create-account`, `/api/public/transactions` sind ebenfalls öffentlich, aber strikt auf den aufgelösten Windows-Benutzer begrenzt.
- Der SSO-Proxy setzt den Header `x-remote-user`; die App normalisiert auf Kleinbuchstaben.
- Falls ein Konto noch nicht existiert, kann es auf `/public` direkt erstellt werden (Startguthaben `0`).
- Root-Weiterleitung: ohne Supervisor-Session `/` → `/public`, mit Supervisor-Session `/` → `/dashboard`.

### Benutzer-ID Normalisierung

Alle Benutzer-IDs werden **systemweit automatisch in Kleinbuchstaben** umgewandelt. Das verhindert Duplikate wie `MaxMuster` und `maxmuster`.

Die Normalisierung greift an **allen Eingabepunkten**:

| Stelle                | Beschreibung                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------- |
| **Windows SSO Proxy** | SSPI-Benutzer wird aus `DOMAIN\\user` / `user@domain` auf `user` normalisiert und lowercased |
| **Print Middleware**  | Spooler-Benutzername (`UserName`) wird mit derselben Regel normalisiert und lowercased       |
| **API-Routen**        | Alle API-Endpunkte (Nutzer-CRUD, Einzahlung, Abbuchung, Reservierung) lowercasen die userId  |
| **Web-UI**            | Nutzererstellung und Suchfilter wandeln Eingaben direkt in Kleinbuchstaben um                |

> 💡 Das bedeutet: Egal ob ein Windows-Nutzer als `MAXMUSTER`, `MaxMuster` oder `maxmuster` druckt – es wird immer als `maxmuster` verarbeitet.
>
> ℹ️ Es gibt **keinen** Fallback auf Server-OS-Usernamen. Verwendet wird immer der Benutzer aus dem jeweiligen Request/Spooler-Job.
>
> ✅ In Umgebungen, in denen sich Namen nur durch Groß-/Kleinschreibung unterscheiden, bleiben SSO und Print Middleware konsistent.

---

## Projektstruktur

```
pool-printer/
├── .env.local                  # Zentrale Umgebungsvariablen (Web-App, Middleware, SSO)
├── server/
│   └── windows-sso-proxy.ts    # Windows SSO Proxy (node-expose-sspi)
├── public/
│   └── logo.svg                # Eigenes Logo (optional)
├── data/
│   └── pool-printer.db         # SQLite-Datenbank (nach db:init)
├── print-middleware/
│   └── index.ts                # Print Middleware Skript
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root Layout
│   │   ├── login/page.tsx      # Login-Seite
│   │   ├── public/page.tsx     # Public Self-Service Seite
│   │   ├── api/public/         # Public Self-Service APIs
│   │   └── (dashboard)/
│   │       ├── dashboard/page.tsx  # Statistik-Dashboard
│   │       ├── users/page.tsx      # Nutzerverwaltung
│   │       ├── jobs/page.tsx       # Druckaufträge
│   │       └── settings/page.tsx   # Einstellungen & Preise
│   ├── components/
│   │   ├── app-sidebar.tsx     # Sidebar mit Navigation
│   │   ├── providers.tsx       # Session, Theme, i18n Provider
│   │   └── ui/                 # shadcn/ui Komponenten
│   ├── lib/
│   │   ├── db.ts               # Datenbankverbindung
│   │   ├── generate-invoice.ts # PDF-Beleg-Generierung
│   │   ├── useAppStore.ts      # Zustand Store
│   │   ├── windows-user.ts     # Windows-Benutzerauflösung/Normalisierung
│   │   └── i18n/               # Übersetzungen (de/en)
│   └── middleware.ts           # Auth & API-Key Middleware
└── scripts/
    └── init-db.js              # Datenbank-Initialisierung
```

---

## Verfügbare Scripts

| Befehl                              | Beschreibung                                                 |
| ----------------------------------- | ------------------------------------------------------------ |
| `npm run build`                     | Erstellt einen Produktions-Build                             |
| `npm run start:sso`                 | Startet den Windows SSO Proxy (inkl. internem Next.js Start) |
| `npm run db:init`                   | Initialisiert die SQLite-Datenbank                           |
| `npx tsx print-middleware/index.ts` | Startet die Print Middleware                                 |

---

## Startklar in 5 Minuten

### Einmalig (Ersteinrichtung)

```bash
# 1. Umgebungsvariablen anlegen
cp .env.example .env.local
# → .env.local öffnen und Werte für Web-App, Middleware und SSO eintragen

# 2. Abhängigkeiten installieren
npm install

# 3. Datenbank initialisieren
npm run db:init

# 4. Produktions-Build erstellen
npm run build
```

```powershell
# 5. Drucker einrichten (PowerShell als Admin):
# Drucker auf die erwarteten Namen umbenennen
Rename-Printer -Name "Dein SW-Drucker" -NewName "PoolDrucker_SW"

# Optional: Farbdrucker
Rename-Printer -Name "Dein Farbdrucker" -NewName "PoolDrucker_Farbe"

# Drucker anhalten – PFLICHT für den Erststart!
# → Systemsteuerung → Geräte und Drucker → Rechtsklick → Druckerwarteschlange
# → Menü "Drucker" → "Drucker anhalten" ✅
# Die Middleware übernimmt danach das automatische Pausieren/Freigeben.
```

> **Mehrere S/W-Drucker?** → Printer Pooling nutzen:
>
> 1. Einen Drucker auf `PoolDrucker_SW` umbenennen
> 2. Rechtsklick → **Druckereigenschaften** → Tab **Anschlüsse**
> 3. **☑ Druckerpool aktivieren** → beide Ports anhaken → OK
> 4. Zweiten Drucker entfernen (`Remove-Printer -Name "Drucker 2"`)
>
> Windows verteilt Jobs automatisch auf den nächsten freien Drucker.

### Bei jedem Start (2 Terminals, mit SSO)

```bash
# Terminal 1: SSO-Proxy starten (startet intern Next.js auf :3100)
npm run start:sso

# Terminal 2: Print Middleware starten
npx tsx print-middleware/index.ts
```

### Optional: Automatischer Start mit PM2

[PM2](https://pm2.keymetrics.io/) startet beide Prozesse automatisch und startet sie bei Absturz neu.

```bash
# PM2 global installieren (einmalig)
npm install -g pm2

# Beide Prozesse starten (mit SSO)
pm2 start npm --name "pool-printer-sso" -- run start:sso
pm2 start npx --name "pool-printer-middleware" -- tsx print-middleware/index.ts

# Beim Systemstart automatisch starten (Windows: pm2-startup)
pm2 save
pm2 startup

# Status prüfen
pm2 status

# Logs anzeigen
pm2 logs
```

---

---

# Pool-Printer – Print Management & Billing System

A lightweight system for managing and billing print jobs in a PC pool (e.g. university, copy shop, library).

> 🌍 [Deutsche Version oben](#pool-printer--druckmanagement--abrechnungssystem)

---

## Overview

The system consists of **three components**:

| Component             | Description                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Next.js Web App**   | Dashboard for supervisors: top up balances, manage print jobs & users, configure prices, view statistics. Includes public self-service at `/public` for regular PC users.                                                      |
| **Print Middleware**  | Node.js script on the Windows Print Server. Communicates with Windows Print Spooler, intercepts print jobs, checks balance via API, temporarily unpauses the printer, prints the job, and automatically re-pauses the printer. |
| **Windows SSO Proxy** | Node.js proxy with integrated Windows authentication (SSPI). Resolves the AD/Windows user session and forwards it to the web app as `x-remote-user`.                                                                           |

## Features

- 💸 **Balance Top-Up** – Supervisors top up user accounts via the dashboard
- 🛠️ **Manual Charges** – Special services (e.g. book binding, laminating) can be manually charged from a user's balance by the supervisor
- 🖨️ **Automatic Billing** – Print jobs detected → balance checked → on success: printer unpaused, job printed & charged → printer re-paused
- 🔄 **Load Balancing** – Windows Printer Pooling: multiple physical printers behind one virtual printer
- 🎨 **Color & B&W** – Separate, configurable per-page prices
- 🖨️ **Single Printer Mode** – Works with just a B&W printer (color printer is optional)
- 📊 **Statistics** – Revenue, page count, print jobs (24h / 1 week / 1 month / 1 year)
- 🛡️ **Supervisor Accounts** – Free printing, excluded from statistics
- 🔙 **Auto-Refund** – Automatic refund on printer errors (+ manual cancellation in dashboard)
- 🧾 **PDF Receipts** – Downloadable PDF for every transaction and print job (incl. company info, tax & logo)
- 🎨 **Custom Logo** – Place `public/logo.svg` → automatically used on PDF receipts, sidebar, and as favicon
- 🔡 **Automatic Lowercasing** – All user IDs are automatically lowercased system-wide (see [User ID Normalization](#user-id-normalization))
- 👤 **Auto-Creation** – Users are automatically created on their first print job or deposit
- 👥 **Public Self-Service** – `/public` lets regular PC users view their own balance, own transaction history, and PDF receipts (no supervisor login)
- 🔐 **Windows SSO Integration** – User resolution via `x-remote-user` (from integrated SSO proxy) with automatic normalization (`DOMAIN\\user` / `user@domain` → `user`)
- 🌍 **i18n** – German (default) & English switchable
- 🌙 **Dark Mode** – Light / Dark / System preference

## Tech Stack

| Technology                        | Purpose                    |
| --------------------------------- | -------------------------- |
| Next.js (App Router)              | Frontend & API             |
| SQLite (better-sqlite3)           | Database (Raw SQL, no ORM) |
| Tailwind CSS + shadcn/ui          | Styling & UI Components    |
| Zustand                           | Client State Management    |
| jsPDF                             | PDF Receipt Generation     |
| NextAuth (Credentials)            | Authentication (JWT)       |
| next-themes                       | Dark Mode                  |
| Node.js + TypeScript + PowerShell | Print Middleware           |
| Node.js + node-expose-sspi        | Windows SSO Proxy          |

---

## Installation & Setup

### Prerequisites

- **Node.js** ≥ 18
- **Windows** (for the Print Middleware – uses PowerShell cmdlets)
- At least one installed printer (B&W). Color printer is optional.

### 1. Clone Repository & Install Dependencies

```bash
git clone <repo-url>
cd pool-printer
npm install
```

### 2. Configure Environment Variables

Create a file **`.env.local`** in the project root (`pool-printer/.env.local`):

```env
NEXTAUTH_SECRET=a-long-random-password
NEXTAUTH_URL=http://localhost:3000
API_KEY=your-api-key-here
LAN_ONLY=1
```

#### All Environment Variables – Web App

| Variable          | Required | Default | Description                                                                                                                                 |
| ----------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXTAUTH_SECRET` | ✅ Yes   | –       | Secret key for JWT token encryption. Must be a long, random string. Generate with e.g. `openssl rand -base64 32`.                           |
| `NEXTAUTH_URL`    | ✅ Yes   | –       | Base URL of the web app. Locally: `http://localhost:3000`. In production, your actual domain. Also used by the Print Middleware as API URL. |
| `API_KEY`         | ✅ Yes   | –       | API key used by the Print Middleware to authenticate with the web app. Must be **identical** in middleware and web app.                     |

#### Environment Variables – Windows SSO Proxy (Optional)

| Variable              | Required | Default     | Description                                                                                        |
| --------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `SSO_PROXY_PORT`      | No       | `3000`      | Public port of the SSO proxy. This is where users access the app in the browser.                   |
| `NEXT_INTERNAL_PORT`  | No       | `3100`      | Internal Next.js port behind the SSO proxy.                                                        |
| `NEXT_INTERNAL_HOST`  | No       | `127.0.0.1` | Host used for the internal Next.js process.                                                        |
| `SSO_PROXY_SKIP_NEXT` | No       | `0`         | If set to `1`, the proxy does **not** launch an internal Next.js process.                          |
| `LAN_ONLY`            | No       | `1`         | If `1`, only loopback + private LAN are allowed (proxy + `/api/print`). If `0`, no IP restriction. |

#### All Environment Variables – Print Middleware

These variables are also kept in the same root **`.env.local`** file (no separate middleware `.env`):

| Variable        | Required | Default          | Description                                                                                                        |
| --------------- | -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| `API_KEY`       | ✅ Yes   | –                | API key – **must be identical** to `API_KEY` in `.env.local`.                                                      |
| `POLL_INTERVAL` | No       | `3000`           | Poll interval in milliseconds. How often the Print Spooler is checked for new jobs.                                |
| `PRINTER_BW`    | No       | `PoolDrucker_SW` | Name of the virtual B&W printer in Windows.                                                                        |
| `PRINTER_COLOR` | No       | _(empty)_        | Name of the virtual color printer in Windows. **Optional** – if empty or unset, only the B&W printer is monitored. |

#### Environment Variables – PDF Receipts (Optional)

These values appear on downloaded receipts. All are optional – without them, "Pool Printer" is used as the sender.

| Variable                              | Default | Description                                                          |
| ------------------------------------- | ------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_INVOICE_COMPANY_NAME`    | –       | Company/organization name, e.g. `University Copy Center`.            |
| `NEXT_PUBLIC_INVOICE_COMPANY_ADDRESS` | –       | Address. Separate lines with `\|`, e.g. `123 Main St \| 12345 City`. |
| `NEXT_PUBLIC_INVOICE_COMPANY_PHONE`   | –       | Phone number.                                                        |
| `NEXT_PUBLIC_INVOICE_COMPANY_EMAIL`   | –       | Email address.                                                       |
| `NEXT_PUBLIC_INVOICE_TAX_ID`          | –       | Tax ID, e.g. `DE123456789`.                                          |
| `NEXT_PUBLIC_INVOICE_TAX_RATE`        | `0`     | Tax rate in % (e.g. `19`). At `0`, no tax is shown on the receipt.   |
| `NEXT_PUBLIC_INVOICE_CURRENCY`        | `EUR`   | Currency as ISO-4217 code.                                           |

#### Logo

Place a file **`public/logo.svg`** in the project folder. It is automatically used as:

- **Favicon** in the browser tab
- **Logo** in the sidebar (replacing the printer icon)
- **Letterhead** on PDF receipts (top left)

No env entry needed – without `logo.svg`, a default printer icon is shown.

> ⚠️ **Important:** Keep all variables (web app, middleware, SSO) centrally in the root `.env.local`.

### 3. Initialize Database

```bash
npm run db:init
```

Creates the SQLite database at `data/pool-printer.db` with the default login:

- **Username:** `root`
- **Password:** `root`

> ⚠️ After the first login, create your own supervisor account and delete root!

### 4. Start with Windows SSO

```bash
# Production with Windows SSO
npm run build
npm run start:sso
```

The proxy is available at `http://localhost:3000` and forwards internally to Next.js (`http://127.0.0.1:3100`).

---

## Printer Setup (Windows)

The middleware requires at least one virtual B&W printer (default: **`PoolDrucker_SW`**). A color printer (**`PRINTER_COLOR`**) is optional.

### Check Printers

```powershell
Get-Printer | Select-Object Name, PortName, DriverName, PrinterStatus
```

### Rename Printers

```powershell
Rename-Printer -Name "Current Printer Name" -NewName "PoolDrucker_SW"

# Optional: Color printer
Rename-Printer -Name "Current Color Printer" -NewName "PoolDrucker_Farbe"
```

Or alternatively set the middleware variables `PRINTER_BW` / `PRINTER_COLOR` to your actual printer names.

### Printer Pooling (Load Balancing for Multiple B&W Printers)

If you have **multiple physical B&W printers**, you can use Windows Printer Pooling. Students see only **one** virtual printer, and Windows automatically distributes jobs to the next available printer.

**Setup:**

1. Make sure both physical printers are installed and working
2. Note the **port names** of both printers:
   ```powershell
   Get-Printer | Select-Object Name, PortName
   ```
3. Rename one printer to `PoolDrucker_SW`:
   ```powershell
   Rename-Printer -Name "HP LaserJet 1" -NewName "PoolDrucker_SW"
   ```
4. **Enable printer pooling:**
   - **Control Panel** → **Devices and Printers**
   - Right-click `PoolDrucker_SW` → **Printer Properties**
   - Tab **Ports**
   - Check **☑ Enable printer pooling** (bottom)
   - **Check both ports** (its own + the second printer's)
   - Click **OK**
5. Remove the second printer (now runs through the pool):
   ```powershell
   Remove-Printer -Name "HP LaserJet 2"
   ```

> The same can be done for the color printer if multiple are available.

### Pause Printers (IMPORTANT!)

For the middleware to intercept jobs, the printers must initially be set to **"Paused"**. The middleware handles automatic pausing and unpausing after that:

1. **Control Panel** → **Devices and Printers**
2. Right-click `PoolDrucker_SW` → **See what's printing**
3. Menu **Printer** → **Pause Printing** ✅
4. Same for the color printer (if configured)

> ⚠️ **Without this step, jobs will be printed immediately and the middleware cannot intercept them!**

---

## Starting the Print Middleware

In a **separate terminal** (must run continuously):

```bash
npx tsx print-middleware/index.ts
```

Expected output (with color printer):

```
=== Print Middleware Starting ===
API URL: http://localhost:3000
BW Printer: PoolDrucker_SW
Color Printer: PoolDrucker_Farbe
Poll interval: 3000ms
================================
```

Without color printer (B&W only):

```
=== Print Middleware Starting ===
API URL: http://localhost:3000
BW Printer: PoolDrucker_SW
Color Printer: (none)
Poll interval: 3000ms
================================
```

To use custom printer names and API key:

```bash
# Windows PowerShell
$env:API_KEY="my-secret-key"; $env:PRINTER_BW="MyPrinter"; npx tsx print-middleware/index.ts
```

For permanent configuration, set these values in the root `.env.local`.

---

## How the System Works

```
Student prints on "PoolDrucker_SW"
        │
        ▼
Job is queued (printer is paused)
        │
        ▼
Middleware detects new job (polling every 3 seconds)
        │
        ▼
API checks: Does the user have enough balance?
        │
   ┌────┴────┐
   │         │
   ▼         ▼
  YES        NO
   │         │
   ▼         ▼
Balance    Job is
charged    deleted
   │
   ▼
Printer is unpaused via WMI (Resume)
   │
   ▼
Job is printed
   │
   ▼
Middleware detects job completion
   │
   ├── Success → API confirms print
   │
   └── Error → Automatic refund
   │
   ▼
Printer is re-paused (Pause)
(If no more jobs are queued)
```

### Public Self-Service (without supervisor login)

- Route `/public` is publicly accessible.
- API routes `/api/public/me`, `/api/public/create-account`, `/api/public/transactions` are also public, but strictly scoped to the resolved Windows user.
- The SSO proxy sets the `x-remote-user` header; the app normalizes to lowercase.
- If an account does not exist yet, it can be created directly on `/public` (initial balance `0`).
- Root redirect behavior: without supervisor session `/` → `/public`, with supervisor session `/` → `/dashboard`.

### User ID Normalization

All user IDs are **automatically lowercased system-wide**. This prevents duplicates like `MaxMuster` and `maxmuster`.

Normalization is applied at **all entry points**:

| Location              | Description                                                                          |
| --------------------- | ------------------------------------------------------------------------------------ |
| **Windows SSO Proxy** | SSPI user is normalized from `DOMAIN\\user` / `user@domain` to `user` and lowercased |
| **Print Middleware**  | Spooler username (`UserName`) is normalized with the same rule and lowercased        |
| **API Routes**        | All API endpoints (user CRUD, deposit, charge, reserve) lowercase the userId         |
| **Web UI**            | User creation and search filters convert inputs to lowercase immediately             |

> 💡 This means: regardless of whether a Windows user prints as `MAXMUSTER`, `MaxMuster`, or `maxmuster` – it is always processed as `maxmuster`.
>
> ℹ️ There is **no** fallback to the server OS username. The identity always comes from the current request/spooler job.
>
> ✅ In environments where names differ only by letter case, SSO and Print Middleware stay consistent.

---

## Project Structure

```
pool-printer/
├── .env.local                  # Central environment variables (Web App, Middleware, SSO)
├── server/
│   └── windows-sso-proxy.ts    # Windows SSO proxy (node-expose-sspi)
├── public/
│   └── logo.svg                # Custom logo (optional)
├── data/
│   └── pool-printer.db         # SQLite database (after db:init)
├── print-middleware/
│   └── index.ts                # Print Middleware script
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root Layout
│   │   ├── login/page.tsx      # Login page
│   │   ├── public/page.tsx     # Public self-service page
│   │   ├── api/public/         # Public self-service APIs
│   │   └── (dashboard)/
│   │       ├── dashboard/page.tsx  # Statistics dashboard
│   │       ├── users/page.tsx      # User management
│   │       ├── jobs/page.tsx       # Print jobs
│   │       └── settings/page.tsx   # Settings & prices
│   ├── components/
│   │   ├── app-sidebar.tsx     # Sidebar with navigation
│   │   ├── providers.tsx       # Session, Theme, i18n Provider
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── db.ts               # Database connection
│   │   ├── generate-invoice.ts # PDF receipt generation
│   │   ├── useAppStore.ts      # Zustand store
│   │   ├── windows-user.ts     # Windows user resolving/normalization
│   │   └── i18n/               # Translations (de/en)
│   └── middleware.ts           # Auth & API key middleware
└── scripts/
    └── init-db.js              # Database initialization
```

---

## Available Scripts

| Command                             | Description                                                |
| ----------------------------------- | ---------------------------------------------------------- |
| `npm run build`                     | Create a production build                                  |
| `npm run start:sso`                 | Start Windows SSO proxy (including internal Next.js start) |
| `npm run db:init`                   | Initialize the SQLite database                             |
| `npx tsx print-middleware/index.ts` | Start the Print Middleware                                 |

---

## Ready in 5 Minutes

### One-Time (Initial Setup)

```bash
# 1. Create environment variables
cp .env.example .env.local
# → Open .env.local and set values for web app, middleware, and SSO

# 2. Install dependencies
npm install

# 3. Initialize database
npm run db:init

# 4. Create production build
npm run build
```

```powershell
# 5. Set up printers (PowerShell as Admin):
# Rename printers to expected names
Rename-Printer -Name "Your BW Printer" -NewName "PoolDrucker_SW"

# Optional: Color printer
Rename-Printer -Name "Your Color Printer" -NewName "PoolDrucker_Farbe"

# Pause printers – REQUIRED for initial start!
# → Control Panel → Devices and Printers → Right-click → See what's printing
# → Menu "Printer" → "Pause Printing" ✅
# The middleware handles automatic pausing/unpausing after that.
```

> **Multiple B&W printers?** → Use Printer Pooling:
>
> 1. Rename one printer to `PoolDrucker_SW`
> 2. Right-click → **Printer Properties** → Tab **Ports**
> 3. **☑ Enable printer pooling** → check both ports → OK
> 4. Remove second printer (`Remove-Printer -Name "Printer 2"`)
>
> Windows automatically distributes jobs to the next available printer.

### On Every Start (2 Terminals, with SSO)

```bash
# Terminal 1: Start SSO proxy (launches Next.js internally on :3100)
npm run start:sso

# Terminal 2: Start the Print Middleware
npx tsx print-middleware/index.ts
```

### Optional: Automatic Start with PM2

[PM2](https://pm2.keymetrics.io/) automatically starts both processes and restarts them on crash.

```bash
# Install PM2 globally (one-time)
npm install -g pm2

# Start both processes (with SSO)
pm2 start npm --name "pool-printer-sso" -- run start:sso
pm2 start npx --name "pool-printer-middleware" -- tsx print-middleware/index.ts

# Auto-start on system boot (Windows: pm2-startup)
pm2 save
pm2 startup

# Check status
pm2 status

# View logs
pm2 logs
```
