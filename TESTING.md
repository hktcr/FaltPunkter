# Verifiering av offline och TSV-import, 2026-11-07.2

## Verifierat lokalt

`node --test app.test.cjs geo.test.cjs import.test.cjs`: **38 tester godkända**.

Det täcker bland annat strikt TSV-validering, dubbletter, reversibel export, gränser för fil/samling, oförändrade data före bekräftelse, tillägg utan ersättning, exakt återställning, tom återställning följd av ny sparning, skydd mot senare ändringar och trasig backup, misslyckad andra import, skrivfel, UI-fel efter lyckad skrivning och fail-closed utan Web Locks. De tidigare GPS- och geometritesterna kvarstår.

Oberoende kodgranskning har genomförts. Identifierade fel i backup, flera flikar, filbyte under låsväntan, återställningsvalidering, exportgränser och timeout genom hela svarskroppen har rättats.

## Riktiga webbläsartester

`node browser.test.cjs` startar en lokal HTTP-server och riktig Chromium. Sviten är förberedd för GitHub Actions men har ännu inte körts vid denna lokala revision. Den ska verifiera initial offlineinstallation, nätavbrott, frågesträng utan vidarebefordran, HTTP 503, fördröjning, avstannad svarskropp, misslyckad och lyckad uppdatering, öppna dialoger i annan flik, TSV-import/återställning/kvotfel samt 320, 390, 844 och 1440 px skärmbredder.

Sviten använder enbart syntetiska koordinater och isolerade webbläsarkontexter. Fysisk GPS, Safari/iOS, Android och kommungränsens juridiska riktighet är fortfarande separata begränsningar.
