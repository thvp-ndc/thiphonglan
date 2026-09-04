const mammoth = require('mammoth');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { parseOMMLNode } = require('./ommlToLatex');
const { normalizeTrueFalseMap } = require('./trueFalseUtils');

/**
 * Service bóc tách đề thi từ file Word (.docx)
 * Hỗ trợ nhận diện tự động chuẩn Bộ GD&ĐT 2025:
 * - PHẦN I: Trắc nghiệm nhiều lựa chọn (A, B, C, D)
 * - PHẦN II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d; đáp án Đ/S hoặc đánh dấu *)
 * - PHẦN III: Tự luận (kèm điểm số và barem chấm)
 * Hỗ trợ bóc tách công thức toán học Word Equation (OMML sang LaTeX)
 * Hỗ trợ bóc tách hình ảnh nhúng trong file Word (lưu vào server/uploads/images/)
 */
class WordExamParser {
  async parseWordBuffer(buffer) {
    // Thử bóc tách nâng cao với JSZip để giữ trọn vẹn công thức toán và hình ảnh
    try {
      if (buffer && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        const parsed = await this.parseDocxWithOmmlAndMedia(buffer);
        if (parsed && parsed.questions && parsed.questions.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[WordExamParser] Advanced parseDocx failed, falling back to mammoth:', err.message);
    }

    // Dự phòng bằng mammoth nếu file là định dạng cũ hoặc cấu trúc lạ
    const result = await mammoth.extractRawText({ buffer });
    const fullText = result.value || '';
    return this.parseExamText(fullText);
  }

  async parseDocxWithOmmlAndMedia(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('word/document.xml không tồn tại trong file .docx');
    }

    // 1. Trích xuất quan hệ hình ảnh từ word/_rels/document.xml.rels
    const relMap = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    if (relsFile) {
      try {
        const relsXml = await relsFile.async('text');
        const relsDom = new DOMParser().parseFromString(relsXml, 'text/xml');
        const relElements = relsDom.getElementsByTagName('Relationship');

        const uploadsDir = path.resolve(__dirname, '../../uploads/images');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        for (let i = 0; i < relElements.length; i++) {
          const rel = relElements[i];
          const type = rel.getAttribute('Type') || '';
          const rId = rel.getAttribute('Id') || '';
          let target = rel.getAttribute('Target') || '';

          if (type.includes('/image') && rId && target) {
            // Chuẩn hóa đường dẫn file ảnh trong zip
            let zipImgPath = target;
            if (zipImgPath.startsWith('../')) {
              zipImgPath = zipImgPath.replace(/^\.\.\//, 'word/');
            } else if (!zipImgPath.startsWith('word/')) {
              zipImgPath = 'word/' + zipImgPath.replace(/^\//, '');
            }

            const imgFileInZip = zip.file(zipImgPath);
            if (imgFileInZip) {
              const imgBuffer = await imgFileInZip.async('nodebuffer');
              const ext = path.extname(zipImgPath).toLowerCase() || '.png';
              const fileName = `word_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
              const diskPath = path.join(uploadsDir, fileName);
              fs.writeFileSync(diskPath, imgBuffer);
              relMap[rId] = `/uploads/images/${fileName}`;
            }
          }
        }
      } catch (e) {
        console.warn('[WordExamParser] Lỗi trích xuất quan hệ ảnh rels:', e.message);
      }
    }

    // 2. Phân tích nội dung XML của document.xml
    const docXml = await docXmlFile.async('text');
    const dom = new DOMParser().parseFromString(docXml, 'text/xml');

    const paragraphs = [];
    const bodyElements = dom.getElementsByTagName('w:body');
    const root = bodyElements.length > 0 ? bodyElements[0] : dom.documentElement;

    this.collectParagraphs(root, paragraphs, relMap);

    const fullText = paragraphs.join('\n');
    return this.parseExamText(fullText);
  }

  collectParagraphs(node, paragraphs, relMap) {
    if (!node) return;

    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const tag = child.localName || child.nodeName.split(':').pop();

      if (tag === 'p') {
        const pText = this.extractNodeText(child, relMap).trim();
        if (pText) {
          paragraphs.push(pText);
        }
      } else if (tag === 'tbl') {
        // Hỗ trợ duyệt qua bảng
        const rows = child.getElementsByTagName('w:tr');
        for (let r = 0; r < rows.length; r++) {
          const cells = rows[r].getElementsByTagName('w:tc');
          for (let c = 0; c < cells.length; c++) {
            const cellPs = cells[c].getElementsByTagName('w:p');
            for (let cp = 0; cp < cellPs.length; cp++) {
              const cpText = this.extractNodeText(cellPs[cp], relMap).trim();
              if (cpText) paragraphs.push(cpText);
            }
          }
        }
      } else {
        this.collectParagraphs(child, paragraphs, relMap);
      }
    }
  }

  extractNodeText(node, relMap) {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';

    const tag = node.localName || node.nodeName.split(':').pop();

    if (tag === 'oMath' || tag === 'oMathPara') {
      const latex = parseOMMLNode(node);
      return latex ? ` ${latex} ` : '';
    }

    if (tag === 'drawing' || tag === 'pict') {
      const rId = this.findEmbedId(node);
      if (rId && relMap && relMap[rId]) {
        return `\n![Hình ảnh](${relMap[rId]})\n`;
      }
      return '';
    }

    if (tag === 't') {
      return node.textContent || '';
    }

    if (tag === 'tab') {
      return ' ';
    }

    if (tag === 'br' || tag === 'cr') {
      return '\n';
    }

    let text = '';
    for (let child = node.firstChild; child; child = child.nextSibling) {
      text += this.extractNodeText(child, relMap);
    }
    return text;
  }

  findEmbedId(element) {
    if (!element || !element.attributes) return null;
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      if (
        attr.name === 'r:embed' ||
        attr.name === 'embed' ||
        attr.name === 'r:id' ||
        attr.localName === 'embed' ||
        attr.localName === 'id'
      ) {
        return attr.value;
      }
    }
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1) {
        const found = this.findEmbedId(child);
        if (found) return found;
      }
    }
    return null;
  }

  parseExamText(text) {
    const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (rawLines.length === 0) {
      throw new Error('File Word rỗng hoặc không có văn bản');
    }

    // Tiền xử lý: nếu 1 dòng chứa cả 4 đáp án A. ... B. ... C. ... D. ... thì tách ra từng dòng
    const lines = [];
    for (const line of rawLines) {
      const inlineSplit = this.splitInlineOptions(line);
      lines.push(...inlineSplit);
    }

    let examTitle = 'Đề Thi Nhập Từ File Word';
    if (lines[0] && !lines[0].match(/^(?:Câu|CÂU|Bài|BÀI)\s+\d+/i)) {
      examTitle = lines[0].replace(/^[\s#*_-]+/, '').trim();
    }

    const questions = [];
    let currentQ = null;
    let currentSection = 'single_choice'; // 'single_choice' | 'true_false' | 'essay'

    // Regex patterns for section headers
    const part1Regex = /^(?:PHẦN|Phần)\s*(?:I|1|A)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TRẮC\s*NGHIỆM\s+)?(?:NHIỀU|NHIEU)/i;
    const part2Regex = /^(?:PHẦN|Phần)\s*(?:II|2|B)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TRẮC\s*NGHIỆM\s+)?(?:ĐÚNG|DUNG)/i;
    const part3Regex = /^(?:PHẦN|Phần)\s*(?:III|3|C)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TỰ|TƯ|TU)\s*LUẬN/i;

    const questionHeaderRegex = /^(?:Câu|CÂU|Bài|BÀI)\s*(\d+)[\s:.-]+(.*)/i;
    
    // MCQ Options A, B, C, D (Upper case)
    const mcqOptionRegex = /^([*]?[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])[\s:.)-]+(.*)/;
    
    // True/False Sub-items a, b, c, d (Lower case)
    const tfSubItemRegex = /^([*]?[a-d][*]?|[a-d]\*|\([a-d]\)|\[[a-d]\])[\s:.)-]+(.*)/;
    
    // Answer tags
    const answerTagRegex = /(?:Đáp án|ĐA|Đáp án đúng|ĐÁP ÁN)[\s:.-]*(.*)/i;
    const scoreRegex = /\((\d+(?:[,.]\d+)?)\s*(?:điểm|đ|d)\)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check section transitions
      if (part3Regex.test(line)) {
        currentSection = 'essay';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }
      if (part2Regex.test(line)) {
        currentSection = 'true_false';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }
      if (part1Regex.test(line) && !part2Regex.test(line) && !part3Regex.test(line)) {
        currentSection = 'single_choice';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }

      // Check for Question Header: "Câu 1: ...", "Câu 2: ..."
      const qMatch = line.match(questionHeaderRegex);
      if (qMatch) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
        }

        const qNum = parseInt(qMatch[1], 10);
        let content = qMatch[2].trim();

        // Check if question specifies score e.g. (2.0 điểm)
        let maxScore = null;
        const scoreMatch = content.match(scoreRegex) || line.match(scoreRegex);
        if (scoreMatch) {
          maxScore = parseFloat(scoreMatch[1].replace(',', '.'));
          content = content.replace(scoreRegex, '').trim();
        }

        // Check if explicitly marked as essay or true_false in title
        const isExplicitEssay = /tự luận|TL/i.test(line);
        const isExplicitTF = /đúng[\s/]*sai|Đ\/S/i.test(line);

        let qType = currentSection;
        if (isExplicitEssay) qType = 'essay';
        else if (isExplicitTF) qType = 'true_false';

        if (maxScore === null) {
          if (qType === 'essay') maxScore = 2.5;
          else if (qType === 'true_false') maxScore = 1.0;
          else maxScore = 0.25;
        }

        currentQ = {
          order_index: questions.length + 1,
          question_type: qType,
          content: content,
          max_score: maxScore,
          options: [],
          correct_answers: qType === 'true_false' ? { a: 'F', b: 'F', c: 'F', d: 'F' } : [],
          rubric_guide: '',
          raw_lines: []
        };
        continue;
      }

      if (!currentQ) continue;

      // 1. Check for True/False Sub-items a), b), c), d) (Lower case)
      const tfMatch = line.match(tfSubItemRegex);
      if (tfMatch && currentQ.question_type !== 'essay') {
        currentQ.question_type = 'true_false';
        if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
          currentQ.correct_answers = { a: 'F', b: 'F', c: 'F', d: 'F' };
        }

        let prefix = tfMatch[1];
        let subText = tfMatch[2].trim();
        let isCorrect = false;

        if (prefix.includes('*')) {
          isCorrect = true;
          prefix = prefix.replace(/\*/g, '');
        }

        const subId = prefix.toLowerCase().replace(/[^a-d]/g, '');
        if (subId) {
          currentQ.options.push({
            id: subId,
            text: subText
          });
          if (isCorrect) {
            currentQ.correct_answers[subId] = 'T';
          }
        }
        continue;
      }

      // 2. Check for Standard MCQ Options A, B, C, D (Upper case)
      const mcqMatch = line.match(mcqOptionRegex);
      if (mcqMatch && currentQ.question_type !== 'essay' && currentQ.question_type !== 'true_false') {
        let optPrefix = mcqMatch[1];
        let optText = mcqMatch[2].trim();
        let isCorrect = false;

        if (optPrefix.includes('*')) {
          isCorrect = true;
          optPrefix = optPrefix.replace(/\*/g, '');
        }

        const cleanOptId = optPrefix.replace(/[^A-D]/g, '');
        if (cleanOptId) {
          currentQ.options.push({
            id: cleanOptId,
            text: optText
          });

          if (isCorrect) {
            if (!Array.isArray(currentQ.correct_answers)) currentQ.correct_answers = [];
            currentQ.correct_answers.push(cleanOptId);
          }
        }
        continue;
      }

      // 3. Check for Answer Tag at end of question
      const ansMatch = line.match(answerTagRegex);
      if (ansMatch && currentQ.question_type !== 'essay') {
        const ansRaw = ansMatch[1].trim();

        // Check if this is a True/False answer line: e.g. "a - Đ, b - S, c - Đ, d - Đ"
        const tfPairRegex = /([a-d])[\s:.-]+([ĐSđsTFtf]|Đúng|Sai|True|False)/gi;
        const matches = [...ansRaw.matchAll(tfPairRegex)];

        if (matches.length > 0 || currentQ.question_type === 'true_false') {
          currentQ.question_type = 'true_false';
          if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
            currentQ.correct_answers = { a: 'F', b: 'F', c: 'F', d: 'F' };
          }
          matches.forEach(m => {
            const subKey = m[1].toLowerCase();
            const valStr = m[2].toUpperCase();
            const isT = valStr.startsWith('Đ') || valStr.startsWith('D') || valStr.startsWith('T');
            currentQ.correct_answers[subKey] = isT ? 'T' : 'F';
          });
        } else {
          // Standard MCQ answer: e.g. "Đáp án: B"
          const correctLetters = ansRaw.replace(/[^A-D]/g, '').split('');
          if (correctLetters.length > 0) {
            currentQ.correct_answers = correctLetters;
          }
        }
        continue;
      }

      // 4. Check for Rubric / Barem guide in Essay question
      if (currentQ.question_type === 'essay' && /^(?:Hướng dẫn chấm|Barem|Đáp án mẫu|Gợi ý)[\s:.-]/i.test(line)) {
        currentQ.rubric_guide += line + '\n';
        continue;
      }

      // Additional text lines: either extra lines of question body, or extra line of an option (e.g. image or multiline)
      if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
        currentQ.content += (currentQ.content ? '\n' : '') + line;
      } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
        // Append line (e.g. image or equation) to the latest option
        const lastOpt = currentQ.options[currentQ.options.length - 1];
        lastOpt.text += (lastOpt.text ? '\n' : '') + line;
      } else if (currentQ.rubric_guide) {
        currentQ.rubric_guide += line + '\n';
      }
    }

    if (currentQ) {
      this.finalizeQuestion(currentQ, questions);
    }

    if (questions.length === 0) {
      throw new Error('Không thể nhận diện câu hỏi từ file Word. Vui lòng đảm bảo các câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:"');
    }

    return {
      title: examTitle,
      total_questions: questions.length,
      questions
    };
  }

  splitInlineOptions(line) {
    // Tách dòng có nhiều phương án: "A. ... B. ... C. ... D. ..."
    // Kiểm tra xem dòng có chứa ít nhất 2 phương án trở lên
    const pattern = /(?:^|\s+)((?:[*]?)[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])[\s:.)-]+/g;
    const matches = [...line.matchAll(pattern)];

    if (matches.length >= 2 && matches[0].index === 0) {
      const parts = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : line.length;
        parts.push(line.substring(start, end).trim());
      }
      return parts;
    }

    return [line];
  }

  finalizeQuestion(q, questionsList) {
    if (q.question_type === 'true_false') {
      if (!q.options || q.options.length < 2) {
        // Fallback if not enough options
        q.question_type = 'essay';
        q.max_score = q.max_score === 1.0 ? 2.5 : q.max_score;
      } else {
        if (!q.max_score || q.max_score === 0.25) {
          q.max_score = 1.0;
        }
        q.correct_answers = normalizeTrueFalseMap(q.correct_answers);
      }
    } else if (q.question_type !== 'essay') {
      if (!q.options || q.options.length < 2) {
        q.question_type = 'essay';
        q.max_score = q.max_score === 1.0 ? 2.5 : q.max_score;
      } else {
        if (!q.correct_answers || q.correct_answers.length === 0) {
          q.correct_answers = ['A'];
        } else if (q.correct_answers.length > 1) {
          q.question_type = 'multiple_choice';
        }
      }
    }

    q.content = q.content.trim();
    if (q.rubric_guide) q.rubric_guide = q.rubric_guide.trim();

    questionsList.push(q);
  }
}

module.exports = new WordExamParser();
