# Pool Printer

Pool Printer ist eine lokale Druckkonto- und Abrechnungsplattform für Hochschul-/Labornetze.

Die aktuelle Minimalvariante ist bewusst einfach gehalten:

- Die Web-App läuft auf Next.js
- Ein PowerShell-Launcher öffnet die Public-Seite direkt mit dem aktuellen Windows-Benutzernamen
- Kein IIS, kein ARR, kein URL Rewrite, keine Windows Authentication mehr
- Supervisor-Login bleibt für das Dashboard erhalten

## Ablauf

1. Der Benutzer startet das PowerShell-Skript per Doppelklick.
2. Das Skript liest den aktuellen Windows-Benutzer aus.
3. Es öffnet den Browser auf `http://localhost:3000/public?user=<username>`.
4. Die Public-Seite verwendet diesen Wert für Konto, Transaktionen und Self-Service-Aktionen.

Wichtig:

- Der `user`-Parameter ist für das einfache Laborsetup gedacht.
- Er ist praktisch, aber keine starke Sicherheitsgrenze.

## Projekt starten

1. Abhängigkeiten installieren:

```bash
npm install
```

2. Environment-Datei anlegen:

```bash
copy .env.example .env.local
```

3. Pflichtwerte setzen:

- `NEXTAUTH_SECRET`
- `API_KEY`

4. Datenbank initialisieren:

```bash
npm run db:init
```

5. App starten:

```bash
npm run dev
```

Oder für den Produktionsmodus:

```bash
npm run build
npm run start
```

6. Dann das Launcher-Skript starten:

```powershell
.\launch-pool-printer.ps1
```

Falls die App auf einem anderen Host läuft, kann die URL angepasst werden:

```powershell
.\launch-pool-printer.ps1 -BaseUrl "http://server-name:3000/public"
```

## Was das Skript macht

Das Skript `launch-pool-printer.ps1`:

- liest den aktuellen Windows-Benutzer
- normalisiert den Namen auf Kleinbuchstaben
- öffnet den Standardbrowser mit der Public-URL

## Komponenten

- `src/app/public/page.tsx` - Self-Service UI für normale Nutzer
- `src/app/api/public/*` - Public APIs für Konto, Transaktionen und Löschantrag
- `src/app/(dashboard)/*` - Supervisor-Dashboard
- `src/app/api/auth/[...nextauth]` - NextAuth für Supervisor-Login
- `print-middleware/index.ts` - Windows-Spooler-Integration

## Entfernt aus dem alten Setup

Diese Dinge werden nicht mehr gebraucht:

- IIS Reverse Proxy
- Application Request Routing (ARR)
- URL Rewrite
- Windows Authentication in IIS
- `web.config`
- Header-Forwarding per IIS

## Wichtige Hinweise

- Das Dashboard ist weiterhin durch Supervisor-Login geschützt.
- Die Public-Seite erwartet einen `user`-Parameter in der URL.
- Wenn der Parameter fehlt, zeigt die Seite einen Hinweis an.

## Entwicklung

Nützliche Commands:

```bash
npm run dev
npm run build
npm run start
npm run db:init
```

## Lizenz / Betrieb

Das Projekt ist für ein lokales, kontrolliertes Laborsetup gedacht. Wenn du später wieder echte Authentifizierung brauchst, sollte das separat und serverseitig gelöst werden.
