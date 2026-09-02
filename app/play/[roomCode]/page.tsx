'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Send, Check, AlertCircle, Clock, Trophy, Eye, Layers, Edit3 } from 'lucide-react';

const FALLBACK_QUESTIONS = [
  { id: 1, category: 'Habits', question_text: 'What is your spouse absolute favorite comfort food?' },
  { id: 2, category: 'Habits', question_text: 'What is your spouse biggest house pet peeve?' },
  { id: 3, category: 'Habits', question_text: 'What side of the bed does your spouse sleep on?' },
  { id: 4, category: 'Habits', question_text: 'What is the very first thing your spouse does after waking up?' },
  { id: 5, category: 'Favorites', question_text: 'What is your spouse favorite restaurant of all time?' },
  { id: 6, category: 'Favorites', question_text: 'What is your spouse favorite movie they can rewatch endlessly?' },
  { id: 7, category: 'Memories', question_text: 'Where was your very first official date?' },
  { id: 8, category: 'Memories', question_text: 'What was the first gift your spouse ever bought for you?' },
  { id: 9, category: 'Romance', question_text: 'Who said "I love you" first, and where were you?' },
  { id: 10, category: 'Romance', question_text: 'Who made the first move when you started dating?' }
];

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
  
  const [selectedCoupleId, setSelectedCoupleId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(`player_couple_${roomCodeUpper}`) || '';
    }
    return '';
  });

  const [spouseType, setSpouseType] = useState<'wife' | 'husband' | null>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(`player_spouse_${roomCodeUpper}`) as 'wife' | 'husband') || null;
    }
    return null;
  });

  const [tempCoupleId, setTempCoupleId] = useState('');
  const [tempSpouseType, setTempSpouseType] = useState<'wife' | 'husband' | null>(null);

  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [usedQuestionIds, setUsedQuestionIds] = useState<number[]>([]);
  const [activeCoupleId, setActiveCoupleId] = useState<string | null>(null);

  const [answer, setAnswer] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState(false);
  const [teamSubmissionsHistory, setTeamSubmissionsHistory] = useState<any[]>([]);

  const handleSelectTeamAndRole = (coupleId: string, type: 'wife' | 'husband') => {
    setSelectedCoupleId(coupleId);
    setSpouseType(type);
    localStorage.setItem(`player_couple_${roomCodeUpper}`, coupleId);
    localStorage.setItem(`player_spouse_${roomCodeUpper}`, type);
  };

  useEffect(() => {
    if (!roomCodeUpper) return;

    let pollInterval: any;

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    const initRoom = async () => {
      try {
        const { data: qData } = await supabase
          .from('questions')
          .select('*')
          .order('id', { ascending: true });

        if (qData && qData.length > 0) {
          setQuestions(qData);
        } else {
          setQuestions(FALLBACK_QUESTIONS);
        }

        const { data: room, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', roomCodeUpper)
          .maybeSingle();

        if (roomErr || !room) {
          setRoomError(true);
          setLoading(false);
          clearTimeout(safetyTimer);
          return;
        }

        if (room.selected_category === 'GAME_OVER') {
          router.push(`/winner/${roomCodeUpper}`);
          return;
        }

        if (room.current_round) setCurrentRound(room.current_round);
        if (room.selected_category) setSelectedCategories(room.selected_category.split(','));
        if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);
        if (room.active_couple_id) setActiveCoupleId(room.active_couple_id);
        if (room.question_started_at) setQuestionStartedAt(room.question_started_at);

        if (room.current_question_id) {
          const activeList = qData && qData.length > 0 ? qData : FALLBACK_QUESTIONS;
          const found = activeList.find((q) => Number(q.id) === Number(room.current_question_id));
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
        }
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    initRoom();

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

          if (room.current_round && room.current_round !== currentRound) {
            setCurrentRound(room.current_round);
            setIsSubmitted(false);
            setAnswer('');
            setIsRevealed(false);
          }

          if (room.selected_category) setSelectedCategories(room.selected_category.split(','));
          if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);
          if (room.active_couple_id) setActiveCoupleId(room.active_couple_id);
          if (room.question_started_at !== questionStartedAt) {
            setQuestionStartedAt(room.question_started_at);
          }

          if (room.current_question_id) {
            const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
            const q = activePool.find(item => Number(item.id) === Number(room.current_question_id));
            if (q) setCurrentQuestion(q);
          } else {
            setCurrentQuestion(null);
            setQuestionStartedAt(null);
          }

          const { data: couplesData } = await supabase
            .from('couples')
            .select('*')
            .eq('room_id', room.id)
            .order('total_score', { ascending: false });

          if (couplesData && couplesData.length > 0) {
            setCouples(couplesData);
          }
        }

        const currentCoupleId = localStorage.getItem(`player_couple_${roomCodeUpper}`);
        const currentSpouse = localStorage.getItem(`player_spouse_${roomCodeUpper}`);

        if (currentCoupleId) {
          const { data: allSubs } = await supabase
            .from('submissions')
            .select('*')
            .eq('room_code', roomCodeUpper)
            .eq('couple_id', currentCoupleId);

          if (allSubs) {
            setTeamSubmissionsHistory(allSubs);
            const currentSub = allSubs.find(s => Number(s.round_number) === Number(currentRound));
            if (currentSub && currentSpouse) {
              const myField = currentSpouse === 'wife' ? 'wife_answer' : 'husband_answer';
              if (currentSub[myField] && !answer && !isSubmitted) {
                setAnswer(currentSub[myField]);
                setIsSubmitted(true);
              }
            }
          }

          if (currentSpouse) {
            const { data: sub } = await supabase
              .from('submissions')
              .select('*')
              .eq('room_code', roomCodeUpper)
              .eq('couple_id', currentCoupleId)
              .eq('round_number', currentRound)
              .maybeSingle();

            if (sub) {
              const maskField = currentSpouse === 'wife' ? 'wife_unmasked' : 'husband_unmasked';
              if (sub[maskField] !== undefined) {
                setIsRevealed(sub[maskField]);
              }
            }
          }
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 1000);

    return () => {
      clearTimeout(safetyTimer);
      clearInterval(pollInterval);
    };
  }, [roomCodeUpper, router, currentRound, questions, answer, isSubmitted, questionStartedAt]);

  // Live countdown timer handler for players
  useEffect(() => {
    if (!questionStartedAt) {
      setTimeLeft(60);
      return;
    }

    const timerInterval = setInterval(() => {
      const startTime = new Date(questionStartedAt).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, 60 - elapsedSeconds);
      setTimeLeft(remaining);
    }, 500);

    return () => clearInterval(timerInterval);
  }, [questionStartedAt]);

  const filteredQuestions = useMemo(() => {
    const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;

    if (selectedCategories.includes('All') || selectedCategories.length === 0) {
      return getShuffledQuestions(activePool, roomCodeUpper);
    }

    const matched = activePool.filter((q) => 
      selectedCategories.some(cat => q.category?.trim().toLowerCase() === cat.trim().toLowerCase())
    );

    const baseToUse = matched.length > 0 ? matched : activePool;
    return getShuffledQuestions(baseToUse, roomCodeUpper);
  }, [questions, selectedCategories, roomCodeUpper]);

  const currentQuestionNumber = useMemo(() => {
    if (!currentQuestion) return null;
    const idx = filteredQuestions.findIndex(q => Number(q.id) === Number(currentQuestion.id));
    return idx !== -1 ? idx + 1 : null;
  }, [currentQuestion, filteredQuestions]);

  const isMyTurn = selectedCoupleId && activeCoupleId ? selectedCoupleId === activeCoupleId : true;

  const handlePlayerPickQuestion = async (q: any) => {
    if (!isMyTurn || usedQuestionIds.includes(q.id)) return;

    const newUsed = [...usedQuestionIds, q.id];
    const nowIso = new Date().toISOString();
    setCurrentQuestion(q);
    setUsedQuestionIds(newUsed);
    setQuestionStartedAt(nowIso);
    setTimeLeft(60);
    setIsSubmitted(false);
    setAnswer('');
    setIsRevealed(false);

    await supabase
      .from('rooms')
      .update({
        current_question_id: q.id,
        used_question_ids: newUsed,
        active_couple_id: selectedCoupleId,
        question_started_at: nowIso,
      })
      .eq('room_code', roomCodeUpper);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || !spouseType || !selectedCoupleId || timeLeft <= 0) return;

    const updateField = spouseType === 'wife' ? 'wife_answer' : 'husband_answer';

    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('room_code', roomCodeUpper)
      .eq('couple_id', selectedCoupleId)
      .eq('round_number', currentRound)
      .maybeSingle();

    if (existing) {
      await supabase.from('submissions').update({ [updateField]: answer }).eq('id', existing.id);
    } else {
      await supabase.from('submissions').insert({
        room_code: roomCodeUpper,
        couple_id: selectedCoupleId,
        round_number: currentRound,
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
              {couples.length > 0 ? (
                <select
                  value={tempCoupleId}
                  onChange={(e) => setTempCoupleId(e.target.value)}
                  className="w-full bg-[#0F0E0C] border border-[#26231E] text-xs text-[#F3EFE6] rounded-xl p-3 focus:outline-none"
                >
                  <option value="">-- Choose Couple --</option>
                  {couples.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.team_name} ({c.husband_name} & {c.wife_name})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="bg-[#0F0E0C] border border-[#26231E] p-3 rounded-xl text-center text-xs text-[#9E978E] animate-pulse">
                  Waiting for host to load teams...
                </div>
              )}
            </div>

            {tempCoupleId && (
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[#9E978E] mb-2">
                  2. Who is holding this device?
                </label>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setTempSpouseType('wife')}
                    className={`py-3 rounded-xl font-medium text-xs border transition-all ${
                      tempSpouseType === 'wife' ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]' : 'bg-[#1C1A17] text-[#F3EFE6] border-[#302B25]'
                    }`}
                  >
                    Wife
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempSpouseType('husband')}
                    className={`py-3 rounded-xl font-medium text-xs border transition-all ${
                      tempSpouseType === 'husband' ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]' : 'bg-[#1C1A17] text-[#F3EFE6] border-[#302B25]'
                    }`}
                  >
                    Husband
                  </button>
                </div>

                {tempSpouseType && (
                  <button
                    type="button"
                    onClick={() => handleSelectTeamAndRole(tempCoupleId, tempSpouseType)}
                    className="w-full bg-[#F3EFE6] text-[#0F0E0C] font-semibold py-3 rounded-xl text-xs transition-all"
                  >
                    Enter Game Room
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const renderLiveScoreboard = () => (
    <div className="bg-[#0F0E0C] border border-[#26231E] rounded-xl p-3.5 space-y-3 mt-4 text-left">
      <div className="flex items-center justify-between border-b border-[#26231E] pb-2">
        <span className="text-[10px] uppercase font-mono tracking-wider text-[#9E978E] flex items-center gap-1.5">
          <Trophy className="w-3 h-3 text-[#D4C3A3]" /> Live Standings
        </span>
        <span className="text-[10px] font-mono text-[#D4C3A3] flex items-center gap-1">
          <Layers className="w-3 h-3" /> Round {currentRound}
        </span>
      </div>
      <div className="space-y-1.5 max-h-[100px] overflow-y-auto pr-1">
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

      {teamSubmissionsHistory.length > 0 && (
        <div className="border-t border-[#26231E] pt-2 space-y-1">
          <span className="text-[9px] uppercase font-mono tracking-wider text-[#9E978E] block">
            Your Team's Answer History:
          </span>
          <div className="space-y-1 max-h-[80px] overflow-y-auto">
            {teamSubmissionsHistory.map((sub) => (
              <div key={sub.id} className="text-[11px] font-mono bg-[#161412] p-1.5 rounded border border-[#26231E] flex justify-between items-center">
                <span className="text-[#D4C3A3]">R{sub.round_number}</span>
                <span className="text-[#F3EFE6] truncate max-w-[180px]">
                  {spouseType === 'wife' ? sub.wife_answer || '(No answer)' : sub.husband_answer || '(No answer)'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
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
              In Sync - Round {currentRound}
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
          <span className="text-[11px] uppercase tracking-wider text-[#9E978E] flex items-center gap-1.5">
            Room <span className="font-mono text-[#F3EFE6]">{roomCodeUpper}</span>
            <span className="text-[9px] font-mono text-[#D4C3A3] bg-[#1C1A17] border border-[#26231E] px-2 py-0.5 rounded-full">
              Round {currentRound}
            </span>
          </span>
          <span className="text-[10px] uppercase font-mono px-3 py-0.5 rounded-full bg-[#1C1A17] text-[#D4C3A3] border border-[#26231E]">
            {spouseType}
          </span>
        </div>

        {currentQuestion ? (
          <>
            <div className="bg-[#0F0E0C] border border-[#26231E] p-4 rounded-xl space-y-1.5 text-center relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#D4C3A3] text-[#0F0E0C] font-bold">
                    Q{currentQuestionNumber || '?'}
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-[#D4C3A3]">
                    {currentQuestion.category}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs font-mono text-[#D4C3A3]">
                  <Clock className="w-3.5 h-3.5 animate-pulse" />
                  <span>{timeLeft}s</span>
                </div>
              </div>
              <p className="text-sm font-serif text-[#F3EFE6] leading-relaxed pt-2">
                "{currentQuestion.question_text}"
              </p>
            </div>

            {timeLeft === 0 && !isSubmitted ? (
              <div className="py-4 text-center space-y-2 bg-[#281A1A] border border-[#EF4444]/40 rounded-xl">
                <p className="text-xs font-mono text-[#EF4444] uppercase tracking-wider font-semibold">Time's Up!</p>
                <p className="text-xs text-[#9E978E]">The 60-second countdown has expired. Waiting for host grading.</p>
              </div>
            ) : !isSubmitted ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-[#9E978E]">Your Answer (Editable until timer ends):</label>
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
                  <Send className="w-3.5 h-3.5" /> Submit & Lock Answer ({timeLeft}s left)
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
                {timeLeft > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsSubmitted(false)}
                    className="text-xs text-[#D4C3A3] hover:underline flex items-center justify-center gap-1 mx-auto font-mono pt-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit Answer ({timeLeft}s remaining)
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-3 text-center">
            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase text-[#D4C3A3] tracking-widest block">
                Your Team's Turn - Round {currentRound}
              </span>
              <h3 className="text-base font-serif text-[#F3EFE6]">Pick Next Question Number</h3>
              <p className="text-xs text-[#9E978E]">
                Tap any available question number to start the 60-second timer for both partners
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