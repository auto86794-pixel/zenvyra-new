"use client";

import { FormEvent, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export type AuthMode = "login" | "register" | "forgot";

type Props = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess: () => void;
  onGuest: () => void;
};

function readableAuthError(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Hibás e-mail cím vagy jelszó.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Az e-mail címed még nincs megerősítve. Nézd meg a leveleid.";
  }

  if (
    normalized.includes("user already registered") ||
    normalized.includes("already been registered")
  ) {
    return "Ehhez az e-mail címhez már tartozik fiók.";
  }

  if (normalized.includes("password")) {
    return "A jelszó nem felel meg a követelményeknek.";
  }

  return message;
}

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

  function changeMode(next: AuthMode) {
    setMessage("");
    setSuccess(false);
    setPassword("");
    setPasswordAgain("");
    setShowPassword(false);
    onModeChange(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess(false);

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setMessage("Adj meg érvényes e-mail címet.");
      return;
    }

    if (mode === "forgot") {
      setBusy(true);

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: window.location.origin,
      });

      setBusy(false);

      if (error) {
        setMessage(readableAuthError(error.message));
        return;
      }

      setSuccess(true);
      setMessage("Elküldtük a jelszó-visszaállító levelet.");
      return;
    }

    if (password.length < 8) {
      setMessage("A jelszó legalább 8 karakter legyen.");
      return;
    }

    if (mode === "register") {
      if (name.trim().length < 2) {
        setMessage("Add meg a neved.");
        return;
      }

      if (password !== passwordAgain) {
        setMessage("A két jelszó nem egyezik.");
        return;
      }

      setBusy(true);

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            display_name: name.trim(),
          },
          emailRedirectTo: window.location.origin,
        },
      });

      setBusy(false);

      if (error) {
        setMessage(readableAuthError(error.message));
        return;
      }

      if (data.session) {
        onSuccess();
        return;
      }

      setSuccess(true);
      setMessage(
        "A fiók elkészült. Küldtünk egy megerősítő e-mailt; kattints a benne lévő linkre."
      );
      return;
    }

    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setBusy(false);

    if (error) {
      setMessage(readableAuthError(error.message));
      return;
    }

    onSuccess();
  }

  async function socialLogin(provider: "google" | "apple") {
    setMessage("");
    setSuccess(false);
    setBusy(true);

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (error) {
      setBusy(false);
      setMessage(
        provider === "google"
          ? "A Google-belépés még nincs engedélyezve a Supabase-ben."
          : "Az Apple-belépés még nincs engedélyezve a Supabase-ben."
      );
    }
  }

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

      {mode !== "forgot" && (
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
      )}

      <form className="login-form" onSubmit={submit}>
        {mode === "register" && (
          <label className="field">
            <span className="field-icon">♡</span>
            <input
              type="text"
              placeholder="Neved"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              disabled={busy}
            />
          </label>
        )}

        <label className="field">
          <span className="field-icon">✉</span>
          <input
            type="email"
            placeholder="E-mail cím"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            disabled={busy}
          />
        </label>

        {mode !== "forgot" && (
          <label className="field">
            <span className="field-icon">⌑</span>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Jelszó"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              disabled={busy}
            />

            <button
              type="button"
              className="eye-button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Jelszó elrejtése" : "Jelszó megjelenítése"}
              disabled={busy}
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
              onChange={(event) => setPasswordAgain(event.target.value)}
              autoComplete="new-password"
              disabled={busy}
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
              disabled={busy}
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
            ? "Dolgozom…"
            : mode === "register"
              ? "Regisztráció"
              : mode === "forgot"
                ? "Link küldése"
                : "Bejelentkezés"}
          {!busy && <span aria-hidden="true">→</span>}
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
              className="social-button google"
              onClick={() => socialLogin("google")}
              disabled={busy}
            >
              <b className="google-g">G</b>
              <span>Folytatás Google-lal</span>
            </button>

            <button
              type="button"
              className="social-button apple"
              onClick={() => socialLogin("apple")}
              disabled={busy}
            >
              <b className="apple-dot">●</b>
              <span>Folytatás Apple-lel</span>
            </button>

            <button
              type="button"
              className="guest-button"
              onClick={onGuest}
              disabled={busy}
            >
              Megnézem vendégként
            </button>
          </div>
        </>
      )}

      <footer className="register-row">
        {mode === "login" && (
          <>
            <span>Még nincs fiókod?</span>
            <button type="button" onClick={() => changeMode("register")} disabled={busy}>
              Regisztrálok most →
            </button>
          </>
        )}

        {mode === "register" && (
          <>
            <span>Már van fiókod?</span>
            <button type="button" onClick={() => changeMode("login")} disabled={busy}>
              Bejelentkezés →
            </button>
          </>
        )}

        {mode === "forgot" && (
          <button type="button" onClick={() => changeMode("login")} disabled={busy}>
            ← Vissza a bejelentkezéshez
          </button>
        )}
      </footer>
    </div>
  );
}
