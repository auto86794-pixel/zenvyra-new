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

export function ensureStarterRecipes(storageKey: string): Recipe[] {
  if (typeof window === "undefined") return starterRecipes;

  const seedKey = `${storageKey}:starter-v1`;

  try {
    const raw = window.localStorage.getItem(storageKey);
    const alreadySeeded = window.localStorage.getItem(seedKey) === "1";

    if (raw === null) {
      window.localStorage.setItem(storageKey, JSON.stringify(starterRecipes));
      window.localStorage.setItem(seedKey, "1");
      return starterRecipes;
    }

    const saved = JSON.parse(raw);

    if (Array.isArray(saved)) {
      if (saved.length === 0 && !alreadySeeded) {
        window.localStorage.setItem(storageKey, JSON.stringify(starterRecipes));
        window.localStorage.setItem(seedKey, "1");
        return starterRecipes;
      }

      if (!alreadySeeded) {
        window.localStorage.setItem(seedKey, "1");
      }

      return saved;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(starterRecipes));
    window.localStorage.setItem(seedKey, "1");
    return starterRecipes;
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

export const starterRecipes: Recipe[] = [
  {
    id: "starter-chicken-rice-bowl",
    name: "Citromos csirkés rizstál",
    servings: 2,
    kcal: 1040,
    protein: 86,
    carbs: 112,
    fat: 26,
    dietStyle: "omnivore",
    allergens: [],
    ingredients: [
      { id: "starter-chicken-rice-1", name: "Csirkemell", amount: "300 g" },
      { id: "starter-chicken-rice-2", name: "Főtt rizs", amount: "300 g" },
      { id: "starter-chicken-rice-3", name: "Cukkini", amount: "200 g" },
      { id: "starter-chicken-rice-4", name: "Paprika", amount: "1 db" },
      { id: "starter-chicken-rice-5", name: "Olívaolaj", amount: "1 evőkanál" },
      { id: "starter-chicken-rice-6", name: "Citrom", amount: "1/2 db" },
    ],
  },
  {
    id: "starter-turkey-potato",
    name: "Pulykás sültburgonya-tál",
    servings: 2,
    kcal: 960,
    protein: 78,
    carbs: 104,
    fat: 24,
    dietStyle: "omnivore",
    allergens: [],
    ingredients: [
      { id: "starter-turkey-potato-1", name: "Pulykamell", amount: "300 g" },
      { id: "starter-turkey-potato-2", name: "Burgonya", amount: "500 g" },
      { id: "starter-turkey-potato-3", name: "Paradicsom", amount: "200 g" },
      { id: "starter-turkey-potato-4", name: "Uborka", amount: "1 db" },
      { id: "starter-turkey-potato-5", name: "Olívaolaj", amount: "1 evőkanál" },
    ],
  },
  {
    id: "starter-lentil-quinoa",
    name: "Lencsés quinoa tál",
    servings: 2,
    kcal: 900,
    protein: 34,
    carbs: 132,
    fat: 24,
    dietStyle: "vegan",
    allergens: [],
    ingredients: [
      { id: "starter-lentil-quinoa-1", name: "Főtt lencse", amount: "300 g" },
      { id: "starter-lentil-quinoa-2", name: "Főtt quinoa", amount: "240 g" },
      { id: "starter-lentil-quinoa-3", name: "Paradicsom", amount: "200 g" },
      { id: "starter-lentil-quinoa-4", name: "Uborka", amount: "1 db" },
      { id: "starter-lentil-quinoa-5", name: "Olívaolaj", amount: "1 evőkanál" },
      { id: "starter-lentil-quinoa-6", name: "Citrom", amount: "1/2 db" },
    ],
  },
  {
    id: "starter-chickpea-rice",
    name: "Fűszeres csicseriborsós rizstál",
    servings: 2,
    kcal: 940,
    protein: 30,
    carbs: 146,
    fat: 26,
    dietStyle: "vegan",
    allergens: [],
    ingredients: [
      { id: "starter-chickpea-rice-1", name: "Főtt csicseriborsó", amount: "300 g" },
      { id: "starter-chickpea-rice-2", name: "Főtt rizs", amount: "260 g" },
      { id: "starter-chickpea-rice-3", name: "Cukkini", amount: "200 g" },
      { id: "starter-chickpea-rice-4", name: "Paprika", amount: "1 db" },
      { id: "starter-chickpea-rice-5", name: "Olívaolaj", amount: "1 evőkanál" },
    ],
  },
  {
    id: "starter-tofu-rice",
    name: "Zöldséges tofu-rizstál",
    servings: 2,
    kcal: 920,
    protein: 42,
    carbs: 112,
    fat: 32,
    dietStyle: "vegan",
    allergens: [],
    ingredients: [
      { id: "starter-tofu-rice-1", name: "Natúr tofu", amount: "300 g" },
      { id: "starter-tofu-rice-2", name: "Főtt rizs", amount: "280 g" },
      { id: "starter-tofu-rice-3", name: "Brokkoli", amount: "250 g" },
      { id: "starter-tofu-rice-4", name: "Sárgarépa", amount: "150 g" },
      { id: "starter-tofu-rice-5", name: "Olívaolaj", amount: "1 evőkanál" },
    ],
  },
  {
    id: "starter-egg-potato",
    name: "Tojásos burgonyatál friss zöldségekkel",
    servings: 2,
    kcal: 860,
    protein: 38,
    carbs: 86,
    fat: 40,
    dietStyle: "vegetarian",
    allergens: ["egg"],
    ingredients: [
      { id: "starter-egg-potato-1", name: "Tojás", amount: "6 db" },
      { id: "starter-egg-potato-2", name: "Burgonya", amount: "400 g" },
      { id: "starter-egg-potato-3", name: "Paradicsom", amount: "200 g" },
      { id: "starter-egg-potato-4", name: "Uborka", amount: "1 db" },
      { id: "starter-egg-potato-5", name: "Olívaolaj", amount: "1 teáskanál" },
    ],
  },
];


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
