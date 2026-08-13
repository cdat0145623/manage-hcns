# Đề xuất cấu trúc CFD theo functional cohesion

| CFD | Phạm vi | Bao gồm | Không bao gồm | Dependency |
|---|---|---|---|---|
| CFD-ACC | Account & Access | Auth, profile, member, role/permission, invite | Billing và nội dung board | Auth, Workspace |
| CFD-WSP | Workspace & Board | Workspace, board, template, visibility, archive, list, filter/search | Chi tiết card collaboration | CFD-ACC |
| CFD-TSK | Card & Workflow | Card lifecycle, move/reorder/status, labels/dates/assignee | Reward approval chi tiết | CFD-WSP, CFD-COL |
| CFD-COL | Collaboration & Records | Comment, mention, checklist, attachment, activity, notification | Auth/session | CFD-TSK, CFD-ACC |
| CFD-OPS | Recurring Task & Reward | Task master/instance/calendar, reward approval/finalization/report | Board CRUD | CFD-TSK, CFD-ACC |
| CFD-INT | Import, Integration & Billing | Trello/GitHub, webhooks, API keys, Stripe, public access | Core card workflow | CFD-ACC, CFD-WSP |

Các nhóm tương ứng với capability người dùng nhận biết và boundary dữ liệu/API tương đối rõ. Chức năng được nhắc ở CFD khác chỉ để mô tả dependency.

