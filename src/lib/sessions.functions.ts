import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const jointSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
  conf: z.number(),
});

const saveSchema = z.object({
  activity_slug: z.string().min(1),
  video_name: z.string().min(1).max(200),
  duration_sec: z.number().nonnegative(),
  fps: z.number().nonnegative(),
  frames_processed: z.number().int().nonnegative(),
  avg_confidence: z.number(),
  mki_score: z.number(),
  grade: z.string().max(4),
  intensity_level: z.string().max(20),
  metrics: z.unknown(),
  errors: z.unknown(),
  feedback: z.unknown(),
  keyframes: z
    .array(
      z.object({
        frame_id: z.number().int(),
        timestamp_ms: z.number(),
        avg_confidence: z.number(),
        joints: z.array(jointSchema),
        occlusion_flags: z.array(z.number().int()),
        angles: z.record(z.string(), z.number()),
      }),
    )
    .max(40)
    .default([]),
});

export const saveSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { keyframes, ...session } = data;

    const { data: inserted, error } = await supabase
      .from("analysis_sessions")
      .insert({ ...session, user_id: userId } as never)
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const sessionId = (inserted as { id: string }).id;

    if (keyframes.length > 0) {
      const { error: frameError } = await supabase.from("session_frames").insert(
        keyframes.map((f) => ({
          session_id: sessionId,
          user_id: userId,
          frame_id: f.frame_id,
          timestamp_ms: f.timestamp_ms,
          avg_confidence: f.avg_confidence,
          joints: f.joints,
          occlusion_flags: f.occlusion_flags,
          angles: f.angles,
        })) as never,
      );
      if (frameError) throw new Error(frameError.message);
    }

    return { id: sessionId };
  });

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("analysis_sessions")
      .select(
        "id, activity_slug, video_name, duration_sec, frames_processed, avg_confidence, mki_score, grade, intensity_level, errors, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: session, error } = await context.supabase
      .from("analysis_sessions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!session) throw new Error("Session not found.");

    const { data: frames } = await context.supabase
      .from("session_frames")
      .select("frame_id, timestamp_ms, avg_confidence, joints, occlusion_flags, angles")
      .eq("session_id", data.id)
      .order("frame_id", { ascending: true });

    return { session, frames: frames ?? [] };
  });

export const deleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("analysis_sessions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });