import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Hiányzik a NEXT_PUBLIC_SUPABASE_URL környezeti változó.");
}

if (!supabasePublishableKey) {
  throw new Error(
    "Hiányzik a NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY környezeti változó."
  );
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
