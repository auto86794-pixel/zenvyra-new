-- Apply on an isolated Neon branch with Managed Auth and Data API enabled.
-- No DROP statements: old Supabase data and other Neon projects remain untouched.
BEGIN;
CREATE TABLE IF NOT EXISTS public.profiles (
 id text PRIMARY KEY, display_name text NOT NULL DEFAULT '', sex text, age integer,
 height_cm numeric, current_weight_kg numeric, target_weight_kg numeric,
 goal text, activity_level text, daily_calorie_goal integer,
 protein_target_g integer, carbs_target_g integer, fat_target_g integer,
 allergens text[] NOT NULL DEFAULT '{}', diet_type text DEFAULT 'omnivore',
 disliked_ingredients text[] NOT NULL DEFAULT '{}', workout_minutes integer DEFAULT 20,
 fitness_level text DEFAULT 'beginner', movement_limitations text[] NOT NULL DEFAULT '{}',
 onboarding_completed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 meal_type text NOT NULL, food_name text NOT NULL, kcal integer NOT NULL CHECK(kcal >= 0),
 protein_g numeric NOT NULL DEFAULT 0, carbs_g numeric NOT NULL DEFAULT 0,
 fat_g numeric NOT NULL DEFAULT 0, consumed boolean NOT NULL DEFAULT true,
 eaten_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Budapest')::date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.water_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 amount_ml integer NOT NULL CHECK(amount_ml > 0),
 logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Budapest')::date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.weight_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 weight_kg numeric NOT NULL CHECK(weight_kg BETWEEN 30 AND 250),
 logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Budapest')::date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.wellbeing_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 mood integer CHECK(mood BETWEEN 1 AND 5), energy integer CHECK(energy BETWEEN 1 AND 5),
 stress integer CHECK(stress BETWEEN 1 AND 5), note text,
 logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Budapest')::date,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id, logged_on)
);
CREATE TABLE IF NOT EXISTS public.movement_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 title text NOT NULL, minutes integer NOT NULL CHECK(minutes > 0), completed boolean NOT NULL DEFAULT false,
 logged_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Budapest')::date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.service_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL,
 category text NOT NULL, name text NOT NULL, phone text,
 is_favorite boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id, user_id)
);
CREATE TABLE IF NOT EXISTS public.appointment_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, provider_id uuid,
 service text NOT NULL, desired_date_text text, desired_time_window text, request_message text,
 status text NOT NULL DEFAULT 'approved' CHECK(status IN ('draft','approved','sent','replied','confirmed','cancelled')),
 provider_reply text, confirmed_time_text text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(provider_id, user_id) REFERENCES public.service_providers(id, user_id)
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'profiles_owner') THEN
  CREATE POLICY profiles_owner ON public.profiles FOR ALL TO authenticated
   USING (id = (SELECT auth.user_id())) WITH CHECK (id = (SELECT auth.user_id()));
 END IF;
END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['meals','water_logs','weight_logs','wellbeing_logs','movement_logs','service_providers','appointment_requests'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = 'owner_only') THEN
  EXECUTE format('CREATE POLICY owner_only ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT auth.user_id())) WITH CHECK (user_id = (SELECT auth.user_id()))', t);
  END IF;
  EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (user_id, created_at)', t || '_owner_created_idx', t);
 END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles, public.meals, public.water_logs,
 public.weight_logs, public.wellbeing_logs, public.movement_logs,
 public.service_providers, public.appointment_requests TO authenticated;
REVOKE ALL ON public.profiles, public.meals, public.water_logs, public.weight_logs,
 public.wellbeing_logs, public.movement_logs, public.service_providers,
 public.appointment_requests FROM anonymous;
COMMIT;
