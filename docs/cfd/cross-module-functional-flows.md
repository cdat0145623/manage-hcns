# Cross-module Functional Flows

Tài liệu này chỉ ghi các flow có evidence chạy qua từ hai module trở lên.

## Flow 1 — Workspace access to board work

1. Auth/session xác định user.
2. Workspace provider lấy workspace và member scope.
3. Board query kiểm tra board:view trong workspace.
4. Board trả ordered lists/cards.
5. Card/list mutation kiểm tra permission cùng workspace.

**Modules:** ACC → WSP → TSK. **Evidence:** workspace.ts, board.ts, card.ts, list.ts, usePermissions.ts.

## Flow 2 — Card creation with collaboration and external events

1. User mở NewCardForm trong list.
2. TSK kiểm tra card:create và tạo Card ở list/index/status pending.
3. Label/member relations được tạo nếu input có.
4. Activity records được tạo cho created/label/member.
5. Description mention có thể gửi email.
6. Workspace webhook created được dispatch không block card mutation.
7. UI cập nhật board/card cache.

**Modules:** WSP → TSK → COL → INT. **Evidence:** card.ts create, cards.ts, notifications.ts, utils/webhook.ts, NewCardForm.tsx.

## Flow 3 — Drag card

1. Board UI kiểm tra khả năng edit/creator và nhận drag result.
2. UI optimistic remove/insert card.
3. TSK resolve card và destination list, authorize card:edit/creator.
4. Repository cập nhật list/index và ghi activity.
5. Board query invalidate; error restores previous cache.

**Modules:** WSP → TSK → COL. **Evidence:** board/index.tsx onDragEnd, card.ts update, card.repo.ts, activity types.

## Flow 4 — Member invitation and subscription seats

1. ACC invite resolves workspace/current manager and target role.
2. Member record is created or linked and invitation email sent.
3. If subscription is active and not unlimited, INT Stripe seat count is updated.
4. Invitee accepts public code and becomes workspace member.

**Modules:** ACC → INT. **Evidence:** member.ts, invite views, email join-workspace, stripe package, subscription schema.

## Flow 5 — Card reward approval

1. TSK card detail loads OPS reward config.
2. User upserts draft config/deductions.
3. Submit validates assignee/dates/config and moves to waiting_approval.
4. Approver approves and snapshot is stored.
5. Later card date/assignee/config changes are observed by reward violation utility.
6. Reviewer previews/logs violations and finalizes amount, moving reward to completed.
7. Card activity/report surfaces display the resulting records.

**Modules:** TSK → OPS → COL/report. **Evidence:** reward.ts, rewardViolation.ts, rewards.ts, card.ts update, reward components, ReportsView.tsx.

## Flow 6 — Recurring task to calendar and collaboration

1. User creates TaskMaster with frequency/rrule.
2. TaskInstance or virtual occurrence is read for calendar date range.
3. User opens EventDetailModal and updates status/date or adds comment/attachment.
4. Task activity and file/comment records are returned to calendar/card activity views.

**Modules:** OPS → COL. **Scheduler caveat:** production generation timing is OQ-001.

## Flow 7 — Provider import

1. ACC authenticates user and INT reads provider connection.
2. User authorizes/selects Trello board or GitHub project.
3. INT creates Import started, maps external data to WSP Board/List and TSK Card/Label.
4. Import status becomes success or failed; boards UI refreshes.

**Modules:** ACC → INT → WSP → TSK. **Evidence:** import.ts, integration.ts, ImportBoardsForm.tsx, imports schema.

## Flow 8 — Card public consumption

1. Anonymous request enters public board/card route.
2. INT public router delegates to public board/card projection.
3. WSP visibility/public lookup determines board access; TSK returns public card representation.
4. Public reward/activity/dashboard routes expose selected projections.

**Modules:** INT ↔ WSP/TSK/OPS. **Caveat:** all private/public boundaries require OQ-004 verification.

