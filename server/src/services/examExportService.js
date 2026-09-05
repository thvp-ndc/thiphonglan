const JSZip = require('jszip');
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const { getImageDimensions, calculateWordEmuSize } = require('./imageUtils');

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

class ExamExportService {
  async generateExamWordBuffer(examId) {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(examId);
    if (!exam) throw new Error('Không tìm thấy đề thi');

    const questions = db.prepare(`
      SELECT * FROM questions 
      WHERE exam_id = ? 
      ORDER BY order_index ASC
    `).all(examId).map(q => {
      let options = [];
      let correct_answers = [];
      try {
        options = q.options_json ? JSON.parse(q.options_json) : [];
      } catch (e) {}
      try {
        correct_answers = q.correct_answers_json ? JSON.parse(q.correct_answers_json) : [];
      } catch (e) {}
      return {
        ...q,
        options,
        correct_answers
      };
    });

    const part1 = questions.filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2 = questions.filter(q => q.question_type === 'true_false');
    const part3 = questions.filter(q => q.question_type === 'essay');

    const zip = new JSZip();
    const mediaRelationships = [];
    const uploadsDir = path.resolve(__dirname, '../../uploads/images');
    let imgCounter = 0;

    // Helper: Thêm ảnh vào document và trả về XML drawing với kích thước chuẩn xác theo tỷ lệ thực tế
    const embedImage = (imgSrc) => {
      // imgSrc: /uploads/images/filename.png hoặc tên file
      const fileName = path.basename(imgSrc);
      const filePath = path.join(uploadsDir, fileName);
      if (!fs.existsSync(filePath)) {
        return `<w:p><w:r><w:t xml:space="preserve">[Hình ảnh: ${escapeXml(fileName)}]</w:t></w:r></w:p>`;
      }

      imgCounter++;
      const rId = `rIdImg${imgCounter}`;
      const ext = path.extname(fileName).toLowerCase().replace('.', '') || 'png';
      const targetZipMedia = `media/image_${imgCounter}.${ext}`;
      const imgBuffer = fs.readFileSync(filePath);
      zip.file(`word/${targetZipMedia}`, imgBuffer);

      mediaRelationships.push({
        id: rId,
        target: targetZipMedia,
        ext
      });

      // Đọc kích thước thật (pixels) và tính toán kích thước EMU chuẩn xác không bị méo tỷ lệ
      const dims = getImageDimensions(imgBuffer);
      const { cx, cy } = calculateWordEmuSize(dims?.width || 500, dims?.height || 350);

      return `
<w:p>
  <w:pPr><w:jc w:val="center"/></w:pPr>
  <w:r>
    <w:drawing>
      <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
        <wp:extent cx="${cx}" cy="${cy}"/>
        <wp:docPr id="${imgCounter}" name="Hình ảnh ${imgCounter}"/>
        <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:nvPicPr>
                <pic:cNvPr id="${imgCounter}" name="Hình ảnh"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>`;
    };

    // Helper builders
    const p = (text, isBold = false, isItalic = false, align = 'left') => {
      const alignXml = align !== 'left' ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : '';
      const rPrXml = (isBold || isItalic) ? `<w:rPr>${isBold ? '<w:b/>' : ''}${isItalic ? '<w:i/>' : ''}</w:rPr>` : '';
      return `<w:p>${alignXml}<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
    };

    // Helper: Định dạng mã code nội dòng (Inline Code `...`)
    const formatRunsWithInlineCode = (text, isBold = false, isItalic = false) => {
      const parts = text.split(/(`[^`\n]+`)/g);
      let xml = '';
      for (const part of parts) {
        if (!part) continue;
        if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
          const codeContent = part.slice(1, -1);
          xml += `<w:r>
            <w:rPr>
              <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
              <w:sz w:val="19"/>
              <w:color w:val="0369A1"/>
              <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
            </w:rPr>
            <w:t xml:space="preserve">${escapeXml(codeContent)}</w:t>
          </w:r>`;
        } else {
          const rPrXml = (isBold || isItalic) ? `<w:rPr>${isBold ? '<w:b/>' : ''}${isItalic ? '<w:i/>' : ''}</w:rPr>` : '';
          xml += `<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(part)}</w:t></w:r>`;
        }
      }
      return xml;
    };

    const pWithRuns = (runsXml, align = 'left') => {
      const alignXml = align !== 'left' ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : '';
      return `<w:p>${alignXml}${runsXml}</w:p>`;
    };

    // Khối mã nguồn Code Block đẹp chuẩn Microsoft Word (Consolas, Shading, Left Border)
    const codeBlockXml = (codeText, lang = 'python') => {
      const lines = codeText.split(/\r?\n/);
      return lines.map(line => {
        return `<w:p>
  <w:pPr>
    <w:pBdr>
      <w:left w:val="single" w:sz="18" w:space="8" w:color="0284C7"/>
    </w:pBdr>
    <w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>
    <w:ind w:left="360" w:right="360"/>
    <w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>
  </w:pPr>
  <w:r>
    <w:rPr>
      <w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>
      <w:sz w:val="19"/>
      <w:color w:val="0F172A"/>
    </w:rPr>
    <w:t xml:space="preserve">${escapeXml(line || ' ')}</w:t>
  </w:r>
</w:p>`;
      }).join('\n');
    };

    // Xử lý văn bản có chứa Khối Code (```...```), Inline Code (`...`) và Hình ảnh (![alt](url))
    const processContent = (content, prefix = '', isBold = false) => {
      if (!content && !prefix) return '';
      const tokenRegex = /(```(?:[a-zA-Z0-9_-]+)?[\s\S]*?```|!\[.*?\]\(.*?\))/g;
      const parts = (content || '').split(tokenRegex);
      const xmlBlocks = [];

      let hasInsertedPrefix = false;

      for (const part of parts) {
        if (!part) continue;

        // 1. Code Block: ```lang\n...```
        if (part.startsWith('```') && part.endsWith('```') && part.length >= 6) {
          if (prefix && !hasInsertedPrefix) {
            xmlBlocks.push(p(prefix, isBold));
            hasInsertedPrefix = true;
          }
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
          codeBody = codeBody.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
          xmlBlocks.push(codeBlockXml(codeBody, lang));
        }
        // 2. Image: ![alt](url)
        else if (part.startsWith('![') && part.includes('](') && part.endsWith(')')) {
          if (prefix && !hasInsertedPrefix) {
            xmlBlocks.push(p(prefix, isBold));
            hasInsertedPrefix = true;
          }
          const match = part.match(/^!\[(.*?)\]\((.*?)\)$/);
          if (match) {
            xmlBlocks.push(embedImage(match[2]));
          }
        }
        // 3. Văn bản thông thường (có thể có \n và `inline code`)
        else {
          const lines = part.split(/\r?\n/);
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            if (li === 0 && prefix && !hasInsertedPrefix) {
              xmlBlocks.push(pWithRuns(formatRunsWithInlineCode(`${prefix}${line}`, isBold)));
              hasInsertedPrefix = true;
            } else if (line.trim().length > 0) {
              xmlBlocks.push(pWithRuns(formatRunsWithInlineCode(line, isBold)));
            }
          }
        }
      }

      if (prefix && !hasInsertedPrefix) {
        xmlBlocks.unshift(p(prefix, isBold));
      }

      return xmlBlocks.length > 0 ? xmlBlocks.join('\n') : p(prefix, isBold);
    };

    const emptyLine = () => `<w:p><w:r><w:t xml:space="preserve"></w:t></w:r></w:p>`;
    const pageBreak = () => `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

    const paragraphs = [];

    // Header
    paragraphs.push(p('SỞ GD&ĐT • TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH', true, false, 'center'));
    paragraphs.push(p(exam.title.toUpperCase(), true, false, 'center'));
    paragraphs.push(p(`Môn thi: ${exam.subject || 'Tin học'}  |  Thời gian làm bài: ${exam.duration_minutes || 45} phút  |  Thang điểm: ${exam.total_score || 10.0}đ`, false, true, 'center'));
    paragraphs.push(p('Họ và tên thí sinh: ............................................................................ SBD: ...................... Lớp: ......................', false, false, 'center'));
    paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------', false, false, 'center'));
    paragraphs.push(emptyLine());

    let qCounter = 1;

    // PHẦN I
    if (part1.length > 0) {
      paragraphs.push(p('PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN', true));
      paragraphs.push(p(`Thí sinh trả lời từ câu ${qCounter} đến câu ${qCounter + part1.length - 1}. Mỗi câu hỏi thí sinh chỉ chọn một phương án A, B, C hoặc D.`, false, true));
      paragraphs.push(emptyLine());

      for (const q of part1) {
        paragraphs.push(processContent(q.content, `Câu ${qCounter}: `, true));
        const opts = Array.isArray(q.options) ? q.options : [];
        for (const opt of opts) {
          paragraphs.push(processContent(opt.text, `   ${opt.id}. `));
        }
        paragraphs.push(emptyLine());
        qCounter++;
      }
    }

    // PHẦN II
    if (part2.length > 0) {
      paragraphs.push(p('PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG / SAI', true));
      paragraphs.push(p(`Thí sinh trả lời từ câu ${qCounter} đến câu ${qCounter + part2.length - 1}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai.`, false, true));
      paragraphs.push(p('Điểm tối đa 1 câu là 1.0 điểm (Đúng 1 ý = 0.1đ; Đúng 2 ý = 0.25đ; Đúng 3 ý = 0.5đ; Đúng 4 ý = 1.0đ).', false, true));
      paragraphs.push(emptyLine());

      for (const q of part2) {
        paragraphs.push(processContent(q.content, `Câu ${qCounter}: `, true));
        const subKeys = ['a', 'b', 'c', 'd'];
        const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options : subKeys.map(k => ({ id: k, text: '' }));
        for (const opt of opts) {
          paragraphs.push(processContent(opt.text, `   ${opt.id.toLowerCase()}) `));
        }
        paragraphs.push(emptyLine());
        qCounter++;
      }
    }

    // PHẦN III
    if (part3.length > 0) {
      paragraphs.push(p('PHẦN III. CÂU HỎI TỰ LUẬN', true));
      paragraphs.push(p(`Thí sinh trình bày bài làm tự luận chi tiết.`, false, true));
      paragraphs.push(emptyLine());

      for (const q of part3) {
        paragraphs.push(p(`Câu ${qCounter} (Tự luận - ${q.max_score || 1.0} điểm):`, true));
        paragraphs.push(processContent(q.content));
        paragraphs.push(p('Bài làm:'));
        paragraphs.push(p('..........................................................................................................................................................................'));
        paragraphs.push(p('..........................................................................................................................................................................'));
        paragraphs.push(p('..........................................................................................................................................................................'));
        paragraphs.push(emptyLine());
        qCounter++;
      }
    }

    // Trang BẢNG ĐÁP ÁN VÀ BAREM CHẤM
    paragraphs.push(pageBreak());
    paragraphs.push(p('ĐÁP ÁN VÀ HƯỚNG DẪN CHẤM CHI TIẾT', true, false, 'center'));
    paragraphs.push(p(`ĐỀ THI: ${exam.title.toUpperCase()}`, true, false, 'center'));
    paragraphs.push(p('-----------------------------------------------------------------------------------------------------------------', false, false, 'center'));
    paragraphs.push(emptyLine());

    let ansCounter = 1;
    if (part1.length > 0) {
      paragraphs.push(p('I. ĐÁP ÁN PHẦN I (TRẮC NGHIỆM NHIỀU LỰA CHỌN):', true));
      const p1Answers = part1.map((q) => {
        const ca = Array.isArray(q.correct_answers) ? q.correct_answers.join(', ') : (q.correct_answers || 'A');
        const str = `Câu ${ansCounter}: ${ca}`;
        ansCounter++;
        return str;
      });
      for (let i = 0; i < p1Answers.length; i += 4) {
        paragraphs.push(p(p1Answers.slice(i, i + 4).join('   |   ')));
      }
      paragraphs.push(emptyLine());
    }

    if (part2.length > 0) {
      paragraphs.push(p('II. ĐÁP ÁN PHẦN II (TRẮC NGHIỆM ĐÚNG / SAI):', true));
      for (const q of part2) {
        let tfStr = '';
        if (q.correct_answers && typeof q.correct_answers === 'object' && !Array.isArray(q.correct_answers)) {
          tfStr = ['a', 'b', 'c', 'd'].map(k => `${k} - ${q.correct_answers[k] === 'T' ? 'Đ' : 'S'}`).join(', ');
        } else if (Array.isArray(q.correct_answers)) {
          tfStr = q.correct_answers.join(', ');
        } else {
          tfStr = 'Chưa thiết lập';
        }
        paragraphs.push(p(`Câu ${ansCounter}: ${tfStr}`));
        ansCounter++;
      }
      paragraphs.push(emptyLine());
    }

    if (part3.length > 0) {
      paragraphs.push(p('III. HƯỚNG DẪN CHẤM PHẦN III (TỰ LUẬN):', true));
      for (const q of part3) {
        paragraphs.push(p(`Câu ${ansCounter} (Tối đa ${q.max_score || 1.0} điểm):`, true));
        paragraphs.push(processContent(q.rubric_guide || 'Chấm điểm theo nội dung trả lời đúng trọng tâm câu hỏi của thí sinh.'));
        paragraphs.push(emptyLine());
        ansCounter++;
      }
    }

    // Build Content_Types.xml
    const extensionsFound = new Set(['rels', 'xml']);
    mediaRelationships.forEach(m => extensionsFound.add(m.ext));
    const defaultTypes = [...extensionsFound].map(ext => {
      let mime = 'application/xml';
      if (ext === 'rels') mime = 'application/vnd.openxmlformats-package.relationships+xml';
      else if (ext === 'png') mime = 'image/png';
      else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
      else if (ext === 'gif') mime = 'image/gif';
      else if (ext === 'svg') mime = 'image/svg+xml';
      return `<Default Extension="${ext}" ContentType="${mime}"/>`;
    }).join('\n  ');

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaultTypes}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // word/_rels/document.xml.rels
    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${mediaRelationships.map(m => `<Relationship Id="${m.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${m.target}"/>`).join('\n  ')}
</Relationships>`;
    zip.file('word/_rels/document.xml.rels', relsXml);

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${paragraphs.join('\n')}
  </w:body>
</w:document>`;

    zip.file('word/document.xml', docXml);

    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    return {
      examTitle: exam.title,
      buffer
    };
  }
}

module.exports = new ExamExportService();
