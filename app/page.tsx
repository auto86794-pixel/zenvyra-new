"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import AuthCard, { type AuthMode } from "@/components/auth/AuthCard";
import Dashboard from "@/components/dashboard/Dashboard";
import ProfileOnboarding, {
  type ZenvyraProfile,
} from "@/components/onboarding/ProfileOnboarding";
import { supabase } from "@/lib/supabase/client";

const PROFILE_SELECT =
  "id, display_name, sex, age, height_cm, current_weight_kg, target_weight_kg, goal, activity_level, daily_calorie_goal, protein_target_g, carbs_target_g, fat_target_g, allergens, diet_type, disliked_ingredients, workout_minutes, fitness_level, movement_limitations, onboarding_completed";

function normalizeProfile(data: ZenvyraProfile): ZenvyraProfile {
  return {
    ...data,
    height_cm: data.height_cm === null ? null : Number(data.height_cm),
    current_weight_kg:
      data.current_weight_kg === null ? null : Number(data.current_weight_kg),
    target_weight_kg:
      data.target_weight_kg === null ? null : Number(data.target_weight_kg),
    allergens: Array.isArray(data.allergens) ? data.allergens : [],
    diet_type: data.diet_type ?? "omnivore",
    disliked_ingredients: Array.isArray(data.disliked_ingredients)
      ? data.disliked_ingredients
      : [],
    workout_minutes: data.workout_minutes ?? 20,
    fitness_level: data.fitness_level ?? "beginner",
    movement_limitations: Array.isArray(data.movement_limitations)
      ? data.movement_limitations
      : [],
    onboarding_completed: data.onboarding_completed === true,
  } as ZenvyraProfile;
}

export default function HomePage() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [authReady, setAuthReady] = useState(false);

  const [profile, setProfile] = useState<ZenvyraProfile | null>(null);
  const [profileReady, setProfileReady] = useState(false);
  const [profileReloadKey, setProfileReloadKey] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function syncSession() {
      const { data } = await supabase.auth.getSession();

      if (!mounted) return;

      setSession(data.session);
      setProfileReady(data.session ? false : true);
      setAuthReady(true);
    }

    void syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setGuestMode(false);
      setProfile(null);
      setProfileReady(nextSession ? false : true);
      setAuthReady(true);

      if (nextSession) {
        setProfileReloadKey((current) => current + 1);
      }
    });

    const handlePageShow = () => {
      void (async () => {
        const { data } = await supabase.auth.getSession();

        if (!mounted) return;

        setSession(data.session);
        setAuthReady(true);

        if (data.session) {
          setProfileReady(false);
          setProfileReloadKey((current) => current + 1);
        } else {
          setProfile(null);
          setProfileReady(true);
        }
      })();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handlePageShow();
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const sessionUserId = session?.user.id;

  useEffect(() => {
    let active = true;

    if (!sessionUserId) {
      queueMicrotask(() => {
        if (!active) return;
        setProfile(null);
        setProfileReady(true);
      });

      return () => {
        active = false;
      };
    }

    const userId = sessionUserId;

    async function loadProfile() {
      setProfileReady(false);

      const { data, error } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;

      if (error) {
        console.error("Profile load error:", error);
        setProfile(null);
        setProfileReady(true);
        return;
      }

      setProfile(data ? normalizeProfile(data as ZenvyraProfile) : null);
      setProfileReady(true);
    }

    void loadProfile();

    return () => {
      active = false;
    };
  }, [sessionUserId, profileReloadKey]);

  async function handleSignOut() {
    if (guestMode) {
      setGuestMode(false);
      setProfile(null);
      setProfileReady(true);
      return;
    }

    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setProfileReady(true);
  }

  if (!authReady || (session && !profileReady)) {
    return (
      <main className="auth-loading">
        <div className="auth-loading-mark">✦</div>
        <div>ZENVYRA</div>
      </main>
    );
  }

  if (session && profileReady && !profile?.onboarding_completed) {
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
        onProfileChange={setProfile}
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
            <Image
              src="/zenvyra-lotus.png"
              alt="ZENVYRA"
              className="brand-logo"
              width={512}
              height={512}
            />

            <div>
              <div className="brand-name">ZENVYRA</div>
              <div className="brand-tagline">
                TEST ÉS LÉLEK HARMÓNIÁBAN
              </div>
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
