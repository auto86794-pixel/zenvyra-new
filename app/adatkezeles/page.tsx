import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Adatkezelési tájékoztató",
  description: "A Zenvyra adatkezelésének közérthető összefoglalója.",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="legal-content">
        <Link className="legal-back-link" href="/">← Vissza a Zenvyrához</Link>
        <h1>Adatkezelési tájékoztató</h1>
        <p><strong>Utolsó frissítés:</strong> 2026. szeptember 4.</p>
        <p>
          A Zenvyra a fiók működtetéséhez és a személyre szabott ajánlásokhoz kezeli az általad megadott adatokat. Csak olyan adatot adj meg, amelyet ehhez valóban használni szeretnél.
        </p>
        <h2>Milyen adatokat kezelünk?</h2>
        <ul>
          <li>fiókadatok, például név és e-mail-cím;</li>
          <li>az általad rögzített táplálkozási, folyadék-, mozgás- és közérzetadatok;</li>
          <li>a személyre szabáshoz megadott célok, étkezési és mozgási beállítások;</li>
          <li>a szolgáltatás biztonságos működéséhez szükséges technikai adatok.</li>
        </ul>
        <h2>Miért kezeljük ezeket?</h2>
        <p>
          A fiókod működtetéséért, a saját bejegyzéseid megjelenítéséért, a választott beállítások szerinti ajánlásokért és a szolgáltatás biztonságáért.
        </p>
        <h2>Hol tároljuk az adatokat?</h2>
        <p>
          A bejelentkezett fiók adatai védett felhőalapú adatbázisban tárolódnak. A vendég mód adatai kizárólag az aktuális böngésző helyi tárhelyén maradnak, és nem kapcsolódnak felhasználói fiókhoz.
        </p>
        <h2>A te lehetőségeid</h2>
        <p>
          Kérhetsz tájékoztatást, helyesbítést vagy törlést, továbbá jelezheted, ha az adatkezeléssel kapcsolatban kérdésed van. A végleges jogi kapcsolattartói és adatkezelői adatok közzététele az üzemeltető feladata.
        </p>
        <p><strong>Fontos:</strong> ez az oldal termékszintű, közérthető összefoglaló; éles jogi tájékoztatóként az üzemeltető adataival és jogi felülvizsgálattal véglegesítendő.</p>
      </article>
    </main>
  );
}
