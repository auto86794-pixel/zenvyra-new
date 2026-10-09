"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { getNeonPasswordClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== again) { setMessage("Adj meg legalább 8 karakteres, egyező jelszavakat."); return; }
    const token = new URL(window.location.href).searchParams.get("token");
    if (!token) { setMessage("A visszaállító hivatkozás hiányos. Kérj új levelet a belépési oldalon."); return; }
    setBusy(true);
    try {
      const { error } = await getNeonPasswordClient().resetPassword({ token, newPassword: password });
      if (error) throw error;
      setDone(true); setPassword(""); setAgain("");
      setMessage("A jelszavad megváltozott. Most már bejelentkezhetsz.");
      window.history.replaceState(null, "", "/jelszo-visszaallitas");
    } catch (error) { setMessage(error instanceof Error ? error.message : "A visszaállítás nem sikerült. Kérj új levelet."); }
    finally { setBusy(false); }
  }
  return <main className="legal-page"><article className="legal-content">
    <h1>Új jelszó megadása</h1>
    {!done && <form className="login-form" onSubmit={submit}>
      <label>Új jelszó<input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label>Új jelszó újra<input type="password" autoComplete="new-password" required minLength={8} value={again} onChange={(e) => setAgain(e.target.value)} /></label>
      <button className="login-button" style={{ width: "auto", minHeight: 44, padding: "12px 24px", fontSize: 16, borderRadius: 12, alignSelf: "flex-start" }} type="submit" disabled={busy}>{busy ? "Mentés…" : "Jelszó mentése"}</button>
    </form>}
    <p role="status">{message}</p><Link href="/">Vissza a Zenvyrához</Link>
  </article></main>;
}
