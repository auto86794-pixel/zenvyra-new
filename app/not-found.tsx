import Link from "next/link";

export default function NotFound() {
  return (
    <main className="legal-page">
      <article className="legal-content not-found-content">
        <p className="legal-eyebrow">404 · ELTÉVEDTÉL?</p>
        <h1>Ez az oldal nem található.</h1>
        <p>
          A keresett oldal lehet, hogy átköltözött vagy már nem érhető el. A
          Zenvyra kezdőlapjáról biztonságosan folytathatod.
        </p>
        <Link className="legal-primary-link" href="/">
          Vissza a Zenvyrához →
        </Link>
      </article>
    </main>
  );
}
