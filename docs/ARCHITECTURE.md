# Technische Architektur

## Entscheidung: Node.js/Express als Kern-Backend

Express mit TypeScript ist hier die passende Default-Wahl: Frontend, API und Worker teilen Typen, Validierung und die JavaScript-Laufzeit; Render kann API und Worker unabhängig deployen. Playwright kann bei **erlaubten** Quellen auch im Node-Worker laufen. Python bleibt sinnvoll, falls ein späterer, rechtlich freigegebener Connector besondere Python-Bibliotheken verlangt: er kommuniziert dann über die gleiche normalisierte `ListingCandidate`-Nachricht bzw. eine interne Queue. Synchrones Scraping in Browser-Requests ist ausgeschlossen, damit Antwortzeit, Rate Limits und Fehler einer Quelle das Produkt nicht beeinträchtigen.

## Komponenten und Datenfluss

```text
React/Vercel  -- HTTPS/JWT -->  Express API/Render  --> MongoDB Atlas
                                      |                    |
                                      +--> S3 (AES-256)    +--> Worker/Render Cron
                                                               |--> erlaubte APIs/Feeds
                                                               +--> Listing normalisieren, deduplizieren, matchen
                                                                            |--> In-App + E-Mail-Benachrichtigung
```

Der Worker wird als eigener Render Background Worker betrieben und über Render Cron Jobs (z. B. alle 30 Minuten) oder eine Queue (BullMQ/Redis bei wachsender Last) angestoßen. Er holt nur freigegebene Quellen ab, validiert/normalisiert Inserate, schreibt sie idempotent, ermittelt Matches und erzeugt Benachrichtigungen. Ein Web-Request ruft niemals einen Connector auf.

## MongoDB-Datenmodell

| Collection | Wichtige Felder | Indizes |
|---|---|---|
| `users` | `email`, `passwordHash`, `name`, `roles`, `notificationPreferences` | eindeutig `email` |
| `profiles` | `userId`, `name`, `locations[]`, `radiusKm`, `rent`, `rooms`, `area`, `propertyTypes`, `features`, `availableFrom`, `documentIds[]`, `active` | `userId, active` |
| `listings` | `source`, `externalId`, `canonicalUrl`, Standort-/Preis-/Objektdaten, `fingerprint`, `firstSeenAt`, `lastSeenAt`, `isActive` | eindeutig `source, externalId`; sparse eindeutig `fingerprint` |
| `documents` | `userId`, `profileIds[]`, `kind`, `objectKey`, `encryptedDek`, `iv`, `authTag`, `mimeType`, `size`, `status` | `userId, createdAt` |
| `matches` | `userId`, `profileId`, `listingId`, `score`, `reasons`, `status`, `notifiedAt` | eindeutig `profileId, listingId`; `userId, status` |

Dokumentinhalt steht niemals in MongoDB. Jede Datei erhält einen zufälligen Datenverschlüsselungsschlüssel (DEK); die Datei wird mit AES-256-GCM verschlüsselt. Der DEK wird mit einem separaten Master-Key (in Render Secret/idealerweise KMS) umschlossen und als Metadatum gespeichert.

## REST-API

Alle `/api/*`-Endpunkte außer `auth/register` und `auth/login` benötigen `Authorization: Bearer <JWT>`.

| Methode | Pfad | Zweck |
|---|---|---|
| POST | `/api/auth/register` | Konto anlegen; gibt Access-Token zurück |
| POST | `/api/auth/login` | Anmelden; gibt Access-Token zurück |
| GET | `/api/auth/me` | Eigenes Konto |
| GET/POST | `/api/profiles` | Eigene Profile lesen/anlegen |
| GET/PATCH/DELETE | `/api/profiles/:id` | Eigenes Profil lesen/ändern/löschen |
| GET/POST | `/api/documents` | Metadaten lesen bzw. Datei hochladen |
| GET/DELETE | `/api/documents/:id` | entschlüsselten Download (auth.) / löschen |
| GET | `/api/matches` | Treffer, gefiltert nach Profil/Status |
| PATCH | `/api/matches/:id` | Match-Status ändern |
| GET | `/api/listings/:id` | Listing für einen eigenen Match lesen |
| POST | `/api/internal/ingest` | Worker-only, HMAC-geschützt: normalisierte Listings einspeisen |

Für produktive Sessions sind kurze Access-Tokens und HttpOnly/Secure/`SameSite=Strict` Refresh-Cookies besser als eine Token-Ablage in Local Storage; das MVP hält den Access-Token nur im Speicher.

## Matching und Deduplizierung

Der Worker vergibt einen deterministischen Fingerprint aus normalisierter Adresse, PLZ, Zimmern, Fläche und gerundetem Mietpreis. Zusätzlich bleibt `source + externalId` die autoritative Quell-ID. Bei kollidierenden Fingerprints werden Treffer zusammengeführt bzw. als potenzielle Duplikate markiert, nicht blind überschrieben. Der Match-Score bewertet Lage, Miete, Zimmer, Fläche, Typ, Ausstattungsmerkmale und Verfügbarkeit; nur vollständige Mindestkriterien ergeben einen Match.

## Rechtliche Leitplanken

1. Offizielle APIs, Partnerfeeds oder schriftliche Erlaubnis bevorzugen; Lizenz und zulässigen Verwendungszweck dokumentieren.
2. Vor jedem Connector AGB und `robots.txt` prüfen, klaren User-Agent/Kontakt nutzen und strikte Rate Limits/Backoff einhalten.
3. Kein CAPTCHA-Bypass, kein Login-Scraping, kein Umgehen technischer Sperren oder Proxy-Rotation.
4. Nur notwendige Inserat-Metadaten speichern, Quellen verlinken, Lösch-/Opt-out-Anfragen und Datenfristen umsetzen.
5. Vor Produktivstart rechtlich prüfen lassen, insbesondere Datenbankrechte, Urheberrecht, DSGVO und Portalverträge.

## Sicherheitskonzept für Unterlagen

- TLS erzwingen; CORS ausschließlich auf die Produktions-Frontend-URL begrenzen.
- Argon2id-Passworthashes, starke Passwortrichtlinie, JWT mit kurzer Laufzeit, Rate Limit auf Authentifizierung.
- MIME-Signatur und Größe serverseitig prüfen; nur PDF/JPEG/PNG akzeptieren, Malware-Scan asynchron vor Freigabe.
- Anwendungsebene-AES-GCM plus S3 serverseitige Verschlüsselung, getrennte Schlüsselverwaltung und Key-Rotation.
- Least Privilege: Objektspeicher privat, keine öffentlichen URLs; Download nur nach Eigentumsprüfung und Entschlüsselung im API-Prozess.
- Audit-Events für Upload, Download, Löschung und Bewerbung; Aufbewahrungsfristen, Widerruf und vollständige Löschung implementieren.
- Ausweise/Schufa sind besonders schützenswert: standardmäßig keine automatische Bewerbung; Nutzer bestätigt pro Bewerbung Paket und Empfänger.

## Deployment

- **MongoDB Atlas:** Netzwerkzugriff auf Render begrenzen, separater DB-User mit minimalen Rechten, Backups und Verschlüsselung aktivieren.
- **Render Web Service:** `apps/api`, `npm run build -w @wohnungsfinder/api`, Start `npm run start -w @wohnungsfinder/api`; Secrets ausschließlich im Dashboard.
- **Render Worker/Cron:** `apps/worker`, separater Service mit denselben Mongo-/internen HMAC-Secrets. Bei Cron den Run-Command `npm run run -w @wohnungsfinder/worker` nutzen.
- **Vercel/Netlify:** Root `apps/web`; `VITE_API_URL` auf die Render-URL setzen. Redirects für die SPA konfigurieren.
