"use client";

import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import type { ZenvyraProfile } from "@/components/onboarding/ProfileOnboarding";

export type PersonalPreferences = {
  diet_type: NonNullable<ZenvyraProfile["diet_type"]>;
  allergens: string[];
  disliked_ingredients: string[];
  workout_minutes: 10 | 15 | 20 | 30 | 40;
  fitness_level: "beginner" | "intermediate" | "advanced";
  movement_limitations: string[];
};

export const defaultPreferences: PersonalPreferences = {
  diet_type: "omnivore",
  allergens: [],
  disliked_ingredients: [],
  workout_minutes: 20,
  fitness_level: "beginner",
  movement_limitations: [],
};

const allergenOptions = [
  ["milk", "Tej"],
  ["gluten", "Glutén"],
  ["egg", "Tojás"],
  ["nuts", "Diófélék"],
  ["fish", "Hal"],
  ["soy", "Szója"],
  ["sesame", "Szezám"],
] as const;

const workoutMinuteOptions = [10, 15, 20, 30, 40] as const;

const fitnessLevelOptions = [
  ["beginner", "Kezdő"],
  ["intermediate", "Középhaladó"],
  ["advanced", "Haladó"],
] as const;

type Props = {
  session: Session | null;
  guestMode: boolean;
  initial: PersonalPreferences;
  onChange: (preferences: PersonalPreferences) => void;
};

function joinList(values: string[] | undefined) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toLocaleLowerCase("hu"))
    .filter(Boolean);
}

export default function PreferencesPanel({
  session,
  guestMode,
  initial,
  onChange,
}: Props) {
  const [dietType, setDietType] = useState<PersonalPreferences["diet_type"]>(
    initial.diet_type,
  );
  const [allergens, setAllergens] = useState<string[]>(initial.allergens);
  const [disliked, setDisliked] = useState(
    joinList(initial.disliked_ingredients),
  );
  const [workoutMinutes, setWorkoutMinutes] =
    useState<PersonalPreferences["workout_minutes"]>(initial.workout_minutes);
  const [fitnessLevel, setFitnessLevel] =
    useState<PersonalPreferences["fitness_level"]>(initial.fitness_level);
  const [movementLimitations, setMovementLimitations] = useState(
    joinList(initial.movement_limitations),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDietType(initial.diet_type);
    setAllergens(initial.allergens);
    setDisliked(joinList(initial.disliked_ingredients));
    setWorkoutMinutes(initial.workout_minutes);
    setFitnessLevel(initial.fitness_level);
    setMovementLimitations(joinList(initial.movement_limitations));
  }, [initial]);

  function toggleAllergen(value: string) {
    setAllergens((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const preferences: PersonalPreferences = {
      diet_type: dietType,
      allergens,
      disliked_ingredients: splitList(disliked),
      workout_minutes: workoutMinutes,
      fitness_level: fitnessLevel,
      movement_limitations: splitList(movementLimitations),
    };

    if (guestMode || !session?.user) {
      window.localStorage.setItem(
        "zenvyra-personal-preferences",
        JSON.stringify(preferences),
      );
      onChange(preferences);
      setMessage("✓ Profil elmentve ezen az eszközön.");
      setBusy(false);
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        ...preferences,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    if (error) {
      console.error("Preferences save error:", error);
      setMessage("A profil mentése nem sikerült. Próbáld újra.");
      setBusy(false);
      return;
    }

    onChange(preferences);
    setMessage("✓ Profil elmentve");
    setBusy(false);
  }

  return (
    <article className="dashboard-card preferences-card">
      <span className="card-kicker">SZEMÉLYES SZŰRŐK</span>
      <h2>A Zenvyra igazodjon hozzád.</h2>
      <p>
        Recepteket és mozgást ezek alapján ajánlunk. Később bármikor
        módosíthatod.
      </p>

      <form onSubmit={save} className="preferences-form">
        <fieldset>
          <legend>Étkezési irány</legend>

          <div className="preference-options three">
            {(
              [
                ["omnivore", "Mindenevő"],
                ["vegetarian", "Vegetáriánus"],
                ["vegan", "Vegán"],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={dietType === value ? "active" : ""}
                onClick={() => setDietType(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Kerülendő allergének</legend>

          <div className="preference-options">
            {allergenOptions.map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={allergens.includes(value) ? "active" : ""}
                onClick={() => toggleAllergen(value)}
                aria-pressed={allergens.includes(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <label>
          <span>Nem kedvelt alapanyagok</span>
          <input
            value={disliked}
            onChange={(event) => setDisliked(event.target.value)}
            placeholder="például gomba, brokkoli"
          />
          <small>Vesszővel válaszd el őket.</small>
        </label>

        <div className="preferences-grid">
          <fieldset>
            <legend>Mennyi időd van?</legend>

            <div className="preference-options compact">
              {workoutMinuteOptions.map((value) => (
                <button
                  type="button"
                  key={value}
                  className={workoutMinutes === value ? "active" : ""}
                  onClick={() => setWorkoutMinutes(value)}
                >
                  {value} perc
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Edzettségi szint</legend>

            <div className="preference-options compact">
              {fitnessLevelOptions.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={fitnessLevel === value ? "active" : ""}
                  onClick={() => setFitnessLevel(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        <label>
          <span>Mozgáskorlátozás vagy kerülendő terhelés</span>
          <input
            value={movementLimitations}
            onChange={(event) => setMovementLimitations(event.target.value)}
            placeholder="például térd, váll, ugrálás"
          />
          <small>
            Vesszővel válaszd el. Ezt a Zenvyra a mozgásajánlások szűrésére
            használja.
          </small>
        </label>

        <div
          style={{
            marginTop: "22px",
            paddingTop: "18px",
            borderTop: "1px solid rgba(83, 51, 107, 0.12)",
          }}
        >
          <button
            type="submit"
            disabled={busy}
            style={{
              display: "flex",
              width: "100%",
              minHeight: "clamp(46px, 4vw, 52px)",
              alignItems: "center",
              justifyContent: "center",
              border: "0",
              borderRadius: "16px",
              background: busy ? "#b9a7c8" : "#5b3475",
              color: "#ffffff",
              fontSize: "clamp(14px, 2.8vw, 15px)",
              fontWeight: 800,
              letterSpacing: "0.01em",
              cursor: busy ? "wait" : "pointer",
              boxShadow: "0 10px 24px rgba(91, 52, 117, 0.16)",
            }}
          >
            {busy ? "Mentés…" : "Profil mentése"}
          </button>

          {message && (
            <div
              className="preference-message"
              role="status"
              style={{
                display: "block",
                marginTop: "12px",
                textAlign: "center",
                fontWeight: 700,
              }}
            >
              {message}
            </div>
          )}
        </div>
      </form>
    </article>
  );
}
