const db = require('../db');
const crypto = require('node:crypto');
const XLSX = require('xlsx');

class StudentService {
  getAllStudents(className = null) {
    if (className && className !== 'ALL') {
      return db.prepare('SELECT * FROM students WHERE class_name = ? ORDER BY student_code ASC').all(className);
    }
    return db.prepare('SELECT * FROM students ORDER BY class_name ASC, student_code ASC').all();
  }

  getDistinctClasses() {
    const rows = db.prepare("SELECT DISTINCT class_name FROM students WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name ASC").all();
    return rows.map(r => r.class_name);
  }

  getStudentByCode(code) {
    if (!code) return null;
    return db.prepare('SELECT * FROM students WHERE UPPER(student_code) = UPPER(?)').get(code.trim());
  }

  createStudent({ student_code, student_name, class_name, gender = '' }) {
    if (!student_code || !student_name) throw new Error('Vui lòng nhập đầy đủ SBD và Họ tên');

    const existing = this.getStudentByCode(student_code);
    if (existing) throw new Error(`Số báo danh [${student_code}] đã tồn tại trong danh sách`);

    const id = crypto.randomUUID();
    db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, student_code.trim().toUpperCase(), student_name.trim(), (class_name || '').trim().toUpperCase(), gender || '');

    return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  updateStudent(id, { student_code, student_name, class_name, gender = '' }) {
    if (!student_code || !student_name) throw new Error('Vui lòng nhập đầy đủ SBD và Họ tên');

    // Check duplicate code on other record
    const existing = db.prepare('SELECT * FROM students WHERE UPPER(student_code) = UPPER(?) AND id != ?').get(student_code.trim(), id);
    if (existing) throw new Error(`Số báo danh [${student_code}] đã được sử dụng bởi học sinh khác`);

    db.prepare(`
      UPDATE students 
      SET student_code = ?, student_name = ?, class_name = ?, gender = ?
      WHERE id = ?
    `).run(student_code.trim().toUpperCase(), student_name.trim(), (class_name || '').trim().toUpperCase(), gender || '', id);

    return db.prepare('SELECT * FROM students WHERE id = ?').get(id);
  }

  deleteStudent(id) {
    db.prepare('DELETE FROM students WHERE id = ?').run(id);
    return true;
  }

  importStudentsFromExcel(fileBuffer) {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(sheet);

    if (!rawRows || rawRows.length === 0) {
      throw new Error('File Excel rỗng hoặc không có dữ liệu');
    }

    const insertStmt = db.prepare(`
      INSERT INTO students (id, student_code, student_name, class_name, gender)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(student_code) DO UPDATE SET
        student_name = excluded.student_name,
        class_name = excluded.class_name,
        gender = excluded.gender
    `);

    let importedCount = 0;
    for (const row of rawRows) {
      // Find columns flexibly
      let code = row['Số Báo Danh'] || row['SBD'] || row['Mã Học Sinh'] || row['student_code'] || row['Code'];
      let name = row['Họ và Tên'] || row['Họ Tên'] || row['Họ và tên'] || row['Tên'] || row['student_name'];
      let className = row['Lớp'] || row['Lớp Học'] || row['class_name'] || row['Class'] || '';
      let gender = row['Giới Tính'] || row['Giới tính'] || row['gender'] || '';

      if (code && name) {
        insertStmt.run(
          crypto.randomUUID(),
          String(code).trim().toUpperCase(),
          String(name).trim(),
          String(className).trim().toUpperCase(),
          String(gender).trim()
        );
        importedCount++;
      }
    }

    return { importedCount };
  }

  generateTemplateExcel() {
    const sampleData = [
      {
        'STT': 1,
        'Số Báo Danh': 'SBD101',
        'Họ và Tên': 'Nguyễn Văn An',
        'Lớp': '10A1',
        'Giới Tính': 'Nam'
      },
      {
        'STT': 2,
        'Số Báo Danh': 'SBD102',
        'Họ và Tên': 'Trần Thị Mai',
        'Lớp': '10A1',
        'Giới Tính': 'Nữ'
      },
      {
        'STT': 3,
        'Số Báo Danh': 'SBD103',
        'Họ và Tên': 'Lê Hoàng Nam',
        'Lớp': '10A1',
        'Giới Tính': 'Nam'
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 6 },
      { wch: 16 },
      { wch: 25 },
      { wch: 12 },
      { wch: 12 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'DanhSachHocSinh');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    return {
      fileName: 'Mau_Danh_Sach_Hoc_Sinh.xlsx',
      buffer
    };
  }
}

module.exports = new StudentService();
