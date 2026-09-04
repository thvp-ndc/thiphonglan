const db = require('../db');
const XLSX = require('xlsx');

const { calculateTrueFalseScore } = require('./trueFalseUtils');

class GradingService {
  autoGradeAttempt(attemptId) {
    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt) return null;

    // Load question definitions from attempt's exam_paper_json if available (to match shuffled options/answers)
    const attemptQuestionsMap = {};
    if (attempt.exam_paper_json) {
      try {
        const paper = JSON.parse(attempt.exam_paper_json);
        (paper.questions || []).forEach(q => {
          attemptQuestionsMap[q.id] = q;
        });
      } catch (e) {
        console.error('Error parsing attempt exam_paper_json:', e);
      }
    }

    const answers = db.prepare(`
      SELECT sa.*, q.question_type, q.correct_answers_json, q.max_score
      FROM student_answers sa
      JOIN questions q ON sa.question_id = q.id
      WHERE sa.attempt_id = ?
    `).all(attemptId);

    let totalMcqScore = 0.0;
    const updateAnswerScore = db.prepare('UPDATE student_answers SET auto_score = ? WHERE id = ?');

    for (const ans of answers) {
      if (ans.question_type !== 'essay') {
        const selected = ans.selected_options_json ? JSON.parse(ans.selected_options_json) : [];
        const attemptQ = attemptQuestionsMap[ans.question_id];
        const correct = (attemptQ && attemptQ.correct_answers)
          ? attemptQ.correct_answers
          : (ans.correct_answers_json ? JSON.parse(ans.correct_answers_json) : []);

        let score = 0.0;
        if (ans.question_type === 'single_choice') {
          if (selected.length > 0 && selected[0] === correct[0]) {
            score = Number(ans.max_score);
          }
        } else if (ans.question_type === 'true_false') {
          // BGDĐT 2025 progressive scale: 1 -> 0.1, 2 -> 0.25, 3 -> 0.5, 4 -> 1.0
          const tfResult = calculateTrueFalseScore(selected, correct, ans.max_score);
          score = tfResult.scoreObtained;
        } else if (ans.question_type === 'multiple_choice') {
          // Exact set match for multiple choice
          const selSorted = [...selected].sort().join(',');
          const corSorted = [...correct].sort().join(',');
          if (selSorted === corSorted && corSorted.length > 0) {
            score = Number(ans.max_score);
          }
        }
        updateAnswerScore.run(score, ans.id);
        totalMcqScore += score;
      }
    }
    totalMcqScore = Math.round(totalMcqScore * 100) / 100;

    // Check if there are essay questions
    const sessionRow = db.prepare('SELECT exam_id FROM exam_sessions WHERE id = ?').get(attempt.session_id);
    let essayCount = 0;
    if (sessionRow) {
      const essayQuestions = db.prepare(`
        SELECT id FROM questions WHERE exam_id = ? AND question_type = 'essay'
      `).all(sessionRow.exam_id);
      essayCount = essayQuestions.length;

      if (essayCount > 0) {
        const crypto = require('node:crypto');
        const insertEmpty = db.prepare(`
          INSERT OR IGNORE INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, auto_score, manual_score, teacher_feedback, updated_at)
          VALUES (?, ?, ?, '[]', '', 0.0, null, null, CURRENT_TIMESTAMP)
        `);
        for (const eq of essayQuestions) {
          const existing = db.prepare('SELECT id FROM student_answers WHERE attempt_id = ? AND question_id = ?').get(attemptId, eq.id);
          if (!existing) {
            insertEmpty.run(crypto.randomUUID(), attemptId, eq.id);
          }
        }
      }
    }

    // Check current essay manual scores
    const currentEssayScoreRow = db.prepare(`
      SELECT SUM(COALESCE(manual_score, 0)) as total_essay,
             COUNT(CASE WHEN manual_score IS NOT NULL THEN 1 END) as graded_essay_count
      FROM student_answers sa
      JOIN questions q ON sa.question_id = q.id
      WHERE sa.attempt_id = ? AND q.question_type = 'essay'
    `).get(attemptId);

    const totalEssayScore = currentEssayScoreRow.total_essay || 0.0;
    const gradedEssayCount = currentEssayScoreRow.graded_essay_count || 0;
    const isGraded = essayCount === 0 || gradedEssayCount >= essayCount ? 1 : 0;
    const totalScore = Math.round((totalMcqScore + totalEssayScore) * 100) / 100;

    db.prepare(`
      UPDATE student_attempts
      SET mcq_score = ?, essay_score = ?, total_score = ?, is_graded = ?
      WHERE id = ?
    `).run(totalMcqScore, totalEssayScore, totalScore, isGraded, attemptId);

    return {
      attemptId,
      mcq_score: totalMcqScore,
      essay_score: totalEssayScore,
      total_score: totalScore,
      is_graded: isGraded
    };
  }

  gradeEssayAnswer({ answerId, manualScore, teacherFeedback = '' }) {
    const answer = db.prepare(`
      SELECT sa.*, q.max_score, sa.attempt_id
      FROM student_answers sa
      JOIN questions q ON sa.question_id = q.id
      WHERE sa.id = ?
    `).get(answerId);

    if (!answer) throw new Error('Không tìm thấy bài trả lời tự luận');

    const score = Math.min(Math.max(0, Number(manualScore)), answer.max_score);

    db.prepare(`
      UPDATE student_answers
      SET manual_score = ?, teacher_feedback = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(score, teacherFeedback, answerId);

    // Recalculate attempt score
    return this.autoGradeAttempt(answer.attempt_id);
  }

  getEssaySubmissions(sessionId) {
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return [];

    // Đảm bảo mọi câu hỏi tự luận đều có bản ghi trong student_answers cho tất cả thí sinh ca này
    const essayQuestions = db.prepare(`
      SELECT id FROM questions WHERE exam_id = ? AND question_type = 'essay'
    `).all(session.exam_id);

    if (essayQuestions.length > 0) {
      const attempts = db.prepare('SELECT id FROM student_attempts WHERE session_id = ?').all(sessionId);
      const crypto = require('node:crypto');
      const insertEmpty = db.prepare(`
        INSERT OR IGNORE INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, auto_score, manual_score, teacher_feedback, updated_at)
        VALUES (?, ?, ?, '[]', '', 0.0, null, null, CURRENT_TIMESTAMP)
      `);

      for (const att of attempts) {
        for (const eq of essayQuestions) {
          const existing = db.prepare('SELECT id FROM student_answers WHERE attempt_id = ? AND question_id = ?').get(att.id, eq.id);
          if (!existing) {
            insertEmpty.run(crypto.randomUUID(), att.id, eq.id);
          }
        }
      }
    }

    const rows = db.prepare(`
      SELECT 
        sa.id as answer_id,
        sa.attempt_id,
        sa.essay_content,
        sa.manual_score,
        sa.teacher_feedback,
        sa.updated_at,
        st.student_code,
        st.student_name,
        st.class_name,
        st.client_ip,
        st.is_graded as attempt_is_graded,
        st.essay_score as attempt_essay_score,
        st.total_score as attempt_total_score,
        q.id as question_id,
        q.content as question_content,
        q.rubric_guide,
        q.max_score as question_max_score,
        q.order_index
      FROM student_answers sa
      JOIN student_attempts st ON sa.attempt_id = st.id
      JOIN questions q ON sa.question_id = q.id
      WHERE st.session_id = ? AND q.question_type = 'essay'
      ORDER BY st.student_code ASC, q.order_index ASC
    `).all(sessionId);

    return rows;
  }

  generateExcelReport(sessionId) {
    const session = db.prepare(`
      SELECT s.*, e.title as exam_title
      FROM exam_sessions s
      JOIN exams e ON s.exam_id = e.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) throw new Error('Ca thi không tồn tại');

    const attempts = db.prepare(`
      SELECT * FROM student_attempts
      WHERE session_id = ?
      ORDER BY student_code ASC
    `).all(sessionId);

    const data = attempts.map((a, idx) => ({
      'STT': idx + 1,
      'Số Báo Danh': a.student_code,
      'Họ và Tên': a.student_name,
      'Lớp': a.class_name || '',
      'IP Máy': a.client_ip || '',
      'Điểm Trắc Nghiệm': a.mcq_score,
      'Điểm Tự Luận': a.essay_score,
      'Tổng Điểm (Thang 10)': a.total_score,
      'Trạng Thái Chấm': a.is_graded ? 'Đã hoàn tất' : 'Chờ chấm tự luận',
      'Số Lần Vi Phạm (Gian lận)': a.violations_count,
      'Trạng Thái Thi': a.status === 'submitted' ? 'Đã nộp bài' : (a.status === 'forced_submitted' ? 'Thu bài cưỡng chế' : 'Đang làm bài'),
      'Thời Gian Nộp': a.submitted_at ? new Date(a.submitted_at).toLocaleTimeString('vi-VN') : 'Chưa nộp'
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Auto-fit column widths
    const colWidths = [
      { wch: 6 },
      { wch: 15 },
      { wch: 25 },
      { wch: 12 },
      { wch: 16 },
      { wch: 18 },
      { wch: 15 },
      { wch: 20 },
      { wch: 20 },
      { wch: 25 },
      { wch: 18 },
      { wch: 20 }
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'KetQuaThi');

    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      fileName: `KetQua_${session.session_code}_${session.exam_title.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`,
      buffer: excelBuffer
    };
  }
}

module.exports = new GradingService();
