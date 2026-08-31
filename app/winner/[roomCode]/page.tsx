'use client';

import { useState, useEffect, use } from 'react';
import { supabase } from '@/lib/supabase';
import { Trophy, Crown, RotateCcw, Home, Award, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function WinnerPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const roomCodeUpper = resolvedParams.roomCode ? resolvedParams.roomCode.toUpperCase() : '';

  const [couples, setCouples] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!roomCodeUpper) return;

    const fetchWinnerData = async () => {
      setLoading(true);
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('room_code', roomCodeUpper)
        .maybeSingle();

      if (room) {
        const { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', room.id)
          .order('total_score', { ascending: false });

        if (couplesData) {
          setCouples(couplesData);
        }
      }
      setLoading(false);
    };

    fetchWinnerData();
  }, [roomCodeUpper]);

  const handleRematch = async () => {
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('room_code', roomCodeUpper)
      .maybeSingle();

    if (room) {
      await supabase.from('submissions').delete().eq('room_code', roomCodeUpper);
      await supabase
        .from('rooms')
        .update({
          current_question_id: null,
          used_question_ids: [],
          active_couple_id: null,
        })
        .eq('room_code', roomCodeUpper);

      await supabase
        .from('couples')
        .update({ total_score: 0 })
        .eq('room_id', room.id);
    }

    router.push(`/host/${roomCodeUpper}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center font-sans">
        <p className="text-xs font-mono text-[#9E978E] animate-pulse">Calculating final results...</p>
      </div>
    );
  }

  const winner = couples.length > 0 ? couples[0] : null;
  const loser = couples.length > 1 ? couples[couples.length - 1] : null;
  const runnersUp = couples.slice(1);

  return (
    <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] p-6 lg:p-12 font-sans flex flex-col items-center justify-center">
      <div className="max-w-2xl w-full space-y-6">
        
        {/* Header / Title */}
        <div className="text-center space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#D4C3A3] flex items-center justify-center gap-1.5">
            <Trophy className="w-4 h-4 text-[#D4C3A3]" /> Match Concluded
          </span>
          <h1 className="text-3xl sm:text-4xl font-serif text-[#F3EFE6]">Final Standings</h1>
          <p className="text-xs text-[#9E978E]">
            Room Code: <span className="font-mono text-[#F3EFE6]">{roomCodeUpper}</span>
          </p>
        </div>

        {/* Winner Card / Podium */}
        {winner && (
          <div className="bg-gradient-to-b from-[#26231E] to-[#161412] border-2 border-[#D4C3A3] p-8 rounded-3xl text-center space-y-4 shadow-2xl relative overflow-hidden">
            <div className="absolute top-4 right-4 text-[#D4C3A3]/20">
              <Crown className="w-20 h-20" />
            </div>
            
            <div className="w-14 h-14 bg-[#D4C3A3] text-[#0F0E0C] rounded-full flex items-center justify-center mx-auto shadow-lg">
              <Crown className="w-7 h-7" />
            </div>

            <div className="space-y-1 relative z-10">
              <span className="text-[10px] uppercase font-mono tracking-widest text-[#D4C3A3] block">
                Ultimate Champions
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif font-bold text-[#F3EFE6]">
                {winner.team_name}
              </h2>
              <p className="text-xs text-[#9E978E]">
                {winner.husband_name} & {winner.wife_name}
              </p>
            </div>

            <div className="pt-2">
              <span className="inline-block bg-[#0F0E0C] border border-[#26231E] px-6 py-2 rounded-full font-mono text-lg font-bold text-[#D4C3A3] shadow-inner">
                {winner.total_score} Points
              </span>
            </div>
          </div>
        )}

        {/* Hosting Note for the team with the least score */}
        {loser && couples.length > 1 && (
          <div className="bg-[#161412] border border-[#302B25] p-4 rounded-2xl text-center space-y-1 shadow-md">
            <span className="text-[10px] uppercase font-mono tracking-widest text-[#D4C3A3] flex items-center justify-center gap-1">
              <Calendar className="w-3 h-3" /> Next Gathering Host Announcement
            </span>
            <p className="text-xs sm:text-sm font-serif text-[#F3EFE6]">
              🏠 <span className="font-bold text-[#D4C3A3]">{loser.team_name}</span> ({loser.husband_name} & {loser.wife_name}) will be hosting the next gathering!
            </p>
          </div>
        )}

        {/* Runners Up List */}
        {runnersUp.length > 0 && (
          <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl space-y-3">
            <h3 className="text-xs uppercase font-mono tracking-wider text-[#9E978E] mb-2 flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-[#D4C3A3]" /> Other Standings
            </h3>
            <div className="space-y-2">
              {runnersUp.map((couple, index) => (
                <div
                  key={couple.id}
                  className="bg-[#0F0E0C] border border-[#26231E] p-3.5 rounded-xl flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-[#6B645B] font-semibold">
                      #{index + 2}
                    </span>
                    <div>
                      <p className="text-xs font-medium text-[#F3EFE6]">{couple.team_name}</p>
                      <p className="text-[10px] text-[#6B645B]">{couple.husband_name} & {couple.wife_name}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold text-[#D4C3A3]">
                    {couple.total_score} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleRematch}
            className="bg-[#D4C3A3] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-md"
          >
            <RotateCcw className="w-4 h-4" /> Play Again (Rematch)
          </button>
          <button
            onClick={() => router.push('/')}
            className="bg-[#161412] hover:bg-[#1C1A17] border border-[#26231E] text-[#F3EFE6] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Home className="w-4 h-4 text-[#9E978E]" /> Go to Home
          </button>
        </div>

      </div>
    </div>
  );
}