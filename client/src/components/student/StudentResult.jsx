import React from 'react';
import { CheckCircle2, Award, FileEdit, AlertTriangle, LogOut } from 'lucide-react';

export default function StudentResult({ result, onRestart }) {
  const isFullyGraded = result.is_graded === 1;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 select-none">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-6">
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full mx-auto flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-2xl font-black text-white">Nộp Bài Thi Thành Công!</h2>
          <p className="text-slate-400 text-sm mt-1">Bài làm của bạn đã được ghi nhận an toàn vào máy chủ phòng máy.</p>
        </div>

        {/* Score Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-semibold">Điểm Trắc Nghiệm</span>
            <p className="text-2xl font-black text-sky-400 mt-1">{result.mcq_score} đ</p>
            <span className="text-[10px] text-emerald-400">Máy tự động chấm</span>
          </div>

          <div className="bg-slate-950 border border-slate-800 p-4 rounded-2xl">
            <span className="text-xs text-slate-400 uppercase font-semibold">Điểm Tự Luận</span>
            <p className="text-2xl font-black text-amber-400 mt-1">
              {isFullyGraded ? `${result.essay_score} đ` : 'Chờ Chấm'}
            </p>
            <span className="text-[10px] text-slate-400">
              {isFullyGraded ? 'Đã chấm xong' : 'Giáo viên đang chấm'}
            </span>
          </div>
        </div>

        {/* Total Score Banner if fully graded or preview */}
        <div className="bg-gradient-to-r from-sky-950/60 to-indigo-950/60 border border-sky-800/60 rounded-2xl p-4 text-center">
          <span className="text-xs text-slate-300 font-semibold uppercase">Tổng Điểm Hiện Tại</span>
          <p className="text-3xl font-black text-white mt-1">{result.total_score} <span className="text-sm font-normal text-slate-400">/ 10</span></p>
          {!isFullyGraded && (
            <p className="text-xs text-amber-300/90 mt-1">
              * Điểm tổng kết cuối cùng sẽ được cập nhật sau khi giáo viên hoàn thành chấm bài tự luận.
            </p>
          )}
        </div>

        <button
          onClick={onRestart}
          className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition"
        >
          Trở Về Màn Hình Đăng Nhập
        </button>
      </div>
    </div>
  );
}
