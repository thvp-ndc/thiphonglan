import React, { useState, useEffect } from 'react';
import { ArrowLeft, Download, Award, CheckCircle, AlertTriangle, Users, BookOpen, Clock, Lock, CheckCircle2, FileText, Printer } from 'lucide-react';
import StudentPaperModal from './StudentPaperModal';

export default function ResultsExport({ sessionId, onSelectSession, onBack, onOpenEssayGrading }) {
  const [sessionsList, setSessionsList] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(sessionId || '');
  const [session, setSession] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingAttemptId, setViewingAttemptId] = useState(null);
  const [isBatchPrinting, setIsBatchPrinting] = useState(false);

  // Fetch all sessions for dropdown selector
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => {
        if (data.success && data.sessions) {
          setSessionsList(data.sessions);
          if (!selectedSessionId && data.sessions.length > 0) {
            setSelectedSessionId(data.sessions[0].id);
            if (onSelectSession) onSelectSession(data.sessions[0].id);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Update selected session when prop changes
  useEffect(() => {
    if (sessionId && sessionId !== selectedSessionId) {
      setSelectedSessionId(sessionId);
    }
  }, [sessionId]);

  // Fetch results whenever selectedSessionId changes
  useEffect(() => {
    if (!selectedSessionId) return;

    const fetchResults = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/teacher/sessions/${selectedSessionId}/live`);
        const data = await res.json();
        if (data.success) {
          setSession(data.session);
          setStudents(data.students || []);
        }
      } catch (err) {
        console.error('Fetch results error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [selectedSessionId]);

  const handleSessionChange = (newId) => {
    setSelectedSessionId(newId);
    if (onSelectSession) onSelectSession(newId);
  };

  const handleDownloadExcel = () => {
    if (!selectedSessionId) return;
    window.open(`/api/teacher/sessions/${selectedSessionId}/export-excel`, '_blank');
  };

  // Calculations
  const submittedStudents = students.filter(s => s.status === 'submitted' || s.status === 'forced_submitted');
  const scores = submittedStudents.map(s => s.total_score || 0);
  const avgScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2) : '0.00';
  const maxScore = scores.length > 0 ? Math.max(...scores).toFixed(1) : '0.0';
  const minScore = scores.length > 0 ? Math.min(...scores).toFixed(1) : '0.0';
  const passCount = scores.filter(sc => sc >= 5.0).length;
  const passRate = scores.length > 0 ? Math.round((passCount / scores.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Top Header & Session Selector */}
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Award className="w-5 h-5 text-emerald-400" /> Báo Cáo Điểm Thi Từng Ca
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Xem kết quả chi tiết, thống kê phổ điểm và xuất Excel cho từng ca thi
            </p>
          </div>
        </div>

        {/* Session Dropdown Switcher */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5">
            <span className="text-xs text-slate-400 font-semibold uppercase">Chọn Ca Thi:</span>
            <select
              value={selectedSessionId}
              onChange={e => handleSessionChange(e.target.value)}
              className="bg-slate-900 text-white font-bold text-xs focus:outline-none cursor-pointer"
            >
              {sessionsList.map(s => (
                <option key={s.id} value={s.id}>
                  [{s.session_code}] {s.title} ({s.status === 'finished' ? 'Đã kết thúc' : 'Đang mở'})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onOpenEssayGrading(selectedSessionId)}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition shadow flex items-center gap-1.5"
          >
            ✍️ Chấm Điểm Tự Luận
          </button>

          <button
            onClick={() => setIsBatchPrinting(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition shadow flex items-center gap-1.5"
            title="Xem và in toàn bộ bài thi của tất cả học sinh trong ca thi này"
          >
            <Printer className="w-4 h-4" /> In Toàn Bộ Bài Làm (Cả Ca)
          </button>

          <button
            onClick={handleDownloadExcel}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs transition shadow-lg flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> Xuất Bảng Điểm Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* Selected Session Quick Info Banner */}
      {session && (
        <div className="bg-slate-800/60 border border-slate-700/80 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 bg-sky-950 text-sky-400 border border-sky-800 rounded font-mono font-bold">
              MÃ CA: {session.session_code}
            </span>
            <span className="font-semibold text-white text-sm">{session.title}</span>
            <span className="text-slate-400">| Đề thi: <strong className="text-slate-200">{session.exam_title}</strong></span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1 text-amber-300">
              <Clock className="w-3.5 h-3.5" /> Thời gian ca: <strong>{session.duration_minutes || 45} phút</strong>
            </span>
            {session.status === 'finished' ? (
              <span className="flex items-center gap-1 text-slate-400 font-semibold bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                <Lock className="w-3 h-3 text-rose-400" /> Đã Kết Thúc Ca
              </span>
            ) : (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span> Đang Mở Thi
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Đã Nộp Bài</p>
          <p className="text-2xl font-black text-white mt-1">{submittedStudents.length} / {students.length}</p>
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Điểm Trung Bình</p>
          <p className="text-2xl font-black text-sky-400 mt-1">{avgScore}</p>
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Điểm Cao Nhất</p>
          <p className="text-2xl font-black text-emerald-400 mt-1">{maxScore}</p>
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Điểm Thấp Nhất</p>
          <p className="text-2xl font-black text-rose-400 mt-1">{minScore}</p>
        </div>
        <div className="bg-slate-800/90 border border-slate-700 rounded-xl p-4">
          <p className="text-xs text-slate-400 uppercase font-semibold">Tỷ Lệ Đạt (≥ 5.0)</p>
          <p className="text-2xl font-black text-indigo-400 mt-1">{passRate}%</p>
        </div>
      </div>

      {/* Main Results Table */}
      <div className="bg-slate-800/90 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-700 flex items-center justify-between">
          <h3 className="font-bold text-white text-base">
            Bảng Điểm Chi Tiết Ca Thi ({students.length} Thí Sinh)
          </h3>
        </div>

        {loading ? (
          <div className="p-12 text-center text-slate-400">Đang tải bảng điểm ca thi...</div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-10 h-10 mx-auto text-slate-600 mb-2" />
            <p>Chưa có thí sinh nào tham gia ca thi này.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900 text-xs text-slate-400 uppercase border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4">STT</th>
                  <th className="py-3 px-4">SBD</th>
                  <th className="py-3 px-4">Họ và Tên</th>
                  <th className="py-3 px-4">Lớp</th>
                  <th className="py-3 px-4">IP Máy</th>
                  <th className="py-3 px-4 text-center">Điểm Trắc Nghiệm</th>
                  <th className="py-3 px-4 text-center">Điểm Tự Luận</th>
                  <th className="py-3 px-4 text-center">Tổng Điểm</th>
                  <th className="py-3 px-4 text-center">Trạng Thái Chấm</th>
                  <th className="py-3 px-4 text-center">Số Lỗi Vi Phạm</th>
                  <th className="py-3 px-4">Thời Gian Nộp</th>
                  <th className="py-3 px-4 text-center">Bài Làm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {students.map((st, idx) => {
                  const isPassed = (st.total_score || 0) >= 5.0;
                  return (
                    <tr key={st.id} className="hover:bg-slate-750 transition">
                      <td className="py-3 px-4 text-slate-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-sky-400">{st.student_code}</td>
                      <td className="py-3 px-4 font-semibold text-white">{st.student_name}</td>
                      <td className="py-3 px-4 text-slate-400">{st.class_name || '-'}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-400">{st.client_ip || '-'}</td>
                      <td className="py-3 px-4 text-center font-bold text-sky-300">{st.mcq_score || 0}</td>
                      <td className="py-3 px-4 text-center font-bold text-amber-300">{st.essay_score || 0}</td>
                      <td className="py-3 px-4 text-center font-black text-base">
                        <span className={`px-2.5 py-1 rounded ${isPassed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-rose-950 text-rose-300 border border-rose-800'}`}>
                          {st.total_score || 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-xs">
                        {st.is_graded ? (
                          <span className="text-emerald-400 font-medium">✓ Đã hoàn tất</span>
                        ) : (
                          <span className="text-amber-400 font-medium">⏳ Chờ chấm tự luận</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(st.violations_count || 0) > 0 ? (
                          <span className="px-2 py-0.5 bg-rose-950 text-rose-400 border border-rose-800 rounded-full font-bold text-xs">
                            {st.violations_count} lỗi
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs">0</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400 font-mono">
                        {st.submitted_at ? new Date(st.submitted_at).toLocaleTimeString('vi-VN') : 'Chưa nộp'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => setViewingAttemptId(st.id)}
                          className="px-2.5 py-1.5 bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-800 rounded-lg text-xs font-semibold transition flex items-center gap-1 mx-auto"
                          title="Xem chi tiết bài làm, in ấn A4 hoặc tải file HTML"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem Bài Làm
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Student Exam Paper Modal (Single or Batch) */}
      {(viewingAttemptId || isBatchPrinting) && (
        <StudentPaperModal
          attemptId={viewingAttemptId}
          sessionId={selectedSessionId}
          isBatchMode={isBatchPrinting}
          onClose={() => {
            setViewingAttemptId(null);
            setIsBatchPrinting(false);
          }}
        />
      )}
    </div>
  );
}
