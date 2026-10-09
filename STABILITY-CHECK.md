# Zenvyra – mentési stabilitási ellenőrzés

Ellenőrzés dátuma: 2026-10-09. Hatókör: helyi forrás, helyi build, elkülönített vendégböngésző és szimulált adatbázis-válaszok. Éles közzététel nem történt.

## Javítások

- Azonnali, művelethez vagy rekordhoz kötött kattintásvédelem, biztos feloldás kivétel után is.
- Közérzetváltozások soros mentése: a gyors hangulat-, energia- és stresszváltoztatás nem veszhet el, és nem írhatja vissza a korábbi mezőértékeket.
- Sikertelen adatbázis-mentéskor megmarad a korábban visszaigazolt helyi állapot.
- A profil- és étkezésmódosítások a visszaadott rekordot is ellenőrzik; a nulla érintett sor nem jelent sikert.
- Hibás testsúly és tápérték esetén látható visszajelzés. Az étkezési párbeszédablakban is látszik a hiba.
- Tiltott/megtelt helyi tárolás nem omlasztja össze a vendégfelületet. A recept mentési hibája nem zárja be és nem üríti ki az űrlapot, az előző recepteket nem törli.
- A célzott csomagfrissítés csak a sharp és platformcsomagjai, source-map-js és brace-expansion lockfile-bejegyzéseit változtatta. Az Auth-csomagok és az e-mail-küldés kódja változatlan.

## Ellenőrzések

- `npm.cmd run test:saving`: 22/22 sikeres regressziós teszt.
- `npm.cmd run build`: sikeres Next.js 16.4.0 production build, beépített TypeScript-ellenőrzéssel.
- `npm.cmd run lint`: 0 hiba; a HomeApp.tsx két korábban is meglévő img-figyelmeztetése megmaradt.
- `git diff --check`: hibamentes.
- A helyi Neon Auth munkamenet-végpont a Windows tanúsítványtárával indítva HTTP 200 / null választ ad anonim kérésre. Korábban TLS-hiba miatt 502 volt; a helyi futtatásnál a NODE_OPTIONS=--use-system-ca beállítás oldotta meg, a TLS-ellenőrzés kikapcsolása nélkül.
- A végleges production builden futtatott, valódi, elkülönített Edge böngésző: 13 sikeres ellenőrzés, 390×844 és 1440×900 nézetek, kezeletlen JavaScript-hiba nélkül. A böngészős teszt a dupla vízkattintást, dupla étkezésbeküldést, újratöltés utáni megőrzést, gyors közérzetmódosításokat, hibás adatokat, profilmentést és tiltott helyi tárolást vizsgálja.
- A böngészős teszt forrása: tests/browser-saving.mjs. Futtatásához Playwright és telepített Edge szükséges; a ZENVYRA_PLAYWRIGHT_MODULE változóval egy meglévő Playwright telepítés modulja is megadható, a ZENVYRA_TEST_URL változóval a célcímet lehet beállítani.

## Függőségi audit

- Frissítés előtt: 8 magas besorolású találat.
- Frissítés után: production függőségekben 0 találat.
- A teljes auditban 5 magas besorolású fejlesztői találat maradt ugyanabban a láncban: eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces. A braces legújabb kiadása az ellenőrzéskor 3.0.3, amely még érintett. Az npm által javasolt kényszerített javítás eslint-config-next 14.2.35-re lépne vissza; ezt a Next.js 16.4.0 projektben nem alkalmaztuk.
- A telepítő az előző lockfile-ban is szereplő Neon Auth tranzitív peer-kapcsolataira figyelmeztetett. Ezeket a frissítés nem változtatta meg. A build sikeres; bejelentkezett futásidős teszt nélkül ez nem igazolja az Auth teljes működését.

## Még nem igazolt

A bejelentkezett felhasználó éles adatbázis-mentése és annak újratöltés utáni visszaolvasása nem volt tesztelhető: a meglévő böngészőmunkamenetet kezelő eszköz inicializálási hibával leállt. A külön tesztböngészőben nincs bejelentkezett felhasználó. A vendégböngészős próbák és a szimulált adatbázis-tesztek ezt nem helyettesítik. A kattintásvédelem az adott komponens munkamenetére vonatkozik; külön böngészőlapok vagy manuális hálózati újraküldés közötti adatbázis-szintű idempotenciát nem ad.

## Kilépés gomb – utóellenőrzés

Az oldalsáv navigációja külön görgethető, a Kilépés gomb az oldalsávon és a képernyőn belül marad. A gomb fehér alapon sötét szöveget és billentyűzetes fókuszjelzést kapott; a köztes ablakméret sem rejti el. A böngészős teszt hét méreten (1440×900, 1440×600, 1280×720, 1024×768, 900×600, 390×844, 390×600) igazolta a láthatóságot és a vendégmódból a belépési űrlaphoz való visszatérést. A bejelentkezett munkamenet tényleges megszüntetését ez a próba nem helyettesíti. Build és lint sikeres; két meglévő img-figyelmeztetés maradt. A teszt forrása: tests/browser-signout.mjs.
