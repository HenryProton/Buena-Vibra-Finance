import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme, type Theme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";

const VALID: Theme[] = ["system", "light", "dark", "vibrant", "senior"];

export function ThemeSync() {
  const { profile, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const appliedFromProfile = useRef<string | null>(null);
  const lastPersisted = useRef<string | null>(null);

  // Al cargar el perfil, aplicar preferencia guardada en la cuenta.
  useEffect(() => {
    if (!profile) return;
    const pref = profile.theme_preference as Theme | undefined;
    if (pref && VALID.includes(pref) && appliedFromProfile.current !== profile.id) {
      appliedFromProfile.current = profile.id;
      lastPersisted.current = pref;
      if (pref !== theme) setTheme(pref);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Cuando el usuario cambia el tema, persistirlo en su cuenta.
  useEffect(() => {
    if (!user || !profile) return;
    if (appliedFromProfile.current !== profile.id) return; // aún no sincronizado
    if (lastPersisted.current === theme) return;
    lastPersisted.current = theme;
    supabase.from("profiles").update({ theme_preference: theme }).eq("id", profile.id).then(() => {});
  }, [theme, user, profile]);

  return null;
}
