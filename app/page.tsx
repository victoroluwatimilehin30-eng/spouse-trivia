'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Plus, Minus, KeyRound, Play, Sparkles } from 'lucide-react';

const CATEGORIES = [
  'Favorites',
  'Memories',
  'Romance',
  'Habits',
  'Daily Life',
  'Hypothetical',
  'Personal',
  'Wildcard',
];

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<'host' | 'join'>('host');

  // Host State
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [coupleCount, setCoupleCount] = useState<number>(2);

  // Join State
  const [joinCode, setJoinCode] = useState('');

  const toggleCategory = (cat: string) => {
    if (cat === 'All') {
      setSelectedCategories(['All']);
      return;
    }

    let updated = selectedCategories.filter((c) => c !== 'All');
    if (updated.includes(cat)) {
      updated = updated.filter((c) => c !== cat);
    } else {
      if (updated.length < 7) {
        updated.push(cat);
      }
    }

    if (updated.length === 0) {
      setSelectedCategories(['All']);
    } else {
      setSelectedCategories(updated);
    }
  };

  const handleProceedToNames = () => {
    const categoriesParam = selectedCategories.join(',');
    router.push(`/setup?count=${coupleCount}&categories=${encodeURIComponent(categoriesParam)}`);
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    router.push(`/play/${joinCode.trim().toUpperCase()}`);
  };

  return (
    <main className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex flex-col items-center justify-center p-6 font-sans selection:bg-[#D4C3A3] selection:text-[#0F0E0C]">
      <div className="w-full max-w-md space-y-8 text-center">
        
        {/* Branding */}
        <div className="space-y-2">
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#9E978E] bg-[#161412] border border-[#26231E] px-3 py-1 rounded-full">
            ● In Sync &nbsp;&nbsp; Couple Trivia
          </span>
          <h1 className="text-4xl sm:text-5xl font-serif font-normal tracking-tight text-[#F3EFE6] pt-2">
            In Sync
          </h1>
          <p className="text-xs text-[#9E978E] max-w-xs mx-auto">
            A minimalist trivia match to test how well you know your spouse.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="bg-[#161412] border border-[#26231E] p-1.5 rounded-full flex gap-1 max-w-xs mx-auto shadow-inner">
          <button
            onClick={() => setMode('host')}
            className={`flex-1 py-2 rounded-full text-xs font-medium transition-all ${
              mode === 'host'
                ? 'bg-[#26231E] text-[#F3EFE6] shadow-md border border-[#302B25]'
                : 'text-[#9E978E] hover:text-[#F3EFE6]'
            }`}
          >
            Host Game
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 rounded-full text-xs font-medium transition-all ${
              mode === 'join'
                ? 'bg-[#26231E] text-[#F3EFE6] shadow-md border border-[#302B25]'
                : 'text-[#9E978E] hover:text-[#F3EFE6]'
            }`}
          >
            Join Room
          </button>
        </div>

        {/* HOST MODE */}
        {mode === 'host' && (
          <div className="bg-[#161412] border border-[#26231E] p-6 sm:p-8 rounded-3xl space-y-6 shadow-2xl text-left">
            <div className="text-center space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645B]">
                Setup Session
              </span>
              <h2 className="text-base font-serif text-[#F3EFE6]">Game Configuration</h2>
            </div>

            {/* Category Filter Selection */}
            <div className="space-y-3">
              <div className="flex justify-between items-center text-[10px] uppercase font-mono tracking-wider text-[#9E978E]">
                <span>Select Categories (Max 7)</span>
                <div className="space-x-2">
                  <button
                    onClick={() => setSelectedCategories(['All'])}
                    className="hover:text-[#F3EFE6] underline"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => setSelectedCategories(['Favorites'])}
                    className="hover:text-[#F3EFE6] underline"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => toggleCategory('All')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-medium border transition-all ${
                    selectedCategories.includes('All')
                      ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3] font-semibold'
                      : 'bg-[#0F0E0C] text-[#9E978E] border-[#26231E] hover:border-[#38332C]'
                  }`}
                >
                  All
                </button>
                {CATEGORIES.map((cat) => {
                  const isSelected = selectedCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => toggleCategory(cat)}
                      className={`py-2.5 px-2 rounded-xl text-[11px] font-medium border transition-all truncate ${
                        isSelected
                          ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3] font-semibold'
                          : 'bg-[#0F0E0C] text-[#9E978E] border-[#26231E] hover:border-[#38332C]'
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Couple Counter */}
            <div className="space-y-3 pt-2 border-t border-[#26231E]">
              <span className="block text-center text-[10px] uppercase font-mono tracking-wider text-[#9E978E]">
                How many couples are playing?
              </span>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setCoupleCount((c) => Math.max(2, c - 1))}
                  className="w-10 h-10 rounded-full bg-[#0F0E0C] border border-[#26231E] flex items-center justify-center text-[#9E978E] hover:text-[#F3EFE6] hover:border-[#38332C] transition-all"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <div className="text-center font-mono">
                  <span className="text-xl font-bold text-[#F3EFE6]">{coupleCount}</span>
                  <span className="block text-[9px] uppercase tracking-wider text-[#6B645B]">
                    Couples
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setCoupleCount((c) => Math.min(10, c + 1))}
                  className="w-10 h-10 rounded-full bg-[#0F0E0C] border border-[#26231E] flex items-center justify-center text-[#9E978E] hover:text-[#F3EFE6] hover:border-[#38332C] transition-all"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <button
              onClick={handleProceedToNames}
              className="w-full bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
            >
              Continue to Player Names <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* JOIN MODE */}
        {mode === 'join' && (
          <form
            onSubmit={handleJoinRoom}
            className="bg-[#161412] border border-[#26231E] p-8 rounded-3xl space-y-6 shadow-2xl text-left"
          >
            <div className="text-center space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#6B645B]">
                Player Entry
              </span>
              <h2 className="text-base font-serif text-[#F3EFE6]">Enter Room Code</h2>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] uppercase font-mono tracking-wider text-[#9E978E]">
                Room Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 w-4 h-4 text-[#6B645B]" />
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="e.g. 4OQ4PU"
                  className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl py-3 pl-10 pr-4 text-xs font-mono tracking-wider text-[#F3EFE6] uppercase placeholder:text-[#38332C] focus:outline-none focus:border-[#D4C3A3]"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95"
            >
              <Play className="w-3.5 h-3.5" /> Join Match
            </button>
          </form>
        )}

      </div>
    </main>
  );
}