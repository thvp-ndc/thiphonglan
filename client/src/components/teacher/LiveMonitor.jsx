import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { ShieldAlert, Users, Clock, AlertTriangle, CheckCircle, RefreshCw, PlusCircle, StopCircle, ArrowLeft, Laptop, Play, KeyRound } from 'lucide-react';

export default function LiveMonitor({ sessionId, onBack, onOpenEssayGrading, onOpenResults }) {
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [violationsList, setViolationsList] = useState([]);
  const [socket, setSocket] = useState(null);
  const [selectedStudentForAction, setSelectedStudentForAction] = useState(null);
  const [extraMinutes, setExtraMinutes] = useState(5);
  const [startingExam, setStartingExam] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const calculateRemainingSeconds = (sess) => {
    if (!sess || !sess.duration_minutes) return 0;
    if (sess.status === 'waiting') {
      return Number(sess.duration_minutes) * 60;
    }
    if (sess.status === 'finished') {
      return 0;
    }
    if (!sess.start_time) {
      return Number(sess.duration_minutes) * 60;
    }

    let startIso = String(sess.start_time);
    if (!startIso.endsWith('Z') && !startIso.includes('+')) {
      startIso = startIso.replace(' ', 'T') + 'Z';
    }
    const startTimeMs = new Date(startIso).getTime();
    if (isNaN(startTimeMs)) return Number(sess.duration_minutes) * 60;

    const totalAllowedSeconds = Number(sess.duration_minutes) * 60;
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
    return Math.max(0, totalAllowedSeconds - elapsedSeconds);
  };

  const formatCountdown = (totalSec) => {
    if (totalSec <= 0) return '00:00';
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  };

  const fetchInitialData = async () => {
    try {
      const res = await fetch(`/api/teacher/sessions/${sessionId}/live`);
      const data = await res.json();
      if (data.success) {
        setSession(data.session);
        setStudents(data.students || []);
        setTotalQuestions(data.totalQuestions || 0);
      }
    } catch (err) {
      console.error('Fetch live data error:', err);
    }
  };

  useEffect(() => {
    fetchInitialData();

    const newSocket = io({ path: '/socket.io' });
    setSocket(newSocket);

    newSocket.on('connect', () => {
      newSocket.emit('teacher_join_room', { sessionId });
    });

    newSocket.on('teacher_roster_update', ({ students: roster }) => {
      setStudents(roster || []);
    });

    newSocket.on('student_status_change', ({ attemptId, status, clientIp, studentCode, studentName }) => {
      setStudents(prev => {
        const exists = prev.find(s => s.id === attemptId);
        if (exists) {
          return prev.map(s => s.id === attemptId ? { ...s, isOnline: status === 'online', client_ip: clientIp || s.client_ip } : s);
        } else if (status === 'online') {
          return [...prev, { id: attemptId, student_code: studentCode, student_name: studentName, client_ip: clientIp, isOnline: true, answered_count: 0, violations_count: 0, status: 'in_progress' }];
        }
        return prev;
      });
    });

    newSocket.on('student_progress_update', ({ attemptId, answeredCount }) => {
      setStudents(prev => prev.map(s => s.id === attemptId ? { ...s, answered_count: answeredCount } : s));
    });

    newSocket.on('student_violation_alert', (violation) => {
      // Play audio beep notification if allowed
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      } catch (e) {}

      setViolationsList(prev => [violation, ...prev.slice(0, 49)]);

      setStudents(prev => prev.map(s => s.id === violation.attemptId ? {
        ...s,
        violations_count: violation.violationsCount
      } : s));
    });

    newSocket.on('student_submitted_alert', ({ attemptId, gradeResult }) => {
      setStudents(prev => prev.map(s => s.id === attemptId ? {
        ...s,
        status: 'submitted',
        mcq_score: gradeResult.mcq_score,
        essay_score: gradeResult.essay_score,
        total_score: gradeResult.total_score,
        is_graded: gradeResult.is_graded
      } : s));
    });

    newSocket.on('refresh_roster', () => {
      fetchInitialData();
    });

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    if (!session) return;
    setRemainingSeconds(calculateRemainingSeconds(session));

    if (session.status !== 'in_progress') return;

    const timer = setInterval(() => {
      setRemainingSeconds(calculateRemainingSeconds(session));
    }, 1000);

    return () => clearInterval(timer);
  }, [session?.status, session?.start_time, session?.duration_minutes]);

  const handleAddExtraTime = (attemptId = null) => {
    if (!socket) return;
    socket.emit('teacher_add_extra_time', {
      sessionId,
      attemptId,
      minutes: Number(extraMinutes)
    });
    alert(`Đã cộng thêm ${extraMinutes} phút!`);
    setSelectedStudentForAction(null);
  };

  const handleForceSubmit = (attemptId, studentName) => {
    if (!confirm(`Bạn có chắc chắn muốn THU BÀI CƯỠNG CHẾ đối với thí sinh [${studentName}]?`)) return;
    if (!socket) return;
    socket.emit('teacher_force_submit', { attemptId, sessionId });
  };

  const handleStartSession = async () => {
    if (!confirm(`Bạn có chắc chắn muốn BẮT ĐẦU LÀM BÀI cho ca thi [${session?.session_code}]?\n\nTất cả thí sinh đang ở phòng chờ sẽ đồng loạt bắt đầu làm bài và đồng hồ đếm ngược sẽ bắt đầu chạy.`)) return;
    setStartingExam(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/start`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã phát lệnh bắt đầu ca thi thành công!');
        setSession(prev => prev ? { ...prev, status: 'in_progress' } : prev);
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể bắt đầu ca thi: ' + err.message);
    } finally {
      setStartingExam(false);
    }
  };

  const handleUnlockDevice = async (attemptId, studentName) => {
    if (!confirm(`Mở khóa đổi máy cho thí sinh [${studentName}]?\n\nSau khi mở khóa, thí sinh có thể đăng nhập vào máy tính khác trong phòng máy để làm tiếp mà không bị chặn.`)) return;
    try {
      const res = await fetch(`/api/teacher/attempts/${attemptId}/unlock-device`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'Đã mở khóa thiết bị thành công!');
        fetchInitialData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi khi mở khóa thiết bị: ' + err.message);
    }
  };

  const handleFinishSession = async () => {
    if (!confirm(`Bạn có chắc chắn muốn KẾT THÚC CA THI [${session?.session_code}]?\n\nHệ thống sẽ:\n1. Tự động thu bài và chấm trắc nghiệm tất cả thí sinh đang thi.\n2. Khóa ca thi, không cho phép học sinh mới vào.\n3. Chuyển sang màn hình Báo Cáo Điểm.`)) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        onOpenResults(sessionId);
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể kết thúc ca thi: ' + err.message);
    }
  };

  const stats = {
    total: students.length,
    submitted: students.filter(s => s.status === 'submitted' || s.status === 'forced_submitted').length,
    violating: students.filter(s => (s.violations_count || 0) > 0).length,
    online: students.filter(s => s.isOnline !== false && s.status === 'in_progress').length
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Info Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition"
            title="Quay lại"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{session?.title || 'Phòng Thi Trực Tuyến'}</h2>
              <span className="px-2.5 py-0.5 bg-sky-950 text-sky-400 border border-sky-800 rounded font-mono font-bold text-sm">
                MÃ: {session?.session_code}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Đề thi: <span className="text-slate-300 font-medium">{session?.exam_title}</span> | Thời lượng: {session?.duration_minutes} phút | Tổng số câu: {totalQuestions} câu
            </p>
          </div>
        </div>

        {/* Realtime Countdown Timer Badge */}
        <div className="flex items-center">
          {session?.status === 'in_progress' ? (
            remainingSeconds > 0 ? (
              <div
                className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all ${
                  remainingSeconds <= 300
                    ? 'bg-rose-950/80 border-rose-500 shadow-lg shadow-rose-950/50 animate-pulse text-rose-300'
                    : 'bg-slate-900/90 border-sky-500/40 text-sky-400 shadow'
                }`}
                title={remainingSeconds <= 300 ? 'Cảnh báo: Ca thi còn dưới 5 phút!' : 'Thời gian làm bài còn lại của ca thi'}
              >
                <div className="flex items-center justify-center">
                  <Clock className={`w-6 h-6 ${remainingSeconds <= 300 ? 'text-rose-400 animate-spin-slow' : 'text-sky-400'}`} />
                </div>
                <div>
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${remainingSeconds <= 300 ? 'text-rose-300' : 'text-slate-400'}`}>
                    {remainingSeconds <= 300 ? '⚠️ SẮP HẾT GIỜ' : 'THỜI GIAN CÒN LẠI'}
                  </div>
                  <div className="text-2xl font-black font-mono tracking-wider">
                    {formatCountdown(remainingSeconds)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-2 rounded-xl border-2 border-rose-600 bg-rose-950/90 text-rose-300 shadow-lg animate-pulse">
                <StopCircle className="w-6 h-6 text-rose-400 animate-bounce" />
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-rose-300">TRẠNG THÁI CA THI</div>
                  <div className="text-xl font-black font-mono text-rose-200">00:00 (HẾT GIỜ)</div>
                </div>
              </div>
            )
          ) : session?.status === 'waiting' ? (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-amber-500/50 bg-amber-950/40 text-amber-300">
              <Clock className="w-5 h-5 text-amber-400" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">THỜI LƯỢNG CA THI</div>
                <div className="text-sm font-bold font-mono text-amber-200">{session?.duration_minutes} phút (Chưa bắt đầu)</div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900/60 text-slate-300">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CA THI</div>
                <div className="text-sm font-bold text-slate-200">Đã kết thúc</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {session?.status === 'waiting' && (
            <button
              onClick={handleStartSession}
              disabled={startingExam}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-1.5 animate-bounce"
              title="Phát lệnh bắt đầu làm bài cho tất cả thí sinh đang chờ"
            >
              <Play className="w-4 h-4 fill-white" /> {startingExam ? 'Đang kích hoạt...' : '🚀 Bắt Đầu Làm Bài'}
            </button>
          )}
          <button
            onClick={() => onOpenEssayGrading(sessionId)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition shadow flex items-center gap-1.5"
          >
            ✍️ Chấm Tự Luận
          </button>
          <button
            onClick={() => onOpenResults(sessionId)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition shadow flex items-center gap-1.5"
          >
            📊 Báo Cáo Điểm & Excel
          </button>
          <button
            onClick={() => handleAddExtraTime(null)}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow flex items-center gap-1.5"
            title="Cộng 5 phút cho toàn phòng"
          >
            <PlusCircle className="w-3.5 h-3.5" /> Bù Giờ (+5p)
          </button>
          <button
            onClick={handleFinishSession}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold transition shadow-lg flex items-center gap-1.5 animate-pulse"
            title="Tự động thu bài tất cả máy con và đóng ca thi"
          >
            <StopCircle className="w-4 h-4" /> Kết Thúc Ca Thi
          </button>
        </div>
      </div>

      {/* Time Expired Notice Banner */}
      {session?.status === 'in_progress' && remainingSeconds === 0 && (
        <div className="bg-rose-950/90 border-2 border-rose-500 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-7 h-7 text-rose-400 animate-bounce" />
            <div>
              <h3 className="font-bold text-rose-100 text-sm">
                ĐÃ HẾT THỜI GIAN LÀM BÀI QUY ĐỊNH ({session?.duration_minutes} PHÚT)!
              </h3>
              <p className="text-xs text-rose-300/90 mt-0.5">
                Các thí sinh chưa nộp bài có thể đang hoàn tất nộp. Thầy/Cô có thể bấm <strong>"Bù Giờ (+5p)"</strong> nếu muốn gia hạn, hoặc bấm <strong>"Kết Thúc Ca Thi"</strong> để tự động thu bài toàn bộ học sinh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAddExtraTime(null)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow"
            >
              <PlusCircle className="w-4 h-4" /> Bù Giờ (+5p)
            </button>
            <button
              onClick={handleFinishSession}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-rose-900/50"
            >
              <StopCircle className="w-4 h-4" /> Kết Thúc & Thu Bài Ngay
            </button>
          </div>
        </div>
      )}

      {/* Waiting Room Big Banner */}
      {session?.status === 'waiting' && (
        <div className="bg-gradient-to-r from-amber-950/90 via-amber-900/70 to-slate-900 border-2 border-amber-500 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-xl">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
              <Clock className="w-8 h-8 animate-spin" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                Ca thi đang ở chế độ: <span className="text-amber-300 underline font-mono">PHÒNG CHỜ (CHƯA BẮT ĐẦU)</span>
              </h3>
              <p className="text-xs text-amber-200/90 mt-1">
                Học sinh khi đăng nhập sẽ ở phòng chờ và được điểm danh. Câu hỏi và thời gian làm bài sẽ được kích hoạt đồng loạt khi bạn bấm nút.
              </p>
            </div>
          </div>
          <button
            onClick={handleStartSession}
            disabled={startingExam}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-extrabold transition shadow-lg shadow-emerald-900/50 flex items-center gap-2 transform hover:scale-105"
          >
            <Play className="w-5 h-5 fill-white" /> {startingExam ? 'Đang kích hoạt...' : 'BẮT ĐẦU LÀM BÀI CHO TOÀN PHÒNG'}
          </button>
        </div>
      )}

      {/* Realtime KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Tổng Thí Sinh</p>
            <p className="text-2xl font-black text-white mt-1">{stats.total}</p>
          </div>
          <Users className="w-8 h-8 text-sky-400 opacity-80" />
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Đang Làm Bài</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{stats.online}</p>
          </div>
          <Laptop className="w-8 h-8 text-emerald-400 opacity-80" />
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Đã Nộp Bài</p>
            <p className="text-2xl font-black text-indigo-400 mt-1">{stats.submitted}</p>
          </div>
          <CheckCircle className="w-8 h-8 text-indigo-400 opacity-80" />
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400 uppercase font-semibold">Cảnh Báo Gian Lận</p>
            <p className={`text-2xl font-black mt-1 ${stats.violating > 0 ? 'text-rose-400 animate-pulse' : 'text-slate-400'}`}>
              {stats.violating}
            </p>
          </div>
          <ShieldAlert className={`w-8 h-8 ${stats.violating > 0 ? 'text-rose-500 animate-bounce' : 'text-slate-500'}`} />
        </div>
      </div>

      {/* Realtime Urgent Cheat Alert Banner */}
      {violationsList.length > 0 && (
        <div className="p-3 bg-rose-950/90 border border-rose-600 rounded-xl text-xs text-rose-200 flex flex-wrap items-center justify-between gap-3 shadow-lg">
          <div className="flex items-center gap-2.5 font-medium">
            <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0 animate-pulse" />
            <span>
              <strong className="text-rose-300">CẢNH BÁO MỚI NHẤT [{violationsList[0].time}]:</strong> Thí sinh <strong className="text-white">{violationsList[0].studentName}</strong> (SBD: {violationsList[0].studentCode}) - {violationsList[0].details} (Tổng: <strong className="text-rose-400">{violationsList[0].violationsCount} lần</strong>)
            </span>
          </div>
          <span className="text-[11px] px-2.5 py-1 bg-rose-900 text-white rounded font-bold uppercase tracking-wider">
            Phát Hiện Vi Phạm
          </span>
        </div>
      )}

      {/* Main Content: Lưới phòng máy (Left) & Bảng Nhật Ký Vi Phạm (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Computer Grid (2 cols) */}
        <div className="lg:col-span-2 bg-slate-800/70 border border-slate-700 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Laptop className="w-5 h-5 text-sky-400" /> Sơ Đồ Máy Thí Sinh Thời Gian Thực ({students.length})
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Đang thi</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Vi phạm</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> Đã nộp</span>
            </div>
          </div>

          {students.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <Laptop className="w-12 h-12 mx-auto text-slate-600 animate-pulse" />
              <p>Đang chờ thí sinh kết nối từ các máy trạm trong phòng máy...</p>
              <p className="text-xs text-slate-500">Thí sinh nhập mã ca thi: <strong className="text-sky-400">{session?.session_code}</strong></p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {students.map(st => {
                const isViolated = (st.violations_count || 0) > 0;
                const isSubmitted = st.status === 'submitted' || st.status === 'forced_submitted';
                const progressPct = totalQuestions > 0 ? Math.round(((st.answered_count || 0) / totalQuestions) * 100) : 0;

                return (
                  <div
                    key={st.id}
                    className={`rounded-xl p-4 border transition-all relative flex flex-col justify-between ${
                      isViolated && !isSubmitted
                        ? 'bg-rose-950/40 border-rose-500 shadow-lg shadow-rose-900/30 ring-1 ring-rose-500'
                        : isSubmitted
                        ? 'bg-slate-900/90 border-slate-700 opacity-80'
                        : 'bg-slate-900/90 border-slate-700 hover:border-sky-500'
                    }`}
                  >
                    <div>
                      {/* Top row */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs bg-slate-800 text-sky-400 px-2 py-0.5 rounded border border-slate-700">
                          {st.student_code}
                        </span>
                        {isViolated && (
                          <span className="px-2 py-0.5 bg-rose-600 text-white font-bold text-xs rounded-full flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" /> {st.violations_count} lỗi
                          </span>
                        )}
                      </div>

                      {/* Name & IP */}
                      <h4 className="font-semibold text-white text-sm mt-2 line-clamp-1">{st.student_name}</h4>
                      <p className="text-xs text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>IP: {st.client_ip || 'LAN'}</span>
                        {st.class_name && <span>{st.class_name}</span>}
                      </p>

                      {/* Progress bar */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Tiến độ:</span>
                          <span className="font-semibold text-slate-200">{st.answered_count || 0}/{totalQuestions} câu</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isSubmitted ? 'bg-indigo-500' : isViolated ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Status / Score */}
                      <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        {isSubmitted ? (
                          <span className="text-indigo-400 font-bold">
                            Đã nộp bài | Điểm: {st.total_score}đ
                          </span>
                        ) : session?.status === 'waiting' || st.status === 'waiting' ? (
                          <span className="flex items-center gap-1.5 text-amber-400 font-medium">
                            <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" /> Chờ phát đề
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Đang thi
                          </span>
                        )}
                        {st.extra_time_minutes > 0 && (
                          <span className="text-amber-400 font-mono text-[11px]">+{st.extra_time_minutes}p</span>
                        )}
                      </div>
                    </div>

                    {/* Quick actions for teacher */}
                    {!isSubmitted && (
                      <div className="mt-3 pt-2 border-t border-slate-800 flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedStudentForAction(st);
                          }}
                          className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 rounded text-xs font-medium"
                          title="Cộng thêm phút làm bài"
                        >
                          + Bù giờ
                        </button>
                        <button
                          onClick={() => handleUnlockDevice(st.id, st.student_name)}
                          className="px-2 py-1 bg-amber-950/70 hover:bg-amber-900 text-amber-300 rounded text-xs font-medium flex items-center gap-1"
                          title="Mở khóa để thí sinh chuyển sang đăng nhập máy khác"
                        >
                          <KeyRound className="w-3 h-3" /> Đổi máy
                        </button>
                        <button
                          onClick={() => handleForceSubmit(st.id, st.student_name)}
                          className="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-400 rounded text-xs font-medium"
                          title="Thu bài cưỡng chế"
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Violations Live Feed (1 col) */}
        <div className="bg-slate-800/70 border border-slate-700 rounded-xl p-5 flex flex-col h-[650px]">
          <h3 className="font-bold text-white text-base mb-3 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" /> Nhật Ký Vi Phạm Thời Gian Thực
          </h3>
          <p className="text-xs text-slate-400 mb-3">
            Hệ thống tự động phát hiện thí sinh thoát toàn màn hình, bấm Alt+Tab, phím Win hoặc mất focus.
          </p>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {violationsList.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-sm italic">
                <CheckCircle className="w-8 h-8 text-emerald-500/50 mb-2" />
                Chưa ghi nhận vi phạm nào. Phòng thi trật tự!
              </div>
            ) : (
              violationsList.map((v, idx) => (
                <div key={idx} className="bg-rose-950/30 border border-rose-800/60 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-rose-400 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> {v.studentName} ({v.studentCode})
                    </span>
                    <span className="text-slate-400 font-mono">{v.time}</span>
                  </div>
                  <p className="text-slate-300 font-medium">Hành vi: {v.details || 'Mất tiêu điểm / Rời cửa sổ thi'}</p>
                  <p className="text-rose-300/80">Tổng số lần vi phạm của thí sinh: <strong>{v.violationsCount}</strong> lần</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal Bù Giờ Cá Nhân */}
      {selectedStudentForAction && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h4 className="font-bold text-white text-lg">Bù Giờ Làm Bài</h4>
            <p className="text-sm text-slate-300">
              Cộng thêm thời gian cho thí sinh: <strong className="text-sky-400">{selectedStudentForAction.student_name}</strong> ({selectedStudentForAction.student_code})
            </p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Số phút cộng thêm:</label>
              <input
                type="number"
                min="1"
                max="60"
                value={extraMinutes}
                onChange={e => setExtraMinutes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedStudentForAction(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm"
              >
                Hủy
              </button>
              <button
                onClick={() => handleAddExtraTime(selectedStudentForAction.id)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium"
              >
                Xác Nhận Cộng Giờ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
