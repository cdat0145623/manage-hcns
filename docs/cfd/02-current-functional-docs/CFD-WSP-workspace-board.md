# CFD-WSP — Workspace & Board

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-WSP |
| Application | Kan |
| Module | Workspace & Board |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

### Purpose and scope

Workspace là scope chứa member và board. Board chứa list/card, có visibility private/public, type regular/template, archive và favorite. Scope không bao gồm card detail collaboration/reward.

### Actors

Authenticated member theo workspace permission; creator có ngoại lệ edit/delete tại helper; anonymous chỉ đi qua public route khi board/public mapping cho phép.

### Related modules

ACC cung cấp membership/permission; TSK sử dụng board/list; COL/OPS/INT phụ thuộc workspace/board.

## 3. Functional Model

WSP-01 Workspace
├── WSP-01.1 List workspaces
├── WSP-01.2 View workspace
├── WSP-01.3 Create workspace
├── WSP-01.4 Update settings/slug
├── WSP-01.5 Delete workspace
└── WSP-01.6 Search workspace

WSP-02 Board
├── WSP-02.1 List/view board
├── WSP-02.2 Create board/template
├── WSP-02.3 Update board
├── WSP-02.4 Archive/delete board
├── WSP-02.5 Favorite/default template
└── WSP-02.6 Public board access

WSP-03 List
├── WSP-03.1 Create
├── WSP-03.2 Rename/reorder
└── WSP-03.3 Delete list and contained cards

WSP-04 Search/filter
├── WSP-04.1 Workspace search
└── WSP-04.2 Board filters

## 4. Current Functional Flow

Người dùng chọn workspace và mở bảng theo tên hoặc liên kết. Hệ thống xác định phạm vi thành viên, kiểm tra quyền xem và trả về các cột cùng công việc theo bộ lọc. Khi người dùng sắp xếp lại, giao diện phản ánh tạm thời ngay lập tức; nếu lưu thất bại, hệ thống khôi phục thứ tự trước đó. Bảng công khai đi theo luồng truy cập riêng.

## 5. Functional Behavior

### WSP-01.1/WSP-01.2 — List và xem workspace

**Actors/Entry:** người dùng đã đăng nhập tại bộ chọn workspace hoặc thanh điều hướng; người dùng công khai tại trang workspace công khai.

**Input:** tên hoặc mã nhận diện workspace.

**Permission:** quyền xem workspace trong luồng dành cho thành viên; luồng công khai áp dụng điều kiện hiển thị công khai riêng.

**Behavior:** hệ thống trả workspace, thành viên, bảng và thiết lập liên quan. Email thành viên có thể được ẩn theo thiết lập workspace hoặc vai trò người xem. Workspace không tồn tại hoặc nằm ngoài phạm vi truy cập sẽ không được trả về.

**Evidence:** workspace.ts → all/byId/bySlug, workspace schema, apps/web/src/providers/workspace.tsx, SideNavigation.tsx.

### WSP-01.3 — Create workspace

**Actor/entry:** người dùng đã đăng nhập tại biểu mẫu tạo workspace.

**Input:** tên workspace, mô tả tùy chọn và địa chỉ tùy chọn theo cấu hình/gói.

**Validation:** name length, slug availability/format.

**Main flow:** kiểm tra tên và địa chỉ; tạo workspace với gói mặc định và người tạo; danh sách workspace được cập nhật và người dùng được điều hướng tới workspace mới.

**Exceptions:** duplicate/invalid slug, invalid name, DB failure.

**Evidence:** workspace.ts → create, NewWorkspaceForm.tsx, workspace schema.

### WSP-01.4 — Update workspace settings/slug

**Permission:** quyền chỉnh sửa workspace.

**Input:** tên, mô tả, địa chỉ, ngày bắt đầu tuần và khả năng hiển thị email thành viên.

**Behavior:** hệ thống xác định workspace, kiểm tra quyền, kiểm tra địa chỉ còn dùng được rồi lưu các thay đổi. Thiết lập ngày ảnh hưởng lịch; thiết lập email ảnh hưởng dữ liệu thành viên hiển thị.

**Exceptions:** slug conflict, invalid URL/day, workspace missing, forbidden.

**Evidence:** workspace.ts → update/checkSlugAvailability, settings components, workspace schema.

### WSP-01.5 — Delete workspace

**Permission:** quyền xóa workspace. **Input:** workspace identifier.

**Behavior:** hệ thống xác định workspace, kiểm tra quyền và thực hiện thao tác xóa/lưu trữ theo trạng thái hiện tại; người dùng xác nhận rồi được điều hướng khỏi workspace.

**Exceptions:** missing workspace, permission thiếu, related data constraint.

**Evidence:** workspace.ts → delete, DeleteWorkspaceConfirmation.tsx. Chi tiết recoverability cần OQ-003 tương ứng archive flows.

### WSP-01.6 — Search workspace

**Actor/entry:** authenticated user, command palette.

**Input:** từ khóa tìm kiếm và phạm vi workspace.

**Behavior:** hệ thống trả các workspace/bảng mà người dùng có thể truy cập; giao diện hiển thị kết quả và điểm đến.

**Evidence:** workspace.ts → search, CommandPallette.tsx.

### WSP-02.1 — List/view board

**Permission:** quyền xem bảng trong luồng thành viên; bảng công khai dùng điều kiện công khai.

**Input:** workspace/bảng, loại bảng thường/mẫu và bộ lọc thành viên, nhãn, cột, ngày hết hạn.

**Behavior:** hệ thống trả thông tin bảng, workspace, các cột và công việc theo thứ tự, nhãn, thành viên và trạng thái yêu thích. Dữ liệu đã xóa/lưu trữ được loại khỏi chế độ xem theo behavior hiện tại.

**Exceptions:** board missing, private/out-of-scope, invalid IDs.

**Evidence:** board.ts → all/allByUserId/byId/bySlug, boards/card/list repositories, board/index.tsx.

### WSP-02.2 — Create board/template

**Permission:** quyền tạo bảng trong workspace.

**Input:** workspace, tên, địa chỉ, chế độ riêng tư/công khai, loại bảng và bảng mẫu nguồn nếu có.

**Behavior:** kiểm tra tên/địa chỉ, tạo bảng; nếu là bảng mẫu, dữ liệu mẫu nguồn có thể được dùng để khởi tạo bảng; danh sách bảng được cập nhật.

**Exceptions:** workspace missing, slug duplicate, invalid name/URL, permission/plan restriction.

**Evidence:** board.ts → create, NewBoardForm.tsx, NewTemplateForm.tsx, boards schema. Exact plan gate is OQ-009.

### WSP-02.3 — Update board

**Permission:** quyền chỉnh sửa bảng hoặc ngoại lệ dành cho người tạo theo từng thao tác.

**Input:** tên, địa chỉ, chế độ hiển thị, trạng thái lưu trữ và thông tin bảng liên quan.

**Behavior:** chỉ các giá trị được gửi mới được cập nhật; giao diện phản ánh tên, chế độ hiển thị và địa chỉ mới, đồng thời hiển thị kết quả hoặc lỗi.

**Evidence:** board.ts → update, BoardDropdown.tsx, VisibilityButton.tsx, UpdateBoardSlugForm.tsx.

### WSP-02.4 — Archive/delete board

**Permission:** quyền xóa bảng hoặc ngoại lệ dành cho người tạo. **Entry:** menu bảng và hộp thoại xác nhận.

**Behavior:** bảng có thể được chuyển sang lưu trữ hoặc xóa theo nhánh hiện tại; bảng biến mất khỏi danh sách và người dùng được điều hướng phù hợp.

**Exceptions:** board missing, private/out-of-scope, permission/related constraints.

**Evidence:** board.ts → delete/update, DeleteBoardConfirmation.tsx, boards schema. Restore behavior remains OQ-003.

### WSP-02.5 — Favorite/default template

**Actor:** người dùng đã đăng nhập hoặc người quản lý bảng theo quyền hiện tại.

**Input:** bảng hoặc lựa chọn bảng mẫu mặc định.

**Behavior:** trạng thái yêu thích được lưu riêng cho từng người dùng; lựa chọn bảng mẫu mặc định được lưu cho workspace và hiển thị trong danh sách mẫu.

**Evidence:** board.ts → allByUserId/setTemplateDefault/getTemplateDefault, BoardsList.tsx, BoardDropdown.tsx, userBoardFavorites schema.

### WSP-02.6 — Public board access

**Actor/entry:** người xem công khai tại liên kết bảng.

**Input:** địa chỉ hoặc mã nhận diện workspace/bảng.

**Behavior:** hệ thống chỉ trả phần thông tin bảng/công việc được phép công khai; bảng riêng tư hoặc không tồn tại không được hiển thị.

**Confidence:** PARTIALLY CONFIRMED across every public endpoint; see OQ-004.

**Evidence:** boardPublic.ts, board.ts → bySlug, public board views/API.

### WSP-03.1 — Create list

**Permission:** quyền tạo cột trong workspace của bảng.

**Input:** bảng đích và tên cột không rỗng.

**Behavior:** xác định bảng và workspace, kiểm tra quyền, tạo cột ở vị trí phù hợp; bảng được cập nhật để người dùng thấy cột mới.

**Exceptions:** board missing, name empty, permission denied.

**Evidence:** list.ts → create, NewListForm.tsx, lists schema/repository.

### WSP-03.2 — Rename/reorder list

**Permission:** quyền chỉnh sửa cột hoặc ngoại lệ dành cho người tạo.

**Input:** cột, tên mới không rỗng và/hoặc vị trí mới.

**Behavior:** hệ thống đổi tên và/hoặc sắp xếp lại cột. Khi lưu lỗi, giao diện khôi phục thứ tự trước đó và báo lỗi.

**Evidence:** list.ts → update, List.tsx, board/index.tsx onDragEnd.

### WSP-03.3 — Delete list and contained cards

**Permission:** quyền xóa cột hoặc ngoại lệ dành cho người tạo.

**Behavior:** cột được chuyển sang trạng thái đã xóa; toàn bộ công việc trong cột cũng được lưu trữ theo cùng thao tác; lịch sử lưu trữ được tạo cho các công việc đó.

**Rule:** BR-CANDIDATE-002.

**Evidence:** list.ts → delete, list.repo.ts, card.repo.ts, cardActivity.repo.ts, DeleteListConfirmation.tsx.

### WSP-04.1 — Workspace search

**Input:** text query. **Output:** accessible workspace/board results. **Evidence:** workspace.ts → search, CommandPallette.tsx.

### WSP-04.2 — Board filters

**Input:** thành viên, nhãn, cột và nhóm ngày hết hạn: quá hạn, hôm nay, ngày mai, tuần tới, tháng tới hoặc chưa có ngày.

**Behavior:** lựa chọn bộ lọc được giữ trong địa chỉ trang và áp dụng khi tải bảng. Bộ lọc thành viên hiện chỉ hiển thị trong một điều kiện giao diện; việc hệ thống có áp dụng cùng giới hạn ở backend cần OQ-005.

**Evidence:** Filters.tsx, board/index.tsx queryParams, board.ts byId input.

## 6. Permission Model

| Function | Permission | Scope | Additional |
|---|---|---|---|
| View workspace | workspace:view | workspace | Membership |
| Edit/delete workspace | workspace:edit/delete | workspace | Admin/role/override |
| Create board | board:create | workspace | Membership |
| Edit/delete board | board:edit/delete | board workspace | Creator helper where used |
| Create/edit/delete list | list:create/edit/delete | board workspace | Creator helper for edit/delete |

## 7. State Model

| Entity | State/event | Result |
|---|---|---|
| Board | regular/template | type determines board/template view |
| Board | active → archive | isArchived true where update flow used |
| Board/list | đang hoạt động → đã xóa/lưu trữ | trạng thái xóa mềm được áp dụng theo behavior hiện tại |
| List | ordered | index changes on reorder |

## 8. UI & User Interaction

| UI | Purpose | Functions |
|---|---|---|
| /boards | Board list/templates/import entry | WSP-02 |
| /[workspaceSlug]/[...boardSlug] | Board/list/filter/drag | WSP-02, WSP-03, WSP-04 |
| /settings/workspace | Workspace settings | WSP-01 |
| /templates | Template board | WSP-02 |
| Public board pages | Anonymous viewing | WSP-02.6 |

Các điểm tương tác chính là menu bảng, điều khiển hiển thị, biểu mẫu bảng/cột, bộ lọc và hộp thoại xác nhận. Giao diện ẩn hoặc vô hiệu hóa thao tác theo quyền, còn hệ thống vẫn kiểm tra quyền khi xử lý yêu cầu.

## 9. Rules, Data, Integration

BR-CANDIDATE-002, 003, 015 apply. Relationship: Workspace → Board → List → Card. Public route is separate integration boundary. No external service required for core CRUD.

## 10. Open Questions / Limitations

OQ-003 restore, OQ-004 public/private, OQ-005 member filter enforcement, OQ-009 plan/slug gate.

## 11. Traceability

| Function | UI | API | Entity | Related CFD |
|---|---|---|---|---|
| WSP-01 | workspace/settings | workspace router | Workspace | ACC, INT |
| WSP-02 | boards/board/public | board routers | Board/Favorite | TSK, INT |
| WSP-03 | board list UI | list router | List/Card | TSK |
| WSP-04 | command/filter UI | workspace.search/board.byId | Board/Card | TSK |

## 12. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
