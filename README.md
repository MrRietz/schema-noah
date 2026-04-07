# Noahs Veckokalender

Statisk GitHub Pages-sida som visar en vecka i taget utifrån ett Google Sheet.

Sidan försöker först läsa live-data direkt från Google Sheets CSV-exporten. Om det inte fungerar används `data/calendar.json` som reservkopia.

Nu finns även redigering direkt från korten. För att spara till Google Sheet behöver du koppla en Apps Script-webbapp.

## Publicera på GitHub Pages

1. Lägg upp innehållet i ett GitHub-repo.
2. Aktivera GitHub Pages för branchen `main` och mappen `/ (root)`.
3. Sidan publiceras från rotmappen och laddar sedan data själv.

## Testa lokalt

Öppna inte sidan via `file:///...`, eftersom webbläsaren blockerar `fetch` då.

Kör i stället en enkel lokal server i projektmappen:

```powershell
node -e "const http=require('http');const fs=require('fs');const path=require('path');const base=process.cwd();http.createServer((req,res)=>{const p=req.url==='/'?'/index.html':req.url.split('?')[0];const file=path.join(base,decodeURIComponent(p));fs.readFile(file,(err,data)=>{if(err){res.statusCode=404;res.end('Not found');return;}const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};res.setHeader('Content-Type',types[ext]||'text/plain; charset=utf-8');res.end(data);});}).listen(4173,()=>console.log('http://localhost:4173'));"
```

Öppna sedan `http://localhost:4173`.

## Aktivera redigering

Det här behöver göras en gång.

### 1. Skapa Apps Script-projektet

1. Öppna Google Sheet.
2. Gå till `Extensions -> Apps Script`.
3. Ta bort eventuell standardkod i projektet.
4. Klistra in innehållet från [apps-script/Code.gs](c:/repos_privat/schema-noah/apps-script/Code.gs).
5. Spara projektet.

### 2. Deploya som Web App

1. Klicka på `Deploy -> New deployment`.
2. Välj typ `Web app`.
3. Sätt `Execute as` till dig själv.
4. Sätt åtkomst enligt din öppna variant.
5. Klicka `Deploy`.
6. Kopiera web app-URL:en.

### 3. Koppla web app-URL till sidan

Öppna [index.html](c:/repos_privat/schema-noah/index.html) och ändra:

```html
<script>
  window.CALENDAR_CONFIG = {
    editApiUrl: ""
  };
</script>
```

till:

```html
<script>
  window.CALENDAR_CONFIG = {
    editApiUrl: "DIN_APPS_SCRIPT_WEB_APP_URL_HÄR"
  };
</script>
```

### 4. Testa att redigering fungerar

1. Starta sidan lokalt eller via GitHub Pages.
2. Öppna ett dagskort.
3. Tryck `Redigera`.
4. Ändra `Hos`, `Tid` eller `Notering`.
5. Tryck `Spara`.
6. Kontrollera att raden i Google Sheet ändras.

Obs:
- Sidan använder `fetch(..., { mode: "no-cors" })` för skrivningen.
- Det betyder att klienten inte läser svaret från Apps Script i detalj.
- UI:t skickar ändringen och läser sedan om datan från arket.
- Om `editApiUrl` lämnas tom syns ändringen bara lokalt tills sidan laddas om.

## Hur redigering fungerar

När användaren trycker `Redigera` på ett kort:

1. En modal öppnas med dagens data ifylld.
2. Användaren ändrar värdena.
3. `Spara` skickar en POST till Apps Script.
4. Apps Script letar upp rätt rad via `Datum`.
5. Apps Script sparar backup innan raden skrivs över.
6. Apps Script uppdaterar raden i arket.
7. Sidan läser sedan om schemat från Google Sheet.

## Upptäcka försök

Apps Script-logiken skriver varje skrivförsök till ett blad som heter `Audit Log`.

Det gäller bland annat:
- lyckade uppdateringar
- försök där `datum` saknas
- försök mot datum som inte finns
- blockerade försök
- serverfel
- återställningar

Loggen innehåller:
- tidpunkt
- status
- datum
- skickade värden
- klient-id
- sida som försöket kom från
- webbläsarens `userAgent`
- klientens tidsstämpel
- hela payloaden

Det här stoppar inte någon i sig, men det gör att du kan se i efterhand vad som hände.

## Backup före ändring

Innan en rad skrivs över sparar Apps Script originalvärdena i ett blad som heter `Backup Log`.

Det bladet innehåller:
- när backupen togs
- vilket datum som skulle ändras
- originaldatum
- originalvecka
- originalveckodag
- originalvärden för `Hos`, `Hämtning/Lämning` och `Anteckningar`
- klient-id och metadata
- råpayload

Det betyder att du har originalraden kvar även efter en felaktig ändring.

## Blockera för många försök

Apps Script har enkel rate limiting.

Om samma klient försöker göra för många ändringar på kort tid:
- loggas försöken i `Audit Log`
- klienten blockeras tillfälligt

Standardvärden just nu i [apps-script/Code.gs](c:/repos_privat/schema-noah/apps-script/Code.gs):
- `RATE_LIMIT_WINDOW_MINUTES = 10`
- `RATE_LIMIT_MAX_ATTEMPTS = 12`
- `BLOCK_DURATION_MINUTES = 30`

Du kan ändra dessa direkt i Apps Script om du vill vara hårdare eller mjukare.

## Återställning

Det finns nu en enkel restore-funktion i [apps-script/Code.gs](c:/repos_privat/schema-noah/apps-script/Code.gs):

```javascript
restoreLatestBackup("2026-04-07")
```

Den gör detta:
- letar upp senaste backupen för datumet i `Backup Log`
- skriver tillbaka `Hos`, `Hämtning/Lämning` och `Anteckningar` till bladet `Noah Kalender`
- loggar återställningen i `Audit Log`

### Så kör du återställning

Eftersom Apps Script inte låter dig skriva argument direkt i funktionsväljaren är enklaste sättet att lägga in en hjälpfunktion tillfälligt:

```javascript
function restoreExample() {
  return restoreLatestBackup("2026-04-07");
}
```

Sedan:

1. Klistra in funktionen i Apps Script.
2. Spara.
3. Välj `restoreExample` i funktionslistan högst upp.
4. Klicka `Run`.
5. Kontrollera att rätt rad i `Noah Kalender` återställdes.
6. Ta bort eller ändra hjälpfunktionen när du är klar.

### Hur du vet att restore lyckades

Kontrollera:
- raden i `Noah Kalender`
- att en ny rad med status `restored` skrevs till `Audit Log`

## Uppdatera kalenderdatan

Om du vill uppdatera den lokala reservkopian kör du:

```powershell
powershell -File .\scripts\update-calendar-data.ps1
```

Det hämtar arket och skriver om [calendar.json](c:/repos_privat/schema-noah/data/calendar.json).
