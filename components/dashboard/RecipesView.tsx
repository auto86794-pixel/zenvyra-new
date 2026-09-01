"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { PersonalPreferences } from "@/components/dashboard/PreferencesPanel";

export type RecipeIngredient = {
  id: string;
  name: string;
  amount: string;
};

export type Recipe = {
  id: string;
  name: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: RecipeIngredient[];
  dietStyle?: "omnivore" | "vegetarian" | "vegan";
  allergens?: string[];
};

type Props = {
  storageKey: string;
  onAddMeal: (recipe: Recipe, portions: number) => Promise<boolean>;
  onAddShopping: (ingredients: RecipeIngredient[]) => number;
  preferences: PersonalPreferences;
};

type RecipePart = {
  key: string;
  name: string;
  amount: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  dietStyle?: "omnivore" | "vegetarian" | "vegan";
  allergens?: string[];
};

const proteinParts: RecipePart[] = [
  { key: "chicken", name: "Csirkemell", amount: "300 g", kcal: 330, protein: 69, carbs: 0, fat: 6, dietStyle: "omnivore" },
  { key: "turkey", name: "Pulykamell", amount: "300 g", kcal: 315, protein: 66, carbs: 0, fat: 5, dietStyle: "omnivore" },
  { key: "salmon", name: "Lazac", amount: "260 g", kcal: 540, protein: 52, carbs: 0, fat: 34, dietStyle: "omnivore" },
  { key: "tuna", name: "Tonhal", amount: "260 g", kcal: 300, protein: 62, carbs: 0, fat: 4, dietStyle: "omnivore" },
  { key: "beef", name: "Sovány marhahús", amount: "280 g", kcal: 470, protein: 58, carbs: 0, fat: 24, dietStyle: "omnivore" },
  { key: "egg", name: "Tojás", amount: "6 db", kcal: 430, protein: 38, carbs: 3, fat: 29, dietStyle: "vegetarian", allergens: ["egg"] },
  { key: "tofu", name: "Natúr tofu", amount: "320 g", kcal: 390, protein: 40, carbs: 9, fat: 22, dietStyle: "vegan" },
  { key: "chickpea", name: "Főtt csicseriborsó", amount: "320 g", kcal: 525, protein: 28, carbs: 88, fat: 8, dietStyle: "vegan" },
  { key: "lentil", name: "Főtt lencse", amount: "340 g", kcal: 395, protein: 31, carbs: 68, fat: 2, dietStyle: "vegan" },
  { key: "tempeh", name: "Tempeh", amount: "280 g", kcal: 540, protein: 53, carbs: 21, fat: 30, dietStyle: "vegan" },
  { key: "cottage", name: "Cottage cheese", amount: "350 g", kcal: 350, protein: 43, carbs: 14, fat: 14, dietStyle: "vegetarian", allergens: ["milk"] },
  { key: "beans", name: "Főtt vörösbab", amount: "340 g", kcal: 430, protein: 29, carbs: 77, fat: 2, dietStyle: "vegan" },
];

const baseParts: RecipePart[] = [
  { key: "rice", name: "Főtt rizs", amount: "300 g", kcal: 390, protein: 8, carbs: 84, fat: 1 },
  { key: "potato", name: "Burgonya", amount: "520 g", kcal: 400, protein: 10, carbs: 88, fat: 1 },
  { key: "quinoa", name: "Főtt quinoa", amount: "300 g", kcal: 360, protein: 13, carbs: 64, fat: 6 },
  { key: "pasta", name: "Főtt durumtészta", amount: "300 g", kcal: 465, protein: 17, carbs: 92, fat: 3, allergens: ["gluten"] },
  { key: "bulgur", name: "Főtt bulgur", amount: "320 g", kcal: 265, protein: 10, carbs: 60, fat: 1, allergens: ["gluten"] },
  { key: "sweetpotato", name: "Édesburgonya", amount: "500 g", kcal: 430, protein: 8, carbs: 100, fat: 1 },
];

const flavorParts = [
  {
    key: "lemon",
    label: "Citromos-zöldfűszeres",
    ingredient: "Citrom és friss zöldfűszerek",
    amount: "ízlés szerint",
    allergens: [] as string[],
    extra: { kcal: 65, protein: 2, carbs: 10, fat: 2 },
  },
  {
    key: "mediterranean",
    label: "Mediterrán",
    ingredient: "Paradicsom, paprika és oregánó",
    amount: "300 g",
    allergens: [] as string[],
    extra: { kcal: 75, protein: 3, carbs: 13, fat: 2 },
  },
  {
    key: "garlic-paprika",
    label: "Fokhagymás-paprikás",
    ingredient: "Fokhagyma, édes paprika és petrezselyem",
    amount: "ízlés szerint",
    allergens: [] as string[],
    extra: { kcal: 60, protein: 2, carbs: 9, fat: 2 },
  },
  {
    key: "tomato-basil",
    label: "Paradicsomos-bazsalikomos",
    ingredient: "Paradicsom és friss bazsalikom",
    amount: "250 g",
    allergens: [] as string[],
    extra: { kcal: 70, protein: 3, carbs: 12, fat: 2 },
  },
  {
    key: "curry-coconut",
    label: "Enyhén currys-kókuszos",
    ingredient: "Curry, lime és kókusztej",
    amount: "120 ml",
    allergens: [] as string[],
    extra: { kcal: 85, protein: 2, carbs: 8, fat: 5 },
  },
  {
    key: "mexican",
    label: "Mexikói fűszerezésű",
    ingredient: "Paradicsom, kukorica, lime és fűszerek",
    amount: "220 g",
    allergens: [] as string[],
    extra: { kcal: 80, protein: 3, carbs: 14, fat: 2 },
  },
  {
    key: "ginger-lime",
    label: "Gyömbéres-lime-os",
    ingredient: "Gyömbér, lime és gluténmentes tamari",
    amount: "ízlés szerint",
    allergens: [] as string[],
    extra: { kcal: 65, protein: 3, carbs: 9, fat: 2 },
  },
  {
    key: "smoky",
    label: "Füstös-paprikás",
    ingredient: "Füstölt paprika, paradicsom és zöldfűszerek",
    amount: "ízlés szerint",
    allergens: [] as string[],
    extra: { kcal: 70, protein: 2, carbs: 11, fat: 2 },
  },
  {
    key: "almond",
    label: "Mandulás-zöldfűszeres",
    ingredient: "Mandula és friss zöldfűszerek",
    amount: "15 g",
    allergens: ["nuts"],
    extra: { kcal: 90, protein: 3, carbs: 3, fat: 8 },
  },
];

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function buildStarterRecipes(): Recipe[] {
  const recipes: Recipe[] = [];

  for (const protein of proteinParts) {
    for (const base of baseParts) {
      for (const flavor of flavorParts) {
        const id = `zenvyra-${protein.key}-${base.key}-${flavor.key}`;
        const flavorExtra = flavor.extra;
        const oil = { kcal: 90, protein: 0, carbs: 0, fat: 10 };

        recipes.push({
          id,
          name: `${flavor.label} ${protein.name.toLocaleLowerCase("hu")}-${base.name.toLocaleLowerCase("hu")} tál`,
          servings: 2,
          kcal: Math.round(protein.kcal + base.kcal + flavorExtra.kcal + oil.kcal),
          protein: Math.round(protein.protein + base.protein + flavorExtra.protein),
          carbs: Math.round(protein.carbs + base.carbs + flavorExtra.carbs),
          fat: Math.round(protein.fat + base.fat + flavorExtra.fat + oil.fat),
          dietStyle: protein.dietStyle ?? "omnivore",
          allergens: uniqueStrings([...(protein.allergens ?? []), ...(base.allergens ?? []), ...flavor.allergens]),
          ingredients: [
            { id: `${id}-1`, name: protein.name, amount: protein.amount },
            { id: `${id}-2`, name: base.name, amount: base.amount },
            { id: `${id}-3`, name: flavor.ingredient, amount: flavor.amount },
            { id: `${id}-4`, name: "Vegyes friss zöldség", amount: "300 g" },
            { id: `${id}-5`, name: "Olívaolaj", amount: "2 teáskanál" },
          ],
        });
      }
    }
  }

  return recipes;
}

// 12 fehérjeforrás × 6 köret × 9 ízvilág = 648 külön receptvariáns.
export const starterRecipes: Recipe[] = buildStarterRecipes();

export function ensureStarterRecipes(storageKey: string): Recipe[] {
  if (typeof window === "undefined") return starterRecipes;

  const seedKey = `${storageKey}:starter-v3-648`;

  try {
    const raw = window.localStorage.getItem(storageKey);
    const alreadyUpgraded = window.localStorage.getItem(seedKey) === "1";
    const saved = raw ? JSON.parse(raw) : [];
    const savedRecipes: Recipe[] = Array.isArray(saved) ? saved : [];

    if (alreadyUpgraded) {
      return savedRecipes.length > 0 ? savedRecipes : starterRecipes;
    }

    // A korábbi automatikusan generált Zenvyra recepteket frissítjük,
    // a felhasználó saját receptjeit viszont változatlanul megtartjuk.
    const customRecipes = savedRecipes.filter(
      (recipe) => !recipe.id.startsWith("zenvyra-"),
    );
    const merged = [...starterRecipes, ...customRecipes];

    window.localStorage.setItem(storageKey, JSON.stringify(merged));
    window.localStorage.setItem(seedKey, "1");
    return merged;
  } catch {
    window.localStorage.setItem(storageKey, JSON.stringify(starterRecipes));
    window.localStorage.setItem(seedKey, "1");
    return starterRecipes;
  }
}

function loadRecipes(storageKey: string): Recipe[] {
  return ensureStarterRecipes(storageKey);
}

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

function formatMacro(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

const allergenOptions = [["milk", "Tej"], ["gluten", "Glutén"], ["egg", "Tojás"], ["nuts", "Diófélék"]] as const;


export default function RecipesView({ storageKey, onAddMeal, onAddShopping, preferences }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes(storageKey));
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [ingredientLines, setIngredientLines] = useState("");
  const [dietStyle, setDietStyle] = useState<"omnivore" | "vegetarian" | "vegan">("omnivore");
  const [recipeAllergens, setRecipeAllergens] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [selectedPortions, setSelectedPortions] = useState<Record<string, number>>({});
  const [message, setMessage] = useState("");

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(recipes));
  }, [recipes, storageKey]);

  const formPreview = useMemo(() => {
    const portionCount = Math.max(1, numberValue(servings) || 1);
    return {
      kcal: Math.round((numberValue(kcal) || 0) / portionCount),
      protein: (numberValue(protein) || 0) / portionCount,
      carbs: (numberValue(carbs) || 0) / portionCount,
      fat: (numberValue(fat) || 0) / portionCount,
    };
  }, [servings, kcal, protein, carbs, fat]);

  function resetForm() {
    setName("");
    setServings("4");
    setKcal("");
    setProtein("");
    setCarbs("");
    setFat("");
    setIngredientLines("");
    setDietStyle("omnivore");
    setRecipeAllergens([]);
    setFormOpen(false);
  }

  function saveRecipe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const portionCount = Math.round(numberValue(servings));
    const parsedKcal = numberValue(kcal);
    const parsedProtein = numberValue(protein);
    const parsedCarbs = numberValue(carbs);
    const parsedFat = numberValue(fat);
    const ingredients = ingredientLines
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const [ingredientName, ...amountParts] = line.split(/\s[-–—]\s/);
        return {
          id: `ingredient-${Date.now()}-${index}`,
          name: ingredientName.trim(),
          amount: amountParts.join(" – ").trim(),
        };
      });

    if (
      !name.trim() ||
      !Number.isFinite(portionCount) ||
      portionCount < 1 ||
      !Number.isFinite(parsedKcal) ||
      parsedKcal <= 0 ||
      [parsedProtein, parsedCarbs, parsedFat].some((value) => !Number.isFinite(value) || value < 0) ||
      ingredients.length === 0
    ) {
      setMessage("Töltsd ki a recept nevét, adagját, tápértékeit és legalább egy hozzávalót.");
      return;
    }

    const recipe: Recipe = {
      id: `recipe-${Date.now()}`,
      name: name.trim(),
      servings: portionCount,
      kcal: parsedKcal,
      protein: parsedProtein,
      carbs: parsedCarbs,
      fat: parsedFat,
      ingredients,
      dietStyle,
      allergens: recipeAllergens,
    };
    setRecipes((current) => [recipe, ...current]);
    setSelectedPortions((current) => ({ ...current, [recipe.id]: 1 }));
    setMessage("A recept elmentve.");
    resetForm();
  }

  const compatibleRecipes = useMemo(() => recipes.filter((recipe) => {
    const recipeDiet = recipe.dietStyle ?? "omnivore";
    const dietMatches = preferences.diet_type === "omnivore" ||
      (preferences.diet_type === "vegetarian" && recipeDiet !== "omnivore") ||
      (preferences.diet_type === "vegan" && recipeDiet === "vegan");
    const allergenMatches = !(recipe.allergens ?? []).some((item) => preferences.allergens.includes(item));
    const ingredientMatches = !recipe.ingredients.some((ingredient) =>
      preferences.disliked_ingredients.some((item) => ingredient.name.toLocaleLowerCase("hu").includes(item)),
    );
    return dietMatches && allergenMatches && ingredientMatches;
  }), [preferences, recipes]);

  const visibleRecipes = showAll ? recipes : compatibleRecipes;

  async function addToMeals(recipe: Recipe) {
    const portions = selectedPortions[recipe.id] ?? 1;
    const saved = await onAddMeal(recipe, portions);
    setMessage(saved ? `${recipe.name} bekerült a mai étkezésekhez.` : "A recept mentése nem sikerült.");
  }

  function addToShopping(recipe: Recipe) {
    const added = onAddShopping(recipe.ingredients);
    setMessage(
      added > 0
        ? `${added} hozzávaló átkerült a bevásárlólistára.`
        : "Minden hozzávaló szerepel már a bevásárlólistán.",
    );
  }

  return (
    <>
      <section className="recipes-intro">
        <div>
          <span className="card-kicker">SAJÁT RECEPTGYŰJTEMÉNY</span>
          <h2>Főzz egyszer, számolj könnyedén.</h2>
          <p>A teljes recept értékeit add meg, a Zenvyra kiszámolja az egy adag és a választott mennyiség makróit.</p>
        </div>
        <button type="button" onClick={() => setFormOpen((current) => !current)}>
          {formOpen ? "Mégse" : "＋ Új recept"}
        </button>
      </section>

      {message && <div className="recipe-message" role="status">{message}</div>}

      {recipes.length > 0 && (
        <div className="recipe-fit-summary">
          <span><strong>{compatibleRecipes.length}</strong> recept illeszkedik a személyes szűrőidhez.</span>
          <button type="button" onClick={() => setShowAll((current) => !current)}>{showAll ? "Csak a nekem valók" : "Összes recept"}</button>
        </div>
      )}

      {formOpen && (
        <form className="dashboard-card recipe-form" onSubmit={saveRecipe}>
          <div className="recipe-form-heading">
            <div>
              <span className="card-kicker">ÚJ RECEPT</span>
              <h2>Recept adatai</h2>
            </div>
            <div className="recipe-preview">
              <span>1 adag</span>
              <strong>{formPreview.kcal} kcal</strong>
              <small>{formatMacro(formPreview.protein)} g fehérje</small>
            </div>
          </div>

          <div className="recipe-form-grid">
            <label className="recipe-name-field">
              <span>Recept neve</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Például zöldséges csirketál" />
            </label>
            <label>
              <span>Adagok száma</span>
              <input value={servings} onChange={(event) => setServings(event.target.value)} inputMode="numeric" />
            </label>
            <label>
              <span>Teljes kalória</span>
              <input value={kcal} onChange={(event) => setKcal(event.target.value)} inputMode="decimal" placeholder="kcal" />
            </label>
            <label>
              <span>Teljes fehérje</span>
              <input value={protein} onChange={(event) => setProtein(event.target.value)} inputMode="decimal" placeholder="g" />
            </label>
            <label>
              <span>Teljes szénhidrát</span>
              <input value={carbs} onChange={(event) => setCarbs(event.target.value)} inputMode="decimal" placeholder="g" />
            </label>
            <label>
              <span>Teljes zsír</span>
              <input value={fat} onChange={(event) => setFat(event.target.value)} inputMode="decimal" placeholder="g" />
            </label>
            <label className="recipe-ingredients-field">
              <span>Hozzávalók — soronként egy</span>
              <textarea
                value={ingredientLines}
                onChange={(event) => setIngredientLines(event.target.value)}
                placeholder={"Csirkemell – 500 g\nRizs – 250 g\nPaprika – 2 db"}
                rows={5}
              />
            </label>
            <fieldset className="recipe-preference-field">
              <legend>Recept típusa</legend>
              <div className="recipe-tag-options">
                {([['omnivore', 'Mindenevő'], ['vegetarian', 'Vegetáriánus'], ['vegan', 'Vegán']] as const).map(([value, label]) => (
                  <button type="button" key={value} className={dietStyle === value ? "active" : ""} onClick={() => setDietStyle(value)}>{label}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="recipe-preference-field">
              <legend>Tartalmazott allergének</legend>
              <div className="recipe-tag-options">
                {allergenOptions.map(([value, label]) => (
                  <button type="button" key={value} className={recipeAllergens.includes(value) ? "active" : ""} onClick={() => setRecipeAllergens((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}>{label}</button>
                ))}
              </div>
            </fieldset>
          </div>
          <button type="submit" className="recipe-save-button">Recept mentése</button>
        </form>
      )}

      {recipes.length === 0 ? (
        <section className="dashboard-card recipe-empty">
          <span>♡</span>
          <h2>Még nincs saját recepted.</h2>
          <p>Kezdd egy gyakran készített kedvenccel — utána egy érintéssel naplózhatod.</p>
          <button type="button" onClick={() => setFormOpen(true)}>Első recept létrehozása</button>
        </section>
      ) : (
        <section className="recipes-grid" aria-label="Saját receptek">
          {visibleRecipes.map((recipe) => {
            const portions = selectedPortions[recipe.id] ?? 1;
            const ratio = portions / recipe.servings;
            return (
              <article className="dashboard-card recipe-card" key={recipe.id}>
                <div className="recipe-card-heading">
                  <div>
                    <span className="card-kicker">{recipe.servings} ADAGOS RECEPT</span>
                    <h2>{recipe.name}</h2>
                  </div>
                  <button
                    type="button"
                    className="recipe-delete"
                    onClick={() => setRecipes((current) => current.filter((item) => item.id !== recipe.id))}
                    aria-label={`${recipe.name} törlése`}
                  >×</button>
                </div>

                <div className="recipe-macros">
                  <div><strong>{Math.round(recipe.kcal * ratio)}</strong><span>kcal</span></div>
                  <div><strong>{formatMacro(recipe.protein * ratio)}</strong><span>fehérje</span></div>
                  <div><strong>{formatMacro(recipe.carbs * ratio)}</strong><span>szénhidrát</span></div>
                  <div><strong>{formatMacro(recipe.fat * ratio)}</strong><span>zsír</span></div>
                </div>
                <div className="recipe-tags">
                  <span>{recipe.dietStyle === "vegan" ? "Vegán" : recipe.dietStyle === "vegetarian" ? "Vegetáriánus" : "Mindenevő"}</span>
                  {(recipe.allergens ?? []).map((item) => <span key={item}>{allergenOptions.find(([value]) => value === item)?.[1] ?? item}</span>)}
                </div>

                <div className="recipe-portions">
                  <span>Naplózandó adag</span>
                  <div>
                    <button type="button" onClick={() => setSelectedPortions((current) => ({ ...current, [recipe.id]: Math.max(0.5, portions - 0.5) }))}>−</button>
                    <strong>{String(portions).replace(".", ",")}</strong>
                    <button type="button" onClick={() => setSelectedPortions((current) => ({ ...current, [recipe.id]: Math.min(10, portions + 0.5) }))}>＋</button>
                  </div>
                </div>

                <details className="recipe-ingredients">
                  <summary>Hozzávalók ({recipe.ingredients.length})</summary>
                  <ul>
                    {recipe.ingredients.map((ingredient) => (
                      <li key={ingredient.id}><span>{ingredient.name}</span><strong>{ingredient.amount}</strong></li>
                    ))}
                  </ul>
                </details>

                <div className="recipe-actions">
                  <button type="button" onClick={() => void addToMeals(recipe)}>＋ Étkezéshez</button>
                  <button type="button" onClick={() => addToShopping(recipe)}>⌑ Bevásárláshoz</button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
