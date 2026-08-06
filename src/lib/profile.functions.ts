import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, age, height_cm, weight_kg, experience_level, weekly_training_days")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const profileSchema = z.object({
  full_name: z.string().max(120).nullable(),
  age: z.number().int().min(8).max(99).nullable(),
  height_cm: z.number().min(90).max(230).nullable(),
  weight_kg: z.number().min(25).max(200).nullable(),
  experience_level: z.enum(["beginner", "intermediate", "advanced"]),
  weekly_training_days: z.number().int().min(0).max(14),
});

export const upsertProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => profileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, ...data } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });