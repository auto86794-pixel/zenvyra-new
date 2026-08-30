"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import type { ZenvyraProfile } from "@/components/onboarding/ProfileOnboarding";

type View = "today" | "meals" | "movement" | "wellbeing" | "progress";

type Props = {
  onSignOut: () => void | Promise<void>;
  session?: Session | null;
  guestMode?: boolean;
  profile?: ZenvyraProfile | null;
};

type Meal = {
  id: string;
  type: string;
  food: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type SavedState = {
  meals: Meal[];
  water: number;
  movementDone: boolean;
  mood: number;
  weight: number;
};

const STORAGE_KEY = "zenvyra_dashboard_v1";

const initialMeals: Meal[] = [
  {
    id: "demo-1",
    type: "Reggeli",
    food: "Görög joghurt, bogyós gyümölcs",
    kcal: 380,
    protein: 25,
    carbs: 42,
    fat: 12,
  },
  {
    id: "demo-2",
    type: "Ebéd",
    food: "Csirkés rizstál friss zöldséggel",
    kcal: 620,
    protein: 42,
    carbs: 65,
    fat: 19,
  },
  {
    id: "demo-3",
    type: "Uzsonna",
    food: "Alma és mandula",
    kcal: 210,
    protein: 11,
    carbs: 19,
    fat: 12,
  },
];

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "today", label: "Ma", icon: "✦" },
  { id: "meals", label: "Étkezések", icon: "◒" },
  { id: "movement", label: "Mozgás", icon: "⌁" },
  { id: "wellbeing", label: "Közérzet", icon: "◇" },
  { id: "progress", label: "Haladás", icon: "▥" },
];

function loadSavedState(): SavedState {
  if (typeof window === "undefined") {
    return {
      meals: initialMeals,
      water: 1200,
      movementDone: false,
      mood: 4,
      weight: 68.4,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        meals: initialMeals,
        water: 1200,
        movementDone: false,
        mood: 4,
        weight: 68.4,
      };
    }

    const saved = JSON.parse(raw) as Partial<SavedState>;

    return {
      meals: Array.isArray(saved.meals) ? saved.meals : initialMeals,
      water: typeof saved.water === "number" ? saved.water : 1200,
      movementDone:
        typeof saved.movementDone === "boolean" ? saved.movementDone : false,
      mood: typeof saved.mood === "number" ? saved.mood : 4,
      weight: typeof saved.weight === "number" ? saved.weight : 68.4,
    };
  } catch {
    return {
      meals: initialMeals,
      water: 1200,
      movementDone: false,
      mood: 4,
      weight: 68.4,
    };
  }
}

export default function Dashboard({ onSignOut, session = null, guestMode = false, profile = null }: Props) {
  const initial = useMemo(() => loadSavedState(), []);

  const [view, setView] = useState<View>("today");
  const [meals, setMeals] = useState<Meal[]>(initial.meals);
  const [water, setWater] = useState(initial.water);
  const [movementDone, setMovementDone] = useState(initial.movementDone);
  const [mood, setMood] = useState(initial.mood);
  const [weight, setWeight] = useState(profile?.current_weight_kg ?? initial.weight);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(guestMode || !session);
  const [cloudMessage, setCloudMessage] = useState("");

  const [mealType, setMealType] = useState("Reggeli");
  const [foodName, setFoodName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const [quickWeight, setQuickWeight] = useState(
    initial.weight.toFixed(1).replace(".", ",")
  );

  const dailyGoal = profile?.daily_calorie_goal ?? 2000;

  useEffect(() => {
    if (!guestMode) return;

    const snapshot: SavedState = {
      meals,
      water,
      movementDone,
      mood,
      weight,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [guestMode, meals, water, movementDone, mood, weight]);

  useEffect(() => {
    if (!session?.user || guestMode) {
      setCloudReady(true);
      return;
    }

    let active = true;

    async function loadCloudData() {
      setCloudReady(false);
      setCloudMessage("");

      const today = new Date().toISOString().slice(0, 10);

      const [mealsResult, waterResult, weightResult, wellbeingResult, movementResult] =
        await Promise.all([
          supabase
            .from("meals")
            .select("id, meal_type, food_name, kcal, protein_g, carbs_g, fat_g")
            .eq("eaten_on", today)
            .order("created_at", { ascending: true }),
          supabase
            .from("water_logs")
            .select("amount_ml")
            .eq("logged_on", today),
          supabase
            .from("weight_logs")
            .select("weight_kg")
            .order("logged_on", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("wellbeing_logs")
            .select("mood")
            .eq("logged_on", today)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("movement_logs")
            .select("completed")
            .eq("logged_on", today)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

      if (!active) return;

      const firstError =
        mealsResult.error ||
        waterResult.error ||
        weightResult.error ||
        wellbeingResult.error ||
        movementResult.error;

      if (firstError) {
        setCloudMessage("A felhőadatok betöltése nem sikerült.");
        setCloudReady(true);
        return;
      }

      setMeals(
        (mealsResult.data ?? []).map((row) => ({
          id: row.id,
          type: row.meal_type,
          food: row.food_name,
          kcal: Number(row.kcal),
          protein: Number(row.protein_g),
          carbs: Number(row.carbs_g),
          fat: Number(row.fat_g),
        }))
      );

      setWater(
        (waterResult.data ?? []).reduce(
          (sum, row) => sum + Number(row.amount_ml),
          0
        )
      );

      if (weightResult.data?.[0]) {
        const nextWeight = Number(weightResult.data[0].weight_kg);
        setWeight(nextWeight);
        setQuickWeight(nextWeight.toFixed(1).replace(".", ","));
      }

      if (wellbeingResult.data?.[0]) {
        setMood(Number(wellbeingResult.data[0].mood));
      }

      if (movementResult.data?.[0]) {
        setMovementDone(Boolean(movementResult.data[0].completed));
      }

      setCloudReady(true);
    }

    void loadCloudData();

    return () => {
      active = false;
    };
  }, [guestMode, session?.user]);

  const totals = useMemo(
    () =>
      meals.reduce(
        (sum, meal) => ({
          kcal: sum.kcal + meal.kcal,
          protein: sum.protein + meal.protein,
          carbs: sum.carbs + meal.carbs,
          fat: sum.fat + meal.fat,
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [meals]
  );

  const caloriesPercent = Math.min(
    100,
    Math.round((totals.kcal / dailyGoal) * 100)
  );

  const waterPercent = Math.min(100, Math.round((water / 2000) * 100));

  async function addWater(amount: number) {
    if (guestMode || !session?.user) {
      setWater((current) => Math.min(4000, current + amount));
      return;
    }

    const { error } = await supabase.from("water_logs").insert({
      user_id: session.user.id,
      amount_ml: amount,
    });

    if (error) {
      setCloudMessage("A víz mentése nem sikerült.");
      return;
    }

    setWater((current) => Math.min(4000, current + amount));
  }

  async function saveMood(value: number) {
    setMood(value);

    if (guestMode || !session?.user) return;

    const { error } = await supabase.from("wellbeing_logs").insert({
      user_id: session.user.id,
      mood: value,
    });

    if (error) {
      setCloudMessage("A közérzet mentése nem sikerült.");
    }
  }

  async function saveMovement(completed: boolean) {
    setMovementDone(completed);

    if (guestMode || !session?.user) return;

    const { error } = await supabase.from("movement_logs").insert({
      user_id: session.user.id,
      title: "Mai mozgás",
      minutes: completed ? 20 : 0,
      completed,
    });

    if (error) {
      setCloudMessage("A mozgás mentése nem sikerült.");
    }
  }

  function openMealModal() {
    setMealType("Reggeli");
    setFoodName("");
    setKcal("");
    setProtein("");
    setCarbs("");
    setFat("");
    setMealModalOpen(true);
  }

  async function addMeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedKcal = Number(kcal.replace(",", "."));
    const parsedProtein = Number(protein.replace(",", ".") || 0);
    const parsedCarbs = Number(carbs.replace(",", ".") || 0);
    const parsedFat = Number(fat.replace(",", ".") || 0);

    if (!foodName.trim() || !Number.isFinite(parsedKcal) || parsedKcal <= 0) {
      return;
    }

    const draft = {
      type: mealType,
      food: foodName.trim(),
      kcal: Math.round(parsedKcal),
      protein: Math.max(0, Math.round(parsedProtein)),
      carbs: Math.max(0, Math.round(parsedCarbs)),
      fat: Math.max(0, Math.round(parsedFat)),
    };

    if (guestMode || !session?.user) {
      const meal: Meal = {
        id: `guest-${Date.now()}`,
        ...draft,
      };

      setMeals((current) => [...current, meal]);
      setMealModalOpen(false);
      return;
    }

    const { data, error } = await supabase
      .from("meals")
      .insert({
        user_id: session.user.id,
        meal_type: draft.type,
        food_name: draft.food,
        kcal: draft.kcal,
        protein_g: draft.protein,
        carbs_g: draft.carbs,
        fat_g: draft.fat,
      })
      .select("id")
      .single();

    if (error || !data) {
      setCloudMessage("Az étkezés mentése nem sikerült.");
      return;
    }

    setMeals((current) => [...current, { id: data.id, ...draft }]);
    setMealModalOpen(false);
  }

  async function deleteMeal(id: string) {
    if (!guestMode && session?.user && !id.startsWith("demo-")) {
      const { error } = await supabase.from("meals").delete().eq("id", id);

      if (error) {
        setCloudMessage("Az étkezés törlése nem sikerült.");
        return;
      }
    }

    setMeals((current) => current.filter((meal) => meal.id !== id));
  }

  async function saveQuickWeight() {
    const parsed = Number(quickWeight.replace(",", "."));

    if (!Number.isFinite(parsed) || parsed < 30 || parsed > 250) {
      return;
    }

    const next = Number(parsed.toFixed(1));
    if (!guestMode && session?.user) {
      const { error } = await supabase.from("weight_logs").insert({
        user_id: session.user.id,
        weight_kg: next,
      });

      if (error) {
        setCloudMessage("A testsúly mentése nem sikerült.");
        return;
      }
    }

    setWeight(next);
    setQuickWeight(next.toFixed(1).replace(".", ","));
  }

  function resetDemoData() {
    setMeals(initialMeals);
    setWater(1200);
    setMovementDone(false);
    setMood(4);
    setWeight(68.4);
    setQuickWeight("68,4");
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">✦</div>
          <div>
            <strong>ZENVYRA</strong>
            <span>wellness for you</span>
          </div>
        </div>

        <nav className="dashboard-nav" aria-label="Fő navigáció">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => setView(item.id)}
            >
              <span className="dashboard-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-wellness-card">
          <span className="sidebar-wellness-icon">♡</span>
          <strong>A saját ritmusodban.</strong>
          <p>Kis lépések, követhető eredmények.</p>
        </div>

        <button
          type="button"
          className="dashboard-signout"
          onClick={() => void onSignOut()}
        >
          <span>↗</span>
          Kilépés
        </button>
      </aside>

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <div>
            <div className="dashboard-eyebrow">
              {view === "today"
                ? "MAI EGYENSÚLY"
                : view === "meals"
                  ? "TÁPLÁLKOZÁS"
                  : view === "movement"
                    ? "MOZGÁS"
                    : view === "wellbeing"
                      ? "KÖZÉRZET"
                      : "HALADÁS"}
            </div>

            <h1>
              {view === "today"
                ? "Jó, hogy itt vagy."
                : view === "meals"
                  ? "Mai étkezéseid"
                  : view === "movement"
                    ? "Mozdulj jól."
                    : view === "wellbeing"
                      ? "Hogy vagy ma?"
                      : "Lásd a fejlődésed."}
            </h1>

            <p>
              {view === "today"
                ? "Ma is elég egy-két jó döntés."
                : view === "meals"
                  ? "Átláthatóan, felesleges bonyolítás nélkül."
                  : view === "movement"
                    ? "A rendszeresség többet számít, mint a tökéletesség."
                    : view === "wellbeing"
                      ? "Figyelj arra is, hogyan érzed magad."
                      : "A kis változások együtt rajzolják ki az utat."}
            </p>
          </div>

          <button
            type="button"
            className="quick-button"
            onClick={() => setQuickModalOpen(true)}
          >
            <span>＋</span>
            Gyors rögzítés
          </button>
        </header>

        {!guestMode && session && (
          <div className={cloudMessage ? "cloud-status error" : "cloud-status"}>
            <span>{cloudReady ? "☁" : "…"}</span>
            {cloudMessage || (cloudReady ? "Felhőmentés aktív" : "Adatok betöltése…")}
          </div>
        )}

        {view === "today" && (
          <>
            <section className="summary-grid">
              <article className="summary-card coral-card">
                <div className="summary-card-top">
                  <div>
                    <span className="summary-label">Kalória</span>
                    <strong>{totals.kcal}</strong>
                  </div>
                  <div className="summary-icon">◒</div>
                </div>

                <div className="summary-note">
                  {Math.max(0, dailyGoal - totals.kcal)} kcal maradt · cél {dailyGoal}
                </div>

                <div className="progress-track">
                  <i style={{ width: `${caloriesPercent}%` }} />
                </div>
              </article>

              <article className="summary-card lavender-card">
                <div className="summary-card-top">
                  <div>
                    <span className="summary-label">Víz</span>
                    <strong>{water} ml</strong>
                  </div>
                  <div className="summary-icon">◌</div>
                </div>

                <div className="summary-note">2000 ml napi cél</div>

                <div className="progress-track">
                  <i style={{ width: `${waterPercent}%` }} />
                </div>
              </article>

              <article className="summary-card pink-card">
                <div className="summary-card-top">
                  <div>
                    <span className="summary-label">Mozgás</span>
                    <strong>{movementDone ? "Kész" : "20 perc"}</strong>
                  </div>
                  <div className="summary-icon">⌁</div>
                </div>

                <button
                  type="button"
                  className="summary-action"
                  onClick={() => void saveMovement(!movementDone)}
                >
                  {movementDone ? "Visszavonás" : "Teljesítve"}
                </button>
              </article>
            </section>

            <section className="dashboard-content-grid">
              <article className="dashboard-card meals-card">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker">TÁPLÁLKOZÁS</span>
                    <h2>Mai étkezések</h2>
                  </div>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={openMealModal}
                  >
                    ＋ Étkezés
                  </button>
                </div>

                <div className="meal-list">
                  {meals.map((meal) => (
                    <div className="meal-row" key={meal.id}>
                      <div className="meal-dot" />
                      <div className="meal-copy">
                        <strong>{meal.type}</strong>
                        <span>{meal.food}</span>
                      </div>
                      <div className="meal-actions-inline">
                        <div className="meal-kcal">{meal.kcal} kcal</div>
                        <button
                          type="button"
                          className="meal-delete"
                          onClick={() => deleteMeal(meal.id)}
                          aria-label={`${meal.food} törlése`}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}

                  {meals.length === 0 && (
                    <div className="empty-state">
                      Még nincs rögzített étkezés.
                    </div>
                  )}
                </div>

                <div className="macro-grid">
                  <div>
                    <span>Fehérje</span>
                    <strong>{totals.protein} / {profile?.protein_target_g ?? "—"} g</strong>
                  </div>
                  <div>
                    <span>Szénhidrát</span>
                    <strong>{totals.carbs} / {profile?.carbs_target_g ?? "—"} g</strong>
                  </div>
                  <div>
                    <span>Zsír</span>
                    <strong>{totals.fat} / {profile?.fat_target_g ?? "—"} g</strong>
                  </div>
                </div>
              </article>

              <article className="dashboard-card hydration-card">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker">FOLYADÉK</span>
                    <h2>Hidratálás</h2>
                  </div>
                  <div className="water-orb">◌</div>
                </div>

                <div className="water-amount">{water} ml</div>
                <p>
                  Még {Math.max(0, 2000 - water)} ml a napi cél eléréséhez.
                </p>

                <div className="water-progress">
                  <i style={{ width: `${waterPercent}%` }} />
                </div>

                <div className="water-actions">
                  {[200, 300, 500].map((amount) => (
                    <button
                      type="button"
                      key={amount}
                      onClick={() => void addWater(amount)}
                    >
                      +{amount}
                    </button>
                  ))}
                  {guestMode && (
                    <button type="button" onClick={() => setWater(0)}>
                      Nullázás
                    </button>
                  )}
                </div>
              </article>
            </section>

            <section className="dashboard-content-grid lower-grid">
              <article className="dashboard-card wellbeing-card">
                <div className="card-heading">
                  <div>
                    <span className="card-kicker">KÖZÉRZET</span>
                    <h2>Hogy vagy ma?</h2>
                  </div>
                  <span className="wellbeing-heart">♡</span>
                </div>

                <p>Jelöld egy érintéssel.</p>

                <div className="mood-scale">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      type="button"
                      key={value}
                      className={mood === value ? "active" : ""}
                      onClick={() => void saveMood(value)}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </article>

              <article className="dashboard-card focus-card">
                <span className="focus-icon">✦</span>
                <span className="card-kicker">MAI FÓKUSZ</span>
                <h2>Nem kell tökéletes nap.</h2>
                <p>
                  Egy kiegyensúlyozott étkezés, egy kis folyadék és húsz perc
                  mozgás már számít.
                </p>
                <button
                  type="button"
                  onClick={() => setView("movement")}
                  className="focus-button"
                >
                  Mai mozgás →
                </button>
              </article>
            </section>
          </>
        )}

        {view === "meals" && (
          <section className="dashboard-card full-card">
            <div className="card-heading">
              <div>
                <span className="card-kicker">NAPLÓ</span>
                <h2>Étkezések</h2>
              </div>
              <button
                type="button"
                className="outline-button"
                onClick={openMealModal}
              >
                ＋ Új étkezés
              </button>
            </div>

            <div className="meal-list large">
              {meals.map((meal) => (
                <div className="meal-row" key={meal.id}>
                  <div className="meal-dot" />
                  <div className="meal-copy">
                    <strong>{meal.type}</strong>
                    <span>{meal.food}</span>
                  </div>
                  <div className="meal-actions-inline">
                    <div className="meal-kcal">{meal.kcal} kcal</div>
                    <button
                      type="button"
                      className="meal-delete"
                      onClick={() => deleteMeal(meal.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {meals.length === 0 && (
                <div className="empty-state">Még nincs rögzített étkezés.</div>
              )}
            </div>
          </section>
        )}

        {view === "movement" && (
          <section className="movement-grid">
            {[
              ["20 perc", "Könnyű átmozgatás", "Mobilitás és nyújtás"],
              ["30 perc", "Teljes test", "Saját testsúlyos edzés"],
              ["25 perc", "Frissítő séta", "Könnyű kardió"],
            ].map(([time, title, text], index) => (
              <article className="dashboard-card workout-card" key={title}>
                <div className={`workout-art workout-art-${index + 1}`}>
                  <span>⌁</span>
                </div>
                <span className="card-kicker">{time}</span>
                <h2>{title}</h2>
                <p>{text}</p>
                <button
                  type="button"
                  className="focus-button"
                  onClick={() => void saveMovement(true)}
                >
                  {movementDone ? "Mai mozgás kész ✓" : "Teljesítve →"}
                </button>
              </article>
            ))}
          </section>
        )}

        {view === "wellbeing" && (
          <section className="dashboard-content-grid">
            <article className="dashboard-card">
              <span className="card-kicker">KÖZÉRZET</span>
              <h2>Mai állapot</h2>
              <p className="wellbeing-lead">
                Egy gyors jelzés segít észrevenni a saját mintáidat.
              </p>

              <div className="wellbeing-lines">
                <div>
                  <strong>Hangulat</strong>
                  <span>{mood} / 5</span>
                </div>
                <div>
                  <strong>Folyadék</strong>
                  <span>{water} ml</span>
                </div>
                <div>
                  <strong>Mozgás</strong>
                  <span>{movementDone ? "Kész" : "Még vár"}</span>
                </div>
              </div>
            </article>

            <article className="dashboard-card wellbeing-card">
              <span className="card-kicker">HANGULAT</span>
              <h2>Hogy vagy ma?</h2>
              <div className="mood-scale large">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={mood === value ? "active" : ""}
                    onClick={() => void saveMood(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </article>
          </section>
        )}

        {view === "progress" && (
          <section className="dashboard-content-grid">
            <article className="dashboard-card progress-card">
              <span className="card-kicker">TESTSÚLY</span>
              <h2>{weight.toFixed(1).replace(".", ",")} kg</h2>
              <p>
                Aktuális érték
                {profile?.target_weight_kg
                  ? ` · cél ${profile.target_weight_kg.toFixed(1).replace(".", ",")} kg`
                  : ""}
              </p>

              <div className="weight-entry">
                <input
                  value={quickWeight}
                  onChange={(event) => setQuickWeight(event.target.value)}
                  inputMode="decimal"
                  aria-label="Testsúly kilogrammban"
                />
                <span>kg</span>
                <button type="button" onClick={saveQuickWeight}>
                  Mentés
                </button>
              </div>

              <div className="weight-buttons">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(
                      30,
                      Number((weight - 0.1).toFixed(1))
                    );
                    setWeight(next);
                    setQuickWeight(next.toFixed(1).replace(".", ","));
                  }}
                >
                  − 0,1
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(
                      250,
                      Number((weight + 0.1).toFixed(1))
                    );
                    setWeight(next);
                    setQuickWeight(next.toFixed(1).replace(".", ","));
                  }}
                >
                  + 0,1
                </button>
              </div>
            </article>

            <article className="dashboard-card chart-card">
              <span className="card-kicker">7 NAP</span>
              <h2>Haladás</h2>

              <div className="mini-chart" aria-label="Súlytrend">
                {[72, 64, 68, 58, 61, 52, 48].map((height, index) => (
                  <i
                    key={index}
                    style={{ height: `${height}%` }}
                    title={`Nap ${index + 1}`}
                  />
                ))}
              </div>

              <div className="chart-days">
                <span>H</span>
                <span>K</span>
                <span>Sze</span>
                <span>Cs</span>
                <span>P</span>
                <span>Szo</span>
                <span>V</span>
              </div>
            </article>
          </section>
        )}
      </section>

      {mealModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setMealModalOpen(false)}
        >
          <div
            className="zen-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="meal-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setMealModalOpen(false)}
              aria-label="Bezárás"
            >
              ×
            </button>

            <span className="card-kicker">ÉTKEZÉS</span>
            <h2 id="meal-modal-title">Új étkezés</h2>
            <p>Csak a fontos adatokat add meg.</p>

            <form className="meal-form" onSubmit={addMeal}>
              <label>
                <span>Étkezés típusa</span>
                <select
                  value={mealType}
                  onChange={(event) => setMealType(event.target.value)}
                >
                  <option>Reggeli</option>
                  <option>Tízórai</option>
                  <option>Ebéd</option>
                  <option>Uzsonna</option>
                  <option>Vacsora</option>
                  <option>Egyéb</option>
                </select>
              </label>

              <label>
                <span>Mit ettél?</span>
                <input
                  value={foodName}
                  onChange={(event) => setFoodName(event.target.value)}
                  placeholder="pl. Csirkés saláta"
                  autoFocus
                />
              </label>

              <div className="form-grid-2">
                <label>
                  <span>Kalória</span>
                  <input
                    value={kcal}
                    onChange={(event) => setKcal(event.target.value)}
                    inputMode="decimal"
                    placeholder="420"
                  />
                </label>

                <label>
                  <span>Fehérje (g)</span>
                  <input
                    value={protein}
                    onChange={(event) => setProtein(event.target.value)}
                    inputMode="decimal"
                    placeholder="30"
                  />
                </label>
              </div>

              <div className="form-grid-2">
                <label>
                  <span>Szénhidrát (g)</span>
                  <input
                    value={carbs}
                    onChange={(event) => setCarbs(event.target.value)}
                    inputMode="decimal"
                    placeholder="45"
                  />
                </label>

                <label>
                  <span>Zsír (g)</span>
                  <input
                    value={fat}
                    onChange={(event) => setFat(event.target.value)}
                    inputMode="decimal"
                    placeholder="14"
                  />
                </label>
              </div>

              <button type="submit" className="modal-primary">
                Étkezés mentése
              </button>
            </form>
          </div>
        </div>
      )}

      {quickModalOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setQuickModalOpen(false)}
        >
          <div
            className="zen-modal quick-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quick-modal-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setQuickModalOpen(false)}
              aria-label="Bezárás"
            >
              ×
            </button>

            <span className="card-kicker">GYORS RÖGZÍTÉS</span>
            <h2 id="quick-modal-title">Mi történt?</h2>
            <p>Egy érintés, és kész.</p>

            <div className="quick-grid">
              <button
                type="button"
                onClick={() => void addWater(250)}
              >
                <span>◌</span>
                <strong>+250 ml víz</strong>
                <small>{water} ml ma</small>
              </button>

              <button
                type="button"
                onClick={() => void saveMovement(!movementDone)}
              >
                <span>⌁</span>
                <strong>{movementDone ? "Mozgás kész" : "Mozgás teljesítve"}</strong>
                <small>{movementDone ? "Visszavonható" : "Mai mozgás"}</small>
              </button>

              <button type="button" onClick={openMealModal}>
                <span>◒</span>
                <strong>Étkezés</strong>
                <small>Új étel rögzítése</small>
              </button>

              <button
                type="button"
                onClick={() => void saveMood(5)}
              >
                <span>♡</span>
                <strong>Jól vagyok</strong>
                <small>Hangulat 5 / 5</small>
              </button>
            </div>

            <div className="quick-weight-row">
              <div>
                <strong>Testsúly</strong>
                <small>Aktuális érték gyors frissítése</small>
              </div>
              <div className="quick-weight-control">
                <input
                  value={quickWeight}
                  onChange={(event) => setQuickWeight(event.target.value)}
                  inputMode="decimal"
                />
                <span>kg</span>
                <button type="button" onClick={saveQuickWeight}>
                  Mentés
                </button>
              </div>
            </div>

            {guestMode && (
              <button
                type="button"
                className="reset-demo"
                onClick={resetDemoData}
              >
                Próbaadatok visszaállítása
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
