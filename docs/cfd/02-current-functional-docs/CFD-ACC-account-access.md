# CFD-ACC — Account & Access

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-ACC |
| Application | Kan |
| Module | Account & Access |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

### Purpose and scope

Module xác thực người dùng, duy trì session, quản lý profile, workspace membership, lời mời và quyền hiệu lực. Không bao gồm CRUD workspace/board (CFD-WSP), card collaboration (CFD-COL) hay billing (CFD-INT).

### Actors

| Actor | Functional role | Scope |
|---|---|---|
| Anonymous visitor | Signup, login, đọc/accept invite link | Auth/public invite |
| Authenticated user | Profile và workspace mình thuộc về | User/session |
| Workspace member | Sử dụng quyền được cấp | Workspace |
| ADMIN, AREA_MANAGER, BRANCH_MANAGER, NVVP | Role dùng để tính quyền và hierarchy | Member trong workspace |
| Member manager | Invite, role, remove, permission override | Target member |

### Related modules

ACC cung cấp authorization cho WSP, TSK, COL; membership thay đổi có thể đồng bộ seat với INT.

## 3. Functional Model

ACC-01 Authentication: signup, login/session, password/email flows.

ACC-02 Account: view/update profile, status, position.

ACC-03 Membership: invite member, invite link, accept link, change role, remove member.

ACC-04 Authorization: read effective permissions, member overrides, role permissions.

## 4. Current Functional Flow

Người dùng bắt đầu bằng việc tạo tài khoản hoặc đăng nhập. Sau khi phiên làm việc được xác lập, mỗi hành động trong workspace được đối chiếu với tư cách thành viên, vai trò và các quyền được cấp riêng. Nếu không đủ quyền, hệ thống từ chối hành động. Lời mời bằng liên kết là một luồng công khai: hệ thống kiểm tra tính hợp lệ trước khi tạo hoặc liên kết thành viên.

## 5. Functional Behavior

### ACC-01.1 — Sign up

**Actors/Entry:** Người chưa đăng nhập tại màn hình đăng ký. Không cần phiên đăng nhập trước.

**Input:** tên đăng nhập (tối thiểu 3 ký tự, được chuẩn hóa và không trùng), mật khẩu, họ tên, email xác thực và vai trò tùy chọn. Nếu không chọn vai trò, tài khoản mới nhận vai trò NVVP theo implementation hiện tại.

**Main flow:** hệ thống kiểm tra tên đăng nhập; bảo vệ mật khẩu; tạo hồ sơ tài khoản và phiên làm việc; người dùng được chuyển vào ứng dụng.

**Exceptions:** username trùng → BAD_REQUEST; input sai → validation; không tạo session được → INTERNAL_SERVER_ERROR; signup có thể bị disable theo config.

**Data/side effects:** tạo hồ sơ người dùng, thông tin đăng nhập và phiên làm việc. Không có bằng chứng cho thấy đăng ký tự tạo workspace.

**Evidence:** packages/auth/src/auth.ts, apps/web/src/views/auth/signup, apps/web/src/pages/signup/index.tsx.

### ACC-01.2 — Login/session

**Actors/Entry:** Người chưa đăng nhập tại màn hình đăng nhập.

**Input:** credential và callback URL.

**Behavior:** hệ thống đối chiếu thông tin đăng nhập, tạo hoặc làm mới phiên làm việc và điều hướng người dùng tới địa chỉ tiếp theo. Thông tin sai giữ người dùng ở màn hình đăng nhập và hiển thị lỗi.

**Evidence:** packages/auth/src/auth.ts, packages/auth/src/client.ts, apps/web/src/views/auth/login.

### ACC-01.3 — Password/email account flows

Ứng dụng có các luồng đặt lại mật khẩu, liên kết đăng nhập và xác thực email. Trigger và nhà cung cấp email cụ thể phụ thuộc cấu hình nên mức xác nhận cho từng email là PARTIALLY CONFIRMED.

**Evidence:** packages/auth/src/auth.ts, packages/auth/src/hooks.ts, packages/email/src/templates.

### ACC-02.1 — Xem/cập nhật profile

**Actors/Entry:** Chủ tài khoản tại màn hình tài khoản/cài đặt.

**Input:** tên hiển thị, tên đăng nhập, email, mật khẩu và ảnh đại diện tùy màn hình. Hệ thống kiểm tra các giá trị định danh và mật khẩu theo luồng tương ứng.

**Behavior:** hệ thống đọc hồ sơ hiện tại, kiểm tra dữ liệu, lưu thay đổi và hiển thị giá trị mới trên các màn hình liên quan. Mật khẩu hiện tại sai, định danh không hợp lệ/trùng hoặc chưa đăng nhập sẽ bị từ chối.

**Data/side effects:** hồ sơ tài khoản được cập nhật; các thay đổi được implementation ghi nhận vào lịch sử tài khoản. Ảnh đại diện được lưu qua luồng tải ảnh.

**Evidence:** packages/api/src/routers/user.ts, apps/web/src/views/account, apps/web/src/views/settings, apps/web/src/pages/api/upload/avatar.ts.

### ACC-02.2 — Cập nhật trạng thái user

**Actor/entry:** chủ tài khoản hoặc người quản lý được phép; màn hình tài khoản/thành viên.

**Input:** người dùng/thành viên mục tiêu và trạng thái được hỗ trợ.

**Behavior:** resolve target, authorize, update status và trả kết quả; UI hiển thị popup/error. Target không tồn tại hoặc không đủ quyền bị từ chối.

**Evidence:** packages/api/src/routers/user.ts → updateStatus, apps/web/src/views/account/index.tsx.

### ACC-02.3 — Cập nhật position

**Actor/entry:** Authorized user/manager trong account hoặc members.

**Input:** target user và position.

**Behavior:** resolve position, cập nhật user/member; position không tồn tại trả lỗi.

**Evidence:** user.ts → updatePosition, position.ts, PositionSelector.tsx.

### ACC-03.1 — Invite member trực tiếp

**Permission:** quyền mời thành viên trong workspace; vai trò được mời phải nằm trong phạm vi mà người mời có thể quản lý. **Entry:** màn hình thành viên.

**Input:** workspace, email hoặc existing user, role. Duplicate member được kiểm tra.

**Main flow:** hệ thống xác định workspace và người mời; kiểm tra thành viên trùng và vai trò mục tiêu; tạo thành viên ở trạng thái phù hợp; gửi email mời; nếu gói dịch vụ có giới hạn chỗ ngồi thì đồng bộ số chỗ.

**Exceptions:** user/workspace không tồn tại, duplicate, role vượt hierarchy, plan/seat hoặc email failure.

**Data/side effects:** tạo thành viên workspace; gửi email; có thể đồng bộ số chỗ của gói dịch vụ.

**Evidence:** member.ts → invite, InviteMemberForm.tsx, packages/email/src/templates/join-workspace.tsx, packages/stripe/src/index.ts.

### ACC-03.2 — Create/read/deactivate invite link

**Permission:** thành viên có quyền quản lý lời mời. **Entry:** màn hình thành viên.

**Input:** workspace public ID; link public ID/code khi deactivate.

**Behavior:** hệ thống tạo liên kết đang hoạt động, cho phép xem liên kết hiện hành và vô hiệu hóa liên kết khi được yêu cầu. Liên kết chưa tạo thành viên trước khi được chấp nhận.

**Exceptions:** workspace/link không tồn tại hoặc permission thiếu.

**Evidence:** member.ts → getActiveInviteLink/createInviteLink/deactivateInviteLink, workspaceInviteLinks.ts, InviteMemberForm.tsx.

### ACC-03.3 — Accept invite link

**Actor/entry:** người nhận lời mời tại trang liên kết mời công khai.

**Input:** invite code và session nếu đã đăng nhập.

**Behavior:** hệ thống kiểm tra liên kết còn hiệu lực, xác định người dùng, tạo hoặc gắn thành viên vào workspace và đưa người dùng tới workspace.

**Exceptions:** code invalid/expired/inactive, identity/session thiếu, đã là member.

**Evidence:** member.ts → getInviteByCode/acceptInviteLink, apps/web/src/views/invite/index.tsx.

### ACC-03.4 — Change member role

**Permission:** member edit và target hierarchy. **Input:** workspace/member, role.

**Behavior:** hệ thống kiểm tra người quản lý và thành viên mục tiêu; vai trò mới phải nằm trong cấp bậc được phép; sau đó lưu vai trò mới và cập nhật danh sách thành viên.

**Exceptions:** target không tồn tại, role invalid, target ngang/cao hơn hoặc permission thiếu.

**Evidence:** member.ts → updateRole, permissions.ts → assertCanAssignRole, members/index.tsx, RoleSelector.tsx.

### ACC-03.5 — Remove member

**Permission:** member remove/helper và target hierarchy. **Input:** workspace/member.

**Behavior:** hệ thống kiểm tra quyền trên thành viên mục tiêu, chuyển thành viên sang trạng thái bị loại bỏ theo implementation; các quan hệ liên quan được xử lý theo quy tắc dữ liệu hiện tại; số chỗ dịch vụ có thể được giảm.

**Evidence:** member.ts → delete, DeleteMemberConfirmation.tsx, member.repo.ts.

### ACC-04.1 — Read effective permissions

**Entry:** màn hình quyền và hộp thoại quyền thành viên; các màn hình khác dùng kết quả quyền hiệu lực để quyết định thao tác.

**Behavior:** hệ thống lấy quyền mặc định của vai trò, sau đó áp dụng các thay đổi riêng của thành viên; kết quả là danh sách quyền hiệu lực và vai trò hiện tại.

**Evidence:** permission.ts → getMyPermissions/getMemberPermissions, permissions.ts, usePermissions.ts.

### ACC-04.2 — Grant/revoke/reset member permissions

**Permission:** quyền chỉnh sửa thành viên và điều kiện cấp bậc trên thành viên mục tiêu. Cấp quyền hoặc thu hồi quyền tạo thay đổi riêng cho thành viên; đặt lại sẽ xóa thay đổi riêng để thành viên dùng lại quyền mặc định của vai trò.

**Exceptions:** key invalid, target khác workspace, hierarchy/permission thiếu.

**Evidence:** permission.ts → grantPermission/revokePermission/resetMemberPermissions/resetWorkspaceMemberPermissions, EditMemberPermissionsModal.tsx.

### ACC-04.3 — Manage role permissions

**Permission:** quyền quản lý vai trò và thành viên theo điều kiện hiện tại. Cấp/thu hồi quyền của vai trò làm thay đổi quyền mặc định; thành viên có thiết lập riêng vẫn ưu tiên thiết lập riêng.

**Evidence:** permission.ts → getWorkspaceRoles/getWorkspaceRolePermissions/grantRolePermission/revokeRolePermission, RolePermissions.tsx.

## 6. Permission Model

| Action | Permission/scope | Additional condition |
|---|---|---|
| Invite | member:invite | Role hierarchy |
| Change/remove member | member:edit/member:remove | Target hierarchy |
| Member permission override | member:edit | Target hierarchy |
| Entity operations | Resource permission | Workspace resolved from resource |

Role defaults: ADMIN toàn bộ; AREA_MANAGER, BRANCH_MANAGER, NVVP có tập permission khác nhau trong packages/shared/src/permissions.ts. Override member có precedence.

## 7. State Model

| Entity | Before | Event | After |
|---|---|---|---|
| Member | invited | accept link | active |
| Member | active | remove | removed |
| Member | active | pause/status flow | paused where supported |
| Invite link | active | deactivate | inactive |
| Permission override | absent | grant/revoke | granted/denied |
| Permission override | present | reset | absent/role default |

## 8. UI & User Interaction

| UI | Route/screen | Functions |
|---|---|---|
| ACC-UI-01 | /login, /signup | ACC-01 |
| ACC-UI-02 | /account, /settings/account | ACC-02 |
| ACC-UI-03 | /members | ACC-03.1, .2, .4, .5 |
| ACC-UI-04 | /invite/[code] | ACC-03.3 |
| ACC-UI-05 | /settings/permissions | ACC-04 |

Giao diện ẩn hoặc vô hiệu hóa thao tác khi người dùng không có quyền; hệ thống vẫn kiểm tra quyền khi nhận hành động.

## 9. Business Rules

| Rule ID | Rule | Applied functions | Confidence |
|---|---|---|---|
| BR-CANDIDATE-004 | Role permissions + member override, override precedence | ACC-04 | CONFIRMED |
| BR-CANDIDATE-006 | Role hierarchy controls target role/member management | ACC-03, ACC-04.2 | CONFIRMED |

## 10. Data, Integration and Dependencies

User → WorkspaceMember → Workspace; WorkspaceMember → WorkspaceRole → Permission. Integrations: Better Auth, email, Stripe seat update.

## 11. Open Questions / Current Limitations

OQ-002 reward approver mapping; OQ-009 exact plan/seat enforcement; email trigger/provider details PARTIALLY CONFIRMED.

## 12. Traceability

| Function | UI | API/service | Entity | Related CFD |
|---|---|---|---|---|
| ACC-01 | auth pages | Better Auth | User/Session/Account | — |
| ACC-02 | account/settings | user router | User | WSP |
| ACC-03 | members/invite | member router | Member/InviteLink | WSP/INT |
| ACC-04 | permissions/hooks | permission router/utils | Role/Override | WSP/TSK/COL |

## 13. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
