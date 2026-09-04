const mammoth = require('mammoth');
const crypto = require('node:crypto');
const { normalizeTrueFalseMap } = require('./trueFalseUtils');

/**
 * Service bóc tách đề thi từ file Word (.docx)
 * Hỗ trợ nhận diện tự động chuẩn Bộ GD&ĐT 2025:
 * - PHẦN I: Trắc nghiệm nhiều lựa chọn (A, B, C, D)
 * - PHẦN II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d; đáp án Đ/S hoặc đánh dấu *)
 * - PHẦN III: Tự luận (kèm điểm số và barem chấm)
 */
class WordExamParser {
  async parseWordBuffer(buffer) {
    const result = await mammoth.extractRawText({ buffer });
    const fullText = result.value || '';
    return this.parseExamText(fullText);
  }

  parseExamText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      throw new Error('File Word rỗng hoặc không có văn bản');
    }

    let examTitle = 'Đề Thi Nhập Từ File Word';
    if (lines[0] && !lines[0].match(/^(?:Câu|CÂU|Bài|BÀI)\s+\d+/i)) {
      examTitle = lines[0].replace(/^[\s#*_-]+/, '').trim();
    }

    const questions = [];
    let currentQ = null;
    let currentSection = 'single_choice'; // 'single_choice' | 'true_false' | 'essay'

    // Regex patterns for section headers
    const part1Regex = /^(?:PHẦN|Phần)\s*(?:I|1|A)?[.:\s-]*(?:CÂU\s+)?(?:TRẮC NGHIỆM\s+)?(?:NHIỀU|NHIEU)/i;
    const part2Regex = /^(?:PHẦN|Phần)\s*(?:II|2|B)?[.:\s-]*(?:CÂU\s+)?(?:TRẮC NGHIỆM\s+)?(?:ĐÚNG\s*[\/-]?\s*SAI|DUNG\s*[\/-]?\s*SAI)/i;
    const part3Regex = /^(?:PHẦN|Phần)\s*(?:III|3|C)?[.:\s-]*(?:CÂU\s+HỎI\s+)?(?:TỰ LUẬN|TƯ LUẬN|TU LUAN)/i;

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

      // Additional text lines
      if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
        currentQ.content += (currentQ.content ? '\n' : '') + line;
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
