# Open Questions / Verification Required

| ID | Question | Why unclear | Related code | Recommended verification |
|---|---|---|---|---|
| OQ-001 | Scheduler/cron thực tế chạy ở đâu, chu kỳ nào và sinh task instance/reward evaluation ra sao? | Có cron router và recurrence schema nhưng chưa thấy trigger đầy đủ | cron.ts, task routers | Kiểm tra scheduler/worker production |
| OQ-002 | Role cụ thể cho reward approve/finalize là role nào? | Guard/logic có nhưng mapping business role chưa đủ nhất quán | reward.ts, reward UI | BA/owner xác nhận |
| OQ-003 | Restore board/card/list được hỗ trợ đầy đủ hay chỉ có UI copy/partial flow? | Có archive/deleted fields nhưng chưa thấy mutation restore tương ứng | board/card/list routers | Kiểm tra route và production |
| OQ-004 | Board private/public kiểm tra anonymous và membership chính xác thế nào ở mọi public endpoint? | Có public routers và visibility nhưng boundary từng endpoint cần đối chiếu | boardPublic.ts, public pages | Test public/private staging |
| OQ-005 | Member filter trên board chỉ dành cho ADMIN, và backend có enforce cùng UI không? | UI giới hạn filter member; board query nhận members | Filters.tsx, board.ts | Integration test theo role |
| OQ-006 | Notification in-app hiện có UI/reader nào ngoài schema và email mention? | Schema có notification types nhưng route reader chưa thấy | notifications.ts, notification utility | Kiểm tra client/production |
| OQ-007 | GitHub integration dùng cho import, OAuth hay cả hai; dữ liệu nào được đồng bộ? | Provider/token và import flow phân tán | integration.ts, import.ts | Xác nhận bằng test/API logs |
| OQ-008 | Card status có restriction ngoài enum không? | Update nhận mọi enum value, chưa thấy transition matrix | card.ts, tasks.ts | Test mọi cặp transition |
| OQ-009 | Plan/seat limits nào enforce backend và đâu chỉ là UI copy? | Subscription checks phân tán | member.ts, Stripe routes | Test theo plan |
| OQ-010 | Attachment limit/loại file production chính xác là gì? | UI copy nói 10 MB, cần xác nhận API/storage | attachment.ts, upload route | Kiểm tra config và upload errors |

