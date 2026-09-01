"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import type { ZenvyraProfile } from "@/components/onboarding/ProfileOnboarding";
import RecipesView, {
  ensureStarterRecipes,
  type Recipe,
  type RecipeIngredient,
} from "@/components/dashboard/RecipesView";
import MovementView, {
  type MovementEntry,
  type Workout,
  workoutLibrary,
} from "@/components/dashboard/MovementView";
import PreferencesPanel, {
  defaultPreferences,
  type PersonalPreferences,
} from "@/components/dashboard/PreferencesPanel";

type View =
  | "today"
  | "weekly"
  | "shopping"
  | "recipes"
  | "challenges"
  | "meals"
  | "movement"
  | "wellbeing"
  | "progress";

type Props = {
  onSignOut: () => void | Promise<void>;
  session?: Session | null;
  guestMode?: boolean;
  profile?: ZenvyraProfile | null;
  onProfileChange?: (profile: ZenvyraProfile) => void;
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

type FoodPreset = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

type WeightEntry = {
  date: string;
  weight: number;
};

type SavedState = {
  meals: Meal[];
  water: number;
  movementDone: boolean;
  mood: number;
  weight: number;
  weightHistory: WeightEntry[];
  movementHistory: MovementEntry[];
};

const STORAGE_KEY = "zenvyra_dashboard_v1";
const CHALLENGE_STORAGE_PREFIX = "zenvyra_challenges_v1";
const SHOPPING_STORAGE_PREFIX = "zenvyra_shopping_v1";
const RECIPE_STORAGE_PREFIX = "zenvyra_recipes_v1";

type ShoppingItem = {
  id: string;
  category: string;
  name: string;
  amount: string;
  custom?: boolean;
};

type StoredShopping = {
  week: string;
  checked: string[];
  customItems: ShoppingItem[];
};

type ChallengeId = "water" | "movement" | "balanced";
type ChallengeProgress = Record<ChallengeId, boolean[]>;
type StoredChallenges = {
  week: string;
  progress: ChallengeProgress;
};

const challengeDays = ["H", "K", "Sze", "Cs", "P", "Szo", "V"];
const challenges: Array<{
  id: ChallengeId;
  kicker: string;
  title: string;
  description: string;
  target: number;
  icon: string;
}> = [
  {
    id: "water",
    kicker: "HIDRATÁLÁS",
    title: "5 figyelmes nap",
    description: "Jelöld, amikor tudatosan figyeltél a folyadékpótlásra.",
    target: 5,
    icon: "◌",
  },
  {
    id: "movement",
    kicker: "MOZGÁS",
    title: "3 örömmozgás",
    description: "Egy séta, nyújtás vagy rövid edzés is teljes értékű lépés.",
    target: 3,
    icon: "⌁",
  },
  {
    id: "balanced",
    kicker: "EGYENSÚLY",
    title: "5 gondoskodó étkezés",
    description: "Nem tökéletesség: egy nyugodt, tápláló döntés már számít.",
    target: 5,
    icon: "♡",
  },
];

function emptyChallengeProgress(): ChallengeProgress {
  return {
    water: Array(7).fill(false),
    movement: Array(7).fill(false),
    balanced: Array(7).fill(false),
  };
}

function currentWeekKey() {
  const now = new Date();
  const day = now.getDay() || 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + 1);
  return monday.toISOString().slice(0, 10);
}

function loadChallengeProgress(storageKey: string): ChallengeProgress {
  if (typeof window === "undefined") return emptyChallengeProgress();

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    ) as StoredChallenges | null;

    if (saved?.week !== currentWeekKey()) return emptyChallengeProgress();

    return {
      water: Array.isArray(saved.progress?.water)
        ? saved.progress.water.slice(0, 7)
        : Array(7).fill(false),
      movement: Array.isArray(saved.progress?.movement)
        ? saved.progress.movement.slice(0, 7)
        : Array(7).fill(false),
      balanced: Array.isArray(saved.progress?.balanced)
        ? saved.progress.balanced.slice(0, 7)
        : Array(7).fill(false),
    };
  } catch {
    return emptyChallengeProgress();
  }
}

function createShoppingList(goal: ZenvyraProfile["goal"]): ShoppingItem[] {
  const goalItems: ShoppingItem[] =
    goal === "gain"
      ? [
          { id: "oats", category: "Kamra", name: "Zabpehely", amount: "750 g" },
          { id: "rice", category: "Kamra", name: "Rizs vagy bulgur", amount: "1 kg" },
          { id: "nuts", category: "Kamra", name: "Mandula vagy dió", amount: "250 g" },
          { id: "avocado", category: "Zöldség és gyümölcs", name: "Avokádó", amount: "3 db" },
        ]
      : goal === "lose"
        ? [
            { id: "oats", category: "Kamra", name: "Zabpehely", amount: "500 g" },
            { id: "rice", category: "Kamra", name: "Barna rizs vagy bulgur", amount: "500 g" },
            { id: "berries", category: "Zöldség és gyümölcs", name: "Bogyós gyümölcs", amount: "400 g" },
            { id: "greens", category: "Zöldség és gyümölcs", name: "Leveles saláta", amount: "2 csomag" },
          ]
        : [
            { id: "oats", category: "Kamra", name: "Zabpehely", amount: "500 g" },
            { id: "rice", category: "Kamra", name: "Rizs vagy bulgur", amount: "500 g" },
            { id: "fruit", category: "Zöldség és gyümölcs", name: "Szezonális gyümölcs", amount: "7 adag" },
            { id: "greens", category: "Zöldség és gyümölcs", name: "Leveles saláta", amount: "1 csomag" },
          ];

  return [
    { id: "chicken", category: "Fehérjeforrások", name: "Csirkemell vagy tofu", amount: "700 g" },
    { id: "fish", category: "Fehérjeforrások", name: "Lazac vagy más hal", amount: "2 adag" },
    { id: "eggs", category: "Fehérjeforrások", name: "Tojás", amount: "10 db" },
    { id: "yogurt", category: "Hűtő", name: "Natúr görög joghurt", amount: "4 adag" },
    { id: "cottage", category: "Hűtő", name: "Túró vagy cottage cheese", amount: "500 g" },
    { id: "vegetables", category: "Zöldség és gyümölcs", name: "Vegyes friss zöldség", amount: "7 adag" },
    { id: "olive-oil", category: "Kamra", name: "Olívaolaj", amount: "1 üveg" },
    ...goalItems,
  ];
}

function loadShoppingState(storageKey: string): Pick<StoredShopping, "checked" | "customItems"> {
  if (typeof window === "undefined") return { checked: [], customItems: [] };

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "null",
    ) as StoredShopping | null;
    if (saved?.week !== currentWeekKey()) return { checked: [], customItems: [] };
    return {
      checked: Array.isArray(saved.checked) ? saved.checked : [],
      customItems: Array.isArray(saved.customItems) ? saved.customItems : [],
    };
  } catch {
    return { checked: [], customItems: [] };
  }
}

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

const commonFoods: FoodPreset[] = [
  { id: "chicken", name: "Grillezett csirkemell", kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  { id: "rice", name: "Főtt rizs", kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  { id: "yogurt", name: "Natúr görög joghurt", kcal: 73, protein: 9.5, carbs: 3.5, fat: 2 },
  { id: "oats", name: "Zabpehely", kcal: 372, protein: 13.5, carbs: 60, fat: 7 },
  { id: "banana", name: "Banán", kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  { id: "egg", name: "Főtt tojás", kcal: 143, protein: 13, carbs: 1.1, fat: 9.5 },
  { id: "salmon", name: "Sült lazac", kcal: 208, protein: 20, carbs: 0, fat: 13 },
  { id: "avocado", name: "Avokádó", kcal: 160, protein: 2, carbs: 8.5, fat: 14.7 },
];

function nutritionValue(value: number) {
  return String(Math.round(value * 10) / 10).replace(".", ",");
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function lastSevenDays() {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (6 - index));
    return {
      date: localDateKey(date),
      label: ["V", "H", "K", "Sze", "Cs", "P", "Szo"][date.getDay()],
    };
  });
}

const navItems: Array<{ id: View; label: string; icon: string }> = [
  { id: "today", label: "Ma", icon: "✦" },
  { id: "weekly", label: "Heti terv", icon: "▦" },
  { id: "shopping", label: "Bevásárlás", icon: "⌑" },
  { id: "recipes", label: "Receptek", icon: "◉" },
  { id: "challenges", label: "Kihívások", icon: "✓" },
  { id: "meals", label: "Étkezések", icon: "◒" },
  { id: "movement", label: "Mozgás", icon: "⌁" },
  { id: "wellbeing", label: "Közérzet", icon: "◇" },
  { id: "progress", label: "Haladás", icon: "▥" },
];

type WeeklyPlanDay = {
  day: string;
  food: string;
  movement: string;
  wellbeing: string;
};

function createWeeklyPlan(goal: ZenvyraProfile["goal"]): WeeklyPlanDay[] {
  const foodByGoal =
    goal === "gain"
      ? [
          "Tápláló reggeli és egy plusz kisétkezés",
          "Fehérjedús ebéd teljes értékű körettel",
          "Energiadús uzsonna gyümölccsel",
          "Kiegyensúlyozott főétkezések",
          "Edzés utáni tápláló étkezés",
          "Színes, tartalmas hétvégi tányér",
          "Nyugodt előkészület a következő hétre",
        ]
      : goal === "lose"
        ? [
            "Fehérjedús reggeli friss gyümölccsel",
            "Zöldségekben gazdag, könnyű ebéd",
            "Tervezett uzsonna a kapkodás helyett",
            "Rostban gazdag, színes tányér",
            "Könnyű vacsora elegendő fehérjével",
            "Kedvenc étel tudatos adagban",
            "Egyszerű előkészület a következő hétre",
          ]
        : [
            "Kiegyensúlyozott reggeli",
            "Színes ebéd sok zöldséggel",
            "Tápláló uzsonna",
            "Változatos fehérjeforrások",
            "Könnyű, nyugodt vacsora",
            "Rugalmas hétvégi étkezés",
            "Előkészület a következő hétre",
          ];

  const movements = [
    "20 perc könnyű átmozgatás",
    "30 perc tempós séta",
    "20 perc teljes testes erősítés",
    "Pihenő vagy 10 perc nyújtás",
    "25 perc lendületes mozgás",
    "Szabadon választott örömmozgás",
    "Lassú séta és regenerálódás",
  ];

  const wellbeing = [
    "Indíts egy pohár vízzel",
    "Tarts egy nyugodt ebédszünetet",
    "Figyelj az energiaszintedre",
    "Adj magadnak húsz csendes percet",
    "Vedd észre, mi sikerült a héten",
    "Legyen időd valamire, amit szeretsz",
    "Készülj rá nyugodtan a következő hétre",
  ];

  return ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"].map(
    (day, index) => ({
      day,
      food: foodByGoal[index],
      movement: movements[index],
      wellbeing: wellbeing[index],
    }),
  );
}

function loadSavedState(): SavedState {
  if (typeof window === "undefined") {
    return {
      meals: initialMeals,
      water: 1200,
      movementDone: false,
      mood: 4,
      weight: 68.4,
      weightHistory: [{ date: localDateKey(), weight: 68.4 }],
      movementHistory: [],
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
        weightHistory: [{ date: localDateKey(), weight: 68.4 }],
        movementHistory: [],
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
      weightHistory: Array.isArray(saved.weightHistory)
        ? saved.weightHistory
            .filter(
              (entry): entry is WeightEntry =>
                typeof entry?.date === "string" &&
                typeof entry?.weight === "number",
            )
            .slice(-30)
        : [{ date: localDateKey(), weight: 68.4 }],
      movementHistory: Array.isArray(saved.movementHistory)
        ? saved.movementHistory.slice(-50)
        : [],
    };
  } catch {
    return {
      meals: initialMeals,
      water: 1200,
      movementDone: false,
      mood: 4,
      weight: 68.4,
      weightHistory: [{ date: localDateKey(), weight: 68.4 }],
      movementHistory: [],
    };
  }
}

function loadGuestPreferences(): PersonalPreferences {
  if (typeof window === "undefined") return defaultPreferences;
  try {
    const saved = JSON.parse(window.localStorage.getItem("zenvyra-personal-preferences") ?? "null");
    return saved && typeof saved === "object" ? { ...defaultPreferences, ...saved } : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export default function Dashboard({ onSignOut, session = null, guestMode = false, profile = null, onProfileChange }: Props) {
  const initial = useMemo(() => loadSavedState(), []);
  const challengeStorageKey = `${CHALLENGE_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;
  const shoppingStorageKey = `${SHOPPING_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;
  const recipeStorageKey = `${RECIPE_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;
  const initialChallenges = useMemo(
    () => loadChallengeProgress(challengeStorageKey),
    [challengeStorageKey],
  );
  const initialShopping = useMemo(
    () => loadShoppingState(shoppingStorageKey),
    [shoppingStorageKey],
  );

  const [view, setView] = useState<View>("today");
  const [meals, setMeals] = useState<Meal[]>(initial.meals);
  const [water, setWater] = useState(initial.water);
  const [movementDone, setMovementDone] = useState(initial.movementDone);
  const [mood, setMood] = useState(initial.mood);
  const [weight, setWeight] = useState(profile?.current_weight_kg ?? initial.weight);
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>(
    guestMode ? initial.weightHistory : [],
  );
  const [movementHistory, setMovementHistory] = useState<MovementEntry[]>(
    guestMode ? initial.movementHistory : [],
  );
  const [challengeProgress, setChallengeProgress] =
    useState<ChallengeProgress>(initialChallenges);
  const [checkedShoppingItems, setCheckedShoppingItems] = useState<string[]>(
    initialShopping.checked,
  );
  const [customShoppingItems, setCustomShoppingItems] = useState<ShoppingItem[]>(
    initialShopping.customItems,
  );
  const [newShoppingItem, setNewShoppingItem] = useState("");
  const [preferences, setPreferences] = useState<PersonalPreferences>(() =>
    profile
      ? {
          diet_type: profile.diet_type ?? "omnivore",
          allergens: profile.allergens ?? [],
          disliked_ingredients: profile.disliked_ingredients ?? [],
          workout_minutes: profile.workout_minutes ?? 20,
          fitness_level: profile.fitness_level ?? "beginner",
          movement_limitations: profile.movement_limitations ?? [],
        }
      : loadGuestPreferences(),
  );
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(guestMode || !session);
  const [cloudMessage, setCloudMessage] = useState("");

  const [mealType, setMealType] = useState("Reggeli");
  const [foodName, setFoodName] = useState("");
  const [selectedFoodId, setSelectedFoodId] = useState<string | null>(null);
  const [portionGrams, setPortionGrams] = useState("100");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  const [quickWeight, setQuickWeight] = useState(
    initial.weight.toFixed(1).replace(".", ",")
  );

  const dailyGoal = profile?.daily_calorie_goal ?? 2000;
  const weeklyPlan = useMemo(
    () => createWeeklyPlan(profile?.goal ?? null),
    [profile?.goal]
  );
  const todayPlanIndex = useMemo(() => (new Date().getDay() + 6) % 7, []);
  const todayPlan = weeklyPlan[todayPlanIndex];
  const recommendedWorkouts = useMemo(() => {
    const levelRank: Record<Workout["level"], number> = {
      Kezdő: 1,
      Középhaladó: 2,
      Haladó: 3,
    };
    const preferredRank =
      preferences.fitness_level === "advanced"
        ? 3
        : preferences.fitness_level === "intermediate"
          ? 2
          : 1;

    return workoutLibrary.filter(
      (workout) =>
        workout.minutes <= preferences.workout_minutes &&
        levelRank[workout.level] <= preferredRank,
    );
  }, [preferences.fitness_level, preferences.workout_minutes]);
  const todayWorkout = (recommendedWorkouts.length > 0 ? recommendedWorkouts : workoutLibrary)[todayPlanIndex % Math.max(1, recommendedWorkouts.length || workoutLibrary.length)];
  const todayChallenge = challenges[todayPlanIndex % challenges.length];
  const todayChallengeDone = challengeProgress[todayChallenge.id][todayPlanIndex];
  const todayPathCompleted =
    Number(meals.length > 0) + Number(movementDone) + Number(todayChallengeDone);
  const generatedShoppingItems = useMemo(
    () => createShoppingList(profile?.goal ?? null),
    [profile?.goal],
  );
  const shoppingItems = useMemo(
    () => [...generatedShoppingItems, ...customShoppingItems],
    [generatedShoppingItems, customShoppingItems],
  );
  const shoppingGroups = useMemo(() => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of shoppingItems) {
      groups.set(item.category, [...(groups.get(item.category) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [shoppingItems]);
  const visibleFoodPresets = useMemo(() => {
    const query = foodName.trim().toLocaleLowerCase("hu");
    if (!query) return commonFoods.slice(0, 6);
    return commonFoods.filter((food) =>
      food.name.toLocaleLowerCase("hu").includes(query)
    );
  }, [foodName]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSavedRecipes(ensureStarterRecipes(recipeStorageKey));
  }, [recipeStorageKey, view]);

  useEffect(() => {
    if (!guestMode) return;

    const snapshot: SavedState = {
      meals,
      water,
      movementDone,
      mood,
      weight,
      weightHistory,
      movementHistory,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [guestMode, meals, water, movementDone, mood, weight, weightHistory, movementHistory]);

  useEffect(() => {
    const snapshot: StoredChallenges = {
      week: currentWeekKey(),
      progress: challengeProgress,
    };
    window.localStorage.setItem(challengeStorageKey, JSON.stringify(snapshot));
  }, [challengeProgress, challengeStorageKey]);

  useEffect(() => {
    const snapshot: StoredShopping = {
      week: currentWeekKey(),
      checked: checkedShoppingItems,
      customItems: customShoppingItems,
    };
    window.localStorage.setItem(shoppingStorageKey, JSON.stringify(snapshot));
  }, [checkedShoppingItems, customShoppingItems, shoppingStorageKey]);

  function toggleChallengeDay(challengeId: ChallengeId, dayIndex: number) {
    setChallengeProgress((current) => ({
      ...current,
      [challengeId]: current[challengeId].map((done, index) =>
        index === dayIndex ? !done : done,
      ),
    }));
  }

  function toggleShoppingItem(itemId: string) {
    setCheckedShoppingItems((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  }

  function addShoppingItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newShoppingItem.trim();
    if (!name) return;

    setCustomShoppingItems((current) => [
      ...current,
      {
        id: `custom-${Date.now()}`,
        category: "Saját tételek",
        name,
        amount: "",
        custom: true,
      },
    ]);
    setNewShoppingItem("");
  }

  function removeShoppingItem(itemId: string) {
    setCustomShoppingItems((current) => current.filter((item) => item.id !== itemId));
    setCheckedShoppingItems((current) => current.filter((id) => id !== itemId));
  }

  function addRecipeIngredientsToShopping(ingredients: RecipeIngredient[]) {
    const knownNames = new Set(
      shoppingItems.map((item) => item.name.trim().toLocaleLowerCase("hu")),
    );
    const additions = ingredients
      .filter((ingredient) => !knownNames.has(ingredient.name.trim().toLocaleLowerCase("hu")))
      .map((ingredient, index): ShoppingItem => ({
        id: `recipe-item-${Date.now()}-${index}`,
        category: "Recept hozzávalói",
        name: ingredient.name,
        amount: ingredient.amount,
        custom: true,
      }));
    if (additions.length) {
      setCustomShoppingItems((current) => [...current, ...additions]);
    }
    return additions.length;
  }

  useEffect(() => {
    if (!session?.user || guestMode) {
      return;
    }

    let active = true;

    async function loadCloudData() {
      setCloudReady(false);
      setCloudMessage("");

      const today = localDateKey();
      const sevenDaysAgo = lastSevenDays()[0].date;

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
            .select("weight_kg, logged_on, created_at")
            .gte("logged_on", sevenDaysAgo)
            .order("logged_on", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("wellbeing_logs")
            .select("mood")
            .eq("logged_on", today)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("movement_logs")
            .select("id, title, minutes, completed, logged_on, created_at")
            .gte("logged_on", sevenDaysAgo)
            .order("logged_on", { ascending: true })
            .order("created_at", { ascending: true }),
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

      const cloudWeightHistory = Array.from(
        new Map(
          (weightResult.data ?? []).map((row) => [
            row.logged_on,
            { date: row.logged_on, weight: Number(row.weight_kg) },
          ]),
        ).values(),
      );
      setWeightHistory(cloudWeightHistory);

      const latestWeight = cloudWeightHistory.at(-1);
      if (latestWeight) {
        const nextWeight = latestWeight.weight;
        setWeight(nextWeight);
        setQuickWeight(nextWeight.toFixed(1).replace(".", ","));
      }

      if (wellbeingResult.data?.[0]) {
        setMood(Number(wellbeingResult.data[0].mood));
      }

      const cloudMovementHistory = (movementResult.data ?? [])
        .filter((row) => Boolean(row.completed) && Number(row.minutes) > 0)
        .map((row) => ({
          id: row.id,
          date: row.logged_on,
          title: row.title,
          minutes: Number(row.minutes),
        }));
      setMovementHistory(cloudMovementHistory);
      setMovementDone(cloudMovementHistory.some((entry) => entry.date === today));

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

  const compatibleSavedRecipes = useMemo(
    () =>
      savedRecipes.filter((recipe) => {
        const recipeDiet = recipe.dietStyle ?? "omnivore";
        const dietMatches =
          preferences.diet_type === "omnivore" ||
          (preferences.diet_type === "vegetarian" && recipeDiet !== "omnivore") ||
          (preferences.diet_type === "vegan" && recipeDiet === "vegan");

        const allergenMatches = !(recipe.allergens ?? []).some((item) =>
          preferences.allergens.includes(item),
        );

        const ingredientMatches = !recipe.ingredients.some((ingredient) => {
          const ingredientName = ingredient.name.toLocaleLowerCase("hu");
          return preferences.disliked_ingredients.some((item) =>
            ingredientName.includes(item),
          );
        });

        return dietMatches && allergenMatches && ingredientMatches;
      }),
    [preferences, savedRecipes],
  );

  const dailyRecipeRecommendation = useMemo(() => {
    if (compatibleSavedRecipes.length === 0) return null;

    const remainingCalories = Math.max(0, dailyGoal - totals.kcal);
    const remainingProtein = Math.max(
      0,
      (profile?.protein_target_g ?? 0) - totals.protein,
    );
    const remainingCarbs = Math.max(
      0,
      (profile?.carbs_target_g ?? 0) - totals.carbs,
    );
    const remainingFat = Math.max(
      0,
      (profile?.fat_target_g ?? 0) - totals.fat,
    );

    const targetMeal = {
      kcal: Math.max(
        250,
        Math.min(
          remainingCalories || dailyGoal * 0.3,
          dailyGoal * 0.35,
        ),
      ),
      protein:
        profile?.protein_target_g
          ? Math.min(remainingProtein || profile.protein_target_g * 0.3, profile.protein_target_g * 0.35)
          : 0,
      carbs:
        profile?.carbs_target_g
          ? Math.min(remainingCarbs || profile.carbs_target_g * 0.3, profile.carbs_target_g * 0.35)
          : 0,
      fat:
        profile?.fat_target_g
          ? Math.min(remainingFat || profile.fat_target_g * 0.3, profile.fat_target_g * 0.35)
          : 0,
    };

    const scored = compatibleSavedRecipes
      .map((recipe) => {
        const servings = Math.max(1, recipe.servings);
        const perServing = {
          kcal: recipe.kcal / servings,
          protein: recipe.protein / servings,
          carbs: recipe.carbs / servings,
          fat: recipe.fat / servings,
        };

        const pairs = [
          [perServing.kcal, targetMeal.kcal],
          [perServing.protein, targetMeal.protein],
          [perServing.carbs, targetMeal.carbs],
          [perServing.fat, targetMeal.fat],
        ].filter(([, target]) => target > 0);

        const normalized = pairs.map(([value, target]) => value / target);
        const numerator = normalized.reduce((sum, value) => sum + value, 0);
        const denominator = normalized.reduce(
          (sum, value) => sum + value * value,
          0,
        );
        const rawPortions =
          denominator > 0 ? numerator / denominator : 1;
        const portions = Math.max(
          0.5,
          Math.min(3, Math.round(rawPortions * 2) / 2),
        );

        const score = pairs.reduce((sum, [value, target]) => {
          const difference = (value * portions - target) / target;
          return sum + difference * difference;
        }, 0);

        return {
          recipe,
          portions,
          kcal: Math.round(perServing.kcal * portions),
          protein: Math.round(perServing.protein * portions),
          score,
        };
      })
      .sort((a, b) => a.score - b.score);

    return scored[0] ?? null;
  }, [
    compatibleSavedRecipes,
    dailyGoal,
    profile?.carbs_target_g,
    profile?.fat_target_g,
    profile?.protein_target_g,
    totals.carbs,
    totals.fat,
    totals.kcal,
    totals.protein,
  ]);

  const nextStepTitle =
    meals.length === 0
      ? dailyRecipeRecommendation
        ? `Következő: ${dailyRecipeRecommendation.recipe.name}`
        : "Következő: rögzíts egy étkezést"
      : !movementDone
        ? `Következő: ${todayWorkout.title}`
        : !todayChallengeDone
          ? `Következő: ${todayChallenge.title}`
          : "Mára minden lépésed kész.";

  const caloriesPercent = Math.min(
    100,
    Math.round((totals.kcal / dailyGoal) * 100)
  );

  const waterPercent = Math.min(100, Math.round((water / 2000) * 100));

  const weightChart = useMemo(() => {
    const historyByDate = new Map(weightHistory.map((entry) => [entry.date, entry.weight]));
    const points = lastSevenDays().map((day) => ({
      ...day,
      weight: historyByDate.get(day.date) ?? null,
    }));
    const measured = points.filter(
      (point): point is typeof point & { weight: number } => point.weight !== null,
    );
    const values = measured.map((point) => point.weight);
    const minimum = values.length ? Math.min(...values) : 0;
    const maximum = values.length ? Math.max(...values) : 0;
    const range = Math.max(maximum - minimum, 0.5);

    return {
      points: points.map((point) => ({
        ...point,
        height:
          point.weight === null
            ? 0
            : 28 + ((point.weight - minimum) / range) * 62,
      })),
      measured,
      change:
        measured.length >= 2
          ? Number((measured.at(-1)!.weight - measured[0].weight).toFixed(1))
          : null,
    };
  }, [weightHistory]);

  const goalProgress = useMemo(() => {
    const start = profile?.current_weight_kg;
    const target = profile?.target_weight_kg;
    if (!start || !target || start === target) return null;
    return Math.max(0, Math.min(100, Math.round(((start - weight) / (start - target)) * 100)));
  }, [profile?.current_weight_kg, profile?.target_weight_kg, weight]);

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
    if (!completed) {
      setView("movement");
      return;
    }
    await completeWorkout({
      id: "daily-movement",
      title: "Mai szabad mozgás",
      minutes: 20,
      level: "Kezdő",
      focus: "Szabadon választott",
      description: "A saját választásod szerinti mozgás.",
      steps: [],
    });
  }

  async function completeWorkout(workout: Workout) {
    const entry: MovementEntry = {
      id: `guest-workout-${Date.now()}`,
      date: localDateKey(),
      title: workout.title,
      minutes: workout.minutes,
    };

    if (!guestMode && session?.user) {
      const { data, error } = await supabase
        .from("movement_logs")
        .insert({
          user_id: session.user.id,
          title: workout.title,
          minutes: workout.minutes,
          completed: true,
        })
        .select("id, logged_on")
        .single();

      if (error || !data) {
        setCloudMessage("A mozgás mentése nem sikerült.");
        return false;
      }
      entry.id = data.id;
      entry.date = data.logged_on;
    }

    setMovementHistory((current) => [...current, entry].slice(-50));
    setMovementDone(true);
    return true;
  }

  function openMealModal() {
    setMealType("Reggeli");
    setFoodName("");
    setSelectedFoodId(null);
    setPortionGrams("100");
    setKcal("");
    setProtein("");
    setCarbs("");
    setFat("");
    setMealModalOpen(true);
  }

  function applyFoodPreset(food: FoodPreset, grams: number) {
    const ratio = grams / 100;
    setFoodName(food.name);
    setSelectedFoodId(food.id);
    setPortionGrams(nutritionValue(grams));
    setKcal(nutritionValue(food.kcal * ratio));
    setProtein(nutritionValue(food.protein * ratio));
    setCarbs(nutritionValue(food.carbs * ratio));
    setFat(nutritionValue(food.fat * ratio));
  }

  function updatePortion(value: string) {
    setPortionGrams(value);
    const grams = Number(value.replace(",", "."));
    const food = commonFoods.find((item) => item.id === selectedFoodId);
    if (!food || !Number.isFinite(grams) || grams <= 0) return;
    applyFoodPreset(food, grams);
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

  async function addRecipeToMeals(recipe: Recipe, portions: number) {
    const ratio = portions / recipe.servings;
    const draft = {
      type: "Főétkezés",
      food: `${recipe.name} (${String(portions).replace(".", ",")} adag)`,
      kcal: Math.round(recipe.kcal * ratio),
      protein: Math.round(recipe.protein * ratio),
      carbs: Math.round(recipe.carbs * ratio),
      fat: Math.round(recipe.fat * ratio),
    };

    if (guestMode || !session?.user) {
      setMeals((current) => [...current, { id: `guest-recipe-${Date.now()}`, ...draft }]);
      return true;
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
      setCloudMessage("A recept étkezéshez adása nem sikerült.");
      return false;
    }

    setMeals((current) => [...current, { id: data.id, ...draft }]);
    return true;
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
    setWeightHistory((current) => {
      const today = localDateKey();
      return [
        ...current.filter((entry) => entry.date !== today),
        { date: today, weight: next },
      ].slice(-30);
    });
  }

  function resetDemoData() {
    setMeals(initialMeals);
    setWater(1200);
    setMovementDone(false);
    setMood(4);
    setWeight(68.4);
    setWeightHistory([{ date: localDateKey(), weight: 68.4 }]);
    setMovementHistory([]);
    setQuickWeight("68,4");
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-brand">
          <div className="dashboard-brand-mark">✦</div>
          <div className="lotus" aria-hidden="true">
    <span>◡</span>
    <span>◇</span>
    <span>◡</span>
  </div>

  <div>
    <strong>ZENVYRA</strong>
    <span>TEST ÉS LÉLEK HARMÓNIÁBAN</span>
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
                : view === "weekly"
                  ? "HETI RITMUS"
                : view === "shopping"
                  ? "HETI ELŐKÉSZÜLET"
                : view === "recipes"
                  ? "SAJÁT KONYHÁD"
                : view === "challenges"
                  ? "KIS LÉPÉSEK"
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
                : view === "weekly"
                  ? "A heted, könnyebben."
                : view === "shopping"
                  ? "Minden egy helyen."
                : view === "recipes"
                  ? "A kedvenceid, okosabban."
                : view === "challenges"
                  ? "A saját tempódban."
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
                : view === "weekly"
                  ? "Egy gyengéd iránytű, amit a saját napjaidhoz igazíthatsz."
                : view === "shopping"
                  ? "A heti tervedhez igazított lista, amit menet közben is bővíthetsz."
                : view === "recipes"
                  ? "Mentsd el egyszer, számold újra bármilyen adaghoz."
                : view === "challenges"
                  ? "Válassz apró célokat, és vedd észre minden lépésedet."
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
                    <strong>{movementDone ? "Kész" : `${todayWorkout.minutes} perc`}</strong>
                  </div>
                  <div className="summary-icon">⌁</div>
                </div>

                <button
                  type="button"
                  className="summary-action"
                  onClick={() => movementDone ? setView("movement") : void saveMovement(true)}
                >
                  {movementDone ? "Mai mozgások" : "Teljesítve"}
                </button>
              </article>
            </section>

            <section className="today-path" aria-labelledby="today-path-title">
              <div className="today-path-heading">
                <div>
                  <span className="card-kicker">SZEMÉLYRE SZABOTT MAI ÚTVONAL</span>
                  <h2 id="today-path-title">{nextStepTitle}</h2>
                  <p>Nem kötelező lista — egyetlen teljesített lépés is jó irány.</p>
                </div>
                <div className="today-path-progress">
                  <strong>{todayPathCompleted}/3</strong>
                  <span>mai lépés kész</span>
                  <div aria-hidden="true"><i style={{ width: `${(todayPathCompleted / 3) * 100}%` }} /></div>
                </div>
              </div>

              <div className="today-path-steps">
                <article className={meals.length > 0 ? "today-step complete" : "today-step"}>
                  <div className="today-step-number">{meals.length > 0 ? "✓" : "1"}</div>
                  <div className="today-step-copy">
                    <span>
                      ÉTKEZÉSI FÓKUSZ · {todayPlan.day}
                      {dailyRecipeRecommendation ? " · SZEMÉLYES AJÁNLÁS" : ""}
                    </span>
                    <h3>
                      {dailyRecipeRecommendation
                        ? `${dailyRecipeRecommendation.recipe.name} · ${String(dailyRecipeRecommendation.portions).replace(".", ",")} adag`
                        : todayPlan.food}
                    </h3>
                    <p>
                      {dailyRecipeRecommendation
                        ? `Kb. ${dailyRecipeRecommendation.kcal} kcal és ${dailyRecipeRecommendation.protein} g fehérje. A megadott étrendi, allergén- és alapanyag-szűrők alapján választva.`
                        : "Ments el néhány saját receptet, és itt személyre szabott recept- és adagjavaslat jelenik meg."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (meals.length > 0) {
                        setView("meals");
                        return;
                      }
                      if (dailyRecipeRecommendation) {
                        void addRecipeToMeals(
                          dailyRecipeRecommendation.recipe,
                          dailyRecipeRecommendation.portions,
                        );
                        return;
                      }
                      setView("recipes");
                    }}
                  >
                    {meals.length > 0
                      ? "Mai étkezések →"
                      : dailyRecipeRecommendation
                        ? "Ajánlott adag hozzáadása →"
                        : "Receptek megnyitása →"}
                  </button>
                </article>

                <article className={movementDone ? "today-step complete" : "today-step"}>
                  <div className="today-step-number">{movementDone ? "✓" : "2"}</div>
                  <div className="today-step-copy">
                    <span>AJÁNLOTT MOZGÁS · {todayWorkout.minutes} PERC</span>
                    <h3>{todayWorkout.title}</h3>
                    <p>{todayWorkout.description}</p>
                  </div>
                  <button type="button" onClick={() => setView("movement")}>Program megnyitása →</button>
                </article>

                <article className={todayChallengeDone ? "today-step complete" : "today-step"}>
                  <div className="today-step-number">{todayChallengeDone ? "✓" : "3"}</div>
                  <div className="today-step-copy">
                    <span>MAI KIS KIHÍVÁS · {todayChallenge.kicker}</span>
                    <h3>{todayChallenge.title}</h3>
                    <p>{todayChallenge.description}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => todayChallengeDone
                      ? setView("challenges")
                      : toggleChallengeDay(todayChallenge.id, todayPlanIndex)}
                  >
                    {todayChallengeDone ? "Heti kihívások →" : "Mai lépés kész ✓"}
                  </button>
                </article>
              </div>
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

        {view === "weekly" && (
          <>
            <section className="weekly-plan-intro">
              <div>
                <span className="card-kicker">SZEMÉLYRE SZABOTT ALAP</span>
                <h2>A te heti egyensúlyod</h2>
                <p>
                  A terved a célodhoz igazodik, de nem kötelező lista. Cserélj
                  fel napokat, és válaszd azt, ami most belefér.
                </p>
              </div>
              <div className="weekly-plan-goal">
                <span>NAPI KIINDULÓPONT</span>
                <strong>{dailyGoal} kcal</strong>
                <small>étkezés · mozgás · közérzet</small>
              </div>
            </section>

            <section className="weekly-plan-grid" aria-label="Heti terv">
              {weeklyPlan.map((item, index) => (
                <article className="dashboard-card weekly-day-card" key={item.day}>
                  <div className="weekly-day-heading">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h2>{item.day}</h2>
                  </div>

                  <div className="weekly-day-items">
                    <div>
                      <i className="weekly-dot food-dot">◒</i>
                      <p>
                        <span>Étkezési fókusz</span>
                        <strong>{item.food}</strong>
                      </p>
                    </div>
                    <div>
                      <i className="weekly-dot movement-dot">⌁</i>
                      <p>
                        <span>Mozgás</span>
                        <strong>{item.movement}</strong>
                      </p>
                    </div>
                    <div>
                      <i className="weekly-dot wellbeing-dot">♡</i>
                      <p>
                        <span>Jóllét</span>
                        <strong>{item.wellbeing}</strong>
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </>
        )}

        {view === "shopping" && (
          <>
            <section className="shopping-intro">
              <div>
                <span className="card-kicker">AUTOMATIKUS HETI LISTA</span>
                <h2>Kevesebb tervezés, nyugodtabb hét.</h2>
                <p>
                  Az alaplista a heti étkezési fókuszodhoz és a célodhoz igazodik.
                  Ami már otthon van, egyszerűen pipáld ki.
                </p>
              </div>
              <div className="shopping-progress-orb">
                <strong>{checkedShoppingItems.filter((id) => shoppingItems.some((item) => item.id === id)).length}</strong>
                <span>/ {shoppingItems.length} kész</span>
              </div>
            </section>

            <div className="shopping-layout">
              <section className="shopping-groups" aria-label="Heti bevásárlólista">
                {shoppingGroups.map(([category, items]) => (
                  <article className="dashboard-card shopping-group" key={category}>
                    <div className="shopping-group-heading">
                      <h2>{category}</h2>
                      <span>{items.filter((item) => checkedShoppingItems.includes(item.id)).length}/{items.length}</span>
                    </div>
                    <div className="shopping-items">
                      {items.map((item) => {
                        const checked = checkedShoppingItems.includes(item.id);
                        return (
                          <div className={checked ? "shopping-item checked" : "shopping-item"} key={item.id}>
                            <button
                              type="button"
                              className="shopping-check"
                              aria-pressed={checked}
                              aria-label={`${item.name} ${checked ? "visszaállítása" : "kipipálása"}`}
                              onClick={() => toggleShoppingItem(item.id)}
                            >
                              {checked ? "✓" : ""}
                            </button>
                            <button
                              type="button"
                              className="shopping-item-name"
                              onClick={() => toggleShoppingItem(item.id)}
                            >
                              {item.name}
                            </button>
                            {item.amount && <span>{item.amount}</span>}
                            {item.custom && (
                              <button
                                type="button"
                                className="shopping-remove"
                                aria-label={`${item.name} törlése`}
                                onClick={() => removeShoppingItem(item.id)}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </section>

              <aside className="dashboard-card shopping-add-card">
                <span className="card-kicker">SAJÁT TÉTEL</span>
                <h2>Valami még hiányzik?</h2>
                <p>Add hozzá, és ezen a heti listán marad.</p>
                <form onSubmit={addShoppingItem}>
                  <input
                    value={newShoppingItem}
                    onChange={(event) => setNewShoppingItem(event.target.value)}
                    placeholder="Például citrom"
                    aria-label="Új bevásárlólista tétel"
                  />
                  <button type="submit">Hozzáadás</button>
                </form>
                <div className="shopping-tip">
                  <span>✦</span>
                  <p>A lista minden hétfőn friss alapokkal indul.</p>
                </div>
              </aside>
            </div>
          </>
        )}

        {view === "recipes" && (
          <RecipesView
            storageKey={recipeStorageKey}
            onAddMeal={addRecipeToMeals}
            onAddShopping={addRecipeIngredientsToShopping}
            preferences={preferences}
          />
        )}

        {view === "challenges" && (
          <>
            <section className="challenge-intro">
              <div>
                <span className="card-kicker">E HETI FINOM FÓKUSZ</span>
                <h2>Nem verseny. Egy kis figyelem magadra.</h2>
                <p>
                  A kihagyott nap nem kudarc. Jelöld, ami jól esett, a következő
                  héten pedig tiszta lappal indulhatsz.
                </p>
              </div>
              <div className="challenge-intro-mark" aria-hidden="true">✦</div>
            </section>

            <section className="challenge-grid" aria-label="Heti kihívások">
              {challenges.map((challenge) => {
                const completed = challengeProgress[challenge.id].filter(Boolean).length;
                const targetReached = completed >= challenge.target;

                return (
                  <article
                    className={`dashboard-card challenge-card ${targetReached ? "complete" : ""}`}
                    key={challenge.id}
                  >
                    <div className="challenge-heading">
                      <div className="challenge-icon">{challenge.icon}</div>
                      <div>
                        <span className="card-kicker">{challenge.kicker}</span>
                        <h2>{challenge.title}</h2>
                      </div>
                    </div>
                    <p>{challenge.description}</p>

                    <div className="challenge-progress-row">
                      <strong>{Math.min(completed, challenge.target)} / {challenge.target}</strong>
                      <span>{targetReached ? "Megvan — szép munka!" : "már ez is számít"}</span>
                    </div>
                    <div className="challenge-progress-track" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, (completed / challenge.target) * 100)}%` }} />
                    </div>

                    <div className="challenge-days">
                      {challengeDays.map((day, index) => (
                        <button
                          type="button"
                          key={day}
                          className={challengeProgress[challenge.id][index] ? "active" : ""}
                          onClick={() => toggleChallengeDay(challenge.id, index)}
                          aria-pressed={challengeProgress[challenge.id][index]}
                          aria-label={`${day}, ${challenge.title}`}
                        >
                          <span>{challengeProgress[challenge.id][index] ? "✓" : day}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </section>

            <p className="challenge-storage-note">
              A jelöléseket ezen az eszközön mentjük, és minden hétfőn új hét kezdődik.
            </p>
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
          <MovementView
            history={movementHistory}
            onComplete={completeWorkout}
            preferredMinutes={preferences.workout_minutes}
            preferredLevel={preferences.fitness_level}
          />
        )}

        {view === "wellbeing" && (
          <section className="dashboard-content-grid">
            <PreferencesPanel
              session={session}
              guestMode={guestMode}
              initial={preferences}
              onChange={(next) => {
                setPreferences(next);
                if (profile && onProfileChange) onProfileChange({ ...profile, ...next });
              }}
            />
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
          <>
            <section className="progress-summary-grid">
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

              <article className="dashboard-card progress-insight-card">
                <span className="card-kicker">HETI VÁLTOZÁS</span>
                <strong>
                  {weightChart.change === null
                    ? "Még nincs elég adat"
                    : `${weightChart.change > 0 ? "+" : ""}${weightChart.change
                        .toFixed(1)
                        .replace(".", ",")} kg`}
                </strong>
                <p>
                  {weightChart.change === null
                    ? "Két külön napon rögzített érték után már látható lesz a változás."
                    : Math.abs(weightChart.change) < 0.2
                      ? "A testsúlyod ezen a héten stabil maradt."
                      : "Ez egy heti pillanatkép — a hosszabb távú irány számít igazán."}
                </p>
              </article>

              <article className="dashboard-card progress-insight-card goal-card">
                <span className="card-kicker">CÉL FELÉ</span>
                <strong>{goalProgress === null ? "Saját ritmusban" : `${goalProgress}%`}</strong>
                <p>
                  {goalProgress === null
                    ? "A következetes rögzítés segít tisztábban látni a saját utadat."
                    : "Az induló értékedhez és a megadott célodhoz viszonyítva."}
                </p>
                {goalProgress !== null && (
                  <div className="goal-progress-track" aria-label={`${goalProgress}% a cél felé`}>
                    <i style={{ width: `${goalProgress}%` }} />
                  </div>
                )}
              </article>

              <article className="dashboard-card progress-insight-card movement-progress-card">
                <span className="card-kicker">HETI MOZGÁS</span>
                <strong>{movementHistory.reduce((sum, entry) => sum + entry.minutes, 0)} perc</strong>
                <p>
                  {new Set(movementHistory.map((entry) => entry.date)).size} aktív nap · minden rövid mozgás beleszámít.
                </p>
                <button type="button" onClick={() => setView("movement")}>Edzések megnyitása →</button>
              </article>
            </section>

            <article className="dashboard-card chart-card progress-chart-card">
              <span className="card-kicker">7 NAP</span>
              <h2>Testsúlytrend</h2>

              <div className="mini-chart" aria-label="Súlytrend">
                {weightChart.points.map((point) => (
                  <div className="chart-column" key={point.date}>
                    {point.weight !== null && (
                      <span>{point.weight.toFixed(1).replace(".", ",")}</span>
                    )}
                    <i
                      className={point.weight === null ? "empty" : ""}
                      style={{ height: `${point.height || 8}%` }}
                      title={
                        point.weight === null
                          ? `${point.date}: nincs adat`
                          : `${point.date}: ${point.weight.toFixed(1)} kg`
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="chart-days">
                {weightChart.points.map((point) => (
                  <span key={point.date}>{point.label}</span>
                ))}
              </div>
              {weightChart.measured.length === 0 && (
                <p className="chart-empty-note">
                  Rögzíts egy testsúlyt, és itt megjelenik az első valódi pontod.
                </p>
              )}
            </article>
          </>
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
                <span>Keress egy ételt</span>
                <input
                  value={foodName}
                  onChange={(event) => {
                    setFoodName(event.target.value);
                    setSelectedFoodId(null);
                  }}
                  placeholder="pl. csirkemell, rizs, joghurt"
                  autoFocus
                />
              </label>

              {visibleFoodPresets.length > 0 && (
                <div className="food-preset-list" aria-label="Ételjavaslatok">
                  {visibleFoodPresets.map((food) => (
                    <button
                      type="button"
                      key={food.id}
                      className={selectedFoodId === food.id ? "active" : ""}
                      onClick={() => applyFoodPreset(food, 100)}
                    >
                      <span>{food.name}</span>
                      <small>{food.kcal} kcal / 100 g</small>
                    </button>
                  ))}
                </div>
              )}

              {selectedFoodId && (
                <label className="portion-field">
                  <span>Adag</span>
                  <div className="input-unit">
                    <input
                      value={portionGrams}
                      onChange={(event) => updatePortion(event.target.value)}
                      inputMode="decimal"
                      aria-describedby="nutrition-estimate-note"
                    />
                    <b>g</b>
                  </div>
                </label>
              )}

              <p className="nutrition-estimate-note" id="nutrition-estimate-note">
                A tápértékek tájékoztató becslések. Saját ételnél írd be kézzel az adatokat.
              </p>

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
                onClick={() => movementDone ? setView("movement") : void saveMovement(true)}
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
