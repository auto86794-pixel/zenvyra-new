"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import AuthCard, { type AuthMode } from "@/components/auth/AuthCard";
import Dashboard from "@/components/dashboard/Dashboard";
import ProfileOnboarding, {
  type ZenvyraProfile,
} from "@/components/onboarding/ProfileOnboarding";
import { supabase } from "@/lib/supabase/client";

export default function HomePage() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<ZenvyraProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setGuestMode(false);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileReady(true);
      return;
    }

    let active = true;

    async function loadProfile() {
      setProfileReady(false);

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, sex, age, height_cm, current_weight_kg, target_weight_kg, goal, activity_level, daily_calorie_goal, protein_target_g, carbs_target_g, fat_target_g, onboarding_completed"
        )
        .eq("id", session!.user.id)
        .maybeSingle();

      if (!active) return;

      if (error || !data) {
        setProfile(null);
      } else {
        setProfile({
          ...data,
          height_cm: data.height_cm === null ? null : Number(data.height_cm),
          current_weight_kg:
            data.current_weight_kg === null
              ? null
              : Number(data.current_weight_kg),
          target_weight_kg:
            data.target_weight_kg === null ? null : Number(data.target_weight_kg),
        } as ZenvyraProfile);
      }

      setProfileReady(true);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [session?.user]);

  async function handleSignOut() {
    if (guestMode) {
      setGuestMode(false);
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  if (!authReady || (session && !profileReady)) {
    return (
      <main className="auth-loading">
        <div className="auth-loading-mark">✦</div>
        <div>ZENVYRA</div>
      </main>
    );
  }

  if (session && !profile?.onboarding_completed) {
    return (
      <ProfileOnboarding
        session={session}
        initialProfile={profile}
        onComplete={setProfile}
      />
    );
  }

  if (session || guestMode) {
    return (
      <Dashboard
        onSignOut={handleSignOut}
        session={session}
        guestMode={guestMode}
        profile={profile}
      />
    );
  }

  return (
    <main className="landing-shell">
      <section className="hero-panel">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />

        <div className="hero-content">
          <div className="brand">
            <div className="lotus" aria-hidden="true">
              <span>◡</span>
              <span>◇</span>
              <span>◡</span>
            </div>

            <div>
              <div className="brand-name">ZENVYRA</div>
              <div className="brand-tagline">WELLNESS FOR YOU</div>
            </div>
          </div>

          <div className="hero-copy">
            <h1>
              Egyensúly.
              <br />
              Tudatosság.
              <br />
              <em>Te.</em>
            </h1>

            <div className="hero-line" />
            <p>Táplálkozás, mozgás és közérzet harmóniában.</p>
          </div>

          <div className="feature-strip">
            <article>
              <div className="feature-icon peach">◒</div>
              <strong>TÁPLÁLKOZÁS</strong>
              <span>Tudatos étkezés egyszerűen</span>
            </article>

            <article>
              <div className="feature-icon lavender">⌁</div>
              <strong>MOZGÁS</strong>
              <span>Edzések, amik inspirálnak</span>
            </article>

            <article>
              <div className="feature-icon pink">◇</div>
              <strong>KÖZÉRZET</strong>
              <span>Test és lélek egyensúlyban</span>
            </article>

            <article>
              <div className="feature-icon violet">▥</div>
              <strong>HALADÁS</strong>
              <span>Kövesd nyomon a fejlődésed</span>
            </article>
          </div>
        </div>
      </section>

      <section className="login-side">
        <AuthCard
          mode={authMode}
          onModeChange={setAuthMode}
          onSuccess={() => undefined}
          onGuest={() => {
            setGuestMode(true);
            setProfileReady(true);
          }}
        />
      </section>
    </main>
  );
}
