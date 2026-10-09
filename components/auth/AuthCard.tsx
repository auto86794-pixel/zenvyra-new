"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { supabase, usesNeon, getNeonPasswordClient } from "@/lib/supabase/client";

export type AuthMode = "login" | "register" | "forgot";

type Props = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onSuccess?: () => void | Promise<void>;
  onGuest?: () => void;
  onBack?: () => void;
};

export default function AuthCard({
  mode,
  onModeChange,
  onSuccess,
  onGuest,
  onBack,
}: Props) {
  const [verifyEmail, setVerifyEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
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
          redirectTo: usesNeon ? `${window.location.origin}/jelszo-visszaallitas` : window.location.origin,
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

        if (usesNeon) {
          const result = await getNeonPasswordClient().signUp.email({
            email: cleanEmail, password, name: name.trim(), callbackURL: window.location.origin,
          });
          if (result.error) throw result.error;
          setVerifyEmail(cleanEmail);
          setSuccess(true);
          setMessage("A fiókod elkészült. Add meg az e-mailben kapott megerősítő kódot.");
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
        if (usesNeon) {
          setVerifyEmail(cleanEmail);
          setMessage("A fiókod elkészült. Add meg az e-mailben kapott megerősítő kódot.");
        } else {
          setMessage("Elküldtük a megerősítő levelet. Nyisd meg a benne lévő hivatkozást, majd jelentkezz be.");
        }
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
        error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "A művelet nem sikerült.";

      setSuccess(false);

      if (/invalid login credentials|invalid email or password/i.test(raw)) {
        setMessage("Hibás e-mail-cím vagy jelszó.");
      } else if (
        raw.toLowerCase().includes("already registered") ||
        raw.toLowerCase().includes("user already registered") || raw.toLowerCase().includes("user already exists")
      ) {
        setMessage("Ehhez az e-mail-címhez már tartozik fiók.");
      } else if (raw.toLowerCase().includes("email rate limit")) {
        setMessage(
          "Túl sok e-mail-kérés érkezett rövid idő alatt. Próbáld újra néhány perc múlva.",
        );
      } else if (/failed to fetch|network|fetch failed/i.test(raw)) {
        setMessage("Nem sikerült kapcsolódni a szolgáltatáshoz. Ellenőrizd az internetkapcsolatot, majd próbáld újra.");
      } else if (/email.*not.*verified|email.*not.*confirmed/i.test(raw) && usesNeon) {
        setVerifyEmail(cleanEmail);
        setMessage("Erősítsd meg az e-mail-címedet. Ha szükséges, kérj új kódot.");
      } else {
        setMessage(raw);
      }
    } finally {
      setBusy(false);
    }
  };

  async function verifyAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setSuccess(false);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: verifyEmail, token: verificationCode.trim(), type: "signup" });
      if (error) throw error;
      setVerifyEmail("");
      setVerificationCode("");
      setSuccess(true);
      setMessage("Az e-mail-címed megerősítve. Most már bejelentkezhetsz.");
      onModeChange("login");
      await onSuccess?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A kód ellenőrzése nem sikerült.");
    } finally { setBusy(false); }
  }

  async function resendCode() {
    setBusy(true);
    try {
      const { error } = usesNeon
        ? await getNeonPasswordClient().emailOtp.sendVerificationOtp({ email: verifyEmail, type: "email-verification" })
        : await supabase.auth.resend({ type: "signup", email: verifyEmail });
      if (error) throw error;
      setSuccess(true);
      setVerificationCode("");
      setMessage("Új kódot kértünk. A legfrissebb levélben érkező kódot használd; nézd meg a levélszemét mappát is.");
    } catch (error) {
      setSuccess(false);
      setMessage(error instanceof Error ? error.message : "A kód küldése nem sikerült.");
    } finally { setBusy(false); }
  }

  if (verifyEmail) {
    return <div className="login-card premium-auth-card">
      <header className="login-heading"><h2>Erősítsd meg az e-mail-címed</h2><p>Add meg a(z) {verifyEmail} címre kapott kódot.</p></header>
      <form className="login-form" onSubmit={verifyAccount}>
        <label className="field"><span className="sr-only">Megerősítő kód</span><input aria-label="Megerősítő kód" autoComplete="one-time-code" inputMode="numeric" required value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} /></label>
        <div role="status" className={success ? "auth-message success" : "auth-message"}>{message}</div>
        <button className="login-button" disabled={busy || !verificationCode.trim()} type="submit">{busy ? "Dolgozunk…" : "E-mail-cím megerősítése"}</button>
      </form>
      <button className="text-link" type="button" disabled={busy} onClick={resendCode}>Új kódot kérek</button>
      <button className="text-link" type="button" disabled={busy} onClick={() => { setVerifyEmail(""); changeMode("login"); }}>Vissza a belépéshez</button>
    </div>;
  }

  return (
    <div className="login-card premium-auth-card">
      {onBack && (
        <button
          type="button"
          className="auth-back-button"
          onClick={onBack}
          aria-label="Vissza a nyitóképernyőre"
        >
          <span aria-hidden="true">←</span>
          <span>Vissza</span>
        </button>
      )}
      <header className="login-heading">
        <h2>
          {mode === "register"
            ? "Csatlakozz hozzánk!"
            : mode === "forgot"
            ? "Új jelszó"
            : "Üdv újra!"}
        </h2>

        <div className="accent-line" />

        <p>
          {mode === "register"
            ? "Hozz létre fiókot, és fedezd fel a Zenvyra minden lehetőségét."
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
          {!usesNeon && <>
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

          </>}

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
