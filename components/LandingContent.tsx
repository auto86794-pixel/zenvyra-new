import Link from "next/link";

export default function LandingContent() {
  return (
    <div className="landing-info">
      <nav className="landing-nav" aria-label="Bemutatkozó oldal navigációja">
        <a href="#bemutatkozas">A Zenvyráról</a>
        <a href="#funkciok">Funkciók</a>
        <a href="#gyakori-kerdesek">Gyakori kérdések</a>
      </nav>
      <section id="bemutatkozas" className="landing-intro" aria-labelledby="landing-title">
        <p className="landing-eyebrow">ZENVYRA · TEST, LÉLEK, EGYENSÚLY</p>
        <h1 id="landing-title">Táplálkozás, mozgás és jóllét egy helyen</h1>
        <p className="landing-lead">Ha életmódot váltanál, a Zenvyra segít megtenni az első lépéseket. Kövesd étkezéseidet, folyadékfogyasztásodat, mozgásodat és közérzetedet, és alakíts ki tudatosabb mindennapi szokásokat a saját tempódban.</p>
        <a className="landing-start" href="#kezdes">Kipróbálom a Zenvyrát ↑</a>
      </section>
      <section id="funkciok" aria-labelledby="features-title">
        <h2 id="features-title">Figyelj magadra, lépésről lépésre</h2>
        <div className="landing-feature-grid">
          <article><h3>Táplálkozás</h3><p>Rögzítsd étkezéseidet, böngéssz a receptek között, és tervezd meg a heti menüdet. A bevásárlólista segít az előkészületekben.</p></article>
          <article><h3>Mozgás</h3><p>Kövesd a mozgással töltött idődet, és keress a saját tempódhoz illő gyakorlatokat. Apró lépésekkel is építhetsz rendszeres szokásokat.</p></article>
          <article><h3>Folyadékbevitel</h3><p>Jegyezd fel, mennyit ittál a nap folyamán, és tartsd szem előtt a folyadékfogyasztásodat.</p></article>
          <article><h3>Közérzet és haladás</h3><p>Rögzítsd, hogyan érzed magad, és tekints vissza a bejegyzéseidre. Ismerd meg jobban a mindennapi szokásaidat.</p></article>
        </div>
      </section>
      <section aria-labelledby="how-title">
        <h2 id="how-title">Hogyan kezdj hozzá?</h2>
        <ol className="landing-steps">
          <li><strong>Ismerkedj meg az alkalmazással.</strong> A nyitóképernyőn regisztráció nélkül is beléphetsz.</li>
          <li><strong>Válaszd ki az első lépésedet.</strong> Kezdhetsz egy étkezés, egy pohár víz, a mozgásod vagy a közérzeted rögzítésével.</li>
          <li><strong>Haladj a saját tempódban.</strong> Fiók létrehozásával megadhatod a céljaidat és a személyre szabási beállításaidat.</li>
        </ol>
      </section>
      <section id="gyakori-kerdesek" aria-labelledby="faq-title">
        <h2 id="faq-title">Gyakori kérdések</h2>
        <details><summary>Kipróbálhatom regisztráció nélkül?</summary><p>Igen. A nyitóképernyőn válaszd a „Belépek regisztráció nélkül” lehetőséget, és ismerkedj meg a Zenvyra funkcióival.</p></details>
        <details><summary>Hol maradnak a vendégként rögzített adataim?</summary><p>A vendég mód adatai az adott böngésző helyi tárhelyén maradnak. Másik eszközön nem jelennek meg, és a böngészőadatok törlésével elveszhetnek.</p></details>
        <details><summary>Miért érdemes fiókot létrehozni?</summary><p>A fiókhoz tartozó bejegyzések felhőalapú tárolást kapnak. Megadhatod céljaidat, étkezési és mozgási beállításaidat a személyre szabott használathoz.</p></details>
        <details><summary>Helyettesíti a Zenvyra az orvosi tanácsadást?</summary><p>Nem. A Zenvyra a mindennapi szokások követését támogatja; nem diagnosztizál, és nem helyettesíti az orvos vagy dietetikus tanácsát.</p></details>
      </section>
      <footer className="landing-footer">
        <span>Zenvyra · A saját tempódban.</span>
        <Link href="/adatkezeles">Adatkezelési tájékoztató</Link>
        <Link href="/felhasznalasi-feltetelek">Felhasználási feltételek</Link>
      </footer>
    </div>
  );
}
