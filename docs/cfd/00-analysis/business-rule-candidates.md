# Business Rule Candidates

| ID | Rule reverse-engineered | Evidence | Applied function | Confidence |
|---|---|---|---|---|
| BR-CANDIDATE-001 | Card mới có status pending. | cards.ts, tasks.ts | Tạo card/task instance | CONFIRMED |
| BR-CANDIDATE-002 | Card/list bị soft delete; card trong list bị archive cùng lúc. | card.ts, list.ts, deletedAt schema | Xóa card/list | CONFIRMED |
| BR-CANDIDATE-003 | Reorder dùng index; move card có thể đổi list và index. | card/list router và repositories | Drag & drop | CONFIRMED |
| BR-CANDIDATE-004 | Permission hiệu lực = role permissions + member overrides; override precedence. | permissions.ts | Protected mutation | CONFIRMED |
| BR-CANDIDATE-005 | Creator có thể edit/delete entity ngoài permission tổng quát qua helper riêng. | api/utils/permissions.ts | Card/list/board edit/delete | CONFIRMED, cần đối chiếu từng entity |
| BR-CANDIDATE-006 | Role target chỉ được gán/quản trị khi manager đủ hierarchy. | shared permissions, api permissions | Member management | CONFIRMED |
| BR-CANDIDATE-007 | Create card nhận tối đa một member assignee. | card create schema .max(1) | Create/assign card | CONFIRMED |
| BR-CANDIDATE-008 | Title card 1–2000; description create tối đa 10000; tên list/label không rỗng. | Zod schema các router | Create/update | CONFIRMED |
| BR-CANDIDATE-009 | Status/title/date/list/index thay đổi tạo activity tương ứng. | card.ts, cards.ts activity enum | Card update | CONFIRMED |
| BR-CANDIDATE-010 | Reward config chỉ gắn đúng một source card/task instance/task master. | rewards.ts XOR check | Reward upsert | CONFIRMED |
| BR-CANDIDATE-011 | Reward submit có validation assignee, dates và config. | reward.ts, reward UI | Submit approval | CONFIRMED, branch cần review |
| BR-CANDIDATE-012 | Mention có thể phát email; card/comment có side effect không đồng bộ. | card.ts, notifications/email | Comment/card create | CONFIRMED |
| BR-CANDIDATE-013 | Webhook event phải có ít nhất một event, URL hợp lệ; test ký secret nếu có. | webhook.ts, webhook utility | Webhook CRUD/test | CONFIRMED |
| BR-CANDIDATE-014 | Public board/card/reward chỉ expose theo public mapping/visibility. | public routers/pages | Public access | PARTIALLY CONFIRMED |
| BR-CANDIDATE-015 | Board slug unique trong workspace khi board chưa deleted; custom slug có điều kiện plan. | board schema/routers | Board/workspace slug | PARTIALLY CONFIRMED |
| BR-CANDIDATE-016 | Task instance unique theo user + master + target date. | tasks.ts unique constraint | Recurrence | CONFIRMED |

