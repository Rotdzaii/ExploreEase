Phase 1: Core & Essential (Ưu tiên cao)
Đây là các hạng mục bắt buộc để luồng chính của App vận hành.

[x] B1.1: Destination Detail Page (Module 4.3)
    -  [x] Tạo `app/destination/[id].tsx` với scaffold chuẩn.
    -  [x] Tích hợp Header Image, Floating Card và Sticky Button.

[x] B1.2: Rating & Review System (Module 7)
    - [x] Backend: Tạo bảng `reviews` & RLS Policies.
    - [x] Service: Thêm hàm `getReviews`, `submitReview`, và `calculateAverageRating`.
    - [ ] UI: Hiển thị danh sách đánh giá tại trang chi tiết.
    - [ ] Logic: Cho phép người dùng gửi đánh giá mới.

[x] B1.3: Backend Search Logic (Module 4.2)
    - [x] Connectivity: Truyền Params từ Home sang Detail.
    - [x] Logic: Viết hàm `searchDestinations` dùng `.ilike()`.
    - [x] UI: Kết nối SearchBar với hàm handleSearch và xử lý Race Condition.

[x] B1.4: Performance Optimization (Module 6)
    Chuyển PopularDestinations từ .map() sang FlatList để tiết kiệm RAM.

Phase 2: Features & Experience (Nâng cao)
Gia tăng giá trị và trải nghiệm cho người dùng.

[ ] B2.1: Location-Based Discovery (Module 2)
Tích hợp expo-location lấy tọa độ GPS thực tế.

[ ] B2.2: Event Management (Module 5)
Khám phá các sự kiện du lịch địa phương.

[ ] B2.3: Offline Access (Module 9)
Caching dữ liệu điểm đến vào bộ nhớ máy.

Phase 3: SAD Documentation & Final
Hoàn thiện tài liệu theo quy chuẩn kiến trúc phần mềm.

[ ] B3.1: UML Diagrams
Vẽ Use Case cho luồng Discovery.
Vẽ Sequence Diagram cho luồng gửi Review.

[ ] B3.2: Architecture Views
Mô tả Module View (Cấu trúc file) và C&C View (Kết nối Database).

[ ] B3.3: Advanced Feature Selection
Chọn làm Voice Search hoặc Itinerary Builder (Lên lộ trình).

- [ ] **B4.1: Social Circle (Module 14)**
    - Follow/Unfollow người dùng khác.
    - Activity Stream: "User A vừa đánh giá 5 sao cho địa điểm B".
    - Chia sẻ địa điểm qua QR Code.
- [ ] **B4.2: In-App Messaging (Module 15)**
    - Chat 1-1 giữa người dùng và chủ sự kiện (End-to-end encryption).
    - Group Chat cho từng sự kiện cụ thể.
- [ ] **B4.3: AI & Voice Search (Module 13)**
    - Tích hợp Google Speech API cho Voice Search.
    - Logic "Tìm địa điểm tương tự" dùng Vector Similarity (AI-Based).

## 📊 Phase 5: Administration & Planning (Module 11, 12)
*Hoàn thiện hệ thống quản lý và lập kế hoạch chuyên sâu.*

- [ ] **B5.1: Travel Planner (Module 12)**
    - Itinerary builder: Lập kế hoạch du lịch theo từng ngày.
    - Tối ưu hóa lộ trình di chuyển (Route optimization).
- [ ] **B5.2: Admin Dashboard (Module 11)**
    - Duyệt/Từ chối các sự kiện do người dùng tạo.
    - Thống kê (Analytics): Top địa điểm, lượng người dùng active trên máy Acer Aspire 7.

## 📝 Phase 6: SAD Documentation (Final Polish)
*Hoàn thiện hồ sơ kiến trúc để bảo vệ đồ án.*

- [ ] Tài liệu hóa **Arch Structure Perspectives**: Static, Dynamic, Physical.
- [ ] Giải trình **Quality Tactics** cho Performance (FlatList) và Security (RLS).

✅ Done
[x] Setup Project: Expo + Supabase Auth.

[x] Home UI: Header, SearchBar, Categories, Featured Card.

[x] Database Schema: profiles, notifications, categories, destinations.

[x] Responsive Layout: useWindowDimensions + clamp logic.

[x] Real-time Notifications: Subscribe INSERT logic & Bell red-dot.