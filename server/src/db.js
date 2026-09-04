const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'exam_master.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode for high concurrency
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subject TEXT,
      duration_minutes INTEGER DEFAULT 45,
      total_score REAL DEFAULT 10.0,
      status TEXT DEFAULT 'draft',
      allow_review INTEGER DEFAULT 0,
      shuffle_questions INTEGER DEFAULT 1,
      shuffle_options INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      order_index INTEGER NOT NULL,
      question_type TEXT NOT NULL, -- 'single_choice', 'multiple_choice', 'true_false', 'essay'
      content TEXT NOT NULL,
      options_json TEXT, -- JSON array
      correct_answers_json TEXT, -- JSON array of correct option IDs
      rubric_guide TEXT, -- Hướng dẫn chấm/đáp án mẫu cho tự luận
      max_score REAL NOT NULL DEFAULT 1.0,
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      session_code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      duration_minutes INTEGER DEFAULT 45,
      status TEXT DEFAULT 'waiting', -- 'waiting', 'in_progress', 'finished'
      start_time DATETIME,
      end_time DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(exam_id) REFERENCES exams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_code TEXT UNIQUE NOT NULL, -- SBD / Mã học sinh
      student_name TEXT NOT NULL,
      class_name TEXT,
      gender TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS student_attempts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_code TEXT NOT NULL,
      student_name TEXT NOT NULL,
      class_name TEXT,
      client_ip TEXT,
      client_machine_name TEXT,
      extra_time_minutes INTEGER DEFAULT 0,
      mcq_score REAL DEFAULT 0.0,
      essay_score REAL DEFAULT 0.0,
      total_score REAL DEFAULT 0.0,
      is_graded INTEGER DEFAULT 0,
      violations_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'in_progress', -- 'waiting', 'in_progress', 'submitted', 'forced_submitted'
      submitted_at DATETIME,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_device_locked INTEGER DEFAULT 1,
      exam_paper_json TEXT,
      FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS student_answers (
      id TEXT PRIMARY KEY,
      attempt_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      selected_options_json TEXT,
      essay_content TEXT,
      auto_score REAL DEFAULT 0.0,
      manual_score REAL DEFAULT NULL,
      teacher_feedback TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(attempt_id) REFERENCES student_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY(question_id) REFERENCES questions(id) ON DELETE CASCADE,
      UNIQUE(attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      student_code TEXT,
      event_type TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS session_students (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(session_id) REFERENCES exam_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(student_id) REFERENCES students(id) ON DELETE CASCADE,
      UNIQUE(session_id, student_id)
    );
  `);

  // Ensure duration_minutes column exists in exam_sessions if table was already created
  try {
    db.exec('ALTER TABLE exam_sessions ADD COLUMN duration_minutes INTEGER DEFAULT 45;');
  } catch (e) {
    // Column already exists
  }

  // Ensure is_device_locked column exists in student_attempts
  try {
    db.exec('ALTER TABLE student_attempts ADD COLUMN is_device_locked INTEGER DEFAULT 1;');
  } catch (e) {
    // Column already exists
  }

  // Ensure exam_paper_json column exists in student_attempts
  try {
    db.exec('ALTER TABLE student_attempts ADD COLUMN exam_paper_json TEXT;');
  } catch (e) {
    // Column already exists
  }

  seedDefaultData();
}

function seedDefaultData() {
  const checkExam = db.prepare('SELECT COUNT(*) as count FROM exams').get();
  if (checkExam.count === 0) {
    console.log('[DB] Seeding default sample exam with Multiple Choice & Essay questions...');
    const examId = 'exam-sample-tin-hoc';
    
    db.prepare(`
      INSERT INTO exams (id, title, subject, duration_minutes, total_score, status, allow_review, shuffle_questions, shuffle_options)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      examId,
      'Kiểm Tra Học Kỳ Mạng Máy Tính & An Toàn Thông Tin',
      'Tin Học / Mạng Máy Tính',
      45,
      10.0,
      'active',
      1,
      0,
      0
    );

    const sampleQuestions = [
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 1,
        question_type: 'single_choice',
        content: 'Mạng LAN (Local Area Network) là gì?',
        options_json: JSON.stringify([
          { id: 'A', text: 'Mạng diện rộng kết nối toàn cầu' },
          { id: 'B', text: 'Mạng cục bộ kết nối các máy tính trong phạm vi hẹp như văn phòng, phòng máy trường học' },
          { id: 'C', text: 'Mạng đô thị kết nối trong một thành phố' },
          { id: 'D', text: 'Mạng lưu trữ chuyên dụng của trung tâm dữ liệu' }
        ]),
        correct_answers_json: JSON.stringify(['B']),
        rubric_guide: '',
        max_score: 1.0
      },
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 2,
        question_type: 'single_choice',
        content: 'Giao thức nào thường được sử dụng trong mạng LAN để tự động phát hiện thiết bị hoặc dịch vụ mà không cần cấu hình IP trước?',
        options_json: JSON.stringify([
          { id: 'A', text: 'UDP Broadcast / mDNS' },
          { id: 'B', text: 'BGP (Border Gateway Protocol)' },
          { id: 'C', text: 'SMTP' },
          { id: 'D', text: 'FTP Passive' }
        ]),
        correct_answers_json: JSON.stringify(['A']),
        rubric_guide: '',
        max_score: 1.0
      },
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 3,
        question_type: 'multiple_choice',
        content: 'Những cơ chế nào sau đây giúp chống gian lận hiệu quả trong kỳ thi máy tính phòng Lab? (Chọn các phương án đúng)',
        options_json: JSON.stringify([
          { id: 'A', text: 'Khóa ứng dụng ở chế độ toàn màn hình (Kiosk mode)' },
          { id: 'B', text: 'Vô hiệu hóa các phím tắt hệ thống Alt+Tab, Windows, Ctrl+Esc' },
          { id: 'C', text: 'Giám sát và ghi nhận sự kiện mất tiêu điểm (Focus Loss)' },
          { id: 'D', text: 'Cho phép thí sinh mở trình duyệt tìm kiếm tài liệu tự do' }
        ]),
        correct_answers_json: JSON.stringify(['A', 'B', 'C']),
        rubric_guide: '',
        max_score: 2.0
      },
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 4,
        question_type: 'true_false',
        content: 'Trong hệ thống thi mạng LAN, đồng hồ đếm ngược thời gian làm bài nên do máy chủ (Server) quản lý để tránh thí sinh can thiệp chỉnh giờ trên máy trạm.',
        options_json: JSON.stringify([
          { id: 'T', text: 'Đúng' },
          { id: 'F', text: 'Sai' }
        ]),
        correct_answers_json: JSON.stringify(['T']),
        rubric_guide: '',
        max_score: 1.0
      },
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 5,
        question_type: 'essay',
        content: 'Câu hỏi tự luận 1: Phân tích ưu điểm của việc tổ chức thi trên mạng LAN nội bộ so với việc tổ chức thi qua Internet công cộng. Nêu ít nhất 3 lý do cụ thể.',
        options_json: '[]',
        correct_answers_json: '[]',
        rubric_guide: 'Barem điểm (2.5đ):\n- Độc lập đường truyền Internet: Không bị ảnh hưởng bởi đứt cáp quang biển, nghẽn mạng bên ngoài (1.0đ)\n- Bảo mật cao & cô lập: Thí sinh không thể truy cập Google, mạng xã hội, tài liệu online (1.0đ)\n- Tốc độ và độ trễ cực thấp: Tải đề, nộp bài, đồng bộ socket realtime tức thì trong mạng 100Mbps/1Gbps (0.5đ)',
        max_score: 2.5
      },
      {
        id: crypto.randomUUID(),
        exam_id: examId,
        order_index: 6,
        question_type: 'essay',
        content: 'Câu hỏi tự luận 2: Nếu trong quá trình thi, một máy trạm của học sinh bị mất điện đột ngột hoặc tuột cáp mạng, hệ thống phần mềm cần thiết kế cơ chế khôi phục (Fault Tolerance) như thế nào để đảm bảo tính công bằng và không mất dữ liệu của thí sinh?',
        options_json: '[]',
        correct_answers_json: '[]',
        rubric_guide: 'Barem điểm (2.5đ):\n- Lưu trữ đáp án tức thì (Auto-save): Mỗi khi thí sinh chọn hoặc gõ câu trả lời, gửi ngay về Server và lưu vào bộ đệm LocalStorage/IndexedDB máy con (1.0đ)\n- Bảo lưu phiên thi trên Server: Ghi nhận thời gian còn lại tại thời điểm mất kết nối (0.5đ)\n- Tái kết nối liền mạch (Session Resume): Khi máy trạm bật lại và đăng nhập đúng SBD, tự động khôi phục toàn bộ đáp án đã làm và tiếp tục đồng hồ (1.0đ)',
        max_score: 2.5
      }
    ];

    const insertQ = db.prepare(`
      INSERT INTO questions (id, exam_id, order_index, question_type, content, options_json, correct_answers_json, rubric_guide, max_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const q of sampleQuestions) {
      insertQ.run(q.id, q.exam_id, q.order_index, q.question_type, q.content, q.options_json, q.correct_answers_json, q.rubric_guide, q.max_score);
    }

    // Default session
    const sessionId = 'session-phong-01';
    db.prepare(`
      INSERT INTO exam_sessions (id, exam_id, session_code, title, duration_minutes, status, start_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      examId,
      'PHONG-01',
      'Ca Thi Phòng Máy 01',
      45,
      'in_progress',
      new Date().toISOString()
    );
  }

  // Seed sample students if empty
  const checkStudents = db.prepare('SELECT COUNT(*) as count FROM students').get();
  if (checkStudents.count === 0) {
    console.log('[DB] Seeding sample student list for Class 10A1 and 10A2...');
    const insertStudent = db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender)
      VALUES (?, ?, ?, ?, ?)
    `);

    const sampleStudents = [
      { code: 'SBD001', name: 'Nguyễn Văn An', class: '10A1', gender: 'Nam' },
      { code: 'SBD002', name: 'Trần Thị Mai', class: '10A1', gender: 'Nữ' },
      { code: 'SBD003', name: 'Lê Hoàng Nam', class: '10A1', gender: 'Nam' },
      { code: 'SBD004', name: 'Phạm Minh Tuấn', class: '10A1', gender: 'Nam' },
      { code: 'SBD005', name: 'Võ Ngọc Ánh', class: '10A1', gender: 'Nữ' },
      { code: 'SBD006', name: 'Đặng Quốc Bảo', class: '10A2', gender: 'Nam' },
      { code: 'SBD007', name: 'Hoàng Thúy Hằng', class: '10A2', gender: 'Nữ' },
      { code: 'SBD008', name: 'Ngô Thanh Tùng', class: '10A2', gender: 'Nam' }
    ];

    for (const s of sampleStudents) {
      insertStudent.run(crypto.randomUUID(), s.code, s.name, s.class, s.gender);
    }
  }
}

initSchema();

module.exports = db;
