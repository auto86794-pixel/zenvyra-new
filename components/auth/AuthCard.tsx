"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase/client";

export type AuthMode = "login" | "register" | "forgot";

type Props = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess?: () => void | Promise<void>;
  onGuest?: () => void;
};

export default function AuthCard({
  mode,
  onModeChange,
  onSuccess,
  onGuest,
}: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  const changeMode = (next: AuthMode) => {
    setMessage("");
    setSuccess(false);
    setPassword("");
    setPasswordAgain("");
    setShowPassword(false);
    onModeChange(next);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setMessage("Add meg az e-mail címed.");
      return;
    }

    if (!cleanEmail.includes("@")) {
      setMessage("Adj meg érvényes e-mail címet.");
      return;
    }

    setBusy(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: window.location.origin,
        });

        if (error) throw error;

        setSuccess(true);
        setMessage("Elküldtük a jelszó-visszaállító levelet.");
        return;
      }

      if (mode === "register") {
        if (name.trim().length < 2) {
          setMessage("Add meg a neved.");
          return;
        }

        if (password.length < 8) {
          setMessage("A jelszó legalább 8 karakter legyen.");
          return;
        }

        if (password !== passwordAgain) {
          setMessage("A két jelszó nem egyezik.");
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              name: name.trim(),
              display_name: name.trim(),
            },
            emailRedirectTo: window.location.origin,
          },
        });

        if (error) throw error;

        if (data.session) {
          setSuccess(true);
          setMessage("A fiókod elkészült. Beléptetünk…");
          await onSuccess?.();
          return;
        }

        setSuccess(true);
        setMessage(
          "Elküldtük a megerősítő levelet. Nyisd meg a benne lévő hivatkozást, majd jelentkezz be.",
        );
        return;
      }

      if (password.length < 8) {
        setMessage("A jelszó legalább 8 karakter legyen.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      setSuccess(true);
      setMessage("Sikeres bejelentkezés. Betöltjük a Zenvyrát…");
      await onSuccess?.();
    } catch (error) {
      const raw =
        error instanceof Error ? error.message : "A művelet nem sikerült.";

      setSuccess(false);

      if (raw.toLowerCase().includes("invalid login credentials")) {
        setMessage("Hibás e-mail-cím vagy jelszó.");
      } else if (
        raw.toLowerCase().includes("already registered") ||
        raw.toLowerCase().includes("user already registered")
      ) {
        setMessage("Ehhez az e-mail-címhez már tartozik fiók.");
      } else if (raw.toLowerCase().includes("email rate limit")) {
        setMessage(
          "Túl sok e-mail-kérés érkezett rövid idő alatt. Próbáld újra néhány perc múlva.",
        );
      } else {
        setMessage(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-card">
      <header className="login-heading">
        <h2>
          {mode === "register"
            ? "Szia!"
            : mode === "forgot"
            ? "Új jelszó"
            : "Üdv újra!"}
        </h2>

        <div className="accent-line" />

        <p>
          {mode === "register"
            ? "Hozd létre a fiókod pár lépésben."
            : mode === "forgot"
            ? "Add meg az e-mail címed, és segítünk visszalépni."
            : "Jelentkezz be, és folytasd, ahol abbahagytad."}
        </p>
      </header>

      <div className="auth-tabs">
        <button
          type="button"
          className={mode === "login" ? "active" : ""}
          onClick={() => changeMode("login")}
        >
          Belépés
        </button>

        <button
          type="button"
          className={mode === "register" ? "active" : ""}
          onClick={() => changeMode("register")}
        >
          Regisztráció
        </button>
      </div>

      <form className="login-form" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            <span className="field-icon">♡</span>
            <input
              type="text"
              placeholder="Neved"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
        )}

        <label className="field">
          <span className="field-icon">✉</span>
          <input
            type="email"
            placeholder="E-mail cím"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>

        {mode !== "forgot" && (
          <label className="field">
            <span className="field-icon">⌑</span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Jelszó"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />

            <button
              type="button"
              className="eye-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={
                showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"
              }
            >
              {showPassword ? "◉" : "○"}
            </button>
          </label>
        )}

        {mode === "register" && (
          <label className="field">
            <span className="field-icon">✓</span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Jelszó újra"
              value={passwordAgain}
              onChange={(e) => setPasswordAgain(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}

        {mode === "login" && (
          <div className="form-row">
            <label className="remember">
              <input type="checkbox" defaultChecked />
              <span>Maradjak bejelentkezve</span>
            </label>

            <button
              type="button"
              className="text-link"
              onClick={() => changeMode("forgot")}
            >
              Elfelejtetted?
            </button>
          </div>
        )}

        {message && (
          <div className={success ? "auth-message success" : "auth-message"}>
            {message}
          </div>
        )}

        <button className="login-button" type="submit" disabled={busy}>
          {busy
            ? "Dolgozunk…"
            : mode === "register"
            ? "Regisztráció"
            : mode === "forgot"
            ? "Link küldése"
            : "Bejelentkezés"}
          <span aria-hidden="true">→</span>
        </button>
      </form>

      {mode !== "forgot" && (
        <>
          <div className="divider">
            <span />
            <small>vagy</small>
            <span />
          </div>

          <div className="social-stack">
            <button
              type="button"
              className="social-button"
              onClick={async () => {
                setMessage("");
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin },
                });
                if (error) {
                  setSuccess(false);
                  setMessage(error.message);
                }
              }}
            >
              <b className="google-g">G</b>
              <span>Folytatás Google-lal</span>
            </button>

            <button
              type="button"
              className="social-button"
              onClick={async () => {
                setMessage("");
                const { error } = await supabase.auth.signInWithOAuth({
                  provider: "apple",
                  options: { redirectTo: window.location.origin },
                });
                if (error) {
                  setSuccess(false);
                  setMessage(error.message);
                }
              }}
            >
              <b className="apple-dot">●</b>
              <span>Folytatás Apple-lel</span>
            </button>
          </div>

          {onGuest && (
            <button
              type="button"
              className="text-link"
              onClick={onGuest}
              style={{ marginTop: 14 }}
            >
              Megnézem vendégként
            </button>
          )}
        </>
      )}

      <footer className="register-row">
        {mode === "login" && (
          <>
            <span>Még nincs fiókod?</span>
            <button type="button" onClick={() => changeMode("register")}>
              Regisztrálok most →
            </button>
          </>
        )}

        {mode === "register" && (
          <>
            <span>Már van fiókod?</span>
            <button type="button" onClick={() => changeMode("login")}>
              Bejelentkezés →
            </button>
          </>
        )}

        {mode === "forgot" && (
          <button type="button" onClick={() => changeMode("login")}>
            ← Vissza a bejelentkezéshez
          </button>
        )}
      </footer>

      <nav className="auth-legal-links" aria-label="Jogi információk">
        <Link href="/adatkezeles">Adatkezelési tájékoztató</Link>
        <Link href="/felhasznalasi-feltetelek">Felhasználási feltételek</Link>
      </nav>
    </div>
  );
}
