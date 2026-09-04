import React, { useState } from 'react';
import { X, Check, Code2, Sparkles, Terminal, Globe } from 'lucide-react';
import CodeBlock from './CodeBlock';

const PYTHON_TEMPLATES = [
  {
    name: 'Vòng lặp for với range',
    desc: 'Lặp từ 1 đến n',
    code: `for i in range(1, 11):\n    print(i)`
  },
  {
    name: 'Cấu trúc if - else',
    desc: 'Kiểm tra điều kiện',
    code: `if n % 2 == 0:\n    print("Số chẵn")\nelse:\n    print("Số lẻ")`
  },
  {
    name: 'Khai báo hàm def',
    desc: 'Định nghĩa hàm có giá trị trả về',
    code: `def tinh_tong(a, b):\n    return a + b\n\nket_qua = tinh_tong(5, 7)\nprint(ket_qua)`
  },
  {
    name: 'Vòng lặp while',
    desc: 'Lặp với điều kiện dừng',
    code: `i = 1\ns = 0\nwhile i <= 10:\n    s += i\n    i += 1\nprint("Tổng:", s)`
  },
  {
    name: 'Thao tác Danh sách (List)',
    desc: 'Mảng danh sách và các phương thức',
    code: `ds = [1, 2, 3, 4, 5]\nds.append(6)\nprint("Độ dài:", len(ds))\nfor x in ds:\n    if x % 2 == 0:\n        print(x)`
  },
  {
    name: 'Nhập xuất dữ liệu (input/print)',
    desc: 'Nhập số nguyên và in ra',
    code: `n = int(input("Nhập số phần tử: "))\nprint(f"Giá trị n vừa nhập là: {n}")`
  }
];

const HTML_TEMPLATES = [
  {
    name: 'Cấu trúc trang web chuẩn',
    desc: 'Khung tài liệu HTML5 cơ bản',
    code: `<!DOCTYPE html>\n<html>\n<head>\n    <title>Trang web Tin học</title>\n</head>\n<body>\n    <h1>Tiêu đề bài viết</h1>\n    <p>Nội dung đoạn văn bản...</p>\n</body>\n</html>`
  },
  {
    name: 'Bảng biểu (table, tr, td)',
    desc: 'Bảng dữ liệu có dòng và cột',
    code: `<table border="1">\n    <tr>\n        <th>STT</th>\n        <th>Họ và tên</th>\n        <th>Điểm số</th>\n    </tr>\n    <tr>\n        <td>1</td>\n        <td>Nguyễn Văn A</td>\n        <td>9.5</td>\n    </tr>\n</table>`
  },
  {
    name: 'Biểu mẫu nhập liệu (form, input)',
    desc: 'Form thu thập thông tin',
    code: `<form action="/submit" method="post">\n    <label for="username">Tên đăng nhập:</label>\n    <input type="text" id="username" name="username" required>\n    <input type="password" name="password">\n    <button type="submit">Đăng nhập</button>\n</form>`
  },
  {
    name: 'Danh sách không thứ tự (ul, li)',
    desc: 'Danh sách các mục',
    code: `<ul>\n    <li>Ngôn ngữ Python</li>\n    <li>Ngôn ngữ HTML/CSS</li>\n    <li>Cơ sở dữ liệu SQL</li>\n</ul>`
  },
  {
    name: 'Liên kết & Hình ảnh (a, img)',
    desc: 'Thẻ liên kết siêu văn bản và ảnh',
    code: `<p>Truy cập <a href="https://example.com" target="_blank">trang chủ</a> để xem thêm.</p>\n<img src="logo.png" alt="Logo trường học" width="200">`
  }
];

export default function CodeToolbarModal({ isOpen, onClose, onInsert }) {
  const [selectedLang, setSelectedLang] = useState('python');
  const [customCode, setCustomCode] = useState('');
  const [isInline, setIsInline] = useState(false);

  if (!isOpen) return null;

  const currentTemplates = selectedLang === 'python' ? PYTHON_TEMPLATES : HTML_TEMPLATES;

  const handlePickTemplate = (templateCode) => {
    setCustomCode(templateCode);
  };

  const handleInsert = () => {
    if (!customCode.trim()) return;

    if (isInline) {
      // Inline code: `code`
      onInsert(`\`${customCode.trim()}\``);
    } else {
      // Code block: ```lang\ncode\n```
      onInsert(`\n\`\`\`${selectedLang}\n${customCode}\n\`\`\`\n`);
    }

    onClose();
  };

  // Support Tab key in editor textarea
  const handleKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      const value = customCode;
      const newValue = value.substring(0, start) + '    ' + value.substring(end);
      setCustomCode(newValue);
      setTimeout(() => {
        e.target.selectionStart = e.target.selectionEnd = start + 4;
      }, 0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
          <div className="flex items-center gap-2.5 text-sky-400">
            <Code2 className="w-5 h-5" />
            <h2 className="text-lg font-semibold text-white">Chèn Mã Nguồn Tin Học (Python & HTML)</h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-700 font-mono">
              Syntax Highlighting 100% Offline
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Language Tabs & Options Bar */}
        <div className="px-6 py-3 bg-slate-950/40 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedLang('python');
                if (PYTHON_TEMPLATES[0]) setCustomCode(PYTHON_TEMPLATES[0].code);
              }}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                selectedLang === 'python'
                  ? 'bg-blue-600 text-white shadow ring-2 ring-blue-400/50'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" /> Python
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedLang('html');
                if (HTML_TEMPLATES[0]) setCustomCode(HTML_TEMPLATES[0].code);
              }}
              className={`px-3.5 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition ${
                selectedLang === 'html'
                  ? 'bg-amber-600 text-white shadow ring-2 ring-amber-400/50'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Globe className="w-3.5 h-3.5" /> HTML / Web
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={isInline}
              onChange={(e) => setIsInline(e.target.checked)}
              className="rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-0"
            />
            <span>Mã nội dòng (\`code\`) - dùng chèn tên biến, lệnh ngắn trong câu</span>
          </label>
        </div>

        {/* Content Body: Templates & Editor */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Column 1: Sample templates */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">
              Mẫu code {selectedLang === 'python' ? 'Python' : 'HTML'} phổ biến:
            </span>
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {currentTemplates.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePickTemplate(tpl.code)}
                  className="w-full text-left p-2.5 rounded-xl border border-slate-700/80 bg-slate-800/40 hover:bg-slate-800 hover:border-sky-500/60 transition group"
                >
                  <div className="text-xs font-bold text-slate-200 group-hover:text-sky-300">
                    {tpl.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {tpl.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Column 2 & 3: Editor & Live Preview */}
          <div className="md:col-span-2 flex flex-col space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Nội dung mã nguồn (Có thể bấm phím <kbd className="px-1.5 py-0.5 bg-slate-800 text-sky-300 rounded border border-slate-700 font-mono text-[11px]">Tab</kbd> để thụt lề 4 khoảng trắng):
                </label>
                <span className="text-[11px] text-slate-500">Giữ nguyên thụt lề</span>
              </div>
              <textarea
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedLang === 'python' ? '# Nhập mã code Python tại đây...\ndef main():\n    print("Hello world")' : '<!-- Nhập mã HTML tại đây -->\n<div class="box">\n    <p>Nội dung</p>\n</div>'}
                rows={7}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-mono text-xs leading-5 focus:border-sky-500 focus:outline-none resize-y"
                style={{ tabSize: 4 }}
              />
            </div>

            {/* Live Preview */}
            <div className="flex-1 flex flex-col">
              <span className="text-xs font-bold text-slate-400 block mb-1">
                Xem trước khối mã nguồn (Live Preview):
              </span>
              <div className="flex-1 max-h-[190px] overflow-y-auto">
                <CodeBlock
                  code={customCode || (selectedLang === 'python' ? '# Mã xem trước...' : '<!-- Mã xem trước -->')}
                  language={selectedLang}
                  showLineNumbers={!isInline}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between">
          <span className="text-xs text-slate-400 italic">
            Mã nguồn sẽ được tự động định dạng và tô màu trong bài thi học sinh.
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleInsert}
              disabled={!customCode.trim()}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg flex items-center gap-1.5 transition"
            >
              <Check className="w-4 h-4" /> Chèn Mã Vào Đề
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
