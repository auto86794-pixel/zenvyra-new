"use client";

import { useMemo, useState } from "react";

export type Workout = {
  id: string;
  title: string;
  minutes: number;
  level: "Kezdő" | "Középhaladó";
  focus: string;
  description: string;
  steps: string[];
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
};

const workouts: Workout[] = [
  { id: "morning-mobility", title: "Reggeli átmozgatás", minutes: 10, level: "Kezdő", focus: "Mobilitás", description: "Finom ébresztő mozdulatok az egész testnek.", steps: ["Váll- és nyakkörzés", "Macska–tehén átmozgatás", "Csípőmobilizálás", "Lassú teljes testes nyújtás"] },
  { id: "gentle-core", title: "Kíméletes törzserősítés", minutes: 15, level: "Kezdő", focus: "Törzs", description: "Stabilitás ugrálás és eszközök nélkül.", steps: ["Medencebillentés", "Dead bug", "Térdelőtámaszos plank", "Pihenő nyújtás"] },
  { id: "full-body-basic", title: "Teljes test alapok", minutes: 20, level: "Kezdő", focus: "Erősítés", description: "Egyszerű saját testsúlyos gyakorlatsor.", steps: ["Székre guggolás", "Fali fekvőtámasz", "Csípőemelés", "Álló térdhúzás"] },
  { id: "energizing-flow", title: "Lendületes átmozgatás", minutes: 20, level: "Középhaladó", focus: "Kardió", description: "Folyamatos, ízületkímélő mozgás otthon.", steps: ["Helyben menet", "Oldalirányú lépés", "Guggolás térdemeléssel", "Lassú levezetés"] },
  { id: "strong-body", title: "Erős teljes test", minutes: 30, level: "Középhaladó", focus: "Erősítés", description: "Nagyobb kihívás, továbbra is eszköz nélkül.", steps: ["Guggolás", "Kitörés hátra", "Fekvőtámasz választott verzióban", "Plank vállérintéssel", "Csípőemelés"] },
  { id: "evening-release", title: "Esti feszültségoldás", minutes: 10, level: "Kezdő", focus: "Nyújtás", description: "Lassú lezárás egy sűrű nap végén.", steps: ["Mély légzés", "Oldalsó törzsnyújtás", "Combhajlító nyújtás", "Fekvő gerinccsavarás"] },
];

export default function MovementView({ history, onComplete }: Props) {
  const [duration, setDuration] = useState<"all" | "10" | "20" | "30">("all");
  const [level, setLevel] = useState<"all" | Workout["level"]>("all");
  const [openWorkout, setOpenWorkout] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visibleWorkouts = useMemo(
    () => workouts.filter((workout) => {
      const durationMatches = duration === "all" || workout.minutes <= Number(duration);
      const levelMatches = level === "all" || workout.level === level;
      return durationMatches && levelMatches;
    }),
    [duration, level],
  );

  const weeklyMinutes = history.reduce((sum, entry) => sum + entry.minutes, 0);
  const weeklyDays = new Set(history.map((entry) => entry.date)).size;

  async function complete(workout: Workout) {
    const saved = await onComplete(workout);
    setMessage(saved ? `${workout.title} elmentve. Szép munka!` : "Az edzés mentése nem sikerült.");
  }

  return (
    <>
      <section className="movement-hero">
        <div>
          <span className="card-kicker">OTTHONI ÖRÖMMOZGÁS</span>
          <h2>Válaszd azt, ami ma belefér.</h2>
          <p>Minden program eszköz nélkül végezhető. Nem a tökéletesség, hanem a rendszeres visszatérés számít.</p>
        </div>
        <div className="movement-week-summary">
          <div><strong>{weeklyMinutes}</strong><span>perc ezen a héten</span></div>
          <div><strong>{weeklyDays}</strong><span>aktív nap</span></div>
        </div>
      </section>

      <section className="movement-filters" aria-label="Edzésszűrők">
        <div>
          <span>Időtartam</span>
          {(["all", "10", "20", "30"] as const).map((value) => (
            <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(value)}>
              {value === "all" ? "Mind" : `max. ${value} perc`}
            </button>
          ))}
        </div>
        <div>
          <span>Nehézség</span>
          {(["all", "Kezdő", "Középhaladó"] as const).map((value) => (
            <button type="button" key={value} className={level === value ? "active" : ""} onClick={() => setLevel(value)}>
              {value === "all" ? "Mind" : value}
            </button>
          ))}
        </div>
      </section>

      {message && <div className="movement-message" role="status">{message}</div>}

      <section className="movement-library" aria-label="Edzésprogramok">
        {visibleWorkouts.map((workout, index) => (
          <article className="dashboard-card workout-card detailed" key={workout.id}>
            <div className={`workout-art workout-art-${(index % 3) + 1}`}><span>⌁</span></div>
            <div className="workout-tags"><span>{workout.minutes} perc</span><span>{workout.level}</span><span>{workout.focus}</span></div>
            <h2>{workout.title}</h2>
            <p>{workout.description}</p>
            <button type="button" className="workout-details-button" onClick={() => setOpenWorkout((current) => current === workout.id ? null : workout.id)}>
              {openWorkout === workout.id ? "Gyakorlatok elrejtése" : "Gyakorlatok megtekintése"}
            </button>
            {openWorkout === workout.id && (
              <ol className="workout-steps">
                {workout.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
            )}
            <button type="button" className="focus-button workout-complete-button" onClick={() => void complete(workout)}>Teljesítettem ✓</button>
          </article>
        ))}
      </section>
    </>
  );
}
