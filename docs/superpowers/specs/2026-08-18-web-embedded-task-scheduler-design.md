# Web-embedded task scheduler design

## Mục tiêu

Khi production web server khởi động, hai lịch nền của daily task cũng được đăng ký trong cùng Node.js process. Hệ thống chỉ build, push và vận hành image web; không còn image hoặc container scheduler riêng.

## Kiến trúc

- `apps/web/src/instrumentation.ts` là điểm khởi động theo vòng đời Next.js 15. File này phân nhánh runtime trực tiếp để Edge bundle không lần theo mã Node-only; `instrumentation-node.ts` chỉ nạp scheduler ở Node.js runtime và production.
- `@kan/db` cung cấp một hàm khởi động scheduler dùng chung. Hàm này sở hữu kết nối database, đăng ký hai lịch, bắt lỗi từng lần chạy và chống đăng ký lặp trong cùng process.
- CLI scheduler hiện có gọi cùng hàm khởi động để không tạo hai cách thực thi khác nhau.
- Next.js standalone output lần theo import từ instrumentation và đóng gói dependency scheduler vào image web.
- Adapter import `rrule` hỗ trợ cả cách xuất module của Node/tsx và Turbopack để cùng logic recurrence chạy được trong CLI lẫn production bundle.

## Lịch chạy

- Tạo instance: `07:00` mỗi ngày, múi giờ `Asia/Ho_Chi_Minh`.
- Kiểm tra missed: `08:05`, sau đó `08:20`, `08:35`, `08:50` và lặp lại theo nhịp 15 phút đến `23:50` mỗi ngày.
- Nếu server khởi động từ `07:00` trở đi, hệ thống tạo bù instance của ngày hiện tại.
- Nếu server khởi động từ `08:05` trở đi, hệ thống kiểm tra missed ngay một lần trước khi chờ mốc kế tiếp.
- Mỗi loại job không được chạy chồng lên chính nó.

## Triển khai Docker

- Xóa Docker target dành riêng cho scheduler.
- Xóa scheduler service khỏi các Compose deployment.
- `make build`, `make push` và `make deploy` chỉ quản lý image web và migrate.
- Restart policy của web đồng thời khôi phục HTTP server và scheduler.

## Giới hạn

Thiết kế này dành cho một production web replica. Khi mở rộng nhiều replica, cần bổ sung distributed lock bằng PostgreSQL để chỉ một replica thực thi mỗi lượt cron.

## Nghiệm thu

- Unit test xác nhận đúng biểu thức lịch, quy tắc chạy bù và chống overlap.
- Production build của `@kan/web` thành công.
- Web image không còn target/service/image scheduler riêng.
- Khi chạy production web container, log xác nhận scheduler được đăng ký và web vẫn phục vụ HTTP.
