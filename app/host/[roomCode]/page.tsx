'use client';

import { useState, useEffect, use, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Check, X, Trophy, Grid, RotateCcw, Flag, UserCheck, SkipForward, Copy, QrCode, Layers, Clock, Play, Users, RefreshCw, Trash2, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

export default function HostDashboard({ params }: { params: Promise<{ roomCode: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const roomCodeUpper = resolvedParams?.roomCode ? resolvedParams.roomCode.toUpperCase() : '';

  // Force local state to start strictly on 'waiting'
  const [roomStatus, setRoomStatus] = useState<string>('waiting');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [couples, setCouples] = useState<any[]>([]);
  const [activeCouple, setActiveCouple] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>(FALLBACK_QUESTIONS);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  
  const [currentRound, setCurrentRound] = useState<number>(1);
  const currentRoundRef = useRef<number>(1);
  currentRoundRef.current = currentRound;

  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const [questionStartedAt, setQuestionStartedAt] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [usedQuestionIds, setUsedQuestionIds] = useState<number[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any>>({});
  
  // Host input form for adding couples
  const [inputTeamName, setInputTeamName] = useState('');
  const [inputHusbandName, setInputHusbandName] = useState('');
  const [inputWifeName, setInputWifeName] = useState('');

  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const fetchSubmissions = useCallback(async (roundNum: number) => {
    if (!roomCodeUpper) return;
    const { data: subData } = await supabase
      .from('submissions')
      .select('*')
      .ilike('room_code', roomCodeUpper)
      .eq('round_number', roundNum);

    if (subData) {
      const map: Record<string, any> = {};
      subData.forEach((sub) => {
        if (sub.couple_id) {
          map[sub.couple_id] = sub;
        }
      });
      setSubmissionsMap(map);
    } else {
      setSubmissionsMap({});
    }
  }, [roomCodeUpper]);

  useEffect(() => {
    if (!roomCodeUpper) return;

    let activeRoundNum = currentRoundRef.current;

    const fetchGameData = async () => {
      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .order('id', { ascending: true });

      const activeList = qData && qData.length > 0 ? qData : FALLBACK_QUESTIONS;
      setQuestions(activeList);

      // Find room by code
      let { data: room } = await supabase
        .from('rooms')
        .select('*')
        .ilike('room_code', roomCodeUpper)
        .maybeSingle();

      if (!room) {
        const { data: newRoom } = await supabase
          .from('rooms')
          .insert({ room_code: roomCodeUpper.toLowerCase(), status: 'waiting', current_round: 1, selected_category: 'All' })
          .select()
          .single();

        room = newRoom;
      }

      if (room) {
        setRoomId(room.id);
        
        // FOOLPROOF RESET: Force database status to 'waiting' using room.id
        await supabase
          .from('rooms')
          .update({ status: 'waiting' })
          .eq('id', room.id);

        setRoomStatus('waiting');
        activeRoundNum = room.current_round || 1;
        setCurrentRound(activeRoundNum);

        if (room.selected_category) {
          setSelectedCategories(room.selected_category.split(','));
        }
        if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);
        if (room.question_started_at) setQuestionStartedAt(room.question_started_at);

        if (room.current_question_id) {
          const foundQ = activeList.find((q: any) => Number(q.id) === Number(room.current_question_id));
          if (foundQ) setCurrentQuestion(foundQ);
        }

        let { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', room.id);

        if (couplesData && couplesData.length > 0) {
          setCouples(couplesData);
          const currentActive = couplesData.find((c) => c.id === room.active_couple_id) || couplesData[0];
          setActiveCouple(currentActive);
        }
      }

      await fetchSubmissions(activeRoundNum);
    };

    fetchGameData();

    // Polling interval (only syncs active status if host triggers it)
    const pollInterval = setInterval(async () => {
      if (!roomId) return;
      await fetchSubmissions(currentRoundRef.current);

      const { data: room } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();

      if (room) {
        if (room.current_round && room.current_round !== currentRoundRef.current) {
          setCurrentRound(room.current_round);
          setSubmissionsMap({});
        }

        if (room.question_started_at !== questionStartedAt) {
          setQuestionStartedAt(room.question_started_at);
        }

        if (room.current_question_id) {
          const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
          const foundQ = activePool.find((q) => Number(q.id) === Number(room.current_question_id));
          if (foundQ) setCurrentQuestion(foundQ);
        } else {
          setCurrentQuestion(null);
          setQuestionStartedAt(null);
        }

        if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);

        const { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', roomId);

        if (couplesData) {
          setCouples(couplesData);
          if (room.active_couple_id) {
            const foundCouple = couplesData.find((c) => c.id === room.active_couple_id);
            if (foundCouple) setActiveCouple(foundCouple);
          } else if (couplesData.length > 0 && !activeCouple) {
            setActiveCouple(couplesData[0]);
          }
        }
      }
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [roomCodeUpper, roomId, fetchSubmissions, questions, activeCouple, questionStartedAt]);

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

  const playerLink = typeof window !== 'undefined' ? `${window.location.origin}/play/${roomCodeUpper}` : '';

  const handleCopyPlayerLink = () => {
    navigator.clipboard.writeText(playerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAddCouple = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTeamName.trim() || !inputHusbandName.trim() || !inputWifeName.trim() || !roomId) return;

    const { data: newCouple, error } = await supabase
      .from('couples')
      .insert({
        room_id: roomId,
        team_name: inputTeamName.trim(),
        husband_name: inputHusbandName.trim(),
        wife_name: inputWifeName.trim(),
        total_score: 0,
      })
      .select()
      .single();

    if (!error && newCouple) {
      setCouples([...couples, newCouple]);
      setInputTeamName('');
      setInputHusbandName('');
      setInputWifeName('');
    } else if (error) {
      console.error('Error adding couple:', error.message);
    }
  };

  const handleDeleteCouple = async (coupleId: string) => {
    await supabase.from('couples').delete().eq('id', coupleId);
    setCouples(couples.filter(c => c.id !== coupleId));
  };

  const handleStartGame = async () => {
    if (couples.length === 0 || !roomId) return;
    const firstCouple = activeCouple || couples[0];
    setActiveCouple(firstCouple);
    
    // Explicitly update database and local state together
    const { error } = await supabase
      .from('rooms')
      .update({
        status: 'active',
        active_couple_id: firstCouple.id,
      })
      .eq('id', roomId);

    if (!error) {
      setRoomStatus('active');
    } else {
      console.error('Error starting game:', error.message);
    }
  };

  const handleResetToLobby = async () => {
    if (roomId) {
      await supabase
        .from('rooms')
        .update({
          status: 'waiting',
          current_question_id: null,
          question_started_at: null,
          current_round: 1,
        })
        .eq('id', roomId);
    }
    setRoomStatus('waiting');
    setCurrentQuestion(null);
    setQuestionStartedAt(null);
  };

  const handleSelectActiveCouple = async (couple: any) => {
    setActiveCouple(couple);
    if (roomId) {
      await supabase
        .from('rooms')
        .update({ active_couple_id: couple.id })
        .eq('id', roomId);
    }
  };

  const activeSubmission = activeCouple ? submissionsMap[activeCouple.id] : null;

  const handleNextTeam = async () => {
    if (couples.length === 0 || !roomId) return;
    const currentIndex = couples.findIndex((c) => c.id === activeCouple?.id);
    const nextIndex = (currentIndex + 1) % couples.length;
    const nextCouple = couples[nextIndex];

    setActiveCouple(nextCouple);
    setCurrentQuestion(null);
    setQuestionStartedAt(null);

    await supabase
      .from('rooms')
      .update({
        active_couple_id: nextCouple.id,
        current_question_id: null,
        question_started_at: null,
      })
      .eq('id', roomId);
  };

  const completedTeamsCount = useMemo(() => {
    return couples.filter((c) => {
      const sub = submissionsMap[c.id];
      return sub && (sub.wife_answer || sub.husband_answer);
    }).length;
  }, [couples, submissionsMap]);

  const isRoundComplete = couples.length > 0 && completedTeamsCount >= couples.length;

  const handleAdvanceRound = async () => {
    if (!roomId) return;
    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    setSubmissionsMap({});
    setCurrentQuestion(null);
    setQuestionStartedAt(null);

    await supabase
      .from('rooms')
      .update({
        current_round: nextRound,
        current_question_id: null,
        question_started_at: null,
      })
      .eq('id', roomId);
  };

  const handleEndGameAttempt = async () => {
    if (roomId) {
      await supabase.from('rooms').update({ status: 'GAME_OVER', selected_category: 'GAME_OVER' }).eq('id', roomId);
    }
    router.push(`/winner/${roomCodeUpper}`);
  };

  const filteredQuestions = useMemo(() => {
    const activePool = questions.length > 0 ? questions : FALLBACK_QUESTIONS;
    if (selectedCategories.includes('All') || selectedCategories.length === 0) {
      return getShuffledQuestions(activePool, roomCodeUpper);
    }
    const matched = activePool.filter((q) => 
      selectedCategories.some(cat => q.category?.trim().toLowerCase() === cat.trim().toLowerCase())
    );
    return getShuffledQuestions(matched.length > 0 ? matched : activePool, roomCodeUpper);
  }, [questions, selectedCategories, roomCodeUpper]);

  const currentQuestionNumber = useMemo(() => {
    if (!currentQuestion) return null;
    const idx = filteredQuestions.findIndex(q => Number(q.id) === Number(currentQuestion.id));
    return idx !== -1 ? idx + 1 : null;
  }, [currentQuestion, filteredQuestions]);

  const handlePickQuestion = async (q: any) => {
    if (usedQuestionIds.includes(q.id) || !roomId) return;
    const newUsed = [...usedQuestionIds, q.id];
    const nowIso = new Date().toISOString();
    setCurrentQuestion(q);
    setUsedQuestionIds(newUsed);
    setQuestionStartedAt(nowIso);
    setTimeLeft(60);

    await supabase
      .from('rooms')
      .update({
        current_question_id: q.id,
        used_question_ids: newUsed,
        question_started_at: nowIso,
      })
      .eq('id', roomId);
  };

  const handleClearQuestion = async () => {
    setCurrentQuestion(null);
    setQuestionStartedAt(null);
    if (roomId) {
      await supabase.from('rooms').update({ current_question_id: null, question_started_at: null }).eq('id', roomId);
    }
  };

  const toggleUnmask = async (spouse: 'wife' | 'husband') => {
    if (!activeCouple || !activeSubmission) return;
    const field = spouse === 'wife' ? 'wife_unmasked' : 'husband_unmasked';
    const currentVal = activeSubmission[field] || false;
    const updatedValue = !currentVal;

    const updatedSub = { ...activeSubmission, [field]: updatedValue };
    setSubmissionsMap((prev) => ({ ...prev, [activeCouple.id]: updatedSub }));
    await supabase.from('submissions').update({ [field]: updatedValue }).eq('id', activeSubmission.id);
  };

  const awardPoints = async (spouse: 'wife' | 'husband', points: number) => {
    if (!activeCouple || !activeSubmission) return;
    const scoreField = spouse === 'wife' ? 'wife_score' : 'husband_score';
    const currentSpouseScore = Number(activeSubmission[scoreField] || 0);
    const scoreDiff = points - currentSpouseScore;

    const updatedSub = { ...activeSubmission, [scoreField]: points };
    setSubmissionsMap((prev) => ({ ...prev, [activeCouple.id]: updatedSub }));

    const newTotal = Number(activeCouple.total_score || 0) + scoreDiff;
    setCouples((prev) => prev.map((c) => (c.id === activeCouple.id ? { ...c, total_score: newTotal } : c)));
    setActiveCouple((prev: any) => (prev ? { ...prev, total_score: newTotal } : prev));

    await supabase.from('submissions').update({ [scoreField]: points }).eq('id', activeSubmission.id);
    await supabase.from('couples').update({ total_score: newTotal }).eq('id', activeCouple.id);
  };

  // --- WAITING LOBBY VIEW ---
  if (roomStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] p-6 lg:p-12 font-sans flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full bg-[#161412] border border-[#26231E] rounded-3xl p-8 space-y-8 shadow-2xl text-center">
          <div className="space-y-2">
            <span className="text-xs font-mono uppercase tracking-widest text-[#D4C3A3] bg-[#26231E] px-3 py-1 rounded-full border border-[#302B25]">
              Pre-Game Setup & Waiting Lobby
            </span>
            <h1 className="text-3xl font-serif font-normal text-[#F3EFE6]">Room Code: {roomCodeUpper}</h1>
            <p className="text-xs text-[#9E978E]">
              Add participating teams below, then share the player link or QR code with your couples.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 bg-[#0F0E0C] border border-[#26231E] p-4 rounded-2xl">
            <button
              onClick={handleCopyPlayerLink}
              className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-[#86EFAC]" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link Copied!' : 'Copy Player Link'}
            </button>
            <button
              onClick={() => setShowQrModal(true)}
              className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] text-xs font-medium px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              <QrCode className="w-4 h-4" /> Show QR Code
            </button>
          </div>

          {/* Add Couple Form */}
          <form onSubmit={handleAddCouple} className="bg-[#0F0E0C] border border-[#26231E] p-5 rounded-2xl space-y-4 text-left">
            <h2 className="text-xs uppercase font-mono tracking-wider text-[#D4C3A3]">Add Participating Couple</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Team Name (e.g. The Smiths)"
                value={inputTeamName}
                onChange={(e) => setInputTeamName(e.target.value)}
                className="bg-[#161412] border border-[#26231E] rounded-xl px-3 py-2 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
              />
              <input
                type="text"
                required
                placeholder="Husband's Name"
                value={inputHusbandName}
                onChange={(e) => setInputHusbandName(e.target.value)}
                className="bg-[#161412] border border-[#26231E] rounded-xl px-3 py-2 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
              />
              <input
                type="text"
                required
                placeholder="Wife's Name"
                value={inputWifeName}
                onChange={(e) => setInputWifeName(e.target.value)}
                className="bg-[#161412] border border-[#26231E] rounded-xl px-3 py-2 text-xs text-[#F3EFE6] focus:outline-none focus:border-[#D4C3A3]"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] font-semibold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" /> Add Team to Room
            </button>
          </form>

          <div className="space-y-3 text-left">
            <div className="flex items-center justify-between border-b border-[#26231E] pb-2">
              <span className="text-xs font-mono uppercase tracking-wider text-[#9E978E] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#D4C3A3]" /> Registered Teams ({couples.length})
              </span>
            </div>
            {couples.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-1">
                {couples.map((c, i) => (
                  <div key={c.id} className="bg-[#0F0E0C] border border-[#26231E] p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-[#F3EFE6] block">
                        {i + 1}. {c.team_name}
                      </span>
                      <span className="text-[11px] text-[#9E978E] block mt-0.5">
                        Husband: {c.husband_name}
                      </span>
                      <span className="text-[11px] text-[#9E978E] block">
                        Wife: {c.wife_name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteCouple(c.id)}
                      className="text-[#6B645B] hover:text-red-400 p-1.5 transition-colors cursor-pointer"
                      title="Remove team"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-2xl text-center">
                <p className="text-xs text-[#9E978E]">No teams added yet. Add couples above before starting the game.</p>
              </div>
            )}
          </div>

          <button
            onClick={handleStartGame}
            disabled={couples.length === 0}
            className="w-full bg-[#D4C3A3] hover:bg-[#E2DDD0] disabled:opacity-40 text-[#0F0E0C] font-semibold py-4 rounded-2xl text-sm flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
          >
            <Play className="w-4 h-4 fill-current" /> Start Game & Begin Round 1
          </button>
        </div>

        {showQrModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#161412] border border-[#26231E] rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl relative">
              <button onClick={() => setShowQrModal(false)} className="absolute top-4 right-4 bg-[#1C1A17] text-[#9E978E] hover:text-[#F3EFE6] p-2 rounded-full cursor-pointer">
                <X className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-serif text-[#F3EFE6]">Scan to Join Lobby</h2>
              <div className="bg-white p-4 rounded-2xl inline-block shadow-lg">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playerLink)}`} alt="QR" className="w-48 h-48 mx-auto" />
              </div>
              <button onClick={handleCopyPlayerLink} className="w-full bg-[#F3EFE6] text-[#0F0E0C] font-semibold py-3 rounded-xl text-xs cursor-pointer">
                Copy Player Link
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- ACTIVE GAMEPLAY VIEW ---
  return (
    <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] p-6 lg:p-10 font-sans grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="flex flex-wrap justify-between items-center bg-[#161412] border border-[#26231E] p-5 gap-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-2.5 h-2.5 rounded-full bg-[#D4C3A3]" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-widest text-[#9E978E] font-medium block">Room Code & Sharing</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#26231E] text-[#D4C3A3] border border-[#302B25] flex items-center gap-1">
                  <Layers className="w-3 h-3" /> Round {currentRound}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2.5 mt-1">
                <h1 className="text-xl font-mono tracking-wider font-semibold text-[#F3EFE6]">{roomCodeUpper}</h1>
                <button onClick={handleCopyPlayerLink} className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 cursor-pointer">
                  {copied ? <Check className="w-3.5 h-3.5 text-[#86EFAC]" /> : <Copy className="w-3.5 h-3.5" />} {copied ? 'Link Copied!' : 'Copy Link'}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetToLobby}
              className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] font-semibold px-3 py-2 rounded-full text-xs flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
              title="Return to waiting lobby"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Back to Lobby
            </button>
            <button onClick={handleEndGameAttempt} className="bg-[#D4C3A3] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold px-4 py-2 rounded-full text-xs flex items-center gap-2 cursor-pointer">
              <Trophy className="w-3.5 h-3.5" /> End Match & Results
            </button>
          </div>
        </div>

        <div className="bg-[#161412] border border-[#26231E] p-8 rounded-2xl text-center space-y-3 min-h-[160px] flex flex-col justify-center items-center relative">
          {currentQuestion ? (
            <>
              <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-[#1C1A17] border border-[#302B25] px-3 py-1 rounded-full text-xs font-mono text-[#D4C3A3]">
                <Clock className="w-3.5 h-3.5 animate-pulse text-[#D4C3A3]" />
                <span>{timeLeft}s remaining</span>
              </div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-[#D4C3A3] text-[#0F0E0C] font-bold">Q{currentQuestionNumber || '?'}</span>
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#D4C3A3]">{currentQuestion.category} - Round {currentRound}</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-serif text-[#F3EFE6] leading-relaxed max-w-2xl font-normal">"{currentQuestion.question_text}"</h2>
              <button onClick={handleClearQuestion} className="mt-2 text-xs text-[#9E978E] hover:text-[#F3EFE6] flex items-center gap-1 font-mono cursor-pointer">
                <RotateCcw className="w-3 h-3" /> Clear & Select New Question
              </button>
            </>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase text-[#6B645B] tracking-widest">No Question Active</span>
              <p className="text-base font-serif text-[#9E978E]">Select a question number below (or let the active team pick on their phone)</p>
            </div>
          )}
        </div>

        <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26231E] pb-3">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#D4C3A3]" />
              <span className="text-xs uppercase tracking-wider font-semibold text-[#F3EFE6]">Select Question Number</span>
            </div>
            <span className="text-xs font-mono text-[#D4C3A3]">Categories: {selectedCategories.join(', ')} ({filteredQuestions.length} Total)</span>
          </div>
          <div className="grid grid-cols-6 sm:grid-cols-10 md:grid-cols-12 gap-2 max-h-[180px] overflow-y-auto pr-1">
            {filteredQuestions.map((q, idx) => {
              const isUsed = usedQuestionIds.includes(q.id);
              const isActive = currentQuestion?.id === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => handlePickQuestion(q)}
                  disabled={isUsed}
                  className={`py-2 rounded-xl text-xs font-mono font-semibold transition-all border cursor-pointer ${
                    isActive ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]' : isUsed ? 'bg-[#0F0E0C] text-[#38332C] border-[#1C1A17] cursor-not-allowed line-through' : 'bg-[#1C1A17] text-[#F3EFE6] border border-[#26231E] hover:border-[#D4C3A3]'
                  }`}
                >
                  Q{idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#1C1A17] border border-[#D4C3A3]/40 px-6 py-4 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-lg">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#D4C3A3]" />
            <div>
              <span className="text-[10px] text-[#9E978E] uppercase tracking-wider font-medium block">Round {currentRound} Status ({completedTeamsCount}/{couples.length} Teams Answered):</span>
              <span className="text-sm font-serif font-bold text-[#D4C3A3]">Active: {activeCouple?.team_name} ({activeCouple?.husband_name} & {activeCouple?.wife_name})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isRoundComplete ? (
              <button onClick={handleAdvanceRound} className="bg-[#D4C3A3] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md animate-pulse cursor-pointer">
                <Layers className="w-3.5 h-3.5" /> Start Round {currentRound + 1}
              </button>
            ) : (
              <button onClick={handleNextTeam} className="font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] cursor-pointer">
                Next Team <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Wife Card */}
          <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl flex flex-col justify-between space-y-6">
            <div className="flex justify-between items-center border-b border-[#26231E] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-[#D4C3A3] block">{activeCouple?.wife_name || 'Wife'}'s Guess</span>
                <span className="text-[10px] text-[#6B645B] font-mono">Team: {activeCouple?.team_name}</span>
              </div>
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full ${activeSubmission?.wife_answer ? 'bg-[#1C231B] text-[#86EFAC] border border-[#273B25]' : 'bg-[#1C1A17] text-[#6B645B]'}`}>
                {activeSubmission?.wife_answer ? 'Received' : 'Waiting'}
              </span>
            </div>
            <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-xl min-h-[100px] flex items-center justify-center text-center">
              {activeSubmission?.wife_unmasked ? <p className="text-xl font-serif text-[#F3EFE6]">{activeSubmission.wife_answer}</p> : <p className="text-[#6B645B] text-xs italic flex items-center gap-2"><EyeOff className="w-4 h-4" /> Hidden</p>}
            </div>
            <div className="space-y-2">
              <button onClick={() => toggleUnmask('wife')} disabled={!activeSubmission?.wife_answer} className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#26231E] disabled:opacity-40 text-[#F3EFE6] font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer">
                {activeSubmission?.wife_unmasked ? <><EyeOff className="w-3.5 h-3.5" /> Hide</> : <><Eye className="w-3.5 h-3.5" /> Reveal</>}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => awardPoints('wife', 5)} disabled={!activeSubmission?.wife_answer} className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer ${activeSubmission?.wife_score === 5 ? 'bg-[#D4C3A3] text-[#0F0E0C]' : 'bg-[#F3EFE6] text-[#0F0E0C] disabled:opacity-40'}`}>
                  <Check className="w-3.5 h-3.5" /> Match (+5)
                </button>
                <button onClick={() => awardPoints('wife', 0)} disabled={!activeSubmission?.wife_answer} className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 border cursor-pointer ${activeSubmission?.wife_score === 0 && activeSubmission?.wife_unmasked ? 'bg-[#281A1A] border-[#EF4444] text-[#EF4444]' : 'bg-[#1C1A17] text-[#9E978E] border-[#26231E] disabled:opacity-40'}`}>
                  <X className="w-3.5 h-3.5" /> Miss (0)
                </button>
              </div>
            </div>
          </div>

          {/* Husband Card */}
          <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl flex flex-col justify-between space-y-6">
            <div className="flex justify-between items-center border-b border-[#26231E] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-[#D4C3A3] block">{activeCouple?.husband_name || 'Husband'}'s Guess</span>
                <span className="text-[10px] text-[#6B645B] font-mono">Team: {activeCouple?.team_name}</span>
              </div>
              <span className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full ${activeSubmission?.husband_answer ? 'bg-[#1C231B] text-[#86EFAC] border border-[#273B25]' : 'bg-[#1C1A17] text-[#6B645B]'}`}>
                {activeSubmission?.husband_answer ? 'Received' : 'Waiting'}
              </span>
            </div>
            <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-xl min-h-[100px] flex items-center justify-center text-center">
              {activeSubmission?.husband_unmasked ? <p className="text-xl font-serif text-[#F3EFE6]">{activeSubmission.husband_answer}</p> : <p className="text-[#6B645B] text-xs italic flex items-center gap-2"><EyeOff className="w-4 h-4" /> Hidden</p>}
            </div>
            <div className="space-y-2">
              <button onClick={() => toggleUnmask('husband')} disabled={!activeSubmission?.husband_answer} className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#26231E] disabled:opacity-40 text-[#F3EFE6] font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer">
                {activeSubmission?.husband_unmasked ? <><EyeOff className="w-3.5 h-3.5" /> Hide</> : <><Eye className="w-3.5 h-3.5" /> Reveal</>}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => awardPoints('husband', 5)} disabled={!activeSubmission?.husband_answer} className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 cursor-pointer ${activeSubmission?.husband_score === 5 ? 'bg-[#D4C3A3] text-[#0F0E0C]' : 'bg-[#F3EFE6] text-[#0F0E0C] disabled:opacity-40'}`}>
                  <Check className="w-3.5 h-3.5" /> Match (+5)
                </button>
                <button onClick={() => awardPoints('husband', 0)} disabled={!activeSubmission?.husband_answer} className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 border cursor-pointer ${activeSubmission?.husband_score === 0 && activeSubmission?.husband_unmasked ? 'bg-[#281A1A] border-[#EF4444] text-[#EF4444]' : 'bg-[#1C1A17] text-[#9E978E] border-[#26231E] disabled:opacity-40'}`}>
                  <X className="w-3.5 h-3.5" /> Miss (0)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#161412] border border-[#26231E] rounded-2xl p-6 flex flex-col justify-between space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[#26231E] pb-3">
            <span className="text-xs uppercase tracking-wider font-semibold text-[#9E978E]">Standings & Selection</span>
            <Trophy className="w-4 h-4 text-[#D4C3A3]" />
          </div>
          <div className="space-y-2.5">
            {couples.map((couple, index) => {
              const isSelected = activeCouple?.id === couple.id;
              const sub = submissionsMap[couple.id];
              const hasAnsweredThisRound = sub && (sub.wife_answer || sub.husband_answer);
              return (
                <div
                  key={couple.id}
                  onClick={() => handleSelectActiveCouple(couple)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${isSelected ? 'bg-[#26231E] border-[#D4C3A3] ring-1 ring-[#D4C3A3]/40' : 'bg-[#0F0E0C] border-[#26231E] hover:border-[#302B25]'}`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-[#F3EFE6]">{index + 1}. {couple.team_name}</span>
                      {hasAnsweredThisRound && <span className="text-[9px] font-mono text-[#86EFAC] bg-[#1C231B] border border-[#273B25] px-1.5 py-0.2 rounded">R{currentRound} Done</span>}
                    </div>
                    <span className="text-sm font-mono font-semibold text-[#D4C3A3]">{couple.total_score} pts</span>
                  </div>
                  <p className="text-[11px] text-[#6B645B]">{couple.husband_name} & {couple.wife_name}</p>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={handleEndGameAttempt} className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 cursor-pointer">
          <Flag className="w-3.5 h-3.5" /> Finish Game & Declare Winner
        </button>
      </div>
    </div>
  );
}