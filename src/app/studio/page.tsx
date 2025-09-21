'use client';

import React, { useMemo, useState, useEffect, useRef } from "react";
import { BASE_TEMPLATES, assemblePrompt, type Template } from "@/lib/prompt";
import { Star, Search, ArrowUp } from "lucide-react";

type PromptResult = {
  subject: string;
  environment: string;
  style: string;
  lighting: string;
  camera: string;
  composition: string;
  postprocess: string;
  negatives: string;
  final_prompt: string;
  score: number;
  technical_params?: { steps?: number; cfg_scale?: number; sampler?: string };
};

const TABS: (keyof typeof BASE_TEMPLATES)[] = ["images", "writing", "emails"];

export default function Studio() {
  const builderRef = useRef<HTMLDivElement>(null);

  const [tab, setTab] = useState<keyof typeof BASE_TEMPLATES>("images");
  const [q, setQ] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  const list = BASE_TEMPLATES[tab];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(t =>
      !s || (t.title + " " + (t.subtitle || "") + " " + t.tags.join(" ")).toLowerCase().includes(s)
    );
  }, [list, q]);

  const [builder, setBuilder] = useState<{ template?: Template; values: Record<string, string> }>({ values: {} });

  // Prompt meta controls
  const [quality, setQuality] = useState(7);
  const [seed, setSeed] = useState("auto");
  const [tone, setTone] = useState("professional");
  const [complexity, setComplexity] = useState("intermediate");
  const [length, setLength] = useState("detailed");
  const [audience, setAudience] = useState("general");
  const [industry, setIndustry] = useState("general");
  const [format, setFormat] = useState("paragraph");
  const [aspect, setAspect] = useState("free");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [optimized, setOptimized] = useState("");
  const [rich, setRich] = useState<PromptResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const assembled = assemblePrompt({
    activeTab: tab,
    builder,
    quality,
    seed,
    tone,
    complexity,
    length,
    audience,
    industry,
    format
  });

  function onUse(t: Template) {
    setBuilder({ template: t, values: {} });
    setTimeout(() => builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function toggleFavorite(id: string) {
    setFavorites(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
  }

  function qualityToTag(n: number) {
    if (n >= 9) return "9/10";
    if (n >= 8) return "8/10";
    if (n >= 7) return "7/10";
    if (n >= 6) return "6/10";
    return `${Math.max(1, Math.min(10, n))}/10`;
  }

  async function optimize() {
    if (!builder.template) {
      setErr("Pick a template first.");
      return;
    }
    setErr(null);
    setLoading(true);
    setOptimized("");
    setRich(null);
    try {
      const r = await fetch("/api/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIdea: assembled,
          aspect,
          quality: qualityToTag(quality),
          seed: seed || "auto"
        })
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || "Optimize failed");

      const result: PromptResult = j.result;
      setOptimized(result.final_prompt);
      setRich(result);
      setShowDetails(true);
    } catch (e: any) {
      setErr(e?.message || "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  function scoreBadgeColor(score?: number) {
    if (!score && score !== 0) return "text-white/80 bg-white/10 border-white/20";
    if (score >= 95) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    if (score >= 90) return "text-blue-400 bg-blue-400/10 border-blue-400/20";
    if (score >= 80) return "text-yellow-400 bg-yellow-400/10 border-yellow-400/20";
    return "text-red-400 bg-red-400/10 border-red-400/20";
  }

  return (
    <div className="container py-10">
      {/* Header with tabs */}
      <div className="flex flex-col gap-4 items-center mb-8">
        <h1 className="text-3xl font-semibold">Prompt Playground Studio</h1>

        <div className="flex gap-6 border-b border-white/10">
          {TABS.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-2 px-2 text-sm font-medium transition-colors ${
                tab === t ? "text-white border-b-2 border-blue-500" : "text-white/60 hover:text-white"
              }`}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        <div className="relative w-full max-w-lg">
          <Search className="absolute left-3 top-3 text-white/50" size={18} />
          <input
            className="ui-input pl-9"
            placeholder="Search templates… (images, writing, emails)"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
      </div>

      {/* Template grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map(t => (
          <div
            key={t.id}
            className="ui-card overflow-hidden group relative hover:shadow-lg transition-shadow"
          >
            <div className="w-full aspect-[4/3] overflow-hidden">
              <img src={t.preview} alt={t.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
            </div>
            <div className="p-3 space-y-1">
              <p className="font-medium">{t.title}</p>
              <p className="text-xs text-white/70 line-clamp-2">{t.subtitle}</p>
              <div className="flex justify-between items-center mt-2">
                <button className="ui-btn" onClick={() => onUse(t)}>Use</button>
                <button onClick={() => toggleFavorite(t.id)}>
                  <Star
                    size={18}
                    className={favorites.includes(t.id) ? "text-yellow-400 fill-yellow-400" : "text-white/40"}
                  />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Builder + Optimizer */}
      <div ref={builderRef} className="ui-card p-4 mt-12">
        {!builder.template ? (
          <p className="text-white/75">Pick a template to start editing and optimizing.</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: controls */}
            <div className="space-y-3">
              <div className="w-full rounded-xl overflow-hidden aspect-[4/3]">
                <img
                  src={builder.template.preview}
                  alt={builder.template.title}
                  className="w-full h-full object-cover"
                />
              </div>

              {builder.template.fields?.map(f => (
                <div key={f.key}>
                  <label className="ui-label">{f.label}</label>
                  <input
                    className="ui-input mt-1"
                    placeholder={f.placeholder}
                    value={builder.values[f.key] ?? ""}
                    onChange={e =>
                      setBuilder(b => ({ ...b, values: { ...b.values, [f.key]: e.target.value } }))
                    }
                  />
                </div>
              ))}

              {/* Meta controls */}
              <div className="grid grid-cols-2 gap-2">
                <select className="ui-select" value={tone} onChange={e => setTone(e.target.value)}>
                  {["professional", "casual", "friendly", "authoritative", "creative"].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>

                <select className="ui-select" value={complexity} onChange={e => setComplexity(e.target.value)}>
                  {["beginner", "intermediate", "advanced", "expert"].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>

                <select className="ui-select" value={length} onChange={e => setLength(e.target.value)}>
                  {["brief", "detailed", "comprehensive"].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>

                <select className="ui-select" value={format} onChange={e => setFormat(e.target.value)}>
                  {["paragraph", "list", "step-by-step", "outline"].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>

                <input className="ui-input" placeholder="Audience" value={audience} onChange={e => setAudience(e.target.value)} />
                <input className="ui-input" placeholder="Industry" value={industry} onChange={e => setIndustry(e.target.value)} />
                <input className="ui-input" placeholder="Seed" value={seed} onChange={e => setSeed(e.target.value)} />
                <input
                  className="ui-input"
                  type="number"
                  min={1}
                  max={10}
                  value={quality}
                  onChange={e => setQuality(Number(e.target.value))}
                  placeholder="Quality 1–10"
                />

                <select className="ui-select" value={aspect} onChange={e => setAspect(e.target.value)}>
                  {["free", "1:1", "3:2", "4:3", "16:9", "9:16", "21:9"].map(v => (
                    <option key={v} value={v}>{v === "free" ? "Aspect: Free" : v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Right: results */}
            <div className="space-y-3">
              <label className="text-xs uppercase tracking-wider text-white/70">Assembled prompt</label>
              <textarea className="ui-textarea min-h-[160px]" readOnly value={assembled} />

              <div className="flex gap-2">
                <button className="ui-btn" onClick={() => navigator.clipboard.writeText(assembled)}>Copy</button>
                <button className="ui-btn" onClick={optimize} disabled={loading}>
                  {loading ? "Optimizing…" : "Optimize with AI"}
                </button>
              </div>

              {err && <p className="text-sm text-red-400">{err}</p>}

              {(rich || optimized) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${scoreBadgeColor(rich?.score)}`}>
                      Score: {rich?.score ?? "—"}/100
                    </span>
                    <button className="ui-btn" onClick={() => setShowDetails(s => !s)}>
                      {showDetails ? "Hide details" : "Show details"}
                    </button>
                  </div>

                  <label className="text-xs uppercase tracking-wider text-white/70">Optimized prompt</label>
                  <textarea className="ui-textarea min-h-[220px]" readOnly value={optimized} />
                  <button className="ui-btn" onClick={() => navigator.clipboard.writeText(optimized)}>Copy optimized</button>
                </div>
              )}

              {rich && showDetails && (
                <div className="ui-card p-3 space-y-3">
                  {[
                    ["Subject", rich.subject, false],
                    ["Environment", rich.environment, false],
                    ["Style", rich.style, false],
                    ["Lighting", rich.lighting, false],
                    ["Camera", rich.camera, false],
                    ["Composition", rich.composition, false],
                    ["Post-process", rich.postprocess, false],
                    ["Negatives", rich.negatives, true],
                  ].map(([label, value, neg]) => (
                    <div key={label as string} className="border-b border-white/10 pb-2 last:border-0">
                      <div className="text-white/60 text-sm mb-1">{label}</div>
                      <div className={neg ? "text-red-300" : "text-white/90"}>{value as string}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Back to Top button */}
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-3 shadow-lg z-50"
        aria-label="Back to top"
      >
        <ArrowUp size={20} />
      </button>
    </div>
  );
}
