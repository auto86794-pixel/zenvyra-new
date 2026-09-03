"use client";

import Image from "next/image";
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
  energyLevel?: "Alacsony" | "Közepes" | "Jó" | null;
  stressLevel?: "Alacsony" | "Közepes" | "Magas" | null;
  wellbeingNote?: string;
};

const STORAGE_KEY = "zenvyra_dashboard_v1";
const CHALLENGE_STORAGE_PREFIX = "zenvyra_challenges_v1";
const SHOPPING_STORAGE_PREFIX = "zenvyra_shopping_v1";
const RECIPE_STORAGE_PREFIX = "zenvyra_recipes_v1";
const RECIPE_HISTORY_STORAGE_PREFIX = "zenvyra_recipe_history_v1";
const RECIPE_REPEAT_BLOCK_DAYS = 14;
const ASSISTANT_PLAN_STORAGE_PREFIX = "zenvyra_assistant_plan_v1";
const SERVICE_PROVIDER_STORAGE_PREFIX = "zenvyra_service_providers_v1";



type RecipeRecommendationHistoryEntry = {
  recipeId: string;
  recommendedAt: string;
  week: string;
};

const WEEKLY_PROTEIN_MAX = 2;
const WEEKLY_BASE_MAX = 1;

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

function recipeBaseGroup(recipe: Recipe): string {
  const generatedMatch = recipe.id.match(
    /^zenvyra-(?:chicken|turkey|salmon|tuna|beef|egg|tofu|chickpea|lentil|tempeh|cottage|beans)-(rice|brownrice|potato|quinoa|millet|buckwheat|couscous|pasta|bulgur|sweetpotato)-/,
  );

  if (generatedMatch) return generatedMatch[1];

  const searchable = [
    recipe.name,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ]
    .join(" ")
    .toLocaleLowerCase("hu");

  const groups: Array<[string, string[]]> = [
    ["brownrice", ["barna rizs"]],
    ["quinoa", ["quinoa"]],
    ["millet", ["köles"]],
    ["buckwheat", ["hajdina"]],
    ["couscous", ["kuszkusz"]],
    ["bulgur", ["bulgur"]],
    ["sweetpotato", ["édesburgonya"]],
    ["potato", ["burgonya"]],
    ["pasta", ["durumtészta", "tészta"]],
    ["rice", ["főtt rizs", "rizs"]],
  ];

  for (const [group, needles] of groups) {
    if (needles.some((needle) => searchable.includes(needle))) {
      return group;
    }
  }

  return "other";
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

type ErrandAssistantResult = {
  service: string;
  dateText: string;
  timeText: string;
  question: string;
};

type ServiceProvider = {
  id: string;
  category: string;
  name: string;
  phone: string;
};

type AppointmentRequest = {
  id: string;
  provider_id: string | null;
  service: string;
  desired_date_text: string;
  desired_time_window: string;
  request_message: string;
  status: "draft" | "approved" | "sent" | "replied" | "confirmed" | "cancelled";
  created_at: string;
  provider_reply: string | null;
  confirmed_time_text: string | null;
};

function appointmentStatusLabel(status: AppointmentRequest["status"]) {
  switch (status) {
    case "draft":
      return "Piszkozat";
    case "approved":
      return "Jóváhagyva";
    case "sent":
      return "Elküldve";
    case "replied":
      return "Válasz érkezett";
    case "confirmed":
      return "Időpont lefoglalva";
    case "cancelled":
      return "Törölve";
  }
}

function appointmentStatusTone(status: AppointmentRequest["status"]) {
  switch (status) {
    case "confirmed":
      return { background: "rgba(88, 177, 133, 0.13)", color: "#34745a" };
    case "sent":
      return { background: "rgba(255, 181, 92, 0.15)", color: "#9a651f" };
    case "replied":
      return { background: "rgba(103, 142, 214, 0.13)", color: "#486aa3" };
    case "cancelled":
      return { background: "rgba(110, 110, 120, 0.10)", color: "#66616a" };
    case "draft":
      return { background: "rgba(122, 75, 157, 0.08)", color: "#755486" };
    case "approved":
    default:
      return { background: "rgba(154, 112, 219, 0.13)", color: "#6f3f8f" };
  }
}

type ErrandProviderChoice = "usual" | "other" | null;
type ErrandTimeSlot = "13:00–15:00" | "15:00–17:00" | "17:00 után" | "Mindegy";

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

// Előkészített alaplista a következő bevásárlólista-fejlesztési szelethez.
void createShoppingList;

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

  return ["Hétfő", "Kedd", "Szerda", "Csütörtök", "Péntek", "Szombat", "Vasárnap"].map(
    (day, index) => ({
      day,
      food: foodByGoal[index],
      movement: "",
      wellbeing: "",
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
      energyLevel: null,
      stressLevel: null,
      wellbeingNote: "",
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
      energyLevel:
        saved.energyLevel === "Alacsony" ||
        saved.energyLevel === "Közepes" ||
        saved.energyLevel === "Jó"
          ? saved.energyLevel
          : null,
      stressLevel:
        saved.stressLevel === "Alacsony" ||
        saved.stressLevel === "Közepes" ||
        saved.stressLevel === "Magas"
          ? saved.stressLevel
          : null,
      wellbeingNote:
        typeof saved.wellbeingNote === "string" ? saved.wellbeingNote : "",
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
      energyLevel: null,
      stressLevel: null,
      wellbeingNote: "",
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
  const serviceProviderStorageKey = `${SERVICE_PROVIDER_STORAGE_PREFIX}_${session?.user.id ?? "guest"}`;

  const initialChallenges = useMemo(
    () => loadChallengeProgress(challengeStorageKey),
    [challengeStorageKey],
  );
  const initialShopping = useMemo(
    () => loadShoppingState(shoppingStorageKey),
    [shoppingStorageKey],
  );

  const [view, setView] = useState<View>("today");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [meals, setMeals] = useState<Meal[]>(initial.meals);
  const [water, setWater] = useState(initial.water);
  const [movementDone, setMovementDone] = useState(initial.movementDone);
  const [mood, setMood] = useState(initial.mood);
  const [energyLevel, setEnergyLevel] = useState<"Alacsony" | "Közepes" | "Jó" | null>(
    initial.energyLevel ?? null,
  );
  const [stressLevel, setStressLevel] = useState<"Alacsony" | "Közepes" | "Magas" | null>(
    initial.stressLevel ?? null,
  );
  const [wellbeingNote, setWellbeingNote] = useState(initial.wellbeingNote ?? "");
  const [wellbeingTrend, setWellbeingTrend] = useState<
    Array<{ logged_on: string; mood: number; energy: number | null; stress: number | null }>
  >([]);
  const [waterTrend, setWaterTrend] = useState<
    Array<{ logged_on: string; amount_ml: number }>
  >([]);
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
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setRecipeRecommendationHistory(
        loadRecipeRecommendationHistory(recipeHistoryStorageKey),
      );
    });

    return () => {
      active = false;
    };
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
  const [errandRequest, setErrandRequest] = useState("");
  const [errandResult, setErrandResult] = useState<ErrandAssistantResult | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [serviceProvidersReady, setServiceProvidersReady] = useState(guestMode || !session);
  const [serviceProviderMessage, setServiceProviderMessage] = useState("");
  const [errandProviderChoice, setErrandProviderChoice] = useState<ErrandProviderChoice>(null);
  const [providerName, setProviderName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [errandConfirmation, setErrandConfirmation] = useState("");
  const [errandTimeSlot, setErrandTimeSlot] = useState<ErrandTimeSlot | null>(null);
  const [errandRequestApproved, setErrandRequestApproved] = useState(false);
  const [errandRequestSaving, setErrandRequestSaving] = useState(false);
  const [errandRequestSaveMessage, setErrandRequestSaveMessage] = useState("");
  const [appointmentRequests, setAppointmentRequests] = useState<AppointmentRequest[]>([]);
  const [appointmentRequestsLoading, setAppointmentRequestsLoading] = useState(false);
  const [appointmentRequestsMessage, setAppointmentRequestsMessage] = useState("");
  const [appointmentStatusSavingId, setAppointmentStatusSavingId] = useState<string | null>(null);
  const [expandedAppointmentRequests, setExpandedAppointmentRequests] = useState<Record<string, boolean>>({});
  const [appointmentReplyDrafts, setAppointmentReplyDrafts] = useState<Record<string, string>>({});
  const [appointmentConfirmedTimeDrafts, setAppointmentConfirmedTimeDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    async function loadServiceProviders() {
      setServiceProviderMessage("");

      if (guestMode || !session?.user) {
        if (typeof window === "undefined") return;

        try {
          const saved = JSON.parse(
            window.localStorage.getItem(serviceProviderStorageKey) ?? "[]",
          ) as ServiceProvider[];

          if (!active) return;
          setServiceProviders(Array.isArray(saved) ? saved : []);
          setServiceProvidersReady(true);
        } catch {
          if (!active) return;
          setServiceProviders([]);
          setServiceProvidersReady(true);
        }
        return;
      }

      setServiceProvidersReady(false);

      const result = await supabase
        .from("service_providers")
        .select("id, category, name, phone")
        .order("created_at", { ascending: true });

      if (!active) return;

      if (result.error) {
        setServiceProviders([]);
        setServiceProviderMessage("A mentett szolgáltatók betöltése nem sikerült.");
        setServiceProvidersReady(true);
        return;
      }

      let providers: ServiceProvider[] = (result.data ?? []).map((row) => ({
        id: row.id,
        category: row.category,
        name: row.name,
        phone: row.phone ?? "",
      }));

      // Egyszeri átállás: a korábban localStorage-ban elmentett szolgáltatókat
      // átvisszük Supabase-be, majd a bejelentkezett felhasználónál töröljük a helyi másolatot.
      if (typeof window !== "undefined") {
        try {
          const localProviders = JSON.parse(
            window.localStorage.getItem(serviceProviderStorageKey) ?? "[]",
          ) as ServiceProvider[];

          if (Array.isArray(localProviders) && localProviders.length > 0) {
            const migrationRows = localProviders
              .filter((provider) => provider.category && provider.name)
              .map((provider) => ({
                user_id: session.user.id,
                category: provider.category,
                name: provider.name,
                phone: provider.phone || null,
                is_favorite: true,
                updated_at: new Date().toISOString(),
              }));

            if (migrationRows.length > 0) {
              const migrationResult = await supabase
                .from("service_providers")
                .insert(migrationRows)
                .select("id, category, name, phone");

              if (!active) return;

              if (!migrationResult.error) {
                const migratedProviders = (migrationResult.data ?? []).map((row) => ({
                  id: row.id,
                  category: row.category,
                  name: row.name,
                  phone: row.phone ?? "",
                }));
                providers = [...providers, ...migratedProviders];
                window.localStorage.removeItem(serviceProviderStorageKey);
              }
            }
          }
        } catch {
          // A felhőbetöltés ettől még használható; a hibás helyi adatot egyszerűen figyelmen kívül hagyjuk.
        }
      }

      if (!active) return;
      setServiceProviders(providers);
      setServiceProvidersReady(true);
    }

    void loadServiceProviders();

    return () => {
      active = false;
    };
  }, [guestMode, serviceProviderStorageKey, session?.user]);

  useEffect(() => {
    let active = true;

    async function loadAppointmentRequests() {
      if (guestMode || !session?.user) {
        setAppointmentRequests([]);
        setAppointmentRequestsLoading(false);
        setAppointmentRequestsMessage("");
        return;
      }

      setAppointmentRequestsLoading(true);
      setAppointmentRequestsMessage("");

      const result = await supabase
        .from("appointment_requests")
        .select("id, provider_id, service, desired_date_text, desired_time_window, request_message, status, created_at, provider_reply, confirmed_time_text")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!active) return;

      setAppointmentRequestsLoading(false);

      if (result.error) {
        setAppointmentRequests([]);
        setAppointmentRequestsMessage("Az intézendő kérések betöltése nem sikerült.");
        return;
      }

      setAppointmentRequests((result.data ?? []) as AppointmentRequest[]);
    }

    void loadAppointmentRequests();

    return () => {
      active = false;
    };
  }, [guestMode, session?.user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const currentHour = now.getHours();
  const currentDateKey = localDateKey(now);
  const tomorrowDateKey = nextLocalDateKey(now);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      const saved = loadAssistantPlan(assistantPlanStorageKey);

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
        saved.tomorrowDate === tomorrowDateKey
          ? saved.tomorrowStart ?? null
          : null,
      );
    });

    return () => {
      active = false;
    };
  }, [assistantPlanStorageKey, currentDateKey, tomorrowDateKey]);

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

  function handleErrandRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const request = errandRequest.trim();
    if (!request) return;

    const normalized = request.toLocaleLowerCase("hu");

    const service = normalized.includes("fodrász")
      ? "Fodrász"
      : normalized.includes("körm")
        ? "Körmös"
        : normalized.includes("kozmetik")
          ? "Kozmetikus"
          : normalized.includes("massz")
            ? "Masszázs"
            : normalized.includes("étter")
              ? "Étterem"
              : normalized.includes("szerviz")
                ? "Szerviz"
                : "Időpont / ügyintézés";

    const weekdays = [
      ["hétf", "hétfő"],
      ["kedd", "kedd"],
      ["szerda", "szerda"],
      ["csütört", "csütörtök"],
      ["péntek", "péntek"],
      ["szombat", "szombat"],
      ["vasárnap", "vasárnap"],
    ] as const;

    const weekday = weekdays.find(([needle]) => normalized.includes(needle))?.[1];

    let dateText = "Időpont még nincs megadva";
    if (normalized.includes("holnap")) {
      dateText = "Holnap";
    } else if (normalized.includes("jövő hét") || normalized.includes("jövőheti")) {
      dateText = weekday ? `Jövő hét · ${weekday}` : "Jövő hét";
    } else if (weekday) {
      dateText = weekday.charAt(0).toLocaleUpperCase("hu") + weekday.slice(1);
    }

    const timeText = normalized.includes("reggel")
      ? "Reggel"
      : normalized.includes("délelőtt")
        ? "Délelőtt"
        : normalized.includes("délután")
          ? "Délután"
          : normalized.includes("este")
            ? "Este"
            : "Napszak még nincs megadva";

    const question =
      service === "Fodrász"
        ? "A megszokott fodrászodhoz szeretnél menni?"
        : service === "Szerviz"
          ? "A megszokott autószervizedhez szeretnél menni?"
          : service === "Időpont / ügyintézés"
            ? "Jól értem, hogy ehhez szeretnél időpontot vagy egyeztetést intézni?"
            : `A megszokott ${service.toLocaleLowerCase("hu")} szolgáltatódhoz szeretnél menni?`;

    setErrandResult({ service, dateText, timeText, question });
    setErrandProviderChoice(null);
    setProviderName("");
    setProviderPhone("");
    setSelectedProviderId(null);
    setErrandConfirmation("");
    setErrandTimeSlot(null);
    setErrandRequestApproved(false);
  }

  function chooseErrandProvider(choice: Exclude<ErrandProviderChoice, null>) {
    setErrandProviderChoice(choice);
    setSelectedProviderId(null);
    setErrandConfirmation("");
    setErrandTimeSlot(null);
    setErrandRequestApproved(false);
    setProviderName("");
    setProviderPhone("");
  }

  function selectSavedErrandProvider(provider: ServiceProvider) {
    if (!errandResult) return;

    setErrandProviderChoice("usual");
    setSelectedProviderId(provider.id);
    setProviderName(provider.name);
    setProviderPhone(provider.phone);
    setErrandConfirmation(
      `Rendben. ${provider.name} szolgáltatóhoz szeretnél időpontot ${errandResult.dateText.toLocaleLowerCase("hu")} ${errandResult.timeText.toLocaleLowerCase("hu")}.`,
    );
    setErrandTimeSlot(null);
    setErrandRequestApproved(false);
  }

  async function saveErrandProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!errandResult) return;

    const name = providerName.trim();
    const phone = providerPhone.trim();
    if (!name || !phone) return;

    setServiceProviderMessage("");

    if (guestMode || !session?.user) {
      const provider: ServiceProvider = {
        id: `${errandResult.service.toLocaleLowerCase("hu")}-${Date.now()}`,
        category: errandResult.service,
        name,
        phone,
      };

      const next = [...serviceProviders, provider];

      setServiceProviders(next);
      setSelectedProviderId(provider.id);
      window.localStorage.setItem(serviceProviderStorageKey, JSON.stringify(next));
      setErrandConfirmation(
        `Rendben. ${name} szolgáltatóhoz szeretnél időpontot ${errandResult.dateText.toLocaleLowerCase("hu")} ${errandResult.timeText.toLocaleLowerCase("hu")}.`,
      );
      return;
    }

    const result = await supabase
      .from("service_providers")
      .insert({
        user_id: session.user.id,
        category: errandResult.service,
        name,
        phone,
        is_favorite: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, category, name, phone")
      .single();

    if (result.error || !result.data) {
      setServiceProviderMessage("A szolgáltató mentése nem sikerült. Próbáld újra.");
      return;
    }

    const savedProvider: ServiceProvider = {
      id: result.data.id,
      category: result.data.category,
      name: result.data.name,
      phone: result.data.phone ?? "",
    };

    setServiceProviders((current) => [...current, savedProvider]);
    setSelectedProviderId(savedProvider.id);
    setErrandConfirmation(
      `Rendben. ${name} szolgáltatóhoz szeretnél időpontot ${errandResult.dateText.toLocaleLowerCase("hu")} ${errandResult.timeText.toLocaleLowerCase("hu")}.`,
    );
  }

  function chooseErrandTimeSlot(slot: ErrandTimeSlot) {
    setErrandTimeSlot(slot);
    setErrandRequestApproved(false);
    setErrandRequestSaveMessage("");
  }

  function buildErrandMessage() {
    if (!errandResult || !errandTimeSlot) return "";

    const date = errandResult.dateText.toLocaleLowerCase("hu");
    const time = errandTimeSlot === "Mindegy"
      ? "bármely megfelelő időpontban"
      : errandTimeSlot === "17:00 után"
        ? "17 óra után"
        : `${errandTimeSlot.replace("–", " és ")} között`;

    return `Szia! Szeretnék időpontot kérni ${date}, lehetőleg ${time}. Van esetleg szabad időpontod?`;
  }

  async function approveErrandRequest() {
    if (!errandResult || !errandTimeSlot || !providerName.trim()) return;

    setErrandRequestSaving(true);
    setErrandRequestSaveMessage("");

    if (guestMode || !session) {
      setErrandRequestApproved(true);
      setErrandRequestSaving(false);
      setErrandRequestSaveMessage(
        "Vendég módban a kérés csak ezen az eszközön használható. Bejelentkezve a Zenvyra a felhőbe is elmenti.",
      );
      return;
    }

    const provider = serviceProviders.find(
      (item) => item.id === selectedProviderId,
    ) ?? serviceProviders.find(
      (item) =>
        item.category === errandResult.service &&
        item.name === providerName.trim(),
    );

    const result = await supabase
      .from("appointment_requests")
      .insert({
        user_id: session.user.id,
        provider_id: provider?.id ?? null,
        service: errandResult.service,
        desired_date_text: errandResult.dateText,
        desired_time_window: errandTimeSlot,
        request_message: buildErrandMessage(),
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .select("id, provider_id, service, desired_date_text, desired_time_window, request_message, status, created_at, provider_reply, confirmed_time_text")
      .single();

    setErrandRequestSaving(false);

    if (result.error || !result.data) {
      setErrandRequestSaveMessage(
        "A kérés mentése nem sikerült. Próbáld újra.",
      );
      return;
    }

    setAppointmentRequests((current) => [
      result.data as AppointmentRequest,
      ...current.filter((item) => item.id !== result.data.id),
    ].slice(0, 5));
    setErrandRequestApproved(true);
    setErrandRequestSaveMessage(
      "✓ Elmentve a Zenvyra intézendő kérései közé.",
    );
  }

  function openAppointmentSms(request: AppointmentRequest) {
    const provider = serviceProviders.find((item) => item.id === request.provider_id);
    const phone = provider?.phone?.trim();

    if (!phone) {
      setAppointmentRequestsMessage(
        "Ehhez a szolgáltatóhoz nincs mentett telefonszám. Előbb add meg a telefonszámát.",
      );
      return;
    }

    const message = request.request_message?.trim();
    if (!message) {
      setAppointmentRequestsMessage(
        "Ehhez a kéréshez nincs elkészített üzenet.",
      );
      return;
    }

    setAppointmentRequestsMessage("");
    window.location.href = `sms:${phone}?body=${encodeURIComponent(message)}`;
  }

  async function advanceAppointmentRequestStatus(request: AppointmentRequest) {
    if (guestMode || !session?.user) return;

    const nextStatus: Partial<Record<AppointmentRequest["status"], AppointmentRequest["status"]>> = {
      approved: "sent",
      sent: "replied",
      replied: "confirmed",
    };

    const status = nextStatus[request.status];
    if (!status) return;

    setAppointmentStatusSavingId(request.id);
    setAppointmentRequestsMessage("");

    const result = await supabase
      .from("appointment_requests")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("user_id", session.user.id)
      .select("id, provider_id, service, desired_date_text, desired_time_window, request_message, status, created_at, provider_reply, confirmed_time_text")
      .single();

    setAppointmentStatusSavingId(null);

    if (result.error || !result.data) {
      setAppointmentRequestsMessage("A státusz frissítése nem sikerült. Próbáld újra.");
      return;
    }

    setAppointmentRequests((current) =>
      current.map((item) =>
        item.id === request.id ? (result.data as AppointmentRequest) : item,
      ),
    );
  }

  async function saveAppointmentReply(request: AppointmentRequest) {
    if (guestMode || !session?.user) return;

    const reply = (appointmentReplyDrafts[request.id] ?? request.provider_reply ?? "").trim();
    if (!reply) {
      setAppointmentRequestsMessage("Írd be röviden, mit válaszolt a szolgáltató.");
      return;
    }

    setAppointmentStatusSavingId(request.id);
    setAppointmentRequestsMessage("");

    const result = await supabase
      .from("appointment_requests")
      .update({
        provider_reply: reply,
        status: "replied",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("user_id", session.user.id)
      .select("id, provider_id, service, desired_date_text, desired_time_window, request_message, status, created_at, provider_reply, confirmed_time_text")
      .single();

    setAppointmentStatusSavingId(null);

    if (result.error || !result.data) {
      setAppointmentRequestsMessage("A válasz mentése nem sikerült. Próbáld újra.");
      return;
    }

    setAppointmentRequests((current) =>
      current.map((item) => item.id === request.id ? (result.data as AppointmentRequest) : item),
    );
  }

  function resolveAppointmentStart(request: AppointmentRequest) {
    const timeMatch = request.confirmed_time_text?.trim().match(/^(\d{1,2})[:.](\d{2})/);
    if (!timeMatch) return null;

    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }

    const reference = new Date(request.created_at);
    if (Number.isNaN(reference.getTime())) return null;

    const dateText = request.desired_date_text.toLocaleLowerCase("hu");
    const target = new Date(reference);
    target.setSeconds(0, 0);

    const weekdayIndexes: Array<[string, number]> = [
      ["hétfő", 1],
      ["kedd", 2],
      ["szerda", 3],
      ["csütörtök", 4],
      ["péntek", 5],
      ["szombat", 6],
      ["vasárnap", 0],
    ];
    const weekday = weekdayIndexes.find(([label]) => dateText.includes(label));

    if (dateText.includes("holnap")) {
      target.setDate(target.getDate() + 1);
    } else if (dateText.includes("jövő hét")) {
      const currentDay = reference.getDay();
      const daysSinceMonday = currentDay === 0 ? 6 : currentDay - 1;
      target.setDate(reference.getDate() - daysSinceMonday + 7);
      if (weekday) {
        const mondayBasedOffset = weekday[1] === 0 ? 6 : weekday[1] - 1;
        target.setDate(target.getDate() + mondayBasedOffset);
      }
    } else if (weekday) {
      const currentDay = reference.getDay();
      let delta = (weekday[1] - currentDay + 7) % 7;
      if (delta === 0) delta = 0;
      target.setDate(reference.getDate() + delta);
    } else {
      return null;
    }

    target.setHours(hour, minute, 0, 0);
    return target;
  }

  function formatCalendarDate(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
  }

  function openAppointmentCalendar(request: AppointmentRequest) {
    const start = resolveAppointmentStart(request);
    if (!start) {
      setAppointmentRequestsMessage(
        "A naptárhoz pontos idő kell, például 16:30, és felismerhető nap, például Holnap vagy Jövő hét · kedd.",
      );
      return;
    }

    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const provider = serviceProviders.find((item) => item.id === request.provider_id);
    const title = `${request.service}${provider?.name ? ` · ${provider.name}` : ""}`;
    const details = [
      "Zenvyra által előkészített és visszaigazolt időpont.",
      request.provider_reply ? `Szolgáltató válasza: ${request.provider_reply}` : "",
    ].filter(Boolean).join("\n\n");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Budapest";

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${formatCalendarDate(start)}/${formatCalendarDate(end)}`,
      details,
      ctz: timezone,
    });

    setAppointmentRequestsMessage("");
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  async function confirmAppointmentTime(request: AppointmentRequest) {
    if (guestMode || !session?.user) return;

    const confirmedTime = (appointmentConfirmedTimeDrafts[request.id] ?? request.confirmed_time_text ?? "").trim();
    if (!confirmedTime) {
      setAppointmentRequestsMessage("Add meg a visszaigazolt pontos időpontot, például: 16:30.");
      return;
    }

    setAppointmentStatusSavingId(request.id);
    setAppointmentRequestsMessage("");

    const result = await supabase
      .from("appointment_requests")
      .update({
        confirmed_time_text: confirmedTime,
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", request.id)
      .eq("user_id", session.user.id)
      .select("id, provider_id, service, desired_date_text, desired_time_window, request_message, status, created_at, provider_reply, confirmed_time_text")
      .single();

    setAppointmentStatusSavingId(null);

    if (result.error || !result.data) {
      setAppointmentRequestsMessage("Az időpont rögzítése nem sikerült. Próbáld újra.");
      return;
    }

    setAppointmentRequests((current) =>
      current.map((item) => item.id === request.id ? (result.data as AppointmentRequest) : item),
    );
  }

  const matchingServiceProviders = errandResult
    ? serviceProviders.filter((provider) => provider.category === errandResult.service)
    : [];

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
  type ZenvyraRhythm =
    | "recovery"
    | "rebuild"
    | "balanced"
    | "progress";

  const zenvyraState = useMemo(() => {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const movementCutoff = new Date(today);
    movementCutoff.setDate(movementCutoff.getDate() - 13);
    const movementCutoffKey = localDateKey(movementCutoff);

    const recentMovement = movementHistory.filter(
      (entry) => entry.date >= movementCutoffKey,
    );
    const recentMovementDays = new Set(
      recentMovement.map((entry) => entry.date),
    ).size;
    const recentMovementMinutes = recentMovement.reduce(
      (sum, entry) => sum + entry.minutes,
      0,
    );

    const preferredMinutes = Math.max(10, preferences.workout_minutes);
    const lowEnergy = energyLevel === "Alacsony";
    const lowMood = mood <= 2;
    const highStress = stressLevel === "Magas";

    const wellbeingByDay = new Map<
      string,
      { mood: number; energy: number | null; stress: number | null }
    >();

    wellbeingTrend.forEach((entry) => {
      wellbeingByDay.set(entry.logged_on, {
        mood: entry.mood,
        energy: entry.energy,
        stress: entry.stress,
      });
    });

    const wellbeingDays = Array.from(wellbeingByDay.values());

    const energyValues = wellbeingDays
      .map((entry) => entry.energy)
      .filter((value): value is number => value !== null);
    const moodValues = wellbeingDays.map((entry) => entry.mood);
    const stressValues = wellbeingDays
      .map((entry) => entry.stress)
      .filter((value): value is number => value !== null);

    const average = (values: number[]) =>
      values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : null;

    const averageEnergy = average(energyValues);
    const averageMood = average(moodValues);
    const averageStress = average(stressValues);

    const waterByDay = waterTrend.reduce<Record<string, number>>((days, entry) => {
      days[entry.logged_on] = (days[entry.logged_on] ?? 0) + entry.amount_ml;
      return days;
    }, {});
    const waterDays = Object.values(waterByDay);
    const averageWater = average(waterDays);

    const persistentLowEnergy =
      energyValues.length >= 3 &&
      averageEnergy !== null &&
      averageEnergy <= 2.4;
    const persistentLowMood =
      moodValues.length >= 3 &&
      averageMood !== null &&
      averageMood <= 2.6;
    const persistentHighStress =
      stressValues.length >= 3 &&
      averageStress !== null &&
      averageStress >= 3.8;

    const hydrationNeedsAttention =
      waterDays.length >= 3 && averageWater !== null
        ? averageWater < 1400
        : water < 1400;

    let rhythm: ZenvyraRhythm = "balanced";

    if (persistentLowEnergy || persistentLowMood || persistentHighStress) {
      rhythm = "recovery";
    } else if (lowEnergy || lowMood || highStress) {
      rhythm = "rebuild";
    } else if (
      recentMovementDays <= 2 ||
      recentMovementMinutes < preferredMinutes * 2
    ) {
      rhythm = "rebuild";
    } else if (
      recentMovementDays >= 4 &&
      recentMovementMinutes >= preferredMinutes * 3 &&
      (averageEnergy === null || averageEnergy >= 3.4)
    ) {
      rhythm = "progress";
    }

    const movementMinutes =
      rhythm === "recovery"
        ? Math.min(preferredMinutes, 20)
        : rhythm === "rebuild"
          ? Math.min(preferredMinutes, 25)
          : preferredMinutes;

    const movementIntensity =
      rhythm === "recovery"
        ? "kímélő"
        : rhythm === "rebuild"
          ? "könnyen tartható"
          : preferences.fitness_level === "advanced"
            ? "lendületes"
            : preferences.fitness_level === "intermediate"
              ? "közepes intenzitású"
              : "kímélő";

    const focus =
      rhythm === "recovery"
        ? "regeneration"
        : hydrationNeedsAttention
          ? "hydration"
          : rhythm === "rebuild"
            ? "rhythm"
            : rhythm === "progress"
              ? "progress"
              : "balance";

    return {
      rhythm,
      focus,
      lowEnergy,
      lowMood,
      highStress,
      hydrationNeedsAttention,
      recentMovementDays,
      recentMovementMinutes,
      movementMinutes,
      movementIntensity,
      averageEnergy,
      averageMood,
      averageStress,
      averageWater,
      wellbeingDayCount: wellbeingDays.length,
      waterDayCount: waterDays.length,
      persistentLowEnergy,
      persistentLowMood,
      persistentHighStress,
    };
  }, [
    movementHistory,
    preferences.workout_minutes,
    preferences.fitness_level,
    energyLevel,
    mood,
    stressLevel,
    water,
    wellbeingTrend,
    waterTrend,
  ]);


  const zenvyraTrendExplanation = useMemo(() => {
    const movementDays = zenvyraState.recentMovementDays;

    if (zenvyraState.persistentLowEnergy) {
      return "Az elmúlt napokban alacsonyabb volt az energiaszinted, ezért most kímélőbb ritmust javaslok.";
    }

    if (zenvyraState.persistentHighStress) {
      return "Az elmúlt napokban magasabb volt a stressz-szinted, ezért most több regenerálódást építek a tervbe.";
    }

    if (zenvyraState.persistentLowMood) {
      return "A közérzeted az elmúlt napokban gyengébb volt, ezért most könnyebben teljesíthető lépéseket kapsz.";
    }

    if (
      zenvyraState.averageWater !== null &&
      zenvyraState.waterDayCount >= 3 &&
      zenvyraState.averageWater < 1400
    ) {
      return "Az elmúlt napokban kevés folyadékot rögzítettél, ezért most a hidratálás is előrébb került.";
    }

    if (zenvyraState.rhythm === "progress" && movementDays >= 4) {
      return "Jól tartod a mozgási ritmusodat, ezért a rendszer már óvatosan a fejlődés felé tud lépni.";
    }

    if (zenvyraState.rhythm === "rebuild" && movementDays <= 2) {
      return "Most még a rendszeres ritmus visszaépítése a fontosabb, nem az intenzitás növelése.";
    }

    if (
      zenvyraState.wellbeingDayCount < 3 &&
      zenvyraState.waterDayCount < 3 &&
      movementDays < 3
    ) {
      return "Még gyűjtöm a mintát. Néhány nap után a javaslatok egyre inkább a saját ritmusodhoz igazodnak.";
    }

    return "A jelenlegi közérzeted és az elmúlt napok mintája alapján most az egyensúly megtartása a legjobb irány.";
  }, [zenvyraState]);


  const weeklyPlan = useMemo(() => {
    const basePlan = createWeeklyPlan(profile?.goal ?? null);

    return basePlan.map((item, index) => {
      const isRecoveryDay = index === 3 || index === 6;

      let movement: string;

      if (zenvyraState.rhythm === "recovery") {
        movement = isRecoveryDay
          ? "Pihenőnap vagy 10 perc könnyű nyújtás"
          : `${zenvyraState.movementMinutes} perc kímélő séta vagy átmozgatás`;
      } else if (zenvyraState.rhythm === "rebuild") {
        movement = isRecoveryDay
          ? "Pihenő vagy 10–15 perc mobilizálás"
          : `${zenvyraState.movementMinutes} perc könnyen tartható mozgás`;
      } else {
        movement = isRecoveryDay
          ? "Regeneráló nap · könnyű séta vagy nyújtás"
          : `${zenvyraState.movementMinutes} perc ${zenvyraState.movementIntensity} mozgás`;
      }

      let wellbeing: string;

      if (zenvyraState.rhythm === "recovery") {
        wellbeing =
          index % 2 === 0
            ? "Tervezz ma egy rövid pihenőt is"
            : "Hagyj időt a regenerálódásra, és tarts könnyen teljesíthető ritmust";
      } else if (zenvyraState.hydrationNeedsAttention) {
        wellbeing =
          index % 2 === 0
            ? "Legyen kéznél víz, és kortyolj rendszeresen"
            : "Kapcsolj egy pohár vizet egy meglévő napi rutinhoz";
      } else if (zenvyraState.rhythm === "progress") {
        wellbeing =
          index % 3 === 0
            ? "Tarts meg egy nyugodt pihenőidőt is"
            : index % 3 === 1
              ? "Vedd észre, mi adott ma energiát"
              : "A regenerálódás is része a fejlődésnek";
      } else if (zenvyraState.rhythm === "rebuild") {
        wellbeing =
          index % 2 === 0
            ? "Most a könnyen tartható napi ritmus a fontos"
            : "Elég egy-két stabil kapaszkodót megtartanod";
      } else {
        wellbeing =
          index % 2 === 0
            ? "Tarts meg egy nyugodt, jól tartható napi ritmust"
            : "Figyeld, mi segít megtartani az egyensúlyodat";
      }

      return {
        ...item,
        movement,
        wellbeing,
      };
    });
  }, [profile?.goal, zenvyraState]);
  const todayPlanIndex = useMemo(() => (new Date().getDay() + 6) % 7, []);
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
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSavedRecipes(ensureStarterRecipes(recipeStorageKey));
    });

    return () => {
      active = false;
    };
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
      energyLevel,
      stressLevel,
      wellbeingNote,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  }, [
    guestMode,
    meals,
    water,
    movementDone,
    mood,
    weight,
    weightHistory,
    movementHistory,
    energyLevel,
    stressLevel,
    wellbeingNote,
  ]);

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

      const [
        mealsResult,
        waterResult,
        weightResult,
        wellbeingResult,
        movementResult,
        wellbeingTrendResult,
        waterTrendResult,
      ] = await Promise.all([
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
            .select("mood, energy, stress, note")
            .eq("logged_on", today)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase
            .from("movement_logs")
            .select("id, title, minutes, completed, logged_on, created_at")
            .gte("logged_on", sevenDaysAgo)
            .order("logged_on", { ascending: true })
            .order("created_at", { ascending: true }),
          supabase
            .from("wellbeing_logs")
            .select("logged_on, mood, energy, stress")
            .gte("logged_on", sevenDaysAgo)
            .order("logged_on", { ascending: true }),
          supabase
            .from("water_logs")
            .select("logged_on, amount_ml")
            .gte("logged_on", sevenDaysAgo)
            .order("logged_on", { ascending: true }),
        ]);

      if (!active) return;

      const firstError =
        mealsResult.error ||
        waterResult.error ||
        weightResult.error ||
        wellbeingResult.error ||
        movementResult.error ||
        wellbeingTrendResult.error ||
        waterTrendResult.error;

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
        const latestWellbeing = wellbeingResult.data[0];
        setMood(Number(latestWellbeing.mood));

        setEnergyLevel(
          latestWellbeing.energy === 1
            ? "Alacsony"
            : latestWellbeing.energy === 3
              ? "Közepes"
              : latestWellbeing.energy === 5
                ? "Jó"
                : null,
        );

        setStressLevel(
          latestWellbeing.stress === 1
            ? "Alacsony"
            : latestWellbeing.stress === 3
              ? "Közepes"
              : latestWellbeing.stress === 5
                ? "Magas"
                : null,
        );

        setWellbeingNote(latestWellbeing.note ?? "");
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

      setWellbeingTrend(
        (wellbeingTrendResult.data ?? []).map((entry) => ({
          logged_on: entry.logged_on,
          mood: Number(entry.mood),
          energy: entry.energy == null ? null : Number(entry.energy),
          stress: entry.stress == null ? null : Number(entry.stress),
        })),
      );

      setWaterTrend(
        (waterTrendResult.data ?? []).map((entry) => ({
          logged_on: entry.logged_on,
          amount_ml: Number(entry.amount_ml),
        })),
      );

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

  const todayMealPlan = useMemo(() => {
    const canonicalMealTypes = ["Reggeli", "Ebéd", "Vacsora", "Kisétkezés"] as const;

    const existingByType = new Map(
      canonicalMealTypes.map((type) => [
        type,
        meals.find((meal) => meal.type === type) ?? null,
      ]),
    );

    const committedTotals = meals.reduce(
      (sum, meal) => ({
        kcal: sum.kcal + meal.kcal,
        protein: sum.protein + meal.protein,
        carbs: sum.carbs + meal.carbs,
        fat: sum.fat + meal.fat,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );

    const openItems = fullDayMenu.filter(
      (item) => !existingByType.get(item.type),
    );

    const baseSuggestedKcal = openItems.reduce(
      (sum, item) => sum + (item.recommendation?.kcal ?? 0),
      0,
    );

    const remainingCalories = Math.max(0, dailyGoal - committedTotals.kcal);
    const scale =
      baseSuggestedKcal > 0
        ? Math.max(0.75, Math.min(1.25, remainingCalories / baseSuggestedKcal))
        : 1;

    return fullDayMenu.map((item) => {
      const existing = existingByType.get(item.type);

      if (existing) {
        return {
          ...item,
          existing,
          recommendation: null,
        };
      }

      if (!item.recommendation) {
        return {
          ...item,
          existing: null,
          recommendation: null,
        };
      }

      const recipe = item.recommendation.recipe;
      const servings = Math.max(1, recipe.servings);
      const portions = Math.max(
        0.5,
        Math.min(
          1.5,
          Math.round(item.recommendation.portions * scale * 4) / 4,
        ),
      );

      return {
        ...item,
        existing: null,
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
  }, [dailyGoal, fullDayMenu, meals]);

  const todayMealPlanSummary = useMemo(() => {
    const consumed = meals.filter((meal) => meal.consumed);
    const planned = meals.filter((meal) => !meal.consumed);
    const remainingCalories = Math.max(0, dailyGoal - totals.kcal);

    if (consumed.length === 0 && planned.length === 0) {
      return `A mai tervet a ${dailyGoal} kcal-os célodhoz és a személyes szűrőidhez igazítottam.`;
    }

    if (remainingCalories <= 150) {
      return "A mai energiakereted nagy része már összeállt. Nem kell újabb étkezést csak a számok miatt hozzáadnod.";
    }

    if (consumed.length > 0) {
      return `${totals.kcal} kcal-t már elfogyasztottként rögzítettél. A hátralévő ajánlásokat a még fennmaradó kb. ${remainingCalories} kcal-hoz igazítom.`;
    }

    return "Van már tervezett étkezésed. A még üres étkezési helyeket ezekhez és a napi célodhoz igazítom.";
  }, [dailyGoal, meals, totals.kcal]);

  async function addTodayMealPlanItem(
    item: (typeof todayMealPlan)[number],
  ) {
    if (!item.recommendation) return;

    await addRecipeToMeals(
      item.recommendation.recipe,
      item.recommendation.portions,
      item.type,
    );
  }


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
    const baseCounts = new Map<string, number>();
    let previousProtein: string | null = null;
    let previousBase: string | null = null;

    return weeklyPlan.map((day, dayIndex) => {
      const availableCandidates = orderedCandidates.filter((item) =>
        unusedRecipeIds.has(item.recipe.id),
      );

      // Heti fehérje- és köretrotáció:
      // 1) lehetőleg se ugyanaz a fehérje, se ugyanaz a köret ne jöjjön két egymást követő napon,
      // 2) ugyanaz a fehérjeforrás legfeljebb kétszer szerepeljen a héten,
      // 3) egy felismerhető köret lehetőleg csak egyszer szerepeljen a héten,
      // 4) ha a személyes szűrések miatt ez nem tartható, fokozatosan lazítunk.
      const strongestCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        const baseGroup = recipeBaseGroup(item.recipe);
        const proteinCount = proteinCounts.get(proteinGroup) ?? 0;
        const baseCount = baseCounts.get(baseGroup) ?? 0;

        return (
          proteinGroup !== previousProtein &&
          baseGroup !== previousBase &&
          proteinCount < WEEKLY_PROTEIN_MAX &&
          (baseGroup === "other" || baseCount < WEEKLY_BASE_MAX)
        );
      });

      const freshBaseCandidates = availableCandidates.filter((item) => {
        const baseGroup = recipeBaseGroup(item.recipe);
        return (
          baseGroup !== previousBase &&
          (baseGroup === "other" ||
            (baseCounts.get(baseGroup) ?? 0) < WEEKLY_BASE_MAX)
        );
      });

      const differentProteinCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        const baseGroup = recipeBaseGroup(item.recipe);
        return proteinGroup !== previousProtein && baseGroup !== previousBase;
      });

      const withinWeeklyMaxCandidates = availableCandidates.filter((item) => {
        const proteinGroup = recipeProteinGroup(item.recipe);
        return (proteinCounts.get(proteinGroup) ?? 0) < WEEKLY_PROTEIN_MAX;
      });

      const candidatePool =
        strongestCandidates.length > 0
          ? strongestCandidates
          : freshBaseCandidates.length > 0
            ? freshBaseCandidates
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

      const selectedBase = recipeBaseGroup(selected.recipe);
      if (selectedBase !== "other") {
        baseCounts.set(
          selectedBase,
          (baseCounts.get(selectedBase) ?? 0) + 1,
        );
      }
      previousBase = selectedBase;

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

    let active = true;
    queueMicrotask(() => {
      if (!active) return;
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
    });

    return () => {
      active = false;
    };
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

  const calorieRatio = dailyGoal > 0 ? totals.kcal / dailyGoal : 0;
  const isLateEvening = currentHour >= 20 || currentHour < 6;
  const isLowWellbeing = zenvyraState.rhythm === "recovery";
  const needsWater =
    zenvyraState.hydrationNeedsAttention ||
    (currentHour >= 17 && water < 1600);

  type TodayNextStepKind = "rest" | "water" | "meal" | "recipe" | "movement" | "done";

  const dayPhase =
    currentHour < 11
      ? "morning"
      : currentHour < 17
        ? "afternoon"
        : currentHour < 20
          ? "evening"
          : "late";

  const todayNextStep: {
    kind: TodayNextStepKind;
    text: string;
    buttonLabel: string | null;
  } = (() => {
    if (isLowWellbeing) {
      const wellbeingText =
        dayPhase === "morning"
          ? "Indulj ma kímélőbben. A közérzeted alapján most egy nyugodtabb reggel többet adhat, mint ha rögtön mindent bepótolnál."
          : dayPhase === "afternoon"
            ? "Most érdemes egy kicsit visszavenni a tempóból. A közérzeted alapján egy rövid pihenő jobb következő lépés lehet."
            : dayPhase === "evening"
              ? "Az estét már ne terheld túl. A közérzeted alapján inkább válassz valami nyugodt, regeneráló programot."
              : "Ma inkább a pihenés legyen az első. Most már nem kell semmit behoznod — zárd nyugodtan a napot.";

      return {
        kind: "rest",
        text: wellbeingText,
        buttonLabel: "Közérzet megnyitása →",
      };
    }

    if (isLateEvening) {
      if (water < 1400) {
        return {
          kind: "water",
          text: "Késő van, ezért már nem küldelek edzeni. Ha jól esik, igyál még egy pohár vizet, aztán jöhet a pihenés.",
          buttonLabel: "Víz hozzáadása →",
        };
      }

      if (calorieRatio < 0.7 && consumedMealCount > 0) {
        return {
          kind: "meal",
          text: "A mai energiabeviteled még alacsony. Ha valóban éhes vagy, válassz egy könnyű esti étkezést; ha nem, nem kell csak a számok miatt enned.",
          buttonLabel: "Mai étkezések →",
        };
      }

      return {
        kind: "done",
        text: "Mára rendben vagy. Most már a pihenés a következő jó lépés — holnap innen folytatjuk.",
        buttonLabel: null,
      };
    }

    if (needsWater) {
      const waterText =
        dayPhase === "morning"
          ? `A reggelt érdemes folyadékkal is elindítani. Ma eddig ${water} ml vizet rögzítettél — jöhet egy pohár víz.`
          : dayPhase === "afternoon"
            ? `Délutánra jól jön egy kis frissítés. Ma eddig ${water} ml vizet rögzítettél — igyál meg most egy pohárral.`
            : `Mielőtt belekezdesz az estébe, pótolj egy kis folyadékot. Ma eddig ${water} ml vizet rögzítettél.`;

      return {
        kind: "water",
        text: waterText,
        buttonLabel: "Víz hozzáadása →",
      };
    }

    if (nextPlannedMeal && (isLunchPhase || isDinnerPhase || calorieRatio < 0.65)) {
      const mealText =
        dayPhase === "morning"
          ? `${nextPlannedMeal.type} lesz a következő étkezésed. Már el van tervezve, így most csak haladj nyugodtan a reggeleddel.`
          : dayPhase === "afternoon"
            ? `${nextPlannedMeal.type} következik. Már megvan a terv, csak akkor jelöld elfogyasztottnak, amikor valóban megetted.`
            : `${nextPlannedMeal.type} következik. Az estére már megvan a következő lépés, nem kell újra kitalálnod.`;

      return {
        kind: "meal",
        text: mealText,
        buttonLabel: "Mai étkezések →",
      };
    }

    if (consumedMealCount === 0) {
      const recipeText =
        dayPhase === "morning"
          ? "Indítsd a napot egy hozzád illő étkezéssel. Nem kell az egész napot egyszerre megtervezned."
          : dayPhase === "afternoon"
            ? "Még nincs mai étkezés rögzítve. Válassz most egy egyszerű, hozzád illő étkezést, és innen haladunk tovább."
            : "Ha még nem rögzítettél étkezést, most elég egy könnyen vállalható választás. Nem kell tökéletes napot építeni.";

      return {
        kind: "recipe",
        text: recipeText,
        buttonLabel: dailyRecipeRecommendation
          ? "Ajánlott étkezés hozzáadása →"
          : "Receptek megnyitása →",
      };
    }

    if (!movementDone && currentHour >= 8 && currentHour < 19) {
      const movementText =
        dayPhase === "morning"
          ? `Ha jól esne egy kis lendület, most beleférhet egy ${zenvyraState.movementMinutes} perces, hozzád igazított mozgás.`
          : dayPhase === "afternoon"
            ? `${consumedMealCount} étkezést már rögzítettél. Egy ${zenvyraState.movementMinutes} perces mozgás most jó kis váltás lehet a nap közepén.`
            : `Még belefér egy könnyű ${zenvyraState.movementMinutes} perces mozgás, de csak akkor, ha van hozzá energiád.`;

      return {
        kind: "movement",
        text: movementText,
        buttonLabel: "Mozgás megnyitása →",
      };
    }

    if (nextPlannedMeal) {
      const plannedMealText =
        dayPhase === "morning"
          ? `${nextPlannedMeal.type} lesz a következő tervezett étkezésed. Addig nincs sürgős teendőd.`
          : dayPhase === "afternoon"
            ? `${nextPlannedMeal.type} már meg van tervezve. Most nyugodtan folytathatod a napodat.`
            : `${nextPlannedMeal.type} még hátravan, de nincs vele teendőd addig, amíg tényleg el nem jön az ideje.`;

      return {
        kind: "meal",
        text: plannedMealText,
        buttonLabel: "Mai étkezések →",
      };
    }

    const doneText =
      dayPhase === "morning"
        ? "Jól indul a napod. Most nincs sürgős teendő — haladj tovább a saját ritmusodban."
        : dayPhase === "afternoon"
          ? "A mai fő dolgok rendben vannak. Nem kell mindig új feladatot keresni — most elég, ha tartod a ritmust."
          : "Szépen áll a napod. Az estére már nem kell semmit behoznod — innen jöhet a nyugodtabb lezárás.";

    return {
      kind: "done",
      text: doneText,
      buttonLabel: null,
    };
  })();

  const todayGuideText = todayNextStep.text;

  function openTodayNextStep() {
    if (todayNextStep.kind === "rest") {
      setView("wellbeing");
      return;
    }

    if (todayNextStep.kind === "water") {
      setWater((current) => Math.min(5000, current + 250));
      return;
    }

    if (todayNextStep.kind === "meal") {
      setView("meals");
      return;
    }

    if (todayNextStep.kind === "recipe") {
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

    if (todayNextStep.kind === "movement") {
      setView("movement");
    }
  }

  const todayNextButtonLabel = todayNextStep.buttonLabel;

  const eveningSummaryText = (() => {
    const mealCount = meals.filter((meal) => meal.consumed).length;
    const parts: string[] = [];

    if (mealCount > 0) {
      parts.push(`${mealCount} étkezést rögzítettél`);
    }

    if (water > 0) {
      parts.push(`${water} ml vizet ittál`);
    }

    if (movementDone) {
      parts.push("a mai mozgásod is megvolt");
    }

    if (parts.length >= 2) {
      const last = parts.pop();
      const recap = `${parts.join(", ")} és ${last}.`;

      if (water < 1400) {
        return `${recap} Ma kevés folyadékot rögzítettél; holnap egy pohár vízzel könnyebb lehet elindítani a napot.`;
      }

      if (!movementDone && currentHour >= 20) {
        return `${recap} Mára nem kell már bepótolnod semmit. Holnap egy rövid, könnyű mozgással újra felveheted a ritmust.`;
      }

      if (calorieRatio < 0.7 && mealCount > 0) {
        return `${recap} A mai energiabeviteled a célodhoz képest alacsonyabban maradt. Holnap figyelj arra, hogy legyenek rendes, tápláló étkezéseid.`;
      }

      return `${recap} Szépen összeállt a napod. Holnap elég innen továbbvinni azt, ami ma már működött.`;
    }

    if (parts.length === 1) {
      return `${parts[0]}. Ez is számít. Nem kell este mindent bepótolnod — válassz inkább egy könnyű kapaszkodót holnap reggelre.`;
    }

    return "Nem kell este bepótolni mindent. Zárd le nyugodtan a napot, és válassz egy könnyű kapaszkodót holnap reggelre.";
  })();


  const zenvyraNutrition = useMemo(() => {
    const consumedCount = meals.filter((meal) => meal.consumed).length;
    const hasPlannedMeal = meals.some((meal) => !meal.consumed);
    const energyRatio = dailyGoal > 0 ? totals.kcal / dailyGoal : 0;

    if (zenvyraState.rhythm === "recovery") {
      return {
        title: "Most az egyszerű, tápláló ritmus a fontos",
        text:
          "Regenerálóbb időszakban nem a tökéletes számok a célok. Inkább legyenek kiszámítható, tápláló étkezéseid, és ne próbáld este bepótolni az egész napot.",
        recipeText:
          "Most az egyszerűbb, jól összeállítható recepteket érdemes előrevenni, amelyek könnyen beilleszthetők a napodba.",
      };
    }

    if (zenvyraState.rhythm === "rebuild") {
      return {
        title: "Először az étkezési ritmust építjük",
        text:
          consumedCount === 0
            ? "Ma még nincs elfogyasztott étkezés rögzítve. Most egy könnyen tartható következő étkezés többet ér, mint az egész nap előre tökéletesre tervezése."
            : hasPlannedMeal
              ? "Van már következő tervezett étkezésed. Most a rendszeresség a fontos: haladj vele tovább a saját napirended szerint."
              : "A mai étkezésekből már kialakul egy ritmus. A következő lépés az, hogy ezt több napon át könnyen tarthatóvá tegyük.",
        recipeText:
          "A recepteknél most azt érdemes előnyben részesíteni, amit reálisan el is készítesz és rendszeresen be tudsz illeszteni.",
      };
    }

    if (zenvyraState.rhythm === "progress") {
      return {
        title: "A ritmus már stabilabb, jöhet a finomhangolás",
        text:
          energyRatio < 0.7
            ? "A rendszerességed jó irányban halad, de a mai energiabeviteled még alacsonyabb a célodhoz képest. A következő étkezés legyen rendes és tápláló."
            : "A napi ritmusod stabilabb, ezért most már jobban tudunk figyelni arra is, hogy az étkezések a kalória- és makrócéljaidhoz illeszkedjenek.",
        recipeText:
          "Most már a receptválasztásnál a tarthatóság mellett erősebben számít a napi energia- és makrócélhoz való illeszkedés is.",
      };
    }

    return {
      title: "Tartsuk meg az egyensúlyt",
      text:
        energyRatio > 1.15
          ? "A mai beviteled már a napi cél fölé került. Nem kell kompenzálnod vagy kihagynod étkezést — a következő választás legyen egyszerűen a szokásos ritmusod része."
          : "A jelenlegi állapotodnál a rendszeresség és a céljaid közötti egyensúly a legjobb irány. Nem kell minden étkezést külön optimalizálni.",
      recipeText:
        "A recepteknél most azokat a választásokat érdemes megtartani, amelyek egyszerre illenek a céljaidhoz és a hétköznapi ritmusodhoz.",
    };
  }, [meals, dailyGoal, totals.kcal, zenvyraState]);
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

  function energyToNumber(value: "Alacsony" | "Közepes" | "Jó" | null) {
    return value === "Alacsony" ? 1 : value === "Közepes" ? 3 : value === "Jó" ? 5 : null;
  }

  function stressToNumber(value: "Alacsony" | "Közepes" | "Magas" | null) {
    return value === "Alacsony" ? 1 : value === "Közepes" ? 3 : value === "Magas" ? 5 : null;
  }

  async function saveWellbeingSnapshot(next: {
    mood?: number;
    energyLevel?: "Alacsony" | "Közepes" | "Jó" | null;
    stressLevel?: "Alacsony" | "Közepes" | "Magas" | null;
    note?: string;
  }) {
    const nextMood = next.mood ?? mood;
    const nextEnergy =
      next.energyLevel !== undefined ? next.energyLevel : energyLevel;
    const nextStress =
      next.stressLevel !== undefined ? next.stressLevel : stressLevel;
    const nextNote = next.note !== undefined ? next.note : wellbeingNote;

    setMood(nextMood);
    setEnergyLevel(nextEnergy);
    setStressLevel(nextStress);
    setWellbeingNote(nextNote);

    if (guestMode || !session?.user) return;

    const today = localDateKey();

    const existing = await supabase
      .from("wellbeing_logs")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("logged_on", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) {
      setCloudMessage("A közérzet mentése nem sikerült.");
      return;
    }

    const payload = {
      mood: nextMood,
      energy: energyToNumber(nextEnergy),
      stress: stressToNumber(nextStress),
      note: nextNote.trim() || null,
    };

    const result = existing.data?.id
      ? await supabase
          .from("wellbeing_logs")
          .update(payload)
          .eq("id", existing.data.id)
      : await supabase.from("wellbeing_logs").insert({
          user_id: session.user.id,
          logged_on: today,
          ...payload,
        });

    if (result.error) {
      setCloudMessage("A közérzet mentése nem sikerült.");
      return;
    }

    setCloudMessage("");
  }

  async function saveMood(value: number) {
    await saveWellbeingSnapshot({ mood: value });
  }

  async function saveEnergyLevel(value: "Alacsony" | "Közepes" | "Jó") {
    await saveWellbeingSnapshot({ energyLevel: value });
  }

  async function saveStressLevel(value: "Alacsony" | "Közepes" | "Magas") {
    await saveWellbeingSnapshot({ stressLevel: value });
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
      <aside
        id="dashboard-mobile-navigation"
        className={mobileMenuOpen ? "dashboard-sidebar mobile-open" : "dashboard-sidebar"}
        aria-label="Zenvyra navigáció"
      >
        <div className="dashboard-brand">
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
    <span>TEST ÉS LÉLEK HARMÓNIÁBAN</span>
  </div>
        </div>

        <button
          type="button"
          className="mobile-sidebar-close"
          aria-label="Menü bezárása"
          onClick={() => setMobileMenuOpen(false)}
        >
          <span aria-hidden="true">×</span>
        </button>

        <nav className="dashboard-nav" aria-label="Fő navigáció">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "active" : ""}
              onClick={() => {
                setView(item.id);
                setMobileMenuOpen(false);
              }}
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

      {mobileMenuOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          aria-label="Menü bezárása"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <section className="dashboard-main">
        <header className="dashboard-topbar">
          <button
            type="button"
            className={mobileMenuOpen ? "mobile-menu-button menu-open" : "mobile-menu-button"}
            aria-label={mobileMenuOpen ? "Menü bezárása" : "Menü megnyitása"}
            aria-expanded={mobileMenuOpen}
            aria-controls="dashboard-mobile-navigation"
            onClick={() => setMobileMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">☰</span>
          </button>

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
            <section
              className="dashboard-card"
              aria-labelledby="today-next-step-title"
              style={{
                padding: "18px 20px",
                marginBottom: 20,
                background:
                  "linear-gradient(135deg, rgba(255,248,249,0.98), rgba(247,239,252,0.96))",
                border: "1px solid rgba(122,75,157,0.10)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 480px" }}>
                  <span className="card-kicker">✦ ZENVYRA · MOST EZT JAVASLOM</span>
                  <h2
                    id="today-next-step-title"
                    style={{
                      margin: "6px 0 5px",
                      fontSize: "clamp(1.18rem, 2.4vw, 1.48rem)",
                    }}
                  >
                    A következő jó lépés
                  </h2>
                  <p style={{ margin: 0, maxWidth: 780, lineHeight: 1.5 }}>
                    {todayGuideText}
                  </p>

                  <div
                    style={{
                      marginTop: 12,
                      paddingTop: 10,
                      borderTop: "1px solid rgba(122,75,157,0.10)",
                      maxWidth: 780,
                    }}
                  >
                    <span
                      style={{
                        display: "block",
                        marginBottom: 3,
                        fontSize: "0.72rem",
                        fontWeight: 800,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: "rgba(91,61,111,0.72)",
                      }}
                    >
                      Miért ezt javaslom?
                    </span>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.92rem",
                        lineHeight: 1.45,
                        color: "rgba(63,46,72,0.82)",
                      }}
                    >
                      {zenvyraTrendExplanation}
                    </p>
                  </div>
                </div>

                {todayNextButtonLabel && (
                  <button
                    type="button"
                    className="primary-button"
                    onClick={openTodayNextStep}
                    style={{
                      appearance: "none",
                      minWidth: 190,
                      border: "none",
                      borderRadius: 14,
                      padding: "12px 18px",
                      cursor: "pointer",
                    }}
                  >
                    {todayNextButtonLabel}
                  </button>
                )}
              </div>
            </section>

            <section
              className="dashboard-card"
              aria-labelledby="today-meal-plan-title"
              style={{
                padding: "18px 20px",
                marginBottom: 20,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(122,75,157,0.10)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 14,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div style={{ flex: "1 1 420px" }}>
                  <span className="card-kicker">ZENVYRA · MAI ÉTKEZÉSI TERV</span>
                  <h2
                    id="today-meal-plan-title"
                    style={{ margin: "6px 0 5px", fontSize: "1.2rem" }}
                  >
                    A napodhoz igazítva
                  </h2>
                  <p style={{ margin: 0, lineHeight: 1.5 }}>
                    {todayMealPlanSummary}
                  </p>
                </div>
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => setView("meals")}
                >
                  Étkezések →
                </button>
              </div>

              <div style={{ display: "grid", gap: 9 }}>
                {todayMealPlan.map((item) => {
                  const recommendation = item.recommendation;

                  return (
                    <div
                      key={item.type}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "11px 12px",
                        borderRadius: 14,
                        background: item.existing
                          ? "rgba(102,170,132,0.07)"
                          : "rgba(122,75,157,0.045)",
                        border: "1px solid rgba(122,75,157,0.08)",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                        <strong style={{ display: "block", marginBottom: 3 }}>
                          {item.type}
                          {item.optional ? " · opcionális" : ""}
                        </strong>

                        {item.existing ? (
                          <span style={{ color: "#6f6576", lineHeight: 1.4 }}>
                            {item.existing.food} · {item.existing.kcal} kcal ·{" "}
                            {item.existing.consumed ? "elfogyasztva ✓" : "tervezve"}
                          </span>
                        ) : recommendation ? (
                          <span style={{ color: "#6f6576", lineHeight: 1.4 }}>
                            {recommendation.recipe.name} ·{" "}
                            {String(recommendation.portions).replace(".", ",")} adag ·{" "}
                            {recommendation.kcal} kcal · {recommendation.protein} g fehérje
                          </span>
                        ) : (
                          <span style={{ color: "#8a7a90" }}>
                            Most nincs megfelelő ajánlás ehhez az étkezéshez.
                          </span>
                        )}
                      </div>

                      {!item.existing && recommendation && (
                        <button
                          type="button"
                          className="outline-button"
                          onClick={() => void addTodayMealPlanItem(item)}
                        >
                          Mai tervhez adom
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <p
                style={{
                  margin: "12px 0 0",
                  fontSize: "0.8rem",
                  lineHeight: 1.45,
                  color: "#8a7a90",
                }}
              >
                Az elfogyasztott és már megtervezett étkezéseket nem tervezzük újra.
                Ha nap közben változik, amit ettél, a hátralévő ajánlások automatikusan
                újraszámolódnak.
              </p>
            </section>

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
                  {eveningSummaryText}
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

            <section
              className="dashboard-card"
              aria-labelledby="errand-assistant-title"
              style={{
                padding: "26px",
                marginBottom: 20,
                overflow: "hidden",
                position: "relative",
                background:
                  "linear-gradient(135deg, rgba(255,248,251,0.99), rgba(244,236,251,0.98))",
                border: "1px solid rgba(122, 75, 157, 0.12)",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  width: 170,
                  height: 170,
                  borderRadius: "50%",
                  right: -55,
                  top: -75,
                  background: "rgba(255,126,139,0.10)",
                  filter: "blur(2px)",
                }}
              />

              <div style={{ position: "relative" }}>
                <span className="card-kicker">✦ ZENVYRA ASSZISZTENS</span>
                <h2
                  id="errand-assistant-title"
                  style={{ margin: "7px 0 8px", fontSize: "clamp(1.45rem, 3vw, 2rem)" }}
                >
                  Intézd el nekem
                </h2>
                <p style={{ margin: "0 0 18px", maxWidth: 760 }}>
                  Mondd el röviden, mit szeretnél elintézni. Első lépésként összerakom belőle a kérést,
                  hogy később ebből valódi időpont-egyeztetés lehessen.
                </p>

                <form onSubmit={handleErrandRequest}>
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "stretch",
                      flexWrap: "wrap",
                    }}
                  >
                    <input
                      type="text"
                      value={errandRequest}
                      onChange={(event) => setErrandRequest(event.target.value)}
                      placeholder="Pl. Jövő hét kedden délután szeretnék fodrászhoz menni."
                      aria-label="Mit intézzen el a Zenvyra?"
                      style={{
                        flex: "1 1 420px",
                        minWidth: 0,
                        border: "1px solid rgba(122, 75, 157, 0.18)",
                        borderRadius: 16,
                        padding: "14px 16px",
                        background: "rgba(255,255,255,0.88)",
                        color: "inherit",
                        font: "inherit",
                        outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      className="primary-button"
                      disabled={!errandRequest.trim()}
                      style={{
                        minWidth: 170,
                        border: "none",
                        borderRadius: 18,
                        padding: "14px 22px",
                        background: errandRequest.trim()
                          ? "linear-gradient(135deg, #ff7e8b 0%, #9a70db 100%)"
                          : "linear-gradient(135deg, rgba(255,126,139,0.36), rgba(154,112,219,0.36))",
                        color: "#fff",
                        fontWeight: 900,
                        fontSize: "0.98rem",
                        letterSpacing: "0.01em",
                        cursor: errandRequest.trim() ? "pointer" : "not-allowed",
                        boxShadow: errandRequest.trim()
                          ? "0 12px 28px rgba(122,75,157,0.24)"
                          : "none",
                        transition: "transform .18s ease, box-shadow .18s ease, opacity .18s ease",
                        opacity: errandRequest.trim() ? 1 : 0.72,
                      }}
                    >
                      ✦ Intézd el →
                    </button>
                  </div>
                </form>

                {errandResult && (
                  <div
                    style={{
                      marginTop: 18,
                      padding: "18px",
                      borderRadius: 18,
                      background: "rgba(255,255,255,0.76)",
                      border: "1px solid rgba(122, 75, 157, 0.12)",
                    }}
                  >
                    <span className="card-kicker">ÉRTETTEM</span>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                        gap: 10,
                        marginTop: 10,
                      }}
                    >
                      {[
                        ["Mit", errandResult.service],
                        ["Mikor", errandResult.dateText],
                        ["Napszak", errandResult.timeText],
                      ].map(([label, value]) => (
                        <div
                          key={label}
                          style={{
                            padding: "12px 14px",
                            borderRadius: 14,
                            background: "rgba(247,238,249,0.72)",
                          }}
                        >
                          <span style={{ display: "block", fontSize: ".78rem", opacity: 0.7 }}>
                            {label}
                          </span>
                          <strong style={{ display: "block", marginTop: 3 }}>{value}</strong>
                        </div>
                      ))}
                    </div>

                    <p style={{ margin: "16px 0 0", fontWeight: 800 }}>
                      {errandResult.question}
                    </p>

                    {!serviceProvidersReady && (
                      <p style={{ margin: "8px 0 0", opacity: 0.72, fontSize: ".92rem" }}>
                        Mentett szolgáltatók betöltése…
                      </p>
                    )}

                    {serviceProviderMessage && (
                      <p style={{ margin: "8px 0 0", color: "#9a3d5f", fontWeight: 700 }}>
                        {serviceProviderMessage}
                      </p>
                    )}

                    {!errandProviderChoice && serviceProvidersReady && (
                      <div style={{ marginTop: 14 }}>
                        {matchingServiceProviders.length > 0 ? (
                          <>
                            <p style={{ margin: "0 0 10px", fontWeight: 800 }}>
                              Válassz a mentett szolgáltatóid közül:
                            </p>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                              {matchingServiceProviders.map((provider) => (
                                <button
                                  key={provider.id}
                                  type="button"
                                  className="secondary-button"
                                  onClick={() => selectSavedErrandProvider(provider)}
                                  style={{
                                    borderRadius: 16,
                                    padding: "11px 16px",
                                    border: "1px solid rgba(122,75,157,0.18)",
                                    background: "linear-gradient(135deg, rgba(255,126,139,0.13), rgba(154,112,219,0.16))",
                                    color: "#6f3f8f",
                                    fontWeight: 850,
                                  }}
                                >
                                  {provider.name}
                                </button>
                              ))}
                            </div>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => chooseErrandProvider("other")}
                              style={{
                                marginTop: 10,
                                borderRadius: 16,
                                padding: "11px 16px",
                                border: "1px solid rgba(122,75,157,0.16)",
                                background: "rgba(255,255,255,0.86)",
                                color: "#6f3f8f",
                                fontWeight: 800,
                              }}
                            >
                              + Új szolgáltató hozzáadása
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => chooseErrandProvider("usual")}
                            style={{
                              borderRadius: 16,
                              padding: "11px 16px",
                              border: "1px solid rgba(122,75,157,0.18)",
                              background: "linear-gradient(135deg, rgba(255,126,139,0.13), rgba(154,112,219,0.16))",
                              color: "#6f3f8f",
                              fontWeight: 850,
                            }}
                          >
                            + Szolgáltató megadása
                          </button>
                        )}
                      </div>
                    )}

                    {errandProviderChoice && !errandConfirmation && (
                      <form onSubmit={saveErrandProvider} style={{ marginTop: 14 }}>
                        <p style={{ margin: "0 0 10px", fontWeight: 700 }}>
                          {matchingServiceProviders.length === 0
                            ? `Még nincs mentett ${errandResult.service.toLocaleLowerCase("hu")} szolgáltatód. Add meg egyszer, és legközelebb már választható lesz.`
                            : `Add meg az új ${errandResult.service.toLocaleLowerCase("hu")} szolgáltatót. A korábban mentettek megmaradnak.`}
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                          <input
                            className="text-input"
                            value={providerName}
                            onChange={(event) => setProviderName(event.target.value)}
                            placeholder="Szolgáltató neve"
                            required
                          />
                          <input
                            className="text-input"
                            value={providerPhone}
                            onChange={(event) => setProviderPhone(event.target.value)}
                            placeholder="Telefonszám, pl. +36 30 123 4567"
                            type="tel"
                            required
                          />
                        </div>
                        <button
                          type="submit"
                          className="secondary-button"
                          style={{
                            marginTop: 12,
                            borderRadius: 16,
                            padding: "11px 17px",
                            border: "1px solid rgba(122,75,157,0.18)",
                            background: "linear-gradient(135deg, rgba(255,126,139,0.12), rgba(154,112,219,0.17))",
                            color: "#6f3f8f",
                            fontWeight: 850,
                          }}
                        >
                          Szolgáltató mentése és kiválasztása
                        </button>
                      </form>
                    )}

                    {errandConfirmation && (
                      <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "rgba(247,238,249,0.72)" }}>
                        <strong>✓ Szolgáltató kiválasztva</strong>
                        <p style={{ margin: "6px 0 0" }}>{errandConfirmation}</p>

                        <p style={{ margin: "16px 0 8px", fontWeight: 800 }}>Mikor lenne jó?</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {(["13:00–15:00", "15:00–17:00", "17:00 után", "Mindegy"] as ErrandTimeSlot[]).map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              className="secondary-button"
                              onClick={() => chooseErrandTimeSlot(slot)}
                              style={{
                                borderRadius: 15,
                                padding: "10px 14px",
                                border: errandTimeSlot === slot
                                  ? "1px solid rgba(122,75,157,0.34)"
                                  : "1px solid rgba(122,75,157,0.14)",
                                background: errandTimeSlot === slot
                                  ? "linear-gradient(135deg, rgba(255,126,139,0.16), rgba(154,112,219,0.20))"
                                  : "rgba(255,255,255,0.86)",
                                color: "#6f3f8f",
                                fontWeight: errandTimeSlot === slot ? 900 : 800,
                                boxShadow: errandTimeSlot === slot
                                  ? "0 7px 18px rgba(111,63,143,0.10)"
                                  : "none",
                              }}
                            >
                              {errandTimeSlot === slot ? `${slot} ✓` : slot}
                            </button>
                          ))}
                        </div>

                        {errandTimeSlot && (
                          <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 14, background: "rgba(255,255,255,0.82)", border: "1px solid rgba(122,75,157,0.12)" }}>
                            <strong>Időpontkérés előkészítve</strong>
                            <p style={{ margin: "8px 0 0" }}><strong>Szolgáltató:</strong> {providerName}</p>
                            <p style={{ margin: "4px 0 0" }}><strong>Nap:</strong> {errandResult.dateText}</p>
                            <p style={{ margin: "4px 0 0" }}><strong>Idősáv:</strong> {errandTimeSlot}</p>
                            <p style={{ margin: "12px 0 0", lineHeight: 1.55 }}>„{buildErrandMessage()}”</p>

                            {!errandRequestApproved ? (
                              <button
                                type="button"
                                className="primary-button"
                                style={{
                                  marginTop: 14,
                                  border: "none",
                                  borderRadius: 17,
                                  padding: "12px 18px",
                                  background: "linear-gradient(135deg, #ff7e8b 0%, #9a70db 100%)",
                                  color: "#fff",
                                  fontWeight: 900,
                                  boxShadow: "0 10px 24px rgba(122,75,157,0.20)",
                                  cursor: "pointer",
                                }}
                                onClick={() => void approveErrandRequest()}
                                disabled={errandRequestSaving}
                              >
                                {errandRequestSaving ? "Mentés…" : "✓ Rendben, ezt szeretném"}
                              </button>
                            ) : (
                              <div
                                style={{
                                  marginTop: 12,
                                  padding: "10px 12px",
                                  borderRadius: 13,
                                  background: "rgba(122,75,157,0.07)",
                                  color: "#6f3f8f",
                                  fontWeight: 800,
                                  lineHeight: 1.45,
                                }}
                              >
                                ✓ Kérés rögzítve. Az aktuális állapotát lent, a „Folyamatban lévő kérések” résznél követheted.
                              </div>
                            )}
                            {!errandRequestApproved && errandRequestSaveMessage && (
                              <p style={{ margin: "8px 0 0", fontWeight: 700, color: "#6f3f8f" }}>
                                {errandRequestSaveMessage}
                              </p>
                            )}
                          </div>
                        )}

                        <p style={{ margin: "10px 0 0", opacity: 0.72, fontSize: ".9rem" }}>
                          Most még nem küldünk üzenetet és nem indítunk hívást.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!guestMode && session?.user && (
                <div
                  style={{
                    marginTop: 18,
                    padding: "18px 18px 16px",
                    borderRadius: 20,
                    border: "1px solid rgba(122,75,157,0.12)",
                    background: "linear-gradient(145deg, rgba(255,255,255,0.86), rgba(248,241,250,0.88))",
                    boxShadow: "0 12px 32px rgba(111,63,143,0.07)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: "#8b5aa7", fontSize: ".78rem", fontWeight: 900, letterSpacing: ".08em" }}>
                        ✦ ZENVYRA INTÉZI
                      </div>
                      <h3 style={{ margin: "5px 0 0", color: "#4e355e", fontSize: "1.08rem" }}>
                        Folyamatban lévő kérések
                      </h3>
                    </div>
                    {appointmentRequests.length > 0 && (
                      <span style={{ fontSize: ".82rem", fontWeight: 800, color: "#7a5a86" }}>
                        Előzmények · {appointmentRequests.length}
                      </span>
                    )}
                  </div>

                  {appointmentRequestsLoading ? (
                    <p style={{ margin: "14px 0 0", color: "#78687f", fontWeight: 700 }}>Betöltés…</p>
                  ) : appointmentRequestsMessage ? (
                    <p style={{ margin: "14px 0 0", color: "#8b5a70", fontWeight: 700 }}>
                      {appointmentRequestsMessage}
                    </p>
                  ) : appointmentRequests.length === 0 ? (
                    <div style={{ marginTop: 14, padding: "14px 15px", borderRadius: 16, background: "rgba(255,255,255,0.72)" }}>
                      <strong style={{ color: "#60416f" }}>Még nincs aktív kérésed.</strong>
                      <p style={{ margin: "5px 0 0", color: "#78687f", lineHeight: 1.5 }}>
                        Ha jóváhagysz egy időpontkérést, itt fogod látni, hol tart az ügyintézés.
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
                      {appointmentRequests.map((request) => {
                        const provider = serviceProviders.find((item) => item.id === request.provider_id);
                        const tone = appointmentStatusTone(request.status);
                        const defaultOpenRequestId = appointmentRequests.find(
                          (item) => !["confirmed", "cancelled", "draft"].includes(item.status),
                        )?.id;
                        const isOpen = expandedAppointmentRequests[request.id] ?? request.id === defaultOpenRequestId;
                        const requestDateLine =
                          request.status === "confirmed" && request.confirmed_time_text
                            ? `${request.desired_date_text} · ${request.confirmed_time_text}`
                            : `${request.desired_date_text} · ${request.desired_time_window}`;

                        return (
                          <div
                            key={request.id}
                            style={{
                              padding: "13px 14px",
                              borderRadius: 16,
                              border: "1px solid rgba(122,75,157,0.10)",
                              background: "rgba(255,255,255,0.78)",
                            }}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedAppointmentRequests((current) => ({
                                  ...current,
                                  [request.id]: !isOpen,
                                }))
                              }
                              aria-expanded={isOpen}
                              style={{
                                width: "100%",
                                padding: 0,
                                border: 0,
                                background: "transparent",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 10,
                                flexWrap: "wrap",
                                textAlign: "left",
                                cursor: "pointer",
                                font: "inherit",
                              }}
                            >
                              <div>
                                <strong style={{ color: "#553962" }}>
                                  {provider?.name ? `${provider.name} · ` : ""}{request.service}
                                </strong>
                                <p style={{ margin: "4px 0 0", color: "#75647b", fontSize: ".92rem" }}>
                                  {requestDateLine}
                                </p>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span
                                  style={{
                                    padding: "6px 10px",
                                    borderRadius: 999,
                                    background: tone.background,
                                    color: tone.color,
                                    fontSize: ".78rem",
                                    fontWeight: 900,
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {appointmentStatusLabel(request.status)}
                                </span>
                                <span
                                  aria-hidden="true"
                                  style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: "50%",
                                    display: "grid",
                                    placeItems: "center",
                                    background: "rgba(122,75,157,0.07)",
                                    color: "#6f3f8f",
                                    fontWeight: 900,
                                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                                    transition: "transform 160ms ease",
                                  }}
                                >
                                  ›
                                </span>
                              </div>
                            </button>

                            {isOpen && request.status !== "cancelled" && request.status !== "draft" && (
                              <div style={{ marginTop: 12 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
                                  {[
                                    ["approved", "Jóváhagyva"],
                                    ["sent", "Elküldve"],
                                    ["replied", "Válasz"],
                                    ["confirmed", "Lefoglalva"],
                                  ].map(([step, label], index) => {
                                    const order = ["approved", "sent", "replied", "confirmed"];
                                    const currentIndex = order.indexOf(request.status);
                                    const completed = index < currentIndex;
                                    const current = index === currentIndex;
                                    const reached = index <= currentIndex;

                                    return (
                                      <div key={step} style={{ minWidth: 0, textAlign: "center" }}>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 5,
                                          }}
                                        >
                                          <div
                                            style={{
                                              height: 4,
                                              flex: 1,
                                              borderRadius: 999,
                                              background: reached
                                                ? "linear-gradient(90deg, #ff8d96, #9a70db)"
                                                : "rgba(122,75,157,0.10)",
                                            }}
                                          />
                                          <div
                                            aria-hidden="true"
                                            style={{
                                              width: 24,
                                              height: 24,
                                              flex: "0 0 24px",
                                              borderRadius: "50%",
                                              display: "grid",
                                              placeItems: "center",
                                              border: reached
                                                ? "1px solid rgba(122,75,157,0.20)"
                                                : "1px solid rgba(122,75,157,0.12)",
                                              background: completed
                                                ? "linear-gradient(135deg, #ff8d96, #9a70db)"
                                                : current
                                                  ? "rgba(154,112,219,0.16)"
                                                  : "rgba(255,255,255,0.9)",
                                              color: completed ? "#fff" : current ? "#6f3f8f" : "#a99daf",
                                              fontSize: ".72rem",
                                              fontWeight: 900,
                                              boxShadow: current ? "0 0 0 4px rgba(154,112,219,0.08)" : "none",
                                            }}
                                          >
                                            {completed ? "✓" : current ? "•" : index + 1}
                                          </div>
                                          <div
                                            style={{
                                              height: 4,
                                              flex: 1,
                                              borderRadius: 999,
                                              background: completed
                                                ? "linear-gradient(90deg, #ff8d96, #9a70db)"
                                                : "rgba(122,75,157,0.10)",
                                            }}
                                          />
                                        </div>
                                        <div
                                          style={{
                                            marginTop: 6,
                                            fontSize: ".68rem",
                                            fontWeight: current || completed ? 900 : 700,
                                            color: current ? "#5d3378" : completed ? "#765086" : "#a095a5",
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                          }}
                                        >
                                          {label}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>

                                {request.status === "approved" && (
                                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                                    <button
                                      type="button"
                                      onClick={() => openAppointmentSms(request)}
                                      style={{
                                        width: "100%",
                                        padding: "11px 12px",
                                        border: "1px solid rgba(122,75,157,0.16)",
                                        borderRadius: 14,
                                        background: "linear-gradient(135deg, #ff9ca5, #9a70db)",
                                        color: "#fff",
                                        fontWeight: 900,
                                        cursor: "pointer",
                                        boxShadow: "0 10px 24px rgba(111,63,143,0.14)",
                                      }}
                                    >
                                      ✉ Üzenet megnyitása
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void advanceAppointmentRequestStatus(request)}
                                      disabled={appointmentStatusSavingId === request.id}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        border: "1px solid rgba(122,75,157,0.16)",
                                        borderRadius: 14,
                                        background: "rgba(255,255,255,0.9)",
                                        color: "#68427e",
                                        fontWeight: 900,
                                        cursor: appointmentStatusSavingId === request.id ? "wait" : "pointer",
                                        opacity: appointmentStatusSavingId === request.id ? 0.65 : 1,
                                      }}
                                    >
                                      {appointmentStatusSavingId === request.id ? "Mentés…" : "✓ Elküldtem"}
                                    </button>
                                    <p style={{ margin: 0, color: "#8a7a90", fontSize: ".78rem", lineHeight: 1.4 }}>
                                      Az első gomb csak megnyitja az SMS-t. A küldést te véglegesíted a telefonodon.
                                    </p>
                                  </div>
                                )}

                                {request.status === "sent" && (
                                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                                    <label style={{ color: "#60416f", fontWeight: 900, fontSize: ".84rem" }}>
                                      Mit válaszolt a szolgáltató?
                                    </label>
                                    <textarea
                                      value={appointmentReplyDrafts[request.id] ?? request.provider_reply ?? ""}
                                      onChange={(event) => setAppointmentReplyDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                                      placeholder="Pl. Szia! Kedden 16:30-kor van szabad időpontom."
                                      rows={3}
                                      style={{ width: "100%", resize: "vertical", padding: "11px 12px", borderRadius: 14, border: "1px solid rgba(122,75,157,0.16)", background: "rgba(255,255,255,0.92)", color: "#553962", font: "inherit", outline: "none" }}
                                    />
                                    <button type="button" onClick={() => void saveAppointmentReply(request)} disabled={appointmentStatusSavingId === request.id} style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(122,75,157,0.16)", borderRadius: 14, background: "linear-gradient(135deg, rgba(255,141,150,0.12), rgba(154,112,219,0.15))", color: "#68427e", fontWeight: 900, cursor: appointmentStatusSavingId === request.id ? "wait" : "pointer", opacity: appointmentStatusSavingId === request.id ? 0.65 : 1 }}>
                                      {appointmentStatusSavingId === request.id ? "Mentés…" : "✓ Válasz rögzítése"}
                                    </button>
                                  </div>
                                )}

                                {request.status === "replied" && (
                                  <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                                    {request.provider_reply && <div style={{ padding: "10px 12px", borderRadius: 13, background: "rgba(103,142,214,0.08)", color: "#5f5570", lineHeight: 1.5 }}><strong style={{ color: "#486aa3" }}>Válasz:</strong> {request.provider_reply}</div>}
                                    <label style={{ color: "#60416f", fontWeight: 900, fontSize: ".84rem" }}>
                                      Melyik pontos időpontot foglaljuk le?
                                    </label>
                                    <input
                                      value={appointmentConfirmedTimeDrafts[request.id] ?? request.confirmed_time_text ?? ""}
                                      onChange={(event) => setAppointmentConfirmedTimeDrafts((current) => ({ ...current, [request.id]: event.target.value }))}
                                      placeholder="Pl. 16:30"
                                      style={{ width: "100%", padding: "11px 12px", borderRadius: 14, border: "1px solid rgba(122,75,157,0.16)", background: "rgba(255,255,255,0.92)", color: "#553962", font: "inherit", outline: "none" }}
                                    />
                                    <button type="button" onClick={() => void confirmAppointmentTime(request)} disabled={appointmentStatusSavingId === request.id} style={{ width: "100%", padding: "10px 12px", border: "1px solid rgba(122,75,157,0.16)", borderRadius: 14, background: "linear-gradient(135deg, #ff9ca5, #9a70db)", color: "#fff", fontWeight: 900, cursor: appointmentStatusSavingId === request.id ? "wait" : "pointer", opacity: appointmentStatusSavingId === request.id ? 0.65 : 1 }}>
                                      {appointmentStatusSavingId === request.id ? "Mentés…" : "✓ Időpont lefoglalva"}
                                    </button>
                                  </div>
                                )}

                                {request.status === "confirmed" && request.confirmed_time_text && (
                                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 13, background: "rgba(88,177,133,0.10)", color: "#34745a", fontWeight: 800 }}>
                                    <div>✓ Visszaigazolt időpont: {request.desired_date_text} · {request.confirmed_time_text}</div>
                                    <button
                                      type="button"
                                      onClick={() => openAppointmentCalendar(request)}
                                      style={{
                                        width: "100%",
                                        marginTop: 10,
                                        padding: "10px 12px",
                                        border: "1px solid rgba(52,116,90,0.20)",
                                        borderRadius: 14,
                                        background: "rgba(255,255,255,0.82)",
                                        color: "#34745a",
                                        fontWeight: 900,
                                        cursor: "pointer",
                                      }}
                                    >
                                      📅 Naptárba teszem
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <p style={{ margin: "12px 0 0", color: "#8a7a90", fontSize: ".84rem", lineHeight: 1.45 }}>
                    Itt követheted a folyamatot: Jóváhagyva → Elküldve → Válasz érkezett → Időpont lefoglalva. A visszaigazolt időpontot már közvetlenül hozzáadhatod a naptáradhoz. Hívást még nem indítunk.
                  </p>
                </div>
              )}

            </section>

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
                <span className="card-kicker">SZEMÉLYRE SZABOTT HETI RITMUS</span>
                <h2>A te heti egyensúlyod</h2>
                <p>
                  A terved a célodhoz, a mozgási szintedhez és a mostani
                  közérzetedhez igazodik, de nem kötelező lista. Cserélj fel
                  napokat, és válaszd azt, ami most belefér. A recepteknél
                  továbbra is figyelünk arra, hogy ne legyen felesleges ismétlés.
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
          <>
            <section style={{ marginBottom: 18 }}>
              <article
                className="dashboard-card"
                style={{
                  padding: "16px 18px",
                  background: "rgba(122,75,157,0.06)",
                }}
              >
                <span className="card-kicker">ZENVYRA ÉTKEZÉSI IRÁNY</span>
                <strong style={{ display: "block", marginTop: 6, marginBottom: 4 }}>
                  {zenvyraNutrition.title}
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {zenvyraNutrition.recipeText}
                </p>
              </article>
            </section>

            <RecipesView
              storageKey={recipeStorageKey}
              onAddMeal={addRecipeToMeals}
              onAddShopping={handleRecipeShopping}
              onOpenShopping={() => setView("shopping")}
              preferences={preferences}
            />
          </>
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
          <>
            <section style={{ marginBottom: 18 }}>
              <article
                className="dashboard-card"
                style={{
                  padding: "16px 18px",
                  background: "rgba(122,75,157,0.06)",
                }}
              >
                <span className="card-kicker">ZENVYRA ÉTKEZÉSI RITMUS</span>
                <strong style={{ display: "block", marginTop: 6, marginBottom: 4 }}>
                  {zenvyraNutrition.title}
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {zenvyraNutrition.text}
                </p>
              </article>
            </section>

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
          </>
        )}

        {view === "movement" && (
          <>
            <section style={{ marginBottom: 18 }}>
              <article
                className="dashboard-card"
                style={{
                  padding: "16px 18px",
                  background: "rgba(122,75,157,0.06)",
                }}
              >
                <span className="card-kicker">ZENVYRA MOZGÁSI RITMUS</span>
                <strong style={{ display: "block", marginTop: 6, marginBottom: 4 }}>
                  A mostani állapotodhoz igazítva
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {zenvyraState.rhythm === "recovery"
                    ? `Most a regenerálódás az első. ${zenvyraState.movementMinutes} perc kímélő mozgás bőven elég.`
                    : zenvyraState.rhythm === "rebuild"
                      ? `Most a rendszerességet építjük vissza. ${zenvyraState.movementMinutes} perc könnyen tartható mozgást javaslok.`
                      : zenvyraState.rhythm === "progress"
                        ? `Jól tartod a ritmust. Most ${zenvyraState.movementMinutes} perc ${zenvyraState.movementIntensity} mozgás is beleférhet.`
                        : `Most az egyensúly megtartása a cél. ${zenvyraState.movementMinutes} perc ${zenvyraState.movementIntensity} mozgás jó választás.`}
                </p>
              </article>
            </section>

            <MovementView
              history={movementHistory}
              onComplete={completeWorkout}
              preferredMinutes={preferences.workout_minutes}
              preferredLevel={preferences.fitness_level}
              movementLimitations={preferences.movement_limitations}
            />
          </>
        )}

        {view === "wellbeing" && (
          <section className="dashboard-content-grid">
            <article
              className="dashboard-card wellbeing-card"
              style={{
                background:
                  "linear-gradient(135deg, rgba(255,246,247,0.98), rgba(255,238,230,0.78))",
                border: "1px solid rgba(238, 124, 126, 0.14)",
              }}
            >
              <span className="card-kicker">NAPI BEJELENTKEZÉS</span>
              <h2>Hogy érzed magad ma?</h2>
              <p className="wellbeing-lead">
                Néhány gyors jelzés segít, hogy a Zenvyra jobban igazodjon a mai
                ritmusodhoz.
              </p>

              <div style={{ marginTop: 24 }}>
                <strong style={{ display: "block", marginBottom: 10 }}>Hangulat</strong>
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
              </div>

              <div style={{ marginTop: 26 }}>
                <strong style={{ display: "block", marginBottom: 10 }}>
                  Milyen az energiaszinted?
                </strong>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(["Alacsony", "Közepes", "Jó"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => void saveEnergyLevel(value)}
                      style={{
                        appearance: "none",
                        border:
                          energyLevel === value
                            ? "1px solid rgba(225, 104, 116, 0.48)"
                            : "1px solid rgba(225, 104, 116, 0.18)",
                        borderRadius: 999,
                        padding: "10px 16px",
                        background:
                          energyLevel === value
                            ? "rgba(255, 219, 215, 0.78)"
                            : "rgba(255,255,255,0.78)",
                        color: "#6f3f68",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {energyLevel === value ? `${value} ✓` : value}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 26 }}>
                <strong style={{ display: "block", marginBottom: 10 }}>
                  Mennyire érzed stresszesnek a mai napot?
                </strong>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {(["Alacsony", "Közepes", "Magas"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => void saveStressLevel(value)}
                      style={{
                        appearance: "none",
                        border:
                          stressLevel === value
                            ? "1px solid rgba(225, 104, 116, 0.48)"
                            : "1px solid rgba(225, 104, 116, 0.18)",
                        borderRadius: 999,
                        padding: "10px 16px",
                        background:
                          stressLevel === value
                            ? "rgba(255, 219, 215, 0.78)"
                            : "rgba(255,255,255,0.78)",
                        color: "#6f3f68",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {stressLevel === value ? `${value} ✓` : value}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginTop: 26 }}>
                <label htmlFor="wellbeing-note">
                  <strong style={{ display: "block", marginBottom: 8 }}>
                    Van valami, amire ma figyeljünk?
                  </strong>
                </label>
                <input
                  id="wellbeing-note"
                  type="text"
                  value={wellbeingNote}
                  onChange={(event) => setWellbeingNote(event.target.value)}
                  onBlur={() => void saveWellbeingSnapshot({ note: wellbeingNote })}
                  placeholder="például fáradtabb vagyok, nyugodtabb napot szeretnék"
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid rgba(225, 104, 116, 0.18)",
                    borderRadius: 14,
                    padding: "13px 15px",
                    background: "rgba(255,255,255,0.82)",
                    color: "inherit",
                    font: "inherit",
                  }}
                />
              </div>
            </article>

            <article
              className="dashboard-card"
              style={{
                background: "rgba(255,255,255,0.84)",
                border: "1px solid rgba(238, 124, 126, 0.10)",
              }}
            >
              <span className="card-kicker">MAI ÁLLAPOT</span>
              <h2>Egy pillanatkép rólad.</h2>
              <p className="wellbeing-lead">
                Nem értékelés és nem teljesítmény. Csak egy rövid kép arról, hogyan
                vagy ma.
              </p>

              <div className="wellbeing-lines">
                <div>
                  <strong>Hangulat</strong>
                  <span>{mood} / 5</span>
                </div>
                <div>
                  <strong>Energia</strong>
                  <span>{energyLevel ?? "Még nincs megadva"}</span>
                </div>
                <div>
                  <strong>Stressz</strong>
                  <span>{stressLevel ?? "Még nincs megadva"}</span>
                </div>
              </div>

              {(energyLevel || stressLevel || wellbeingNote.trim()) && (
                <p style={{ marginTop: 18 }}>
                  Köszönöm. Ezeket a jelzéseket a mai napod finomabb vezetéséhez
                  használjuk.
                </p>
              )}
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
            <section style={{ marginBottom: 18 }}>
              <article
                className="dashboard-card"
                style={{
                  padding: "16px 18px",
                  background: "rgba(122,75,157,0.06)",
                }}
              >
                <span className="card-kicker">ZENVYRA HALADÁSI KÉP</span>
                <strong style={{ display: "block", marginTop: 6, marginBottom: 4 }}>
                  Nem csak a mérleg számít
                </strong>
                <p style={{ margin: 0, lineHeight: 1.5 }}>
                  {zenvyraState.rhythm === "recovery"
                    ? "Most a regenerálódás és a stabil napi ritmus fontosabb, mint a teljesítmény növelése."
                    : zenvyraState.rhythm === "rebuild"
                      ? "A rendszerességed épül. Most azt figyeljük, hogy egyre több tartható nap álljon össze."
                      : zenvyraState.rhythm === "progress"
                        ? "A mozgási ritmusod már stabilabb, ezért a fejlődés következő szintje is fokozatosan megjelenhet."
                        : "A jelenlegi adatok alapján az egyensúly megtartása a fő irány."}
                </p>
              </article>
            </section>

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
      <style>{`
        .mobile-menu-button,
        .mobile-sidebar-close,
        .mobile-menu-backdrop {
          display: none;
        }

        @media (max-width: 760px) {
          .dashboard-shell {
            display: block !important;
          }

          .dashboard-sidebar {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            bottom: 0 !important;
            width: min(78vw, 286px) !important;
            max-width: 286px !important;
            height: 100dvh !important;
            padding: 18px 16px 20px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            color: #234438 !important;
            background:
              radial-gradient(circle at 4% 3%, rgba(201, 143, 145, 0.15), transparent 28%),
              linear-gradient(180deg, #fffdfc 0%, #fbf5f4 100%) !important;
            z-index: 1001 !important;
            transform: translateX(-105%) !important;
            transition: transform 220ms ease !important;
            overflow-y: auto !important;
            border-right: 1px solid rgba(49, 87, 72, 0.1) !important;
            box-shadow: 18px 0 45px rgba(35, 68, 56, 0.16) !important;
          }

          .dashboard-sidebar.mobile-open {
            transform: translateX(0) !important;
          }

          .dashboard-sidebar .dashboard-brand,
          .dashboard-sidebar .dashboard-nav,
          .dashboard-sidebar .sidebar-wellness-card,
          .dashboard-sidebar .dashboard-signout {
            opacity: 1 !important;
            visibility: visible !important;
          }

          .dashboard-sidebar .dashboard-brand {
            justify-content: flex-start !important;
            min-height: 62px !important;
            padding: 0 48px 14px 0 !important;
            border-bottom: 1px solid rgba(49, 87, 72, 0.1) !important;
          }

          .dashboard-sidebar .dashboard-brand > div:last-child {
            display: block !important;
          }

          .dashboard-sidebar .dashboard-brand strong {
            color: #234438 !important;
            font-size: 17px !important;
          }

          .dashboard-sidebar .dashboard-brand span {
            color: #6f8179 !important;
            font-size: 8px !important;
          }

          .mobile-sidebar-close {
            display: grid !important;
            place-items: center;
            position: absolute;
            top: 18px;
            right: 16px;
            width: 38px;
            height: 38px;
            border: 1px solid rgba(49, 87, 72, 0.12);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.88);
            color: #315748;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
            box-shadow: 0 7px 18px rgba(35, 68, 56, 0.08);
          }

          .dashboard-sidebar .dashboard-nav {
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 4px !important;
            width: 100% !important;
            margin-top: 12px !important;
          }

          .dashboard-sidebar .dashboard-nav button {
            display: flex !important;
            flex-direction: row !important;
            align-items: center !important;
            justify-content: flex-start !important;
            gap: 11px !important;
            width: 100% !important;
            min-height: 48px !important;
            min-width: 0 !important;
            margin: 0 !important;
            padding: 8px 10px !important;
            border-radius: 12px !important;
            white-space: normal !important;
            text-align: left !important;
            color: #53675e !important;
            background: transparent !important;
            box-shadow: none !important;
          }

          .dashboard-sidebar .dashboard-nav button:hover {
            color: #234438 !important;
            background: rgba(49, 87, 72, 0.06) !important;
          }

          .dashboard-sidebar .dashboard-nav button.active {
            color: #234438 !important;
            background: rgba(201, 143, 145, 0.16) !important;
            box-shadow: inset 3px 0 #315748 !important;
          }

          .dashboard-sidebar .dashboard-nav-icon {
            width: 30px !important;
            height: 30px !important;
            color: #315748 !important;
            background: rgba(49, 87, 72, 0.08) !important;
          }

          .dashboard-sidebar .dashboard-nav button.active .dashboard-nav-icon {
            color: #fff !important;
            background: #315748 !important;
          }

          .dashboard-sidebar .dashboard-nav button > span {
            flex: 0 0 auto !important;
          }

          .dashboard-sidebar .dashboard-nav button > span:last-child {
            display: inline !important;
            flex: 1 1 auto !important;
            min-width: 0 !important;
            width: auto !important;
            white-space: normal !important;
          }

          .dashboard-main {
            width: 100% !important;
            margin-left: 0 !important;
          }

          .dashboard-topbar {
            position: relative;
            padding-top: 64px !important;
          }

          .mobile-menu-button {
            display: grid !important;
            place-items: center;
            position: absolute;
            top: 14px;
            left: 16px;
            width: 44px;
            height: 44px;
            border: 1px solid rgba(49, 87, 72, 0.14);
            border-radius: 14px;
            background: rgba(255,255,255,0.92);
            color: #315748;
            font-size: 25px;
            line-height: 1;
            cursor: pointer;
            z-index: 1002;
            box-shadow: 0 8px 24px rgba(49,87,72,0.09);
            transition: opacity 160ms ease;
          }

          .mobile-menu-button.menu-open {
            opacity: 0;
            pointer-events: none;
          }

          .mobile-menu-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            z-index: 1000;
            border: 0;
            background: rgba(35, 68, 56, 0.2);
            backdrop-filter: blur(3px);
          }
        }
      `}</style>
    </main>
  );
}
