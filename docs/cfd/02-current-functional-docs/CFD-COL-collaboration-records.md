# CFD-COL — Collaboration & Records

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-COL |
| Application | Kan |
| Module | Collaboration & Records |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

Module lưu tương tác quanh card/task: comment, mention, checklist, attachment và activity/history. Card ownership/permission nằm ở CFD-TSK; member permission nguồn ở CFD-ACC.

## 3. Functional Model

COL-01 Comment
├── COL-01.1 Add card comment
├── COL-01.2 Update comment
└── COL-01.3 Delete comment

COL-02 Checklist
├── COL-02.1 Create/rename/delete checklist
└── COL-02.2 Create/update/delete/check item

COL-03 Attachment
├── COL-03.1 Generate upload URL
├── COL-03.2 Confirm upload
├── COL-03.3 Rename/delete attachment
└── COL-03.4 List/download attachment

COL-04 Activity/history
├── COL-04.1 Read card activity
└── COL-04.2 Read task instance activity

## 4. Current Functional Flow

Người dùng tương tác với công việc hoặc task định kỳ từ màn hình chi tiết. Hệ thống xác định đối tượng cha, kiểm tra quyền, lưu bình luận/checklist/tệp hoặc thay đổi lịch sử, sau đó cập nhật màn hình. Các lỗi được hiển thị mà không làm mất dữ liệu đang có.

## 5. Functional Behavior

### COL-01.1 — Add card/task comment

**Actors/entry:** thành viên có quyền bình luận; biểu mẫu bình luận trong màn hình chi tiết công việc hoặc task.

**Input:** công việc hoặc task; nội dung bình luận không rỗng.

**Permission:** quyền tạo bình luận trong phạm vi công việc; với task, người dùng phải đăng nhập và có quyền trên task mục tiêu.

**Main flow:** hệ thống xác định đối tượng cha; kiểm tra quyền; tạo bình luận kèm người viết/thời điểm; ghi lịch sử; nếu có mention ở nhánh được hỗ trợ thì gửi email; bình luận mới xuất hiện trong màn hình.

**Exceptions:** parent not found, empty comment, unauthenticated, permission failure, email failure is non-blocking.

**Evidence:** card.ts → addComment, taskInstance.ts → addComment, cardComment.repo.ts, NewCommentForm.tsx, notifications.ts, email/templates/mention.tsx.

### COL-01.2 — Update comment

**Actor:** người viết bình luận hoặc thành viên được phép. **Input:** bình luận cần sửa và nội dung mới không rỗng.

**Behavior:** hệ thống xác định bình luận và đối tượng cha, kiểm tra quyền sửa, lưu nội dung/thời điểm mới và ghi lịch sử cập nhật; màn hình hiển thị nội dung mới.

**Exceptions:** comment not found/deleted, invalid content, permission denied.

**Evidence:** card.ts → updateComment, taskInstance.ts → updateComment, Comment.tsx.

### COL-01.3 — Delete comment

**Actor:** comment:delete or author helper where implementation applies.

**Behavior:** bình luận được chuyển sang trạng thái đã xóa mềm, ghi người/thời điểm xóa và lịch sử; giao diện loại khỏi danh sách hoặc đánh dấu đã xóa.

**Evidence:** card.ts → deleteComment, taskInstance.ts → deleteComment, DeleteCommentConfirmation.tsx, comments schema.

### COL-02.1 — Create, rename and delete checklist

**Permission:** card:edit for card checklist.

**Input:** card ID, checklist name; checklist public ID for rename/delete.

**Behavior:** tạo checklist, đổi tên, xóa checklist và các mục theo behavior hiện tại; ghi lịch sử tương ứng. Người dùng thấy checklist mới hoặc trạng thái đã xóa.

**Exceptions:** card/checklist missing, name invalid, permission missing.

**Evidence:** checklist.ts → create/update/delete, checklists.ts, NewChecklistForm.tsx, ChecklistNameInput.tsx, DeleteChecklistConfirmation.tsx.

### COL-02.2 — Manage checklist item

**Permission:** quyền chỉnh sửa công việc; thao tác đánh dấu hoàn thành dùng quyền checklist tương ứng.

**Input:** checklist ID, item ID, text, completed flag, index.

**Behavior:** tạo mục, sửa nội dung/trạng thái hoàn thành/vị trí và xóa mục. Việc đánh dấu hoặc bỏ đánh dấu tạo lịch sử; thứ tự mục được cập nhật.

**Exceptions:** parent/item missing, invalid text, permission denied.

**Evidence:** checklist.ts → createItem/updateItem/deleteItem, Checklists.tsx, ChecklistItemRow.tsx, checklist schema.

### COL-03.1 — Generate attachment upload URL

**Actor:** member with card:edit attach flow. **Input:** card/task parent, file name, mime type, size.

**Behavior:** hệ thống xác định workspace của công việc, kiểm tra quyền chỉnh sửa tệp và cấp địa chỉ tải lên tạm thời kèm thông tin tệp. Tệp chưa được coi là hoàn tất cho đến bước xác nhận.

**Exceptions:** parent missing, permission, storage configuration/failure.

**Evidence:** attachment.ts → generateUploadUrl, AttachmentUpload.tsx, shared S3 utility.

### COL-03.2 — Confirm upload

**Input:** upload result/public identifiers and file metadata.

**Behavior:** hệ thống xác nhận tệp đã được tải lên, tạo bản ghi tệp gắn với công việc/task và lịch sử đính kèm; hình thu nhỏ/danh sách tệp được cập nhật.

**Evidence:** attachment.ts → confirm, cardAttachment.repo.ts, fileActivityLog schema, AttachmentUpload.tsx.

### COL-03.3 — Rename/delete attachment

**Permission:** card:edit in parent workspace.

**Behavior:** đổi tên cập nhật tên hiển thị và ghi lịch sử; xóa đánh dấu tệp đã xóa và ghi lịch sử gỡ tệp. Việc xóa vật lý hoặc tạo địa chỉ tải xuống phụ thuộc behavior lưu trữ hiện tại.

**Exceptions:** attachment not found, parent scope mismatch, permission/storage error.

**Evidence:** attachment.ts → update/delete, AttachmentThumbnails.tsx, fileActivityLog schema.

### COL-03.4 — List/download attachment

**Actor:** người có thể xem công việc cha. **Input:** công việc/task và tệp cần tải xuống.

**Behavior:** trả các tệp chưa bị xóa và địa chỉ xem/tải xuống khi có; giao diện hiển thị hình thu nhỏ/tên tệp hoặc trạng thái rỗng/lỗi.

**Evidence:** attachment.ts → getByCardId/getByTaskInstanceId, pages/api/download/attatchment.ts, AttachmentThumbnails.tsx.

### COL-04.1 — Read card activity

**Permission:** card:view for protected query; card activity public query exists and needs public boundary verification.

**Input:** công việc và bộ lọc/giới hạn hiển thị tùy chọn.

**Behavior:** hệ thống tổng hợp lịch sử thay đổi công việc, bình luận, checklist, tệp, ngày, trạng thái, người, nhãn và thưởng; giao diện hiển thị theo dòng thời gian.

**Evidence:** card.ts → getActivities, utils/activities.ts → mergeActivities, ActivityList.tsx, cards.ts activityTypes.

### COL-04.2 — Read task instance activity

**Actor/entry:** task/card calendar detail. **Input:** task instance ID.

**Behavior:** trả lịch sử, bình luận, checklist và tệp của task; giao diện hiển thị cùng dạng nhật ký hoạt động.

**Evidence:** taskInstance.ts → getActivities, ActivityList.tsx, task schema.

## 6. Permission Model

| Function | Permission | Scope |
|---|---|---|
| Card comment view/create/edit/delete | comment:view/create/edit/delete | Card workspace |
| Checklist | Quyền chỉnh sửa/đánh dấu checklist theo thao tác | Workspace của công việc |
| Attachment mutate | card:edit | Card/task parent workspace |
| Activity read | card:view or task scope | Parent resource |

## 7. State and Data Model

| Entity | Event | Result |
|---|---|---|
| Comment | create/update/delete | active/updated/soft-deleted |
| Checklist item | toggle | completed/uncompleted |
| Attachment | upload/replace/delete | file_uploaded/replaced/deleted activity |
| Activity | parent mutation | immutable audit record with type/old/new metadata |

## 8. UI & User Interaction

| Screen/component | Main functions |
|---|---|
| Card detail modal | all COL functions |
| Comment/NewCommentForm | COL-01 |
| Checklists/NewChecklistForm | COL-02 |
| AttachmentUpload/Thumbnails | COL-03 |
| ActivityList | COL-04 |
| Calendar EventDetailModal | task comment/activity/attachment |

## 9. Rules, Integration, Open Questions

BR-CANDIDATE-009 and 012 apply. Email mention and S3 storage are external integrations. OQ-006 concerns in-app notification reader; OQ-010 concerns exact attachment limit/type enforcement. Activity coverage is implementation-confirmed for listed activity types, not proof that every mutation in the application logs an activity.

## 10. Traceability

| Function | UI | API/service | Entity | Related CFD |
|---|---|---|---|---|
| COL-01 | comment components | card/task comment routers | Comment/Activity | ACC, TSK |
| COL-02 | checklist components | checklist router | Checklist/Item/Activity | TSK |
| COL-03 | attachment components/API | attachment router/S3 | FileActivity | TSK, INT |
| COL-04 | ActivityList | activity queries/merge utility | CardActivity | all modules |

## 11. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
