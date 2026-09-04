const express = require('express');
const router = express.Router();
const path = require('node:path');
const fs = require('node:fs');
const db = require('../db');
const examService = require('../services/examService');
const gradingService = require('../services/gradingService');
const studentService = require('../services/studentService');
const wordExamParser = require('../services/wordExamParser');
const examExportService = require('../services/examExportService');
const { calculateTrueFalseScore } = require('../services/trueFalseUtils');
const { getLocalIpAddress } = require('../services/udpDiscovery');
const crypto = require('node:crypto');

// 1. SYSTEM INFO
router.get('/system/info', (req, res) => {
  res.json({
    success: true,
    serverIp: getLocalIpAddress(),
    port: req.app.get('port') || 3000,
    timestamp: new Date().toISOString()
  });
});

// 2. EXAMS
router.get('/exams', (req, res) => {
  try {
    const list = examService.getAllExams();
    res.json({ success: true, exams: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/exams/:id', (req, res) => {
  try {
    const exam = examService.getExamById(req.params.id, true);
    if (!exam) return res.status(404).json({ success: false, message: 'Đề thi không tồn tại' });
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/exams', (req, res) => {
  try {
    const { title, subject, total_score, shuffle_questions, shuffle_options, questions } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đề thi' });
    }
    const created = examService.createExam({
      title,
      subject,
      total_score,
      shuffle_questions,
      shuffle_options,
      questions
    });
    res.json({ success: true, exam: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/exams/:id', (req, res) => {
  try {
    const { title, subject, total_score, shuffle_questions, shuffle_options, questions } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập tên đề thi' });
    }
    const updated = examService.updateExam(req.params.id, {
      title,
      subject,
      total_score,
      shuffle_questions,
      shuffle_options,
      questions
    });
    res.json({ success: true, exam: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/exams/:id', (req, res) => {
  try {
    examService.deleteExam(req.params.id);
    res.json({ success: true, message: 'Đã xóa đề thi thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/exams/import-word', async (req, res) => {
  try {
    const { fileBase64, textContent } = req.body;
    let parsed;
    if (fileBase64) {
      const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      parsed = await wordExamParser.parseWordBuffer(buffer);
    } else if (textContent) {
      parsed = wordExamParser.parseExamText(textContent);
    } else {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp file Word hoặc nội dung văn bản' });
    }

    res.json({
      success: true,
      title: parsed.title,
      total_questions: parsed.total_questions,
      questions: parsed.questions
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Download official template Word docx
router.get('/exams/template/download-word', async (req, res) => {
  try {
    const templatePath = path.resolve(__dirname, '../../../Mau_De_Thi_Chuan_BGDDT_2025.docx');
    if (!fs.existsSync(templatePath)) {
      const { generateOfficialWordTemplate } = require('../services/templateGenerator');
      await generateOfficialWordTemplate();
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="Mau_De_Thi_Chuan_BGDDT_2025.docx"');
    res.sendFile(templatePath);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Export exam to Word docx
router.get('/exams/:id/export-word', async (req, res) => {
  try {
    const { examTitle, buffer } = await examExportService.generateExamWordBuffer(req.params.id);
    const safeTitle = (examTitle || 'De_Thi').replace(/[^a-zA-Z0-9_\u00C0-\u1EF9 -]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(safeTitle)}.docx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. SESSIONS
router.get('/sessions', (req, res) => {
  try {
    const sessions = examService.getAllSessions();
    res.json({ success: true, sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions', (req, res) => {
  try {
    const { exam_id, session_code, title, duration_minutes, status } = req.body;
    if (!exam_id || !session_code) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin đề thi hoặc mã ca thi' });
    }
    const created = examService.createSession({
      exam_id,
      session_code,
      title: title || session_code,
      duration_minutes: duration_minutes || 45,
      status: status || 'waiting'
    });
    
    // Update active session code for UDP beacon
    const udpBeacon = req.app.get('udpBeacon');
    if (udpBeacon) udpBeacon.setSessionCode(session_code);

    res.json({ success: true, session: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/sessions/:id', (req, res) => {
  try {
    const { session_code, title, duration_minutes, status, exam_id } = req.body;
    if (!session_code || !title) {
      return res.status(400).json({ success: false, message: 'Thiếu mã ca thi hoặc tiêu đề' });
    }
    const updated = examService.updateSession(req.params.id, {
      session_code,
      title,
      duration_minutes,
      status,
      exam_id
    });
    res.json({ success: true, session: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id', (req, res) => {
  try {
    examService.deleteSession(req.params.id);
    res.json({ success: true, message: 'Đã xóa ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/finish', (req, res) => {
  try {
    const { id } = req.params;
    const result = examService.finishSession(id);

    // Notify all connected students via Socket.IO to submit and lock
    const io = req.app.get('io');
    if (io) {
      io.to(`session_${id}`).emit('command_force_submitted', {
        reason: 'Giám thị đã kết thúc ca thi. Toàn bộ bài làm đã được tự động nộp.'
      });
      io.to(`teacher_session_${id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã kết thúc ca thi! Đã tự động thu và chấm ${result.autoSubmittedCount} bài thi.`,
      result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/start', (req, res) => {
  try {
    const { id } = req.params;
    const session = examService.getSessionById(id);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const startResult = examService.startSession(id);

    // Broadcast exam start to all students waiting in room session_{id}
    const io = req.app.get('io');
    if (io) {
      const examPaper = examService.generateStudentExamPaper(
        session.exam_id,
        session.shuffle_questions === 1,
        session.shuffle_options === 1
      );

      io.to(`session_${id}`).emit('exam_started_broadcast', {
        sessionId: id,
        startTime: startResult.startTime,
        durationMinutes: session.duration_minutes || 45,
        examPaper
      });
      io.to(`teacher_session_${id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã phát lệnh bắt đầu làm bài cho ca thi! (${startResult.startedAttemptsCount} thí sinh bắt đầu)`,
      startResult
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Session Students Roster
router.get('/sessions/:id/students', (req, res) => {
  try {
    const list = examService.getSessionStudents(req.params.id);
    res.json({ success: true, students: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/sessions/:id/students', (req, res) => {
  try {
    const { studentIds, className } = req.body;
    let result;
    if (className) {
      result = examService.addStudentsByClassToSession(req.params.id, className);
    } else if (Array.isArray(studentIds)) {
      result = examService.addStudentsToSession(req.params.id, studentIds);
    } else {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp studentIds hoặc className' });
    }

    const io = req.app.get('io');
    if (io) io.to(`teacher_session_${req.params.id}`).emit('refresh_roster');

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id/students/:studentId', (req, res) => {
  try {
    examService.removeStudentFromSession(req.params.id, req.params.studentId);
    res.json({ success: true, message: 'Đã xóa học sinh khỏi ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/sessions/:id/students', (req, res) => {
  try {
    examService.clearSessionStudents(req.params.id);
    res.json({ success: true, message: 'Đã xóa toàn bộ học sinh khỏi ca thi' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Teacher unlock device
router.post('/teacher/attempts/:attemptId/unlock-device', (req, res) => {
  try {
    const { attemptId } = req.params;
    const { unlockStudentDevice } = require('../services/socketHandler');
    unlockStudentDevice(attemptId);

    const attempt = db.prepare('SELECT session_id, student_name, student_code FROM student_attempts WHERE id = ?').get(attemptId);
    if (attempt) {
      const io = req.app.get('io');
      if (io) io.to(`teacher_session_${attempt.session_id}`).emit('refresh_roster');
    }

    res.json({
      success: true,
      message: `Đã mở khóa thiết bị cho thí sinh ${attempt?.student_name || ''} (${attempt?.student_code || ''}). Học sinh có thể đăng nhập trên máy mới.`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/sessions/:code', (req, res) => {
  try {
    const session = examService.getSessionByCode(req.params.code);
    if (!session) return res.status(404).json({ success: false, message: 'Mã ca thi không hợp lệ' });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. STUDENT ROSTER MANAGEMENT
router.get('/students', (req, res) => {
  try {
    const className = req.query.class || null;
    const students = studentService.getAllStudents(className);
    const classes = studentService.getDistinctClasses();
    res.json({ success: true, students, classes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/students', (req, res) => {
  try {
    const student = studentService.createStudent(req.body);
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/students/:id', (req, res) => {
  try {
    const student = studentService.updateStudent(req.params.id, req.body);
    res.json({ success: true, student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/students/:id', (req, res) => {
  try {
    studentService.deleteStudent(req.params.id);
    res.json({ success: true, message: 'Đã xóa học sinh' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/students/lookup/:code', (req, res) => {
  try {
    const student = studentService.getStudentByCode(req.params.code);
    if (!student) return res.json({ success: false, found: false });
    res.json({ success: true, found: true, student });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/students/export-template', (req, res) => {
  try {
    const { fileName, buffer } = studentService.generateTemplateExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/students/import-excel', (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) return res.status(400).json({ success: false, message: 'Không tìm thấy dữ liệu file' });

    const buffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const result = studentService.importStudentsFromExcel(buffer);
    res.json({ success: true, importedCount: result.importedCount });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 5. STUDENT EXAM WORKFLOW
router.post('/student/join', (req, res) => {
  try {
    const { sessionCode, studentCode, studentName, className } = req.body;
    if (!sessionCode || !studentCode || !studentName) {
      return res.status(400).json({ success: false, message: 'Vui lòng điền đủ Mã ca thi, SBD và Họ tên' });
    }

    const session = examService.getSessionByCode(sessionCode);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi với mã này' });
    }

    if (session.status === 'finished') {
      return res.status(400).json({ success: false, message: 'Ca thi này đã kết thúc' });
    }

    // 1. Check if session has assigned student roster
    const allowedCheck = examService.isStudentAllowedInSession(session.id, studentCode);
    if (!allowedCheck.allowed) {
      return res.status(403).json({
        success: false,
        notInRoster: true,
        message: `Thí sinh [SBD: ${studentCode}] không có tên trong danh sách ca thi này! Vui lòng kiểm tra lại SBD hoặc liên hệ giám thị.`
      });
    }

    const clientIp = ((req.headers['x-forwarded-for'] || req.ip || '')).replace('::ffff:', '').split(',')[0].trim();
    const nowIso = new Date().toISOString();

    // 2. Check single-device login constraint
    const { isStudentOnlineOnOtherIp } = require('../services/socketHandler');
    const onlineCheck = isStudentOnlineOnOtherIp(studentCode, clientIp);

    let attempt = db.prepare(`
      SELECT * FROM student_attempts 
      WHERE session_id = ? AND UPPER(student_code) = UPPER(?)
    `).get(session.id, studentCode);

    if (attempt) {
      // If currently online on another computer
      if (onlineCheck.isOnline) {
        return res.status(409).json({
          success: false,
          isDeviceLocked: true,
          message: `Thí sinh [SBD: ${studentCode}] hiện đang đăng nhập và làm bài trên máy khác (IP: ${onlineCheck.activeIp}). Mỗi học sinh chỉ được đăng nhập trên 1 máy tính duy nhất! Nếu máy cũ bị hỏng hoặc mất nguồn, vui lòng báo giám thị bấm "Mở khóa đổi máy".`
        });
      }

      // If attempt is locked to another IP and not explicitly unlocked by teacher
      if (attempt.client_ip && attempt.client_ip !== clientIp && (attempt.is_device_locked === 1 || attempt.is_device_locked === null) && attempt.status !== 'submitted' && attempt.status !== 'forced_submitted') {
        return res.status(409).json({
          success: false,
          isDeviceLocked: true,
          message: `Thí sinh [SBD: ${studentCode}] trước đó đã đăng nhập tại máy [IP: ${attempt.client_ip}]. Mỗi học sinh chỉ được làm bài trên 1 máy tính! Hãy liên hệ giám thị bấm "Mở khóa đổi máy" để chuyển sang máy này.`
        });
      }
    }

    const initialStatus = session.status === 'waiting' ? 'waiting' : 'in_progress';

    if (!attempt) {
      const attemptId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO student_attempts (id, session_id, student_code, student_name, class_name, client_ip, status, start_time, is_device_locked)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        attemptId,
        session.id,
        studentCode.toUpperCase(),
        studentName,
        className || '',
        clientIp,
        initialStatus,
        session.status === 'in_progress' ? (session.start_time || nowIso) : null
      );

      attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    } else {
      // Re-bind to current IP and ensure locked
      db.prepare('UPDATE student_attempts SET client_ip = ?, is_device_locked = 1 WHERE id = ?').run(clientIp, attempt.id);
      attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attempt.id);
    }

    // If student already submitted
    if (attempt.status === 'submitted' || attempt.status === 'forced_submitted') {
      return res.json({
        success: true,
        alreadySubmitted: true,
        attempt,
        message: 'Bạn đã nộp bài cho ca thi này.'
      });
    }

    // 3. If session is waiting: Do not send exam questions yet! Student enters waiting room
    if (session.status === 'waiting') {
      return res.json({
        success: true,
        alreadySubmitted: false,
        waitingForTeacher: true,
        attempt,
        session: {
          ...session,
          duration_minutes: Number(session.duration_minutes) || 45
        },
        message: 'Đã điểm danh vào ca thi thành công. Vui lòng chờ giám thị phát lệnh bắt đầu làm bài.'
      });
    }

    // 4. If session is in progress: Prepare exam paper & countdown
    const fullPaper = examService.getOrCreateStudentAttemptPaper(attempt.id, session);
    const examPaper = examService.sanitizeStudentPaper(fullPaper);

    // Fetch existing saved answers if resuming
    const savedAnswers = db.prepare(`
      SELECT question_id, selected_options_json, essay_content 
      FROM student_answers WHERE attempt_id = ?
    `).all(attempt.id).map(a => ({
      question_id: a.question_id,
      selected_options: a.selected_options_json ? JSON.parse(a.selected_options_json) : [],
      essay_content: a.essay_content || ''
    }));

    // Calculate remaining duration in seconds based on SESSION DURATION_MINUTES
    const sessionDuration = Number(session.duration_minutes) || 45;
    const totalAllowedSeconds = (sessionDuration + (attempt.extra_time_minutes || 0)) * 60;

    // Use session start_time or attempt start_time
    let startIso = session.start_time || attempt.start_time || nowIso;
    if (!startIso.endsWith('Z') && !startIso.includes('+')) {
      startIso = startIso.replace(' ', 'T') + 'Z';
    }

    let startTimeMs = new Date(startIso).getTime();
    let elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));

    const remainingSeconds = Math.max(1, totalAllowedSeconds - elapsedSeconds);

    res.json({
      success: true,
      alreadySubmitted: false,
      waitingForTeacher: false,
      attempt,
      session: {
        ...session,
        duration_minutes: sessionDuration
      },
      examPaper,
      savedAnswers,
      remainingSeconds
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. ESSAY GRADING & TEACHER MONITORING
router.get('/teacher/sessions/:sessionId/live', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare(`
      SELECT s.*, e.title as exam_title, e.total_score
      FROM exam_sessions s
      JOIN exams e ON s.exam_id = e.id
      WHERE s.id = ?
    `).get(sessionId);

    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions WHERE exam_id = ?').get(session.exam_id).count;

    const students = db.prepare(`
      SELECT st.*, 
        (SELECT COUNT(*) FROM student_answers WHERE attempt_id = st.id AND ((selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR (essay_content IS NOT NULL AND TRIM(essay_content) != ''))) as answered_count
      FROM student_attempts st
      WHERE st.session_id = ?
      ORDER BY st.student_code ASC
    `).all(sessionId);

    res.json({
      success: true,
      session,
      totalQuestions,
      students
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/teacher/sessions/:sessionId/essays', (req, res) => {
  try {
    const submissions = gradingService.getEssaySubmissions(req.params.sessionId);
    res.json({ success: true, submissions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/teacher/grade-essay', (req, res) => {
  try {
    const { answerId, manualScore, teacherFeedback } = req.body;
    if (!answerId || manualScore === undefined) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin điểm số hoặc bài làm' });
    }
    const result = gradingService.gradeEssayAnswer({ answerId, manualScore, teacherFeedback });
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. EXCEL & STUDENT EXAM PAPER EXPORT
router.get('/teacher/sessions/:sessionId/export-excel', (req, res) => {
  try {
    const { fileName, buffer } = gradingService.generateExcelReport(req.params.sessionId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. STUDENT PAPER DETAIL & PRINT
router.get('/teacher/attempts/:attemptId/paper-detail', (req, res) => {
  try {
    const { attemptId } = req.params;
    const attempt = db.prepare('SELECT * FROM student_attempts WHERE id = ?').get(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Không tìm thấy bài thi của thí sinh' });

    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(attempt.session_id);
    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(session.exam_id);

    let questions = [];
    if (attempt.exam_paper_json) {
      try {
        const paper = JSON.parse(attempt.exam_paper_json);
        questions = paper.questions || [];
      } catch (e) {}
    }
    if (questions.length === 0) {
      questions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id).map((q, idx) => ({
        ...q,
        display_order: idx + 1,
        options: q.options_json ? JSON.parse(q.options_json) : [],
        correct_answers: q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
      }));
    }

    const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attemptId);
    const answersMap = {};
    answers.forEach(a => { answersMap[a.question_id] = a; });

    const detailedQuestions = questions.map((q, idx) => {
      const ans = answersMap[q.id] || null;
      let selectedOptions = [];
      if (ans && ans.selected_options_json) {
        try { selectedOptions = JSON.parse(ans.selected_options_json); } catch (e) {}
      }
      let options = Array.isArray(q.options) ? q.options : (q.options_json ? JSON.parse(q.options_json) : []);
      let correctAnswers = Array.isArray(q.correct_answers) ? q.correct_answers : (q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []);

      let isCorrect = null;
      let scoreObtained = 0;
      if (q.question_type === 'essay') {
        scoreObtained = (ans && ans.manual_score !== null && ans.manual_score !== undefined) ? Number(ans.manual_score) : 0;
      } else {
        scoreObtained = (ans && ans.auto_score !== null && ans.auto_score !== undefined) ? Number(ans.auto_score) : 0;
      }
      let tfDetails = null;

      if (q.question_type === 'single_choice') {
        isCorrect = selectedOptions.length > 0 && selectedOptions[0] === correctAnswers[0];
      } else if (q.question_type === 'true_false') {
        const tfResult = calculateTrueFalseScore(selectedOptions, correctAnswers, q.max_score);
        isCorrect = tfResult.isAllCorrect;
        if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
          scoreObtained = tfResult.scoreObtained;
        }
        tfDetails = tfResult.details;
      } else if (q.question_type === 'multiple_choice') {
        const selSorted = [...selectedOptions].sort().join(',');
        const corSorted = [...correctAnswers].sort().join(',');
        isCorrect = selSorted === corSorted && corSorted.length > 0;
      }

      return {
        id: q.id,
        display_order: q.display_order || (idx + 1),
        question_type: q.question_type,
        content: q.content,
        options,
        correct_answers: correctAnswers,
        max_score: q.max_score,
        rubric_guide: q.rubric_guide,
        student_selected_options: selectedOptions,
        student_essay_content: ans ? (ans.essay_content || '') : '',
        is_correct: isCorrect,
        score_obtained: scoreObtained,
        tf_details: tfDetails,
        teacher_feedback: ans ? (ans.teacher_feedback || '') : ''
      };
    });

    res.json({
      success: true,
      attempt,
      session,
      exam,
      questions: detailedQuestions
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/teacher/sessions/:sessionId/all-papers-detail', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = db.prepare('SELECT * FROM exam_sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Không tìm thấy ca thi' });

    const exam = db.prepare('SELECT * FROM exams WHERE id = ?').get(session.exam_id);
    const defaultQuestions = db.prepare('SELECT * FROM questions WHERE exam_id = ? ORDER BY order_index ASC').all(exam.id).map((q, idx) => ({
      ...q,
      display_order: idx + 1,
      options: q.options_json ? JSON.parse(q.options_json) : [],
      correct_answers: q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []
    }));

    const attempts = db.prepare('SELECT * FROM student_attempts WHERE session_id = ? ORDER BY student_code ASC').all(sessionId);

    const papers = attempts.map(attempt => {
      let questions = [];
      if (attempt.exam_paper_json) {
        try {
          const paper = JSON.parse(attempt.exam_paper_json);
          questions = paper.questions || [];
        } catch (e) {}
      }
      if (questions.length === 0) {
        questions = defaultQuestions;
      }

      const answers = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ?').all(attempt.id);
      const answersMap = {};
      answers.forEach(a => { answersMap[a.question_id] = a; });

      const detailedQuestions = questions.map((q, idx) => {
        const ans = answersMap[q.id] || null;
        let selectedOptions = [];
        if (ans && ans.selected_options_json) {
          try { selectedOptions = JSON.parse(ans.selected_options_json); } catch (e) {}
        }
        let options = Array.isArray(q.options) ? q.options : (q.options_json ? JSON.parse(q.options_json) : []);
        let correctAnswers = Array.isArray(q.correct_answers) ? q.correct_answers : (q.correct_answers_json ? JSON.parse(q.correct_answers_json) : []);

        let isCorrect = null;
        let scoreObtained = 0;
        if (q.question_type === 'essay') {
          scoreObtained = (ans && ans.manual_score !== null && ans.manual_score !== undefined) ? Number(ans.manual_score) : 0;
        } else {
          scoreObtained = (ans && ans.auto_score !== null && ans.auto_score !== undefined) ? Number(ans.auto_score) : 0;
        }
        let tfDetails = null;

        if (q.question_type === 'single_choice') {
          isCorrect = selectedOptions.length > 0 && selectedOptions[0] === correctAnswers[0];
        } else if (q.question_type === 'true_false') {
          const tfResult = calculateTrueFalseScore(selectedOptions, correctAnswers, q.max_score);
          isCorrect = tfResult.isAllCorrect;
          if (!ans || ans.auto_score === null || ans.auto_score === undefined) {
            scoreObtained = tfResult.scoreObtained;
          }
          tfDetails = tfResult.details;
        } else if (q.question_type === 'multiple_choice') {
          const selSorted = [...selectedOptions].sort().join(',');
          const corSorted = [...correctAnswers].sort().join(',');
          isCorrect = selSorted === corSorted && corSorted.length > 0;
        }

        return {
          id: q.id,
          display_order: q.display_order || (idx + 1),
          question_type: q.question_type,
          content: q.content,
          options,
          correct_answers: correctAnswers,
          max_score: q.max_score,
          rubric_guide: q.rubric_guide,
          student_selected_options: selectedOptions,
          student_essay_content: ans ? (ans.essay_content || '') : '',
          is_correct: isCorrect,
          score_obtained: scoreObtained,
          tf_details: tfDetails,
          teacher_feedback: ans ? (ans.teacher_feedback || '') : ''
        };
      });

      return {
        attempt,
        questions: detailedQuestions
      };
    });

    res.json({
      success: true,
      session,
      exam,
      papers
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
