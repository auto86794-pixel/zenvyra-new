"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";

export type ZenvyraProfile = {
  id: string;
  display_name: string;
  sex: "female" | "male" | null;
  age: number | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  target_weight_kg: number | null;
  goal: "lose" | "maintain" | "gain" | null;
  activity_level:
    | "low"
    | "light"
    | "moderate"
    | "high"
    | "very_high"
    | null;
  daily_calorie_goal: number | null;
  protein_target_g: number | null;
  carbs_target_g: number | null;
  fat_target_g: number | null;
  // Személyes szűrők – a Supabase profiles tábla mezőneveivel egységesen.
  // Opcionálisak, hogy régebbi profilok betöltésekor se törjön a felület.
  allergens?: string[];
  diet_type?: DietType;
  disliked_ingredients?: string[];
  workout_minutes?: 10 | 15 | 20 | 30 | 40;
  fitness_level?: FitnessLevel;
  movement_limitations?: string[];

  onboarding_completed: boolean;
};

type Props = {
  session: Session;
  initialProfile: ZenvyraProfile | null;
  onComplete: (profile: ZenvyraProfile) => void;
};

type Step = 1 | 2 | 3 | 4;

type DietType = "omnivore" | "vegetarian" | "vegan";
type FitnessLevel = "beginner" | "intermediate" | "advanced";

const activityOptions = [
  {
    id: "low",
    title: "Kevés mozgás",
    text: "Főleg ülő életmód",
    factor: 1.2,
  },
  {
    id: "light",
    title: "Könnyű aktivitás",
    text: "Heti 1–3 könnyebb edzés",
    factor: 1.375,
  },
  {
    id: "moderate",
    title: "Aktív",
    text: "Heti 3–5 edzés",
    factor: 1.55,
  },
  {
    id: "high",
    title: "Nagyon aktív",
    text: "Heti 6–7 edzés",
    factor: 1.725,
  },
  {
    id: "very_high",
    title: "Intenzív",
    text: "Fizikai munka + rendszeres edzés",
    factor: 1.9,
  },
] as const;

export default function ProfileOnboarding({
  session,
  initialProfile,
  onComplete,
}: Props) {
  const metadataName =
    typeof session.user.user_metadata?.display_name === "string"
      ? session.user.user_metadata.display_name
      : "";

  const [step, setStep] = useState<Step>(1);
  const [displayName, setDisplayName] = useState(
    initialProfile?.display_name || metadataName || ""
  );
  const [sex, setSex] = useState<"female" | "male">(
    initialProfile?.sex || "female"
  );
  const [age, setAge] = useState(
    initialProfile?.age ? String(initialProfile.age) : ""
  );
  const [height, setHeight] = useState(
    initialProfile?.height_cm ? String(initialProfile.height_cm) : ""
  );
  const [weight, setWeight] = useState(
    initialProfile?.current_weight_kg
      ? String(initialProfile.current_weight_kg)
      : ""
  );
  const [targetWeight, setTargetWeight] = useState(
    initialProfile?.target_weight_kg
      ? String(initialProfile.target_weight_kg)
      : ""
  );
  const [goal, setGoal] = useState<"lose" | "maintain" | "gain">(
    initialProfile?.goal || "lose"
  );
  const [activity, setActivity] = useState<
    "low" | "light" | "moderate" | "high" | "very_high"
  >(initialProfile?.activity_level || "light");
  const [allergens, setAllergens] = useState<string[]>(
    initialProfile?.allergens ?? []
  );
  const [dietType, setDietType] = useState<DietType>(
    initialProfile?.diet_type ?? "omnivore"
  );
  const [dislikedIngredients, setDislikedIngredients] = useState(
    initialProfile?.disliked_ingredients?.join(", ") ?? ""
  );
  const [workoutMinutes, setWorkoutMinutes] = useState<10 | 15 | 20 | 30 | 40>(
    initialProfile?.workout_minutes ?? 20
  );
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(
    initialProfile?.fitness_level ?? "beginner"
  );
  const [movementLimitations, setMovementLimitations] = useState(
    initialProfile?.movement_limitations?.join(", ") ?? ""
  );

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const estimate = useMemo(() => {
    const ageN = Number(age.replace(",", "."));
    const heightN = Number(height.replace(",", "."));
    const weightN = Number(weight.replace(",", "."));

    if (
      !Number.isFinite(ageN) ||
      !Number.isFinite(heightN) ||
      !Number.isFinite(weightN)
    ) {
      return null;
    }

    const sexConstant = sex === "male" ? 5 : -161;
    const bmr = 10 * weightN + 6.25 * heightN - 5 * ageN + sexConstant;
    const activityFactor =
      activityOptions.find((item) => item.id === activity)?.factor ?? 1.375;

    let calories = bmr * activityFactor;

    if (goal === "lose") calories -= 350;
    if (goal === "gain") calories += 250;

    calories = Math.max(1200, Math.min(4500, Math.round(calories / 10) * 10));

    const proteinMultiplier =
      goal === "lose" ? 1.8 : goal === "gain" ? 1.7 : 1.6;
    const protein = Math.round(weightN * proteinMultiplier);
    const fat = Math.round(weightN * 0.8);
    const remaining = Math.max(0, calories - protein * 4 - fat * 9);
    const carbs = Math.round(remaining / 4);

    return { calories, protein, carbs, fat };
  }, [activity, age, goal, height, sex, weight]);

  function parseNumber(value: string) {
    return Number(value.replace(",", "."));
  }

  function canContinueStep1() {
    const ageN = parseNumber(age);
    const heightN = parseNumber(height);
    const weightN = parseNumber(weight);

    return (
      displayName.trim().length >= 2 &&
      ageN >= 14 &&
      ageN <= 100 &&
      heightN >= 120 &&
      heightN <= 230 &&
      weightN >= 30 &&
      weightN <= 250
    );
  }

  function canContinueStep2() {
    const target = parseNumber(targetWeight);
    return target >= 30 && target <= 250;
  }

  function toggleAllergen(value: string) {
    setAllergens((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  function splitList(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!estimate) return;

    setBusy(true);
    setMessage("");

    const payload = {
      id: session.user.id,
      display_name: displayName.trim(),
      sex,
      age: Math.round(parseNumber(age)),
      height_cm: parseNumber(height),
      current_weight_kg: parseNumber(weight),
      target_weight_kg: parseNumber(targetWeight),
      goal,
      activity_level: activity,
      daily_calorie_goal: estimate.calories,
      protein_target_g: estimate.protein,
      carbs_target_g: estimate.carbs,
      fat_target_g: estimate.fat,
      allergens,
      diet_type: dietType,
      disliked_ingredients: splitList(dislikedIngredients),
      workout_minutes: workoutMinutes,
      fitness_level: fitnessLevel,
      movement_limitations: splitList(movementLimitations),
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .upsert(payload, { onConflict: "id" })
      .select(
        "id, display_name, sex, age, height_cm, current_weight_kg, target_weight_kg, goal, activity_level, daily_calorie_goal, protein_target_g, carbs_target_g, fat_target_g, allergens, diet_type, disliked_ingredients, workout_minutes, fitness_level, movement_limitations, onboarding_completed"
      )
      .single();

    if (error || !data) {
      setMessage("A profil mentése nem sikerült. Próbáld újra.");
      setBusy(false);
      return;
    }

    onComplete({
      ...data,
      height_cm: data.height_cm === null ? null : Number(data.height_cm),
      current_weight_kg:
        data.current_weight_kg === null ? null : Number(data.current_weight_kg),
      target_weight_kg:
        data.target_weight_kg === null ? null : Number(data.target_weight_kg),
    } as ZenvyraProfile);

    setBusy(false);
  }

  return (
    <main className="onboarding-shell">
      <section className="onboarding-visual">
        <div className="onboarding-brand">
          <div className="internal-brand-logo" aria-hidden="true">
            <Image
              className="internal-brand-logo-image"
              src="/zenvyra-internal-logo.png"
              alt=""
              width={512}
              height={512}
            />
          </div>
          <div>
            <strong>ZENVYRA</strong>
            <span>wellness for you</span>
          </div>
        </div>

        <div className="onboarding-copy">
          <span>AZ ELSŐ LÉPÉS</span>
          <h1>
            A Zenvyra
            <br />
            rólad szól.
          </h1>
          <p>
            Néhány alapadatból személyre szabjuk a napi céljaidat. Később
            bármikor módosíthatod őket.
          </p>
        </div>

        <div className="onboarding-promise">
          <div>♡</div>
          <strong>Nem a tökéletességet mérjük.</strong>
          <span>A saját ritmusodhoz igazítjuk a tervet.</span>
        </div>
      </section>

      <section className="onboarding-form-side">
        <form className="onboarding-card" onSubmit={saveProfile}>
          <div className="step-row" aria-label="Beállítás lépései">
            {[1, 2, 3, 4].map((value) => (
              <span
                key={value}
                className={step >= value ? "active" : ""}
                aria-current={step === value ? "step" : undefined}
              >
                {value}
              </span>
            ))}
          </div>

          {step === 1 && (
            <>
              <div className="onboarding-heading">
                <span>1 / 4 · ALAPADATOK</span>
                <h2>Ismerjük meg egymást.</h2>
                <p>Ezekből számoljuk az első napi kiindulópontot.</p>
              </div>

              <div className="onboarding-fields">
                <label>
                  <span>Hogy szólíthatunk?</span>
                  <input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Keresztnév"
                    autoFocus
                  />
                </label>

                <div className="form-grid-2">
                  <label>
                    <span>Életkor</span>
                    <input
                      value={age}
                      onChange={(event) => setAge(event.target.value)}
                      inputMode="numeric"
                      placeholder="35"
                    />
                  </label>

                  <label>
                    <span>Magasság</span>
                    <div className="input-unit">
                      <input
                        value={height}
                        onChange={(event) => setHeight(event.target.value)}
                        inputMode="decimal"
                        placeholder="168"
                      />
                      <b>cm</b>
                    </div>
                  </label>
                </div>

                <label>
                  <span>Biológiai nem</span>
                  <div className="choice-grid">
                    {[
                      ["female", "Nő"],
                      ["male", "Férfi"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={sex === value ? "active" : ""}
                        onClick={() =>
                          setSex(value as "female" | "male")
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <small className="field-help">A napi energiaszükséglet pontosabb becsléséhez használjuk.</small>
                </label>

                <label>
                  <span>Jelenlegi testsúly</span>
                  <div className="input-unit">
                    <input
                      value={weight}
                      onChange={(event) => setWeight(event.target.value)}
                      inputMode="decimal"
                      placeholder="68,4"
                    />
                    <b>kg</b>
                  </div>
                </label>
              </div>

              <button
                type="button"
                className="onboarding-primary"
                disabled={!canContinueStep1()}
                onClick={() => setStep(2)}
              >
                Tovább →
              </button>
            </>
          )}

          {step === 2 && (
            <>
              <div className="onboarding-heading">
                <span>2 / 4 · CÉL</span>
                <h2>Merre szeretnél haladni?</h2>
                <p>Nem végleges döntés. A cél később bármikor átállítható.</p>
              </div>

              <div className="goal-grid">
                {[
                  ["lose", "Könnyebb szeretnék lenni", "Fokozatos fogyás"],
                  ["maintain", "Tartani szeretném", "Súlymegtartás"],
                  ["gain", "Erősödni szeretnék", "Tömegnövelés"],
                ].map(([value, title, text]) => (
                  <button
                    type="button"
                    key={value}
                    className={goal === value ? "active" : ""}
                    onClick={() =>
                      setGoal(value as "lose" | "maintain" | "gain")
                    }
                  >
                    <i>✦</i>
                    <strong>{title}</strong>
                    <span>{text}</span>
                  </button>
                ))}
              </div>

              <label className="target-weight-field">
                <span>Célsúly</span>
                <div className="input-unit">
                  <input
                    value={targetWeight}
                    onChange={(event) => setTargetWeight(event.target.value)}
                    inputMode="decimal"
                    placeholder="65,0"
                  />
                  <b>kg</b>
                </div>
              </label>

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-back"
                  onClick={() => setStep(1)}
                >
                  ← Vissza
                </button>
                <button
                  type="button"
                  className="onboarding-primary"
                  disabled={!canContinueStep2()}
                  onClick={() => setStep(3)}
                >
                  Tovább →
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="onboarding-heading">
                <span>3 / 4 · AKTIVITÁS</span>
                <h2>Milyen a hétköznapod?</h2>
                <p>Válaszd azt, ami átlagosan a legjobban jellemez.</p>
              </div>

              <div className="activity-list">
                {activityOptions.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={activity === item.id ? "active" : ""}
                    onClick={() => setActivity(item.id)}
                  >
                    <i />
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                    </div>
                  </button>
                ))}
              </div>

              {estimate && (
                <div className="plan-preview">
                  <div>
                    <span>KEZDŐ NAPI TERVED</span>
                    <strong>{estimate.calories} kcal</strong>
                  </div>
                  <div className="preview-macros">
                    <div>
                      <span>Fehérje</span>
                      <b>{estimate.protein} g</b>
                    </div>
                    <div>
                      <span>Szénhidrát</span>
                      <b>{estimate.carbs} g</b>
                    </div>
                    <div>
                      <span>Zsír</span>
                      <b>{estimate.fat} g</b>
                    </div>
                  </div>
                  <small>
                    Ez egy induló becslés, nem orvosi vagy dietetikai ajánlás.
                  </small>
                </div>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-back"
                  onClick={() => setStep(2)}
                >
                  ← Vissza
                </button>
                <button
                  type="button"
                  className="onboarding-primary"
                  disabled={!estimate}
                  onClick={() => setStep(4)}
                >
                  Tovább →
                </button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="onboarding-heading">
                <span>4 / 4 · SZEMÉLYRE SZABÁS</span>
                <h2>Mi illik hozzád?</h2>
                <p>Innen tudjuk kiszűrni azokat az ételeket és mozgásokat, amelyek nem neked valók.</p>
              </div>

              <div className="onboarding-fields">
                <label>
                  <span>Allergének</span>
                  <div className="choice-grid">
                    {[
                      ["milk", "Tej"],
                      ["gluten", "Glutén"],
                      ["egg", "Tojás"],
                      ["nuts", "Diófélék"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={allergens.includes(value) ? "active" : ""}
                        onClick={() => toggleAllergen(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <small className="field-help">Csak azt jelöld, amit mindenképpen kerülnöd kell.</small>
                </label>

                <label>
                  <span>Étkezési irány</span>
                  <div className="choice-grid">
                    {[
                      ["omnivore", "Mindenevő"],
                      ["vegetarian", "Vegetáriánus"],
                      ["vegan", "Vegán"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={dietType === value ? "active" : ""}
                        onClick={() => setDietType(value as DietType)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </label>

                <label>
                  <span>Nem kedvelt alapanyagok</span>
                  <input
                    value={dislikedIngredients}
                    onChange={(event) => setDislikedIngredients(event.target.value)}
                    placeholder="pl. brokkoli, gomba, olívabogyó"
                  />
                  <small className="field-help">Több alapanyagot vesszővel válassz el.</small>
                </label>

                <label>
                  <span>Mennyi időd van általában egy edzésre?</span>
                  <div className="choice-grid">
                    {[10, 15, 20, 30, 40].map((minutes) => (
                      <button
                        type="button"
                        key={minutes}
                        className={workoutMinutes === minutes ? "active" : ""}
                        onClick={() => setWorkoutMinutes(minutes as 10 | 15 | 20 | 30 | 40)}
                      >
                        {minutes} perc
                      </button>
                    ))}
                  </div>
                </label>

                <label>
                  <span>Edzettségi szint</span>
                  <div className="choice-grid">
                    {[
                      ["beginner", "Kezdő"],
                      ["intermediate", "Középhaladó"],
                      ["advanced", "Haladó"],
                    ].map(([value, label]) => (
                      <button
                        type="button"
                        key={value}
                        className={fitnessLevel === value ? "active" : ""}
                        onClick={() => setFitnessLevel(value as FitnessLevel)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </label>

                <label>
                  <span>Mozgáskorlátozás vagy kerülendő terhelés</span>
                  <input
                    value={movementLimitations}
                    onChange={(event) => setMovementLimitations(event.target.value)}
                    placeholder="pl. térdterhelés, ugrálás, csuklóterhelés"
                  />
                  <small className="field-help">Ha nincs ilyen, hagyd üresen. Ez nem helyettesít orvosi tanácsot.</small>
                </label>
              </div>

              {message && <div className="auth-message">{message}</div>}

              <div className="onboarding-actions">
                <button
                  type="button"
                  className="onboarding-back"
                  onClick={() => setStep(3)}
                >
                  ← Vissza
                </button>
                <button
                  type="submit"
                  className="onboarding-primary"
                  disabled={busy || !estimate}
                >
                  {busy ? "Mentés…" : "Belépek a Zenvyrába →"}
                </button>
              </div>
            </>
          )}
        </form>
      </section>
    </main>
  );
}
