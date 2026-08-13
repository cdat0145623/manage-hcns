# Application Functional Overview

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-APP |
| Application | Kan |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Last Reviewed | 2026-08-11 |
| Evidence | Source Code |

## 2. Functional Overview

Kan cho phép người dùng tổ chức công việc trong workspace, board, list và card; cộng tác bằng member, comment, checklist, label, attachment và activity; theo dõi deadline trên calendar/report; cấu hình task định kỳ và reward approval; kết nối import/integration, webhook và billing.

Anonymous có thể tiếp cận các public view/API được expose. Authenticated user làm việc trong workspace theo role và permission hiệu lực. Permission mặc định có thể được override ở cấp member.

## 3. Actor model

Anonymous users can authenticate, accept invite links and use public projections. Authenticated workspace members use capabilities according to effective permissions. Roles are ADMIN, AREA_MANAGER, BRANCH_MANAGER and NVVP; hierarchy is used for member/role management. Member-level permission overrides can grant or revoke defaults.

## 4. Functional map

Application → Functional Module → Function:

- CFD-ACC: Auth, account, member, role, permission, invite.
- CFD-WSP: Workspace, board, template, list, archive, visibility, search/filter.
- CFD-TSK: Card CRUD, move/reorder, status, assignee, label, date.
- CFD-COL: Comment, mention, checklist, attachment, activity.
- CFD-OPS: Task master/instance, calendar, reward approval, violation/finalization, reports.
- CFD-INT: Trello/GitHub import, OAuth, webhook, API key, Stripe, public views.

## 5. Major state models

- Card status: pending, done, missed; archive uses deletedAt and is separate from status.
- Board/list/card records have active, archived/deleted behavior where soft-delete fields and update flows apply.
- Member: invited, active, removed, paused.
- Invite link: active, inactive.
- Task instance: pending, done, missed.
- Reward: draft, waiting_approval, approved, rejected, waiting_evaluation, completed.
- Import: started, success, failed.

No transition matrix was found for card status. Reward and member transitions are documented in their CFD.

## 6. Data flow and integration landscape

Core data flows Workspace → Board → List → Card. Card mutations may create Activity, Comment/Checklist/Attachment records, mention email, webhook payload and reward violation effects. Recurring Task flows Frequency → TaskMaster → TaskInstance. External integrations are Better Auth/email, S3-compatible storage, Trello, GitHub, Stripe and workspace webhooks.

## 7. CFD index

| CFD | Functional scope |
|---|---|
| CFD-ACC | Account, membership, role and permission |
| CFD-WSP | Workspace, board, list, template, visibility, filtering |
| CFD-TSK | Card content, assignment, labels, dates, status, drag/drop |
| CFD-COL | Comments, checklists, attachments, activity |
| CFD-OPS | Recurring task, calendar, dashboard, reward lifecycle |
| CFD-INT | Import, provider integration, webhook, billing, public access |

Cross-module flows and evidence coverage are in cross-module-functional-flows.md and functional-coverage-audit.md.

## 8. Current limitations / verification

Các điểm chưa thể kết luận từ source được tập trung tại 00-analysis/open-questions.md, gồm scheduler production, restore đầy đủ, public/private boundary, notification reader, reward role mapping và plan limits.

Requirement Reference: Existing System Baseline.
