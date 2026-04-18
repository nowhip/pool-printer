# Pool Printer

Pool Printer is a local print-account and billing platform for campus or lab networks.
It combines:

- end-user self-service at `/public`
- a supervisor dashboard for account and payment operations
- print middleware for automated spooler-based billing

---

## Deutsch (Startklar)

### 1) Was das System macht

Pool Printer verwaltet Guthaben, Druckkosten und Transaktionen pro Nutzerkonto (`userId`).
Druckaufträge werden nicht direkt im Browser ausgelöst, sondern über Ubuntu-CUPS-Warteschlangen erkannt und serverseitig abgerechnet.

Kernfunktionen:

- Supervisor-Login über NextAuth Credentials
- Benutzerverwaltung: anlegen, aufladen, belasten, kostenlos markieren
- Self-Service für normale Nutzer über `/public`
- Automatische Druckabrechnung für Schwarz/Weiß und Farbe
- Manuelle Transaktionen
- 7-Tage-Löschantrag mit Restore-Fenster
- PDF-Quittungen und Rechnungen

### 2) Architektur

1. **Next.js app**
   - UI, API und SQLite access
   - Local default port: `3000`

2. **Next.js proxy (`src/proxy.ts`)**
   - Session protection for dashboard and internal APIs
   - Public passthrough for `/public` and `/api/public/*`
   - API key protection for `/api/print/*`
   - Optional LAN IP restriction via `LAN_ONLY`

3. **PowerShell launcher (`launch-pool-printer.ps1`, nur Windows-Clients)**
   - Liest den aktuellen Windows-Benutzernamen
   - Normalisiert ihn zu lowercase
   - Sendet Benutzername + Secret per POST an `/api/public/launch`
   - Öffnet danach die URL mit `?launchToken=...`

4. **Print middleware (`print-middleware/index.ts`)**
   - Polls Ubuntu CUPS queues
   - Reserves before print via `/api/print/reserve`
   - Confirms or cancels via `/api/print/confirm` and `/api/print/cancel`

### 3) Anforderungen

- Ubuntu Server (für App + Print Middleware)
- Node.js 20+
- npm
- CUPS installiert (`lpstat`, `cancel`, `cupsenable`, `cupsdisable` verfügbar)
- Zugriff auf die verwendeten CUPS-Queues
- Windows Clients für den Launcher-Flow (`launch-pool-printer.ps1`)

### 4) Setup

```bash
npm install
cp .env.example .env.local
npm run db:init
```

Erforderliche `.env.local` Werte:

- `NEXTAUTH_SECRET`
- `API_KEY`
- `PUBLIC_LAUNCH_SECRET`

### 5) Betrieb

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run start
npx tsx print-middleware/index.ts
```

Ubuntu-Startscript (Server):

```bash
chmod +x ./start-pool-printer.sh
./start-pool-printer.sh
```

### 6) Ubuntu Autostart (systemd)

Beispiel-Units liegen in `deploy/systemd/`:

- `pool-printer-app.service`
- `pool-printer-middleware.service`

Installation (Beispiel):

```bash
sudo cp deploy/systemd/pool-printer-app.service /etc/systemd/system/
sudo cp deploy/systemd/pool-printer-middleware.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pool-printer-app.service
sudo systemctl enable --now pool-printer-middleware.service
```

Hinweise:

- Passe in den Service-Dateien `WorkingDirectory`, `User` und `Group` an.
- Für die Middleware muss der User auf CUPS zugreifen können (z. B. Gruppe `lp`).

### 7) Public Launcher (PowerShell, Windows Clients)

Der Public-Flow arbeitet ohne IIS und ohne Header-Forwarding.

Standardstart:

```powershell
.\launch-pool-printer.ps1 -LaunchSecret "DEIN_SECRET"
```

Start gegen einen anderen Host:

```powershell
.\launch-pool-printer.ps1 -BaseUrl "http://server-name:3000/public" -LaunchSecret "DEIN_SECRET"
```

Das Script:

- liest den aktuellen Windows-Benutzer
- normalisiert den Namen auf lowercase
- sendet Benutzername + Secret per POST an `/api/public/launch`
- öffnet danach die URL mit `?launchToken=...`

Wichtig:

- Der Benutzername wird im Frontend und Backend zusätzlich normalisiert.
- Groß-/Kleinschreibung ist damit immer konsistent lowercase.

### 8) Umgebungsvariablen

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=change-me
API_KEY=change-me
PUBLIC_LAUNCH_SECRET=change-me
PUBLIC_LAUNCH_TTL_SECONDS=120
PRINTER_BW=pool_bw
PRINTER_COLOR=pool_color
LAN_ONLY=false
```

`PUBLIC_LAUNCH_SECRET` muss mit dem Secret übereinstimmen, das von `launch-pool-printer.ps1` verwendet wird.

### 9) Betriebslogik (End-to-End)

#### 9.1 Supervisor-Bereich

- Login über `/login`
- Dashboard zeigt Kennzahlen inkl. manueller Aufträge/Umsatz
- Benutzerseite hat zwei Sichten:
  - `Aktiv`
  - `Löschanträge`
- Nutzer mit `deletion_requested` sind aus normalen Abläufen ausgeklinkt

#### 9.2 Self-Service (`/public`)

- Zugriff auf `/public` nur mit gültigem `launchToken`
- Public-Benutzer wird serverseitig aus dem `launchToken` abgeleitet
- Falls kein Konto existiert: Konto kann angelegt werden
- Kontostand + Transaktionen sichtbar
- Löschantrag kann vom User selbst gestellt und innerhalb von 7 Tagen widerrufen werden

#### 9.3 Druckfluss

**Normal (erfolgreich):**

1. Print Middleware erkennt Job im Spooler
2. `/api/print/reserve` prüft:
   - Nutzerkonto vorhanden?
   - `account_state = active`?
   - ausreichendes Guthaben oder Free-Account?
3. Bei Erfolg: Job wird freigegeben, Transaktion `pending` angelegt
4. Bei erfolgreichem Druck: `/api/print/confirm` -> Transaktion `completed`
5. Drucker wird wieder pausiert, falls keine weiteren Aufträge ausstehen

Für Ubuntu/CUPS:

- `pages` wird mit Priorität ermittelt: `sheets` -> `job-impressions` -> `totalPages * copies` -> Fallback `1` (mit Log)
- Der Windows-Username von Clients wird weiterhin normalisiert (lowercase)

**Fehler: Nutzer nicht vorhanden oder unzureichendes Guthaben:**

- `/api/print/reserve` lehnt ab mit `allowed: false`
- Job wird direkt aus der Print Queue gelöscht
- Keine Transaktion wird angelegt

**Fehler während des Drucks:**

- Bei Fehler/Timeout ruft Middleware `/api/print/cancel` auf
- Transaktion wird `refunded`
- Guthaben wird rückgängig gemacht

### 10) API-Übersicht

Public:

- `POST /api/public/launch`
- `GET /api/public/me`
- `POST /api/public/create-account`
- `GET /api/public/transactions`
- `POST /api/public/account-deletion`

Supervisor/Intern (Session nötig):

- `POST /api/auth/*` (NextAuth)
- `GET/POST/DELETE /api/users`
- `POST /api/users/restore`
- `POST /api/users/deposit`
- `POST /api/users/charge`
- `GET /api/transactions`
- `POST /api/transactions/cancel-manual`
- `GET /api/stats`
- `GET/POST /api/settings`

Print Middleware (API Key geschützt):

- `POST /api/print/reserve`
- `POST /api/print/confirm`
- `POST /api/print/cancel`

---

## English (Getting Started)

### 1) What this system does

Pool Printer is a local print-account and billing platform for campus or lab networks.
It combines:

- End-user self-service at `/public`
- Supervisor dashboard for account and payment operations
- Print middleware for automated spooler-based billing

Main capabilities:

- Supervisor login via NextAuth credentials
- User management (create, deposit, charge, free account flag)
- Public self-service page at `/public`
- Automatic print charging (B/W + color pricing)
- Manual transaction flow
- 7-day deletion request with restore window
- PDF receipts/invoices

### 2) Architecture

1. **Next.js app**
   - UI + API + SQLite access
   - Local default port: `3000`

2. **Next.js proxy (`src/proxy.ts`)**
   - Session protection for dashboard/internal APIs
   - Public passthrough for `/public` and `/api/public/*`
   - API key protection for `/api/print/*`
   - Optional LAN IP restriction (`LAN_ONLY`)

3. **PowerShell launcher (`launch-pool-printer.ps1`, Windows clients only)**
   - Reads current Windows username
   - Always normalizes to lowercase
   - Sends username + secret via POST to `/api/public/launch`
   - Opens browser with `/public?launchToken=...`

4. **Print middleware (`print-middleware/index.ts`)**
   - Polls Ubuntu CUPS queues
   - Reserves before print (`/api/print/reserve`)
   - Confirms/cancels (`/api/print/confirm`, `/api/print/cancel`)

### 3) Requirements

- Ubuntu server (for app + print middleware)
- Node.js 20+
- npm
- CUPS installed (`lpstat`, `cancel`, `cupsenable`, `cupsdisable` available)
- Access rights to the configured CUPS queues
- Windows clients for the PowerShell launcher flow

### 4) Setup

```bash
npm install
cp .env.example .env.local
npm run db:init
```

Required `.env.local` keys:

- `NEXTAUTH_SECRET`
- `API_KEY`
- `PUBLIC_LAUNCH_SECRET`

### 5) Run

Development:

```bash
npm run dev
```

Production:

```bash
npm run build
npm run start
npx tsx print-middleware/index.ts
```

Ubuntu startup script (server):

```bash
chmod +x ./start-pool-printer.sh
./start-pool-printer.sh
```

### 5.1) Ubuntu autostart (systemd)

Use the example unit files in `deploy/systemd/`:

- `pool-printer-app.service`
- `pool-printer-middleware.service`

Install (example):

```bash
sudo cp deploy/systemd/pool-printer-app.service /etc/systemd/system/
sudo cp deploy/systemd/pool-printer-middleware.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pool-printer-app.service
sudo systemctl enable --now pool-printer-middleware.service
```

Adjust `WorkingDirectory`, `User`, and `Group` before enabling.

### 6) Public launcher usage (Windows clients)

```powershell
.\launch-pool-printer.ps1 -LaunchSecret "YOUR_SECRET"
```

Custom host:

```powershell
.\launch-pool-printer.ps1 -BaseUrl "http://server-name:3000/public" -LaunchSecret "YOUR_SECRET"
```

### 7) Main APIs

Public:

- `POST /api/public/launch`
- `GET /api/public/me`
- `POST /api/public/create-account`
- `GET /api/public/transactions`
- `POST /api/public/account-deletion`

Supervisor:

- `POST /api/auth/*`
- `GET/POST/DELETE /api/users`
- `POST /api/users/restore`
- `POST /api/users/deposit`
- `POST /api/users/charge`
- `GET /api/transactions`
- `POST /api/transactions/cancel-manual`
- `GET /api/stats`
- `GET/POST /api/settings`

Print middleware:

- `POST /api/print/reserve`
- `POST /api/print/confirm`
- `POST /api/print/cancel`
