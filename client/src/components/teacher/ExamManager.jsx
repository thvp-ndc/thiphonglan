import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, FileText, CheckCircle2, BookOpen, Clock, Shuffle, HelpCircle, Edit2, Play, Lock, Upload, FileUp, AlertCircle, Users, Download, Image as ImageIcon, Sigma, Eye } from 'lucide-react';
import SessionStudentsModal from './SessionStudentsModal';
import MathToolbarModal from '../common/MathToolbarModal';
import MathContent from '../common/MathContent';

export default function ExamManager({ onSelectSessionForMonitor, onSelectSessionForResults }) {
  const [exams, setExams] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importingWord, setImportingWord] = useState(false);

  // Exam Modal State (Create or Edit)
  const [showExamModal, setShowExamModal] = useState(false);
  const [editingExamId, setEditingExamId] = useState(null);
  const [examForm, setExamForm] = useState({
    title: '',
    subject: '',
    total_score: 10.0,
    shuffle_questions: 1,
    shuffle_options: 1,
    questions: []
  });
  const [autoSyncScore, setAutoSyncScore] = useState(true);

  // Math & Image Editing State
  const [mathModalTarget, setMathModalTarget] = useState(null); // { qIndex, type: 'content'|'option'|'rubric', optId?: string }
  const [imageTarget, setImageTarget] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageFileInputRef = useRef(null);

  const insertTextToTarget = (target, textToInsert) => {
    if (!target) return;
    const { qIndex, type, optId } = target;
    if (type === 'content') {
      const prev = examForm.questions[qIndex]?.content || '';
      updateQuestion(qIndex, 'content', prev + (prev ? ' ' : '') + textToInsert);
    } else if (type === 'rubric') {
      const prev = examForm.questions[qIndex]?.rubric_guide || '';
      updateQuestion(qIndex, 'rubric_guide', prev + (prev ? ' ' : '') + textToInsert);
    } else if (type === 'option') {
      const q = examForm.questions[qIndex];
      if (q) {
        const opt = (q.options || []).find(o => o.id.toLowerCase() === optId.toLowerCase());
        const prev = opt?.text || '';
        updateOptionText(qIndex, optId, prev + (prev ? ' ' : '') + textToInsert);
      }
    }
  };

  const handleInsertMath = (latex) => {
    if (!mathModalTarget) return;
    insertTextToTarget(mathModalTarget, latex);
  };

  const handleUploadImageBlob = async (blob, target) => {
    if (!blob || !target) return;
    try {
      setUploadingImage(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result;
          const res = await fetch('/api/upload-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageBase64: base64 })
          });
          const data = await res.json();
          if (data.success) {
            const imgMarkdown = `\n![Hình ảnh](${data.url})\n`;
            insertTextToTarget(target, imgMarkdown);
          } else {
            alert('Lỗi lưu hình ảnh: ' + data.message);
          }
        } catch (err) {
          alert('Lỗi tải ảnh lên máy chủ: ' + err.message);
        } finally {
          setUploadingImage(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (e) {
      setUploadingImage(false);
      alert('Lỗi đọc tệp ảnh: ' + e.message);
    }
  };

  const handlePasteInField = (e, target) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          handleUploadImageBlob(file, target);
          return;
        }
      }
    }
  };

  const handlePickImageForTarget = (target) => {
    setImageTarget(target);
    if (imageFileInputRef.current) {
      imageFileInputRef.current.value = '';
      imageFileInputRef.current.click();
    }
  };

  const handleFilePicked = (e) => {
    const file = e.target.files?.[0];
    if (file && imageTarget) {
      handleUploadImageBlob(file, imageTarget);
    }
  };

  // Session Modal State (Create or Edit)
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [sessionForm, setSessionForm] = useState({
    exam_id: '',
    session_code: '',
    title: '',
    duration_minutes: 45,
    status: 'waiting'
  });
  const [selectedSessionForStudents, setSelectedSessionForStudents] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resExams, resSessions] = await Promise.all([
        fetch('/api/exams').then(r => r.json()),
        fetch('/api/sessions').then(r => r.json())
      ]);
      if (resExams.success) setExams(resExams.exams);
      if (resSessions.success) setSessions(resSessions.sessions);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- EXAM ACTIONS ---
  const handleOpenCreateExam = () => {
    setEditingExamId(null);
    setExamForm({
      title: '',
      subject: '',
      total_score: 10.0,
      shuffle_questions: 1,
      shuffle_options: 1,
      questions: []
    });
    setShowExamModal(true);
  };

  const handleOpenEditExam = async (examId) => {
    try {
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();
      if (data.success) {
        setEditingExamId(examId);
        const normalizedQuestions = (data.exam.questions || []).map(q => {
          if (q.question_type === 'true_false') {
            let ca = q.correct_answers;
            if (Array.isArray(ca)) {
              const map = { a: 'F', b: 'F', c: 'F', d: 'F' };
              ca.forEach(item => {
                if (typeof item === 'string' && item.includes(':')) {
                  const [k, v] = item.split(':');
                  map[k.trim().toLowerCase()] = v.trim().toUpperCase() === 'T' ? 'T' : 'F';
                } else if (typeof item === 'string') {
                  map[item.toLowerCase()] = 'T';
                }
              });
              ca = map;
            } else if (!ca || typeof ca !== 'object') {
              ca = { a: 'T', b: 'F', c: 'T', d: 'F' };
            }
            return { ...q, correct_answers: ca };
          }
          return q;
        });
        setExamForm({
          title: data.exam.title,
          subject: data.exam.subject || '',
          total_score: data.exam.total_score || 10.0,
          shuffle_questions: data.exam.shuffle_questions,
          shuffle_options: data.exam.shuffle_options,
          questions: normalizedQuestions
        });
        setShowExamModal(true);
      }
    } catch (err) {
      alert('Không thể tải chi tiết đề thi: ' + err.message);
    }
  };

  const addQuestion = (type) => {
    const qIndex = examForm.questions.length + 1;
    let template = {
      order_index: qIndex,
      question_type: type,
      content: '',
      max_score: type === 'essay' ? 2.5 : 1.0,
      options: [],
      correct_answers: [],
      rubric_guide: ''
    };

    if (type === 'single_choice' || type === 'multiple_choice') {
      template.options = [
        { id: 'A', text: '' },
        { id: 'B', text: '' },
        { id: 'C', text: '' },
        { id: 'D', text: '' }
      ];
      template.correct_answers = ['A'];
    } else if (type === 'true_false') {
      template.options = [
        { id: 'a', text: '' },
        { id: 'b', text: '' },
        { id: 'c', text: '' },
        { id: 'd', text: '' }
      ];
      template.correct_answers = { a: 'T', b: 'F', c: 'T', d: 'F' };
      template.max_score = 1.0;
    } else if (type === 'essay') {
      template.rubric_guide = 'Barem điểm chi tiết:\n- Ý 1 (1.0đ): ...\n- Ý 2 (1.0đ): ...\n- Trình bày (0.5đ): ...';
    }

    const updatedQuestions = [...examForm.questions, template];
    const newTotal = autoSyncScore
      ? Math.round(updatedQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updatedQuestions,
      total_score: newTotal
    }));
  };

  const updateQuestion = (index, field, value) => {
    const updated = [...examForm.questions];
    updated[index] = { ...updated[index], [field]: value };

    const newTotal = (field === 'max_score' && autoSyncScore)
      ? Math.round(updated.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: newTotal
    }));
  };

  const updateOptionText = (qIndex, optId, text) => {
    const updated = [...examForm.questions];
    const q = updated[qIndex];
    if (q.question_type === 'true_false') {
      let options = q.options || [];
      const found = options.some(o => o.id.toLowerCase() === optId.toLowerCase());
      if (!found) {
        options.push({ id: optId.toLowerCase(), text });
      } else {
        options = options.map(o => o.id.toLowerCase() === optId.toLowerCase() ? { ...o, text } : o);
      }
      q.options = options;
    } else {
      q.options = (q.options || []).map(o => o.id === optId ? { ...o, text } : o);
    }
    setExamForm(prev => ({ ...prev, questions: updated }));
  };

  const updateTrueFalseAnswer = (qIndex, subId, value) => {
    const updated = [...examForm.questions];
    const q = updated[qIndex];
    let prev = {};
    if (q.correct_answers && typeof q.correct_answers === 'object' && !Array.isArray(q.correct_answers)) {
      prev = { ...q.correct_answers };
    } else if (Array.isArray(q.correct_answers)) {
      prev = { a: 'F', b: 'F', c: 'F', d: 'F' };
      q.correct_answers.forEach(item => {
        if (typeof item === 'string' && item.includes(':')) {
          const [k, v] = item.split(':');
          prev[k.trim().toLowerCase()] = v.trim().toUpperCase() === 'T' ? 'T' : 'F';
        } else if (typeof item === 'string') {
          prev[item.toLowerCase()] = 'T';
        }
      });
    } else {
      prev = { a: 'F', b: 'F', c: 'F', d: 'F' };
    }
    prev[subId.toLowerCase()] = value;
    q.correct_answers = prev;
    setExamForm(prevForm => ({ ...prevForm, questions: updated }));
  };

  const toggleCorrectAnswer = (qIndex, optId) => {
    const q = examForm.questions[qIndex];
    let newCorrect = [];
    if (q.question_type === 'single_choice') {
      newCorrect = [optId];
    } else {
      if (q.correct_answers.includes(optId)) {
        newCorrect = q.correct_answers.filter(id => id !== optId);
      } else {
        newCorrect = [...q.correct_answers, optId];
      }
    }
    updateQuestion(qIndex, 'correct_answers', newCorrect);
  };

  const removeQuestion = (index) => {
    const updated = examForm.questions.filter((_, i) => i !== index);
    const newTotal = autoSyncScore
      ? Math.round(updated.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100
      : examForm.total_score;

    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: newTotal
    }));
  };

  const handleAutoSumTotalScore = () => {
    const sum = Math.round((examForm.questions || []).reduce((acc, q) => acc + (parseFloat(q.max_score) || 0), 0) * 100) / 100;
    setExamForm(prev => ({ ...prev, total_score: sum }));
  };

  const handleDistributeScoreEvenly = (targetTotal = 10.0) => {
    if (!examForm.questions || examForm.questions.length === 0) {
      return alert('Chưa có câu hỏi nào để chia điểm!');
    }
    const count = examForm.questions.length;
    const perQ = Math.round((targetTotal / count) * 100) / 100;
    const updated = examForm.questions.map((q, idx) => {
      if (idx === count - 1) {
        const remaining = Math.round((targetTotal - perQ * (count - 1)) * 100) / 100;
        return { ...q, max_score: remaining };
      }
      return { ...q, max_score: perQ };
    });
    setExamForm(prev => ({
      ...prev,
      questions: updated,
      total_score: targetTotal
    }));
  };

  const handleSaveExam = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!examForm.title) return alert('Vui lòng nhập tiêu đề bài kiểm tra!');
    if (examForm.questions.length === 0) return alert('Vui lòng thêm ít nhất một câu hỏi!');

    try {
      const url = editingExamId ? `/api/exams/${editingExamId}` : '/api/exams';
      const method = editingExamId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examForm)
      });
      const data = await res.json();
      if (data.success) {
        const savedExamId = editingExamId || (data.exam && data.exam.id);
        fetchData();
        const wantExport = confirm(
          `${editingExamId ? 'Đã cập nhật đề thi thành công!' : 'Đã tạo đề thi mới thành công!'}\n\n` +
          `Bạn có muốn XUẤT ĐỀ THI ra file Word (.docx) kèm đáp án và barem chấm ngay bây giờ không?`
        );
        if (wantExport && savedExamId) {
          window.open(`/api/exams/${savedExamId}/export-word`, '_blank');
        }
        setShowExamModal(false);
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể lưu đề thi: ' + err.message);
    }
  };

  const handleDeleteExam = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa đề thi này? (Các ca thi dùng đề này cũng sẽ bị ảnh hưởng)')) return;
    try {
      const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleWordFileUpload = async (e, isInsideModal = false) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setImportingWord(true);
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const res = await fetch('/api/exams/import-word', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64 })
        });
        const data = await res.json();
        if (data.success) {
          const importedQuestions = data.questions || [];
          let shouldReplace = true;
          if (isInsideModal && examForm.questions.length > 0) {
            shouldReplace = confirm(
              `Đã nhận diện thành công ${importedQuestions.length} câu hỏi từ file "${file.name}".\n\n` +
              `• Bấm OK để GHI ĐÈ toàn bộ câu hỏi hiện tại trong đề.\n` +
              `• Bấm Cancel để THÊM NỐI TIẾP vào danh sách câu hỏi đang có.`
            );
          }

          let finalQuestions = importedQuestions;
          if (!shouldReplace) {
            const startOrder = examForm.questions.length + 1;
            const renumbered = importedQuestions.map((q, idx) => ({
              ...q,
              order_index: startOrder + idx
            }));
            finalQuestions = [...examForm.questions, ...renumbered];
          }

          const computedTotal = Math.round(finalQuestions.reduce((sum, q) => sum + (parseFloat(q.max_score) || 0), 0) * 100) / 100;
          setExamForm(prev => ({
            ...prev,
            title: (!isInsideModal || !prev.title) ? (data.title || file.name.replace(/\.[^/.]+$/, '')) : prev.title,
            total_score: computedTotal > 0 ? computedTotal : 10.0,
            questions: finalQuestions
          }));
          setShowExamModal(true);
          alert(`Đã nhận diện thành công ${importedQuestions.length} câu hỏi từ file Word! Tổng số câu hiện tại: ${finalQuestions.length}. Tổng điểm: ${computedTotal > 0 ? computedTotal : 10.0}đ.`);
        } else {
          alert('Lỗi phân tích file Word: ' + data.message);
        }
        setImportingWord(false);
        e.target.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert('Không thể đọc file Word: ' + err.message);
      setImportingWord(false);
      e.target.value = '';
    }
  };

  // --- SESSION ACTIONS ---
  const handleOpenCreateSession = (preExamId = null) => {
    setEditingSessionId(null);
    setSessionForm({
      exam_id: preExamId || (exams.length > 0 ? exams[0].id : ''),
      session_code: `PHONG-${Math.floor(100 + Math.random()*900)}`,
      title: 'Ca Thi Phòng Máy',
      duration_minutes: 45,
      status: 'waiting'
    });
    setShowSessionModal(true);
  };

  const handleOpenEditSession = (s) => {
    setEditingSessionId(s.id);
    setSessionForm({
      exam_id: s.exam_id,
      session_code: s.session_code,
      title: s.title,
      duration_minutes: s.duration_minutes || 45,
      status: s.status || 'in_progress'
    });
    setShowSessionModal(true);
  };

  const handleSaveSession = async (e) => {
    e.preventDefault();
    if (!sessionForm.session_code || !sessionForm.title) return alert('Vui lòng điền đủ thông tin ca thi!');

    try {
      const url = editingSessionId ? `/api/sessions/${editingSessionId}` : '/api/sessions';
      const method = editingSessionId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionForm)
      });
      const data = await res.json();
      if (data.success) {
        alert(editingSessionId ? 'Đã cập nhật ca thi!' : 'Kích hoạt ca thi mới thành công!');
        setShowSessionModal(false);
        fetchData();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  };

  const handleDeleteSession = async (sessionId, sessionCode) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa ca thi [${sessionCode}]? (Dữ liệu bài làm trong ca này sẽ bị xóa)`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleFinishSessionDirect = async (sessionId, sessionCode) => {
    if (!confirm(`Bạn có chắc chắn muốn KẾT THÚC CA THI [${sessionCode}]?\n\nHệ thống sẽ thu bài của toàn bộ thí sinh và chuyển trạng thái ca thi sang Đã kết thúc.`)) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/finish`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchData();
      }
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-sky-400" /> Quản Lý Đề Thi & Ca Thi Mạng LAN
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Đề thi là ngân hàng câu hỏi dùng chung. Thời gian làm bài được cấu hình linh hoạt theo từng Ca thi.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => handleOpenCreateSession()}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition shadow-md"
          >
            <Clock className="w-4 h-4" /> Mở Ca Thi Mới
          </button>
          <button
            onClick={handleOpenCreateExam}
            className="flex items-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs transition shadow-md"
          >
            <Plus className="w-4 h-4" /> Soạn Đề Thi Mới
          </button>
        </div>
      </div>

      {/* Ca Thi Đang Hoạt Động (Sessions) */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-emerald-400" /> Danh Sách Ca Thi Hiện Có ({sessions.length})
        </h3>
        {sessions.length === 0 ? (
          <p className="text-slate-400 text-sm italic">Chưa có ca thi nào được mở. Hãy nhấn "Mở Ca Thi Mới".</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sessions.map(s => (
              <div key={s.id} className="bg-slate-900/90 border border-slate-700 rounded-xl p-5 flex flex-col justify-between hover:border-sky-500 transition shadow-md">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 bg-sky-950 text-sky-400 border border-sky-800 rounded font-mono font-bold text-sm">
                      MÃ: {s.session_code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {s.status === 'finished' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                          <Lock className="w-3 h-3" /> Đã kết thúc
                        </span>
                      ) : s.status === 'waiting' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-950 text-amber-400 border border-amber-800">
                          <Clock className="w-3 h-3 text-amber-400 animate-spin" /> Chờ bắt đầu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Đang mở
                        </span>
                      )}
                    </div>
                  </div>

                  <h4 className="font-semibold text-white mt-3 text-base line-clamp-1">{s.title}</h4>
                  <p className="text-xs text-slate-400 mt-1 line-clamp-1">Đề: <strong className="text-slate-200">{s.exam_title}</strong></p>
                  
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                    <span className="font-bold text-amber-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Thời gian: {s.duration_minutes || 45} phút
                    </span>
                    <span>
                      Nộp bài: <strong className="text-white">{s.student_count || 0}</strong>
                      {s.assigned_student_count > 0 && (
                        <span className="text-sky-300 ml-1.5">
                          (DS: <strong>{s.assigned_student_count}</strong>)
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-1.5">
                  <button
                    onClick={() => onSelectSessionForMonitor(s.id)}
                    className="flex-1 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition text-center flex items-center justify-center gap-1 min-w-[80px]"
                  >
                    <Play className="w-3.5 h-3.5" /> Giám Sát
                  </button>
                  <button
                    onClick={() => setSelectedSessionForStudents(s)}
                    className="py-1.5 px-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                    title="Quản lý danh sách học sinh được phép vào ca thi này"
                  >
                    <Users className="w-3.5 h-3.5" /> Thí Sinh {s.assigned_student_count > 0 ? `(${s.assigned_student_count})` : ''}
                  </button>
                  <button
                    onClick={() => onSelectSessionForResults(s.id)}
                    className="py-1.5 px-2.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1"
                    title="Xem báo cáo điểm ca thi này"
                  >
                    📊 Bảng Điểm
                  </button>
                  {s.status !== 'finished' && (
                    <button
                      onClick={() => handleFinishSessionDirect(s.id, s.session_code)}
                      className="py-1.5 px-2 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg text-xs font-semibold transition flex items-center gap-1"
                      title="Kết thúc ca thi và thu bài toàn bộ"
                    >
                      <Lock className="w-3.5 h-3.5" /> Khóa Ca
                    </button>
                  )}
                  <button
                    onClick={() => handleOpenEditSession(s)}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition"
                    title="Sửa thông tin ca thi"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteSession(s.id, s.session_code)}
                    className="p-1.5 bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded-lg transition"
                    title="Xóa ca thi"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ngân Hàng Đề Thi (Exams) */}
      <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-6">
        <h3 className="text-lg font-bold text-slate-100 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-sky-400" /> Ngân Hàng Đề Thi Đã Soạn ({exams.length})
        </h3>
        {loading ? (
          <p className="text-slate-400 text-sm">Đang tải danh sách đề thi...</p>
        ) : exams.length === 0 ? (
          <p className="text-slate-400 text-sm italic">Chưa có đề thi nào. Hãy bấm "Soạn Đề Thi Mới".</p>
        ) : (
          <div className="divide-y divide-slate-700">
            {exams.map(exam => (
              <div key={exam.id} className="py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-750/30 px-2 rounded-lg transition">
                <div>
                  <div className="flex items-center gap-3">
                    <h4 className="font-semibold text-white text-lg">{exam.title}</h4>
                    <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs">
                      {exam.subject || 'Chung'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 mt-2">
                    <span>📝 Tổng: <strong>{exam.total_questions}</strong> câu</span>
                    <span className="text-sky-400">🔹 Trắc nghiệm: <strong>{exam.mcq_count}</strong> câu</span>
                    {exam.tf_count > 0 && (
                      <span className="text-teal-400">⚖️ Đúng/Sai: <strong>{exam.tf_count}</strong> câu</span>
                    )}
                    <span className="text-amber-400">✍️ Tự luận: <strong>{exam.essay_count}</strong> câu</span>
                    <span>🏆 Thang điểm: {exam.total_score}đ</span>
                    {exam.shuffle_questions === 1 && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <Shuffle className="w-3.5 h-3.5" /> Trộn câu hỏi
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.open(`/api/exams/${exam.id}/export-word`, '_blank')}
                    className="px-3 py-1.5 bg-blue-700/80 hover:bg-blue-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow"
                    title="Xuất đề thi và đáp án chi tiết ra file Word (.docx)"
                  >
                    <Download className="w-3.5 h-3.5" /> Xuất Đề Word
                  </button>
                  <button
                    onClick={() => handleOpenCreateSession(exam.id)}
                    className="px-3 py-1.5 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Mở Ca Với Đề Này
                  </button>
                  <button
                    onClick={() => handleOpenEditExam(exam.id)}
                    className="p-1.5 hover:bg-sky-950 text-slate-300 hover:text-sky-400 rounded-lg transition border border-slate-700"
                    title="Chỉnh sửa nội dung đề thi"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteExam(exam.id)}
                    className="p-1.5 hover:bg-rose-900/50 text-slate-400 hover:text-rose-400 rounded-lg transition border border-slate-700"
                    title="Xóa đề thi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Mở / Sửa Ca Thi (Với Thời Gian Làm Bài) */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-emerald-400" />
              {editingSessionId ? 'Chỉnh Sửa Ca Thi' : 'Mở Ca Thi Phòng Máy Mới'}
            </h3>
            <form onSubmit={handleSaveSession} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Chọn Đề Thi:</label>
                <select
                  value={sessionForm.exam_id}
                  onChange={e => setSessionForm({ ...sessionForm, exam_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                  required
                >
                  <option value="">-- Chọn đề thi --</option>
                  {exams.map(e => (
                    <option key={e.id} value={e.id}>{e.title} ({e.total_questions} câu)</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Mã Ca Thi (Học sinh nhập):</label>
                  <input
                    type="text"
                    value={sessionForm.session_code}
                    onChange={e => setSessionForm({ ...sessionForm, session_code: e.target.value.toUpperCase() })}
                    placeholder="PHONG-01"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white uppercase font-mono font-bold text-sm"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-amber-400 uppercase mb-1">Thời Gian Thi (Phút):</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={sessionForm.duration_minutes}
                    onChange={e => setSessionForm({ ...sessionForm, duration_minutes: Number(e.target.value) })}
                    placeholder="45"
                    className="w-full bg-slate-900 border border-amber-500/50 rounded-xl p-2.5 text-amber-300 font-mono font-bold text-sm"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Tên Ca Thi / Lớp Thi:</label>
                <input
                  type="text"
                  value={sessionForm.title}
                  onChange={e => setSessionForm({ ...sessionForm, title: e.target.value })}
                  placeholder="Ví dụ: Kiểm tra 1 tiết - Lớp 10A1"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Trạng Thái Ca Thi:</label>
                <select
                  value={sessionForm.status}
                  onChange={e => setSessionForm({ ...sessionForm, status: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl p-2.5 text-white text-sm"
                >
                  <option value="waiting">🟡 Phòng Chờ (Chờ giáo viên bấm Bắt Đầu mới mở đề)</option>
                  <option value="in_progress">🟢 Cho Thi Ngay (Học sinh đăng nhập là làm bài luôn)</option>
                  {editingSessionId && <option value="finished">🔴 Đã Kết Thúc (Khóa ca thi)</option>}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowSessionModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow"
                >
                  {editingSessionId ? 'Lưu Thay Đổi' : 'Kích Hoạt Ca Thi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Soạn & Sửa Đề Thi */}
      {showExamModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* CỐ ĐỊNH PHẦN TIÊU ĐỀ (PINNED TOP HEADER) */}
            <div className="flex flex-wrap items-center justify-between p-4 sm:px-6 border-b border-slate-800 bg-slate-900 shrink-0 gap-3 z-30">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-sky-400" />
                  {editingExamId ? 'Chỉnh Sửa Đề Thi' : 'Soạn Đề Thi Mới'}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
                  <span className="font-semibold text-slate-200">{examForm.title || '(Chưa đặt tên)'}</span>
                  {examForm.subject && <span>• {examForm.subject}</span>}
                  <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono font-bold">
                    {examForm.questions.length} câu hỏi
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold">
                    {examForm.total_score} điểm
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {editingExamId && (
                  <button
                    type="button"
                    onClick={() => window.open(`/api/exams/${editingExamId}/export-word`, '_blank')}
                    className="px-3 py-2 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-xs shadow flex items-center gap-1.5 transition"
                    title="Xuất đề thi ra file Word (.docx) kèm bảng đáp án và barem"
                  >
                    <Download className="w-3.5 h-3.5" /> Xuất Đề Word
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSaveExam}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow flex items-center gap-1.5 transition"
                >
                  <CheckCircle2 className="w-4 h-4" /> {editingExamId ? 'Lưu Đề Thi' : 'Tạo Đề Thi'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExamModal(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
                  title="Đóng cửa sổ"
                >
                  ✕
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveExam} className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6">
              {/* THANH TIỆN ÍCH WORD TRONG SOẠN ĐỀ: TẢI FILE MẪU & NHẬP ĐỀ TỪ FILE & XUẤT ĐỀ */}
              <div className="bg-gradient-to-r from-blue-950/60 via-slate-850 to-slate-900 border border-sky-800/40 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-inner">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-900/60 border border-sky-700/50 flex items-center justify-center text-sky-400">
                    <FileUp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      Tiện Ích Soạn Đề Từ File Word (.docx)
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Tải mẫu BGD&ĐT 2025 về máy, điền câu hỏi và nhập trực tiếp vào trình soạn thảo
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.open('/api/exams/template/download-word', '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs transition shadow"
                    title="Tải file Word mẫu chuẩn 3 phần của Bộ GD&ĐT 2025"
                  >
                    <Download className="w-3.5 h-3.5" /> Tải File Mẫu Word
                  </button>

                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs transition shadow cursor-pointer">
                    <FileUp className="w-3.5 h-3.5" /> {importingWord ? 'Đang Đọc File...' : 'Nhập Đề Từ File Word (.docx)'}
                    <input
                      type="file"
                      accept=".docx"
                      onChange={(e) => handleWordFileUpload(e, true)}
                      className="hidden"
                      disabled={importingWord}
                    />
                  </label>

                  {editingExamId && (
                    <button
                      type="button"
                      onClick={() => window.open(`/api/exams/${editingExamId}/export-word`, '_blank')}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg font-bold text-xs transition shadow"
                      title="Xuất đề thi ra file Word (.docx) kèm đáp án và barem"
                    >
                      <Download className="w-3.5 h-3.5" /> Xuất Đề (.docx)
                    </button>
                  )}
                </div>
              </div>

              {/* Thông tin chung */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-800/60 p-4 rounded-xl border border-slate-700">
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Tên Đề Thi / Ngân Hàng Đề</label>
                  <input
                    type="text"
                    value={examForm.title}
                    onChange={e => setExamForm({ ...examForm, title: e.target.value })}
                    placeholder="Ví dụ: Đề Kiểm Tra Tin Học 10 - Chương 2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Môn Học</label>
                  <input
                    type="text"
                    value={examForm.subject}
                    onChange={e => setExamForm({ ...examForm, subject: e.target.value })}
                    placeholder="Tin Học, Mạng máy tính..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-400 uppercase">Thang Điểm</label>
                    <button
                      type="button"
                      onClick={() => {
                        const nextSync = !autoSyncScore;
                        setAutoSyncScore(nextSync);
                        if (nextSync) handleAutoSumTotalScore();
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold transition ${
                        autoSyncScore
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                      title="Bật/Tắt tự động cộng điểm từ các câu hỏi"
                    >
                      {autoSyncScore ? '✓ Tự động cộng' : 'Thủ công'}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      step="0.25"
                      value={examForm.total_score}
                      onChange={e => {
                        setAutoSyncScore(false);
                        setExamForm({ ...examForm, total_score: Number(e.target.value) });
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAutoSumTotalScore}
                      className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-400 text-xs rounded-xl font-medium whitespace-nowrap"
                      title="Cộng lại tổng điểm các câu hỏi hiện có"
                    >
                      Tính tổng
                    </button>
                  </div>
                </div>
                <div className="md:col-span-3 pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/60 mt-1">
                  <div className="flex flex-wrap items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={examForm.shuffle_questions === 1}
                        onChange={e => setExamForm({ ...examForm, shuffle_questions: e.target.checked ? 1 : 0 })}
                        className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0"
                      />
                      Trộn thứ tự các câu hỏi trắc nghiệm
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={examForm.shuffle_options === 1}
                        onChange={e => setExamForm({ ...examForm, shuffle_options: e.target.checked ? 1 : 0 })}
                        className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0"
                      />
                      Trộn các phương án A, B, C, D
                    </label>
                  </div>

                  {examForm.questions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDistributeScoreEvenly(10.0)}
                      className="text-xs text-amber-400 hover:text-amber-300 font-medium px-2.5 py-1 bg-amber-950/50 hover:bg-amber-900/50 border border-amber-800/60 rounded-lg transition"
                      title="Tự động chia đều 10.0 điểm cho tất cả câu hỏi trong đề"
                    >
                      ⚖️ Chia đều 10 điểm cho {examForm.questions.length} câu
                    </button>
                  )}
                </div>
                <div className="md:col-span-3">
                  <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    <strong>Quy chế xáo trộn:</strong> Chỉ xáo trộn phần câu hỏi Trắc nghiệm. <em>Riêng các câu hỏi Tự Luận sẽ luôn được giữ nguyên 100% thứ tự cố định ở cuối đề thi</em>.
                  </p>
                </div>
              </div>

              {/* Danh sách câu hỏi */}
              <div className="space-y-4">
                {/* THANH CÔNG CỤ CÂU HỎI CỐ ĐỊNH KHI CUỘN (STICKY TOOLBAR) */}
                <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-md py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shadow-md">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-white text-base">Danh Sách Câu Hỏi ({examForm.questions.length})</h4>
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700 font-semibold font-mono">
                      Tổng: {examForm.total_score}đ
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => addQuestion('single_choice')}
                      className="px-3 py-1.5 bg-sky-700/60 hover:bg-sky-600 text-white rounded-lg text-xs font-medium transition"
                    >
                      + Trắc Nghiệm 1 Đáp Án
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('multiple_choice')}
                      className="px-3 py-1.5 bg-indigo-700/60 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium transition"
                    >
                      + Chọn Nhiều Đáp Án
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('true_false')}
                      className="px-3 py-1.5 bg-teal-700/60 hover:bg-teal-600 text-white rounded-lg text-xs font-medium transition"
                    >
                      + Đúng / Sai
                    </button>
                    <button
                      type="button"
                      onClick={() => addQuestion('essay')}
                      className="px-3 py-1.5 bg-amber-700/80 hover:bg-amber-600 text-white rounded-lg text-xs font-medium transition"
                    >
                      ✍️ + Câu Hỏi Tự Luận
                    </button>
                  </div>
                </div>

                {examForm.questions.map((q, qIndex) => (
                  <div key={qIndex} className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 flex items-center justify-center bg-slate-700 text-white font-bold rounded-lg text-sm">
                          {qIndex + 1}
                        </span>
                        <span className={`px-2.5 py-0.5 rounded text-xs font-semibold ${
                          q.question_type === 'essay'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : q.question_type === 'true_false'
                            ? 'bg-teal-950 text-teal-300 border border-teal-800'
                            : q.question_type === 'multiple_choice'
                            ? 'bg-indigo-950 text-indigo-400 border border-indigo-800'
                            : 'bg-sky-950 text-sky-400 border border-sky-800'
                        }`}>
                          {q.question_type === 'essay'
                            ? 'Tự Luận'
                            : q.question_type === 'true_false'
                            ? '⚖️ Đúng / Sai (BGDĐT 2025)'
                            : q.question_type === 'multiple_choice'
                            ? 'Trắc nghiệm nhiều đáp án'
                            : 'Trắc nghiệm 1 đáp án'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-slate-400 flex items-center gap-1.5">
                          Điểm:
                          <input
                            type="number"
                            step="0.25"
                            value={q.max_score}
                            onChange={e => updateQuestion(qIndex, 'max_score', e.target.value)}
                            className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white text-center text-xs font-bold"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIndex)}
                          className="text-slate-400 hover:text-rose-400 p-1 transition"
                          title="Xóa câu hỏi này"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Nội dung câu hỏi: KÉO DÃN ĐƯỢC (RESIZABLE) CÓ THANH CÔNG CỤ TOÁN & ẢNH */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between pb-1">
                        <label className="text-xs font-semibold text-slate-300">Nội dung câu hỏi:</label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMathModalTarget({ qIndex, type: 'content' })}
                            className="px-2.5 py-1 bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-800/80 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                            title="Chèn công thức toán học KaTeX"
                          >
                            <Sigma className="w-3.5 h-3.5 text-blue-400" />
                            Công thức Toán
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePickImageForTarget({ qIndex, type: 'content' })}
                            className="px-2.5 py-1 bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/80 rounded-lg text-xs font-semibold flex items-center gap-1 transition shadow-sm"
                            title="Chọn hình ảnh từ máy tính hoặc bấm Ctrl+V để dán trực tiếp ảnh chụp màn hình"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-sky-400" />
                            Thêm ảnh
                          </button>
                          <span className="text-[11px] text-slate-500 italic hidden sm:inline">(Dán ảnh Ctrl+V)</span>
                        </div>
                      </div>

                      <textarea
                        value={q.content}
                        onChange={e => updateQuestion(qIndex, 'content', e.target.value)}
                        onPaste={e => handlePasteInField(e, { qIndex, type: 'content' })}
                        placeholder={q.question_type === 'essay' ? 'Nhập nội dung đề bài tự luận (hỗ trợ công thức $...$ và dán ảnh Ctrl+V)...' : 'Nhập nội dung câu hỏi (hỗ trợ công thức $...$ và dán ảnh Ctrl+V)...'}
                        rows={q.question_type === 'essay' ? 4 : 2}
                        style={{ minHeight: q.question_type === 'essay' ? '120px' : '70px', resize: 'vertical' }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-white text-sm focus:border-sky-500 focus:outline-none leading-relaxed"
                        required
                      />

                      {/* Khung Xem Trước Thời Gian Thực (Live Preview) cho Câu Hỏi */}
                      {q.content && (q.content.includes('$') || q.content.includes('![')) && (
                        <div className="p-3 bg-slate-950/80 border border-slate-700/80 rounded-xl shadow-inner animate-fadeIn">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-400 mb-1.5 border-b border-slate-800/80 pb-1">
                            <Eye className="w-3.5 h-3.5" />
                            <span>Xem trước hiển thị (Live Preview KaTeX & Ảnh):</span>
                          </div>
                          <div className="text-sm text-slate-100 leading-relaxed overflow-x-auto">
                            <MathContent content={q.content} />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Câu hỏi Tự Luận: Khung hướng dẫn chấm / Barem điểm - KÉO DÃN ĐƯỢC */}
                    {q.question_type === 'essay' ? (
                      <div className="bg-amber-950/20 border border-amber-800/50 rounded-xl p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-amber-400 flex items-center gap-1">
                            <HelpCircle className="w-3.5 h-3.5" /> Barem Chấm & Đáp Án Mẫu (Dành cho Giáo Viên):
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setMathModalTarget({ qIndex, type: 'rubric' })}
                              className="px-2 py-0.5 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded text-[11px] font-semibold flex items-center gap-1 transition"
                              title="Chèn công thức toán vào barem chấm"
                            >
                              <Sigma className="w-3 h-3" /> Công thức
                            </button>
                            <button
                              type="button"
                              onClick={() => handlePickImageForTarget({ qIndex, type: 'rubric' })}
                              className="px-2 py-0.5 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded text-[11px] font-semibold flex items-center gap-1 transition"
                              title="Thêm ảnh vào barem chấm (hoặc dán Ctrl+V)"
                            >
                              <ImageIcon className="w-3 h-3" /> Ảnh
                            </button>
                            <span className="text-[10px] text-amber-400/70 italic hidden sm:inline">Kéo góc để mở rộng</span>
                          </div>
                        </div>
                        <textarea
                          value={q.rubric_guide}
                          onChange={e => updateQuestion(qIndex, 'rubric_guide', e.target.value)}
                          onPaste={e => handlePasteInField(e, { qIndex, type: 'rubric' })}
                          placeholder="Nhập tiêu chí chấm, các ý cần có, barem điểm chi tiết (hỗ trợ công thức $...$ và ảnh)..."
                          rows={4}
                          style={{ minHeight: '120px', resize: 'vertical' }}
                          className="w-full bg-slate-950/80 border border-slate-700 rounded-lg p-2.5 text-amber-200 text-xs focus:outline-none leading-relaxed"
                        />
                        {q.rubric_guide && (q.rubric_guide.includes('$') || q.rubric_guide.includes('![')) && (
                          <div className="p-2.5 bg-amber-950/30 border border-amber-800/40 rounded-lg text-xs text-amber-200 animate-fadeIn">
                            <span className="font-bold text-[10px] text-amber-400 block mb-1">Xem trước barem:</span>
                            <MathContent content={q.rubric_guide} />
                          </div>
                        )}
                      </div>
                    ) : q.question_type === 'true_false' ? (
                      /* CÂU HỎI ĐÚNG / SAI 4 Ý CHUẨN BGDĐT 2025 */
                      <div className="space-y-3 pt-2 bg-slate-900/60 p-3.5 rounded-xl border border-teal-900/60">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                          <span className="text-xs font-bold text-teal-400 flex items-center gap-1.5">
                            ⚖️ 4 Ý Mệnh Đề Con (Chuẩn BGDĐT 2025 - Điểm tối đa: {q.max_score || 1.0}đ)
                          </span>
                          <span className="text-[11px] text-teal-300/90 font-medium">
                            Barem lũy tiến: Đúng 1 ý: 0.1đ • 2 ý: 0.25đ • 3 ý: 0.5đ • 4 ý: 1.0đ
                          </span>
                        </div>

                        <div className="space-y-2.5">
                          {['a', 'b', 'c', 'd'].map(letter => {
                            const opt = (q.options || []).find(o => o.id.toLowerCase() === letter) || { id: letter, text: '' };
                            let currentAns = 'F';
                            if (q.correct_answers && typeof q.correct_answers === 'object' && !Array.isArray(q.correct_answers)) {
                              currentAns = q.correct_answers[letter] || 'F';
                            }

                            return (
                              <div key={letter} className="bg-slate-950/80 p-2.5 rounded-lg border border-slate-800 space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="w-7 h-7 rounded-lg bg-teal-950 text-teal-300 font-mono font-bold text-xs flex items-center justify-center border border-teal-800 flex-shrink-0">
                                    {letter})
                                  </span>
                                  <input
                                    type="text"
                                    value={opt.text}
                                    onChange={e => updateOptionText(qIndex, letter, e.target.value)}
                                    onPaste={e => handlePasteInField(e, { qIndex, type: 'option', optId: letter })}
                                    placeholder={`Nhập nội dung mệnh đề ý ${letter}) (hỗ trợ $...$ và Ctrl+V dán ảnh)...`}
                                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs focus:border-teal-500 focus:outline-none"
                                    required
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setMathModalTarget({ qIndex, type: 'option', optId: letter })}
                                    className="p-1.5 bg-slate-800 hover:bg-teal-900/60 text-slate-300 hover:text-teal-300 border border-slate-700 rounded-lg transition"
                                    title="Chèn công thức toán vào ý này"
                                  >
                                    <Sigma className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handlePickImageForTarget({ qIndex, type: 'option', optId: letter })}
                                    className="p-1.5 bg-slate-800 hover:bg-sky-900/60 text-slate-300 hover:text-sky-300 border border-slate-700 rounded-lg transition"
                                    title="Thêm ảnh cho ý này (hoặc bấm Ctrl+V vào ô)"
                                  >
                                    <ImageIcon className="w-3.5 h-3.5" />
                                  </button>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => updateTrueFalseAnswer(qIndex, letter, 'T')}
                                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                                        currentAns === 'T'
                                          ? 'bg-emerald-600 text-white shadow ring-2 ring-emerald-400 font-black'
                                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                      }`}
                                    >
                                      ✓ ĐÚNG
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateTrueFalseAnswer(qIndex, letter, 'F')}
                                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 ${
                                        currentAns === 'F'
                                          ? 'bg-rose-600 text-white shadow ring-2 ring-rose-400 font-black'
                                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                                      }`}
                                    >
                                      ✗ SAI
                                    </button>
                                  </div>
                                </div>
                                {opt.text && (opt.text.includes('$') || opt.text.includes('![')) && (
                                  <div className="pl-9 pr-2 py-1 text-xs text-teal-200/90 bg-teal-950/20 rounded border border-teal-900/30">
                                    <MathContent content={opt.text} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Câu hỏi Trắc Nghiệm: Danh sách phương án A, B, C, D */
                      <div className="space-y-2 pt-2">
                        <div className="text-xs text-slate-400 mb-1">
                          Click vào chữ cái để chọn đáp án đúng:
                        </div>
                        {q.options.map(opt => {
                          const isCorrect = q.correct_answers.includes(opt.id);
                          return (
                            <div key={opt.id} className="space-y-1">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleCorrectAnswer(qIndex, opt.id)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs transition ${
                                    isCorrect ? 'bg-emerald-600 text-white ring-2 ring-emerald-400' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                  }`}
                                  title="Click để đặt làm đáp án đúng"
                                >
                                  {opt.id}
                                </button>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={e => updateOptionText(qIndex, opt.id, e.target.value)}
                                  onPaste={e => handlePasteInField(e, { qIndex, type: 'option', optId: opt.id })}
                                  placeholder={`Nội dung lựa chọn ${opt.id} (hỗ trợ $...$ và dán ảnh Ctrl+V)...`}
                                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white text-xs"
                                  required
                                />
                                <button
                                  type="button"
                                  onClick={() => setMathModalTarget({ qIndex, type: 'option', optId: opt.id })}
                                  className="p-1.5 bg-slate-800 hover:bg-blue-900/60 text-slate-400 hover:text-blue-300 border border-slate-700 rounded-lg transition"
                                  title={`Chèn công thức toán vào phương án ${opt.id}`}
                                >
                                  <Sigma className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handlePickImageForTarget({ qIndex, type: 'option', optId: opt.id })}
                                  className="p-1.5 bg-slate-800 hover:bg-sky-900/60 text-slate-400 hover:text-sky-300 border border-slate-700 rounded-lg transition"
                                  title={`Thêm hình ảnh cho phương án ${opt.id} (hoặc dán Ctrl+V)`}
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                </button>
                              </div>
                              {opt.text && (opt.text.includes('$') || opt.text.includes('![')) && (
                                <div className="ml-10 p-1.5 bg-slate-950/70 rounded border border-slate-800 text-xs text-slate-200">
                                  <MathContent content={opt.text} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between sticky bottom-0 bg-slate-900/95 backdrop-blur-md py-3 z-20">
                <div className="text-xs text-slate-400">
                  Tổng số: <strong className="text-white">{examForm.questions.length}</strong> câu hỏi • Thang điểm: <strong className="text-emerald-400">{examForm.total_score}</strong> điểm
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setShowExamModal(false)}
                    className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs shadow-lg flex items-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" /> {editingExamId ? 'Lưu Thay Đổi Đề Thi' : 'Lưu Đề Thi Mới'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quản Lý Danh Sách Thí Sinh Trong Ca Thi */}
      {selectedSessionForStudents && (
        <SessionStudentsModal
          session={selectedSessionForStudents}
          onClose={() => {
            setSelectedSessionForStudents(null);
            fetchData();
          }}
        />
      )}

      {/* Modal Bảng Ký Hiệu & Công Thức Toán Học KaTeX */}
      <MathToolbarModal
        isOpen={Boolean(mathModalTarget)}
        onClose={() => setMathModalTarget(null)}
        onInsert={handleInsertMath}
      />

      {/* Input ẩn để chọn tệp hình ảnh */}
      <input
        ref={imageFileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFilePicked}
      />

      {/* Toast thông báo đang tải ảnh lên máy chủ */}
      {uploadingImage && (
        <div className="fixed bottom-6 right-6 z-50 bg-sky-600 text-white px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce text-xs font-bold">
          <ImageIcon className="w-4 h-4 animate-spin" />
          <span>Đang tải hình ảnh lên máy chủ...</span>
        </div>
      )}
    </div>
  );
}
