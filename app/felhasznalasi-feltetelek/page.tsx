import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Felhasználási feltételek",
  description: "A Zenvyra használatának legfontosabb feltételei.",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="legal-content">
        <Link className="legal-back-link" href="/">← Vissza a Zenvyrához</Link>
        <h1>Felhasználási feltételek</h1>
        <p><strong>Utolsó frissítés:</strong> 2026. szeptember 4.</p>
        <h2>A szolgáltatás célja</h2>
        <p>
          A Zenvyra a mindennapi táplálkozás, mozgás és jóllét követését, valamint általános életmód-ajánlások megjelenítését segíti.
        </p>
        <h2>Nem egészségügyi ellátás</h2>
        <p>
          A Zenvyra nem diagnosztizál, nem nyújt orvosi kezelést, és nem helyettesíti az orvos, dietetikus vagy más egészségügyi szakember személyre szabott tanácsát. Panasz, betegség, várandósság, étkezési zavar vagy mozgáskorlátozás esetén kérj szakmai segítséget.
        </p>
        <h2>A felhasználó felelőssége</h2>
        <p>
          Te döntöd el, mely funkciókat és ajánlásokat használod. Edzés vagy jelentős étrendi változtatás előtt mérlegeld az egészségi állapotodat, és szükség esetén egyeztess szakemberrel.
        </p>
        <h2>Fiók és adatok</h2>
        <p>
          A fiókod biztonságáért és a megadott adatok pontosságáért te felelsz. Más személy adatait csak megfelelő jogosultsággal rögzítheted.
        </p>
        <p><strong>Fontos:</strong> a végleges feltételeket az üzemeltető azonosító és kapcsolattartási adataival, valamint jogi felülvizsgálattal kell kiegészíteni az éles közzététel előtt.</p>
      </article>
    </main>
  );
}
