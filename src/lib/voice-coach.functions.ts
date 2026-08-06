import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  activityName: z.string().min(1),
  lines: z.array(z.string().min(1)).min(1).max(30),
});

/**
 * Rewrites the deterministic coaching script into very simple spoken English,
 * keeping every number. Falls back to the original script on any failure.
 */
export const simplifyVoiceScript = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ script: string }> => {
    const fallback = data.lines.join(" ");
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { script: fallback };

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-5.6-sol",
          reasoning_effort: "none",
          messages: [
            {
              role: "system",
              content:
                "You are a friendly running coach speaking out loud to a beginner athlete. Rewrite the given analysis notes as a short spoken script (max 160 words) in very simple, everyday language a 12-year-old understands. Speak directly to the athlete as 'you'. Keep every number and unit exactly as given (degrees, steps per minute, percent) and always say by how much to change something. No lists, no markdown, no headings, no emojis — plain sentences only.",
            },
            {
              role: "user",
              content: `Activity: ${data.activityName}\nNotes:\n${data.lines.join("\n")}`,
            },
          ],
        }),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("Voice coach is busy right now. Please retry in a moment.");
        if (res.status === 402) throw new Error("AI credits exhausted — add credits to keep the voice coach running.");
        return { script: fallback };
      }

      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = json.choices?.[0]?.message?.content?.trim();
      return { script: text && text.length > 40 ? text : fallback };
    } catch (e) {
      if (e instanceof Error && /busy|credits/.test(e.message)) throw e;
      return { script: fallback };
    }
  });
