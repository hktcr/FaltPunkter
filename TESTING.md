# Verifiering av offline och TSV-import, 2026-11-07.2

## Verifierat lokalt

`node --test app.test.cjs geo.test.cjs import.test.cjs`: **38 tester godkända**.

Det täcker bland annat strikt TSV-validering, dubbletter, reversibel export, gränser för fil/samling, oförändrade data före bekräftelse, tillägg utan ersättning, exakt återställning, tom återställning följd av ny sparning, skydd mot senare ändringar och trasig backup, misslyckad andra import, skrivfel, UI-fel efter lyckad skrivning och fail-closed utan Web Locks. De tidigare GPS- och geometritesterna kvarstår.

Oberoende kodgranskning har genomförts. Identifierade fel i backup, flera flikar, filbyte under låsväntan, återställningsvalidering, exportgränser och timeout genom hela svarskroppen har rättats.

## Riktiga webbläsartester

`node browser.test.cjs` startar en lokal HTTP-server och riktig Chromium. Sviten har körts i GitHub Actions: **18 av 18 scenarier godkända**, jämte samtliga 38 enhetstester, på commit `e2e2e79052f1f00e661906e14f48abe011b93eb2`. [Verifierad körning](https://github.com/hktcr/FaltPunkter/actions/runs/42399787529). Den verifierade initial offlineinstallation, nätavbrott, frågesträng utan vidarebefordran, HTTP 503, fördröjning, avstannad svarskropp, misslyckad och lyckad uppdatering, öppna dialoger i annan flik, TSV-import/återställning/kvotfel samt 320, 390, 844 och 1440 px skärmbredder.

Sviten använder enbart syntetiska koordinater och isolerade webbläsarkontexter. Fysisk GPS, Safari/iOS, Android och kommungränsens juridiska riktighet är fortfarande separata begränsningar.

Skärmbilder från körningen har granskats. Mobiltestet har därefter utökats med förhandsgranskning och avbrytande av import på alla fyra skärmstorlekarna samt separata bilder för startsidan, knapparna och importdialogen. GitHub Actions testar även denna utökade version innan publicering.


# Kartvy och lokal nedtoning, 2026-11-15.1

41 enhets- och regressionstester samt 25 riktiga Chromium-scenarier är godkända för appkoden i `d0d8bcbb28307e6769f78ce413f899f4201a9c7e`. [Verifierad CI-körning](https://github.com/hktcr/FaltPunkter/actions/runs/43698494071).

Utöver tidigare kontroller omfattas:
- Gränsmask med verkligt kommunhål, öar, överlappande polygoner och ogiltigt underlag.
- Kartvy/Fältvy i 320×568, 390×844, 844×390 och 1440×900; reglage inom kartan, synlig och klickbar kopieringsknapp, centrerat hårkors, tangentbordsnavigering och återgång till Fältvy.
- Gröna/röda/gula/grå statusar, tydlig skillnad mellan GPS och vald punkt, gammal GPS, nekad platsåtkomst, kopieringsreserv, sparning samt fokus efter stängd dialog.
- Ingen automatisk GPS eller bakgrundskarta, nekad/godkänd kartbakgrund, stoppade nya kartanrop efter återgång till privat samt offline-mask.

Skärmbilder i stående mobil, liggande och standardvy har granskats. Granskningen ledde till fullbreddskoordinater och en enda dokumentrullning så att smala skärmar inte klipper kopieringskontroller. På de minsta skärmarna kan sidan behöva rullas. Testerna tillåter högst 1 px avrundning av webbläsarens rullposition; kontrollens mittpunkt måste träffa själva knappen.

Oberoende kodgranskning har gjorts, med rättningar för återfokus från sparade punkter och byte till Fältvy. Ingen ändring av `geo.js`, `import.js`, kommunfilen eller inventeringsdata. Runtime-koden är oförändrad av denna dokumentationsuppdatering.

Fortfarande inte verifierat: fysisk GPS, fysisk Android/iPhone och Safari. Det befintliga OSM-underlaget är fortfarande vägledande och saknar exakt uttagsdatum; ingen juridisk gränsnoggrannhet påstås.
