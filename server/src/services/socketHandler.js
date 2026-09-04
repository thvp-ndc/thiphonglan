const db = require('../db');
const gradingService = require('./gradingService');
const crypto = require('node:crypto');

// Map to track active sockets
const activeStudents = new Map(); // socketId -> { attemptId, sessionId, studentCode }

function setupSocketIO(io) {
  io.on('connection', (socket) => {
    // 1. Teacher connects to monitor room
    socket.on('teacher_join_room', ({ sessionId }) => {
      const room = `teacher_session_${sessionId}`;
      socket.join(room);
      socket.sessionId = sessionId;
      socket.isTeacher = true;

      // Send initial roster state
      const students = db.prepare(`
        SELECT st.*, 
          (SELECT COUNT(*) FROM student_answers WHERE attempt_id = st.id AND ((selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR (essay_content IS NOT NULL AND TRIM(essay_content) != ''))) as answered_count
        FROM student_attempts st
        WHERE st.session_id = ?
        ORDER BY st.student_code ASC
      `).all(sessionId);

      socket.emit('teacher_roster_update', { students });
    });

    // 2. Student connects & joins session
    socket.on('student_join_exam', ({ attemptId, sessionId, studentCode, studentName, machineName }) => {
      socket.join(`session_${sessionId}`);
      socket.attemptId = attemptId;
      socket.sessionId = sessionId;
      socket.studentCode = studentCode;

      const clientIp = socket.handshake.address.replace('::ffff:', '');
      activeStudents.set(socket.id, { attemptId, sessionId, studentCode, clientIp });

      // Update attempt IP and machine
      db.prepare(`
        UPDATE student_attempts 
        SET client_ip = ?, client_machine_name = ?
        WHERE id = ?
      `).run(clientIp, machineName || 'Client PC', attemptId);

      // Notify teacher room
      io.to(`teacher_session_${sessionId}`).emit('student_status_change', {
        attemptId,
        studentCode,
        studentName,
        status: 'online',
        clientIp
      });
    });

    // 3. Realtime Auto-Save Answer (Trắc nghiệm & Tự luận)
    socket.on('student_save_answer', ({ attemptId, questionId, selectedOptions, essayContent }) => {
      try {
        const id = crypto.randomUUID();
        const selectedJson = selectedOptions ? JSON.stringify(selectedOptions) : null;
        const essay = essayContent !== undefined ? essayContent : null;

        // Upsert into student_answers
        db.prepare(`
          INSERT INTO student_answers (id, attempt_id, question_id, selected_options_json, essay_content, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(attempt_id, question_id) DO UPDATE SET
            selected_options_json = COALESCE(excluded.selected_options_json, student_answers.selected_options_json),
            essay_content = COALESCE(excluded.essay_content, student_answers.essay_content),
            updated_at = CURRENT_TIMESTAMP
        `).run(id, attemptId, questionId, selectedJson, essay);

        // Acknowledge back to student
        socket.emit('answer_saved_ack', {
          questionId,
          timestamp: Date.now()
        });

        // Broadcast progress update to teacher monitor
        if (socket.sessionId) {
          const answeredCount = db.prepare(`
            SELECT COUNT(*) as count FROM student_answers 
            WHERE attempt_id = ? AND ((selected_options_json IS NOT NULL AND selected_options_json != '[]' AND selected_options_json != '{}') OR (essay_content IS NOT NULL AND TRIM(essay_content) != ''))
          `).get(attemptId).count;

          io.to(`teacher_session_${socket.sessionId}`).emit('student_progress_update', {
            attemptId,
            answeredCount
          });
        }
      } catch (err) {
        console.error('[Socket] Error auto-saving answer:', err.message);
      }
    });

    // 4. Report Violation (Alt+Tab, Win Key, Focus Loss, Kiosk breach)
    socket.on('student_violation', ({ attemptId, violationType, details }) => {
      try {
        const row = db.prepare('SELECT violations_count, student_code, student_name, session_id FROM student_attempts WHERE id = ?').get(attemptId);
        if (!row) return;

        const newCount = (row.violations_count || 0) + 1;
        db.prepare('UPDATE student_attempts SET violations_count = ? WHERE id = ?').run(newCount, attemptId);

        db.prepare(`
          INSERT INTO activity_logs (id, session_id, student_code, event_type, details)
          VALUES (?, ?, ?, ?, ?)
        `).run(crypto.randomUUID(), row.session_id, row.student_code, violationType || 'violation', details || 'Phát hiện thoát toàn màn hình hoặc mất tiêu điểm');

        // Broadcast RED ALERT to teacher live monitor
        io.to(`teacher_session_${row.session_id}`).emit('student_violation_alert', {
          attemptId,
          studentCode: row.student_code,
          studentName: row.student_name,
          violationsCount: newCount,
          violationType,
          details,
          time: new Date().toLocaleTimeString('vi-VN')
        });
      } catch (err) {
        console.error('[Socket] Error recording violation:', err.message);
      }
    });

    // 5. Submit Exam
    socket.on('student_submit_exam', ({ attemptId }) => {
      try {
        db.prepare(`
          UPDATE student_attempts 
          SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(attemptId);

        const gradeResult = gradingService.autoGradeAttempt(attemptId);

        socket.emit('exam_submit_confirmed', gradeResult);

        if (socket.sessionId) {
          io.to(`teacher_session_${socket.sessionId}`).emit('student_submitted_alert', {
            attemptId,
            gradeResult
          });
        }
      } catch (err) {
        console.error('[Socket] Error submitting exam:', err.message);
      }
    });

    // 6. TEACHER COMMAND: Add extra time
    socket.on('teacher_add_extra_time', ({ sessionId, attemptId, minutes }) => {
      if (attemptId) {
        // Extra time for single student
        db.prepare('UPDATE student_attempts SET extra_time_minutes = extra_time_minutes + ? WHERE id = ?').run(minutes, attemptId);
        
        // Find student socket
        for (const [sId, data] of activeStudents.entries()) {
          if (data.attemptId === attemptId) {
            io.to(sId).emit('extra_time_granted', { minutes });
            break;
          }
        }
      } else {
        // Extra time for all students in session
        db.prepare('UPDATE exam_sessions SET duration_minutes = duration_minutes + ? WHERE id = ?').run(minutes, sessionId);
        io.to(`session_${sessionId}`).emit('extra_time_granted', { minutes });
      }

      // Refresh teacher view
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 7. TEACHER COMMAND: Force Submit
    socket.on('teacher_force_submit', ({ attemptId, sessionId }) => {
      db.prepare(`
        UPDATE student_attempts 
        SET status = 'forced_submitted', submitted_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(attemptId);

      gradingService.autoGradeAttempt(attemptId);

      // Find student socket and command it to lock and submit
      for (const [sId, data] of activeStudents.entries()) {
        if (data.attemptId === attemptId) {
          io.to(sId).emit('command_force_submitted', {
            reason: 'Giám thị đã thực hiện thu bài cưỡng chế.'
          });
          break;
        }
      }

      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // 8. TEACHER COMMAND: Unlock student device (Allow change PC)
    socket.on('teacher_unlock_student_device', ({ attemptId, sessionId }) => {
      unlockStudentDevice(attemptId);
      io.to(`teacher_session_${sessionId}`).emit('refresh_roster');
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      const student = activeStudents.get(socket.id);
      if (student) {
        activeStudents.delete(socket.id);
        io.to(`teacher_session_${student.sessionId}`).emit('student_status_change', {
          attemptId: student.attemptId,
          studentCode: student.studentCode,
          status: 'offline'
        });
      }
    });
  });
}

function isStudentOnlineOnOtherIp(studentCode, currentIp) {
  if (!studentCode) return { isOnline: false };
  for (const [sId, data] of activeStudents.entries()) {
    if (data.studentCode && data.studentCode.toUpperCase() === studentCode.toUpperCase()) {
      if (data.clientIp && data.clientIp !== currentIp) {
        return { isOnline: true, activeIp: data.clientIp, socketId: sId };
      }
    }
  }
  return { isOnline: false };
}

function unlockStudentDevice(attemptId) {
  for (const [sId, data] of activeStudents.entries()) {
    if (data.attemptId === attemptId) {
      activeStudents.delete(sId);
      break;
    }
  }
  db.prepare('UPDATE student_attempts SET is_device_locked = 0 WHERE id = ?').run(attemptId);
  return true;
}

module.exports = { setupSocketIO, isStudentOnlineOnOtherIp, unlockStudentDevice };

