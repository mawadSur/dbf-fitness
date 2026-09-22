import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env and run `supabase start` for local development.'
  );
}

/**
 * Inert stand-ins so an UNCONFIGURED build still LOADS.
 *
 * `createClient('', '')` throws `supabaseUrl is required.` synchronously. This module is
 * imported at the top of app/_layout.tsx (and transitively by TermsGate), so with empty
 * strings the root layout module throws before React renders anything — and `ConfigGate`'s
 * whole purpose is to paint the honest "This build is not configured" screen in exactly that
 * case. The gate's `missing_url` / `missing_key` verdicts were therefore unreachable: the app
 * crashed on launch instead, which is the crash loop ticket item 7 forbids.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so nothing can be sent anywhere by
 * accident: every request fails as a network error while the gate covers the UI.
 */
const INERT_URL = 'https://unconfigured.invalid';
const INERT_KEY = 'unconfigured';

export const supabase = createClient(supabaseUrl || INERT_URL, supabaseAnonKey || INERT_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
