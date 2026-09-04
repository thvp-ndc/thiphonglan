import React, { useState } from 'react';
import katex from 'katex';
import { ZoomIn, X } from 'lucide-react';
import CodeBlock from './CodeBlock';

/**
 * MathContent Component
 * Render công thức toán học KaTeX ($...$ và $$...$$), hình ảnh Markdown (![alt](url)),
 * và khối mã nguồn Tin học (Python, HTML...) với Syntax Highlighting.
 * Hoạt động 100% Offline trên mạng LAN không cần kết nối Internet.
 */
export default function MathContent({ content = '', className = '', zoomable = true }) {
  const [zoomedImage, setZoomedImage] = useState(null);

  if (!content) return null;

  // Tách nội dung thành các token:
  // 1. Khối Code: ```lang\n...```
  // 2. Mã nội dòng: `code`
  // 3. Display Math: $$...$$
  // 4. Ảnh: ![alt](url)
  // 5. Inline Math: $...$
  // 6. Xuống dòng: \n
  const tokenRegex = /(```(?:[a-zA-Z0-9_-]+)?[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]+?\$\$|!\[.*?\]\(.*?\)|\$(?:\\\$|[^\$\n])+?\$|\n)/g;
  const parts = content.split(tokenRegex);

  return (
    <>
      <div className={`math-content inline-block w-full text-inherit ${className}`}>
        {parts.map((part, index) => {
          if (!part) return null;

          // 1. Khối Mã Nguồn (Code Block): ```lang\n...```
          if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
            const inner = part.slice(3, -3);
            const firstLineBreak = inner.indexOf('\n');
            let lang = 'python';
            let codeBody = inner;

            if (firstLineBreak !== -1) {
              const firstLine = inner.slice(0, firstLineBreak).trim();
              if (firstLine && /^[a-zA-Z0-9_-]+$/.test(firstLine)) {
                lang = firstLine;
                codeBody = inner.slice(firstLineBreak + 1);
              }
            }

            // Bỏ dòng trống đầu và cuối nếu có
            codeBody = codeBody.replace(/^\r?\n/, '').replace(/\r?\n$/, '');

            return (
              <CodeBlock
                key={index}
                code={codeBody}
                language={lang}
                showLineNumbers={true}
              />
            );
          }

          // 2. Mã nội dòng (Inline Code): `code`
          if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
            const inlineCode = part.slice(1, -1);
            return (
              <code
                key={index}
                className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-800/90 text-sky-300 font-mono text-xs border border-slate-700 font-semibold"
              >
                {inlineCode}
              </code>
            );
          }

          // 3. Display Math: $$ ... $$
          if (part.startsWith('$$') && part.endsWith('$$') && part.length >= 4) {
            const math = part.slice(2, -2).trim();
            try {
              const html = katex.renderToString(math, {
                displayMode: true,
                throwOnError: false
              });
              return (
                <div
                  key={index}
                  className="my-2 text-center overflow-x-auto py-1"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch (e) {
              return <span key={index} className="text-red-400 font-mono text-sm">{part}</span>;
            }
          }

          // 4. Markdown Image: ![alt](url)
          if (part.startsWith('![') && part.includes('](') && part.endsWith(')')) {
            const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
            if (imgMatch) {
              const alt = imgMatch[1] || 'Hình ảnh câu hỏi';
              const src = imgMatch[2];
              return (
                <div key={index} className="my-2 text-center group relative inline-block">
                  <img
                    src={src}
                    alt={alt}
                    onClick={() => zoomable && setZoomedImage({ src, alt })}
                    className={`max-w-full h-auto max-h-[380px] object-contain rounded-lg border border-slate-700 shadow-md bg-slate-900/60 inline-block ${
                      zoomable ? 'cursor-pointer hover:border-blue-500 hover:shadow-blue-500/20 transition-all' : ''
                    }`}
                    loading="lazy"
                  />
                  {zoomable && (
                    <span
                      onClick={() => setZoomedImage({ src, alt })}
                      className="absolute bottom-2 right-2 bg-slate-900/80 hover:bg-blue-600 text-white p-1.5 rounded-md text-xs cursor-pointer flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                      title="Nhấn để phóng to hình ảnh"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                      Phóng to
                    </span>
                  )}
                </div>
              );
            }
          }

          // 5. Inline Math: $ ... $
          if (part.startsWith('$') && part.endsWith('$') && part.length >= 2) {
            const math = part.slice(1, -1).trim();
            try {
              const html = katex.renderToString(math, {
                displayMode: false,
                throwOnError: false
              });
              return (
                <span
                  key={index}
                  className="inline-math px-0.5"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              );
            } catch (e) {
              return <span key={index} className="text-red-400 font-mono text-sm">{part}</span>;
            }
          }

          // 6. Line break: \n
          if (part === '\n') {
            return <br key={index} />;
          }

          // 7. Plain text
          return <React.Fragment key={index}>{part}</React.Fragment>;
        })}
      </div>

      {/* Modal phóng to ảnh */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn"
          onClick={() => setZoomedImage(null)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full flex justify-between items-center pb-2 mb-2 border-b border-slate-800 text-slate-300 text-sm">
              <span className="font-medium truncate max-w-md">{zoomedImage.alt || 'Xem chi tiết hình ảnh'}</span>
              <button
                onClick={() => setZoomedImage(null)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                title="Đóng (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-auto max-h-[80vh] flex items-center justify-center">
              <img
                src={zoomedImage.src}
                alt={zoomedImage.alt}
                className="max-w-full max-h-[75vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
