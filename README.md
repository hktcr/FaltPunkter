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
node --test geo.test.cjs app.test.cjs import.test.cjs
```

`ui.test.cjs` är en kompatibilitetsingång till `browser.test.cjs`, en Playwright-svit med syntetiska positioner och skärmstorlekar. Den kräver Playwright och Chromium och startar sin egen lokala HTTP-server. Testerna ändrar bara isolerade testkontexter, aldrig användarens riktiga lagring. Testkörningens status dokumenteras i `TESTING.md`.

## Publicering

GitHub Pages används från befintligt repo och main. Håll alla runtime-filer i roten, inklusive `geo.js`, `sw.js`, `vendor/`, `astorp.geojson` och `data/`. Kontrollera Pages-jobbet och att liveversionen motsvarar den publicerade commiten. För ändringar i offlinekopian: höj versionsnamnet i `sw.js`.

Vendorer: Leaflet 1.9.4 (BSD-2-Clause) och Turf 6.5.0 (MIT), hämtade från npm/unpkg. Licenstexter ligger i `vendor/`. Externa kartlager kräver internet och omfattas av leverantörernas villkor och kapacitet.

## Offline och import, version 2026-11-07.2

Offlinekopian använder en komplett, versionsmärkt uppsättning statiska filer. En misslyckad eller ofullständig uppdatering ersätter inte den fungerande kopian. En färdig uppdatering installeras först efter ditt val; öppna spara-/importdialoger skyddas även i andra flikar. Vid en saknad cachefil har nätförsöket fem sekunders tidsgräns genom hela svaret, med äldre kopia som reserv. Serverfel, långsamt nät och frågesträngar ska därför inte blockera en redan sparad app.

Webbappen skapar aldrig positionslänkar. En kontrollerande service worker tar bort frågesträngar före statiska nätanrop och cachelagring. På det allra första besöket kan ingen service worker hindra värdservern från att ta emot en frågesträng som någon redan har lagt i URL:en. Lägg därför inte privata koordinater i webbadressen.

**Importera TSV** finns under sparade positioner. Filen läses lokalt. Förhandsgranskningen visar nya punkter, dubbletter och radfel. Inget sparas före knappen Lägg till. Import är tillägg, aldrig ersättning. Samlingen måste kunna exporteras igen: högst 10 000 punkter och 2 MiB TSV. Felaktiga rader blockerar importen så att inget tappas tyst.

**Ångra senaste importen** återställer den exakta föregående punktsamlingen om inget senare ändrats. Senare ändringar eller en skadad återställningspunkt stoppar återställningen. En misslyckad import bevarar föregående fungerande återställningspunkt. Exportera en separat fil för långtidsbackup. En uppdaterad webbläsare med Web Locks krävs för skrivning; äldre webbläsare får inte skriva utan säkert fliklås.

Nya TSV-exporter är versionsmärkta och bevarar citationstecken, radbrytningar, apostrofer och formelliknande namn utan att köra dem som kalkylbladsformler. Äldre exporter med fem eller sju kolumner går också att importera. Tvetydiga apostrofer i äldre namn behålls i stället för att gissas bort.

### Riktiga webbläsartester

`node browser.test.cjs` startar sin egen lokala HTTP-server och Chromium med riktig Cache API, service worker och Web Locks. GitHub Actions kör den samt 38 enhetstester på varje push. Servern simulerar offline, HTTP 503, långa svarstider och avstannade svarskroppar. Alla positioner är syntetiska. Testerna berör ingen användares riktiga data.
