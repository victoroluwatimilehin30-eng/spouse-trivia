'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowRight, Loader2, Heart } from 'lucide-react';

function SetupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const countParam = Number(searchParams.get('count') || '2');
  const categoriesParam = searchParams.get('categories') || 'All';

  const [couples, setCouples] = useState<Array<{ team_name: string; husband_name: string; wife_name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    const initial = Array.from({ length: countParam }, (_, i) => ({
      team_name: `Team ${i + 1}`,
      husband_name: '',
      wife_name: '',
    }));
    setCouples(initial);

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomCode(code);
  }, [countParam]);

  const handleInputChange = (index: number, field: string, value: string) => {
    const updated = [...couples];
    updated[index] = { ...updated[index], [field]: value };
    setCouples(updated);
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: roomData, error: roomError } = await supabase
        .from('rooms')
        .insert({
          room_code: roomCode,
          selected_category: categoriesParam,
          used_question_ids: [],
        })
        .select()
        .single();

      if (roomError) throw roomError;

      const couplesToInsert = couples.map((c) => ({
        room_id: roomData.id,
        team_name: c.team_name || 'Couple',
        husband_name: c.husband_name || 'Partner 1',
        wife_name: c.wife_name || 'Partner 2',
        total_score: 0,
      }));

      const { error: couplesError } = await supabase
        .from('couples')
        .insert(couplesToInsert);

      if (couplesError) throw couplesError;

      router.push(`/host/${roomCode}`);
    } catch (err) {
      console.error('Error creating room:', err);
      alert('Failed to create room. Please check your Supabase connection.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg space-y-8">
      <div className="text-center space-y-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-[#9E978E] bg-[#161412] border border-[#26231E] px-3 py-1 rounded-full">
          Room Code: <strong className="text-[#D4C3A3] font-mono">{roomCode}</strong>
        </span>
        <h1 className="text-3xl font-serif text-[#F3EFE6]">Enter Player Names</h1>
        <p className="text-xs text-[#9E978E]">
          Configure team names and partner names for your {countParam} participating couples.
        </p>
      </div>

      <form onSubmit={handleCreateRoom} className="space-y-4">
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {couples.map((couple, idx) => (
            <div key={idx} className="bg-[#161412] border border-[#26231E] p-5 rounded-2xl space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-[#26231E] pb-2">
                <span className="text-xs font-mono font-semibold text-[#D4C3A3] flex items-center gap-1.5">
                  <Heart className="w-3.5 h-3.5 text-[#D4C3A3]" /> Couple {idx + 1}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] uppercase font-mono tracking-wider text-[#9E978E] mb-1">
                    Team Name
                  </label>
                  <input
                    type="text"
                    value={couple.team_name}
                    onChange={(e) => handleInputChange(idx, 'team_name', e.target.value)}
                    placeholder="e.g. The Smiths"
                    className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] uppercase font-mono tracking-wider text-[#9E978E] mb-1">
                      Partner 1 Name
                    </label>
                    <input
                      type="text"
                      value={couple.husband_name}
                      onChange={(e) => handleInputChange(idx, 'husband_name', e.target.value)}
                      placeholder="e.g. John"
                      className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-mono tracking-wider text-[#9E978E] mb-1">
                      Partner 2 Name
                    </label>
                    <input
                      type="text"
                      value={couple.wife_name}
                      onChange={(e) => handleInputChange(idx, 'wife_name', e.target.value)}
                      placeholder="e.g. Sarah"
                      className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-4 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Creating Room...
            </>
          ) : (
            <>
              Start Game & Enter Host Dashboard <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex flex-col items-center justify-center p-6 font-sans">
      <Suspense fallback={
        <div className="text-xs font-mono text-[#9E978E] animate-pulse">Loading setup...</div>
      }>
        <SetupForm />
      </Suspense>
    </main>
  );
}