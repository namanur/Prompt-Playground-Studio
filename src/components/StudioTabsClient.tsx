'use client';

import React, { useMemo, useState, useRef } from 'react';
import { BASE_TEMPLATES, assemblePrompt, type Template } from '@/lib/prompt';
import { Star, Search, ArrowUp } from 'lucide-react';

type Locked = 'images' | 'writing' | 'emails';
const TABS: (keyof typeof BASE_TEMPLATES)[] = ['images', 'writing', 'emails'];

export default function StudioTabsClient({ lockedTab }: { lockedTab?: Locked }) {
  const builderRef = useRef<HTMLDivElement>(null);

  // Initialize tab from lockedTab if provided
  const [tab, setTab] = useState<keyof typeof BASE_TEMPLATES>(lockedTab ?? 'images');

  const [q, setQ] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);

  const list = BASE_TEMPLATES[tab];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(t =>
      !s || (t.title + ' ' + (t.subtitle || '') + ' ' + t.tags.join(' ')).toLowerCase().includes(s)
    );
  }, [list, q]);

  const [builder, setBuilder] = useState<{ template?: Template; values: Record<string, string> }>({ values: {} });

  // --- keep the rest of your state as-is ---
  const [quality, setQuality] = useState(7);
  const [seed, setSeed] = useState('auto');
  const [tone, setTone] = useState('professional');
  const [complexity, setComplexity] = useState('intermediate');
  const [length, setLength] = useState('detailed');
  const [audience, setAudience] = useState('general');
  const [industry, setIndustry] = useState('general');
  const [format, setFormat] = useState('paragraph');
  const [aspect, setAspect] = useState('free');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [optimized, setOptimized] = useState('');
  const [rich, setRich] = useState<any>(null);
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
    setTimeout(() => builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function toggleFavorite(id: string) {
    setFavorites(f => (f.includes(id) ? f.filter(x => x !== id) : [...f, id]));
  }

  function qualityToTag(n: number) {
    if (n >= 9) return '9/10';
    if (n >= 8) return '8/10';
    if (n >= 7) return '7/10';
    if (n >= 6) return '6/10';
    return `${Math.max(1, Math.min(10, n))}/10`;
  }

  async function optimize() {
    if (!builder.template) {
      setErr('Pick a template first.');
      return;
    }
    setErr(null);
    setLoading(true);
    setOptimized('');
    setRich(null);
    try {
      const r = await fetch('/api/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIdea: assembled,
          aspect,
          quality: qualityToTag(quality),
          seed: seed || 'auto'
        })
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.error || 'Optimize failed');

      setOptimized(j.result.final_prompt);
      setRich(j.result);
      setShowDetails(true);
    } catch (e: any) {
      setErr(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  function scoreBadgeColor(score?: number) {
    if (!score && score !== 0) return 'text-white/80 bg-white/10 border-white/20';
    if (score >= 95) return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    if (score >= 90) return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    if (score >= 80) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    return 'text-red-400 bg-red-400/10 border-red-400/20';
  }

  return (
    <div className="container py-10">
      {/* Header with tabs */}
      <div className="flex flex-col gap-4 items-center mb-8">
        <h1 className="text-3xl font-semibold">Prompt Playground Studio</h1>

        {/* Hide tab bar when locked; also ignore tab clicks if locked */}
        {!lockedTab && (
          <div className="flex gap-6 border-b border-white/10">
            {TABS.map(t => (
              <button
                key={t}
                onClick={() => { if (!lockedTab) setTab(t); }}
                className={`pb-2 px-2 text-sm font-medium transition-colors ${
                  tab === t ? 'text-white border-b-2 border-blue-500' : 'text-white/60 hover:text-white'
                }`}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        )}

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

      {/* ---- keep your Template grid, Builder, etc. exactly as-is below ---- */}
      {/* (no other changes necessary) */}
      {/* ... your existing JSX unchanged ... */}
      <div ref={builderRef} />
    </div>
  );
}
