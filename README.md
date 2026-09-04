# thiphonglan

# HƯỚNG DẪN VẬN HÀNH HỆ THỐNG THI MẠNG LAN (LAN EXAM SYSTEM)

Hệ thống thi trắc nghiệm & tự luận hoạt động hoàn toàn **Offline qua mạng nội bộ (LAN)**, tích hợp **Native Kiosk App** chống gian lận đa tầng, tự động dò tìm máy chủ bằng **UDP Broadcast**, cơ sở dữ liệu nhúng **SQLite (WAL mode)** siêu nhẹ.

---

## 1. Cấu Trúc Dự Án

```
d:\Kiemtraqualan/
├── package.json              # File điều phối khởi động dự án
├── server/                   # MÁY CHỦ GIÁO VIÊN (Node.js + SQLite + Socket.io + UDP Beacon)
│   ├── src/
│   │   ├── index.js          # Khởi động Express & Socket.io
│   │   ├── db.js             # SQLite Engine (data/exam_master.db)
│   │   ├── services/         # Logic đề thi, chấm tự luận, UDP Broadcast, Socket
│   │   └── routes/           # REST APIs
│   └── public/               # Giao diện Web đã build sẵn (Teacher & Student)
├── client/                   # SOURCE CODE GIAO DIỆN REACT + VITE + TAILWIND
│   └── src/
│       ├── components/teacher/  # Quản lý đề, Live Monitor, Chấm tự luận, Xuất Excel
│       └── components/student/  # Giao diện làm bài thi Kiosk, đếm giờ, lưu nháp
└── kiosk-client/             # NATIVE KIOSK APP DÀNH CHO MÁY CON (Electron Shell)
    ├── main.js               # Khóa màn hình, chặn Alt+Tab/Win Key, bắt UDP
    ├── preload.js            # Cầu nối bảo mật IPC
    └── connection.html       # Radar quét tự động máy chủ qua mạng LAN
```

---

## 2. Hướng Dẫn Khởi Chạy

### Cách 1: Khởi động Máy Chủ Giáo Viên (Teacher Server)
Trên máy tính của giáo viên (kết nối dây mạng LAN hoặc WiFi chung phòng máy):
```powershell
npm run server
```
- Máy chủ sẽ tự động phát hiện địa chỉ IP trong mạng LAN (ví dụ: `http://192.168.1.8:3000`).
- Giao diện giáo viên: Mở trình duyệt truy cập `http://localhost:3000/teacher` hoặc `http://192.168.1.8:3000/teacher`.
- Tín hiệu **UDP Beacon** sẽ được phát liên tục trên cổng `41234` để các máy con tự tìm thấy.

### Cách 2: Khởi động Máy Thí Sinh (Student Client)

#### Lựa chọn A (Khuyên dùng - Native Kiosk App Bảo Mật Cao):
Trên máy tính của thí sinh, mở ứng dụng Kiosk:
```powershell
npm run kiosk
```
- Ứng dụng tự động khóa cứng toàn màn hình (Kiosk mode).
- Tự động bắt sóng UDP Beacon từ máy giáo viên và vào phòng thi trong 2 giây (không cần gõ IP).
- Vô hiệu hóa triệt để: `Alt+Tab`, `Alt+F4`, phím `Windows`, `Ctrl+Esc`, `F12/DevTools`, menu chuột phải.
- *(Phím tắt thoát khẩn cấp dành riêng cho giám thị khi cần bảo trì: `Ctrl + Alt + Shift + Q`)*.

#### Lựa chọn B (Dự phòng nhanh không cần cài đặt):
Thí sinh mở trình duyệt bất kỳ (Google Chrome, MS Edge, Cốc Cốc...) trên máy con và truy cập:
```
http://[IP_MÁY_GIÁO_VIÊN]:3000/student
```

---

## 3. Quy Trình Vận Hành Một Kỳ Thi

### Bước 1: Soạn Đề Thi & Mở Ca Thi
1. Giáo viên vào mục **"Quản Lý Đề & Ca Thi"**.
2. Bấm **"Soạn Đề Thi Mới"**:
   - Nhập tên đề, thời lượng (phút), thang điểm (10đ).
   - Thêm câu hỏi **Trắc nghiệm** (1 đáp án, nhiều đáp án, đúng/sai).
   - Thêm câu hỏi **Tự luận (Essay)**: Nhập nội dung câu hỏi, thang điểm và **Barem điểm chi tiết / Đáp án mẫu** (rubric) phục vụ chấm thi.
3. Bấm **"Mở Ca Thi Mới"** -> Nhập mã phòng (ví dụ: `PHONG-01`).

### Bước 2: Thí sinh Đăng nhập & Làm bài
1. Thí sinh mở app Kiosk -> Nhập **Mã ca thi** (`PHONG-01`), **Số Báo Danh** (SBD) và **Họ Tên**.
2. Thí sinh làm bài thi:
   - Câu trắc nghiệm: Click chọn phương án.
   - Câu tự luận: Soạn bài trực tiếp vào khung soạn thảo có bộ đếm số từ.
   - Hệ thống tự động lưu nháp tức thời (Auto-Save) về máy chủ mỗi khi thao tác.
   - Nếu xảy ra sự cố mất điện hoặc tuột cáp mạng, khi mở lại máy và đăng nhập đúng SBD, bài làm được khôi phục nguyên vẹn.

### Bước 3: Giám Sát Thời Gian Thực (Live Monitor)
- Giáo viên mở tab **"Giám Sát Phòng Thi"**:
  - Xem sơ đồ lưới toàn bộ máy con trong phòng (30–60 máy).
  - Màu xanh: Đang làm bài bình thường (thấy tiến độ: 4/6 câu).
  - Màu đỏ rung chuông: **Cảnh báo gian lận** (thí sinh cố tình bấm Alt+Tab, chuyển cửa sổ hoặc mất focus).
  - Can thiệp nhanh: Bù giờ (+5 phút) hoặc Thu bài cưỡng chế đối với thí sinh vi phạm.

### Bước 4: Chấm Bài Tự Luận (Essay Grading)
1. Sau khi thí sinh nộp bài, các câu trắc nghiệm được hệ thống tự động chấm điểm 100%.
2. Giáo viên vào tab **"Chấm Bài Tự Luận"**:
   - Màn hình chia 2 cột chuyên dụng: Cột trái là toàn bộ bài làm tự luận của thí sinh, Cột phải là **Barem điểm chi tiết** và ô nhập điểm thành phần + lời phê.
   - Lưu điểm -> Hệ thống tự động cộng dồn: **Tổng Điểm = Điểm Trắc Nghiệm + Điểm Tự Luận**.

### Bước 5: Báo Cáo & Xuất File Excel
1. Vào tab **"Báo Cáo Điểm & Excel"**:
   - Xem phổ điểm, điểm trung bình, tỷ lệ đạt (≥ 5.0đ).
   - Bấm nút **"Xuất Bảng Điểm Ra File Excel (.xlsx)"** để tải về bảng điểm hoàn chỉnh gồm đầy đủ: SBD, Họ tên, Điểm TN, Điểm TL, Tổng điểm, Lỗi vi phạm.
