import React, { useState, useEffect } from 'react';
import ExamManager from './ExamManager';
import LiveMonitor from './LiveMonitor';
import EssayGrading from './EssayGrading';
import ResultsExport from './ResultsExport';
import StudentManager from './StudentManager';
import { BookOpen, Laptop, FileEdit, Award, Wifi, Users } from 'lucide-react';

export default function TeacherDashboard() {
  const [currentTab, setCurrentTab] = useState('exams'); // 'exams', 'students', 'monitor', 'grading', 'results'
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [serverInfo, setServerInfo] = useState({ serverIp: '...', port: 3000 });

  useEffect(() => {
    fetch('/api/system/info')
      .then(r => r.json())
      .then(data => {
        if (data.success) setServerInfo(data);
      })
      .catch(console.error);
  }, []);

  const handleSelectSessionForMonitor = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('monitor');
  };

  const handleOpenEssayGrading = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('grading');
  };

  const handleOpenResults = (sessionId) => {
    setActiveSessionId(sessionId);
    setCurrentTab('results');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
            LAN
          </div>
          <div>
            <h1 className="font-bold text-white text-base tracking-wide flex items-center gap-2">
              Hệ Thống Thi Máy Tính Mạng LAN <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-mono">Giáo Viên</span>
            </h1>
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <Wifi className="w-3.5 h-3.5" /> Máy Chủ: <strong>{serverInfo.serverIp}:{serverInfo.port}</strong>
              </span>
              <span>•</span>
              <span>Cơ sở dữ liệu: SQLite WAL</span>
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700 text-xs font-medium">
          <button
            onClick={() => setCurrentTab('exams')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              currentTab === 'exams' ? 'bg-sky-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <BookOpen className="w-4 h-4" /> Quản Lý Đề & Ca Thi
          </button>
          <button
            onClick={() => setCurrentTab('students')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              currentTab === 'students' ? 'bg-sky-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Danh Sách Học Sinh
          </button>
          <button
            onClick={() => {
              if (!activeSessionId) return alert('Vui lòng chọn một ca thi từ danh sách ca thi!');
              setCurrentTab('monitor');
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              currentTab === 'monitor' ? 'bg-sky-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-4 h-4" /> Giám Sát Phòng Thi
          </button>
          <button
            onClick={() => {
              if (!activeSessionId) return alert('Vui lòng chọn một ca thi từ danh sách ca thi!');
              setCurrentTab('grading');
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              currentTab === 'grading' ? 'bg-sky-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileEdit className="w-4 h-4" /> Chấm Bài Tự Luận
          </button>
          <button
            onClick={() => setCurrentTab('results')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition ${
              currentTab === 'results' ? 'bg-sky-600 text-white font-semibold shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" /> Báo Cáo Điểm & Excel
          </button>
        </div>

        <a
          href="/student"
          target="_blank"
          rel="noreferrer"
          className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
        >
          Mở Màn Hình Thí Sinh ↗
        </a>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {currentTab === 'exams' && (
          <ExamManager
            onSelectSessionForMonitor={handleSelectSessionForMonitor}
            onSelectSessionForResults={handleOpenResults}
          />
        )}
        {currentTab === 'students' && (
          <StudentManager />
        )}
        {currentTab === 'monitor' && activeSessionId && (
          <LiveMonitor
            sessionId={activeSessionId}
            onBack={() => setCurrentTab('exams')}
            onOpenEssayGrading={handleOpenEssayGrading}
            onOpenResults={handleOpenResults}
          />
        )}
        {currentTab === 'grading' && activeSessionId && (
          <EssayGrading
            sessionId={activeSessionId}
            onBack={() => setCurrentTab('monitor')}
            onOpenResults={handleOpenResults}
          />
        )}
        {currentTab === 'results' && (
          <ResultsExport
            sessionId={activeSessionId}
            onSelectSession={(id) => setActiveSessionId(id)}
            onBack={() => setCurrentTab('exams')}
            onOpenEssayGrading={handleOpenEssayGrading}
          />
        )}
      </main>
    </div>
  );
}
