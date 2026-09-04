const JSZip = require('jszip');
const db = require('../db');

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

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

    // Helper builders
    const p = (text, isBold = false, isItalic = false, align = 'left') => {
      const alignXml = align !== 'left' ? `<w:pPr><w:jc w:val="${align}"/></w:pPr>` : '';
      const rPrXml = (isBold || isItalic) ? `<w:rPr>${isBold ? '<w:b/>' : ''}${isItalic ? '<w:i/>' : ''}</w:rPr>` : '';
      return `<w:p>${alignXml}<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
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
        paragraphs.push(p(`Câu ${qCounter}: ${q.content} (${q.max_score || 0.25} điểm)`, true));
        const opts = Array.isArray(q.options) ? q.options : [];
        for (const opt of opts) {
          paragraphs.push(p(`   ${opt.id}. ${opt.text}`));
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
        paragraphs.push(p(`Câu ${qCounter}: ${q.content} (${q.max_score || 1.0} điểm)`, true));
        const subKeys = ['a', 'b', 'c', 'd'];
        const opts = Array.isArray(q.options) && q.options.length > 0 ? q.options : subKeys.map(k => ({ id: k, text: '' }));
        for (const opt of opts) {
          paragraphs.push(p(`   ${opt.id.toLowerCase()}) ${opt.text}`));
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
        paragraphs.push(p(q.content));
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
      // Print in groups of 4 per line
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
        paragraphs.push(p(q.rubric_guide || 'Chấm điểm theo nội dung trả lời đúng trọng tâm câu hỏi của thí sinh.'));
        paragraphs.push(emptyLine());
        ansCounter++;
      }
    }

    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
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
