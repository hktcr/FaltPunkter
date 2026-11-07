# FältPunkter

Mobilanpassat fältverktyg för GPS-koordinater, Åstorps kommungräns och lokalt sparade punkter.

Publik sida: https://hktcr.github.io/FaltPunkter/

## Användning

1. Välj **Hämta min position** och ge webbläsaren platsåtkomst.
2. Kontrollera noggrannheten, mätningens ålder och beskedet om kommungränsen.
3. Välj **Kopiera koordinater**. Format: WGS84 latitud, longitud med sex decimaler och decimalpunkt. Antalet decimaler garanterar inte noggrannheten.
4. **Spara** lagrar en fryst ögonblicksbild i den här webbläsaren. Namnge punkten utan att dess koordinater ändras under tiden.

Gamla punkter i `faltpunkter_db` bevaras. Exportera TSV för egen säkerhetskopia. Ogiltig lagring skrivs inte över. Motstridiga ändringar från en annan flik stoppas tills sidan laddats om.

## Gräns och osäkerhet

Den befintliga filen `astorp.geojson` identifierar OpenStreetMap relation 935517. Den fanns i projektet senast april 2026, men saknar uttagsdatum och noggrannhetsmetadata. Den är inte en juridiskt säker eller garanterat aktuell kommungräns.

`geo.js` klassificerar Polygon/MultiPolygon/FeatureCollection och polygonhål. GPS-noggrannheten plus en försiktighetsmarginal på 10 meter används för ett uttryckligt osäkert tillstånd nära kanten. Marginalen är inte ett mått på gränsfilens riktiga fel. Saknad eller ogiltig gräns ger okänt, aldrig utanför. GPS-fixar äldre än 30 sekunder kan inte kopieras eller sparas som aktuella positioner. Ingen webbapp kan verifiera telefonens verkliga GPS-precision.

Gränsdata: © OpenStreetMap-bidragsgivare, ODbL. https://www.openstreetmap.org/relation/935517 och https://www.openstreetmap.org/copyright

## Integritet

- Ingen GPS-start vid sidladdning. Ingen serverdatabas, analyskod, koordinat-URL eller automatisk positionsuppladdning.
- Privat vy är standard. JavaScript, stilmallar och gränsfil laddas från samma webbplats.
- Bakgrundskartor är valfria. De skickar synligt kartområde och IP-adress till respektive kartleverantör efter ett tydligt val.
- Sparade punkter ligger i enhetens localStorage. GitHub Pages hanterar normala åtkomstloggar för själva webbplatsen.
- Service workern sparar endast namngivna statiska appfiler, aldrig GPS-positioner eller externa kartbilder. Offlinefunktion kräver först en lyckad inläsning.
- Befintliga inventeringsfiler och rutnätsfunktioner har bevarats utan ändringar i datainnehållet.

## Utveckling och verifiering

Ren statisk webbplats. Ingen byggkedja eller hemlig nyckel behövs.

```sh
python -m http.server 8765
node --test geo.test.cjs app.test.cjs
```

`ui.test.cjs` är en separat Playwright-smokesvit med syntetiska GPS-positioner och skärmstorlekar. Den kräver Playwright och Chromium samt att den lokala HTTP-servern är igång. Testerna ändrar bara isolerade testkontexter, aldrig användarens riktiga lagring. Testkörningens status dokumenteras i `TESTING.md`.

## Publicering

GitHub Pages används från befintligt repo och main. Håll alla runtime-filer i roten, inklusive `geo.js`, `sw.js`, `vendor/`, `astorp.geojson` och `data/`. Kontrollera Pages-jobbet och att liveversionen motsvarar den publicerade commiten. För ändringar i offlinekopian: höj versionsnamnet i `sw.js`.

Vendorer: Leaflet 1.9.4 (BSD-2-Clause) och Turf 6.5.0 (MIT), hämtade från npm/unpkg. Licenstexter ligger i `vendor/`. Externa kartlager kräver internet och omfattas av leverantörernas villkor och kapacitet.
