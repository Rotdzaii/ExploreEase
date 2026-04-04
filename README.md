# ExploreEase Expo

## 1. Giới thiệu dự án

ExploreEase là ứng dụng du lịch xây dựng bằng Expo + React Native, tập trung vào trải nghiệm khám phá điểm đến và sự kiện theo hành trình.

Các chức năng chính đang có trong dự án:
- Xác thực người dùng với Supabase (bao gồm luồng đăng nhập).
- Khám phá điểm đến và sự kiện.
- Xem chi tiết, đánh giá, gợi ý nội dung liên quan.
- Thêm điểm đến/sự kiện vào kế hoạch theo từng ngày của chuyến đi.
- Đồng bộ dữ liệu hành trình qua Supabase.

## 2. Yêu cầu hệ thống (Prerequisites)

Trước khi chạy dự án, cần cài đặt đầy đủ:

- Node.js: khuyến nghị bản LTS 20.x trở lên.
- npm: đi kèm Node.js (khuyến nghị npm 10+).
- Git: để clone và đồng bộ mã nguồn.
- Expo CLI: không bắt buộc cài global, dự án dùng qua `npx expo ...`.
- Android Studio: nếu chạy giả lập Android.
- Xcode + iOS Simulator: nếu chạy giả lập iOS (chỉ hỗ trợ trên macOS).
- Tài khoản Supabase: cần quyền truy cập Dashboard dự án Supabase.
- Supabase CLI (tùy chọn): dùng khi muốn chạy migration bằng dòng lệnh.

## 3. Cài đặt môi trường (Environment Setup)

### Bước 1: Tạo file `.env`

Tại thư mục gốc dự án, tạo file `.env` từ mẫu `.env.example`:

```bash
cp .env.example .env
```

Nếu dùng PowerShell trên Windows:

```powershell
Copy-Item .env.example .env
```

### Bước 2: Điền biến môi trường bắt buộc

Trong file `.env`, bắt buộc cấu hình:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Cách lấy giá trị:
- `EXPO_PUBLIC_SUPABASE_URL`: vào Supabase Dashboard -> Project Settings -> API -> Project URL.
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: vào Supabase Dashboard -> Project Settings -> API -> anon public key.

### Bước 3: Biến môi trường tùy chọn (khuyến nghị)

Dự án có hỗ trợ đăng nhập Google, có thể cấu hình thêm:

```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GROQ_API_KEY=
```

Lưu ý:
- Lấy các Client ID này từ Google Cloud Console (OAuth 2.0 Client IDs).
- `EXPO_PUBLIC_GROQ_API_KEY` lấy từ Groq Console (API Keys) để gọi Whisper transcription.
- Sau khi thay đổi `.env`, hãy dừng và chạy lại Expo để nạp biến môi trường mới.

## 4. Hướng dẫn chạy dự án (Running the Project)

### Bước 1: Cài dependencies

```bash
npm install
```

### Bước 2: Khởi động Metro/Expo

```bash
npx expo start
```

### Bước 3: Chạy trên từng nền tảng

- Web:
   - Trong terminal Expo nhấn `w`, hoặc chạy trực tiếp:

   ```bash
   npm run web
   ```

- Android Emulator:
   - Mở Android Studio Emulator trước, sau đó trong terminal Expo nhấn `a`.
   - Hoặc chạy:

   ```bash
   npm run android
   ```

- iOS Simulator:
   - Chỉ dùng được trên macOS có cài Xcode.
   - Trong terminal Expo nhấn `i`.
   - Hoặc chạy:

   ```bash
   npm run ios
   ```

Ghi chú cho máy Windows:
- Không thể chạy iOS Simulator cục bộ trên Windows.
- Có thể chạy Web, Android Emulator, hoặc dùng thiết bị iPhone thật với Expo Go (quét QR từ Expo).

## 5. Cấu hình Database (Database Setup)

Dự án yêu cầu áp dụng các SQL migration nằm trong thư mục:

- `supabase/migrations/`

Cách thực hiện:
- Cách 1 (Supabase Dashboard): mở SQL Editor và chạy từng file migration theo thứ tự thời gian.
- Cách 2 (Supabase CLI): link project rồi chạy `supabase db push` để áp dụng migration.

Khuyến nghị:
- Luôn kiểm tra migration mới nhất đã được chạy, đặc biệt các migration liên quan hành trình như `20260407_itinerary_builder_alignment.sql`.
- Không bỏ qua thứ tự migration để tránh lệch schema giữa local và production.
