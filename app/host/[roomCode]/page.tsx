'use client';

import { useState, useEffect, use, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Eye, EyeOff, Check, X, Trophy, Grid, RotateCcw, Flag, UserCheck, SkipForward, Copy, QrCode } from 'lucide-react';
import { useRouter } from 'next/navigation';

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

  const [couples, setCouples] = useState<any[]>([]);
  const [activeCouple, setActiveCouple] = useState<any | null>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  
  const [currentQuestion, setCurrentQuestion] = useState<any | null>(null);
  const [usedQuestionIds, setUsedQuestionIds] = useState<number[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, any>>({});
  const [teamsPlayed, setTeamsPlayed] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const fetchSubmissions = useCallback(async () => {
    if (!roomCodeUpper) return;
    const { data: subData } = await supabase
      .from('submissions')
      .select('*')
      .eq('room_code', roomCodeUpper);

    if (subData) {
      const map: Record<string, any> = {};
      subData.forEach((sub) => {
        if (sub.couple_id) map[sub.couple_id] = sub;
      });
      setSubmissionsMap(map);
    } else {
      setSubmissionsMap({});
    }
  }, [roomCodeUpper]);

  useEffect(() => {
    if (!roomCodeUpper) return;

    const fetchGameData = async () => {
      const { data: room } = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomCodeUpper)
        .maybeSingle();

      if (room) {
        if (room.selected_category) {
          setSelectedCategories(room.selected_category.split(','));
        }
        if (room.used_question_ids) setUsedQuestionIds(room.used_question_ids);

        const { data: couplesData } = await supabase
          .from('couples')
          .select('*')
          .eq('room_id', room.id);

        if (couplesData && couplesData.length > 0) {
          setCouples(couplesData);

          const currentActive = couplesData.find((c) => c.id === room.active_couple_id) || couplesData[0];
          setActiveCouple(currentActive);
          setTeamsPlayed([currentActive.id]);

          if (!room.active_couple_id) {
            await supabase
              .from('rooms')
              .update({ active_couple_id: currentActive.id })
              .eq('room_code', roomCodeUpper);
          }
        }
      }

      const { data: qData } = await supabase
        .from('questions')
        .select('*')
        .order('id', { ascending: true });

      if (qData) {
        setQuestions(qData);
        if (room?.current_question_id) {
          const activeQ = qData.find((q) => Number(q.id) === Number(room.current_question_id));
          if (activeQ) setCurrentQuestion(activeQ);
        }
      }

      await fetchSubmissions();
    };

    fetchGameData();

    const channel = supabase
      .channel(`host_room_${roomCodeUpper}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `room_code=eq.${roomCodeUpper}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setSubmissionsMap({});
          } else {
            const sub = payload.new as any;
            if (sub && sub.couple_id) {
              setSubmissionsMap((prev) => {
                const existing = prev[sub.couple_id] || {};
                return { ...prev, [sub.couple_id]: { ...existing, ...sub } };
              });
            }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `room_code=eq.${roomCodeUpper}` },
        async (payload) => {
          const qId = payload.new.current_question_id;
          if (qId) {
            const { data: newQ } = await supabase
              .from('questions')
              .select('*')
              .eq('id', qId)
              .maybeSingle();

            if (newQ) setCurrentQuestion(newQ);
          } else {
            setCurrentQuestion(null);
          }

          if (payload.new.used_question_ids) {
            setUsedQuestionIds(payload.new.used_question_ids);
          }

          if (payload.new.active_couple_id && couples.length > 0) {
            const foundCouple = couples.find((c) => c.id === payload.new.active_couple_id);
            if (foundCouple) {
              setActiveCouple(foundCouple);
              setTeamsPlayed((prev) => (prev.includes(foundCouple.id) ? prev : [...prev, foundCouple.id]));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCodeUpper, fetchSubmissions, couples.length]);

  const playerLink = typeof window !== 'undefined' ? `${window.location.origin}/play/${roomCodeUpper}` : '';

  const handleCopyPlayerLink = () => {
    navigator.clipboard.writeText(playerLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectActiveCouple = async (couple: any) => {
    setActiveCouple(couple);
    setTeamsPlayed((prev) => (prev.includes(couple.id) ? prev : [...prev, couple.id]));
    await supabase
      .from('rooms')
      .update({ active_couple_id: couple.id })
      .eq('room_code', roomCodeUpper);
  };

  const activeSubmission = activeCouple ? submissionsMap[activeCouple.id] : null;

  const canProceedToNextTeam = useMemo(() => {
    if (!activeSubmission) return true;
    const hasAnswers = activeSubmission.wife_answer || activeSubmission.husband_answer;
    if (!hasAnswers) return true;

    const wifeMarked = activeSubmission.wife_score !== null && activeSubmission.wife_score !== undefined;
    const husbandMarked = activeSubmission.husband_score !== null && activeSubmission.husband_score !== undefined;
    return wifeMarked && husbandMarked;
  }, [activeSubmission]);

  const handleNextTeam = async () => {
    if (!canProceedToNextTeam || couples.length === 0) return;
    const currentIndex = couples.findIndex((c) => c.id === activeCouple?.id);
    const nextIndex = (currentIndex + 1) % couples.length;
    const nextCouple = couples[nextIndex];

    setActiveCouple(nextCouple);
    setCurrentQuestion(null);
    setSubmissionsMap({});
    setTeamsPlayed((prev) => (prev.includes(nextCouple.id) ? prev : [...prev, nextCouple.id]));

    await supabase.from('submissions').delete().eq('room_code', roomCodeUpper);
    await supabase
      .from('rooms')
      .update({
        active_couple_id: nextCouple.id,
        current_question_id: null,
      })
      .eq('room_code', roomCodeUpper);
  };

  const handleEndGameAttempt = async () => {
    if (teamsPlayed.length < couples.length) {
      alert(`Cannot end match yet! Only ${teamsPlayed.length} out of ${couples.length} teams have played this round. Every team must take a turn before declaring a winner.`);
      return;
    }

    await supabase
      .from('rooms')
      .update({ selected_category: 'GAME_OVER' })
      .eq('room_code', roomCodeUpper);

    router.push(`/winner/${roomCodeUpper}`);
  };

  const filteredQuestions = useMemo(() => {
    let base = selectedCategories.includes('All') 
      ? questions 
      : questions.filter((q) => selectedCategories.includes(q.category));
    
    return getShuffledQuestions(base, roomCodeUpper);
  }, [questions, selectedCategories, roomCodeUpper]);

  const handlePickQuestion = async (q: any) => {
    if (usedQuestionIds.includes(q.id)) return;

    const newUsed = [...usedQuestionIds, q.id];
    setCurrentQuestion(q);
    setUsedQuestionIds(newUsed);
    setSubmissionsMap({});

    await supabase.from('submissions').delete().eq('room_code', roomCodeUpper);
    await supabase
      .from('rooms')
      .update({
        current_question_id: q.id,
        used_question_ids: newUsed,
      })
      .eq('room_code', roomCodeUpper);
  };

  const handleClearQuestion = async () => {
    setCurrentQuestion(null);
    setSubmissionsMap({});
    await supabase.from('submissions').delete().eq('room_code', roomCodeUpper);
    await supabase
      .from('rooms')
      .update({ current_question_id: null })
      .eq('room_code', roomCodeUpper);
  };

  const toggleUnmask = async (spouse: 'wife' | 'husband') => {
    if (!activeCouple) return;

    const field = spouse === 'wife' ? 'wife_unmasked' : 'husband_unmasked';
    const currentVal = activeSubmission ? activeSubmission[field] : false;
    const updatedValue = !currentVal;

    if (activeSubmission) {
      const updatedSub = { ...activeSubmission, [field]: updatedValue };
      setSubmissionsMap((prev) => ({ ...prev, [activeCouple.id]: updatedSub }));
      await supabase.from('submissions').update({ [field]: updatedValue }).eq('id', activeSubmission.id);
    }
  };

  const awardPoints = async (spouse: 'wife' | 'husband', points: number) => {
    if (!activeCouple || !activeSubmission) return;

    const scoreField = spouse === 'wife' ? 'wife_score' : 'husband_score';
    const currentSpouseScore = Number(activeSubmission[scoreField] || 0);
    const scoreDiff = points - currentSpouseScore;

    const updatedSub = { ...activeSubmission, [scoreField]: points };
    setSubmissionsMap((prev) => ({ ...prev, [activeCouple.id]: updatedSub }));

    await supabase.from('submissions').update({ [scoreField]: points }).eq('id', activeSubmission.id);

    const newTotal = Number(activeCouple.total_score || 0) + scoreDiff;
    await supabase.from('couples').update({ total_score: newTotal }).eq('id', activeCouple.id);

    setCouples((prev) =>
      prev.map((c) => (c.id === activeCouple.id ? { ...c, total_score: newTotal } : c))
    );
    setActiveCouple((prev: any) => (prev ? { ...prev, total_score: newTotal } : prev));
  };

  return (
    <div className="min-h-screen bg-[#0F0E0C] text-[#F3EFE6] p-6 lg:p-10 font-sans grid grid-cols-1 lg:grid-cols-4 gap-6 relative">
      <div className="lg:col-span-3 flex flex-col gap-6">
        <div className="flex flex-wrap justify-between items-center bg-[#161412] border border-[#26231E] p-5 gap-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="w-2.5 h-2.5 rounded-full bg-[#D4C3A3]" />
            <div>
              <span className="text-[11px] uppercase tracking-widest text-[#9E978E] font-medium block">
                Room Code & Sharing
              </span>
              <div className="flex flex-wrap items-center gap-2.5 mt-0.5">
                <h1 className="text-xl font-mono tracking-wider font-semibold text-[#F3EFE6]">
                  {roomCodeUpper}
                </h1>
                <button
                  onClick={handleCopyPlayerLink}
                  className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#86EFAC]" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Link Copied!' : 'Copy Link'}
                </button>
                <button
                  onClick={() => setShowQrModal(true)}
                  className="bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] text-xs font-medium px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <QrCode className="w-3.5 h-3.5" /> Show QR Code
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={handleEndGameAttempt}
            className="bg-[#D4C3A3] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold px-4 py-2 rounded-full text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <Trophy className="w-3.5 h-3.5" /> End Match & Results
          </button>
        </div>

        <div className="bg-[#161412] border border-[#26231E] p-8 rounded-2xl text-center space-y-3 min-h-[160px] flex flex-col justify-center items-center">
          {currentQuestion ? (
            <>
              <span className="text-[11px] font-mono uppercase tracking-widest text-[#D4C3A3]">
                Current Question ({currentQuestion.category})
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-[#F3EFE6] leading-relaxed max-w-2xl font-normal">
                "{currentQuestion.question_text}"
              </h2>
              <button
                onClick={handleClearQuestion}
                className="mt-2 text-xs text-[#9E978E] hover:text-[#F3EFE6] flex items-center gap-1 font-mono"
              >
                <RotateCcw className="w-3 h-3" /> Clear & Select New Question
              </button>
            </>
          ) : (
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase text-[#6B645B] tracking-widest">
                No Question Active
              </span>
              <p className="text-base font-serif text-[#9E978E]">
                Select a question number below (or let the active team pick on their phone)
              </p>
            </div>
          )}
        </div>

        <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#26231E] pb-3">
            <div className="flex items-center gap-2">
              <Grid className="w-4 h-4 text-[#D4C3A3]" />
              <span className="text-xs uppercase tracking-wider font-semibold text-[#F3EFE6]">
                Select Question Number
              </span>
            </div>
            <span className="text-xs font-mono text-[#D4C3A3]">
              Categories: {selectedCategories.join(', ')} ({filteredQuestions.length} Total)
            </span>
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
                  className={`py-2 rounded-xl text-xs font-mono font-semibold transition-all border ${
                    isActive
                      ? 'bg-[#D4C3A3] text-[#0F0E0C] border-[#D4C3A3]'
                      : isUsed
                      ? 'bg-[#0F0E0C] text-[#38332C] border-[#1C1A17] cursor-not-allowed line-through'
                      : 'bg-[#1C1A17] text-[#F3EFE6] border border-[#26231E] hover:border-[#D4C3A3]'
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
              <span className="text-[10px] text-[#9E978E] uppercase tracking-wider font-medium block">
                Currently Viewing Answers For ({teamsPlayed.length}/{couples.length} Teams Played):
              </span>
              <span className="text-sm font-serif font-bold text-[#D4C3A3]">
                {activeCouple?.team_name} ({activeCouple?.husband_name} & {activeCouple?.wife_name})
              </span>
            </div>
          </div>

          <button
            onClick={handleNextTeam}
            disabled={!canProceedToNextTeam}
            className={`font-semibold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm ${
              canProceedToNextTeam
                ? 'bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C]'
                : 'bg-[#1C1A17] text-[#6B645B] border border-[#26231E] cursor-not-allowed opacity-50'
            }`}
            title={!canProceedToNextTeam ? 'Mark both answers (Match/Miss) before moving to the next team.' : ''}
          >
            Next Team <SkipForward className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Wife Card */}
          <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl flex flex-col justify-between space-y-6">
            <div className="flex justify-between items-center border-b border-[#26231E] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-[#D4C3A3] block">
                  {activeCouple?.wife_name || 'Wife'}'s Guess
                </span>
                <span className="text-[10px] text-[#6B645B] font-mono">
                  Team: {activeCouple?.team_name}
                </span>
              </div>
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full ${
                  activeSubmission?.wife_answer
                    ? 'bg-[#1C231B] text-[#86EFAC] border border-[#273B25]'
                    : 'bg-[#1C1A17] text-[#6B645B]'
                }`}
              >
                {activeSubmission?.wife_answer ? 'Received' : 'Waiting'}
              </span>
            </div>

            <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-xl min-h-[100px] flex items-center justify-center text-center">
              {activeSubmission?.wife_unmasked ? (
                <p className="text-xl font-serif text-[#F3EFE6]">{activeSubmission.wife_answer}</p>
              ) : (
                <p className="text-[#6B645B] text-xs italic flex items-center gap-2">
                  <EyeOff className="w-4 h-4" /> Hidden
                </p>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => toggleUnmask('wife')}
                disabled={!activeSubmission?.wife_answer}
                className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#26231E] disabled:opacity-40 text-[#F3EFE6] font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
              >
                {activeSubmission?.wife_unmasked ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Reveal
                  </>
                )}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => awardPoints('wife', 5)}
                  disabled={!activeSubmission?.wife_answer}
                  className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                    activeSubmission?.wife_score === 5
                      ? 'bg-[#D4C3A3] text-[#0F0E0C]'
                      : 'bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] disabled:opacity-40'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" /> Match (+5)
                </button>
                <button
                  onClick={() => awardPoints('wife', 0)}
                  disabled={!activeSubmission?.wife_answer}
                  className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 border transition-all ${
                    activeSubmission?.wife_score === 0 && activeSubmission?.wife_unmasked
                      ? 'bg-[#281A1A] border-[#EF4444] text-[#EF4444]'
                      : 'bg-[#1C1A17] hover:bg-[#282420] text-[#9E978E] border-[#26231E] disabled:opacity-40'
                  }`}
                >
                  <X className="w-3.5 h-3.5" /> Miss (0)
                </button>
              </div>
            </div>
          </div>

          {/* Husband Card */}
          <div className="bg-[#161412] border border-[#26231E] p-6 rounded-2xl flex flex-col justify-between space-y-6">
            <div className="flex justify-between items-center border-b border-[#26231E] pb-3">
              <div>
                <span className="text-xs uppercase tracking-wider font-semibold text-[#D4C3A3] block">
                  {activeCouple?.husband_name || 'Husband'}'s Guess
                </span>
                <span className="text-[10px] text-[#6B645B] font-mono">
                  Team: {activeCouple?.team_name}
                </span>
              </div>
              <span
                className={`text-[11px] font-mono px-2.5 py-0.5 rounded-full ${
                  activeSubmission?.husband_answer
                    ? 'bg-[#1C231B] text-[#86EFAC] border border-[#273B25]'
                    : 'bg-[#1C1A17] text-[#6B645B]'
                }`}
              >
                {activeSubmission?.husband_answer ? 'Received' : 'Waiting'}
              </span>
            </div>

            <div className="bg-[#0F0E0C] border border-[#26231E] p-6 rounded-xl min-h-[100px] flex items-center justify-center text-center">
              {activeSubmission?.husband_unmasked ? (
                <p className="text-xl font-serif text-[#F3EFE6]">{activeSubmission.husband_answer}</p>
              ) : (
                <p className="text-[#6B645B] text-xs italic flex items-center gap-2">
                  <EyeOff className="w-4 h-4" /> Hidden
                </p>
              )}
            </div>

            <div className="space-y-2">
              <button
                onClick={() => toggleUnmask('husband')}
                disabled={!activeSubmission?.husband_answer}
                className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#26231E] disabled:opacity-40 text-[#F3EFE6] font-medium py-2 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
              >
                {activeSubmission?.husband_unmasked ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" /> Reveal
                  </>
                )}
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => awardPoints('husband', 5)}
                  disabled={!activeSubmission?.husband_answer}
                  className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 transition-all ${
                    activeSubmission?.husband_score === 5
                      ? 'bg-[#D4C3A3] text-[#0F0E0C]'
                      : 'bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] disabled:opacity-40'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" /> Match (+5)
                </button>
                <button
                  onClick={() => awardPoints('husband', 0)}
                  disabled={!activeSubmission?.husband_answer}
                  className={`py-2 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 border transition-all ${
                    activeSubmission?.husband_score === 0 && activeSubmission?.husband_unmasked
                      ? 'bg-[#281A1A] border-[#EF4444] text-[#EF4444]'
                      : 'bg-[#1C1A17] hover:bg-[#282420] text-[#9E978E] border-[#26231E] disabled:opacity-40'
                  }`}
                >
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
            <span className="text-xs uppercase tracking-wider font-semibold text-[#9E978E]">
              Standings & Selection
            </span>
            <Trophy className="w-4 h-4 text-[#D4C3A3]" />
          </div>

          <div className="space-y-2.5">
            {couples.map((couple, index) => {
              const isSelected = activeCouple?.id === couple.id;
              const hasPlayed = teamsPlayed.includes(couple.id);

              return (
                <div
                  key={couple.id}
                  onClick={() => handleSelectActiveCouple(couple)}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-[#26231E] border-[#D4C3A3] ring-1 ring-[#D4C3A3]/40'
                      : 'bg-[#0F0E0C] border-[#26231E] hover:border-[#302B25]'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-xs text-[#F3EFE6]">
                        {index + 1}. {couple.team_name}
                      </span>
                      {hasPlayed && !isSelected && (
                        <span className="text-[9px] font-mono text-[#86EFAC] bg-[#1C231B] border border-[#273B25] px-1.5 py-0.2 rounded">
                          Played
                        </span>
                      )}
                      {isSelected && (
                        <span className="w-1.5 h-1.5 rounded-full bg-[#D4C3A3]" />
                      )}
                    </div>
                    <span className="text-sm font-mono font-semibold text-[#D4C3A3]">
                      {couple.total_score} pts
                    </span>
                  </div>
                  <p className="text-[11px] text-[#6B645B]">
                    {couple.husband_name} & {couple.wife_name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={handleEndGameAttempt}
          className="w-full bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#D4C3A3] font-semibold py-3.5 rounded-full text-xs flex items-center justify-center gap-2 transition-all shadow-md"
        >
          <Flag className="w-3.5 h-3.5" /> Finish Game & Declare Winner
        </button>
      </div>

      {/* QR Code Expandable Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#161412] border border-[#26231E] rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowQrModal(false)}
              className="absolute top-4 right-4 bg-[#1C1A17] hover:bg-[#282420] border border-[#302B25] text-[#9E978E] hover:text-[#F3EFE6] p-2 rounded-full transition-all"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#D4C3A3]">
                Room Code: {roomCodeUpper}
              </span>
              <h2 className="text-xl font-serif text-[#F3EFE6]">Scan to Join Game</h2>
              <p className="text-xs text-[#9E978E]">
                Point your phone camera at the code below to join instantly.
              </p>
            </div>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-lg">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(playerLink)}`}
                alt="Player Join QR Code"
                className="w-48 h-48 mx-auto"
              />
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-mono text-[#6B645B] truncate bg-[#0F0E0C] p-2.5 rounded-xl border border-[#26231E]">
                {playerLink}
              </p>
              <button
                onClick={() => {
                  handleCopyPlayerLink();
                }}
                className="w-full bg-[#F3EFE6] hover:bg-[#E2DDD0] text-[#0F0E0C] font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Link Copied to Clipboard!' : 'Copy Player Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}