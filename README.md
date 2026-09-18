# Wohnungsfinder

Ein Datenschutz-orientiertes MVP zur Verwaltung von Suchprofilen, Treffer-Matching und Bewerbungsunterlagen.

## Architektur in Kürze

- `apps/web`: React + TypeScript + Tailwind, als statisches Frontend für Vercel/Netlify.
- `apps/api`: Express + TypeScript + Mongoose, als zustandslose REST-API für Render.
- `apps/worker`: separater Node-Prozess für geplante Quellenabfragen, Normalisierung, Deduplizierung und Matching.
- MongoDB Atlas speichert Metadaten; S3-kompatibler, serverseitig verschlüsselter Objektspeicher enthält Dokumente. Die API verschlüsselt Dateien zusätzlich vor dem Upload.

Siehe [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) für Datenmodell, Endpunkte, Sicherheits- und Betriebsentscheidungen.

## Lokal starten

1. `npm install`
2. `Copy-Item apps/api/.env.example apps/api/.env` und Umgebungsvariablen setzen.
3. MongoDB und einen S3-kompatiblen Bucket bereitstellen.
4. `npm run dev` starten.

`npm run build` baut alle Workspaces, `npm test` führt API-Tests aus.

## Wichtiger Hinweis zu Datenquellen

Die mitgelieferten Quellenadapter enthalten **keine** Umgehung von Zugriffsschutz, CAPTCHAs oder Rate Limits. Vor dem Abruf einer Quelle sind deren AGB, robots.txt und eine etwaige API-Lizenz zu prüfen. Für ImmoScout24, Immowelt, WG-Gesucht und Kleinanzeigen müssen produktiv offizielle bzw. schriftlich erlaubte Schnittstellen verwendet werden.
