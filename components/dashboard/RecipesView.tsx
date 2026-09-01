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
  mealTypes?: Array<"breakfast" | "lunch" | "dinner" | "snack">;
};

type Props = {
  storageKey: string;
  onAddMeal: (recipe: Recipe, portions: number) => Promise<boolean>;
  onAddShopping: (ingredients: RecipeIngredient[]) => number;
  onOpenShopping?: () => void;
  preferences: PersonalPreferences;
};

type RecipeCategory =
  | "recommended"
  | "breakfast"
  | "lunch"
  | "dinner"
  | "snack"
  | "custom";

const recipeCategoryOptions: Array<{ value: RecipeCategory; label: string }> = [
  { value: "recommended", label: "Ajánlott" },
  { value: "breakfast", label: "Reggeli" },
  { value: "lunch", label: "Ebéd" },
  { value: "dinner", label: "Vacsora" },
  { value: "snack", label: "Kisétkezés" },
  { value: "custom", label: "Saját receptek" },
];

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
    ingredients: [
      { name: "Citrom", amount: "ízlés szerint" },
      { name: "Friss zöldfűszerek", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 65, protein: 2, carbs: 10, fat: 2 },
  },
  {
    key: "mediterranean",
    label: "Mediterrán",
    ingredients: [
      { name: "Paradicsom", amount: "180 g" },
      { name: "Paprika", amount: "120 g" },
      { name: "Oregánó", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 75, protein: 3, carbs: 13, fat: 2 },
  },
  {
    key: "garlic-paprika",
    label: "Fokhagymás-paprikás",
    ingredients: [
      { name: "Fokhagyma", amount: "ízlés szerint" },
      { name: "Édes paprika", amount: "ízlés szerint" },
      { name: "Petrezselyem", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 60, protein: 2, carbs: 9, fat: 2 },
  },
  {
    key: "tomato-basil",
    label: "Paradicsomos-bazsalikomos",
    ingredients: [
      { name: "Paradicsom", amount: "250 g" },
      { name: "Friss bazsalikom", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 70, protein: 3, carbs: 12, fat: 2 },
  },
  {
    key: "curry-coconut",
    label: "Enyhén currys-kókuszos",
    ingredients: [
      { name: "Kókusztej", amount: "120 ml" },
      { name: "Curry", amount: "ízlés szerint" },
      { name: "Lime", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 85, protein: 2, carbs: 8, fat: 5 },
  },
  {
    key: "mexican",
    label: "Mexikói fűszerezésű",
    ingredients: [
      { name: "Paradicsom", amount: "120 g" },
      { name: "Kukorica", amount: "100 g" },
      { name: "Lime", amount: "ízlés szerint" },
      { name: "Mexikói fűszerek", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 80, protein: 3, carbs: 14, fat: 2 },
  },
  {
    key: "ginger-lime",
    label: "Gyömbéres-lime-os",
    ingredients: [
      { name: "Gyömbér", amount: "ízlés szerint" },
      { name: "Lime", amount: "ízlés szerint" },
      { name: "Gluténmentes tamari", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 65, protein: 3, carbs: 9, fat: 2 },
  },
  {
    key: "smoky",
    label: "Füstös-paprikás",
    ingredients: [
      { name: "Füstölt paprika", amount: "ízlés szerint" },
      { name: "Paradicsom", amount: "ízlés szerint" },
      { name: "Friss zöldfűszerek", amount: "ízlés szerint" },
    ],
    allergens: [] as string[],
    extra: { kcal: 70, protein: 2, carbs: 11, fat: 2 },
  },
  {
    key: "almond",
    label: "Mandulás-zöldfűszeres",
    ingredients: [
      { name: "Mandula", amount: "15 g" },
      { name: "Friss zöldfűszerek", amount: "ízlés szerint" },
    ],
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
          mealTypes: ["lunch", "dinner"],
          ingredients: [
            { id: `${id}-1`, name: protein.name, amount: protein.amount },
            { id: `${id}-2`, name: base.name, amount: base.amount },
            ...flavor.ingredients.map((ingredient, index) => ({
              id: `${id}-flavor-${index + 1}`,
              name: ingredient.name,
              amount: ingredient.amount,
            })),
            { id: `${id}-veg`, name: "Vegyes friss zöldség", amount: "300 g" },
            { id: `${id}-oil`, name: "Olívaolaj", amount: "2 teáskanál" },
          ],
        });
      }
    }
  }

  return recipes;
}

type LightRecipeSeed = {
  key: string;
  name: string;
  servings: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  dietStyle: "omnivore" | "vegetarian" | "vegan";
  allergens?: string[];
  mealTypes: Array<"breakfast" | "snack">;
  ingredients: Array<{ name: string; amount: string }>;
};

const breakfastSeeds: LightRecipeSeed[] = [
  { key: "oat-berry-yogurt", name: "Bogyós zabkása joghurttal", servings: 1, kcal: 390, protein: 25, carbs: 52, fat: 9, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Zabpehely", amount: "55 g" }, { name: "Natúr görög joghurt", amount: "170 g" }, { name: "Bogyós gyümölcs", amount: "120 g" }, { name: "Chiamag", amount: "10 g" }] },
  { key: "banana-oat", name: "Banános-fahéjas zabkása", servings: 1, kcal: 375, protein: 18, carbs: 62, fat: 7, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Zabpehely", amount: "55 g" }, { name: "Tej", amount: "200 ml" }, { name: "Banán", amount: "1 db" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "apple-cottage-oat", name: "Almás cottage cheese zabtál", servings: 1, kcal: 365, protein: 29, carbs: 45, fat: 8, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Cottage cheese", amount: "180 g" }, { name: "Zabpehely", amount: "45 g" }, { name: "Alma", amount: "1 db" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "egg-toast", name: "Tojásos teljes kiőrlésű pirítós", servings: 1, kcal: 410, protein: 27, carbs: 38, fat: 17, dietStyle: "vegetarian", allergens: ["egg", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Teljes kiőrlésű kenyér", amount: "2 szelet" }, { name: "Paradicsom", amount: "120 g" }, { name: "Friss zöldség", amount: "100 g" }] },
  { key: "egg-avocado-toast", name: "Avokádós-tojásos pirítós", servings: 1, kcal: 445, protein: 24, carbs: 39, fat: 22, dietStyle: "vegetarian", allergens: ["egg", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Teljes kiőrlésű kenyér", amount: "2 szelet" }, { name: "Avokádó", amount: "70 g" }, { name: "Paradicsom", amount: "100 g" }] },
  { key: "yogurt-muesli", name: "Görög joghurtos gyümölcsös müzli", servings: 1, kcal: 380, protein: 28, carbs: 48, fat: 8, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Natúr görög joghurt", amount: "220 g" }, { name: "Cukormentes müzli", amount: "45 g" }, { name: "Friss gyümölcs", amount: "150 g" }] },
  { key: "chia-pudding", name: "Vaníliás chia puding gyümölccsel", servings: 1, kcal: 350, protein: 18, carbs: 39, fat: 14, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["breakfast"], ingredients: [{ name: "Chiamag", amount: "30 g" }, { name: "Tej", amount: "220 ml" }, { name: "Natúr joghurt", amount: "100 g" }, { name: "Bogyós gyümölcs", amount: "120 g" }] },
  { key: "tofu-scramble", name: "Zöldséges tofu rántotta", servings: 1, kcal: 360, protein: 29, carbs: 23, fat: 18, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Natúr tofu", amount: "200 g" }, { name: "Paprika", amount: "100 g" }, { name: "Paradicsom", amount: "100 g" }, { name: "Teljes kiőrlésű kenyér", amount: "1 szelet" }] },
  { key: "overnight-oats", name: "Éjszakai zab bogyós gyümölccsel", servings: 1, kcal: 395, protein: 23, carbs: 55, fat: 10, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Zabpehely", amount: "55 g" }, { name: "Natúr joghurt", amount: "180 g" }, { name: "Bogyós gyümölcs", amount: "120 g" }, { name: "Chiamag", amount: "8 g" }] },
  { key: "cottage-fruit", name: "Gyümölcsös cottage cheese reggeli", servings: 1, kcal: 335, protein: 30, carbs: 35, fat: 9, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["breakfast"], ingredients: [{ name: "Cottage cheese", amount: "220 g" }, { name: "Banán", amount: "1/2 db" }, { name: "Bogyós gyümölcs", amount: "100 g" }, { name: "Chiamag", amount: "10 g" }] },
  { key: "vegan-oat-banana", name: "Növényi banános zabkása", servings: 1, kcal: 390, protein: 15, carbs: 67, fat: 9, dietStyle: "vegan", allergens: ["gluten"], mealTypes: ["breakfast"], ingredients: [{ name: "Zabpehely", amount: "60 g" }, { name: "Cukormentes növényi ital", amount: "220 ml" }, { name: "Banán", amount: "1 db" }, { name: "Chiamag", amount: "10 g" }] },
  { key: "egg-cottage-plate", name: "Tojásos-cottage cheese reggelitál", servings: 1, kcal: 405, protein: 38, carbs: 24, fat: 18, dietStyle: "vegetarian", allergens: ["egg", "milk"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Cottage cheese", amount: "150 g" }, { name: "Friss zöldség", amount: "200 g" }, { name: "Teljes kiőrlésű kenyér", amount: "1 szelet" }] },

  // Tej- és gluténmentes reggelik – hogy szűrés mellett se maradjon üres a reggeli.
  { key: "apple-rice-porridge", name: "Almás-fahéjas rizskása", servings: 1, kcal: 385, protein: 9, carbs: 72, fat: 8, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt rizs", amount: "220 g" }, { name: "Alma", amount: "1 db" }, { name: "Chiamag", amount: "15 g" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "banana-rice-chia", name: "Banános-chiamagos rizstál", servings: 1, kcal: 405, protein: 9, carbs: 76, fat: 9, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt rizs", amount: "210 g" }, { name: "Banán", amount: "1 db" }, { name: "Chiamag", amount: "18 g" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "berry-quinoa", name: "Bogyós gyümölcsös quinoa reggeli", servings: 1, kcal: 390, protein: 13, carbs: 61, fat: 11, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt quinoa", amount: "220 g" }, { name: "Bogyós gyümölcs", amount: "140 g" }, { name: "Chiamag", amount: "15 g" }, { name: "Banán", amount: "1/2 db" }] },
  { key: "apple-quinoa", name: "Almás-quinoás reggelitál", servings: 1, kcal: 400, protein: 12, carbs: 66, fat: 10, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt quinoa", amount: "220 g" }, { name: "Alma", amount: "1 db" }, { name: "Chiamag", amount: "12 g" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "egg-potato-breakfast", name: "Tojásos burgonyás reggelitál", servings: 1, kcal: 420, protein: 24, carbs: 43, fat: 17, dietStyle: "vegetarian", allergens: ["egg"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Sült burgonya", amount: "220 g" }, { name: "Paradicsom", amount: "120 g" }, { name: "Uborka", amount: "120 g" }] },
  { key: "egg-sweet-potato", name: "Tojásos édesburgonya reggeli", servings: 1, kcal: 430, protein: 23, carbs: 47, fat: 18, dietStyle: "vegetarian", allergens: ["egg"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Sült édesburgonya", amount: "230 g" }, { name: "Paprika", amount: "120 g" }, { name: "Paradicsom", amount: "100 g" }] },
  { key: "chickpea-potato-breakfast", name: "Csicseriborsós burgonyás reggelitál", servings: 1, kcal: 415, protein: 17, carbs: 61, fat: 11, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt csicseriborsó", amount: "140 g" }, { name: "Sült burgonya", amount: "180 g" }, { name: "Paradicsom", amount: "120 g" }, { name: "Uborka", amount: "120 g" }] },
  { key: "lentil-quinoa-breakfast", name: "Lencsés-quinoás sós reggelitál", servings: 1, kcal: 410, protein: 21, carbs: 62, fat: 9, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt lencse", amount: "150 g" }, { name: "Főtt quinoa", amount: "150 g" }, { name: "Paradicsom", amount: "120 g" }, { name: "Uborka", amount: "120 g" }] },
  { key: "tofu-potato-breakfast", name: "Tofus-zöldséges burgonyatál", servings: 1, kcal: 405, protein: 27, carbs: 39, fat: 17, dietStyle: "vegan", allergens: ["soy"], mealTypes: ["breakfast"], ingredients: [{ name: "Natúr tofu", amount: "180 g" }, { name: "Sült burgonya", amount: "180 g" }, { name: "Paprika", amount: "120 g" }, { name: "Paradicsom", amount: "100 g" }] },
  { key: "chickpea-avocado-breakfast", name: "Csicseriborsós-avokádós reggelitál", servings: 1, kcal: 425, protein: 15, carbs: 52, fat: 18, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt csicseriborsó", amount: "150 g" }, { name: "Avokádó", amount: "70 g" }, { name: "Paradicsom", amount: "120 g" }, { name: "Uborka", amount: "120 g" }] },
  { key: "rice-egg-vegetable", name: "Tojásos-zöldséges rizstál reggelire", servings: 1, kcal: 415, protein: 24, carbs: 49, fat: 14, dietStyle: "vegetarian", allergens: ["egg"], mealTypes: ["breakfast"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Főtt rizs", amount: "180 g" }, { name: "Paprika", amount: "100 g" }, { name: "Paradicsom", amount: "100 g" }] },
  { key: "fruit-rice-chia", name: "Gyümölcsös-chiamagos rizsreggeli", servings: 1, kcal: 395, protein: 8, carbs: 73, fat: 9, dietStyle: "vegan", mealTypes: ["breakfast"], ingredients: [{ name: "Főtt rizs", amount: "210 g" }, { name: "Friss gyümölcs", amount: "170 g" }, { name: "Chiamag", amount: "18 g" }, { name: "Fahéj", amount: "ízlés szerint" }] },
];

const snackSeeds: LightRecipeSeed[] = [
  { key: "yogurt-berries", name: "Görög joghurt bogyós gyümölccsel", servings: 1, kcal: 190, protein: 18, carbs: 20, fat: 4, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["snack"], ingredients: [{ name: "Natúr görög joghurt", amount: "170 g" }, { name: "Bogyós gyümölcs", amount: "100 g" }] },
  { key: "cottage-apple", name: "Cottage cheese almával", servings: 1, kcal: 205, protein: 21, carbs: 24, fat: 4, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["snack"], ingredients: [{ name: "Cottage cheese", amount: "160 g" }, { name: "Alma", amount: "1 db" }] },
  { key: "banana-yogurt", name: "Banános joghurtpohár", servings: 1, kcal: 215, protein: 17, carbs: 31, fat: 3, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["snack"], ingredients: [{ name: "Natúr joghurt", amount: "180 g" }, { name: "Banán", amount: "1/2 db" }, { name: "Fahéj", amount: "ízlés szerint" }] },
  { key: "hummus-veg", name: "Hummusz friss zöldségekkel", servings: 1, kcal: 225, protein: 8, carbs: 24, fat: 11, dietStyle: "vegan", mealTypes: ["snack"], ingredients: [{ name: "Hummusz", amount: "70 g" }, { name: "Sárgarépa", amount: "100 g" }, { name: "Uborka", amount: "120 g" }] },
  { key: "egg-veg", name: "Főtt tojás friss zöldségekkel", servings: 1, kcal: 195, protein: 15, carbs: 9, fat: 11, dietStyle: "vegetarian", allergens: ["egg"], mealTypes: ["snack"], ingredients: [{ name: "Tojás", amount: "2 db" }, { name: "Friss zöldség", amount: "200 g" }] },
  { key: "chia-yogurt", name: "Chiamagos joghurtpohár", servings: 1, kcal: 210, protein: 16, carbs: 18, fat: 9, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["snack"], ingredients: [{ name: "Natúr joghurt", amount: "170 g" }, { name: "Chiamag", amount: "15 g" }, { name: "Bogyós gyümölcs", amount: "70 g" }] },
  { key: "fruit-cottage", name: "Gyümölcsös cottage cheese pohár", servings: 1, kcal: 200, protein: 22, carbs: 21, fat: 4, dietStyle: "vegetarian", allergens: ["milk"], mealTypes: ["snack"], ingredients: [{ name: "Cottage cheese", amount: "160 g" }, { name: "Friss gyümölcs", amount: "120 g" }] },
  { key: "apple-nut", name: "Alma mandulával", servings: 1, kcal: 220, protein: 6, carbs: 27, fat: 11, dietStyle: "vegan", allergens: ["nuts"], mealTypes: ["snack"], ingredients: [{ name: "Alma", amount: "1 db" }, { name: "Mandula", amount: "20 g" }] },
  { key: "banana-nut", name: "Banán mandulával", servings: 1, kcal: 230, protein: 6, carbs: 32, fat: 10, dietStyle: "vegan", allergens: ["nuts"], mealTypes: ["snack"], ingredients: [{ name: "Banán", amount: "1 db" }, { name: "Mandula", amount: "18 g" }] },
  { key: "tofu-dip", name: "Fűszeres tofukrém zöldségekkel", servings: 1, kcal: 205, protein: 18, carbs: 13, fat: 10, dietStyle: "vegan", mealTypes: ["snack"], ingredients: [{ name: "Natúr tofu", amount: "130 g" }, { name: "Citrom", amount: "1/2 db" }, { name: "Uborka", amount: "150 g" }, { name: "Paprika", amount: "100 g" }] },
  { key: "oat-yogurt", name: "Mini zabos joghurtpohár", servings: 1, kcal: 215, protein: 17, carbs: 29, fat: 4, dietStyle: "vegetarian", allergens: ["milk", "gluten"], mealTypes: ["snack"], ingredients: [{ name: "Natúr joghurt", amount: "150 g" }, { name: "Zabpehely", amount: "25 g" }, { name: "Bogyós gyümölcs", amount: "70 g" }] },
  { key: "roasted-chickpea", name: "Ropogós fűszeres csicseriborsó", servings: 1, kcal: 230, protein: 11, carbs: 34, fat: 6, dietStyle: "vegan", mealTypes: ["snack"], ingredients: [{ name: "Főtt csicseriborsó", amount: "130 g" }, { name: "Olívaolaj", amount: "1 teáskanál" }, { name: "Fűszerek", amount: "ízlés szerint" }] },
];

function buildLightRecipes(): Recipe[] {
  return [...breakfastSeeds, ...snackSeeds].map((seed) => ({
    id: `zenvyra-light-${seed.key}`,
    name: seed.name,
    servings: seed.servings,
    kcal: seed.kcal,
    protein: seed.protein,
    carbs: seed.carbs,
    fat: seed.fat,
    dietStyle: seed.dietStyle,
    allergens: seed.allergens ?? [],
    mealTypes: seed.mealTypes,
    ingredients: seed.ingredients.map((ingredient, index) => ({
      id: `zenvyra-light-${seed.key}-${index + 1}`,
      name: ingredient.name,
      amount: ingredient.amount,
    })),
  }));
}

const allergenOptions = [
  ["milk", "Tej"],
  ["gluten", "Glutén"],
  ["egg", "Tojás"],
  ["nuts", "Diófélék"],
  ["fish", "Hal"],
  ["soy", "Szója"],
  ["sesame", "Szezám"],
] as const;

type SupportedAllergen = (typeof allergenOptions)[number][0];

const allergenIngredientRules: Array<{
  allergen: SupportedAllergen;
  terms: string[];
}> = [
  {
    allergen: "milk",
    terms: [
      "tej",
      "joghurt",
      "görög joghurt",
      "cottage cheese",
      "túró",
      "sajt",
      "kefir",
      "tejszín",
      "vaj",
    ],
  },
  {
    allergen: "gluten",
    terms: [
      "búza",
      "durumtészta",
      "tészta",
      "bulgur",
      "kenyér",
      "pirítós",
      "müzli",
      "zabpehely",
      "zab",
    ],
  },
  {
    allergen: "egg",
    terms: ["tojás"],
  },
  {
    allergen: "nuts",
    terms: [
      "mandula",
      "dió",
      "mogyoró",
      "kesudió",
      "pisztácia",
      "pekándió",
      "törökmogyoró",
    ],
  },
  {
    allergen: "fish",
    terms: ["lazac", "tonhal", "hal"],
  },
  {
    allergen: "soy",
    terms: ["tofu", "tempeh", "tamari", "szója"],
  },
  {
    allergen: "sesame",
    terms: ["szezám", "tahini", "hummusz"],
  },
];

function inferRecipeAllergens(recipe: Recipe): string[] {
  const searchable = [
    recipe.name,
    ...recipe.ingredients.map((ingredient) => ingredient.name),
  ]
    .join(" ")
    .toLocaleLowerCase("hu");

  const inferred = allergenIngredientRules
    .filter((rule) =>
      rule.terms.some((term) =>
        searchable.includes(term.toLocaleLowerCase("hu")),
      ),
    )
    .map((rule) => rule.allergen);

  return uniqueStrings([...(recipe.allergens ?? []), ...inferred]);
}

function auditRecipeAllergens(recipe: Recipe): Recipe {
  return {
    ...recipe,
    allergens: inferRecipeAllergens(recipe),
  };
}


// 648 főétel + külön reggeli és kisétkezés receptek.
// A mealTypes mező alapján a napi menütervező már nem csak makró szerint,
// hanem az étkezés jellegéhez illően is tud majd választani.
export const starterRecipes: Recipe[] = [
  ...buildStarterRecipes(),
  ...buildLightRecipes(),
].map(auditRecipeAllergens);

export function ensureStarterRecipes(storageKey: string): Recipe[] {
  if (typeof window === "undefined") return starterRecipes;

  const seedKey = `${storageKey}:starter-v7-atomic-ingredients`;

  try {
    const raw = window.localStorage.getItem(storageKey);
    const alreadyUpgraded = window.localStorage.getItem(seedKey) === "1";
    const saved = raw ? JSON.parse(raw) : [];
    const savedRecipes: Recipe[] = Array.isArray(saved)
      ? saved.map(auditRecipeAllergens)
      : [];

    if (alreadyUpgraded) {
      const audited = savedRecipes.length > 0 ? savedRecipes : starterRecipes;
      window.localStorage.setItem(storageKey, JSON.stringify(audited));
      return audited;
    }

    // A korábbi automatikusan generált Zenvyra recepteket frissítjük,
    // a felhasználó saját receptjeit viszont változatlanul megtartjuk.
    const customRecipes = savedRecipes.filter(
      (recipe) => !recipe.id.startsWith("zenvyra-"),
    );
    const merged = [...starterRecipes, ...customRecipes].map(
      auditRecipeAllergens,
    );

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



function formatScaledAmount(value: number) {
  return String(Math.round(value * 100) / 100).replace(".", ",");
}

export default function RecipesView({
  storageKey,
  onAddMeal,
  onAddShopping,
  onOpenShopping,
  preferences,
}: Props) {
  const [detailRecipe, setDetailRecipe] = useState<Recipe | null>(null);
  const [shoppingAddedRecipeId, setShoppingAddedRecipeId] = useState<string | null>(null);

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
  const [recipeCategory, setRecipeCategory] =
    useState<RecipeCategory>("recommended");
  const [showMoreRecipes, setShowMoreRecipes] = useState(false);
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

    const recipe: Recipe = auditRecipeAllergens({
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
    });
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
    const auditedAllergens = inferRecipeAllergens(recipe);
    const allergenMatches = !auditedAllergens.some((item) =>
      preferences.allergens.includes(item),
    );
    const ingredientMatches = !recipe.ingredients.some((ingredient) =>
      preferences.disliked_ingredients.some((item) => ingredient.name.toLocaleLowerCase("hu").includes(item)),
    );
    return dietMatches && allergenMatches && ingredientMatches;
  }), [preferences, recipes]);

  const recipeSource = showAll ? recipes : compatibleRecipes;

  const categorizedRecipes = useMemo(() => {
    const source = recipeSource.filter((recipe) => {
      if (recipeCategory === "recommended") return true;
      if (recipeCategory === "custom") {
        return !recipe.id.startsWith("zenvyra-");
      }

      if (!recipe.mealTypes || recipe.mealTypes.length === 0) {
        return recipeCategory === "lunch" || recipeCategory === "dinner";
      }

      return recipe.mealTypes.includes(recipeCategory);
    });

    const proteinOrder = [
      "chicken",
      "turkey",
      "salmon",
      "tuna",
      "beef",
      "egg",
      "tofu",
      "chickpea",
      "lentil",
      "tempeh",
      "cottage",
      "beans",
    ];

    const baseOrder = [
      "rice",
      "potato",
      "quinoa",
      "pasta",
      "bulgur",
      "sweetpotato",
    ];

    const flavorOrder = [
      "lemon",
      "mediterranean",
      "garlic-paprika",
      "tomato-basil",
      "curry-coconut",
      "mexican",
      "ginger-lime",
      "smoky",
      "almond",
    ];

    const generatedMainMeals: Recipe[] = [];
    const lightMeals: Recipe[] = [];
    const customMeals: Recipe[] = [];

    for (const recipe of source) {
      if (recipe.id.startsWith("zenvyra-light-")) {
        lightMeals.push(recipe);
      } else if (recipe.id.startsWith("zenvyra-")) {
        generatedMainMeals.push(recipe);
      } else {
        customMeals.push(recipe);
      }
    }

    // A generált főételeket nem a régi "összes csirke, aztán összes pulyka"
    // sorrendben mutatjuk. Először fehérjeforrást váltunk, majd köretet és
    // ízvilágot, így a képernyőn valódi változatosság látszik.
    generatedMainMeals.sort((a, b) => {
      const parse = (recipe: Recipe) => {
        const match = recipe.id.match(
          /^zenvyra-(chicken|turkey|salmon|tuna|beef|egg|tofu|chickpea|lentil|tempeh|cottage|beans)-(rice|potato|quinoa|pasta|bulgur|sweetpotato)-(.+)$/,
        );
        if (!match) return [999, 999, 999] as const;

        return [
          flavorOrder.indexOf(match[3]),
          baseOrder.indexOf(match[2]),
          proteinOrder.indexOf(match[1]),
        ] as const;
      };

      const aKey = parse(a);
      const bKey = parse(b);

      // A protein legyen a leggyorsabban váltakozó elem.
      if (aKey[0] !== bKey[0]) return aKey[0] - bKey[0];
      if (aKey[1] !== bKey[1]) return aKey[1] - bKey[1];
      return aKey[2] - bKey[2];
    });

    // "Ajánlott" nézetben előre keverjük a reggeliket/kisétkezéseket és
    // a főételeket, hogy ne egyetlen recepttípus uralja az első képernyőt.
    if (recipeCategory === "recommended") {
      const breakfast = lightMeals.filter((recipe) =>
        recipe.mealTypes?.includes("breakfast"),
      );
      const snacks = lightMeals.filter((recipe) =>
        recipe.mealTypes?.includes("snack"),
      );

      const mixed: Recipe[] = [];
      const mainQueue = [...generatedMainMeals];
      const breakfastQueue = [...breakfast];
      const snackQueue = [...snacks];

      while (
        mainQueue.length > 0 ||
        breakfastQueue.length > 0 ||
        snackQueue.length > 0
      ) {
        if (mainQueue.length > 0) mixed.push(mainQueue.shift()!);
        if (breakfastQueue.length > 0) mixed.push(breakfastQueue.shift()!);
        if (mainQueue.length > 0) mixed.push(mainQueue.shift()!);
        if (snackQueue.length > 0) mixed.push(snackQueue.shift()!);
      }

      return [...customMeals, ...mixed];
    }

    return [...customMeals, ...lightMeals, ...generatedMainMeals];
  }, [recipeCategory, recipeSource]);

  const visibleRecipes = showMoreRecipes
    ? categorizedRecipes
    : categorizedRecipes.slice(0, 24);

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

  function addDetailRecipeToShopping(recipe: Recipe) {
    try {
      const added = onAddShopping(recipe.ingredients);

      setShoppingAddedRecipeId(recipe.id);
      setMessage(
        added > 0
          ? `✓ ${added} hozzávaló hozzáadva a bevásárlólistához.`
          : "✓ A recept hozzávalói már szerepelnek a bevásárlólistán.",
      );

      // Azonnal a bevásárlólistára visszük a felhasználót.
      // A céloldalon külön visszajelzés is megjelenik.
      setDetailRecipe(null);
      onOpenShopping?.();
    } catch {
      setShoppingAddedRecipeId(null);
      setMessage("A bevásárlólista frissítése nem sikerült.");
    }
  }

  function scaleIngredientAmount(
    amount: string,
    ratio: number,
  ): string {
    const original = amount.trim();
    const normalized = original
      .toLocaleLowerCase("hu")
      .replace(",", ".")
      .replace("½", "0.5");

    if (
      !normalized ||
      normalized.includes("ízlés szerint") ||
      normalized.includes("szükség szerint")
    ) {
      return original;
    }

    const fractionMatch = normalized.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/);
    if (fractionMatch) {
      const denominator = Number(fractionMatch[2]);
      if (denominator > 0) {
        const value = (Number(fractionMatch[1]) / denominator) * ratio;
        return `${formatScaledAmount(value)} ${fractionMatch[3].trim() || "db"}`.trim();
      }
    }

    const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (!match) return original;

    const value = Number(match[1]) * ratio;
    const unit = match[2].trim();

    return `${formatScaledAmount(value)}${unit ? ` ${unit}` : ""}`;
  }

  function scaledRecipeForPortions(
    recipe: Recipe,
    portions: number,
  ): Recipe {
    const servings = Math.max(1, recipe.servings);
    const ratio = portions / servings;

    return {
      ...recipe,
      servings: portions,
      kcal: recipe.kcal * ratio,
      protein: recipe.protein * ratio,
      carbs: recipe.carbs * ratio,
      fat: recipe.fat * ratio,
      ingredients: recipe.ingredients.map((ingredient) => ({
        ...ingredient,
        amount: scaleIngredientAmount(ingredient.amount, ratio),
      })),
    };
  }

  function preparationSteps(recipe: Recipe): string[] {
    const names = recipe.ingredients.map((item) =>
      item.name.toLocaleLowerCase("hu"),
    );
    const joined = names.join(" ");

    const has = (pattern: RegExp) => pattern.test(joined);
    const steps: string[] = [
      "Készítsd ki a hozzávalókat. Mosd meg a zöldségeket, és legyen kéznél egy kés, vágódeszka, serpenyő és kisebb lábas.",
    ];

    // Köret – egyszerű, kezdőbarát utasítások.
    if (has(/főtt rizs|rizs/)) {
      steps.push(
        "Ha a rizs még nincs megfőzve: 1 rész rizshez adj kb. 2 rész vizet. Forrald fel, majd kis lángon, fedő alatt főzd 12–15 percig. Ha puha és a vizet felszívta, kész.",
      );
    } else if (has(/quinoa/)) {
      steps.push(
        "Ha a quinoa még nincs megfőzve: öblítsd át, majd 1 rész quinoát 2 rész vízzel főzz kis lángon kb. 15 percig. Akkor kész, amikor puha és a vizet felszívta.",
      );
    } else if (has(/bulgur/)) {
      steps.push(
        "Ha a bulgur még nincs elkészítve: öntsd le kb. kétszeres mennyiségű forró vízzel, fedd le, és hagyd állni 12–15 percig.",
      );
    } else if (has(/durumtészta|tészta/)) {
      steps.push(
        "Forralj vizet egy lábasban. Tedd bele a tésztát, és főzd a csomagoláson megadott ideig, általában 8–12 percig. Ezután szűrd le.",
      );
    } else if (has(/édesburgonya|burgonya/)) {
      steps.push(
        "Vágd a burgonyát kb. 2–3 cm-es darabokra. Főzd enyhén sós vízben 12–18 percig. Villával szúrd meg: ha könnyen belemegy, kész.",
      );
    }

    // Fehérjeforrás – külön kezelve, hogy ne legyen homályos a sütés.
    if (has(/csirk/)) {
      steps.push(
        "Vágd a csirkemellet kb. 2–3 cm-es darabokra. Melegíts fel egy serpenyőt kevés olívaolajjal, majd közepes lángon süsd 7–9 percig. Közben 2–3 alkalommal fordítsd át. Akkor kész, ha belül már sehol sem rózsaszín.",
      );
    } else if (has(/pulyk/)) {
      steps.push(
        "Vágd a pulykahúst kb. 2–3 cm-es darabokra. Kevés olajon, közepes lángon süsd 7–9 percig, közben többször fordítsd át. Belül ne maradjon rózsaszín.",
      );
    } else if (has(/marha/)) {
      steps.push(
        "Vágd a marhahúst kisebb, egyforma darabokra. Forró serpenyőben, kevés olajon süsd kb. 5–8 percig, közben fordítsd át. Ha darált marhahúst használsz, süsd addig, amíg mindenhol barnára sül.",
      );
    } else if (has(/lazac/)) {
      steps.push(
        "Melegíts fel egy serpenyőt kevés olajjal. A lazacot közepes lángon süsd oldalanként kb. 3–4 percig. Akkor jó, ha a közepe már nem nyers és villával könnyen szétnyílik.",
      );
    } else if (has(/tonhal/)) {
      steps.push(
        "Ha konzerv tonhalat használsz, öntsd le róla a levet, majd villával lazítsd szét. Nem kell külön megsütni.",
      );
    } else if (has(/tofu/)) {
      steps.push(
        "Vágd a tofut kb. 2 cm-es kockákra. Kevés olajon, közepes lángon süsd 6–8 percig, közben fordítsd át, hogy több oldala enyhén megpiruljon.",
      );
    } else if (has(/tojás/)) {
      steps.push(
        "A tojást üsd egy tálba, villával keverd össze, majd közepes lángon, kevés olajon süsd 3–4 percig. Kevergesd, amíg már nem folyós.",
      );
    }

    if (has(/zöldség|paradics|paprika|hagyma|kukorica/)) {
      steps.push(
        "A zöldségeket vágd falatnyi darabokra. Tedd a serpenyőbe, és közepes lángon süsd 4–5 percig. Közben néhányszor keverd át.",
      );
    } else if (has(/uborka|saláta|avokád/)) {
      steps.push(
        "A friss zöldségeket vágd falatnyi darabokra. Ezeket nem kell megsütni.",
      );
    }

    // Ízvilág – az ízesítők a megfelelő pillanatban kerüljenek bele.
    if (has(/kókusztej|curry/)) {
      steps.push(
        "Add hozzá a kókusztejet és a curryt. Keverd össze, majd kis lángon főzd még 3–4 percig.",
      );
    } else if (has(/gyömbér|tamari/)) {
      steps.push(
        "Add hozzá a gyömbért és a tamarit. Keverd át, és süsd még kb. 1 percig.",
      );
    } else if (has(/paradicsom/) && has(/bazsalikom|oregánó/)) {
      steps.push(
        "Add hozzá a paradicsomot és a zöldfűszert. Keverd össze, majd süsd még 2–3 percig.",
      );
    } else if (has(/füstölt paprika|mexikói fűszer/)) {
      steps.push(
        "Szórd rá a fűszereket, keverd jól össze, és süsd még kb. 1 percig.",
      );
    }

    if (has(/citrom|lime/)) {
      steps.push(
        "Vedd le a serpenyőt a tűzről, és csak ezután facsard rá a citromot vagy lime-ot.",
      );
    }

    if (has(/mandula/)) {
      steps.push(
        "A mandulát a végén szórd az étel tetejére.",
      );
    }

    steps.push(
      "Tedd a köretet és a többi elkészült hozzávalót egy tányérra. Kész.",
    );

    return steps.slice(0, 7);
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

      {recipes.length > 0 && (
        <div className="recipe-preference-field" style={{ marginBottom: 20 }}>
          <div className="recipe-tag-options" aria-label="Receptkategóriák">
            {recipeCategoryOptions.map((option) => (
              <button
                type="button"
                key={option.value}
                className={recipeCategory === option.value ? "active" : ""}
                onClick={() => {
                  setRecipeCategory(option.value);
                  setShowMoreRecipes(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <small>
            {categorizedRecipes.length} recept ebben a kategóriában · az első
            oldalon változatos fehérjeforrásokat és ételtípusokat mutatunk.
          </small>
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
                  {(recipe.mealTypes ?? []).map((mealType) => (
                    <span key={mealType}>
                      {mealType === "breakfast"
                        ? "Reggeli"
                        : mealType === "lunch"
                          ? "Ebéd"
                          : mealType === "dinner"
                            ? "Vacsora"
                            : "Kisétkezés"}
                    </span>
                  ))}
                  {inferRecipeAllergens(recipe).map((item) => (
                    <span key={item}>
                      {allergenOptions.find(([value]) => value === item)?.[1] ?? item}
                    </span>
                  ))}
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
                      <li key={ingredient.id}><span>{ingredient.name}</span><strong>{scaleIngredientAmount(ingredient.amount, ratio)}</strong></li>
                    ))}
                  </ul>
                </details>

                <div className="recipe-actions">
                  <button type="button" onClick={() => {
                    setShoppingAddedRecipeId(null);
                    setDetailRecipe(recipe);
                  }}>Részletek →</button>
                  <button type="button" onClick={() => void addToMeals(recipe)}>＋ Étkezéshez</button>
                  <button type="button" onClick={() => addDetailRecipeToShopping(scaledRecipeForPortions(recipe, selectedPortions[recipe.id] ?? 1))}>⌑ Bevásárláshoz</button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {detailRecipe && (() => {
        const portions = selectedPortions[detailRecipe.id] ?? 1;
        const servings = Math.max(1, detailRecipe.servings);
        const ratio = portions / servings;
        const scaledDetailRecipe = scaledRecipeForPortions(
          detailRecipe,
          portions,
        );
        const allergens = inferRecipeAllergens(detailRecipe);
        const steps = preparationSteps(detailRecipe);

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${detailRecipe.name} részletei`}
            onClick={() => setDetailRecipe(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(49, 28, 72, 0.48)",
              backdropFilter: "blur(6px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
            }}
          >
            <article
              className="dashboard-card"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(860px, 100%)",
                maxHeight: "92vh",
                overflowY: "auto",
                borderRadius: 28,
                padding: "clamp(22px, 4vw, 38px)",
                boxShadow: "0 28px 80px rgba(49, 28, 72, 0.24)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 18,
                  alignItems: "flex-start",
                }}
              >
                <div>
                  <span className="card-kicker">RECEPT RÉSZLETEI</span>
                  <h2 style={{ marginBottom: 8 }}>{detailRecipe.name}</h2>
                  <p style={{ margin: 0, opacity: 0.72 }}>
                    A megadott szűrők alapján megfelelő recept.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Recept bezárása"
                  onClick={() => setDetailRecipe(null)}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    border: "1px solid rgba(95, 61, 130, 0.14)",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 22,
                  }}
                >
                  ×
                </button>
              </div>

              <div className="recipe-macros" style={{ marginTop: 24 }}>
                <div><strong>{Math.round(detailRecipe.kcal * ratio)}</strong><span>kcal</span></div>
                <div><strong>{formatMacro(detailRecipe.protein * ratio)}</strong><span>fehérje</span></div>
                <div><strong>{formatMacro(detailRecipe.carbs * ratio)}</strong><span>szénhidrát</span></div>
                <div><strong>{formatMacro(detailRecipe.fat * ratio)}</strong><span>zsír</span></div>
              </div>

              <div className="recipe-tags" style={{ marginTop: 16 }}>
                <span>
                  {detailRecipe.dietStyle === "vegan"
                    ? "Vegán"
                    : detailRecipe.dietStyle === "vegetarian"
                      ? "Vegetáriánus"
                      : "Mindenevő"}
                </span>
                {(detailRecipe.mealTypes ?? []).map((mealType) => (
                  <span key={mealType}>
                    {mealType === "breakfast"
                      ? "Reggeli"
                      : mealType === "lunch"
                        ? "Ebéd"
                        : mealType === "dinner"
                          ? "Vacsora"
                          : "Kisétkezés"}
                  </span>
                ))}
                {allergens.map((item) => (
                  <span key={item}>
                    {allergenOptions.find(([value]) => value === item)?.[1] ?? item}
                  </span>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 22,
                  marginTop: 28,
                }}
              >
                <section>
                  <span className="card-kicker">HOZZÁVALÓK</span>
                  <h3 style={{ marginTop: 8 }}>
                    {String(portions).replace(".", ",")} adaghoz
                  </h3>
                  <ul
                    style={{
                      listStyle: "none",
                      margin: "14px 0 0",
                      padding: 0,
                      display: "grid",
                      gap: 10,
                    }}
                  >
                    {scaledDetailRecipe.ingredients.map((ingredient) => (
                      <li
                        key={ingredient.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 16,
                          paddingBottom: 10,
                          borderBottom: "1px solid rgba(95, 61, 130, 0.09)",
                        }}
                      >
                        <span>{ingredient.name}</span>
                        <strong>{ingredient.amount}</strong>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <span className="card-kicker">ELKÉSZÍTÉS</span>
                  <h3 style={{ marginTop: 8 }}>Lépésről lépésre</h3>
                  <ol
                    style={{
                      margin: "14px 0 0",
                      paddingLeft: 22,
                      display: "grid",
                      gap: 12,
                    }}
                  >
                    {steps.map((step, index) => (
                      <li key={`${detailRecipe.id}-step-${index}`}>{step}</li>
                    ))}
                  </ol>
                </section>
              </div>

              {shoppingAddedRecipeId === detailRecipe.id && (
                <div
                  role="status"
                  style={{
                    marginTop: 22,
                    padding: "12px 16px",
                    borderRadius: 14,
                    background: "rgba(147, 91, 190, 0.09)",
                    fontWeight: 700,
                  }}
                >
                  ✓ Hozzáadva a bevásárlólistához
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 28,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(95, 61, 130, 0.1)",
                }}
              >
                <div className="recipe-portions" style={{ margin: 0 }}>
                  <span>Adag</span>
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPortions((current) => ({
                          ...current,
                          [detailRecipe.id]: Math.max(0.5, portions - 0.5),
                        }))
                      }
                    >
                      −
                    </button>
                    <strong>{String(portions).replace(".", ",")}</strong>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPortions((current) => ({
                          ...current,
                          [detailRecipe.id]: Math.min(10, portions + 0.5),
                        }))
                      }
                    >
                      ＋
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => addDetailRecipeToShopping(scaledDetailRecipe)}
                    disabled={shoppingAddedRecipeId === detailRecipe.id}
                    style={{
                      opacity: shoppingAddedRecipeId === detailRecipe.id ? 0.78 : 1,
                      cursor:
                        shoppingAddedRecipeId === detailRecipe.id
                          ? "default"
                          : "pointer",
                    }}
                  >
                    {shoppingAddedRecipeId === detailRecipe.id
                      ? "✓ Hozzáadva"
                      : "⌑ Bevásárláshoz"}
                  </button>
                  <button
                    type="button"
                    className="recipe-save-button"
                    onClick={() => void addToMeals(scaledDetailRecipe)}
                    style={{ margin: 0 }}
                  >
                    ＋ Hozzáadás a mai étkezésekhez
                  </button>
                </div>
              </div>
            </article>
          </div>
        );
      })()}

      {categorizedRecipes.length > 24 && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
          <button
            type="button"
            className="outline-button"
            onClick={() => setShowMoreRecipes((current) => !current)}
          >
            {showMoreRecipes
              ? "Kevesebb recept"
              : `További receptek (${categorizedRecipes.length - 24})`}
          </button>
        </div>
      )}
    </>
  );
}
