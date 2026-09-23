"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import AuthCard, { type AuthMode } from "@/components/auth/AuthCard";
import type { ZenvyraProfile } from "@/components/onboarding/ProfileOnboarding";
import { supabase } from "@/lib/supabase/client";

const Dashboard = dynamic(() => import("@/components/dashboard/Dashboard"), {
  loading: () => <AppLoading />,
});

const ProfileOnboarding = dynamic(
  () => import("@/components/onboarding/ProfileOnboarding"),
  { loading: () => <AppLoading /> },
);

function AppLoading() {
  return (
    <main className="auth-loading">
      <div className="auth-loading-mark">✦</div>
      <div>ZENVYRA</div>
    </main>
  );
}

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
  const [showAuth, setShowAuth] = useState(false);

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


    return () => {
      mounted = false;
      subscription.unsubscribe();
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

  if (session && !profileReady) {
    return <AppLoading />;
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

  if (!showAuth) {
    return (
      <main className="welcome-cover">
        <div className="welcome-cover-frame">
          <img
            src="/zenvyra-welcome.webp"
            alt="Zenvyra – Test, lélek, egyensúly"
            className="welcome-cover-image"
            width="989"
            height="1590"
            fetchPriority="high"
            decoding="async"
          />
          <button
            type="button"
            className="welcome-hotspot welcome-hotspot-guest"
            aria-label="Belépek regisztráció nélkül"
            onClick={() => {
              setGuestMode(true);
              setProfileReady(true);
            }}
          />
          <button
            type="button"
            className="welcome-hotspot welcome-hotspot-auth"
            aria-label="Belépés vagy regisztráció"
            onClick={() => setShowAuth(true)}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="landing-shell">
      <section className="hero-panel">
        <picture className="welcome-hero-picture">
          <source media="(max-width: 720px)" srcSet="/zenvyra-hero-mobile-clean.webp" />
          <img
            src="/zenvyra-hero.webp"
            alt="Zenvyra wellness"
            className="welcome-hero-image"
            width="1536"
            height="1024"
            decoding="async"
          />
        </picture>
      </section>

      <section className="login-side">
        {!authReady && (
          <p className="session-check" role="status" aria-live="polite">
            Munkamenet ellenőrzése…
          </p>
        )}
        <button type="button" className="auth-back-to-cover" onClick={() => setShowAuth(false)}>
          ← Vissza
        </button>
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
