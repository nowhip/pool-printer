# Pool Printer

Pool Printer ist eine lokale Druckkonto- und Abrechnungsplattform für Hochschul-/Labornetze.
Sie kombiniert:

- Self-Service für normale Windows-Nutzer (ohne Supervisor-Login)
- Supervisor-Dashboard für Verwaltung und Kasse
- Windows SSO Proxy für Benutzerauflösung
- Print Middleware für automatisierte Spooler-Abrechnung

---

## Deutsch (Startklar)

### 1) Was das System macht

Pool Printer verwaltet Guthaben, Druckkosten und Transaktionen pro Nutzerkonto (`userId`).
Druckaufträge werden nicht direkt im Browser ausgelöst, sondern über Windows-Druckerwarteschlangen erkannt und serverseitig abgerechnet.

Kernfunktionen:

- Supervisor-Login (Credentials via NextAuth)
- Benutzerverwaltung (anlegen, aufladen, belasten, kostenlos markieren)
- Self-Service Seite `/public` für Endnutzer
- Automatische Druckabbuchung (S/W und Farbe, mit Preisen aus Einstellungen)
- Manueller Zahlungs-/Buchungsfluss (z. B. Bar/Karte)
- 7-Tage Löschantrag mit Wiederherstellung statt sofortiger Löschung
- PDF-Belege/Rechnungen

### 2) Architektur (wichtig)

Das Projekt läuft bewusst als **Split-Architektur**:

1. **Next.js App**
   - UI + API + SQLite Zugriff
   - Standard-Port lokal: `3000` (oder intern hinter SSO)

2. **Next.js Proxy (`src/proxy.ts`)**
   - Schützt Dashboard/API per Session
   - Erlaubt `/public` und `/api/public/*` ohne Supervisor-Login
   - Schützt `/api/print/*` zusätzlich mit `Authorization: Bearer API_KEY`
   - Optional LAN-Einschränkung (`LAN_ONLY`)

3. **Windows SSO Proxy (`server/windows-sso-proxy.ts`)**
   - Führt SSPI-Handshake durch (`node-expose-sspi`)
   - Löst Windows-User auf und setzt Header `x-remote-user`
   - Leitet Requests an interne Next-App weiter (typisch `127.0.0.1:3100`)

4. **Print Middleware (`print-middleware/index.ts`)**
   - Pollt den Windows Spooler
   - Reserviert Druckkosten vor dem Druck (`/api/print/reserve`)
   - Bestätigt nach Erfolg (`/api/print/confirm`) oder storniert/refundet (`/api/print/cancel`)

### 3) Voraussetzungen

- Windows (für SSPI + Print-Spooler-Steuerung)
- Node.js 20+
- npm
- Zugriff auf Ziel-Druckerwarteschlangen
- Rechte, um PrintJobs zu lesen/fortzusetzen/zu pausieren

Optional/Produktion:

- PM2 für Prozessverwaltung

### 4) Initiales Setup

1. Abhängigkeiten installieren:

```bash
npm install
```

2. Umgebungsdatei anlegen:

```bash
copy .env.example .env.local
```

3. Pflichtwerte in `.env.local` setzen:

- `NEXTAUTH_SECRET`
- `API_KEY`

4. Datenbank initialisieren:

```bash
npm run db:init
```

Hinweis:

- `db:init` erstellt die SQLite-Datei unter `data/pool-printer.db`.
- Standard-Supervisor wird angelegt: `root / root`.

### 5) Konfiguration (`.env.local`)

Pflicht:

- `NEXTAUTH_SECRET` – Secret für NextAuth/JWT
- `API_KEY` – gemeinsamer Schlüssel zwischen App und Print Middleware

Häufig genutzte Optionen:

- `NEXTAUTH_URL` – Basis-URL der App (Default: `http://localhost:3000`)
- `LAN_ONLY` – `1` = nur Loopback + private Netze, `0` = offen
- `SSO_PROXY_PORT` – externer SSO-Port (Default `3000`)
- `NEXT_INTERNAL_PORT` – interner Next-Port hinter SSO (Default `3100`)
- `NEXT_INTERNAL_HOST` – Host für internen Next-Prozess (Default `127.0.0.1`)
- `SSO_PROXY_SKIP_NEXT` – `1` startet Next nicht automatisch im SSO-Prozess
- `POLL_INTERVAL` – Pollingintervall Print Middleware (ms)
- `PRINTER_BW`, `PRINTER_COLOR` – Druckernamen
- `NEXT_PUBLIC_INVOICE_*` – Rechnungs-/Absenderdaten im PDF

### 6) Datenbankstruktur

Die Anwendung nutzt SQLite mit folgenden Tabellen:

1. `supervisors`

- `id` (PK)
- `username` (unique)
- `password_hash`

2. `users`

- `userId` (PK)
- `balance` (Integer, Cent)
- `is_free_account` (`0/1`)
- `account_state` (`active` | `deletion_requested`)
- `deletion_requested_at`
- `deletion_expires_at`
- `deletion_requested_by`

3. `transactions`

- `id` (PK)
- `userId` (FK -> `users.userId`)
- `amount` (Integer, Cent)
- `pages`
- `type` (`deposit` | `print_bw` | `print_color` | `manual`)
- `description`
- `status` (`pending` | `completed` | `failed` | `refunded`)
- `paymentMethod`
- `timestamp`

4. `settings`

- `key` (PK)
- `value`

Standardwerte in `settings`:

- `price_bw = 5`
- `price_color = 20`
- `session_timeout = 60`

Wichtige Laufzeitlogik:

- Beim DB-Zugriff werden abgelaufene Löschanträge automatisch bereinigt:
  - betroffene `transactions` gelöscht
  - betroffene `users` gelöscht

### 7) Starten in Produktion

1. Build erstellen:

```bash
npm run build
```

2. SSO-Proxy starten (startet Next intern, falls `SSO_PROXY_SKIP_NEXT` nicht `1` ist):

```bash
npm run start:sso
```

3. Print Middleware separat starten:

```bash
npx tsx print-middleware/index.ts
```

### 8) PM2 Autostart

#### 8.1 Prozesse in PM2 anlegen

```bash
pm2 start npm --name pool-sso -- run start:sso
pm2 start npx --name pool-print -- tsx print-middleware/index.ts
```

Wenn du `SSO_PROXY_SKIP_NEXT=1` nutzt, zusätzlich:

```bash
pm2 start npm --name pool-next -- run start
```

#### 8.2 Prozessliste speichern

```bash
pm2 save
```

#### 8.3 Autostart aktivieren (Windows)

- PM2 selbst verwaltet Prozesse, aber Boot-Autostart wird in Windows typischerweise per Task Scheduler/Service ergänzt.
- Praxis: PM2 beim Systemstart ausführen und danach `pm2 resurrect` aufrufen.

Beispiel (manuell/testweise):

```bash
pm2 resurrect
```

### 9) Betriebslogik (End-to-End)

#### 9.1 Supervisor-Bereich

- Login über `/login`
- Dashboard zeigt Kennzahlen inkl. manueller Aufträge/Umsatz
- Benutzerseite hat zwei Sichten:
  - `Aktiv`
  - `Löschanträge`
- Nutzer mit `deletion_requested` sind aus normalen Abläufen ausgeklinkt

#### 9.2 Self-Service (`/public`)

- User wird über SSO-Header aufgelöst (z. B. `x-remote-user`)
- Falls kein Konto existiert: Konto kann angelegt werden
- Kontostand + Transaktionen sichtbar
- Löschantrag kann vom User selbst gestellt und innerhalb von 7 Tagen widerrufen werden

#### 9.3 Druckfluss

1. Print Middleware erkennt Job im Spooler
2. `/api/print/reserve` prüft:
   - Nutzerkonto vorhanden?
   - `account_state = active`?
   - ausreichenendes Guthaben oder Free-Account?
3. Bei Erfolg: Job wird freigegeben, Transaktion `pending`
4. Bei erfolgreichem Druck: `/api/print/confirm` -> `completed`
5. Bei Fehler/Timeout: `/api/print/cancel` -> Refund + `refunded`

#### 9.4 Löschantrag (7 Tage)

- Kein sofortiges Hard-Delete mehr
- Statuswechsel auf `deletion_requested`
- `deletion_expires_at = requested_at + 7 Tage`
- Wiederherstellung möglich durch:
  - Supervisor (`/api/users/restore`)
  - User selbst (`/api/public/account-deletion` mit `restore=true`)
- Nach Ablauf werden User + zugehörige Transaktionen automatisch entfernt

### 10) API-Übersicht (wichtigste Routen)

Public:

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

Pool Printer is a local print-account and billing platform for campus/lab networks.
It combines:

- End-user self-service (without supervisor login)
- Supervisor dashboard for account and payment operations
- Windows SSO proxy for user identity forwarding
- Print middleware for automated spooler-based billing

Main capabilities:

- Supervisor login via NextAuth credentials
- User management (create, deposit, charge, free account flag)
- Public self-service page at `/public`
- Automatic print charging (B/W + color pricing)
- Manual transaction flow (cash/card/etc.)
- 7-day deletion request with restore window
- PDF receipts/invoices

### 2) Architecture (important)

The runtime is intentionally split into separate components:

1. **Next.js app**
   - UI + API + SQLite access

2. **Next.js proxy (`src/proxy.ts`)**
   - Session protection for dashboard/internal APIs
   - Public passthrough for `/public` and `/api/public/*`
   - API key protection for `/api/print/*`
   - Optional LAN IP restriction (`LAN_ONLY`)

3. **Windows SSO proxy (`server/windows-sso-proxy.ts`)**
   - Performs SSPI auth (`node-expose-sspi`)
   - Injects normalized user via `x-remote-user`
   - Forwards requests to internal Next.js instance

4. **Print middleware (`print-middleware/index.ts`)**
   - Polls Windows spooler
   - Calls reserve/confirm/cancel API endpoints
   - Handles timeout/error refund behavior

### 3) Requirements

- Windows host (for SSPI and print spooler controls)
- Node.js 20+
- npm
- Access rights for target print queues
- Permission to read/resume/pause print jobs

Optional:

- PM2 for process management and auto-restart

### 4) Initial setup

1. Install dependencies:

```bash
npm install
```

2. Create env file:

```bash
copy .env.example .env.local
```

3. Set required values in `.env.local`:

- `NEXTAUTH_SECRET`
- `API_KEY`

4. Initialize database:

```bash
npm run db:init
```

Notes:

- SQLite DB is created at `data/pool-printer.db`
- Default supervisor credentials: `root / root`

### 5) Configuration (`.env.local`)

Required:

- `NEXTAUTH_SECRET`
- `API_KEY`

Common optional settings:

- `NEXTAUTH_URL`
- `LAN_ONLY`
- `SSO_PROXY_PORT`
- `NEXT_INTERNAL_PORT`
- `NEXT_INTERNAL_HOST`
- `SSO_PROXY_SKIP_NEXT`
- `POLL_INTERVAL`
- `PRINTER_BW`, `PRINTER_COLOR`
- `NEXT_PUBLIC_INVOICE_*`

### 6) Database model

Tables:

- `supervisors` (`username`, `password_hash`)
- `users` (`balance`, `is_free_account`, `account_state`, deletion metadata)
- `transactions` (amount/pages/type/status/payment/timestamp)
- `settings` (pricing + session timeout)

Default settings:

- `price_bw = 5`
- `price_color = 20`
- `session_timeout = 60`

Runtime cleanup:

- Expired deletion requests are automatically purged:
  - matching `transactions` deleted
  - matching `users` deleted

### 7) Production run

1. Build:

```bash
npm run build
```

2. Start SSO proxy:

```bash
npm run start:sso
```

3. Start print middleware:

```bash
npx tsx print-middleware/index.ts
```

### 8) PM2 auto-start

Create PM2 processes:

```bash
pm2 start npm --name pool-sso -- run start:sso
pm2 start npx --name pool-print -- tsx print-middleware/index.ts
```

If `SSO_PROXY_SKIP_NEXT=1`, add:

```bash
pm2 start npm --name pool-next -- run start
```

Persist process list:

```bash
pm2 save
```

Enable startup (Windows):

- Use PM2 with a startup task/service pattern and run `pm2 resurrect` after boot.

Manual restore example:

```bash
pm2 resurrect
```

### 9) Operational flows

Supervisor flow:

- Login on `/login`
- Manage users, pricing, balances, manual transactions, restore requests

Public flow:

- User resolved from SSO header
- Create account if missing
- View balance and own transactions
- Request deletion or restore within 7 days

Print flow:

1. Middleware detects queued print job
2. `reserve` validates active account + balance
3. Job proceeds with pending transaction
4. `confirm` on success, `cancel` + refund on failure/timeout

Deletion-request flow:

- Soft state `deletion_requested` (no immediate hard delete)
- Account excluded from active operations
- Restorable by supervisor or user during 7-day window
- Automatically purged after expiry

### 10) Key API routes

Public:

- `GET /api/public/me`
- `POST /api/public/create-account`
- `GET /api/public/transactions`
- `POST /api/public/account-deletion`

Supervisor/internal:

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
