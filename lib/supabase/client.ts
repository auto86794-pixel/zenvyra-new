import { createAuthClient } from "@neondatabase/auth";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createNeonClient, SupabaseAuthAdapter, defaultDeriveNeonUrls } from "@neondatabase/neon-js";

// Neon is selected only after its schema, Auth and Data API are provisioned.
// Until cutover, preserve the existing deployment configuration.
const neonUrl = process.env.NEXT_PUBLIC_NEON_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function createAppClient() {
  if (neonUrl) {
    const urls = defaultDeriveNeonUrls(neonUrl);
    const client = createNeonClient({
      auth: { url: typeof window === "undefined" ? "http://localhost:3018/api/auth" : `${window.location.origin}/api/auth`, adapter: SupabaseAuthAdapter() },
      dataApi: { url: urls.dataApi },
    });
    // Next Auth sessions contain an opaque cookie token. The Data API needs
    // the signed JWT from /token, never that opaque session token.
    const dataClient = createNeonClient({ dataApi: {
      url: urls.dataApi,
      getToken: async () => {
        const response = await fetch("/api/auth/token", { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) throw new Error("A munkamenet lejárt. Jelentkezz be újra.");
        const result = await response.json() as { token?: string };
        if (!result.token) throw new Error("A munkamenet ellenőrzése nem sikerült.");
        return result.token;
      },
    } });
    const appClient = Object.assign(dataClient, { auth: client.auth });
    // The SDK documents compatibility for the auth and PostgREST methods used here.
    // Normalize only this migration boundary; application components stay typed.
    return appClient as unknown as SupabaseClient;
  }
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Hiányzik a Neon kapcsolat beállítása.");
  }
  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

// Compatibility name keeps all existing queries on the same selected backend.
export const supabase = createAppClient();
export const usesNeon = Boolean(neonUrl);

// Better Auth API for password reset; updateUser(password) is not supported by the adapter.
export function getNeonPasswordClient() {
  if (!neonUrl) throw new Error("A Neon kapcsolat nincs beállítva.");
  return createAuthClient(typeof window === "undefined" ? "http://localhost:3018/api/auth" : `${window.location.origin}/api/auth`);
}
