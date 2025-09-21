import { NextRequest, NextResponse } from "next/server";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const SYSTEM_GEN = `
You are a world-class prompt engineer for image generation (MJ/SDXL/FLUX).
Output ONE JSON object with keys:
{
  "subject": string,
  "environment": string,
  "style": string,
  "lighting": string,
  "camera": string,
  "composition": string,
  "postprocess": string,
  "negatives": string,
  "final_prompt": string,
  "score": number
}
Rules:
- Audience: general; Tone: professional; Complexity: intermediate.
- "final_prompt" MUST be a single paragraph combining all elements.
- Include concrete subject, environment, style/art direction, lighting, camera (lens/aperture/shot/angle), composition, post-process, and negatives.
- Self-score 0–100 across 10 criteria.
- If score < 92, silently revise and output ONLY the superior JSON.
- No backticks. No commentary outside JSON.
`;

const SYSTEM_JUDGE = `
You are an uncompromising Art Director.
Given a candidate JSON (same schema), rescore 0–100.
If < 92, return a REVISED, superior JSON in the same schema. No commentary.
`;

function ok(data: any, status = 200) { return NextResponse.json({ success: true, ...data }, { status }); }
function fail(error: string, status = 500) { return NextResponse.json({ success: false, error }, { status }); }

async function callLLM(messages: any[], temperature = 0.6) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("Missing OPENROUTER_API_KEY");

  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat";
  const referer = process.env.OPENROUTER_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // These help OpenRouter route/attribute your traffic:
      "HTTP-Referer": referer,
      "X-Title": "Prompt Playground",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      top_p: 0.9,
      repetition_penalty: 1.05,
      response_format: { type: "json_object" },
      max_tokens: 900,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "{}";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userIdea = "", aspect = "free", quality = "7/10", seed = "auto" } = body || {};

    // Quick mock toggle for debugging
    if (req.nextUrl.searchParams.get("mock") === "1") {
      return ok({
        result: {
          subject: "young explorer near a windswept lighthouse",
          environment: "rocky shoreline at dusk with sea mist",
          style: "cinematic realism with subtle film emulation",
          lighting: "warm key from left, cool fill from ocean, soft rim",
          camera: "full-frame, 85mm, f/2.0, medium close-up, slight low angle",
          composition: "rule of thirds, leading lines from shoreline, layered depth",
          postprocess: "fine film grain, gentle halation, light vignette",
          negatives: "blurry, extra limbs, text artifacts, watermarks, oversaturation, NSFW",
          final_prompt: "A cinematic, well-lit medium close-up of a young explorer beside a lighthouse at dusk...",
          score: 95,
        }
      });
    }

    // Pass A — Generator
    const genRaw = await callLLM([
      { role: "system", content: SYSTEM_GEN },
      { role: "user", content:
`User Idea: ${userIdea}
Preferences: aspect=${aspect}, quality=${quality}, seed=${seed}
Remember schema and scoring rules.`}
    ], 0.6);

    let candidate: any;
    try { candidate = JSON.parse(genRaw); } catch { return fail("Model returned non-JSON content."); }

    // Pass B — Judge/Revise
    const judgedRaw = await callLLM([
      { role: "system", content: SYSTEM_JUDGE },
      { role: "user", content: JSON.stringify(candidate) }
    ], 0.2);

    let result: any;
    try { result = JSON.parse(judgedRaw); } catch { result = candidate; }

    // Minimal shape check
    for (const k of ["final_prompt","subject","environment","style","lighting","camera","composition","postprocess","negatives","score"]) {
      if (!(k in result)) return fail(`Missing key in result: ${k}`);
    }

    return ok({ result });
  } catch (e: any) {
    return fail(e?.message || "Unexpected error");
  }
}
