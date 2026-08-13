# CFD-TSK — Card & Workflow

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-TSK |
| Application | Kan |
| Module | Card & Workflow |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

Card là work item trong list. Module quản lý create/view/edit/delete, move/reorder, status, dates, member assignment, labels và card-specific public view. Collaboration details thuộc CFD-COL; reward side effects thuộc CFD-OPS.

## 3. Functional Model

TSK-01 Card access: create, view, public view.

TSK-02 Card content: title, description, start/due date, status.

TSK-03 Card ordering: same-list reorder, cross-list move.

TSK-04 Card membership: assign/unassign member.

TSK-05 Card labels: add/remove label.

TSK-06 Archive/delete card.

## 4. Current Functional Flow

Người dùng thao tác với công việc từ bảng hoặc màn hình chi tiết. Hệ thống xác định công việc và phạm vi workspace, kiểm tra quyền, kiểm tra dữ liệu, lưu thay đổi theo đúng thứ tự hiển thị, ghi lịch sử và cập nhật giao diện. Khi sắp xếp kéo thả gặp lỗi, giao diện quay lại trạng thái trước đó. Việc tạo công việc có thể gửi email mention và webhook theo cấu hình workspace.

## 5. Functional Behavior

### TSK-01.1 — Create card

**Actor/entry:** thành viên có quyền tạo công việc; biểu mẫu tạo công việc trong một cột.

**Input:** tiêu đề 1–2000 ký tự; mô tả tối đa 10000 ký tự; cột; nhãn; tối đa một người được gán; vị trí đầu/cuối; ngày hết hạn tùy chọn.

**Permission:** card:create in list workspace.

**Main flow:** hệ thống xác định cột và workspace; kiểm tra quyền; tạo công việc ở trạng thái pending tại vị trí yêu cầu; gắn nhãn/người được gán nếu có; ghi lịch sử; trả công việc mới.

**Decision logic:** if labels supplied, all labels must resolve; if members supplied, members must resolve; description mention processing can run asynchronously.

**Exceptions:** unauthenticated, list/label/member missing, validation, relationship/storage failure.

**Data/side effects:** tạo công việc và các liên kết nhãn/người được gán; tạo lịch sử tạo, gắn nhãn và gán người; email mention và webhook có thể được gửi mà không chặn việc tạo công việc.

**Rules:** BR-CANDIDATE-001, 007, 008, 012.

**UI result:** new card appears at selected start/end position; error popup if mutation fails.

**Evidence:** card.ts → create, card.repo.ts, NewCardForm.tsx, cards.ts, utils/notifications.ts, utils/webhook.ts.

### TSK-01.2 — View card

**Actor/entry:** thành viên mở công việc từ bảng hoặc đường dẫn chi tiết; người xem công khai dùng đường dẫn công khai.

**Input:** công việc và ngữ cảnh bảng/bộ lọc đang xem.

**Permission:** protected path checks card:view/workspace; public path depends on public mapping.

**Behavior:** hệ thống trả nội dung công việc cùng cột, nhãn, người được gán, bình luận, checklist, tệp đính kèm và dữ liệu thưởng liên quan. Công việc đã xóa hoặc không tồn tại không được hiển thị.

**Output/UI:** card detail modal/page; public CardModal for public view.

**Evidence:** card.ts → byId/getByUserId, CardDetailsModalContent.tsx, card/index.tsx, public/board/CardModal.tsx.

### TSK-02.1 — Update title/description

**Permission:** card:edit or creator helper.

**Input:** công việc và tiêu đề/mô tả mới tùy chọn.

**Behavior:** chỉ các nội dung người dùng thay đổi mới được lưu; hệ thống ghi lại giá trị trước và sau của tiêu đề/mô tả. Luồng cập nhật mô tả hiện không chứng minh việc gửi email mention giống luồng tạo công việc hoặc bình luận.

**Exceptions:** card missing, invalid title, permission missing, empty update payload yields failed update error.

**Evidence:** card.ts → update, CardDetailsModalContent.tsx.

### TSK-02.2 — Set/remove start and due date

**Permission:** card:edit or creator helper.

**Input:** nullable date fields.

**Behavior:** hệ thống so sánh ngày cũ và ngày mới, phân biệt thêm/đổi/xóa ngày, lưu công việc và ghi lịch sử tương ứng. Nếu công việc có cấu hình thưởng đã duyệt, thay đổi có thể được ghi nhận để đánh giá vi phạm.

**Data:** cập nhật ngày bắt đầu/ngày hết hạn của công việc; tạo lịch sử thêm/đổi/xóa ngày.

**Evidence:** card.ts → update, cards.ts activityTypes, rewardViolation.ts, DueDateSelector.tsx.

### TSK-02.3 — Change card status

**Permission:** card:edit or creator helper.

**Input:** enum pending/done/missed.

**Behavior:** hệ thống nhận một trong ba trạng thái pending, done hoặc missed; nếu khác trạng thái trước đó thì ghi lịch sử chuyển trạng thái. Không tìm thấy giới hạn chuyển trạng thái hoặc trạng thái kết thúc không thể quay lại.

**State:** pending/done/missed → một trạng thái khác trong ba trạng thái được hỗ trợ. Lưu trữ là trạng thái riêng với trạng thái công việc.

**Rules:** BR-CANDIDATE-009; OQ-008.

**Evidence:** tasks.ts → statusTypeEnum, card.ts → update, CardDetailsModalContent.tsx.

### TSK-03.1 — Reorder card within same list

**Actor/entry:** user drag/drop on board; card:edit or creator enables drag.

**Input:** công việc, cột đích là cột hiện tại và vị trí mới.

**Main flow:** giao diện tạm thời chuyển công việc sang vị trí mới; hệ thống lưu lại thứ tự các công việc bị ảnh hưởng; khi thành công bảng được tải lại, khi thất bại thứ tự cũ được khôi phục và người dùng nhận thông báo lỗi.

**Exceptions:** không có vị trí đích → không thay đổi; thiếu quyền → không cho kéo; công việc/cột/vị trí không hợp lệ hoặc lỗi lưu → khôi phục và báo lỗi.

**Rules:** BR-CANDIDATE-003.

**Evidence:** board/index.tsx → onDragEnd/updateCardMutation, card.ts → update/reorder, card.repo.ts.

### TSK-03.2 — Move card across lists

**Input:** công việc, cột đích và vị trí mới.

**Behavior:** hệ thống xác định cột đích, cập nhật cột và vị trí của công việc, ghi lịch sử chuyển cột/thứ tự; bảng phản ánh công việc ở cột mới sau khi lưu.

**Decision:** destination missing or no destination stops action; destination list invalid causes mutation error and optimistic rollback.

**Evidence:** card.ts → update, list.repo.ts/card.repo.ts, board/index.tsx.

### TSK-04.1 — Assign/unassign card member

**Permission:** card:edit.

**Input:** công việc, thành viên workspace và hành động gán/bỏ gán.

**Behavior:** hệ thống xác định công việc và thành viên, thêm hoặc bỏ việc gán, ghi lịch sử gán/bỏ gán; màn hình chi tiết được cập nhật.

**Exceptions:** member/card missing, permission missing, relationship failure.

**Evidence:** card.ts → addOrRemoveMember, card.repo.ts, MemberSelector.tsx, MemberSelector UI.

### TSK-05.1 — Add/remove label

**Permission:** card:edit.

**Input:** công việc, nhãn và hành động thêm/bỏ.

**Behavior:** hệ thống xác định nhãn và công việc, thêm hoặc bỏ nhãn, ghi lịch sử; nhãn mới được phản ánh trên công việc.

**Evidence:** card.ts → addOrRemoveLabel, label.ts, LabelSelector.tsx, cards schema.

### TSK-06.1 — Delete/archive card

**Permission:** card:delete or creator helper.

**Behavior:** công việc được chuyển sang trạng thái lưu trữ/xóa mềm, ghi người thực hiện và lịch sử archived; dữ liệu liên quan được xử lý theo behavior hiện tại. Webhook chỉ phát sinh ở các nhánh đã được implementation chứng minh.

**Exceptions:** card missing, permission missing.

**Evidence:** card.ts → delete, card.repo.ts, DeleteCardConfirmation.tsx, cards.ts.

## 6. Permission Model

| Function | Permission | Additional condition |
|---|---|---|
| Create | card:create | List resolves to workspace |
| View | card:view | Protected card scope |
| Edit/move/status/assign/label/date | card:edit | Creator exception via assertCanEdit |
| Delete | card:delete | Creator exception via assertCanDelete |

## 7. State Model

| Entity | Before | Event | After |
|---|---|---|---|
| Card status | pending/done/missed | status update | any enum value |
| Card location | list A/index n | move | list B/index m |
| Card record | active | delete | deletedAt/deletedBy set |
| Card assignment | absent | assign | relationship exists |
| Card assignment | present | unassign | relationship removed |

## 8. UI & User Interaction

| UI | Behavior |
|---|---|
| Board card/NewCardForm | Create, open detail, drag |
| CardDetailsModalContent | Edit title/description/date/status, labels/members |
| ListSelector | Move to another list |
| DeleteCardConfirmation | Archive/delete confirmation |
| Public CardModal | Public read-only card representation |

Giao diện ẩn hoặc vô hiệu hóa thao tác tạo/sửa/xóa/kéo thả khi người dùng không đủ quyền; hệ thống vẫn kiểm tra quyền khi xử lý. Nếu lưu thao tác kéo thả lỗi, giao diện khôi phục dữ liệu trước đó.

## 9. Rules, Data, Integration

Rules 001, 003, 007, 008, 009, 012 apply. Core relationship is Board → List → Card. Card writes can emit activity, email mention on create/comment, webhook and reward violation observation.

## 10. Open Questions / Limitations

OQ-003 restore; OQ-004 public/private; OQ-005 member filter; OQ-008 status transitions; exact cascade behavior for every related child entity.

## 11. Traceability

| Function | UI | API/service | Entity | Related CFD |
|---|---|---|---|---|
| TSK-01 | NewCardForm/card detail | card.create/byId | Card | WSP/COL/OPS |
| TSK-02 | CardDetailsModal | card.update | Card/Activity | COL/OPS |
| TSK-03 | Board onDragEnd | card.update/reorder | Card/List | WSP |
| TSK-04 | MemberSelector | card.addOrRemoveMember | CardMember | ACC |
| TSK-05 | LabelSelector | card.addOrRemoveLabel | CardLabel | WSP |
| TSK-06 | DeleteCardConfirmation | card.delete | Card/Activity | COL/OPS |

## 12. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
