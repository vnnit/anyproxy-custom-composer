# AnyProxy Custom Composer & Rewrite Rules

Một phiên bản mở rộng mạnh mẽ của **AnyProxy** tích hợp sẵn giao diện Web tương tác cao, cho phép bắt gói tin HTTPS/HTTP, sửa & phát lại request (Composer), lập trình mock Response Body với **điều kiện IF - ELSE** trực quan, và **nạp file Rule `.js` tùy ý từ máy tính kèm hot-reload trực tiếp trên trình duyệt**.

---

## 🌟 Các Tính Năng Nổi Bật

1. **Bắt & Giải Mã HTTPS (Full SSL Interception)**:
   - Root CA có thời hạn 10 năm (không lo hết hạn giữa chừng).
   - Chứng chỉ lá (Leaf Domain Certificate) tự động tạo với thời hạn 365 ngày — **tuân thủ 100% tiêu chuẩn bảo mật Apple iOS / macOS TLS** (tránh triệt để lỗi `CONNECT 200` bị rớt kết nối).

2. **Giao Diện Sửa & Gửi Lại Request (Composer / Replay)**:
   - Nút `[⚡ Sửa & Gửi lại (Composer)]` gắn trực tiếp trên từng dòng request của AnyProxy Web UI.
   - Hỗ trợ đổi Method (GET, POST, PUT,...), URL, Request Headers (JSON) và Request Body, bấm `🚀 Gửi` để test phản hồi từ server thật.

3. **Sửa Response Body & Điều Kiện IF - ELSE (Mock Data)**:
   - Nút `[🎭 Sửa Response Body]` cho phép mock kết quả trả về cho App/Robot mà không cần sửa code backend.
   - **Cấu hình Điều Kiện (IF - ELSE)**:
     - **🟢 NẾU (IF):** So sánh `Request Body`, `Request Header`, `URL / Query`, hoặc `Server Response Body / Status Code` với các phép toán `chứa chuỗi`, `bằng`, `regex`,...
     - **➡️ THÌ (THEN):** Trả về Response Body tùy chỉnh đã cấu hình.
     - **🔴 NGƯỢC LẠI (ELSE):** Trả về kết quả gốc từ Server (Pass-through) hoặc trả về Response Body phụ.
     - **Script Mode:** Viết trực tiếp hàm JavaScript `(req, res)` để xử lý logic phức tạp.

4. **Chọn & Sửa File Rule `.js` Tùy Ý (Hot-Reloading)**:
   - Nhập đường dẫn file `.js` bất kỳ trên máy tính (ví dụ: `C:\my_rules\my_rule.js`).
   - Checkbox bật/tắt rule tức thì (Check = áp dụng rule, Bỏ check = chạy bình thường không can thiệp).
   - Tích hợp khung xem và sửa code rule trực tiếp ngay trên trình duyệt, lưu file là AnyProxy tự động nạp code mới ngay lập tức mà **không cần khởi động lại server**.

---

## 🚀 Cài Đặt & Khởi Chạy

### Yêu Cầu
- **Node.js** >= 16 (Khuyên dùng Node 18, 20 hoặc 22)
- **Git**

### Cài Đặt
```bash
# 1. Clone source code về máy
git clone https://github.com/vnnit/anyproxy-custom-composer.git
cd anyproxy-custom-composer

# 2. Cài đặt thư viện (Tự động chạy patch chứng chỉ & hook giao diện)
npm install

# 3. Khởi động AnyProxy
npm start
```

Mặc định AnyProxy sẽ lắng nghe tại:
- **HTTP / HTTPS Proxy Port:** `8001`
- **Web UI Quản lý:** `http://127.0.0.1:8002` (hoặc `http://<IP_MÁY_TÍNH>:8002`)
- **Trang Composer độc lập:** `http://127.0.0.1:8002/composer`
- **Tải Root CA Certificate:** `http://127.0.0.1:8002/fetchCrtFile`

---

## 📱 Hướng Dẫn Cài Đặt Chứng Chỉ Trên Thiết Bị (iOS / Android)

Để AnyProxy có thể giải mã và can thiệp HTTPS:

### 1. Cấu hình Wifi Proxy
- Trên điện thoại, vào phần cài đặt Wifi đang kết nối -> Chọn **Định cấu hình Proxy (Manual/Thủ công)**:
  - **Máy chủ (Server):** Nhập địa chỉ IP mạng nội bộ của máy tính chạy AnyProxy (ví dụ: `192.168.1.100` hoặc IP VPS).
  - **Cổng (Port):** `8001`

### 2. Tải & Tin Cậy Chứng Chỉ CA
- Mở Safari / Chrome trên điện thoại, truy cập vào:
  ```
  http://<IP_MÁY_TÍNH>:8002/fetchCrtFile
  ```
- **Trên iOS (iPhone/iPad) - Rất Quan Trọng**:
  1. Sau khi tải profile về, vào **Cài đặt (Settings)** -> **Đã tải về hồ sơ (Profile Downloaded)** -> Bấm **Cài đặt (Install)**.
  2. Vào tiếp **Cài đặt chung (General)** -> **Giới thiệu (About)** -> Kéo xuống cuối chọn **Cài đặt tin cậy chứng nhận (Certificate Trust Settings)**.
  3. Tìm chứng chỉ `AnyProxy` và gạt công tắc sang **BẬT (Xanh lá) - Tin cậy đầy đủ (Full Trust)**.
- **Trên Android**:
  - Tải file `rootCA.crt` về, vào **Cài đặt** -> **Bảo mật** -> **Cài đặt mã hóa & thông tin xác thực** -> **Cài đặt từ bộ nhớ điện thoại (Chứng chỉ CA)** -> Chọn file và xác nhận tin cậy.

---

## 🛠️ Hướng Dẫn Sử Dụng Các Tính Năng

### 1. Sửa & Gửi Lại Request (Composer)
- Trong danh sách các request ở Web UI (`:8002`), bấm vào bất kỳ dòng request nào.
- Ở cột bên phải, cạnh nút `copy as CURL`, bấm **`[⚡ Sửa & Gửi lại (Composer)]`**.
- Modal mở ra cho phép chỉnh sửa Headers, Method, Body và bấm **`🚀 Gửi`** để xem kết quả.

### 2. Mock Response Body & Điều Kiện IF - ELSE
- Bấm **`[🎭 Sửa Response Body]`** tại request bạn muốn can thiệp.
- Nhập tên gợi nhớ và URL Pattern cần khớp.
- Tích chọn **`[⚖️ Bật Điều Kiện Kiểm Tra (IF - ELSE)]`**:
  - Chọn NẾU (IF): So sánh trường dữ liệu (`Request Body`, `Header`, `URL`,...) theo điều kiện mong muốn.
  - Chọn THÌ (THEN): Trả về Response Body tùy chỉnh.
  - Chọn NGƯỢC LẠI (ELSE): Giữ nguyên server thật hoặc trả về body khác.
- Bấm **`💾 Lưu vào Data & Kích hoạt Ngay`**.

### 3. Nạp File Rule `.js` Tùy Ý từ Máy Tính
- Bấm nút màu tím ở góc trên bên phải: **`[📋 Quản Lý Rules (Mock / File .JS)]`**.
- Tại tab **`📁 File Rule .JS Tùy Chọn`**:
  - Nhập đường dẫn file `.js` của bạn trên máy tính (ví dụ: `C:/my_script/rule.js`).
  - Bấm **`[🔄 Áp Dụng Ngay]`**.
  - Bấm **`[👁️ Xem / Sửa Code File Trực Tiếp]`** để chỉnh sửa code rule ngay trong trình duyệt mà không cần mở editor bên ngoài.
  - Check/Bỏ check vào ô `☑️ Bật File Rule .JS Này` để bật hoặc tắt việc can thiệp.

---

## 📁 Cấu Trúc Thư Mục

```
├── composerServer.js      # Backend API cho Composer, Rules Manager, File Reader/Writer
├── rulesManager.js        # Module quản lý Mock Rules, evaluate IF-ELSE, Hot-reload file rule .js
├── rule.js                # AnyProxy Rule chính, điều hướng mọi HTTPS qua rulesManager
├── start.js               # Entry script khởi chạy AnyProxy (ports 8001 / 8002)
├── patch.js               # Script tự động patch AnyProxy & CertGenerator khi npm install
├── initCert.js            # Script tạo chứng chỉ Root CA 10 năm
├── composer.html          # Giao diện Web Composer độc lập
├── example_rule.js        # File rule mẫu tham khảo
├── web/
│   └── editHelper.js      # Script gắn thêm giao diện modal, nút bấm vào AnyProxy Web UI
├── package.json
└── README.md
```

---

## 📜 License
Phát hành theo giấy phép [MIT License](LICENSE).
