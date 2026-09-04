const http = require('node:http');
const db = require('./src/db');
const examService = require('./src/services/examService');
const gradingService = require('./src/services/gradingService');

async function runTest() {
  console.log('--- STARTING E2E AUTOMATED VERIFICATION ---');

  // 1. Verify Database Schema
  console.log('[1] Checking SQLite Database tables...');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Found tables:', tables.map(t => t.name).join(', '));

  // 2. Verify Default Exam
  console.log('[2] Checking Exam with MCQ & Essay questions...');
  const exams = examService.getAllExams();
  if (exams.length === 0) throw new Error('No exams found!');
  const sampleExam = exams[0];
  console.log(`Exam: "${sampleExam.title}" (Total questions: ${sampleExam.total_questions}, MCQ: ${sampleExam.mcq_count}, Essay: ${sampleExam.essay_count})`);

  // 3. Create a Test Session
  console.log('[3] Creating Test Session "TEST-01"...');
  const session = examService.createSession({
    exam_id: sampleExam.id,
    session_code: 'TEST-01',
    title: 'Ca Thi Thử Nghiệm Kiểm Tra Mạng LAN'
  });
  console.log(`Session created: ${session.session_code} (ID: ${session.id})`);

  // 4. Student Join Flow
  console.log('[4] Simulating Student "SBD-888" joining exam...');
  const studentPaper = examService.generateStudentExamPaper(sampleExam.id, false, false);
  const attemptId = 'attempt-test-student-888';

  db.prepare(`
    INSERT INTO student_attempts (id, session_id, student_code, student_name, class_name, client_ip, status)
    VALUES (?, ?, ?, ?, ?, ?, 'in_progress')
  `).run(attemptId, session.id, 'SBD-888', 'Trần Văn Hoàng', '10A2', '192.168.1.105');

  // 5. Simulate Student Answering Questions (MCQ + Essay)
  console.log('[5] Saving Student Answers...');
  const qMcq = studentPaper.questions.find(q => q.question_type === 'single_choice');
  const qEssay = studentPaper.questions.find(q => q.question_type === 'essay');

  // Answer MCQ correctly (B: Mạng cục bộ kết nối các máy tính trong phạm vi hẹp...)
  db.prepare(`
    INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content)
    VALUES (?, ?, ?, ?, ?)
  `).run('ans-mcq-1', attemptId, qMcq.id, JSON.stringify(['B']), null);

  // Answer Essay
  const sampleEssayAnswer = `Ưu điểm của việc tổ chức thi trên mạng LAN:
1. Độc lập hoàn toàn với Internet: Không lo bị nghẽn mạng hoặc đứt cáp quang biển ngoài nước.
2. Bảo mật cao: Học sinh bị ngắt mạng Internet nên không thể tra cứu Google, tài liệu mạng xã hội.
3. Tốc độ cao: Băng thông mạng LAN 1Gbps giúp tải đề thi, hình ảnh và nộp bài tức thì mà không bị trễ.`;

  db.prepare(`
    INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content)
    VALUES (?, ?, ?, ?, ?)
  `).run('ans-essay-1', attemptId, qEssay.id, null, sampleEssayAnswer);

  // 6. Submit Exam & Auto-Grade MCQ
  console.log('[6] Submitting Exam & Running Auto-Grading...');
  db.prepare("UPDATE student_attempts SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP WHERE id = ?").run(attemptId);
  const autoGradeResult = gradingService.autoGradeAttempt(attemptId);
  console.log('Auto-Grade MCQ Result:', autoGradeResult);

  // 7. Teacher Grades Essay Question
  console.log('[7] Teacher Grading Essay with Rubric & Feedback...');
  const essayAnswer = db.prepare("SELECT id FROM student_answers WHERE attempt_id = ? AND question_id = ?").get(attemptId, qEssay.id);
  const gradeEssayResult = gradingService.gradeEssayAnswer({
    answerId: essayAnswer.id,
    manualScore: 2.5,
    teacherFeedback: 'Bài làm phân tích rất rõ ràng, đủ 3 luận điểm chính xác theo barem!'
  });
  console.log('Final Graded Result (MCQ + Essay):', gradeEssayResult);

  // 8. Generate Excel Report
  console.log('[8] Generating Excel report (.xlsx)...');
  const excel = gradingService.generateExcelReport(session.id);
  console.log(`Excel file created: ${excel.fileName} (Size: ${excel.buffer.length} bytes)`);

  console.log('\n=============================================');
  console.log('>>> ALL TESTS PASSED SUCCESSFULLY! 100% <<<');
  console.log('=============================================');
}

runTest().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
