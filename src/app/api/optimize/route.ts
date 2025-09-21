// api/generate-prompt/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

// Enhanced schema with validation
const InputSchema = z.object({
  userIdea: z.string().min(3, "Idea must be at least 3 characters").max(500, "Idea too long"),
  aspect: z.enum(["1:1", "16:9", "9:16", "4:3", "3:4", "21:9", "free"]).default("free"),
  quality: z.enum(["draft", "good", "high", "ultra"]).default("good"),
  style: z.enum(["photorealistic", "artistic", "cinematic", "abstract", "minimalist", "vintage", "futuristic"]).optional(),
  seed: z.union([z.number().int().min(0), z.literal("auto")]).default("auto"),
});

const OutputSchema = z.object({
  subject: z.string().min(10),
  environment: z.string().min(10),
  style: z.string().min(5),
  lighting: z.string().min(5),
  camera: z.string().min(10),
  composition: z.string().min(10),
  postprocess: z.string().min(5),
  negatives: z.string().min(5),
  final_prompt: z.string().min(50),
  score: z.number().min(0).max(100),
  technical_params: z.object({
    steps: z.number().min(20).max(100),
    cfg_scale: z.number().min(1).max(20),
    sampler: z.string(),
  }).optional(),
});

type PromptOutput = z.infer<typeof OutputSchema>;

// Configuration
const CONFIG = {
  ENDPOINT: "https://openrouter.ai/api/v1/chat/completions",
  MODELS: {
    primary: "anthropic/claude-3.5-sonnet",
    fallback: "deepseek/deepseek-chat",
  },
  QUALITY_THRESHOLDS: {
    draft: 75,
    good: 85,
    high: 90,
    ultra: 95,
  },
  MAX_RETRIES: 2,
  TIMEOUT: 30000,
} as const;

// Enhanced system prompts
const PROMPTS = {
  generator: `You are an elite AI image prompt engineer specializing in FLUX, Midjourney, and SDXL.

TASK: Transform user ideas into professional image generation prompts.

OUTPUT FORMAT: Valid JSON object with these exact keys:
{
  "subject": "Detailed main subject description",
  "environment": "Setting, location, background details",
  "style": "Art style, medium, aesthetic approach",
  "lighting": "Light sources, shadows, atmosphere",
  "camera": "Camera angle, lens, framing, depth of field",
  "composition": "Layout, rule of thirds, visual flow",
  "postprocess": "Color grading, effects, finishing touches",
  "negatives": "What to avoid in the image",
  "final_prompt": "Complete optimized prompt paragraph",
  "score": 85,
  "technical_params": {
    "steps": 30,
    "cfg_scale": 7.5,
    "sampler": "DPM++ 2M Karras"
  }
}

RULES:
- Be specific and concrete in descriptions
- Use professional photography/art terminology
- Include technical camera details (f/1.8, 85mm, etc.)
- Balance creativity with clarity
- Self-evaluate and aim for score ≥ target threshold
- final_prompt should be 100-200 words, one flowing paragraph
- Include aspect ratio naturally in composition if not "free"

QUALITY LEVELS:
- draft: Creative but simple
- good: Professional with good detail
- high: Exceptional detail and technical precision
- ultra: Award-winning level with perfect execution`,

  judge: `You are a demanding Creative Director reviewing image prompts.

TASK: Evaluate and improve the given prompt JSON if needed.

EVALUATION CRITERIA (each 0-10):
1. Subject clarity and appeal
2. Environment richness
3. Style consistency
4. Lighting sophistication
5. Camera work professionalism
6. Composition strength
7. Technical accuracy
8. Post-processing appropriateness
9. Negative prompt effectiveness
10. Overall prompt flow

If total score < target threshold, return an IMPROVED version.
If acceptable, return the original unchanged.
OUTPUT: JSON only, no commentary.`,
};

// Utility functions
class APIError extends Error {
  constructor(message: string, public status: number = 500, public details?: any) {
    super(message);
    this.name = 'APIError';
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

async function callLLM(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    model?: string;
    timeout?: number;
  } = {}
): Promise<string> {
  const {
    temperature = 0.7,
    model = CONFIG.MODELS.primary,
    timeout = CONFIG.TIMEOUT,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(CONFIG.ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
        "X-Title": "Image Prompt Generator",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.1,
        response_format: { type: "json_object" },
        max_tokens: 1200,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.text();
      throw new APIError(`LLM API error: ${response.status}`, response.status, error);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new APIError("Empty response from LLM", 502);
    }

    return content;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof APIError) throw error;
    
    if (error.name === 'AbortError') {
      throw new APIError("Request timeout", 408);
    }
    
    throw new APIError("Network error", 503, error.message);
  }
}

async function generateWithRetry(
  messages: Array<{ role: string; content: string }>,
  targetScore: number,
  maxRetries: number = CONFIG.MAX_RETRIES
): Promise<PromptOutput> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const model = attempt === 0 ? CONFIG.MODELS.primary : CONFIG.MODELS.fallback;
      const temperature = 0.7 - (attempt * 0.2); // Reduce temperature on retries
      
      const rawResponse = await callLLM(messages, { temperature, model });
      const parsed = JSON.parse(rawResponse);
      const validated = OutputSchema.parse(parsed);
      
      if (validated.score >= targetScore) {
        return validated;
      }
      
      // Score too low, but it's our last attempt
      if (attempt === maxRetries) {
        return validated; // Accept it anyway
      }
      
    } catch (error) {
      lastError = error;
      
      if (error instanceof z.ZodError) {
        console.warn(`Validation failed on attempt ${attempt + 1}:`, error.format());
      } else if (error instanceof SyntaxError) {
        console.warn(`JSON parse failed on attempt ${attempt + 1}:`, error.message);
      } else {
        console.warn(`Generation failed on attempt ${attempt + 1}:`, error.message);
      }
      
      // Don't retry on certain errors
      if (error instanceof APIError && error.status >= 400 && error.status < 500) {
        throw error;
      }
    }
  }
  
  throw lastError || new APIError("All generation attempts failed");
}

// Main handlers
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders() });
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Validate API key
    if (!process.env.OPENROUTER_API_KEY) {
      throw new APIError("OpenRouter API key not configured", 500);
    }

    // Parse and validate input
    const body = await req.json().catch(() => ({}));
    const input = InputSchema.parse(body);
    
    const qualityThreshold = CONFIG.QUALITY_THRESHOLDS[input.quality];
    
    // Generate initial prompt
    const generatorMessages = [
      { role: "system", content: PROMPTS.generator },
      { 
        role: "user", 
        content: `USER IDEA: "${input.userIdea}"
CONSTRAINTS:
- Aspect ratio: ${input.aspect}
- Quality level: ${input.quality} (target score: ${qualityThreshold}+)
- Style preference: ${input.style || "flexible"}
- Seed: ${input.seed}

Generate an optimized image prompt meeting these requirements.` 
      }
    ];
    
    let result = await generateWithRetry(generatorMessages, qualityThreshold);
    
    // If score is below threshold, run through judge
    if (result.score < qualityThreshold) {
      try {
        const judgeMessages = [
          { role: "system", content: PROMPTS.judge },
          { 
            role: "user", 
            content: `Target threshold: ${qualityThreshold}
Current prompt: ${JSON.stringify(result)}

Improve this prompt to meet the quality threshold.`
          }
        ];
        
        const judgedResponse = await callLLM(judgeMessages, { temperature: 0.3 });
        const judgedResult = OutputSchema.parse(JSON.parse(judgedResponse));
        
        if (judgedResult.score > result.score) {
          result = judgedResult;
        }
      } catch (judgeError) {
        console.warn("Judge stage failed, using original result:", judgeError.message);
        // Continue with original result
      }
    }
    
    const duration = Date.now() - startTime;
    
    return NextResponse.json(
      {
        success: true,
        result,
        meta: {
          input: {
            aspect: input.aspect,
            quality: input.quality,
            style: input.style,
            seed: input.seed,
          },
          performance: {
            duration_ms: duration,
            score_achieved: result.score,
            score_target: qualityThreshold,
          },
          version: "2.0",
        },
      },
      { headers: corsHeaders() }
    );
    
  } catch (error) {
    console.error("Prompt generation error:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: error.errors,
        },
        { status: 400, headers: corsHeaders() }
      );
    }
    
    if (error instanceof APIError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details,
        },
        { status: error.status, headers: corsHeaders() }
      );
    }
    
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: process.env.NODE_ENV === "development" ? error.message : undefined,
      },
      { status: 500, headers: corsHeaders() }
    );
  }
}