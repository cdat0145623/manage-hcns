# Functional Inventory

| ID | Module | Function | Actor | Entry point | Backend/API | Entity | Evidence | Confidence |
|---|---|---|---|---|---|---|---|---|
| FI-001 | Account & Access | Đăng ký, đăng nhập, session, đổi/reset mật khẩu | Khách; user | /login, /signup | Better Auth | User, session | packages/auth/src/auth.ts | CONFIRMED |
| FI-002 | Account & Access | Cập nhật profile, username, avatar, trạng thái | User; manager/admin | /account, members | user.* | User, member | packages/api/src/routers/user.ts | CONFIRMED |
| FI-003 | Workspace | Tạo/sửa/xóa workspace, slug, settings | Member/owner | workspace/settings | workspace.* | Workspace | workspace.ts, WorkspaceSettings | CONFIRMED |
| FI-004 | Workspace | Mời/quản lý member, role, invite link | User có permission | /members, /invite/[code] | member.* | Member, invite link | member.ts, members views | CONFIRMED |
| FI-005 | Authorization | Role defaults, custom grant/revoke/reset | Admin/manager | permissions settings | permission.* | Role, permission | permissions files | CONFIRMED |
| FI-006 | Board | Xem/tạo/sửa/xóa/archive/restore/favorite/template board | Member theo permission | /boards, board route | board.* | Board | board.ts, board views | CONFIRMED |
| FI-007 | Column | Tạo, đổi tên, reorder, xóa column | Member/creator | Board UI | list.* | List | list.ts, List.tsx | CONFIRMED |
| FI-008 | Card | Tạo/xem/sửa/xóa, move/reorder, status, date | Member/creator | Board/card modal | card.* | Card | card.ts, card views | CONFIRMED |
| FI-009 | Card metadata | Assignee/member, label, deadline/start date | Member | Card modal | card/label mutations | Card, Label, Member | card.ts, label.ts | CONFIRMED |
| FI-010 | Collaboration | Comment, mention email, checklist, activity | Member | Card modal | card/checklist routers | Comment, Checklist, Activity | card/checklist routers | CONFIRMED |
| FI-011 | Attachment | Presigned upload, confirm, rename/delete, download | Member | Card modal/API | attachment.* | File activity | attachment.ts, upload routes | CONFIRMED |
| FI-012 | Search/filter | Workspace search; filter member/label/list/due date | Member | command/board filters | workspace.search, board.byId | Board/Card | workspace.ts, Filters.tsx | CONFIRMED |
| FI-013 | Calendar/report/dashboard | Calendar task/card date; dashboard/reward reports | Auth/public tùy endpoint | calendar/reports | dashboard/task/reward | Card, Task, Reward | pages/routers | CONFIRMED |
| FI-014 | Recurring tasks | Task master/instance, frequency, status | Authenticated user | calendar/task UI | taskMaster/taskInstance | Frequency, Task* | task schemas/routers | CONFIRMED |
| FI-015 | Reward | Cấu hình, submit/withdraw/approve/reject/revert/finalize | Staff/approver | reward UI/reports | reward.* | Reward entities | reward.ts, reward schema | CONFIRMED |
| FI-016 | Import | Import board từ Trello/GitHub | Authenticated user | boards import/settings | import.trello/github | Import, Board/List/Card | import.ts | CONFIRMED |
| FI-017 | Integration | Kết nối/ngắt GitHub, Trello auth | Authenticated user | integration settings | integration.* | Integration | integration.ts | CONFIRMED |
| FI-018 | Webhook | CRUD/test workspace webhook | Member có quyền | webhook settings | webhook.* | WorkspaceWebhook | webhook.ts | CONFIRMED |
| FI-019 | Billing | Checkout, billing session, Stripe webhook, seat update | Workspace owner/admin | billing/pricing | Stripe routes/package | Subscription | stripe package/routes | CONFIRMED |
| FI-020 | Public access | Public board/card/dashboard/reward views | Anonymous/public | public pages/API | public routers | Public Board/Card/Reward | public routers/pages | CONFIRMED |
| FI-021 | Feedback/health | Gửi feedback; health check DB/storage | User; operator | feedback/health API | feedback/health | Feedback, health | routers | CONFIRMED |

Phase 2 function-level decomposition:

- CFD-ACC: ACC-01.1–01.3, ACC-02.1–02.3, ACC-03.1–03.5, ACC-04.1–04.3 (14 behavior functions).
- CFD-WSP: WSP-01.1–01.6, WSP-02.1–02.6, WSP-03.1–03.3, WSP-04.1–04.2 (17 behavior functions; WSP-01.1 and WSP-01.2 are documented together in one behavior section).
- CFD-TSK: TSK-01.1–01.2, TSK-02.1–02.3, TSK-03.1–03.2, TSK-04.1, TSK-05.1, TSK-06.1.
- CFD-COL: COL-01.1–01.3, COL-02.1–02.2, COL-03.1–03.4, COL-04.1–04.2.
- CFD-OPS: OPS-01.1–01.3, OPS-02.1–02.2, OPS-03.1–03.2, OPS-04.1–04.5, OPS-05.1–05.3.
- CFD-INT: INT-01.1–01.2, INT-02.1–02.3, INT-03.1–03.4, INT-04.1–04.3, INT-05.1–05.2.

Phase 2 added a separate mapping for feedback/health in the coverage audit; health is operational and feedback remains a low-scope support function without a standalone CFD.
