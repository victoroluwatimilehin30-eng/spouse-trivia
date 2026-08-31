'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Send, Check, AlertCircle, Clock, Trophy, Eye } from 'lucide-react';

function getShuffledQuestions(questionsArray: any[], roomCode: string) {
  if (!roomCode || questionsArray.length === 0) return questionsArray;
  
  let hash = 0;
  for (let i = 0; i < roomCode.length; i++) {
    hash = (hash << 5) - hash + roomCode.charCodeAt(i);
    hash |= 0;
  }
  let seed = Math.abs(hash);
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const arr = [...questionsArray];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function PlayerInput({ params }: { params: Promise<{ roomCode: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const roomCodeUpper = resolvedParams?.roomCode ? resolvedParams.roomCode.toUpperCase() : '';

  const [couples, setCouples] = useState<any[]>([]);
  const [selectedCoupleId, setSelectedCoupleId] = useState<string>('');
  const [spouseType, setSpouseType] = useState<'wife' | 'husband' | null>(null);

  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const [usedQuestionIds, setUsedQuestionIds] = useState<number[]>([]);
  const [activeCoupleId, setActiveCoupleId] = useState<string | null>(null);

  const [answer, setAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState(false);

  useEffect(() => {
    if (!roomCodeUpper) return;

    let channel: any;
    let couplesChannel: any;
    let pollInterval: any;

    const initRoom = async () => {
      try {
        setLoading(true);

        const { data: qData } = await supabase
          .from('questions')
          .select('*')
          .order('id', { ascending: true });

        if (qData) setQuestions(qData);

        const { data: room, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', roomCodeUpper)
          .maybeSingle();

        if (roomErr || !room) {
          setRoomError(true);
          setLoading(false);
          return;
        }

        // If game has already ended, redirect immediately
        if (room.selected_category === 'GAME_OVER') {
          router.push(`/winner/${roomCodeUpper}`);
          return;
        }

        if (room.selected_category) setSelectedCategories(room.selected_category.split(','));
        if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);
        if (room.active_couple_id) setActiveCoupleId(room.active_couple_id);

        if (room.current_question_id && qData) {
          const found = qData.find((q) => Number(q.id) === Number(room.current_question_id));
          if (found) setCurrentQuestion(found);
        }

        const { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', room.id)
          .order('total_score', { ascending: false });

        if (couplesData && couplesData.length > 0) {
          setCouples(couplesData);
          if (!room.active_couple_id) setActiveCoupleId(couplesData[0].id);
        } else {
          setRoomError(true);
        }
      } catch (err) {
        console.error('Init error:', err);
        setRoomError(true);
      } finally {
        setLoading(false);
      }
    };

    initRoom();

    // Fast Polling fallback for room updates & game end check
    pollInterval = setInterval(async () => {
      try {
        const { data: room } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', roomCodeUpper)
          .maybeSingle();

        if (room) {
          if (room.selected_category === 'GAME_OVER') {
            router.push(`/winner/${roomCodeUpper}`);
            return;
          }

          if (room.selected_category) setSelectedCategories(room.selected_category.split(','));
          if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);
          if (room.active_couple_id) setActiveCoupleId(room.active_couple_id);

          if (room.current_question_id) {
            const { data: q } = await supabase
              .from('questions')
              .select('*')
              .eq('id', room.current_question_id)
              .maybeSingle();

            if (q) setCurrentQuestion(q);
          } else {
            setCurrentQuestion(null);
          }

          const { data: couplesData } = await supabase
            .from('couples')
            .select('*')
            .eq('room_id', room.id)
            .order('total_score', { ascending: false });

          if (couplesData) setCouples(couplesData);
        }

        if (selectedCoupleId && spouseType) {
          const { data: sub } = await supabase
            .from('submissions')
            .select('*')
            .eq('room_code', roomCodeUpper)
            .eq('couple_id', selectedCoupleId)
            .maybeSingle();

          if (sub) {
            const maskField = spouseType === 'wife' ? 'wife_unmasked' : 'husband_unmasked';
            if (sub[maskField] !== undefined) {
              setIsRevealed(sub[maskField]);
            }
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1000);

    // Realtime channel for room changes & game end detection
    channel = supabase
      .channel(`player_room_sync_${roomCodeUpper}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCodeUpper}` },
        async (payload) => {
          const updatedCat = payload.new.selected_category;
          if (updatedCat === 'GAME_OVER') {
            router.push(`/winner/${roomCodeUpper}`);
            return;
          }

          const qId = payload.new.current_question_id;
          if (qId) {
            const { data: newQ } = await supabase
              .from('questions')
              .select('*')
              .eq('id', qId)
              .maybeSingle();

            if (newQ) {
              setCurrentQuestion(newQ);
              setIsSubmitted(false);
              setAnswer('');
              setIsRevealed(false);
            }
          } else {
            setCurrentQuestion(null);
            setIsSubmitted(false);
            setAnswer('');
            setIsRevealed(false);
          }

          if (payload.new.used_question_ids) {
            setUsedQuestionIds(payload.new.used_question_ids);
          }
          if (payload.new.active_couple_id) {
            setActiveCoupleId(payload.new.active_couple_id);
          }
        }
      )
      .subscribe();

    couplesChannel = supabase
      .channel(`player_couples_sync_${roomCodeUpper}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couples' },
        () => {
          supabase
            .from('couples')
            .select('*')
            .order('total_score', { ascending: false })
            .then(({ data }) => {
              if (data) setCouples(data);
            });
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      if (channel) supabase.removeChannel(channel);
      if (couplesChannel) supabase.removeChannel(couplesChannel);
    };
  }, [roomCodeUpper, selectedCoupleId, spouseType, router]);

  const filteredQuestions = useMemo(() => {
    let base = selectedCategories.includes('All')
      ? questions
      : questions.filter((q) => selectedCategories.includes(q.category));
    
    return getShuffledQuestions(base, roomCodeUpper);
  }, [questions, selectedCategories, roomCodeUpper]);

  const isMyTurn = selectedCoupleId && activeCoupleId ? selectedCoupleId === activeCoupleId : true;

  const handlePlayerPickQuestion = async (q: any) => {
    if (!isMyTurn || usedQuestionIds.includes(q.id)) return;

    const newUsed = [...usedQuestionIds, q.id];
    setCurrentQuestion(q);
    setUsedQuestionIds(newUsed);
    setIsSubmitted(false);
    setAnswer('');
    setIsRevealed(false);

    await supabase.from('submissions').delete().eq('room_code', roomCodeUpper);
    await supabase
      .from('rooms')
      .update({
        current_question_id: q.id,
        used_question_ids: newUsed,
        active_couple_id: selectedCoupleId,
      })
      .eq('room_code', roomCodeUpper);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || !spouseType || !selectedCoupleId) return;

    const updateField = spouseType === 'wife' ? 'wife_answer' : 'husband_answer';

    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('room_code', roomCodeUpper)
      .eq('couple_id', selectedCoupleId)
      .maybeSingle();

    if (existing) {
      await supabase.from('submissions').update({ [updateField]: answer }).eq('id', existing.id);
    } else {
      await supabase.from('submissions').insert({
        room_code: roomCodeUpper,
        couple_id: selectedCoupleId,
        [updateField]: answer,
      });
    }

    setIsSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center font-sans">
        <p className="text-xs font-mono text-[#9E978E] animate-pulse">Connecting to room...</p>
      </div>
    );
  }

  if (roomError) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center p-6 font-sans">
        <div className="bg-[#161412] border border-[#26231E] p-8 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <h1 className="text-lg font-serif text-[#F3EFE6]">Room Not Found</h1>
          <a
            href="/"
            className="inline-block bg-[#1C1A17] border border-[#302B25] text-[#F3EFE6] px-6 py-2 rounded-full text-xs"
          >
            Go Home
          </a>
        </div>
      </div>
    );
  }

  if (!spouseType || !selectedCoupleId) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center p-6 font-sans">
        <div className="bg-[#161412] border border-[#26231E] p-8 rounded-2xl max-w-sm w-full text-center space-y-6 shadow-2xl">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-widest text-[#9E978E]">In Sync</span>
            <h1 className="text-xl font-serif text-[#F3EFE6]">Join Room</h1>
            <p className="text-[#9E978E] text-xs">
              Room Code: <span className="font-mono text-[#F3EFE6]">{roomCodeUpper}</span>
            </p>
          </div>

          <div className="space-y-4 text-left">
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[#9E978E] mb-2">
                1. Select Team
              </label>
              <select
                value={selectedCoupleId}
                onChange={(e) => setSelectedCoupleId(e.target.value)}
                className="w-full bg-[#0F0E0C] border border-[#26231E] text-xs text-[#F3EFE6] rounded-xl p-3 focus:outline-none"
              >
                <option value="">-- Choose Couple --</option>
                {couples.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.team_name} ({c.husband_name} & {c.wife_name})
                  </option>
                ))}
              </select>
            </div>

            {selectedCoupleId && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9E978E] mb-2">
                  2. Who is holding this device?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSpouseType('wife')}
                    className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#F3EFE6] py-3 rounded-xl font-medium text-xs transition-all"
                  >
                    Wife
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpouseType('husband')}
                    className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#F3EFE6] py-3 rounded-xl font-medium text-xs transition-all"
                  >
                    Husband
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderLiveScoreboard = () => (
    <div className="bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3.5 space-y-2 mt-4 text-left">
      <div className="flex items-center justify-between border-b border-[#26231E] pb-2">
        <span className="text-[10px] uppercase font-mono tracking-wider text-[#9E978E] flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-[#D4C3A3]" /> Live Standings
        </span>
      </div>
      <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
        {couples.map((c, idx) => (
          <div
            key={c.id}
            className={`flex items-center justify-between p-2 rounded-lg text-xs ${
              c.id === selectedCoupleId ? 'bg-[#26231E] border border-[#D4C3A3]/30' : 'bg-[#161412]'
            }`}
          >
            <span className="text-[#F3EFE6] truncate max-w-[180px]">
              {idx + 1}. {c.team_name}
            </span>
            <span className="font-mono font-semibold text-[#D4C3A3]">{c.total_score} pts</span>
          </div>
        ))}
      </div>
    </div>
  );

  if (!isMyTurn) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center p-4 font-sans">
        <div className="bg-[#161412] border border-[#26231E] rounded-2xl p-6 max-w-md w-full text-center space-y-4 shadow-2xl">
          <div className="w-10 h-10 bg-[#1C1A17] border border-[#26231E] text-[#D4C3A3] rounded-full flex items-center justify-center mx-auto">
            <Clock className="w-4 h-4 animate-pulse" />
          </div>
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase text-[#6B645B] tracking-widest block">
              In Sync
            </span>
            <h2 className="text-lg font-serif text-[#F3EFE6]">Waiting for your Turn</h2>
            <p className="text-xs text-[#9E978E] max-w-xs mx-auto leading-relaxed">
              Another team is currently on stage answering their prompt. Please standby...
            </p>
          </div>

          {renderLiveScoreboard()}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center p-4 font-sans">
      <div className="bg-[#161412] border border-[#26231E] rounded-2xl p-6 max-w-md w-full space-y-5 shadow-2xl">
        <div className="flex justify-between items-center border-b border-[#26231E] pb-3">
          <span className="text-[11px] uppercase tracking-wider text-[#9E978E]">
            Room <span className="font-mono text-[#F3EFE6]">{roomCodeUpper}</span>
          </span>
          <span className="text-[10px] uppercase font-mono px-3 py-0.5 rounded-full bg-[#1C1A17] text-[#D4C3A3] border border-[#26231E]">
            {spouseType}
          </span>
        </div>

        {currentQuestion ? (
          <>
            <div className="bg-[#0F0E0C] border border-[#26231E] p-4 rounded-xl space-y-1 text-center">
              <span className="text-[10px] uppercase font-mono tracking-widest text-[#D4C3A3] block">
                Current Question ({currentQuestion.category})
              </span>
              <p className="text-sm font-serif text-[#F3EFE6] leading-relaxed">
                "{currentQuestion.question_text}"
              </p>
            </div>

            {!isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#9E978E]">Your Answer:</label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Type your response here..."
                    rows={3}
                    className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3.5 text-xs text-[#F3EFE6] placeholder:text-[#6B645B] focus:outline-none focus:border-[#D4C3A3] resize-none"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <Send className="w-3.5 h-3.5" /> Submit & Lock Answer
                </button>
              </form>
            ) : (
              <div className="py-2 text-center space-y-3">
                <div className="w-10 h-10 bg-[#1C231B] text-[#86EFAC] border border-[#273B25] rounded-full flex items-center justify-center mx-auto">
                  <Check className="w-4 h-4" />
                </div>
                <h2 className="text-base font-serif text-[#F3EFE6]">Response Sent</h2>
                <div className="bg-[#0F0E0C] border border-[#26231E] p-3.5 rounded-xl space-y-1">
                  <span className="text-[10px] text-[#6B645B] font-mono flex items-center justify-center gap-1 uppercase">
                    {isRevealed ? <Eye className="w-3 h-3 text-[#D4C3A3]" /> : <Lock className="w-3 h-3" />} 
                    {isRevealed ? 'Revealed by Host' : 'Hidden from view'}
                  </span>
                  <p className={`font-mono text-xs ${isRevealed ? 'text-[#F3EFE6] text-sm font-serif py-1' : 'text-[#38332C] blur-sm'}`}>
                    {answer}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 text-center">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-[#D4C3A3] tracking-widest block">
                Your Team's Turn
              </span>
              <h3 className="text-base font-serif text-[#F3EFE6]">Pick Next Question Number</h3>
              <p className="text-xs text-[#9E978E]">
                Tap any available question number to select it for both partners
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2 max-h-[160px] overflow-y-auto pr-1 pt-1">
              {filteredQuestions.map((q, idx) => {
                const isUsed = usedQuestionIds.includes(q.id);
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => handlePlayerPickQuestion(q)}
                    disabled={isUsed}
                    className={`py-2.5 rounded-xl text-xs font-mono font-semibold border transition-all ${
                      isUsed
                        ? 'bg-[#0F0E0C] text-[#38332C] border-[#1C1A17] cursor-not-allowed line-through'
                        : 'bg-[#1C1A17] text-[#F3EFE6] border-[#26231E] hover:border-[#D4C3A3] active:scale-95'
                    }`}
                  >
                    Q{idx + 1}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {renderLiveScoreboard()}
      </div>
    </div>
  );
}