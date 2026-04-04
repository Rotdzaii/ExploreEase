1. USER MANAGEMENT (5%)
    1.1 Registration & Login
        [x] Email/password sign-in (Supabase Auth)

        [x] Support Google sign-in: Đã tích hợp luồng đăng nhập Google qua Supabase Auth; Client ID được cấu hình theo từng môi trường trên Google Cloud Console.

        [/] Email/OTP verification flow

        [x] Form validations (Regex email, strong password check: 8+ ký tự, 1 hoa, 1 số)

        [x] Forgot password and recovery via email trigger

        [/] UI Logic: Login button disabled until fields are filled

        [x] Logout implementation

        [ ] Session timeout handling (Config trong Supabase Provider)
    1.2 Profile & Preferences

        [x] Profile fields: Name, age, gender, travel style

        [x] Select interests: Food, culture, shopping, nature, adventure (Đã có UI chọn và lưu vào profiles.interests)

        [x] Edit profile and preferences anytime logic

2. LOCATION-BASED DISCOVERY (5%)
    2.1 GPS Integration

        [/] Real-time location tracking: Đã tích hợp expo-location để lấy tọa độ hiện tại của thiết bị.

        [x] Handle location permissions properly (Android 12+): Đã xử lý yêu cầu quyền ACCESS_FINE_LOCATION và ACCESS_COARSE_LOCATION.

        [x] Manual location override for future planning: Đã có ô nhập vị trí thủ công, geocoding địa chỉ và chuyển đổi giữa GPS thật với vị trí mục tiêu do người dùng chọn.

    2.2 Map View

        [x] Google Maps or Mapbox integration: Đã tích hợp Google Maps (thông qua Static Maps và Linking).

        [/] Display: Points of interest, events, recommended places nearby: Đã hiển thị danh sách, nhưng cần logic lọc "Nearby" (bán kính < 5km) để khớp với yêu cầu "Display".

        [x] Distance calculation and route navigation: * Distance: Đã có hàm Haversine + formatDistance để tính/hiển thị khoảng cách.

        Navigation: Đã có logic mở Google Maps ngoại vi (Module 4.3).

3. INTEREST MAPPING & PERSONALIZATION (10%)

    3.1 Smart Matching
        [/] Match recommendations with user preferences & activity history:

Status: Đã có bảng profiles.interests. Cần viết hàm getRecommendedDestinations để thực hiện phép JOIN giữa sở thích người dùng và thể loại của địa danh.

        [/] Context filters: time of day, weather, seasonal trends:

Status: Cần tích hợp OpenWeather API để gợi ý địa điểm trong nhà khi trời mưa, hoặc gợi ý quán cafe/bar theo khung giờ (Time of day).

        [ ] Use ML to learn user behavior over time for better suggestions:

Status: Ở mức đồ án, có thể dùng thuật toán Content-based Filtering đơn giản hoặc tích hợp OpenAI Embedding (nếu làm phần Module 13).

        3.2 Experience-Aware Suggestions
            [/] Solo vs family suggestions:

Status: Cột travel_style đã có trong Database. Cần thêm nhãn (tag) suitability vào bảng destinations để lọc nội dung khớp với phong cách đi một mình hay đi cùng gia đình.

            [x] Show similar attractions (“You might also like”):

            Status: Đã triển khai ở Home, Destination Detail và Event Detail; có lọc ngữ cảnh nội dung đang xem và loại bỏ chính item hiện tại khỏi danh sách gợi ý.

            [/] Prioritized results based on reviews and proximity:

            Status: Đã có bảng reviews và tọa độ GPS. Cần thực hiện logic sắp xếp kết hợp: ORDER BY rating DESC, distance ASC.

4. DISCOVERY MODULE

    4.1 Content Browsing (Giao diện Home/Explore đã có)
        [x] Explore: Attractions, cuisines, activities: Đã có giao diện phân loại trên Home.

        [x] Auto-categorized content: Đã map dữ liệu từ Supabase theo category_id.

    4.2 Search & Filter (Đã có UI, cần hoàn thiện logic filter giá/rating)
        [/] Filters: category, rating, price, popularity, distance:

            Price/Rating: Đã có.

            Distance: Đã có tọa độ, cần hàm lọc theo bán kính.

        [x] Sorting: relevance, top-rated, A-Z: Đã gắn đầy đủ vào UI Explore và áp dụng trực tiếp lên truy vấn dữ liệu.

        [x] Search suggestions with autocomplete: Đã có debounce + autocomplete theo thời gian thực khi người dùng nhập từ khóa.

    4.3 Detail Page
        [x] Images, map, ratings, description, pricing: (Đã xong, bao gồm cả FX quy đổi tiền tệ).

        [x] Bookmarking/favorites: Đã có toggle icon Trái tim và lưu favorites.

        [x] “Get directions” integration with Google Maps: Đã dùng Linking để mở tọa độ trên Google Maps.

        [ ] Display operational hours and real-time availability (optional): Cần thêm cột opening_hours vào DB nếu muốn làm.

5. EVENT MANAGEMENT

    5.1 Discovery
        [x] Filter by: date, type, free/paid, distance: Đã hoàn thiện filter trong Explore (ngày, loại sự kiện, miễn phí/trả phí, khoảng cách < 5km) và nối với truy vấn dữ liệu.

        [x] Event lifecycle management: Đã quản lý vòng đời sự kiện theo thời gian thực dựa trên start_time/end_time trong service và UI.

        [x] incoming, ongoing, completed status: Đã tính trạng thái động cho danh sách và trang chi tiết sự kiện.

        [x] Countdown timers for upcoming events: Đã thêm bộ đếm ngược theo giây trên trang chi tiết cho sự kiện sắp diễn ra.

        [ ] Share button & bookmarking.

        [x] Search by name and filter by status: Đã hỗ trợ tìm theo tên sự kiện và lọc trạng thái incoming/ongoing/completed.
    5.2 Creation
        [x] Event form: title, category, location, time, price, image.

        [x] Date logic: end date > start date.

        [ ] Admin approval before listing: Cần cột is_approved (boolean) trong bảng events.

        [x] Edit/delete own event.

6. PAGINATION (5%)

        [x] Infinite scroll for long lists: Đã áp dụng tải thêm dữ liệu cho danh sách khám phá bằng cơ chế preload theo cuộn.

        [x] Optimize: attractions, events, reviews: Đã dùng limit/offset cho attractions, events và reviews để tránh tải toàn bộ dữ liệu trong một lần.

        [x] Preload next page on scroll detection: Đã thiết lập ngưỡng preload 0.5 trong luồng cuộn để tự tải trang kế tiếp mượt trước khi chạm đáy danh sách.

7. RATING & REVIEW SYSTEM (10%)

    7.1 Ratings 
        [x] 1–5 star system: Đã có trong bảng reviews.

        [ ] Visual rating bars: Cần làm UI hiển thị biểu đồ cột (5 sao chiếm bao nhiêu %, 4 sao bao nhiêu %...).
    7.2 Reviews (Đã có SQL Seeding dữ liệu mẫu và sửa lỗi fetch 400)
        [/] Text + optional photo: Phần Text đã xong, phần Photo cần tích hợp Supabase Storage để upload ảnh.

        [/] Sort: newest, top-rated, most helpful: Đã xong logic newest, cần thêm cột helpful_count trong DB để làm most helpful.

        [ ] Reply to reviews: Cần thêm cột parent_id hoặc reply_to trong bảng reviews để người tổ chức phản hồi.
            Reply" thường dành cho chủ địa điểm hoặc Admin. Kiểm tra xem trong bảng profiles có phân quyền (role) chưa để hiện nút Trả lời cho đúng đối tượng.
    7.3 Moderation
        [ ] Flag/report reviews
        [ ] Admin panel to review, delete, or approve flagged content

8. NOTIFICATIONS (5%)

    8.1 Push Notifications (Đã có bảng reminders, cần kết nối Expo Notifications)
        [/] Push Notifications: Đã có bảng reminders, cần tích hợp expo-notifications để đẩy tin nhắn thật lên điện thoại.
    8.2 In-App Center
        [/] In-App Center: Đã có màn hình "Thông báo" + badge/toast; chưa gom nhóm theo loại.

9. DATA SYNCHRONIZATION & OFFLINE ACCESS (5%)

    [/] Offline caching for saved items, profile: Hiện mới có caching cho FX/theme; chưa cache favorites/profile theo yêu cầu.

        [/] Auto-sync changes when back online: Đã tích hợp NetInfo + AsyncStorage queue cho Review. Khi offline sẽ lưu review cục bộ; khi online lại app tự đồng bộ queue lên bảng reviews của Supabase.

        [ ] Limited offline access: Cho phép xem lại thông tin chi tiết các địa danh đã từng "đi qua" (cached) va event mà không cần mạng.

10.  SECURITY & PRIVACY (5%)

        [x] Secure actions require auth: Đã triển khai RLS (Row Level Security). User không thể tạo Event nếu chưa Login.

        [x] Secure API communication with HTTPS: Mặc định của Supabase Cloud.

        [ ] App-level encryption for cached data: Cần sử dụng expo-secure-store thay cho AsyncStorage đối với các thông tin nhạy cảm.

        [ ] Two-factor auth (Optional): Có thể kích hoạt qua Supabase Auth Dashboard.

11.  ADMIN DASHBOARD (New - 5%)

    [ ] View: user profiles, events, reviews:

        Status: Xem trực tiếp qua Supabase Dashboard (Backend). Cần làm một màn hình UI dành riêng cho tài khoản có role: 'admin' để xem danh sách này trên app hoặc web.

        [ ] Approve or reject events:

        Status: Cần thêm cột status (enum: pending, approved, rejected) vào bảng events. Admin sẽ thực hiện UPDATE trạng thái này.

        [ ] Moderate flagged content:

        Status: Kết hợp với Module 7.3. Khi có bản ghi trong bảng reports, Admin sẽ có quyền xóa Review hoặc ẩn địa điểm.

        [ ] View analytics (user activity, top places, traffic stats):

        Status: Cần viết các hàm rpc (Stored Procedures) trong Supabase để đếm số lượt bookmark, số user mới, và địa danh được yêu thích nhất.

12.  TRAVEL PLANNING (New - 5%)

    [/] Itinerary builder: Add events and places to a day-wise plan:

    Status: Trọng tâm. Đã có SQL itinerary_items. Đang triển khai BottomSheet để chọn ngày và thêm từ trang Chi tiết.

        [x] Share travel plans:

    Status: Cần tạo mã QR (thư viện react-native-qrcode-svg) chứa Deep Link dẫn đến chuyến đi, hoặc xuất file PDF lịch trình.

        [x] Add travel notes or reminders:

    Status: Đã có cột notes trong Database. Logic nhắc nhở đã có bảng reminders.

        [x] Suggested route optimization:

    Status: Thách thức kỹ thuật. Cần thuật toán sắp xếp các itinerary_items theo khoảng cách địa lý (từ tọa độ đã nạp) để gợi ý thứ tự đi 1 -> 2 -> 3 sao cho quãng đường ngắn nhất.

13. ADVANCED SEARCH & SMART DISCOVERY (5%)

    13.1 Voice Search
        [/] Tìm kiếm bằng giọng nói (Google Speech API): * Status: Đã tích hợp nút mic + luồng ghi âm xin quyền microphone trên Home, gọi Groq Whisper transcription API và tự động đổ transcript vào ô search để chạy filter.

        [ ] Gợi ý kết quả theo thời gian thực: Cần logic stream kết quả tìm kiếm ngay khi tiếng nói được chuyển thành văn bản.

    13.2 AI-Based Similarity Search
        [ ] Tìm địa điểm “giống với chỗ bạn đã thích”: Cần tính toán độ tương đồng giữa các địa danh.

        [ ] Sử dụng embedding (BERT/Word2Vec hoặc vector similarity): Cậu nên dùng pgvector của Supabase để lưu trữ embedding và thực hiện tìm kiếm vector similarity. Đây là "điểm cộng" cực lớn cho SAD.

    13.3 Multi-Factor Search
        [/] Tìm theo: ngân sách, mood, thời gian rảnh, khoảng cách: * Status: Phần ngân sách đã có FX Service hỗ trợ. Cần thêm cột mood (chill, adventure, etc.) vào bảng destinations.

        [ ] Hỗ trợ tìm lộ trình 1 ngày: “Gợi ý lịch trình 4 giờ buổi tối”.

14. SOCIAL FEATURES (5%)

    14.1 Follow/Unfollow
        [ ] Theo dõi người dùng khác, travel blogger hoặc bạn bè: Cần tạo bảng follows (follower_id, following_id) với chính sách RLS phù hợp.

    14.2 Feed & Activity Stream
        [ ] Hiển thị hành động của bạn bè: * Ví dụ: “Anna vừa đánh giá Chợ Bến Thành 5★”.

Status: Cần một bảng activities ghi lại các trigger từ Reviews và Bookmarks.

    14.3 Shared Recommendations
        [/] Share địa điểm qua QR: Đã có ý tưởng, cần cài react-native-qrcode-svg.

        [ ] Gửi gợi ý trực tiếp qua in-app chat: Kết nối trực tiếp với Module 15.
15. IN-APP MESSAGING (5%)

    15.1 One-to-One Chat
        [ ] Trao đổi giữa khách và người tổ chức sự kiện: Cần logic phân quyền giữa User và Organizer.

        [ ] Chat end-to-end encryption (E2EE): * SAD Note: Cậu có thể dùng AES-256 hoặc thư viện Signal Protocol để mã hóa tin nhắn tại máy khách trước khi gửi lên Supabase.

    15.2 Group Chat for Events
        [ ] Tạo nhóm chat cho sự kiện để thảo luận: Tự động tạo nhóm dựa trên event_id.

        [ ] Gửi ảnh, vị trí: Tích hợp Supabase Storage và GPS (Module 2).

        [ ] Pin thông báo quan trọng: Logic gắn cờ cho tin nhắn trong bảng messages.


## Future Enhancements (Cải tiến trong tương lai)
- [ ] **Profile Onboarding Guard:** Thêm Global Guard lớp thứ 2 để ép buộc user mới đăng ký phải cập nhật đầy đủ thông tin (tên, avatar) trước khi vào trang chủ.
- [ ] Anti replay attack
- [ ] - [ ] **Realtime Voice Streaming:** Nâng cấp Voice Search, hiển thị chữ ngay lập tức theo thời gian thực (streaming) khi người dùng đang nói thay vì đợi kết thúc.