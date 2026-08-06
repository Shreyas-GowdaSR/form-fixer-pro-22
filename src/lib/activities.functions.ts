import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export interface ActivityRow {
  slug: string;
  name: string;
  category: string;
  description: string;
  is_active: boolean;
  sort_order: number;
}

/** Public read of the sports catalogue (anon SELECT policy). */
export const listActivityCatalogue = createServerFn({ method: "GET" }).handler(
  async (): Promise<ActivityRow[]> => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data, error } = await supabase
      .from("activities")
      .select("slug, name, category, description, is_active, sort_order")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  },
);