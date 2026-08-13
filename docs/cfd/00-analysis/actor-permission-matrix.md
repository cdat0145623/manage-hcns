# Ma trận actor và permission

## Role hiện có

| Role | Hierarchy | Permission mặc định |
|---|---:|---|
| ADMIN | 100 | Toàn bộ permission |
| AREA_MANAGER | 80 | Workspace view; board view/create/edit; list view/create/edit/delete; card view/create/edit/delete/attach/tick; comment đầy đủ; member view/invite |
| BRANCH_MANAGER | 60 | Workspace/board/list view; board create; list create/edit; card view/create/edit/attach/tick; comment view/create/edit; member view |
| NVVP | 40 | Workspace/board/list/card/comment view; card create/attach/tick; comment create; member view |

Permission hiệu lực lấy từ role trong DB hoặc default code, rồi áp dụng override member; override có precedence.

## Functional matrix

| Function | ADMIN | AREA_MANAGER | BRANCH_MANAGER | NVVP | Evidence |
|---|---|---|---|---|---|
| Xem workspace/board/list/card | Có | Có | Có | Có | *:view; public có nhánh anonymous |
| Tạo board | Có | Có | Có | Không theo default | board:create |
| Sửa board | Có | Có | Không theo default | Không | board:edit |
| Xóa board | Có | Không theo default | Không | Không | board:delete; creator exception cần đối chiếu |
| Tạo/sửa list | Có | Có | Có | Không | list:create/edit |
| Xóa list | Có | Có | Không | Không | list:delete; creator exception |
| Tạo card | Có | Có | Có | Có | card:create |
| Sửa/move/status card | Có | Có | Có | Không | card:edit; creator exception |
| Xóa card | Có | Có | Không | Không | card:delete; creator exception |
| Attach/tick checklist | Có | Có | Có | Có | card:attach, card:tick |
| Comment | Có | Có | Có | Có | comment permissions |
| Mời member | Có | Có | Không | Không | member:invite, hierarchy |
| Sửa role/xóa member | Theo hierarchy | Theo hierarchy | Hạn chế | Không | assertCanAssignRole/ManageMember |
| Reward approve/finalize | Có guard | ? | ? | ? | reward router; cần xác nhận mapping |

## Điều kiện chung

1. User chưa authenticated nhận UNAUTHORIZED.
2. Resource không tồn tại nhận NOT_FOUND; permission không đủ nhận FORBIDDEN.
3. Permission kiểm tra theo workspace của resource.
4. Một số edit/delete cho phép creator qua assertCanEdit/assertCanDelete.
5. Quản trị member áp dụng role hierarchy.

Evidence: packages/shared/src/permissions.ts, packages/api/src/utils/permissions.ts và các router board/list/card/member/permission.
