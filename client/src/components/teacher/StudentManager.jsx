import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Upload, Download, Edit2, Trash2, Search, CheckCircle2, AlertCircle } from 'lucide-react';

export default function StudentManager() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [studentForm, setStudentForm] = useState({
    student_code: '',
    student_name: '',
    class_name: '',
    gender: 'Nam'
  });

  // Import Excel State
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState(null);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const url = selectedClass === 'ALL' ? '/api/students' : `/api/students?class=${encodeURIComponent(selectedClass)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setStudents(data.students || []);
        setClasses(data.classes || []);
      }
    } catch (err) {
      console.error('Fetch students error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [selectedClass]);

  const handleOpenAdd = () => {
    setEditingStudent(null);
    setStudentForm({
      student_code: '',
      student_name: '',
      class_name: selectedClass !== 'ALL' ? selectedClass : '10A1',
      gender: 'Nam'
    });
    setShowStudentModal(true);
  };

  const handleOpenEdit = (st) => {
    setEditingStudent(st);
    setStudentForm({
      student_code: st.student_code,
      student_name: st.student_name,
      class_name: st.class_name || '',
      gender: st.gender || 'Nam'
    });
    setShowStudentModal(true);
  };

  const handleSaveStudent = async (e) => {
    e.preventDefault();
    try {
      const url = editingStudent ? `/api/students/${editingStudent.id}` : '/api/students';
      const method = editingStudent ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(studentForm)
      });
      const data = await res.json();
      if (data.success) {
        setShowStudentModal(false);
        fetchStudents();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert('Không thể lưu học sinh: ' + err.message);
    }
  };

  const handleDeleteStudent = async (st) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa học sinh [${st.student_name} - SBD: ${st.student_code}]?`)) return;
    try {
      const res = await fetch(`/api/students/${st.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchStudents();
      } else {
        alert('Lỗi: ' + data.message);
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDownloadTemplate = () => {
    window.open('/api/students/export-template', '_blank');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setImporting(true);
      setImportMessage(null);

      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target.result;
        const res = await fetch('/api/students/import-excel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64: base64 })
        });
        const data = await res.json();
        if (data.success) {
          setImportMessage({ type: 'success', text: `Nhập thành công ${data.importedCount} học sinh từ file Excel!` });
          fetchStudents();
        } else {
          setImportMessage({ type: 'error', text: data.message || 'Lỗi đọc file Excel' });
        }
        setImporting(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setImportMessage({ type: 'error', text: 'Lỗi tải file: ' + err.message });
      setImporting(false);
    }
  };

  const filteredStudents = students.filter(st => {
    if (!searchKeyword) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      st.student_code.toLowerCase().includes(kw) ||
      st.student_name.toLowerCase().includes(kw) ||
      (st.class_name && st.class_name.toLowerCase().includes(kw))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-sky-400" /> Quản Lý Danh Sách Học Sinh Theo Lớp
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Quản lý số báo danh, danh sách lớp, nhập hàng loạt từ file Excel trường học
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-semibold transition"
          >
            <Download className="w-4 h-4" /> Tải File Excel Mẫu
          </button>

          <label className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow cursor-pointer">
            <Upload className="w-4 h-4" /> {importing ? 'Đang Nhập...' : 'Nhập Từ File Excel (.xlsx)'}
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              className="hidden"
              disabled={importing}
            />
          </label>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition shadow"
          >
            <UserPlus className="w-4 h-4" /> + Thêm Học Sinh
          </button>
        </div>
      </div>

      {importMessage && (
        <div className={`p-4 rounded-xl border flex items-center gap-2 text-xs font-medium ${
          importMessage.type === 'success' ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'
        }`}>
          {importMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{importMessage.text}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        {/* Class Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
          <button
            onClick={() => setSelectedClass('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              selectedClass === 'ALL' ? 'bg-sky-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:text-white'
            }`}
          >
            Tất Cả Lớp ({students.length})
          </button>
          {classes.map(cls => (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                selectedClass === cls ? 'bg-sky-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              Lớp {cls}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            placeholder="Tìm theo SBD, Tên, Lớp..."
            className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-slate-800/90 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Đang tải danh sách học sinh...</div>
        ) : filteredStudents.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Users className="w-12 h-12 mx-auto text-slate-600 mb-2" />
            <p>Không tìm thấy học sinh nào.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-900 text-xs text-slate-400 uppercase border-b border-slate-700">
                <tr>
                  <th className="py-3 px-4 w-16">STT</th>
                  <th className="py-3 px-4 w-32">Số Báo Danh</th>
                  <th className="py-3 px-4">Họ Và Tên</th>
                  <th className="py-3 px-4 w-28">Lớp</th>
                  <th className="py-3 px-4 w-28">Giới Tính</th>
                  <th className="py-3 px-4 w-32 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {filteredStudents.map((st, idx) => (
                  <tr key={st.id} className="hover:bg-slate-750 transition">
                    <td className="py-3 px-4 text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono font-bold text-sky-400">{st.student_code}</td>
                    <td className="py-3 px-4 font-semibold text-white">{st.student_name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-xs text-slate-200">
                        {st.class_name || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-400">{st.gender || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(st)}
                          className="p-1.5 hover:bg-sky-950 text-slate-400 hover:text-sky-400 rounded transition"
                          title="Sửa thông tin"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStudent(st)}
                          className="p-1.5 hover:bg-rose-950 text-slate-400 hover:text-rose-400 rounded transition"
                          title="Xóa học sinh"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Thêm / Sửa Học Sinh */}
      {showStudentModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold text-white">
              {editingStudent ? 'Chỉnh Sửa Thông Tin Học Sinh' : 'Thêm Học Sinh Mới'}
            </h3>

            <form onSubmit={handleSaveStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Số Báo Danh (SBD) / Mã HS</label>
                <input
                  type="text"
                  value={studentForm.student_code}
                  onChange={e => setStudentForm({ ...studentForm, student_code: e.target.value.toUpperCase() })}
                  placeholder="Ví dụ: SBD001, B21DCCN001"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white font-mono font-bold uppercase focus:border-sky-500 focus:outline-none text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Họ Và Tên</label>
                <input
                  type="text"
                  value={studentForm.student_name}
                  onChange={e => setStudentForm({ ...studentForm, student_name: e.target.value })}
                  placeholder="Nguyễn Văn A"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Lớp</label>
                  <input
                    type="text"
                    value={studentForm.class_name}
                    onChange={e => setStudentForm({ ...studentForm, class_name: e.target.value.toUpperCase() })}
                    placeholder="10A1"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white uppercase focus:border-sky-500 focus:outline-none text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Giới Tính</label>
                  <select
                    value={studentForm.gender}
                    onChange={e => setStudentForm({ ...studentForm, gender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-white focus:border-sky-500 focus:outline-none text-sm"
                  >
                    <option value="Nam">Nam</option>
                    <option value="Nữ">Nữ</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowStudentModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition shadow"
                >
                  Lưu Thông Tin
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
