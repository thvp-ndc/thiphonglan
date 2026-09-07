import React, { useState, useEffect } from 'react';
import ExamManager from './ExamManager';
import LiveMonitor from './LiveMonitor';
import EssayGrading from './EssayGrading';
import ResultsExport from './ResultsExport';
import StudentManager from './StudentManager';
import { BookOpen, Laptop, FileEdit, Award, Wifi, Users, Globe, Copy, Check, Download, QrCode, X } from 'lucide-react';

export default function TeacherDashboard() {
  const [currentTab, setCurrentTab] = useState('exams'); // 'exams', 'students', 'monitor', 'grading', 'results'
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [serverInfo, setServerInfo] = useState({ serverIp: '...', port: 3000, primaryDomain: 'thionline.local' });
  const [showDomainModal, setShowDomainModal] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const studentDomainUrl = serverInfo.studentDomainUrl || `http://${serverInfo.primaryDomain || 'thionline.local'}:${serverInfo.port || 3000}/student`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(studentDomainUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 px-6 py-3 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg">
            NDC
          </div>
          <div>
            <h1 className="font-bold text-white text-base tracking-wide flex items-center gap-2">
              Hệ Thống Khảo Thí Mạng LAN <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-mono">Giáo Viên</span>
            </h1>
            <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
              <button
                onClick={() => setShowDomainModal(true)}
                className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-700/60 rounded-md font-mono transition"
                title="Bấm để xem hướng dẫn và tải lối tắt tên miền cho học sinh"
              >
                <Globe className="w-3.5 h-3.5 text-emerald-400" /> Tên miền: <strong>{serverInfo.primaryDomain || 'thionline.local'}</strong>
              </button>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-400">
                <Wifi className="w-3.5 h-3.5" /> IP: <strong>{serverInfo.serverIp}:{serverInfo.port}</strong>
              </span>
            </div>
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDomainModal(true)}
            className="text-xs px-3 py-1.5 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded-lg border border-emerald-700/60 transition flex items-center gap-1.5 font-medium"
          >
            <Globe className="w-3.5 h-3.5" /> Tên Miền Thi
          </button>
          <a
            href="/student"
            target="_blank"
            rel="noreferrer"
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
          >
            Mở Màn Hình Thí Sinh ↗
          </a>
        </div>
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

      {/* Modal Tên Miền & Lối Tắt Phòng Thi */}
      {showDomainModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowDomainModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-emerald-950 text-emerald-400 rounded-xl border border-emerald-800">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Tên Miền Đăng Nhập Học Sinh</h3>
                <p className="text-xs text-slate-400">Tự động gắn IP máy giáo viên trong toàn mạng LAN</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Đường dẫn học sinh gõ trên trình duyệt:
                </label>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    readOnly
                    value={studentDomainUrl}
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold text-sm focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Đã chép' : 'Sao chép'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  💡 Học sinh có thể gõ ngắn gọn: <strong className="text-white font-mono">{serverInfo.primaryDomain || 'thionline.local'}:{serverInfo.port || 3000}</strong> hoặc <strong className="text-white font-mono">{serverInfo.primaryDomain || 'thionline.local'}</strong>
                </p>
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
                <h4 className="text-xs font-bold text-slate-300 uppercase mb-2">
                  Tải file Lối Tắt cài sẵn cho máy học sinh (1-Click):
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  <a
                    href="/api/system/download-launcher"
                    download="ThiOnline.html"
                    className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition flex items-center gap-2.5 group"
                  >
                    <Download className="w-4 h-4 text-sky-400 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-white">File ThiOnline.html</div>
                      <div className="text-[10px] text-slate-400">Tự động dò IP & mở thi</div>
                    </div>
                  </a>

                  <a
                    href="/api/system/download-bat"
                    download="CaiDatPhongMay.bat"
                    className="p-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-left transition flex items-center gap-2.5 group"
                  >
                    <Download className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition" />
                    <div>
                      <div className="text-xs font-bold text-white">File Cài Đặt Desktop .bat</div>
                      <div className="text-[10px] text-slate-400">Tạo icon Desktop máy con</div>
                    </div>
                  </a>
                </div>
              </div>

              <div className="text-center pt-2">
                <button
                  onClick={() => setShowDomainModal(false)}
                  className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition"
                >
                  Đóng Cửa Sổ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

