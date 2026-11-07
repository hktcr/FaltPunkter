# Verifiering av offline och TSV-import, 2026-11-07.2

## Verifierat lokalt

`node --test app.test.cjs geo.test.cjs import.test.cjs`: **38 tester godkända**.

Det täcker bland annat strikt TSV-validering, dubbletter, reversibel export, gränser för fil/samling, oförändrade data före bekräftelse, tillägg utan ersättning, exakt återställning, tom återställning följd av ny sparning, skydd mot senare ändringar och trasig backup, misslyckad andra import, skrivfel, UI-fel efter lyckad skrivning och fail-closed utan Web Locks. De tidigare GPS- och geometritesterna kvarstår.

Oberoende kodgranskning har genomförts. Identifierade fel i backup, flera flikar, filbyte under låsväntan, återställningsvalidering, exportgränser och timeout genom hela svarskroppen har rättats.

## Riktiga webbläsartester

`node browser.test.cjs` startar en lokal HTTP-server och riktig Chromium. Sviten har körts i GitHub Actions: **18 av 18 scenarier godkända**, jämte samtliga 38 enhetstester, på commit `e2e2e79052f1f00e661906e14f48abe011b93eb2`. [Verifierad körning](https://github.com/hktcr/FaltPunkter/actions/runs/42399787529). Den verifierade initial offlineinstallation, nätavbrott, frågesträng utan vidarebefordran, HTTP 503, fördröjning, avstannad svarskropp, misslyckad och lyckad uppdatering, öppna dialoger i annan flik, TSV-import/återställning/kvotfel samt 320, 390, 844 och 1440 px skärmbredder.

Sviten använder enbart syntetiska koordinater och isolerade webbläsarkontexter. Fysisk GPS, Safari/iOS, Android och kommungränsens juridiska riktighet är fortfarande separata begränsningar.

Skärmbilder från körningen har granskats. Mobiltestet har därefter utökats med förhandsgranskning och avbrytande av import på alla fyra skärmstorlekarna samt separata bilder för startsidan, knapparna och importdialogen. GitHub Actions testar även denna utökade version innan publicering.
