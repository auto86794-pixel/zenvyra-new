"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
};

type Props = {
  storageKey: string;
  onAddMeal: (recipe: Recipe, portions: number) => Promise<boolean>;
  onAddShopping: (ingredients: RecipeIngredient[]) => number;
};

function loadRecipes(storageKey: string): Recipe[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function numberValue(value: string) {
  return Number(value.replace(",", "."));
}

function formatMacro(value: number) {
  return (Math.round(value * 10) / 10).toFixed(1).replace(".", ",");
}

export default function RecipesView({ storageKey, onAddMeal, onAddShopping }: Props) {
  const [recipes, setRecipes] = useState<Recipe[]>(() => loadRecipes(storageKey));
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("4");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [ingredientLines, setIngredientLines] = useState("");
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
    };
    setRecipes((current) => [recipe, ...current]);
    setSelectedPortions((current) => ({ ...current, [recipe.id]: 1 }));
    setMessage("A recept elmentve.");
    resetForm();
  }

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
          {recipes.map((recipe) => {
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
