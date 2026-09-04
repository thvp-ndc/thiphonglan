import React, { useState, useEffect } from 'react';
import { Laptop, ShieldCheck, UserCheck, KeyRound, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function StudentLogin({ onLoginSuccess }) {
  const [sessionCode, setSessionCode] = useState('PHONG-01');
  const [studentCode, setStudentCode] = useState('');
  const [studentName, setStudentName] = useState('');
  const [className, setClassName] = useState('');
  const [isAutoIdentified, setIsAutoIdentified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-lookup student details when SBD is typed
  useEffect(() => {
    const code = studentCode.trim().toUpperCase();
    if (!code || code.length < 3) {
      setIsAutoIdentified(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/students/lookup/${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.success && data.found && data.student) {
          setStudentName(data.student.student_name);
          setClassName(data.student.class_name || '');
          setIsAutoIdentified(true);
        } else {
          setIsAutoIdentified(false);
        }
      } catch (e) {}
    }, 400);

    return () => clearTimeout(timer);
  }, [studentCode]);

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
    } catch (err) {
      console.warn('Fullscreen request bypassed:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!sessionCode || !studentCode || !studentName) {
      setError('Vui lòng điền đầy đủ Mã ca thi, Số báo danh và Họ tên.');
      return;
    }

    // Trigger fullscreen directly on user click gesture
    await requestBrowserFullscreen();

    try {
      setLoading(true);
      setError('');
      const res = await fetch('/api/student/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionCode: sessionCode.trim(),
          studentCode: studentCode.trim().toUpperCase(),
          studentName: studentName.trim(),
          className: className.trim()
        })
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Không thể đăng nhập vào ca thi.');
        return;
      }

      // Reinforce fullscreen
      await requestBrowserFullscreen();
      onLoginSuccess(data);
    } catch (err) {
      setError('Không thể kết nối đến máy chủ mạng LAN: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 select-none">
      {/* Background ambient glow */}
      <div className="absolute w-96 h-96 bg-sky-600/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none"></div>
      <div className="absolute w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none"></div>

      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl relative z-10">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-sky-500/20 mb-3">
            <Laptop className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-wide">Cổng Thi Trực Tuyến</h1>
          <p className="text-slate-400 text-xs mt-1">Hệ Thống Khảo Thí Mạng Cục Bộ LAN</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/50 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Mã Ca Thi (Phòng Thi)</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={sessionCode}
                onChange={e => setSessionCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: PHONG-01"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-white font-mono font-bold uppercase focus:border-sky-500 focus:outline-none text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Số Báo Danh (SBD)</label>
            <div className="relative">
              <UserCheck className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="text"
                value={studentCode}
                onChange={e => setStudentCode(e.target.value.toUpperCase())}
                placeholder="Ví dụ: SBD001"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 pl-10 pr-3 text-white font-mono font-bold uppercase focus:border-sky-500 focus:outline-none text-sm"
                required
              />
            </div>
            {isAutoIdentified && (
              <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã nhận diện học sinh trong danh sách lớp!
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Họ Và Tên Thí Sinh</label>
            <input
              type="text"
              value={studentName}
              onChange={e => setStudentName(e.target.value)}
              placeholder="Nguyễn Văn A"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white focus:border-sky-500 focus:outline-none text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Lớp / Đơn Vị</label>
            <input
              type="text"
              value={className}
              onChange={e => setClassName(e.target.value)}
              placeholder="Ví dụ: 10A1"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl py-2.5 px-3 text-white focus:border-sky-500 focus:outline-none text-sm"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition shadow-lg shadow-sky-600/30 flex items-center justify-center gap-2"
            >
              {loading ? 'Đang xác thực...' : 'Vào Phòng Thi & Làm Bài'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-6 pt-6 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Chế độ Kiosk bảo mật cao
          </span>
          <span>Khóa Alt+Tab & Win Key</span>
        </div>
      </div>
    </div>
  );
}
