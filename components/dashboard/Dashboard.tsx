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
  | "progress"
  | "settings";

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
  consumed: boolean;
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
const RECIPE_HISTORY_STORAGE_PREFIX = "zenvyra_recipe_history_v1";
const RECIPE_REPEAT_BLOCK_DAYS = 14;
const ASSISTANT_PLAN_STORAGE_PREFIX = "zenvyra_assistant_plan_v1";



type RecipeRecommendationHistoryEntry = {
  recipeId: string;
  recommendedAt: string;
  week: string;
};

const WEEKLY_PROTEIN_MAX = 2;

function recipeProteinGroup(recipe: Recipe): string {
  const generatedMatch = recipe.id.match(
    /^zenvyra-(chicken|turkey|salmon|tuna|beef|egg|tofu|chickpea|lentil|tempeh|cottage|beans)-/,
  );

  if (generatedMatch) return generatedMatch[1];

  const firstIngredient = recipe.ingredients[0]?.name.toLocaleLowerCase("hu") ?? "";
  const groups: Array<[string, string[]]> = [
    ["chicken", ["csirk"]],
    ["turkey", ["pulyk"]],
    ["salmon", ["lazac"]],
    ["tuna", ["tonhal"]],
    ["beef", ["marha"]],
    ["egg", ["tojás"]],
    ["tofu", ["tofu"]],
    ["chickpea", ["csicseribors"]],
    ["lentil", ["lencs"]],
    ["tempeh", ["tempeh"]],
    ["cottage", ["cottage", "túró"]],
    ["beans", ["vörösbab", "bab"]],
  ];

  for (const [group, needles] of groups) {
    if (needles.some((needle) => firstIngredient.includes(needle))) {
      return group;
    }
  }

  return `custom:${recipe.id}`;
}

function loadRecipeRecommendationHistory(
  storageKey: string,
): RecipeRecommendationHistoryEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "[]",
    ) as RecipeRecommendationHistoryEntry[];

    if (!Array.isArray(raw)) return [];

    const cutoff = Date.now() - RECIPE_REPEAT_BLOCK_DAYS * 24 * 60 * 60 * 1000;

    return raw.filter((entry) => {
      const timestamp = new Date(entry.recommendedAt).getTime();
      return (
        typeof entry.recipeId === "string" &&
        typeof entry.week === "string" &&
        Number.isFinite(timestamp) &&
        timestamp >= cutoff
      );
    });
  } catch {
    return [];
  }
}

type AssistantMovementTime = "Délelőtt" | "Délután" | "Este";
type AssistantStartChoice = "Nyugodt reggeli" | "Rövid mozgás" | "Lassabb indulás";

type StoredAssistantPlan = {
  movementDate?: string;
  movementTime?: AssistantMovementTime | null;
  tomorrowDate?: string;
  tomorrowStart?: AssistantStartChoice | null;
};

function nextLocalDateKey(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return localDateKey(next);
}

function loadAssistantPlan(storageKey: string): StoredAssistantPlan {
  if (typeof window === "undefined") return {};

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(storageKey) ?? "{}",
    ) as StoredAssistantPlan;

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveAssistantPlan(
  storageKey: string,
  patch: Partial<StoredAssistantPlan>,
) {
  if (typeof window === "undefined") return;

  const current = loadAssistantPlan(storageKey);
  window.localStorage.setItem(
    storageKey,
    JSON.stringify({ ...current, ...patch }),
  );
}

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
    consumed: true,
  },
  {
    id: "demo-2",
    type: "Ebéd",
    food: "Csirkés rizstál friss zöldséggel",
    kcal: 620,
    protein: 42,
    carbs: 65,
    fat: 19,
    consumed: true,
  },
  {
    id: "demo-3",
    type: "Uzsonna",
    food: "Alma és mandula",
    kcal: 210,
    protein: 11,
    carbs: 19,
    fat: 12,
    consumed: true,
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
  { id: "settings", label: "Profil", icon: "♙" },
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
      meals: Array.isArray(saved.meals)
        ? saved.meals.map((meal) => ({ ...meal, consumed: meal.consumed !== false }))
        : initialMeals,
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
  const recipeHistoryStorageKey = `${RECIPE_HISTORY_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;
  const assistantPlanStorageKey = `${ASSISTANT_PLAN_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;

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
  const [weeklyRecipeSwapOffsets, setWeeklyRecipeSwapOffsets] = useState<number[]>(
    () => Array(7).fill(0),
  );
  const [recipeRecommendationHistory, setRecipeRecommendationHistory] = useState<
    RecipeRecommendationHistoryEntry[]
  >(() => loadRecipeRecommendationHistory(
    `${RECIPE_HISTORY_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`,
  ));
  useEffect(() => {
    setRecipeRecommendationHistory(
      loadRecipeRecommendationHistory(recipeHistoryStorageKey),
    );
  }, [recipeHistoryStorageKey]);

  const [mealModalOpen, setMealModalOpen] = useState(false);
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [cloudReady, setCloudReady] = useState(guestMode || !session);
  const [cloudMessage, setCloudMessage] = useState("");
  const [shoppingNotice, setShoppingNotice] = useState("");
  const [morningMovementTime, setMorningMovementTime] =
    useState<AssistantMovementTime | null>(null);
  const [morningStartPreference, setMorningStartPreference] =
    useState<AssistantStartChoice | null>(null);

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
  const [now, setNow] = useState(() => new Date());
  const [tomorrowStart, setTomorrowStart] =
    useState<AssistantStartChoice | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentHour = now.getHours();
  const currentDateKey = localDateKey(now);

  useEffect(() => {
    const saved = loadAssistantPlan(assistantPlanStorageKey);
    const tomorrowKey = nextLocalDateKey(now);

    setMorningMovementTime(
      saved.movementDate === currentDateKey
        ? saved.movementTime ?? null
        : null,
    );

    setMorningStartPreference(
      saved.tomorrowDate === currentDateKey
        ? saved.tomorrowStart ?? null
        : null,
    );

    setTomorrowStart(
      saved.tomorrowDate === tomorrowKey
        ? saved.tomorrowStart ?? null
        : null,
    );
  }, [assistantPlanStorageKey, currentDateKey]);

  function chooseMorningMovementTime(time: AssistantMovementTime) {
    setMorningMovementTime(time);
    saveAssistantPlan(assistantPlanStorageKey, {
      movementDate: currentDateKey,
      movementTime: time,
    });
  }

  function chooseTomorrowStart(choice: AssistantStartChoice) {
    setTomorrowStart(choice);
    saveAssistantPlan(assistantPlanStorageKey, {
      tomorrowDate: nextLocalDateKey(now),
      tomorrowStart: choice,
    });
  }

  const todayGreeting =
    currentHour < 11
      ? "Jó reggelt. Hogy aludtál?"
      : currentHour < 14
        ? "Szia. Közeledik az ebéd ideje."
        : currentHour < 17
          ? "Szia. Hogy alakul a délutánod?"
          : currentHour < 20
            ? "Jó estét. Nézzük meg a vacsorát?"
            : "Jó estét. Hogy telt a napod?";
  const todayGreetingText =
    currentHour < 11
      ? "Hogy érzed magad ma? Nézzük meg, mi segíthet abban, hogy jól induljon a napod."
      : currentHour < 14
        ? "Nem kell az egész napot megtervezned. Most elég csak az ebéd következő jó döntését kiválasztani."
        : currentHour < 17
          ? "Nézzük meg, mi fér bele innen kényelmesen: a mozgásod vagy egyszerűen a saját ritmusod folytatása."
          : currentHour < 20
            ? "Mutatok néhány hozzád illő vacsorát. Te választasz, nem a rendszer dönt helyetted."
            : "Most már nem kell mindent megoldani. Nézzük meg, mi sikerült ma, és mivel szeretnéd könnyebben indítani a holnapot.";
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

  function handleRecipeShopping(ingredients: RecipeIngredient[]) {
    const added = addRecipeIngredientsToShopping(ingredients);

    setShoppingNotice(
      added > 0
        ? `✓ ${added} új hozzávaló hozzáadva a bevásárlólistához.`
        : "✓ A recept hozzávalói már szerepelnek a bevásárlólistán.",
    );

    return added;
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
            .select("id, meal_type, food_name, kcal, protein_g, carbs_g, fat_g, consumed")
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
          consumed: row.consumed !== false,
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
      meals.filter((meal) => meal.consumed).reduce(
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
            ingredientName.includes(item.trim().toLocaleLowerCase("hu")),
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

  const fullDayMenu = useMemo(() => {
    if (compatibleSavedRecipes.length === 0) return [];

    const slots = [
      { type: "Reggeli", mealType: "breakfast", share: 0.25 },
      { type: "Ebéd", mealType: "lunch", share: 0.35 },
      { type: "Vacsora", mealType: "dinner", share: 0.3 },
      { type: "Kisétkezés", mealType: "snack", share: 0.1 },
    ] as const;

    const usedRecipeIds = new Set<string>();
    const usedProteinGroups = new Set<string>();
    const usedFlavorKeys = new Set<string>();

    function mealTypeMatches(
      recipe: Recipe,
      mealType: "breakfast" | "lunch" | "dinner" | "snack",
    ) {
      // Saját, régebbi recepteknél nincs mealTypes metaadat.
      // Ezeket csak ebéd/vacsora tartalékként engedjük, reggelire/snackre nem.
      if (!recipe.mealTypes || recipe.mealTypes.length === 0) {
        return mealType === "lunch" || mealType === "dinner";
      }
      return recipe.mealTypes.includes(mealType);
    }

    function flavorKey(recipe: Recipe) {
      const generatedMatch = recipe.id.match(
        /^zenvyra-[^-]+-[^-]+-(.+)$/,
      );
      return generatedMatch?.[1] ?? recipe.name.toLocaleLowerCase("hu");
    }

    const initialMenu = slots.map((slot) => {
      const target = {
        kcal: dailyGoal * slot.share,
        protein: (profile?.protein_target_g ?? 0) * slot.share,
        carbs: (profile?.carbs_target_g ?? 0) * slot.share,
        fat: (profile?.fat_target_g ?? 0) * slot.share,
      };

      const typedCandidates = compatibleSavedRecipes.filter(
        (recipe) =>
          mealTypeMatches(recipe, slot.mealType) &&
          !usedRecipeIds.has(recipe.id),
      );

      const scored = typedCandidates
        .map((recipe) => {
          const servings = Math.max(1, recipe.servings);
          const perServing = {
            kcal: recipe.kcal / servings,
            protein: recipe.protein / servings,
            carbs: recipe.carbs / servings,
            fat: recipe.fat / servings,
          };

          const pairs = [
            [perServing.kcal, target.kcal, 1.6],
            [perServing.protein, target.protein, 1.35],
            [perServing.carbs, target.carbs, 0.9],
            [perServing.fat, target.fat, 0.9],
          ].filter(([, targetValue]) => targetValue > 0);

          const normalized = pairs.map(
            ([value, targetValue, weight]) => (value / targetValue) * weight,
          );
          const numerator = normalized.reduce(
            (sum, value) => sum + value,
            0,
          );
          const denominator = normalized.reduce(
            (sum, value) => sum + value * value,
            0,
          );

          // Negyed adaggal finomabban közelítünk a napi célhoz.
          const rawPortions = denominator > 0 ? numerator / denominator : 1;
          const portions = Math.max(
            0.5,
            Math.min(3, Math.round(rawPortions * 4) / 4),
          );

          let score = pairs.reduce((sum, [value, targetValue, weight]) => {
            const difference =
              (value * portions - targetValue) / targetValue;
            return sum + difference * difference * weight;
          }, 0);

          const proteinGroup = recipeProteinGroup(recipe);
          const recipeFlavorKey = flavorKey(recipe);

          // Ugyanaz a fő fehérjeforrás lehetőleg ne ismétlődjön a nap során.
          // Nem tiltjuk teljesen, mert erős allergén/étrendi szűrésnél
          // lehet, hogy nincs más megfelelő alternatíva.
          if (usedProteinGroups.has(proteinGroup)) {
            score += 2.25;
          }
          if (usedFlavorKeys.has(recipeFlavorKey)) {
            score += 1.0;
          }

          return {
            recipe,
            portions,
            kcal: Math.round(perServing.kcal * portions),
            protein: Math.round(perServing.protein * portions),
            carbs: Math.round(perServing.carbs * portions),
            fat: Math.round(perServing.fat * portions),
            score,
            proteinGroup,
            flavorKey: recipeFlavorKey,
          };
        })
        .sort((a, b) => a.score - b.score);

      const selected = scored[0] ?? null;

      if (selected) {
        usedRecipeIds.add(selected.recipe.id);
        usedProteinGroups.add(selected.proteinGroup);
        usedFlavorKeys.add(selected.flavorKey);
      }

      return {
        type: slot.type,
        optional: slot.type === "Kisétkezés",
        recommendation: selected,
      };
    });

    // Második lépcső: a már kiválasztott, változatos receptek adagjait
    // a TELJES NAP célértékeihez igazítjuk. Így nem négy külön étkezést,
    // hanem egy összefüggő napi tervet optimalizálunk.
    const selected = initialMenu
      .map((item) => item.recommendation)
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (selected.length !== initialMenu.length) {
      return initialMenu;
    }

    // Életszerű adaghatárok étkezéstípusonként.
    // A motor továbbra is 0,25 adagos lépésekben optimalizál,
    // de nem kompenzálhat például egy 2 adagos, 1000+ kcal-os ebéddel.
    const portionOptionsByMeal = [
      [0.75, 1, 1.25, 1.5], // Reggeli
      [0.75, 1, 1.25, 1.5], // Ebéd
      [0.75, 1, 1.25, 1.5], // Vacsora
      [0.5, 0.75, 1], // Kisétkezés
    ];

    let bestPortions = selected.map((item) => item.portions);
    let bestScore = Number.POSITIVE_INFINITY;

    function dailyScore(
      kcalValue: number,
      proteinValue: number,
      carbsValue: number,
      fatValue: number,
      portions: number[],
    ) {
      const kcalDiff = (kcalValue - dailyGoal) / Math.max(1, dailyGoal);
      let score = kcalDiff * kcalDiff * 4;

      const proteinTarget = profile?.protein_target_g ?? 0;
      const carbsTarget = profile?.carbs_target_g ?? 0;
      const fatTarget = profile?.fat_target_g ?? 0;

      if (proteinTarget > 0) {
        const diff = (proteinValue - proteinTarget) / proteinTarget;
        score += diff * diff * 2;
      }
      if (carbsTarget > 0) {
        const diff = (carbsValue - carbsTarget) / carbsTarget;
        score += diff * diff;
      }
      if (fatTarget > 0) {
        const diff = (fatValue - fatTarget) / fatTarget;
        score += diff * diff;
      }

      // Kis büntetés a nagyon szélsőséges adagokra, hogy a terv
      // hétköznapi és könnyen követhető maradjon.
      score += portions.reduce((sum, portion) => {
        if (portion < 0.5 || portion > 2.5) return sum + 0.3;
        return sum;
      }, 0);

      return score;
    }

    for (const p0 of portionOptionsByMeal[0]) {
      for (const p1 of portionOptionsByMeal[1]) {
        for (const p2 of portionOptionsByMeal[2]) {
          for (const p3 of portionOptionsByMeal[3]) {
            const portions = [p0, p1, p2, p3];

            const totalsForPortions = selected.reduce(
              (sum, item, index) => {
                const servings = Math.max(1, item.recipe.servings);
                const portion = portions[index];

                return {
                  kcal:
                    sum.kcal +
                    (item.recipe.kcal / servings) * portion,
                  protein:
                    sum.protein +
                    (item.recipe.protein / servings) * portion,
                  carbs:
                    sum.carbs +
                    (item.recipe.carbs / servings) * portion,
                  fat:
                    sum.fat +
                    (item.recipe.fat / servings) * portion,
                };
              },
              { kcal: 0, protein: 0, carbs: 0, fat: 0 },
            );

            const score = dailyScore(
              totalsForPortions.kcal,
              totalsForPortions.protein,
              totalsForPortions.carbs,
              totalsForPortions.fat,
              portions,
            );

            if (score < bestScore) {
              bestScore = score;
              bestPortions = portions;
            }
          }
        }
      }
    }

    return initialMenu.map((item, index) => {
      if (!item.recommendation) return item;

      const portions = bestPortions[index];
      const recipe = item.recommendation.recipe;
      const servings = Math.max(1, recipe.servings);

      return {
        ...item,
        recommendation: {
          ...item.recommendation,
          portions,
          kcal: Math.round((recipe.kcal / servings) * portions),
          protein: Math.round((recipe.protein / servings) * portions),
          carbs: Math.round((recipe.carbs / servings) * portions),
          fat: Math.round((recipe.fat / servings) * portions),
        },
      };
    });
  }, [
    compatibleSavedRecipes,
    dailyGoal,
    profile?.carbs_target_g,
    profile?.fat_target_g,
    profile?.protein_target_g,
  ]);


  const morningBreakfastOptions = useMemo(() => {
    const breakfast = compatibleSavedRecipes.filter((recipe) =>
      recipe.mealTypes?.includes("breakfast"),
    );

    const targetKcal = dailyGoal * 0.25;

    return breakfast
      .map((recipe) => {
        const servings = Math.max(1, recipe.servings);
        const perServingKcal = recipe.kcal / servings;
        const portions = Math.max(
          0.5,
          Math.min(1.5, Math.round((targetKcal / Math.max(1, perServingKcal)) * 4) / 4),
        );

        return {
          recipe,
          portions,
          kcal: Math.round(perServingKcal * portions),
          protein: Math.round((recipe.protein / servings) * portions),
        };
      })
      .sort(
        (a, b) =>
          Math.abs(a.kcal - targetKcal) - Math.abs(b.kcal - targetKcal),
      )
      .slice(0, 4);
  }, [compatibleSavedRecipes, dailyGoal]);

  const lunchOptions = useMemo(() => {
    const targetKcal = dailyGoal * 0.35;
    return compatibleSavedRecipes
      .filter((recipe) => recipe.mealTypes?.includes("lunch"))
      .map((recipe) => {
        const servings = Math.max(1, recipe.servings);
        const perServingKcal = recipe.kcal / servings;
        const portions = Math.max(
          0.75,
          Math.min(1.5, Math.round((targetKcal / Math.max(1, perServingKcal)) * 4) / 4),
        );
        return {
          recipe,
          portions,
          kcal: Math.round(perServingKcal * portions),
          protein: Math.round((recipe.protein / servings) * portions),
        };
      })
      .sort((a, b) => Math.abs(a.kcal - targetKcal) - Math.abs(b.kcal - targetKcal))
      .slice(0, 3);
  }, [compatibleSavedRecipes, dailyGoal]);

  const dinnerOptions = useMemo(() => {
    const targetKcal = dailyGoal * 0.3;
    return compatibleSavedRecipes
      .filter((recipe) => recipe.mealTypes?.includes("dinner"))
      .map((recipe) => {
        const servings = Math.max(1, recipe.servings);
        const perServingKcal = recipe.kcal / servings;
        const portions = Math.max(
          0.75,
          Math.min(1.5, Math.round((targetKcal / Math.max(1, perServingKcal)) * 4) / 4),
        );
        return {
          recipe,
          portions,
          kcal: Math.round(perServingKcal * portions),
          protein: Math.round((recipe.protein / servings) * portions),
        };
      })
      .sort((a, b) => Math.abs(a.kcal - targetKcal) - Math.abs(b.kcal - targetKcal))
      .slice(0, 3);
  }, [compatibleSavedRecipes, dailyGoal]);

  const personalizedWeeklyRecipes = useMemo(() => {
    if (compatibleSavedRecipes.length === 0) return [];

    const targetMeal = {
      kcal: Math.max(250, dailyGoal * 0.3),
      protein: profile?.protein_target_g ? profile.protein_target_g * 0.3 : 0,
      carbs: profile?.carbs_target_g ? profile.carbs_target_g * 0.3 : 0,
      fat: profile?.fat_target_g ? profile.fat_target_g * 0.3 : 0,
    };

    const scoredRecipes = compatibleSavedRecipes
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
        const rawPortions = denominator > 0 ? numerator / denominator : 1;
        const portions = Math.max(
          0.5,
          Math.min(3, Math.round(rawPortions * 2) / 2),
        );

        const nutritionScore = pairs.reduce((sum, [value, target]) => {
          const difference = (value * portions - target) / target;
          return sum + difference * difference;
        }, 0);

        return {
          recipe,
          portions,
          kcal: Math.round(perServing.kcal * portions),
          protein: Math.round(perServing.protein * portions),
          carbs: Math.round(perServing.carbs * portions),
          fat: Math.round(perServing.fat * portions),
          score: nutritionScore,
        };
      })
      .sort((a, b) => a.score - b.score || a.recipe.name.localeCompare(b.recipe.name, "hu"));

    const thisWeek = currentWeekKey();
    const cutoff = Date.now() - RECIPE_REPEAT_BLOCK_DAYS * 24 * 60 * 60 * 1000;
    const recentlyRecommendedIds = new Set(
      recipeRecommendationHistory
        .filter((entry) => {
          const timestamp = new Date(entry.recommendedAt).getTime();
          return (
            entry.week !== thisWeek &&
            Number.isFinite(timestamp) &&
            timestamp >= cutoff
          );
        })
        .map((entry) => entry.recipeId),
    );

    // 14 napos ismétlésgátló: először csak olyan receptet használunk,
    // amelyet az előző 14 napban nem ajánlottunk ennek a felhasználónak.
    const freshRecipes = scoredRecipes.filter(
      (item) => !recentlyRecommendedIds.has(item.recipe.id),
    );
    const fallbackRecipes = scoredRecipes.filter((item) =>
      recentlyRecommendedIds.has(item.recipe.id),
    );
    const orderedCandidates = [...freshRecipes, ...fallbackRecipes];
    const unusedRecipeIds = new Set(
      orderedCandidates.map((item) => item.recipe.id),
    );
    const proteinCounts = new Map<string, number>();
    let previousProtein: string | null = null;

    return weeklyPlan.map((day, dayIndex) => {
      const availableCandidates = orderedCandidates.filter((item) =>
        unusedRecipeIds.has(item.recipe.id),
      );

      // Heti fehérjeforrás-rotáció:
      // 1) ne legyen ugyanaz a fő fehérje két egymást követő napon,
      // 2) ugyanaz a fehérjeforrás legfeljebb kétszer szerepeljen a héten,
      // 3) a "Cseréld le" ugyanebből a megfelelő jelöltkörből választ másik receptet,
      // 4) ha a szűrések miatt ez nem tartható, fokozatosan lazítunk a szabályon.
      const strongestCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        const count = proteinCounts.get(proteinGroup) ?? 0;
        return proteinGroup !== previousProtein && count < WEEKLY_PROTEIN_MAX;
      });

      const differentProteinCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        return proteinGroup !== previousProtein;
      });

      const withinWeeklyMaxCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        return (proteinCounts.get(proteinGroup) ?? 0) < WEEKLY_PROTEIN_MAX;
      });

      const candidatePool =
        strongestCandidates.length > 0
          ? strongestCandidates
          : differentProteinCandidates.length > 0
            ? differentProteinCandidates
            : withinWeeklyMaxCandidates.length > 0
              ? withinWeeklyMaxCandidates
              : availableCandidates;

      const swapOffset = weeklyRecipeSwapOffsets[dayIndex] ?? 0;
      const selected =
        candidatePool.length > 0
          ? candidatePool[swapOffset % candidatePool.length]
          : undefined;

      if (!selected) {
        return { day: day.day, recipe: null };
      }

      unusedRecipeIds.delete(selected.recipe.id);
      const selectedProtein = recipeProteinGroup(selected.recipe);
      proteinCounts.set(
        selectedProtein,
        (proteinCounts.get(selectedProtein) ?? 0) + 1,
      );
      previousProtein = selectedProtein;

      return {
        day: day.day,
        ...selected,
      };
    });
  }, [
    compatibleSavedRecipes,
    dailyGoal,
    profile?.carbs_target_g,
    profile?.fat_target_g,
    profile?.protein_target_g,
    recipeRecommendationHistory,
    weeklyPlan,
    weeklyRecipeSwapOffsets,
  ]);

  const generatedShoppingItems = useMemo(() => {
    type Aggregate = {
      name: string;
      category: string;
      numericAmount: number;
      unit: string;
      fallbackAmounts: string[];
    };

    function splitShoppingIngredient(name: string): string[] {
      const cleaned = name.trim();

      // Csak a receptgenerátorban használt, egyértelmű összetett alapanyagokat
      // bontjuk. Nem vágunk szét vakon minden "és" kapcsolatot.
      const exactSplits: Record<string, string[]> = {
        "gyömbér, lime és gluténmentes tamari": [
          "Gyömbér",
          "Lime",
          "Gluténmentes tamari",
        ],
        "mandula és friss zöldfűszerek": [
          "Mandula",
          "Friss zöldfűszerek",
        ],
        "paradicsom, paprika és oregánó": [
          "Paradicsom",
          "Paprika",
          "Oregánó",
        ],
      };

      return exactSplits[cleaned.toLocaleLowerCase("hu")] ?? [cleaned];
    }

    function shoppingFriendlyAmount(value: number, unit: string) {
      if (!Number.isFinite(value) || value <= 0) return "";

      const normalizedUnit = unit.trim().toLocaleLowerCase("hu");

      if (normalizedUnit === "g") {
        const rounded =
          value < 100
            ? Math.ceil(value / 10) * 10
            : Math.ceil(value / 50) * 50;
        return `${rounded} g`;
      }

      if (normalizedUnit === "kg") {
        const rounded = Math.ceil(value * 10) / 10;
        return `${nutritionValue(rounded)} kg`;
      }

      if (normalizedUnit === "ml") {
        const rounded =
          value < 250
            ? Math.ceil(value / 25) * 25
            : Math.ceil(value / 50) * 50;
        return `${rounded} ml`;
      }

      if (normalizedUnit === "l") {
        const rounded = Math.ceil(value * 10) / 10;
        return `${nutritionValue(rounded)} l`;
      }

      if (normalizedUnit === "db") {
        return `${Math.ceil(value)} db`;
      }

      // Kanalas és egyéb konyhai mennyiségeknél fél egységre kerekítünk.
      const rounded = Math.ceil(value * 2) / 2;
      return `${nutritionValue(rounded)} ${unit}`.trim();
    }

    function normalizeIngredientName(name: string) {
      return name.trim().toLocaleLowerCase("hu");
    }

    function ingredientCategory(name: string) {
      const value = normalizeIngredientName(name);

      if (/(csirk|pulyk|marha|lazac|tonhal|hal|tojás|tofu|tempeh|csicseribors|lencs|bab|cottage|túró)/.test(value)) {
        return "Fehérjeforrások";
      }
      if (/(joghurt|tej|kefir|sajt|vaj|tejszín)/.test(value)) {
        return "Hűtő";
      }
      if (/(alma|banán|bogyós|avokád|paradics|paprika|uborka|saláta|zöldség|hagyma|citrom|lime|burgonya|édesburgonya)/.test(value)) {
        return "Zöldség és gyümölcs";
      }
      return "Kamra";
    }

    function parseAmount(amount: string) {
      const normalized = amount
        .trim()
        .toLocaleLowerCase("hu")
        .replace(",", ".")
        .replace("½", "0.5");

      const fractionMatch = normalized.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
      if (fractionMatch) {
        const denominator = Number(fractionMatch[2]);
        if (denominator > 0) {
          return {
            value: Number(fractionMatch[1]) / denominator,
            unit: fractionMatch[3].trim() || "db",
          };
        }
      }

      const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      if (!match) return null;

      return {
        value: Number(match[1]),
        unit: match[2].trim() || "db",
      };
    }

    const aggregates = new Map<string, Aggregate>();

    for (const day of personalizedWeeklyRecipes) {
      if (!day.recipe) continue;

      const recipeServings = Math.max(1, day.recipe.servings);
      const scale = (day.portions ?? 1) / recipeServings;

      for (const ingredient of day.recipe.ingredients) {
        const shoppingNames = splitShoppingIngredient(ingredient.name);
        const parsed = parseAmount(ingredient.amount);

        for (const shoppingName of shoppingNames) {
          const key = normalizeIngredientName(shoppingName);
          const existing = aggregates.get(key);

          if (!existing) {
            aggregates.set(key, {
              name: shoppingName,
              category: ingredientCategory(shoppingName),
              numericAmount: parsed ? parsed.value * scale : 0,
              unit: parsed?.unit ?? "",
              fallbackAmounts: parsed ? [] : [ingredient.amount],
            });
            continue;
          }

          if (
            parsed &&
            existing.unit === parsed.unit &&
            existing.fallbackAmounts.length === 0
          ) {
            existing.numericAmount += parsed.value * scale;
          } else if (!parsed) {
            existing.fallbackAmounts.push(ingredient.amount);
          } else {
            // Eltérő mértékegységeket nem vonunk össze hamis pontossággal.
            existing.fallbackAmounts.push(
              shoppingFriendlyAmount(parsed.value * scale, parsed.unit),
            );
          }
        }
      }
    }

    return Array.from(aggregates.entries()).map(([key, item], index): ShoppingItem => {
      let amount = "";

      if (item.fallbackAmounts.length > 0) {
        const parts = [
          item.numericAmount > 0
            ? shoppingFriendlyAmount(item.numericAmount, item.unit)
            : "",
          ...Array.from(new Set(item.fallbackAmounts)),
        ].filter(Boolean);
        amount = parts.join(" + ");
      } else if (item.numericAmount > 0) {
        amount = shoppingFriendlyAmount(item.numericAmount, item.unit);
      }

      return {
        id: `weekly-${index}-${key.replace(/[^a-z0-9áéíóöőúüű]+/gi, "-")}`,
        category: item.category,
        name: item.name,
        amount,
      };
    });
  }, [personalizedWeeklyRecipes]);

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




  useEffect(() => {
    if (personalizedWeeklyRecipes.length === 0) return;

    const thisWeek = currentWeekKey();
    const recommendedAt = new Date().toISOString();
    const selectedIds = personalizedWeeklyRecipes
      .map((item) => item.recipe?.id)
      .filter((id): id is string => Boolean(id));

    if (selectedIds.length === 0) return;

    setRecipeRecommendationHistory((current) => {
      const cutoff = Date.now() - RECIPE_REPEAT_BLOCK_DAYS * 24 * 60 * 60 * 1000;
      const recent = current.filter((entry) => {
        const timestamp = new Date(entry.recommendedAt).getTime();
        return Number.isFinite(timestamp) && timestamp >= cutoff;
      });
      const alreadyStoredThisWeek = new Set(
        recent
          .filter((entry) => entry.week === thisWeek)
          .map((entry) => entry.recipeId),
      );
      const missingIds = selectedIds.filter(
        (recipeId) => !alreadyStoredThisWeek.has(recipeId),
      );

      if (missingIds.length === 0 && recent.length === current.length) {
        return current;
      }

      const next = [
        ...recent,
        ...missingIds.map((recipeId) => ({
          recipeId,
          recommendedAt,
          week: thisWeek,
        })),
      ];

      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          recipeHistoryStorageKey,
          JSON.stringify(next),
        );
      }

      return next;
    });
  }, [personalizedWeeklyRecipes, recipeHistoryStorageKey]);

  function swapWeeklyRecipe(dayIndex: number) {
    setWeeklyRecipeSwapOffsets((current) =>
      current.map((offset, index) =>
        index === dayIndex ? offset + 1 : offset,
      ),
    );
  }

  const nextPlannedMeal = meals.find((meal) => !meal.consumed);
  const consumedMealCount = meals.filter((meal) => meal.consumed).length;
  const lunchMeal = meals.find((meal) => meal.type === "Ebéd");
  const dinnerMeal = meals.find((meal) => meal.type === "Vacsora");
  const isLunchPhase = currentHour >= 11 && currentHour < 14;
  const isAfternoonPhase = currentHour >= 14 && currentHour < 17;
  const isDinnerPhase = currentHour >= 17 && currentHour < 20;

  const todayGuideText =
    nextPlannedMeal
      ? `${nextPlannedMeal.type} következik. Már el van tervezve, csak akkor jelöld elfogyasztottnak, amikor valóban megetted.`
      : consumedMealCount === 0
        ? "Kezdd a következő étkezéssel. Nem kell az egész napot egyszerre fejben tartanod."
        : !movementDone
          ? `${consumedMealCount} étkezést már rögzítettél. A következő jó lépés egy ${todayWorkout.minutes} perces, hozzád igazított mozgás.`
          : `${consumedMealCount} étkezést már rögzítettél, és a mai mozgásod is kész. Folytasd a saját ritmusodban — a következetesség többet számít, mint a tökéletesség.`;

  function openTodayNextStep() {
    if (nextPlannedMeal) {
      setView("meals");
      return;
    }

    if (consumedMealCount === 0) {
      if (dailyRecipeRecommendation) {
        void addRecipeToMeals(
          dailyRecipeRecommendation.recipe,
          dailyRecipeRecommendation.portions,
        );
        return;
      }
      setView("recipes");
      return;
    }

    if (!movementDone) {
      setView("movement");
    }
  }

  const todayNextButtonLabel =
    nextPlannedMeal
      ? "Mai étkezések →"
      : consumedMealCount === 0
        ? dailyRecipeRecommendation
          ? "Ajánlott étkezés hozzáadása →"
          : "Receptek megnyitása →"
        : !movementDone
          ? "Mozgás megnyitása →"
          : null;

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
      consumed: true,
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
        consumed: draft.consumed,
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

  async function addRecipeToMeals(
    recipe: Recipe,
    portions: number,
    mealType = "Főétkezés",
  ) {
    const ratio = portions / recipe.servings;
    const draft = {
      type: mealType,
      food: `${recipe.name} (${String(portions).replace(".", ",")} adag)`,
      kcal: Math.round(recipe.kcal * ratio),
      protein: Math.round(recipe.protein * ratio),
      carbs: Math.round(recipe.carbs * ratio),
      fat: Math.round(recipe.fat * ratio),
      consumed: false,
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
        consumed: false,
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

  async function markMealConsumed(id: string) {
    const meal = meals.find((item) => item.id === id);
    if (!meal || meal.consumed) return;

    if (!guestMode && session?.user && !id.startsWith("demo-")) {
      const { error } = await supabase
        .from("meals")
        .update({ consumed: true })
        .eq("id", id);

      if (error) {
        setCloudMessage("Az étkezés elfogyasztásának mentése nem sikerült.");
        return;
      }
    }

    setMeals((current) =>
      current.map((item) =>
        item.id === id ? { ...item, consumed: true } : item,
      ),
    );
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
                      : view === "settings"
                        ? "SAJÁT PROFIL"
                        : "HALADÁS"}
            </div>

            <h1>
              {view === "today"
                ? todayGreeting
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
                      : view === "settings"
                        ? "A profilod."
                        : "Lásd a fejlődésed."}
            </h1>

            <p>
              {view === "today"
                ? todayGreetingText
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
                      : view === "settings"
                        ? "Étrend, allergének, alapanyagok és mozgási preferenciák egy helyen."
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
            {currentHour < 11 ? (
              <section
                className="dashboard-card"
                aria-labelledby="morning-assistant-title"
                style={{
                  padding: "26px",
                  marginBottom: 20,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(247,238,249,0.96))",
                }}
              >
                <span className="card-kicker">REGGELI RÁHANGOLÓDÁS</span>
                <h2
                  id="morning-assistant-title"
                  style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}
                >
                  Hogy érzed magad ma?
                </h2>
                <p style={{ margin: "0 0 14px" }}>
                  Jelöld egy érintéssel. Ebből indulunk, nem egy kötelező listából.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={mood === value ? "mood-button active" : "mood-button"}
                      onClick={() => void saveMood(value)}
                      aria-label={`Közérzet ${value} az 5-ből`}
                    >
                      {value}
                    </button>
                  ))}
                </div>

                {morningStartPreference && (
                  <div
                    style={{
                      marginTop: 20,
                      padding: "14px 16px",
                      borderRadius: 16,
                      background: "rgba(246, 239, 251, 0.82)",
                      border: "1px solid rgba(122, 75, 157, 0.12)",
                    }}
                  >
                    <span className="card-kicker">TEGNAP ESTE EZT VÁLASZTOTTAD</span>
                    <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                      {morningStartPreference}. Innen indulhatunk ma, de bármikor változtathatsz rajta.
                    </p>
                  </div>
                )}

                <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid rgba(95, 61, 130, 0.10)" }}>
                  <span className="card-kicker">1 · REGGELI</span>
                  <h3 style={{ margin: "7px 0 6px", fontSize: "1.25rem" }}>
                    Mit ennél ma szívesen reggelire?
                  </h3>
                  <p style={{ marginTop: 0 }}>
                    Mutatok néhány hozzád illő lehetőséget, de te választasz.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                      marginTop: 14,
                    }}
                  >
                    {morningBreakfastOptions.map((option) => (
                      <article
                        key={option.recipe.id}
                        style={{
                          padding: 16,
                          border: "1px solid rgba(95, 61, 130, 0.10)",
                          borderRadius: 18,
                          background: "rgba(255,255,255,0.72)",
                        }}
                      >
                        <strong style={{ display: "block", marginBottom: 7 }}>
                          {option.recipe.name}
                        </strong>
                        <span style={{ display: "block", marginBottom: 12 }}>
                          {option.kcal} kcal · {option.protein} g fehérje · {String(option.portions).replace(".", ",")} adag
                        </span>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => void addRecipeToMeals(option.recipe, option.portions, "Reggeli")}
                        >
                          Ezt választom
                        </button>
                      </article>
                    ))}
                  </div>
                </div>

                <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid rgba(95, 61, 130, 0.10)" }}>
                  <span className="card-kicker">2 · MOZGÁS</span>
                  <h3 style={{ margin: "7px 0 6px", fontSize: "1.25rem" }}>
                    Mikor férne bele ma {preferences.workout_minutes} perc mozgás?
                  </h3>
                  <p style={{ marginTop: 0 }}>
                    Nem kell most megcsinálnod. Elég, ha helyet adsz neki a napodban.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(["Délelőtt", "Délután", "Este"] as const).map((time) => (
                      <button
                        key={time}
                        type="button"
                        className={morningMovementTime === time ? "secondary-button active" : "secondary-button"}
                        onClick={() => chooseMorningMovementTime(time)}
                        style={{
                          appearance: "none",
                          border: morningMovementTime === time
                            ? "1px solid rgba(122, 75, 157, 0.38)"
                            : "1px solid rgba(122, 75, 157, 0.18)",
                          borderRadius: 14,
                          padding: "11px 16px",
                          background: morningMovementTime === time
                            ? "linear-gradient(135deg, rgba(255,126,139,0.16), rgba(154,112,219,0.18))"
                            : "rgba(255,255,255,0.82)",
                          color: "#6f3f8f",
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: morningMovementTime === time
                            ? "0 8px 20px rgba(111,63,143,0.10)"
                            : "none",
                        }}
                      >
                        {morningMovementTime === time ? `${time} ✓` : time}
                      </button>
                    ))}
                  </div>
                  {morningMovementTime && (
                    <p style={{ margin: "12px 0 0", fontWeight: 700 }}>
                      Rendben. {morningMovementTime.toLocaleLowerCase("hu")} visszatérünk a mozgásodra.
                    </p>
                  )}
                </div>

                <div style={{ marginTop: 26, paddingTop: 22, borderTop: "1px solid rgba(95, 61, 130, 0.10)" }}>
                  <span className="card-kicker">KÉSŐBB</span>
                  <h3 style={{ margin: "7px 0 6px", fontSize: "1.25rem" }}>
                    Az ebédet ráérsz később megtervezni.
                  </h3>
                  <p style={{ margin: 0 }}>
                    Amikor közeledik az ebéd ideje, innen folytatjuk a napodat.
                  </p>
                </div>
              </section>
            ) : currentHour < 20 ? (
              <section
                className="dashboard-card"
                aria-labelledby="today-guide-title"
                style={{
                  padding: "26px",
                  marginBottom: 20,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(247,238,249,0.96))",
                }}
              >
                {isLunchPhase ? (
                  <>
                    <span className="card-kicker">EBÉD · KÖVETKEZŐ JÓ LÉPÉS</span>
                    <h2 id="today-guide-title" style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}>
                      {lunchMeal ? "Az ebéded már megvan." : "Mit ennél ma szívesen ebédre?"}
                    </h2>
                    <p style={{ margin: "0 0 16px", maxWidth: 760 }}>
                      {lunchMeal
                        ? lunchMeal.consumed
                          ? "Az ebédet már rögzítetted. Innen folytathatod nyugodtan a napodat."
                          : "Már kiválasztottad az ebédedet. Akkor jelöld elfogyasztottnak, amikor valóban megetted."
                        : "Három hozzád illő lehetőséget mutatok. Nem kell tökéleteset választanod — azt válaszd, amelyik most jól esik."}
                    </p>

                    {lunchMeal ? (
                      <button type="button" className="primary-button" onClick={() => setView("meals")}>
                        Mai étkezések →
                      </button>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                        {lunchOptions.map((option) => (
                          <article key={option.recipe.id} style={{ padding: 16, border: "1px solid rgba(95, 61, 130, 0.10)", borderRadius: 18, background: "rgba(255,255,255,0.72)" }}>
                            <strong style={{ display: "block", marginBottom: 7 }}>{option.recipe.name}</strong>
                            <span style={{ display: "block", marginBottom: 12 }}>
                              {option.kcal} kcal · {option.protein} g fehérje · {String(option.portions).replace(".", ",")} adag
                            </span>
                            <button type="button" className="secondary-button" onClick={() => void addRecipeToMeals(option.recipe, option.portions, "Ebéd")}>
                              Ezt választom
                            </button>
                          </article>
                        ))}
                      </div>
                    )}
                  </>
                ) : isAfternoonPhase ? (
                  <div style={{ display: "flex", gap: 20, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 420px" }}>
                      <span className="card-kicker">DÉLUTÁNI RITMUS</span>
                      <h2 id="today-guide-title" style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}>
                        {movementDone
                          ? "A mozgásod már megvan ✨"
                          : morningMovementTime === "Délután"
                            ? `Most jöhet a ${todayWorkout.minutes} perces mozgásod.`
                            : morningMovementTime === "Este"
                              ? "A mozgást estére tervezted."
                              : morningMovementTime === "Délelőtt"
                                ? "A délelőtti mozgás most sem kötelező bepótlás."
                                : "Mi lenne most a következő jó lépés?"}
                      </h2>
                      <p style={{ margin: 0, maxWidth: 720 }}>
                        {movementDone
                          ? "Nem kell újabb feladatot keresned. Folytasd a saját ritmusodban."
                          : morningMovementTime === "Délután"
                            ? `Reggel délutánra tervezted. Ha most belefér, a ${todayWorkout.title.toLocaleLowerCase("hu")} lehet a következő lépés.`
                            : morningMovementTime === "Este"
                              ? "Most nem kell előrevenned. Este visszatérünk rá, addig folytasd nyugodtan a napodat."
                              : morningMovementTime === "Délelőtt"
                                ? "Ha délelőtt nem fért bele, nem maradtál le semmiről. Megcsinálhatod később is, vagy elengedheted mára."
                                : "Ha belefér, most jó helye lehet egy rövid mozgásnak. Ha nem, semmi baj — később is visszatérhetsz hozzá."}
                      </p>
                    </div>
                    {!movementDone && (
                      <button type="button" className="primary-button" onClick={() => setView("movement")} style={{ minWidth: 190 }}>
                        Mozgás megnyitása →
                      </button>
                    )}
                  </div>
                ) : isDinnerPhase ? (
                  <>
                    <span className="card-kicker">VACSORA · KÖVETKEZŐ JÓ LÉPÉS</span>
                    <h2 id="today-guide-title" style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}>
                      {dinnerMeal ? "A vacsorád már megvan." : "Mit ennél ma szívesen vacsorára?"}
                    </h2>
                    <p style={{ margin: "0 0 16px", maxWidth: 760 }}>
                      {dinnerMeal
                        ? dinnerMeal.consumed
                          ? "A vacsorát már rögzítetted. Innen már nyugodtan lezárhatod majd a napodat."
                          : "Már kiválasztottad a vacsorádat. Akkor jelöld elfogyasztottnak, amikor valóban megetted."
                        : "Három könnyen követhető, hozzád illő lehetőséget mutatok. A döntés a tiéd."}
                    </p>

                    {dinnerMeal ? (
                      <button type="button" className="primary-button" onClick={() => setView("meals")}>
                        Mai étkezések →
                      </button>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                        {dinnerOptions.map((option) => (
                          <article key={option.recipe.id} style={{ padding: 16, border: "1px solid rgba(95, 61, 130, 0.10)", borderRadius: 18, background: "rgba(255,255,255,0.72)" }}>
                            <strong style={{ display: "block", marginBottom: 7 }}>{option.recipe.name}</strong>
                            <span style={{ display: "block", marginBottom: 12 }}>
                              {option.kcal} kcal · {option.protein} g fehérje · {String(option.portions).replace(".", ",")} adag
                            </span>
                            <button type="button" className="secondary-button" onClick={() => void addRecipeToMeals(option.recipe, option.portions, "Vacsora")}>
                              Ezt választom
                            </button>
                          </article>
                        ))}
                      </div>
                    )}

                    {!movementDone && morningMovementTime === "Este" && (
                      <div
                        style={{
                          marginTop: 18,
                          padding: "14px 16px",
                          borderRadius: 16,
                          background: "rgba(246, 239, 251, 0.82)",
                          border: "1px solid rgba(122, 75, 157, 0.12)",
                        }}
                      >
                        <span className="card-kicker">MA ESTÉRE TERVEZTED</span>
                        <p style={{ margin: "6px 0 10px" }}>
                          A vacsora után, ha még jól esik, visszatérhetünk a {todayWorkout.minutes} perces mozgásodra.
                        </p>
                        <button type="button" className="secondary-button" onClick={() => setView("movement")}>
                          Mozgás megnyitása →
                        </button>
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            ) : (
              <section
                className="dashboard-card"
                aria-labelledby="evening-guide-title"
                style={{
                  padding: "26px",
                  marginBottom: 20,
                  background:
                    "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(247,238,249,0.96))",
                }}
              >
                <span className="card-kicker">ESTI LEZÁRÁS</span>
                <h2
                  id="evening-guide-title"
                  style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}
                >
                  {movementDone || meals.some((meal) => meal.consumed)
                    ? "Vedd észre, ami ma sikerült ✨"
                    : "Ez a nap is számít."}
                </h2>
                <p style={{ margin: "0 0 20px", maxWidth: 760 }}>
                  {movementDone && meals.some((meal) => meal.consumed)
                    ? "Étkeztél, mozogtál, tettél magadért. Nem a tökéletesség számít, hanem hogy újra és újra visszatalálj magadhoz."
                    : "Nem kell este bepótolni mindent. Zárd le nyugodtan a napot, és válassz egy könnyű kapaszkodót holnap reggelre."}
                </p>

                <div style={{ paddingTop: 18, borderTop: "1px solid rgba(95, 61, 130, 0.10)" }}>
                  <span className="card-kicker">HOLNAP REGGEL</span>
                  <h3 style={{ margin: "7px 0 6px", fontSize: "1.25rem" }}>
                    Mivel indítanád szívesen a napod?
                  </h3>
                  <p style={{ marginTop: 0 }}>
                    Nem kötelező terv. Csak válassz egy dolgot, ami jól esne.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {(["Nyugodt reggeli", "Rövid mozgás", "Lassabb indulás"] as const).map((choice) => (
                      <button
                        key={choice}
                        type="button"
                        className={tomorrowStart === choice ? "secondary-button active" : "secondary-button"}
                        onClick={() => chooseTomorrowStart(choice)}
                        style={{
                          appearance: "none",
                          border: tomorrowStart === choice
                            ? "1px solid rgba(122, 75, 157, 0.38)"
                            : "1px solid rgba(122, 75, 157, 0.18)",
                          borderRadius: 14,
                          padding: "11px 16px",
                          background: tomorrowStart === choice
                            ? "linear-gradient(135deg, rgba(255,126,139,0.16), rgba(154,112,219,0.18))"
                            : "rgba(255,255,255,0.82)",
                          color: "#6f3f8f",
                          fontWeight: 800,
                          cursor: "pointer",
                          boxShadow: tomorrowStart === choice
                            ? "0 8px 20px rgba(111,63,143,0.10)"
                            : "none",
                        }}
                      >
                        {tomorrowStart === choice ? `${choice} ✓` : choice}
                      </button>
                    ))}
                  </div>
                  {tomorrowStart && (
                    <p style={{ margin: "12px 0 0", fontWeight: 700 }}>
                      Rendben. Holnap reggel innen indulunk: {tomorrowStart.toLocaleLowerCase("hu")}.
                    </p>
                  )}
                </div>
              </section>
            )}

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
                        {!meal.consumed && (
                          <button
                            type="button"
                            className="outline-button"
                            onClick={() => void markMealConsumed(meal.id)}
                          >
                            Elfogyasztottam ✓
                          </button>
                        )}
                        {meal.consumed && <span className="meal-status">Elfogyasztva ✓</span>}
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
                  <p style={{ margin: "8px 0 12px" }}>
                    Ne feledkezz meg a folyadékbevitelről sem.
                  </p>
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
                <h2>Ez lehet egy tökéletes nap.</h2>
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
                <span className="card-kicker">SZEMÉLYRE SZABOTT HETI ÉTKEZÉS</span>
                <h2>A te heti egyensúlyod</h2>
                <p>
                  A terved a célodhoz igazodik, de nem kötelező lista. Cserélj
                  fel napokat, és válaszd azt, ami most belefér. Ugyanazt a
                  receptet 14 napig nem ajánljuk újra, ha van más megfelelő választás.
                </p>
              </div>
              <div className="weekly-plan-goal">
                <span>NAPI KIINDULÓPONT</span>
                <strong>{dailyGoal} kcal</strong>
                <small>étkezés · mozgás · közérzet</small>
              </div>
            </section>

            <section className="weekly-plan-grid" aria-label="Heti terv">
              {weeklyPlan.map((item, index) => {
                const recommendation = personalizedWeeklyRecipes[index];

                return (
                  <article className="dashboard-card weekly-day-card" key={item.day}>
                    <div className="weekly-day-heading">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <h2>{item.day}</h2>
                    </div>

                    <div className="weekly-day-items">
                      <div>
                        <i className="weekly-dot food-dot">◒</i>
                        <p>
                          <span>A megadott szűrők alapján megfelelő recept</span>
                          <strong>
                            {recommendation?.recipe
                              ? `${recommendation.recipe.name} · ${String(recommendation.portions).replace(".", ",")} adag`
                              : "Nincs megfelelő recept a jelenlegi szűrőkkel"}
                          </strong>
                          {recommendation?.recipe && (
                            <small>
                              {recommendation.kcal} kcal · {recommendation.protein} g fehérje · {recommendation.carbs} g szénhidrát · {recommendation.fat} g zsír
                            </small>
                          )}
                        </p>
                        {recommendation?.recipe && (
                          <button
                            type="button"
                            className="workout-details-button"
                            onClick={() => swapWeeklyRecipe(index)}
                          >
                            Cseréld le ↻
                          </button>
                        )}
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
                );
              })}
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

            {shoppingNotice && (
              <div
                role="status"
                style={{
                  margin: "0 0 18px",
                  padding: "14px 18px",
                  borderRadius: 16,
                  background: "rgba(147, 91, 190, 0.10)",
                  border: "1px solid rgba(147, 91, 190, 0.16)",
                  fontWeight: 700,
                }}
              >
                {shoppingNotice}
              </div>
            )}

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
            onAddShopping={handleRecipeShopping}
            onOpenShopping={() => setView("shopping")}
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
                    {!meal.consumed && (
                      <button
                        type="button"
                        className="outline-button"
                        onClick={() => void markMealConsumed(meal.id)}
                      >
                        Elfogyasztottam ✓
                      </button>
                    )}
                    {meal.consumed && <span className="meal-status">Elfogyasztva ✓</span>}
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
            movementLimitations={preferences.movement_limitations}
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

        {view === "settings" && (
          <section className="dashboard-content-grid">
            <PreferencesPanel
              session={session}
              guestMode={guestMode}
              initial={preferences}
              onChange={(next) => {
                setPreferences(next);
                if (profile && onProfileChange) {
                  onProfileChange({ ...profile, ...next });
                }
              }}
            />

            <article className="dashboard-card">
              <span className="card-kicker">SZEMÉLYRE SZABÁS</span>
              <h2>Ezek alapján ajánlunk.</h2>
              <p className="wellbeing-lead">
                Az itt megadott étrendi és mozgási beállítások közvetlenül
                befolyásolják a recept-, napi menü- és mozgásajánlásokat.
              </p>

              <div className="wellbeing-lines">
                <div>
                  <strong>Étrend</strong>
                  <span>
                    {preferences.diet_type === "vegan"
                      ? "Vegán"
                      : preferences.diet_type === "vegetarian"
                        ? "Vegetáriánus"
                        : "Mindenevő"}
                  </span>
                </div>
                <div>
                  <strong>Allergének</strong>
                  <span>
                    {preferences.allergens.length > 0
                      ? `${preferences.allergens.length} megadva`
                      : "Nincs megadva"}
                  </span>
                </div>
                <div>
                  <strong>Edzés</strong>
                  <span>{preferences.workout_minutes} perc</span>
                </div>
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
