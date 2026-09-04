const db = require('../db');
const crypto = require('node:crypto');

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

class ExamService {
  getAllExams() {
    const exams = db.prepare('SELECT * FROM exams ORDER BY created_at DESC').all();
    return exams.map((exam) => {
      const qStats = db.prepare(`
        SELECT 
          COUNT(*) as total_questions,
          SUM(CASE WHEN question_type = 'single_choice' OR question_type = 'multiple_choice' THEN 1 ELSE 0 END) as mcq_count,
          SUM(CASE WHEN question_type = 'true_false' THEN 1 ELSE 0 END) as tf_count,
          SUM(CASE WHEN question_type = 'essay' THEN 1 ELSE 0 END) as essay_count,
          SUM(max_score) as sum_score
        FROM questions WHERE exam_id = ?
      `).get(exam.id);
      return {
        ...exam,
        total_questions: qStats.total_questions || 0,
        mcq_count: qStats.mcq_count || 0,
        tf_count: qStats.tf_count || 0,
        essay_count: qStats.essay_count || 0,
        sum_score: qStats.sum_score || 0
      };
    });
  }

  getExamById(id, includeAnswers = true) {
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
    if (!exam) return null;

    const questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(id);
    
    exam.questions = questions.map((q) => {
      const parsed = {
        ...q,
        options: q.options_json ? JSON.parse(q.options_json) : [],
        correct_answers: includeAnswers && q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
      };
      if (!includeAnswers) {
        delete parsed.correct_answers_json;
        delete parsed.rubric_guide; // Do not leak rubric to student during exam
      }
      return parsed;
    });

    return exam;
  }

  createExam({ title, subject, total_score = 10.0, shuffle_questions = 1, shuffle_options = 1, questions = [] }) {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO exams (id, title, subject, duration_minutes, total_score, status, shuffle_questions, shuffle_options)
      VALUES (?, ?, ?, 45, ?, 'active', ?, ?)
    `).run(id, title, subject, Number(total_score), shuffle_questions ? 1 : 0, shuffle_options ? 1 : 0);

    const insertQ = db.prepare(`
      INSERT INTO questions (id, exam_id, order_index, question_type, content, options_json, correct_answers_json, rubric_guide, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach((q, idx) => {
      const qId = crypto.randomUUID();
      insertQ.run(
        qId,
        id,
        idx + 1,
        q.question_type || 'single_choice',
        q.content,
        JSON.stringify(q.options || []),
        JSON.stringify(q.correct_answers || []),
        q.rubric_guide || '',
        Number(q.max_score || 1.0)
      );
    });

    return this.getExamById(id, true);
  }

  updateExam(id, { title, subject, total_score = 10.0, shuffle_questions = 1, shuffle_options = 1, questions = [] }) {
    db.prepare(`
      UPDATE exams 
      SET title = ?, subject = ?, total_score = ?, shuffle_questions = ?, shuffle_options = ?
      WHERE id = ?
    `).run(title, subject, Number(total_score), shuffle_questions ? 1 : 0, shuffle_options ? 1 : 0, id);

    // Delete existing questions and reinsert
    db.prepare('DELETE FROM questions WHERE exam_id = ?').run(id);

    const insertQ = db.prepare(`
      INSERT INTO questions (id, exam_id, order_index, question_type, content, options_json, correct_answers_json, rubric_guide, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    questions.forEach((q, idx) => {
      const qId = q.id || crypto.randomUUID();
      insertQ.run(
        qId,
        id,
        idx + 1,
        q.question_type || 'single_choice',
        q.content,
        JSON.stringify(q.options || []),
        JSON.stringify(q.correct_answers || []),
        q.rubric_guide || '',
        Number(q.max_score || 1.0)
      );
    });

    return this.getExamById(id, true);
  }

  deleteExam(id) {
    db.prepare('DELETE FROM exams WHERE id = ?').run(id);
    return true;
  }

  // SESSIONS
  getAllSessions() {
    return db.prepare(`
      SELECT s.*, e.title as exam_title,
        (SELECT COUNT(*) FROM student_attempts WHERE session_id = s.id) as student_count,
        (SELECT COUNT(*) FROM session_students WHERE session_id = s.id) as assigned_student_count
      FROM exam_sessions s
      JOIN exams e ON s.exam_id = e.id
      ORDER BY s.created_at DESC
    `).all();
  }

  createSession({ exam_id, session_code, title, duration_minutes = 45, status = 'waiting' }) {
    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO exam_sessions (id, exam_id, session_code, title, duration_minutes, status, start_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, exam_id, session_code.toUpperCase(), title, Number(duration_minutes), status, status === 'in_progress' ? new Date().toISOString() : null);
    return this.getSessionByCode(session_code);
  }

  updateSession(id, { session_code, title, duration_minutes = 45, status = 'waiting', exam_id }) {
    if (exam_id) {
      db.prepare(`
        UPDATE exam_sessions 
        SET session_code = ?, title = ?, duration_minutes = ?, status = ?, exam_id = ?
        WHERE id = ?
      `).run(session_code.toUpperCase(), title, Number(duration_minutes), status, exam_id, id);
    } else {
      db.prepare(`
        UPDATE exam_sessions 
        SET session_code = ?, title = ?, duration_minutes = ?, status = ?
        WHERE id = ?
      `).run(session_code.toUpperCase(), title, Number(duration_minutes), status, id);
    }
    return db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(id);
  }

  deleteSession(id) {
    db.prepare('DELETE FROM exam_sessions WHERE id = ?').run(id);
    return true;
  }

  startSession(id) {
    const nowIso = new Date().toISOString();
    const session = this.getSessionById(id);

    db.prepare(`
      UPDATE exam_sessions 
      SET status = 'in_progress', start_time = ?
      WHERE id = ?
    `).run(nowIso, id);

    // Also transition any waiting attempts to in_progress with this start_time
    const result = db.prepare(`
      UPDATE student_attempts 
      SET status = 'in_progress', start_time = ?
      WHERE session_id = ? AND status = 'waiting'
    `).run(nowIso, id);

    // Pre-generate and store individual exam papers for all attempts in this session if missing
    if (session) {
      const waitingAttempts = db.prepare('SELECT id, exam_paper_json FROM student_attempts WHERE session_id = ?').all(id);
      for (const att of waitingAttempts) {
        if (!att.exam_paper_json) {
          const paper = this.generateStudentExamPaper(
            session.exam_id,
            session.shuffle_questions === 1,
            session.shuffle_options === 1
          );
          db.prepare('UPDATE student_attempts SET exam_paper_json = ? WHERE id = ?').run(JSON.stringify(paper), att.id);
        }
      }
    }

    return {
      session: this.getSessionById(id),
      startedAttemptsCount: result.changes,
      startTime: nowIso
    };
  }

  finishSession(id) {
    const gradingService = require('./gradingService');

    // 1. Mark session as finished
    db.prepare(`
      UPDATE exam_sessions 
      SET status = 'finished', end_time = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);

    // 2. Automatically submit and grade any students who are still in progress
    const activeAttempts = db.prepare(`
      SELECT id FROM student_attempts 
      WHERE session_id = ? AND status = 'in_progress'
    `).all(id);

    let autoSubmittedCount = 0;
    for (const att of activeAttempts) {
      db.prepare(`
        UPDATE student_attempts 
        SET status = 'forced_submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(att.id);

      gradingService.autoGradeAttempt(att.id);
      autoSubmittedCount++;
    }

    return {
      sessionId: id,
      autoSubmittedCount
    };
  }

  getSessionById(id) {
    const session = db.prepare(`
      SELECT s.*, e.title as exam_title, e.shuffle_questions, e.shuffle_options, e.total_score
      FROM exam_sessions s
      JOIN exams e ON s.exam_id = e.id
      WHERE s.id = ?
    `).get(id);
    return session || null;
  }

  getSessionByCode(code) {
    const session = db.prepare(`
      SELECT s.*, e.title as exam_title, e.shuffle_questions, e.shuffle_options, e.total_score
      FROM exam_sessions s
      JOIN exams e ON s.exam_id = e.id
      WHERE UPPER(s.session_code) = UPPER(?)
    `).get(code);
    return session || null;
  }

  // --- SESSION STUDENTS MANAGEMENT ---
  getSessionStudents(sessionId) {
    return db.prepare(`
      SELECT st.id, st.student_code, st.student_name, st.class_name, st.gender,
             ss.created_at as assigned_at,
             att.id as attempt_id, att.status as attempt_status, att.client_ip,
             att.mcq_score, att.essay_score, att.total_score, att.submitted_at
      FROM session_students ss
      JOIN students st ON ss.student_id = st.id
      LEFT JOIN student_attempts att ON att.session_id = ss.session_id AND UPPER(att.student_code) = UPPER(st.student_code)
      WHERE ss.session_id = ?
      ORDER BY st.class_name ASC, st.student_code ASC
    `).all(sessionId);
  }

  getSessionStudentCount(sessionId) {
    const row = db.prepare('SELECT COUNT(*) as count FROM session_students WHERE session_id = ?').get(sessionId);
    return row ? row.count : 0;
  }

  addStudentsToSession(sessionId, studentIds = []) {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO session_students (id, session_id, student_id)
      VALUES (?, ?, ?)
    `);
    let addedCount = 0;
    for (const sId of studentIds) {
      const res = insertStmt.run(crypto.randomUUID(), sessionId, sId);
      if (res.changes > 0) addedCount++;
    }
    return { addedCount, totalInSession: this.getSessionStudentCount(sessionId) };
  }

  addStudentsByClassToSession(sessionId, className) {
    const students = db.prepare('SELECT id FROM students WHERE class_name = ?').all(className);
    const studentIds = students.map(s => s.id);
    return this.addStudentsToSession(sessionId, studentIds);
  }

  removeStudentFromSession(sessionId, studentId) {
    db.prepare('DELETE FROM session_students WHERE session_id = ? AND student_id = ?').run(sessionId, studentId);
    return true;
  }

  clearSessionStudents(sessionId) {
    db.prepare('DELETE FROM session_students WHERE session_id = ?').run(sessionId);
    return true;
  }

  isStudentAllowedInSession(sessionId, studentCode) {
    const assignedCount = this.getSessionStudentCount(sessionId);
    // If no students assigned specifically to this session, allow any registered student
    if (assignedCount === 0) {
      return { allowed: true, hasRoster: false };
    }
    // If ca thi has an assigned roster, verify studentCode is in the list
    const found = db.prepare(`
      SELECT ss.id
      FROM session_students ss
      JOIN students st ON ss.student_id = st.id
      WHERE ss.session_id = ? AND UPPER(st.student_code) = UPPER(?)
    `).get(sessionId, studentCode.trim());

    return { allowed: !!found, hasRoster: true };
  }

  // Prepares the exam paper for a specific student
  // ĐÁP ÁN A, B, C, D TRONG PHẦN LÀM BÀI CỦA HỌC SINH GIỮ NGUYÊN THỨ TỰ, CHỈ ĐẢO NỘI DUNG VÀ ĐỒNG BỘ ĐÁP ÁN ĐÚNG
  // RIÊNG PHẦN TỰ LUẬN KHÔNG BAO GIỜ BỊ XÁO TRỘN THEO YÊU CẦU
  generateStudentExamPaper(examId, shuffleQ = true, shuffleOpt = true) {
    const exam = this.getExamById(examId, true); // TRUE: Tải kèm đáp án đúng để đồng bộ chính xác khi đảo
    if (!exam) return null;

    const STANDARD_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

    // Tách riêng 3 nhóm câu hỏi theo chuẩn Bộ GD&ĐT:
    // - Phần I: Trắc nghiệm lựa chọn (A, B, C, D)
    // - Phần II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d)
    // - Phần III: Tự luận (giữ nguyên vị trí ở cuối)
    const part1Questions = (exam.questions || []).filter(q => q.question_type === 'single_choice' || q.question_type === 'multiple_choice');
    const part2Questions = (exam.questions || []).filter(q => q.question_type === 'true_false');
    const essayQuestions = (exam.questions || []).filter(q => q.question_type === 'essay');

    // 1. Xáo trộn thứ tự các câu hỏi trong từng phần riêng biệt nếu được bật
    let finalPart1 = shuffleQ ? shuffleArray(part1Questions) : [...part1Questions];
    let finalPart2 = shuffleQ ? shuffleArray(part2Questions) : [...part2Questions];

    // 2. Xáo trộn NỘI DUNG các lựa chọn của Phần I (Giữ nguyên nhãn A, B, C, D)
    finalPart1 = finalPart1.map(q => {
      let options = q.options || [];
      let correctAnswers = q.correct_answers || [];

      if (shuffleOpt && options.length > 1) {
        const labels = options.map((opt, idx) => STANDARD_LABELS[idx] || opt.id || String.fromCharCode(65 + idx));
        const items = options.map((opt, idx) => ({
          originalId: opt.id || labels[idx],
          text: opt.text
        }));
        const shuffledItems = shuffleArray(items);
        options = shuffledItems.map((item, idx) => ({
          id: labels[idx],
          text: item.text
        }));
        const originalCorrectSet = new Set(correctAnswers);
        const newCorrectAnswers = [];
        shuffledItems.forEach((item, idx) => {
          if (originalCorrectSet.has(item.originalId)) {
            newCorrectAnswers.push(labels[idx]);
          }
        });
        correctAnswers = newCorrectAnswers;
      } else if (options.length > 0) {
        options = options.map((opt, idx) => ({
          id: STANDARD_LABELS[idx] || opt.id,
          text: opt.text
        }));
      }

      return {
        ...q,
        options,
        correct_answers: correctAnswers
      };
    });

    // Phần II (Đúng/Sai): Giữ nguyên 100% thứ tự các ý a, b, c, d và đáp án
    finalPart2 = finalPart2.map(q => ({
      ...q,
      options: (q.options || []).map(opt => ({
        id: opt.id.toLowerCase(),
        text: opt.text
      }))
    }));

    // 3. RIÊNG PHẦN TỰ LUẬN: GIỮ NGUYÊN 100% THỨ TỰ GỐC DO GIÁO VIÊN SOẠN
    const finalEssay = [...essayQuestions];

    // Ghép lại theo đúng thứ tự sư phạm: Phần I -> Phần II (Đúng/Sai) -> Phần III (Tự Luận)
    const allQuestions = [...finalPart1, ...finalPart2, ...finalEssay].map((q, idx) => ({
      ...q,
      display_order: idx + 1
    }));

    exam.questions = allQuestions;
    return exam;
  }

  // Lấy hoặc khởi tạo đề thi cố định cho từng thí sinh (lưu vào student_attempts.exam_paper_json)
  getOrCreateStudentAttemptPaper(attemptId, session) {
    if (attemptId) {
      const attempt = db.prepare('SELECT id, exam_paper_json FROM student_attempts WHERE id = ?').get(attemptId);
      if (attempt && attempt.exam_paper_json) {
        try {
          return JSON.parse(attempt.exam_paper_json);
        } catch (e) {
          console.error('Error parsing existing exam_paper_json:', e);
        }
      }
    }

    // Nếu chưa có thì sinh mới đề thi
    const paper = this.generateStudentExamPaper(
      session.exam_id,
      session.shuffle_questions === 1,
      session.shuffle_options === 1
    );

    if (attemptId && paper) {
      db.prepare('UPDATE student_attempts SET exam_paper_json = ? WHERE id = ?').run(JSON.stringify(paper), attemptId);
    }
    return paper;
  }

  // Ẩn đáp án đúng và barem chấm điểm trước khi gửi đề thi xuống máy học sinh
  sanitizeStudentPaper(paper) {
    if (!paper) return null;
    return {
      ...paper,
      questions: (paper.questions || []).map(q => {
        const { correct_answers, correct_answers_json, rubric_guide, ...safeQ } = q;
        return safeQ;
      })
    };
  }
}

module.exports = new ExamService();
