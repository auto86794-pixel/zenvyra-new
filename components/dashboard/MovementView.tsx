"use client";

import { useMemo, useState } from "react";

export type Workout = {
  id: string;
  title: string;
  minutes: number;
  level: "Kezdő" | "Középhaladó" | "Haladó";
  focus: string;
  description: string;
  steps: string[];
  avoidIf?: Array<
    "knee" | "back" | "shoulder" | "wrist" | "ankle" | "jumping"
  >;
};

export type MovementEntry = {
  id: string;
  date: string;
  title: string;
  minutes: number;
};

type Props = {
  history: MovementEntry[];
  onComplete: (workout: Workout) => Promise<boolean>;
  preferredMinutes: 10 | 15 | 20 | 30 | 40;
  preferredLevel: "beginner" | "intermediate" | "advanced";
  movementLimitations?: string[];
};

type DurationFilter = "all" | "10" | "15" | "20" | "30" | "40";

type LimitationKey =
  | "knee"
  | "back"
  | "shoulder"
  | "wrist"
  | "ankle"
  | "jumping";

const levelRank: Record<Workout["level"], number> = {
  Kezdő: 1,
  Középhaladó: 2,
  Haladó: 3,
};

export const workoutLibrary: Workout[] = [
  {
    id: "morning-mobility",
    title: "Reggeli átmozgatás",
    minutes: 10,
    level: "Kezdő",
    focus: "Mobilitás",
    description: "Finom ébresztő mozdulatok az egész testnek.",
    steps: [
      "Váll- és nyakkörzés – 60 mp",
      "Macska–tehén átmozgatás – 2 × 8 ismétlés",
      "Csípőkörzés és csípőmobilizálás – 2 perc",
      "Lassú teljes testes nyújtás – 4 perc",
    ],
    avoidIf: ["shoulder"],
  },
  {
    id: "gentle-core",
    title: "Kíméletes törzserősítés",
    minutes: 15,
    level: "Kezdő",
    focus: "Törzs",
    description: "Stabilitás ugrálás és eszközök nélkül.",
    steps: [
      "Medencebillentés – 2 × 10 ismétlés",
      "Dead bug – 2 × 8/oldal",
      "Térdelőtámaszos plank – 3 × 20 mp",
      "Bird-dog – 2 × 8/oldal",
      "Pihenő nyújtás – 2 perc",
    ],
    avoidIf: ["back", "wrist"],
  },
  {
    id: "full-body-basic",
    title: "Teljes test alapok",
    minutes: 20,
    level: "Kezdő",
    focus: "Erősítés",
    description: "Egyszerű saját testsúlyos gyakorlatsor.",
    steps: [
      "Bemelegítő helyben menet – 3 perc",
      "Székre guggolás – 3 × 10 ismétlés",
      "Fali fekvőtámasz – 3 × 10 ismétlés",
      "Csípőemelés – 3 × 12 ismétlés",
      "Álló térdhúzás – 2 × 10/oldal",
      "Lassú levezetés – 2 perc",
    ],
    avoidIf: ["knee", "back"],
  },
  {
    id: "low-impact-cardio",
    title: "Ízületkímélő kardió",
    minutes: 15,
    level: "Kezdő",
    focus: "Kardió",
    description: "Ugrálás nélküli, folyamatos átmozgatás.",
    steps: [
      "Helyben menet – 3 perc",
      "Oldalirányú lépés karlendítéssel – 3 × 60 mp",
      "Sarokemelés váltva – 3 × 45 mp",
      "Lassú térdemelés – 3 × 45 mp",
      "Levezető séta és légzés – 3 perc",
    ],
    avoidIf: ["ankle"],
  },
  {
    id: "energizing-flow",
    title: "Lendületes átmozgatás",
    minutes: 20,
    level: "Középhaladó",
    focus: "Kardió",
    description: "Folyamatos, ízületkímélő mozgás otthon.",
    steps: [
      "Helyben menet gyorsabb tempóban – 3 perc",
      "Oldalirányú lépés – 3 × 60 mp",
      "Guggolás térdemeléssel – 3 × 10/oldal",
      "Hátralépéses kitörés – 2 × 8/oldal",
      "Lassú levezetés – 4 perc",
    ],
    avoidIf: ["knee", "ankle"],
  },
  {
    id: "upper-body-gentle",
    title: "Kímélő felsőtest-erősítés",
    minutes: 20,
    level: "Középhaladó",
    focus: "Felsőtest",
    description: "Alsótest-terhelés nélkül végezhető erősítő blokk.",
    steps: [
      "Vállmobilizálás – 2 perc",
      "Fali fekvőtámasz – 3 × 12 ismétlés",
      "Lapockazárás állva – 3 × 12 ismétlés",
      "Karhúzás törölközővel – 3 × 10 ismétlés",
      "Álló törzsdöntés kis tartományban – 2 × 10",
      "Levezető nyújtás – 3 perc",
    ],
    avoidIf: ["shoulder", "wrist"],
  },
  {
    id: "strong-body",
    title: "Erős teljes test",
    minutes: 30,
    level: "Középhaladó",
    focus: "Erősítés",
    description: "Nagyobb kihívás, továbbra is eszköz nélkül.",
    steps: [
      "Dinamikus bemelegítés – 5 perc",
      "Guggolás – 3 × 12 ismétlés",
      "Kitörés hátra – 3 × 10/oldal",
      "Fekvőtámasz választott verzióban – 3 × 8–12",
      "Plank vállérintéssel – 3 × 10/oldal",
      "Csípőemelés – 3 × 15 ismétlés",
      "Levezetés – 4 perc",
    ],
    avoidIf: ["knee", "back", "wrist", "shoulder"],
  },
  {
    id: "core-and-glutes",
    title: "Törzs és farizom",
    minutes: 30,
    level: "Középhaladó",
    focus: "Törzs",
    description: "Kontrollált erősítés, ugrálás nélkül.",
    steps: [
      "Bemelegítés – 4 perc",
      "Csípőemelés – 4 × 12 ismétlés",
      "Bird-dog – 3 × 10/oldal",
      "Oldalfekvő lábemelés – 3 × 12/oldal",
      "Dead bug – 3 × 8/oldal",
      "Oldalsó plank térden – 3 × 20 mp/oldal",
      "Nyújtás – 4 perc",
    ],
    avoidIf: ["back", "shoulder"],
  },
  {
    id: "power-full-body",
    title: "Haladó teljes testes erősítés",
    minutes: 40,
    level: "Haladó",
    focus: "Erősítés",
    description:
      "Hosszabb, intenzívebb saját testsúlyos program gyakorlottabb napokra.",
    steps: [
      "Dinamikus bemelegítés – 5 perc",
      "Guggolás és térdemelés – 4 × 12",
      "Kitörés váltott lábbal – 4 × 10/oldal",
      "Fekvőtámasz – 4 × 10–15",
      "Plank vállérintéssel – 4 × 12/oldal",
      "Csípőemelés – 4 × 15",
      "Törzserősítő blokk – 6 perc",
      "Lassú levezetés és nyújtás – 5 perc",
    ],
    avoidIf: ["knee", "back", "shoulder", "wrist", "ankle"],
  },
  {
    id: "advanced-cardio-strength",
    title: "Haladó kardió-erősítő kör",
    minutes: 30,
    level: "Haladó",
    focus: "Kardió + erősítés",
    description: "Tempós, egész testet megdolgoztató saját testsúlyos kör.",
    steps: [
      "Dinamikus bemelegítés – 4 perc",
      "Guggolásból térdemelés – 4 × 12",
      "Hátralépéses kitörés – 4 × 10/oldal",
      "Fekvőtámasz – 4 × 10",
      "Hegymászó gyakorlat – 4 × 30 mp",
      "Plank – 3 × 40 mp",
      "Levezetés – 4 perc",
    ],
    avoidIf: ["knee", "back", "shoulder", "wrist", "ankle", "jumping"],
  },
  {
    id: "evening-release",
    title: "Esti feszültségoldás",
    minutes: 10,
    level: "Kezdő",
    focus: "Nyújtás",
    description: "Lassú lezárás egy sűrű nap végén.",
    steps: [
      "Mély légzés – 90 mp",
      "Oldalsó törzsnyújtás – 45 mp/oldal",
      "Combhajlító nyújtás – 45 mp/oldal",
      "Fekvő gerinccsavarás – 45 mp/oldal",
      "Nyugodt levezető légzés – 2 perc",
    ],
    avoidIf: ["back"],
  },
];

function initialLevel(preferredLevel: Props["preferredLevel"]): Workout["level"] {
  if (preferredLevel === "advanced") return "Haladó";
  if (preferredLevel === "intermediate") return "Középhaladó";
  return "Kezdő";
}

function normalizeLimitations(limitations: string[]): Set<LimitationKey> {
  const result = new Set<LimitationKey>();

  for (const raw of limitations) {
    const value = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    if (value.includes("terd") || value.includes("knee")) result.add("knee");
    if (
      value.includes("hat") ||
      value.includes("derek") ||
      value.includes("gerinc") ||
      value.includes("back")
    ) {
      result.add("back");
    }
    if (value.includes("vall") || value.includes("shoulder")) {
      result.add("shoulder");
    }
    if (
      value.includes("csuklo") ||
      value.includes("kez") ||
      value.includes("wrist")
    ) {
      result.add("wrist");
    }
    if (
      value.includes("boka") ||
      value.includes("labfej") ||
      value.includes("ankle")
    ) {
      result.add("ankle");
    }
    if (
      value.includes("ugral") ||
      value.includes("ugras") ||
      value.includes("jump")
    ) {
      result.add("jumping");
    }
  }

  return result;
}

function matchesLimitations(
  workout: Workout,
  limitations: Set<LimitationKey>,
): boolean {
  if (!workout.avoidIf?.length || limitations.size === 0) return true;
  return !workout.avoidIf.some((item) => limitations.has(item));
}

export default function MovementView({
  history,
  onComplete,
  preferredMinutes,
  preferredLevel,
  movementLimitations = [],
}: Props) {
  const [duration, setDuration] = useState<DurationFilter>(
    String(preferredMinutes) as Exclude<DurationFilter, "all">,
  );
  const [level, setLevel] = useState<"all" | Workout["level"]>(
    initialLevel(preferredLevel),
  );
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [savingWorkoutId, setSavingWorkoutId] = useState<string | null>(null);

  const normalizedLimitations = useMemo(
    () => normalizeLimitations(movementLimitations),
    [movementLimitations],
  );

  const suitableWorkouts = useMemo(
    () =>
      workoutLibrary.filter((workout) =>
        matchesLimitations(workout, normalizedLimitations),
      ),
    [normalizedLimitations],
  );

  const recommendedWorkout = useMemo(() => {
    const preferredWorkoutLevel = initialLevel(preferredLevel);
    const preferredRank = levelRank[preferredWorkoutLevel];

    const candidates = suitableWorkouts
      .filter(
        (workout) =>
          workout.minutes <= preferredMinutes &&
          levelRank[workout.level] <= preferredRank,
      )
      .sort((a, b) => {
        const aMinuteDiff = preferredMinutes - a.minutes;
        const bMinuteDiff = preferredMinutes - b.minutes;

        if (aMinuteDiff !== bMinuteDiff) return aMinuteDiff - bMinuteDiff;

        const aLevelDiff = preferredRank - levelRank[a.level];
        const bLevelDiff = preferredRank - levelRank[b.level];

        return aLevelDiff - bLevelDiff;
      });

    return candidates[0] ?? suitableWorkouts[0] ?? null;
  }, [preferredLevel, preferredMinutes, suitableWorkouts]);

  const visibleWorkouts = useMemo(
    () =>
      suitableWorkouts.filter((workout) => {
        const durationMatches =
          duration === "all" || workout.minutes <= Number(duration);
        const levelMatches = level === "all" || workout.level === level;

        return durationMatches && levelMatches;
      }),
    [duration, level, suitableWorkouts],
  );

  const weeklyMinutes = history.reduce((sum, entry) => sum + entry.minutes, 0);
  const weeklyDays = new Set(history.map((entry) => entry.date)).size;

  async function complete(workout: Workout) {
    if (savingWorkoutId) return;

    setSavingWorkoutId(workout.id);
    setMessage("");

    try {
      const saved = await onComplete(workout);

      setMessage(
        saved
          ? `${workout.title} elmentve. Szép munka!`
          : "Az edzés mentése nem sikerült.",
      );
    } finally {
      setSavingWorkoutId(null);
    }
  }

  return (
    <>
      <section className="movement-hero">
        <div>
          <span className="card-kicker">OTTHONI ÖRÖMMOZGÁS</span>
          <h2>Válaszd azt, ami ma belefér.</h2>
          <p>
            A programok a beállított idődhöz és edzettségi szintedhez igazodnak.
            A megadott mozgási korlátozásokat a szűrésnél is figyelembe vesszük.
          </p>
        </div>

        <div className="movement-week-summary">
          <div>
            <strong>{weeklyMinutes}</strong>
            <span>perc ezen a héten</span>
          </div>
          <div>
            <strong>{weeklyDays}</strong>
            <span>aktív nap</span>
          </div>
        </div>
      </section>

      {recommendedWorkout && (
        <section
          className="dashboard-card workout-card detailed"
          aria-label="Mai ajánlott edzés"
        >
          <span className="card-kicker">MAI AJÁNLOTT EDZÉS</span>

          <div className="workout-tags">
            <span>{recommendedWorkout.minutes} perc</span>
            <span>{recommendedWorkout.level}</span>
            <span>{recommendedWorkout.focus}</span>
          </div>

          <h2>{recommendedWorkout.title}</h2>
          <p>{recommendedWorkout.description}</p>

          <ol className="workout-steps">
            {recommendedWorkout.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <button
            type="button"
            className="focus-button workout-complete-button"
            disabled={savingWorkoutId === recommendedWorkout.id}
            onClick={() => void complete(recommendedWorkout)}
          >
            {savingWorkoutId === recommendedWorkout.id
              ? "Mentés..."
              : "Edzés kész ✓"}
          </button>
        </section>
      )}

      {movementLimitations.length > 0 && (
        <div className="movement-message" role="status">
          A megadott mozgási korlátozások alapján nem megfelelő programokat
          elrejtettük.
        </div>
      )}

      <section className="movement-filters" aria-label="Edzésszűrők">
        <div>
          <span>Időtartam</span>
          {(["all", "10", "15", "20", "30", "40"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={duration === value ? "active" : ""}
              onClick={() => setDuration(value)}
            >
              {value === "all" ? "Mind" : `max. ${value} perc`}
            </button>
          ))}
        </div>

        <div>
          <span>Nehézség</span>
          {(["all", "Kezdő", "Középhaladó", "Haladó"] as const).map((value) => (
            <button
              type="button"
              key={value}
              className={level === value ? "active" : ""}
              onClick={() => setLevel(value)}
            >
              {value === "all" ? "Mind" : value}
            </button>
          ))}
        </div>
      </section>

      {message && (
        <div className="movement-message" role="status">
          {message}
        </div>
      )}

      <section className="movement-library" aria-label="Edzésprogramok">
        {visibleWorkouts.map((workout, index) => (
          <article
            className="dashboard-card workout-card detailed"
            key={workout.id}
          >
            <div className={`workout-art workout-art-${(index % 3) + 1}`}>
              <span>⌁</span>
            </div>

            <div className="workout-tags">
              <span>{workout.minutes} perc</span>
              <span>{workout.level}</span>
              <span>{workout.focus}</span>
            </div>

            <h2>{workout.title}</h2>
            <p>{workout.description}</p>

            <button
              type="button"
              className="workout-details-button"
              onClick={() =>
                setOpenWorkout((current) =>
                  current === workout.id ? null : workout.id,
                )
              }
            >
              {openWorkout === workout.id
                ? "Gyakorlatok elrejtése"
                : "Gyakorlatok megtekintése"}
            </button>

            {openWorkout === workout.id && (
              <ol className="workout-steps">
                {workout.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}

            <button
              type="button"
              className="focus-button workout-complete-button"
              disabled={savingWorkoutId === workout.id}
              onClick={() => void complete(workout)}
            >
              {savingWorkoutId === workout.id
                ? "Mentés..."
                : "Teljesítettem ✓"}
            </button>
          </article>
        ))}

        {visibleWorkouts.length === 0 && (
          <article className="dashboard-card">
            <h2>Nincs megfelelő program ebben a szűrésben.</h2>
            <p>
              Válassz hosszabb időtartamot vagy más nehézségi szintet. A
              mozgási korlátozások miatt nem megfelelő edzéseket nem jelenítjük
              meg.
            </p>
          </article>
        )}
      </section>
    </>
  );
}
