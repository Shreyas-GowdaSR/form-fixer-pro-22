import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ text: z.string().min(1).max(4000) });

/** Streams spoken coaching audio (raw 24kHz PCM inside SSE) from Lovable AI. */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Voice coach is not configured.", { status: 500 });

        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(await request.json());
        } catch {
          return new Response("Invalid request body.", { status: 400 });
        }

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: parsed.text,
            voice: "alloy",
            instructions:
              "Speak like an encouraging athletics coach: clear, warm, steady pace, easy words.",
            stream_format: "sse",
            response_format: "pcm",
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail || "Speech generation failed.", {
            status: upstream.status || 502,
          });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
