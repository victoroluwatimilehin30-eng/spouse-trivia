'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Lock, Send, Check, AlertCircle, Clock, Trophy, Eye, Layers, Edit3, Heart, Users } from 'lucide-react';

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

export default function PlayerPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const roomCodeUpper = resolvedParams?.roomCode ? resolvedParams.roomCode.toUpperCase() : '';

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [roomError, setRoomError] = useState(false);
  const [couples, setCouples] = useState<any[]>([]);

  // Registration states
  const [teamName, setTeamName] = useState('');
  const [role, setRole] = useState<'husband' | 'wife'>('husband');
  const [myName, setMyName] = useState('');
  
  const [myCouple, setMyCouple] = useState<any>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`player_couple_obj_${roomCodeUpper}`);
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const [registered, setRegistered] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return !!localStorage.getItem(`player_couple_obj_${roomCodeUpper}`);
    }
    return false;
  });

  // Gameplay states
  const [questions, setQuestions] = useState<any[]>(FALLBACK_QUESTIONS);
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
  const [teamSubmissionsHistory, setTeamSubmissionsHistory] = useState<any[]>([]);

  // Initialize room and user session
  useEffect(() => {
    if (!roomCodeUpper) return;

    let pollInterval: any;
    const safetyTimer = setTimeout(() => setLoading(false), 3000);

    const initRoom = async () => {
      try {
        const { data: qData } = await supabase
          .from('questions')
          .select('*')
          .order('id', { ascending: true });

        const activeList = qData && qData.length > 0 ? qData : FALLBACK_QUESTIONS;
        setQuestions(activeList);

        let { data: roomData, error: roomErr } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', roomCodeUpper)
          .maybeSingle();

        if (roomErr || !roomData) {
          // Auto-create room if it doesn't exist yet
          const { data: newRoom } = await supabase
            .from('rooms')
            .insert({ room_code: roomCodeUpper, status: 'waiting', current_round: 1, selected_category: 'All' })
            .select()
            .single();
          roomData = newRoom;
        }

        if (!roomData) {
          setRoomError(true);
          setLoading(false);
          clearTimeout(safetyTimer);
          return;
        }

        setRoom(roomData);
        if (roomData.selected_category === 'GAME_OVER') {
          router.push(`/winner/${roomCodeUpper}`);
          return;
        }

        const roundNum = roomData.current_round || 1;
        setCurrentRound(roundNum);
        if (roomData.selected_category) setSelectedCategories(roomData.selected_category.split(','));
        if (roomData.used_question_ids) setUsedQuestionIds(roomData.used_question_ids);
        if (roomData.active_couple_id) setActiveCoupleId(roomData.active_couple_id);
        if (roomData.question_started_at) setQuestionStartedAt(roomData.question_started_at);

        if (roomData.current_question_id) {
          const found = activeList.find((q: any) => Number(q.id) === Number(roomData.current_question_id));
          if (found) setCurrentQuestion(found);
        }

        const { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', roomData.id)
          .order('total_score', { ascending: false });

        if (couplesData) {
          setCouples(couplesData);
          // If we have saved couple id, refresh our couple object
          const savedCouple = localStorage.getItem(`player_couple_obj_${roomCodeUpper}`);
          if (savedCouple) {
            const parsed = JSON.parse(savedCouple);
            const fresh = couplesData.find(c => c.id === parsed.id);
            if (fresh) {
              setMyCouple(fresh);
              localStorage.setItem(`player_couple_obj_${roomCodeUpper}`, JSON.stringify(fresh));
            }
          }
        }
      } catch (err) {
        console.error('Init error:', err);
      } finally {
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    };

    initRoom();

    // Polling loop for real-time updates
    pollInterval = setInterval(async () => {
      try {
        const { data: roomData } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', roomCodeUpper)
          .maybeSingle();

        if (roomData) {
          setRoom(roomData);
          if (roomData.selected_category === 'GAME_OVER') {
            router.push(`/winner/${roomCodeUpper}`);
            return;
          }

          if (roomData.current_round && roomData.current_round !== currentRound) {
            setCurrentRound(roomData.current_round);
            setIsSubmitted(false);
            setAnswer('');
            setIsRevealed(false);
          }

          if (roomData.selected_category) setSelectedCategories(roomData.selected_category.split(','));
          if (roomData.used_question_ids) setUsedQuestionIds(roomData.used_question_ids);
          if (roomData.active_couple_id) setActiveCoupleId(roomData.active_couple_id);
          if (roomData.question_started_at !== questionStartedAt) {
            setQuestionStartedAt(roomData.question_started_at);
          }

          if (roomData.current_question_id) {
            const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
            const q = activePool.find((item: any) => Number(item.id) === Number(roomData.current_question_id));
            if (q) setCurrentQuestion(q);
          } else {
            setCurrentQuestion(null);
            setQuestionStartedAt(null);
          }

          const { data: couplesData } = await supabase
            .from('couples')
            .select('*')
            .eq('room_id', roomData.id)
            .order('total_score', { ascending: false });

          if (couplesData) {
            setCouples(couplesData);
            const savedCouple = localStorage.getItem(`player_couple_obj_${roomCodeUpper}`);
            if (savedCouple) {
              const parsed = JSON.parse(savedCouple);
              const fresh = couplesData.find(c => c.id === parsed.id);
              if (fresh) {
                setMyCouple(fresh);
                localStorage.setItem(`player_couple_obj_${roomCodeUpper}`, JSON.stringify(fresh));
              }
            }
          }
        }

        const savedCouple = localStorage.getItem(`player_couple_obj_${roomCodeUpper}`);
        if (savedCouple) {
          const parsed = JSON.parse(savedCouple);
          const currentSpouse = localStorage.getItem(`player_spouse_${roomCodeUpper}`);

          const { data: allSubs } = await supabase
            .from('submissions')
            .select('*')
            .eq('room_code', roomCodeUpper)
            .eq('couple_id', parsed.id);

          if (allSubs) {
            setTeamSubmissionsHistory(allSubs);
            const currentSub = allSubs.find(s => Number(s.round_number) === Number(currentRound));
            if (currentSub && currentSpouse) {
              const myField = currentSpouse === 'wife' ? 'wife_answer' : 'husband_answer';
              if (currentSub[myField] && !answer && !isSubmitted) {
                setAnswer(currentSub[myField]);
                setIsSubmitted(true);
              }
              const maskField = currentSpouse === 'wife' ? 'wife_unmasked' : 'husband_unmasked';
              if (currentSub[maskField] !== undefined) {
                setIsRevealed(currentSub[maskField]);
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
  }, [roomCodeUpper, router, currentRound, questions, questionStartedAt, answer, isSubmitted]);

  // Timer countdown
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

  // Registration handler (supports matching existing team name if partner already started it)
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim() || !myName.trim() || !room) return;

    const { data: existingTeam } = await supabase
      .from('couples')
      .select('*')
      .eq('room_id', room.id)
      .ilike('team_name', teamName.trim())
      .maybeSingle();

    if (existingTeam) {
      const updatePayload: any = {};
      if (role === 'husband') {
        updatePayload.husband_name = myName.trim();
      } else {
        updatePayload.wife_name = myName.trim();
      }

      const { data: updated, error } = await supabase
        .from('couples')
        .update(updatePayload)
        .eq('id', existingTeam.id)
        .select()
        .single();

      if (!error && updated) {
        setMyCouple(updated);
        setRegistered(true);
        localStorage.setItem(`player_couple_obj_${roomCodeUpper}`, JSON.stringify(updated));
        localStorage.setItem(`player_spouse_${roomCodeUpper}`, role);
      }
    } else {
      const newTeamPayload: any = {
        room_id: room.id,
        team_name: teamName.trim(),
        total_score: 0,
        husband_name: role === 'husband' ? myName.trim() : null,
        wife_name: role === 'wife' ? myName.trim() : null,
      };

      const { data: created, error } = await supabase
        .from('couples')
        .insert(newTeamPayload)
        .select()
        .single();

      if (!error && created) {
        setMyCouple(created);
        setRegistered(true);
        localStorage.setItem(`player_couple_obj_${roomCodeUpper}`, JSON.stringify(created));
        localStorage.setItem(`player_spouse_${roomCodeUpper}`, role);
      }
    }
  };

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    const currentSpouse = localStorage.getItem(`player_spouse_${roomCodeUpper}`);
    if (!answer.trim() || !currentSpouse || !myCouple || timeLeft <= 0) return;

    const updateField = currentSpouse === 'wife' ? 'wife_answer' : 'husband_answer';

    const { data: existing } = await supabase
      .from('submissions')
      .select('id')
      .eq('room_code', roomCodeUpper)
      .eq('couple_id', myCouple.id)
      .eq('round_number', currentRound)
      .maybeSingle();

    if (existing) {
      await supabase.from('submissions').update({ [updateField]: answer }).eq('id', existing.id);
    } else {
      await supabase.from('submissions').insert({
        room_code: roomCodeUpper,
        couple_id: myCouple.id,
        round_number: currentRound,
        [updateField]: answer,
      });
    }

    setIsSubmitted(true);
  };

  const filteredQuestions = useMemo(() => {
    const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
    if (selectedCategories.includes('All') || selectedCategories.length === 0) {
      return getShuffledQuestions(activePool, roomCodeUpper);
    }
    const matched = activePool.filter((q: any) => 
      selectedCategories.some((cat: string) => q.category?.trim().toLowerCase() === cat.trim().toLowerCase())
    );
    return getShuffledQuestions(matched.length > 0 ? matched : activePool, roomCodeUpper);
  }, [questions, selectedCategories, roomCodeUpper]);

  const currentQuestionNumber = useMemo(() => {
    if (!currentQuestion) return null;
    const idx = filteredQuestions.findIndex((q: any) => Number(q.id) === Number(currentQuestion.id));
    return idx !== -1 ? idx + 1 : null;
  }, [currentQuestion, filteredQuestions]);

  const currentSpouse = typeof window !== 'undefined' ? localStorage.getItem(`player_spouse_${roomCodeUpper}`) : null;
  const isMyTurn = myCouple && activeCoupleId ? myCouple.id === activeCoupleId : true;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center font-sans">
        <p className="text-xs font-mono uppercase tracking-widest animate-pulse text-[#D4C3A3]">Loading room...</p>
      </div>
    );
  }

  if (roomError) {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] flex items-center justify-center p-6 font-sans">
        <div className="bg-[#161412] border border-[#26231E] p-8 rounded-2xl max-w-sm w-full text-center space-y-4 shadow-2xl">
          <AlertCircle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <h1 className="text-lg font-serif text-[#F3EFE6]">Room Not Found</h1>
          <a href="/" className="inline-block bg-[#1C1A17] border border-[#302B25] text-[#F3EFE6] px-6 py-2 rounded-full text-xs">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  // ==========================================
  // STATE 1: PRE-GAME LOBBY (Room is waiting)
  // ==========================================
  if (room?.status === 'waiting') {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] p-6 flex flex-col items-center justify-center font-sans">
        <div className="max-w-md w-full bg-[#161412] border border-[#26231E] rounded-3xl p-8 space-y-6 shadow-2xl text-center">
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4C3A3] bg-[#26231E] px-3 py-1 rounded-full border border-[#302B25]">
              Room: {roomCodeUpper}
            </span>
            <h1 className="text-2xl font-serif font-normal text-[#F3EFE6] mt-2">Couple Trivia Lobby</h1>
          </div>

          {!registered ? (
            <form onSubmit={handleRegister} className="space-y-4 text-left">
              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-[#9E978E] font-medium block">Team Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. The Smiths"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl px-4 py-3 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-[#9E978E] font-medium block">I am joining as:</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('husband')}
                    className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${role === 'husband' ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]' : 'bg-[#0F0E0C] text-[#9E978E] border-[#26231E]'}`}
                  >
                    Husband
                  </button>
                  <button
                    type="button"
                    onClick={() => setRole('wife')}
                    className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${role === 'wife' ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]' : 'bg-[#0F0E0C] text-[#9E978E] border-[#26231E]'}`}
                  >
                    Wife
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] uppercase tracking-wider text-[#9E978E] font-medium block">Your Name</label>
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={myName}
                  onChange={(e) => setMyName(e.target.value)}
                  className="w-full bg-[#0F0E0C] border border-[#26231E] rounded-xl px-4 py-3 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
                />
              </div>

              <button
                type="submit"
                className="w-full bg-[#D4C3A3] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer mt-2"
              >
                Join Room Lobby
              </button>
            </form>
          ) : (
            <div className="space-y-6 py-4">
              <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-2xl space-y-4 text-center">
                <div className="flex items-center justify-center gap-1.5 text-[#D4C3A3]">
                  <Heart className="w-4 h-4 fill-current" />
                  <span className="text-xs font-semibold uppercase tracking-wider">Team: {myCouple?.team_name}</span>
                </div>

                <div className="space-y-2 text-xs border-t border-b border-[#26231E] py-3 text-left">
                  <div className="flex justify-between items-center">
                    <span className="text-[#9E978E]">Husband:</span>
                    <span className="font-semibold text-[#F3EFE6]">{myCouple?.husband_name || <span className="text-amber-400 italic font-normal">Waiting to join...</span>}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#9E978E]">Wife:</span>
                    <span className="font-semibold text-[#F3EFE6]">{myCouple?.wife_name || <span className="text-amber-400 italic font-normal">Waiting to join...</span>}</span>
                  </div>
                </div>

                {(!myCouple?.husband_name || !myCouple?.wife_name) ? (
                  <div className="space-y-2 animate-pulse pt-2">
                    <p className="text-xs text-amber-400 font-mono">Waiting for your partner to join this team...</p>
                    <p className="text-[10px] text-[#9E978E]">Share this link with your partner so they can enter the exact same team name.</p>
                  </div>
                ) : (
                  <div className="space-y-2 animate-pulse pt-2">
                    <p className="text-xs text-[#86EFAC] font-mono">Team is complete! Waiting for host to start the game...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================
  // STATE 2: ACTIVE GAMEPLAY VIEW
  // ==========================================
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
              c.id === myCouple?.id ? 'bg-[#26231E] border border-[#D4C3A3]/30' : 'bg-[#161412]'
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
            {currentSpouse || 'Player'}
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
              <form onSubmit={handleSubmitAnswer} className="space-y-4">
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
              <h3 className="text-base font-serif text-[#F3EFE6]">Waiting for Question</h3>
              <p className="text-xs text-[#9E978E]">
                The host or team is selecting a question prompt. Stand by...
              </p>
            </div>
          </div>
        )}

        {renderLiveScoreboard()}
      </div>
    </div>
  );
}