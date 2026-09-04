import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Clock, CheckCircle, AlertTriangle, Send, ShieldAlert, Flag, Check, FileText, Maximize2, Eye } from 'lucide-react';
import MathContent from '../common/MathContent';

export default function StudentExam({ examData, onExamFinished }) {
  const { attempt, session, examPaper, savedAnswers: initialAnswers, remainingSeconds: initialRemainingSeconds } = examData;
  const questions = examPaper?.questions || [];

  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState(() => {
    const map = {};
    (initialAnswers || []).forEach(a => {
      map[a.question_id] = {
        selected_options: a.selected_options || [],
        essay_content: a.essay_content || ''
      };
    });
    return map;
  });

  const [flaggedQuestions, setFlaggedQuestions] = useState(new Set());
  const sessionMinutes = Number(session?.duration_minutes) || 45;
  const initialTime = (initialRemainingSeconds !== undefined && initialRemainingSeconds > 0)
    ? initialRemainingSeconds
    : sessionMinutes * 60;

  const [remainingSeconds, setRemainingSeconds] = useState(initialTime);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [violationsCount, setViolationsCount] = useState(attempt?.violations_count || 0);
  const [showViolationModal, setShowViolationModal] = useState(false);
  const [violationMsg, setViolationMsg] = useState('');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);

  const socketRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastViolationTimeRef = useRef(0);
  const MAX_ALLOWED_VIOLATIONS = 3;

  // Web Audio API beep sound for violation warnings
  const playViolationBeep = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(350, ctx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.45);
    } catch (e) {}
  };

  // Fullscreen helper
  const requestBrowserFullscreen = async () => {
    try {
      const docEl = document.documentElement;
      if (docEl.requestFullscreen) {
        await docEl.requestFullscreen();
      } else if (docEl.webkitRequestFullscreen) {
        await docEl.webkitRequestFullscreen();
      } else if (docEl.msRequestFullscreen) {
        await docEl.msRequestFullscreen();
      }
      setIsFullscreen(true);

      // Lock keyboard if supported (Chrome/Edge in Fullscreen)
      if (navigator.keyboard && navigator.keyboard.lock) {
        navigator.keyboard.lock(['Escape', 'Tab']).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not activate fullscreen:', err);
    }
  };

  // Auto request fullscreen on mount
  useEffect(() => {
    requestBrowserFullscreen();
  }, []);

  // Initialize Socket.io connection for real-time exam communication
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('student_join_exam', {
        attemptId: attempt.id,
        sessionId: session.id,
        studentCode: attempt.student_code,
        studentName: attempt.student_name,
        machineName: window.navigator.userAgent.slice(0, 40)
      });
    });

    socket.on('answer_saved_ack', () => {
      setLastSavedTime(new Date().toLocaleTimeString('vi-VN'));
    });

    socket.on('extra_time_granted', ({ minutes }) => {
      setRemainingSeconds(prev => prev + minutes * 60);
      alert(`🔔 GIÁM THỊ ĐÃ BÙ THỜI GIAN: Bạn được cộng thêm ${minutes} phút!`);
    });

    socket.on('command_force_submitted', ({ reason }) => {
      alert(`⚠️ HẾT GIỜ HOẶC CÓ LỆNH THU BÀI TỪ GIÁM THỊ: ${reason}`);
      handleSubmitExam();
    });

    socket.on('exam_submit_confirmed', (result) => {
      setIsSubmitting(false);
      onExamFinished(result);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Timer countdown: Starts on mount and runs reliably every second
  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Anti-cheat window listeners & Fullscreen enforcement
  useEffect(() => {
    const checkFullscreenState = () => {
      const fs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
      setIsFullscreen(fs);
      if (!fs) {
        reportViolation('exit_fullscreen', 'Thoát khỏi chế độ Toàn Màn Hình (Fullscreen)');
      }
    };

    const handleBlur = () => {
      reportViolation('focus_loss', 'Rời cửa sổ thi hoặc chuyển đổi ứng dụng (Focus Loss / Alt+Tab)');
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        reportViolation('tab_switch', 'Ẩn cửa sổ bài thi hoặc mở tab trình duyệt khác');
      }
    };

    const handleKeyDown = (e) => {
      // 1. Prevent F11 (Fullscreen toggle by user), F12 (Inspect)
      if (e.key === 'F11' || e.key === 'F12') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', `Nhấn phím cấm: ${e.key}`);
        return;
      }

      // 2. Prevent F5 or Ctrl+R (Page refresh)
      if (e.key === 'F5' || (e.ctrlKey && (e.key === 'r' || e.key === 'R'))) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 3. Prevent Ctrl+T (New tab), Ctrl+N (New window), Ctrl+W (Close tab)
      if (e.ctrlKey && ['t', 'T', 'n', 'N', 'w', 'W'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', `Cố tình mở/đóng tab: Ctrl+${e.key.toUpperCase()}`);
        return;
      }

      // 4. Prevent Ctrl+Tab, Ctrl+Shift+Tab (Switch browser tabs)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình chuyển tab (Ctrl+Tab)');
        return;
      }

      // 5. Prevent Devtools shortcuts: Ctrl+Shift+I, J, C
      if (e.ctrlKey && e.shiftKey && ['I', 'J', 'C', 'i', 'j', 'c'].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình mở công cụ kiểm tra (Inspect)');
        return;
      }

      // 6. Prevent Ctrl+U (View source)
      if (e.ctrlKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      // 7. Prevent Alt+Tab if trapped by browser
      if (e.altKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        reportViolation('shortcut_attempt', 'Cố tình chuyển ứng dụng (Alt+Tab)');
        return;
      }
    };

    const handleContextMenu = (e) => {
      e.preventDefault();
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Bạn có chắc chắn muốn rời khỏi bài thi? Bài làm có thể bị gián đoạn!';
      return e.returnValue;
    };

    document.addEventListener('fullscreenchange', checkFullscreenState);
    document.addEventListener('webkitfullscreenchange', checkFullscreenState);
    document.addEventListener('mozfullscreenchange', checkFullscreenState);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('fullscreenchange', checkFullscreenState);
      document.removeEventListener('webkitfullscreenchange', checkFullscreenState);
      document.removeEventListener('mozfullscreenchange', checkFullscreenState);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const reportViolation = (type, details) => {
    // Debounce to prevent 1 blur/alt-tab from registering multiple times within 1.5s
    const now = Date.now();
    if (now - lastViolationTimeRef.current < 1500) {
      return;
    }
    lastViolationTimeRef.current = now;

    // Play warning sound
    playViolationBeep();

    setViolationsCount(prev => {
      const nextCount = prev + 1;
      setViolationMsg(details);
      setShowViolationModal(true);

      if (socketRef.current) {
        socketRef.current.emit('student_violation', {
          attemptId: attempt.id,
          violationType: type,
          details,
          violationsCount: nextCount
        });
      }

      // Auto submit if reached limit
      if (nextCount >= MAX_ALLOWED_VIOLATIONS) {
        setTimeout(() => {
          alert('❌ BÀI THI BỊ THU TỰ ĐỘNG: Bạn đã vi phạm quy chế chuyển tab/cửa sổ quá 3 lần!');
          handleSubmitExam();
        }, 1200);
      }

      return nextCount;
    });
  };

  const handleResumeExam = async () => {
    setShowViolationModal(false);
    await requestBrowserFullscreen();
  };

  const currentQ = questions[currentQIndex] || null;
  const currentAnswer = currentQ ? answers[currentQ.id] || { selected_options: [], essay_content: '' } : null;

  const handleSelectOption = (optId) => {
    if (!currentQ) return;
    let newSelected = [];

    if (currentQ.question_type === 'single_choice' || currentQ.question_type === 'true_false') {
      newSelected = [optId];
    } else if (currentQ.question_type === 'multiple_choice') {
      const prev = currentAnswer.selected_options || [];
      if (prev.includes(optId)) {
        newSelected = prev.filter(id => id !== optId);
      } else {
        newSelected = [...prev, optId];
      }
    }

    const updated = {
      ...answers,
      [currentQ.id]: {
        ...currentAnswer,
        selected_options: newSelected
      }
    };
    setAnswers(updated);

    // Save immediately over socket
    if (socketRef.current) {
      socketRef.current.emit('student_save_answer', {
        attemptId: attempt.id,
        questionId: currentQ.id,
        selectedOptions: newSelected,
        essayContent: currentAnswer.essay_content
      });
    }
  };

  const handleSelectTrueFalse = (subId, choice) => {
    if (!currentQ) return;
    const prev = (currentAnswer.selected_options && typeof currentAnswer.selected_options === 'object' && !Array.isArray(currentAnswer.selected_options))
      ? { ...currentAnswer.selected_options }
      : {};

    prev[subId.toLowerCase()] = choice;

    const updated = {
      ...answers,
      [currentQ.id]: {
        ...currentAnswer,
        selected_options: prev
      }
    };
    setAnswers(updated);

    if (socketRef.current) {
      socketRef.current.emit('student_save_answer', {
        attemptId: attempt.id,
        questionId: currentQ.id,
        selectedOptions: prev,
        essayContent: currentAnswer.essay_content
      });
    }
  };

  const handleEssayChange = (text) => {
    if (!currentQ) return;

    const updated = {
      ...answers,
      [currentQ.id]: {
        ...currentAnswer,
        essay_content: text
      }
    };
    setAnswers(updated);

    // Debounce save for essay text
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      if (socketRef.current) {
        socketRef.current.emit('student_save_answer', {
          attemptId: attempt.id,
          questionId: currentQ.id,
          selectedOptions: currentAnswer.selected_options,
          essayContent: text
        });
      }
    }, 600);
  };

  const toggleFlagQuestion = (qId) => {
    setFlaggedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(qId)) next.delete(qId);
      else next.add(qId);
      return next;
    });
  };

  const handleSubmitExam = () => {
    setIsSubmitting(true);
    if (socketRef.current) {
      socketRef.current.emit('student_submit_exam', {
        attemptId: attempt.id
      });
    }
  };

  // Format remaining time
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isTimeLow = remainingSeconds <= 300; // < 5 mins

  // Helper check if question is answered
  const isQuestionAnswered = (q, a) => {
    if (!a) return false;
    if (q.question_type === 'essay') return a.essay_content && a.essay_content.trim().length > 0;
    if (q.question_type === 'true_false') {
      if (!a.selected_options) return false;
      if (typeof a.selected_options === 'object' && !Array.isArray(a.selected_options)) {
        return Object.values(a.selected_options).some(v => v === 'T' || v === 'F');
      }
      return Array.isArray(a.selected_options) && a.selected_options.length > 0;
    }
    return a.selected_options && a.selected_options.length > 0;
  };

  // Count answered questions
  const answeredCount = questions.filter(q => isQuestionAnswered(q, answers[q.id])).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col select-none">
      {/* Top Fixed Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-sky-600 flex items-center justify-center font-bold text-white shadow">
            LAN
          </div>
          <div>
            <h1 className="text-sm font-bold text-white line-clamp-1">{session.exam_title}</h1>
            <p className="text-xs text-slate-400">
              Thí sinh: <strong className="text-sky-300">{attempt.student_name}</strong> (SBD: <strong className="text-white font-mono">{attempt.student_code}</strong>)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Auto-save status */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{lastSavedTime ? `Đã lưu: ${lastSavedTime}` : 'Đã kết nối máy chủ'}</span>
          </div>

          {/* Countdown Clock */}
          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-xl font-mono text-base font-black border transition ${
            isTimeLow ? 'bg-rose-950/80 text-rose-300 border-rose-600 animate-pulse' : 'bg-slate-800 text-sky-300 border-slate-700'
          }`}>
            <Clock className="w-4 h-4" />
            <span>{timeFormatted}</span>
          </div>

          {/* Nộp Bài Button */}
          <button
            onClick={() => setShowSubmitModal(true)}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shadow-md shadow-emerald-700/20 flex items-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" /> Nộp Bài Thi
          </button>
        </div>
      </header>

      {/* Main Examination Area */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Question Navigation Sidebar (1 col) */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-fit">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <span className="text-xs font-bold uppercase text-slate-300">Bảng Câu Hỏi</span>
            <span className="text-xs text-slate-400 font-medium">{answeredCount}/{questions.length} đã làm</span>
          </div>

          {/* Question Circles Grid */}
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, idx) => {
              const a = answers[q.id];
              const isDone = isQuestionAnswered(q, a);
              const isCurrent = idx === currentQIndex;
              const isFlagged = flaggedQuestions.has(q.id);

              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQIndex(idx)}
                  className={`h-9 rounded-lg font-bold text-xs flex items-center justify-center transition relative ${
                    isCurrent
                      ? 'ring-2 ring-sky-400 bg-sky-600 text-white font-black'
                      : isDone
                      ? 'bg-emerald-600/80 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {idx + 1}
                  {isFlagged && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full"></span>
                  )}
                  {q.question_type === 'essay' && (
                    <span className="absolute bottom-0.5 right-0.5 text-[8px] text-amber-300 font-mono">TL</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-emerald-600"></span> Đã trả lời
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-slate-800 border border-slate-700"></span> Chưa làm
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded bg-sky-600 ring-2 ring-sky-400"></span> Đang xem
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Đã gắn cờ xem lại
            </div>
          </div>
        </div>

        {/* Right Active Question Card (3 cols) */}
        {currentQ && (
          <div className="lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between shadow-xl">
            <div>
              {/* Question Header */}
              <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="px-3 py-1 bg-sky-950 text-sky-300 border border-sky-800 rounded-lg font-bold text-sm">
                    Câu {currentQIndex + 1}
                  </span>
                  <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                    currentQ.question_type === 'essay'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : currentQ.question_type === 'true_false'
                      ? 'bg-teal-950 text-teal-300 border border-teal-800'
                      : currentQ.question_type === 'multiple_choice'
                      ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                      : 'bg-slate-800 text-slate-300'
                  }`}>
                    {currentQ.question_type === 'essay'
                      ? 'Tự Luận'
                      : currentQ.question_type === 'true_false'
                      ? '⚖️ Đúng / Sai (BGDĐT 2025)'
                      : currentQ.question_type === 'multiple_choice'
                      ? 'Trắc nghiệm nhiều đáp án'
                      : 'Trắc nghiệm'}
                  </span>
                  <span className="text-xs text-slate-400">({currentQ.max_score} điểm)</span>
                </div>

                <button
                  onClick={() => toggleFlagQuestion(currentQ.id)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
                    flaggedQuestions.has(currentQ.id) ? 'bg-amber-950 text-amber-400 border border-amber-800' : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" /> {flaggedQuestions.has(currentQ.id) ? 'Bỏ gắn cờ' : 'Đánh dấu xem lại'}
                </button>
              </div>

              {/* Question Statement */}
              <div className="text-base font-semibold text-white leading-relaxed mb-6">
                <MathContent content={currentQ.content} />
              </div>

              {/* Question Body: TỰ LUẬN VS ĐÚNG/SAI VS TRẮC NGHIỆM */}
              {currentQ.question_type === 'essay' ? (
                /* ESSAY TEXTAREA */
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-amber-400/90 font-medium bg-amber-950/20 border border-amber-800/40 px-3 py-2 rounded-lg">
                    <span className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /> Dạng câu hỏi tự luận - Soạn bài trực tiếp vào khung dưới đây:
                    </span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-[11px] text-emerald-400 bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-800/60 hidden sm:inline">
                        Phím Tab: thụt lề 4 dấu cách
                      </span>
                      <span className="font-mono text-slate-300">
                        Số từ: {currentAnswer.essay_content ? currentAnswer.essay_content.trim().split(/\s+/).filter(Boolean).length : 0} | Ký tự: {currentAnswer.essay_content ? currentAnswer.essay_content.length : 0}
                      </span>
                    </div>
                  </div>
                  <textarea
                    rows={12}
                    value={currentAnswer.essay_content || ''}
                    onChange={e => handleEssayChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') {
                        e.preventDefault();
                        const start = e.target.selectionStart;
                        const end = e.target.selectionEnd;
                        const val = e.target.value;
                        const newVal = val.substring(0, start) + '    ' + val.substring(end);
                        handleEssayChange(newVal);
                        setTimeout(() => {
                          e.target.selectionStart = e.target.selectionEnd = start + 4;
                        }, 0);
                      }
                    }}
                    placeholder="Gõ nội dung bài làm tự luận hoặc đoạn mã lập trình của bạn tại đây... (Hỗ trợ thụt lề bằng phím Tab, tự động lưu liên tục)"
                    style={{ tabSize: 4 }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-white text-sm leading-relaxed focus:border-sky-500 focus:outline-none font-mono resize-y"
                  />
                  {currentAnswer.essay_content && (currentAnswer.essay_content.includes('```') || currentAnswer.essay_content.includes('$') || currentAnswer.essay_content.includes('![')) && (
                    <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl animate-fadeIn">
                      <div className="text-xs font-bold text-sky-400 mb-1.5 flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5" /> Xem trước định dạng bài làm (Mã Code / Công thức / Hình ảnh):
                      </div>
                      <div className="text-sm text-slate-200">
                        <MathContent content={currentAnswer.essay_content} />
                      </div>
                    </div>
                  )}
                </div>
              ) : currentQ.question_type === 'true_false' ? (
                /* BẢNG CHỌN ĐÚNG / SAI 4 Ý THEO CHUẨN BGDĐT 2025 */
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-teal-950/40 border border-teal-800/60 rounded-xl text-xs">
                    <span className="text-teal-300 font-bold flex items-center gap-1.5">
                      ⚖️ PHẦN TRẮC NGHIỆM ĐÚNG / SAI (4 Ý a, b, c, d)
                    </span>
                    <span className="text-teal-400/90 font-medium">
                      Trong mỗi ý, thí sinh click chọn [ĐÚNG] hoặc [SAI].
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(currentQ.options || []).map((opt) => {
                      const subId = opt.id.toLowerCase();
                      let studentChoice = null;
                      if (currentAnswer.selected_options) {
                        if (typeof currentAnswer.selected_options === 'object' && !Array.isArray(currentAnswer.selected_options)) {
                          studentChoice = currentAnswer.selected_options[subId] || null;
                        } else if (Array.isArray(currentAnswer.selected_options)) {
                          const found = currentAnswer.selected_options.find(x => typeof x === 'string' && x.startsWith(subId + ':'));
                          if (found) studentChoice = found.split(':')[1]?.toUpperCase();
                        }
                      }

                      return (
                        <div
                          key={opt.id}
                          className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            studentChoice
                              ? 'bg-slate-900 border-teal-700/70 shadow-sm'
                              : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="flex items-start gap-3 flex-1">
                            <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm font-mono flex-shrink-0 transition ${
                              studentChoice ? 'bg-teal-700 text-white shadow' : 'bg-slate-800 text-slate-300'
                            }`}>
                              {opt.id})
                            </span>
                            <div className="text-sm text-slate-200 mt-1 leading-relaxed">
                              <MathContent content={opt.text} />
                            </div>
                          </div>

                          {/* 2 Nút ĐÚNG và SAI */}
                          <div className="flex items-center gap-2 self-end sm:self-center flex-shrink-0 pt-2 sm:pt-0">
                            <button
                              type="button"
                              onClick={() => handleSelectTrueFalse(subId, 'T')}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow ${
                                studentChoice === 'T'
                                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-400 shadow-emerald-900/50 scale-105'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                              }`}
                            >
                              <Check className="w-4 h-4" /> ĐÚNG
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSelectTrueFalse(subId, 'F')}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 shadow ${
                                studentChoice === 'F'
                                  ? 'bg-rose-600 text-white ring-2 ring-rose-400 shadow-rose-900/50 scale-105'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                              }`}
                            >
                              ✕ SAI
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* MULTIPLE CHOICE OPTIONS */
                <div className="space-y-3">
                  {(currentQ.options || []).map(opt => {
                    const isSelected = (currentAnswer.selected_options || []).includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => handleSelectOption(opt.id)}
                        className={`w-full text-left p-4 rounded-xl border transition flex items-start gap-4 ${
                          isSelected
                            ? 'bg-sky-950/60 border-sky-500 shadow-md ring-1 ring-sky-500'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/40'
                        }`}
                      >
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0 transition ${
                          isSelected ? 'bg-sky-600 text-white shadow' : 'bg-slate-800 text-slate-300'
                        }`}>
                          {opt.id}
                        </span>
                        <div className="text-sm text-slate-200 mt-1 leading-relaxed">
                          <MathContent content={opt.text} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Nav Buttons (Previous / Next) */}
            <div className="pt-6 mt-6 border-t border-slate-800 flex items-center justify-between">
              <button
                disabled={currentQIndex === 0}
                onClick={() => setCurrentQIndex(prev => Math.max(0, prev - 1))}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-200 rounded-lg text-xs font-semibold transition"
              >
                ← Câu Trước
              </button>

              <button
                disabled={currentQIndex === questions.length - 1}
                onClick={() => setCurrentQIndex(prev => Math.min(questions.length - 1, prev + 1))}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:pointer-events-none text-white rounded-lg text-xs font-semibold transition shadow"
              >
                Câu Kế Tiếp →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Cảnh Báo Vi Phạm Modal */}
      {showViolationModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-rose-950 border-2 border-rose-500 rounded-2xl max-w-md w-full p-6 text-center shadow-2xl space-y-4">
            <ShieldAlert className="w-16 h-16 text-rose-400 mx-auto animate-pulse" />
            <h3 className="text-xl font-black text-white uppercase tracking-wider">CẢNH BÁO VI PHẠM NỘI QUY THI!</h3>
            <p className="text-sm text-rose-200">
              Hệ thống phát hiện: <strong>{violationMsg}</strong>
            </p>
            <p className="text-xs text-rose-300/80">
              Số lần vi phạm của bạn: <strong className="text-white text-sm">{violationsCount} / {MAX_ALLOWED_VIOLATIONS}</strong> lần. Thông tin và thời điểm vi phạm đã được truyền trực tiếp đến màn hình Giám Thị!
            </p>
            {violationsCount >= MAX_ALLOWED_VIOLATIONS ? (
              <p className="text-xs font-bold text-rose-300 bg-rose-900/80 p-3 rounded-xl border border-rose-600">
                ❌ BÀI THI BỊ THU TỰ ĐỘNG: Bạn đã vi phạm quy chế chuyển tab / cửa sổ quá {MAX_ALLOWED_VIOLATIONS} lần!
              </p>
            ) : (
              <button
                onClick={handleResumeExam}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2"
              >
                <Maximize2 className="w-4 h-4" /> Tôi Đã Hiểu & Bật Lại Toàn Màn Hình
              </button>
            )}
          </div>
        </div>
      )}

      {/* Màn Hình Bắt Buộc Toàn Màn Hình (Fullscreen Lock Overlay) */}
      {!isFullscreen && (
        <div className="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none">
          <div className="max-w-md w-full bg-slate-900 border-2 border-amber-500 rounded-3xl p-8 shadow-2xl space-y-5">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mx-auto flex items-center justify-center">
              <Maximize2 className="w-10 h-10 animate-bounce" />
            </div>
            <h2 className="text-2xl font-black text-white uppercase tracking-wider">
              Yêu Cầu Toàn Màn Hình
            </h2>
            <p className="text-sm text-slate-300">
              Quy chế thi bắt buộc bài làm phải luôn ở chế độ <strong>Toàn Màn Hình</strong>. Nội dung câu hỏi tạm thời bị che mờ để đảm bảo tính công bằng.
            </p>
            <p className="text-xs text-amber-400/90 font-medium">
              Số lần vi phạm / thoát màn hình: <strong>{violationsCount} / {MAX_ALLOWED_VIOLATIONS}</strong>
            </p>
            <button
              onClick={requestBrowserFullscreen}
              className="w-full py-3.5 bg-gradient-to-r from-amber-600 to-sky-600 hover:from-amber-500 hover:to-sky-500 text-white font-black rounded-xl text-sm transition shadow-lg shadow-amber-600/20 flex items-center justify-center gap-2"
            >
              <Maximize2 className="w-4 h-4" /> BẬT LẠI TOÀN MÀN HÌNH ĐỂ LÀM BÀI
            </button>
          </div>
        </div>
      )}

      {/* Xác Nhận Nộp Bài Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">Xác Nhận Nộp Bài Thi</h3>
            <p className="text-sm text-slate-300">
              Bạn đã hoàn thành <strong className="text-emerald-400">{answeredCount}/{questions.length}</strong> câu hỏi.
            </p>
            {answeredCount < questions.length && (
              <p className="text-xs text-amber-400 bg-amber-950/40 p-2.5 rounded-lg border border-amber-800">
                ⚠️ Bạn vẫn còn {questions.length - answeredCount} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài sớm không?
              </p>
            )}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm"
              >
                Tiếp Tục Làm Bài
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitExam}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-sm transition shadow"
              >
                {isSubmitting ? 'Đang nộp...' : 'Đồng Ý Nộp Bài'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
