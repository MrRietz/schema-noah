# Noahs Veckokalender

Statisk GitHub Pages-sida som visar en vecka i taget utifrån ett Google Sheet.

Sidan försöker först läsa live-data direkt från Google Sheets CSV-exporten. Om det inte fungerar används `data/calendar.json` som reservkopia.

## Publicera på GitHub Pages

1. Lägg upp innehållet i ett GitHub-repo.
2. Aktivera GitHub Pages för branch `main` och mappen `/ (root)`.
3. Sidan laddar data från `data/calendar.json`.

## Testa lokalt

Öppna inte sidan via `file:///...`, eftersom webbläsaren blockerar `fetch` då.

Kör i stället en enkel lokal server i projektmappen:

```powershell
node -e "const http=require('http');const fs=require('fs');const path=require('path');const base=process.cwd();http.createServer((req,res)=>{const p=req.url==='/'?'/index.html':req.url.split('?')[0];const file=path.join(base,decodeURIComponent(p));fs.readFile(file,(err,data)=>{if(err){res.statusCode=404;res.end('Not found');return;}const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};res.setHeader('Content-Type',types[ext]||'text/plain; charset=utf-8');res.end(data);});}).listen(4173,()=>console.log('http://localhost:4173'));"
```

Öppna sedan `http://localhost:4173`.

## Uppdatera kalenderdatan

Kör ett script som hämtar arket igen och skriver om `data/calendar.json`, eller uppdatera filen manuellt om arket ändras.
