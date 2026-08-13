# Bản đồ repository — Current Functional Documentation

## Phạm vi và bằng chứng

Tài liệu này được reverse-engineer từ source, schema/migration, route, component, router, repository, test và cấu hình trong repository. Đây là bản đồ phục vụ CFD; không phải tài liệu kiến trúc triển khai.

## Cấu trúc hệ thống

| Khu vực | Vai trò functional quan sát được | Bằng chứng chính |
|---|---|---|
| apps/web | Giao diện Next.js, page route, card/board/workspace/settings/calendar/reports/public views | apps/web/src/pages, apps/web/src/views |
| packages/api | tRPC router, validation Zod, authorization, OpenAPI metadata, integration/public procedures | packages/api/src/routers, src/utils |
| packages/db | PostgreSQL/Drizzle schema và repository cho business entity | packages/db/src/schema, src/repository, migrations |
| packages/auth | Better Auth, username/password, session, email verification/password flows | packages/auth/src |
| packages/shared | Permission/role, due-date/recurrence, mention, S3 và utility dùng chung | packages/shared/src |
| packages/email | Email magic-link, reset password, mention, workspace invite | packages/email/src |
| packages/stripe | Tạo client và thao tác subscription/seat billing | packages/stripe/src |
| apps/docs | Tài liệu sản phẩm/self-host/import Trello/API | apps/docs |

## Entry points và routing

- Page route chính: /, /login, /signup, /account, /boards, /boards/[...boardId], /{workspaceSlug}, /{workspaceSlug}/{...boardSlug}, /cards/[cardId], /calendar, /reports, /members, /positions, /templates.
- Settings route: /settings/account, /settings/workspace, /settings/permissions, /settings/integrations, /settings/webhooks, /settings/api, /settings/billing, và Trello authorize.
- Public route/API: public boards/cards/reward/dashboard/user/workspace; public board có thể xem mà không qua protected tRPC.
- Backend gateway: /api/trpc/[trpc], /api/v1/[...trpc], OpenAPI JSON; Better Auth tại /api/auth/[...all].
- File/Stripe/Trello endpoints: upload/download attachment/avatar, Stripe checkout/billing/webhook, Trello authenticate, unsubscribe.

## Functional data model

Business graph hiện tại là Workspace → Board → List → Card. Card có title/description, index, status (pending, done, missed), assignee target, member relation, label, due/start date, comment, checklist, attachment, activity và reward configuration. Board có visibility (private/public), type (regular/template), archive và favorite.

Workspace có members, role/permission overrides, invite link, plan/subscription, webhook và settings. Task định kỳ tách thành TaskMaster → TaskInstance, có frequency/rrule và cùng dùng status enum. Reward gắn độc quyền với card hoặc task master/instance và có approval, snapshot, violation log, finalization.

## Authentication, authorization và data scope

- Procedure được phân thành publicProcedure và protectedProcedure tại packages/api/src/trpc.ts.
- Permission hiệu lực là permission mặc định theo role trong code hoặc role cấu hình trong DB, sau đó áp dụng override từng member.
- Role hiện có: ADMIN, AREA_MANAGER, BRANCH_MANAGER, NVVP; hierarchy lần lượt 100/80/60/40.
- Các operation workspace-scoped thường lấy workspace từ public ID của board/list/card/member rồi gọi assertPermission, assertCanEdit, assertCanDelete hoặc kiểm tra hierarchy.
- Các entity user-facing có publicId; internal numeric/UUID ID vẫn được dùng ở persistence và một số payload nội bộ.

## Tích hợp và side effect

- Better Auth + email provider; email mention/invite/reset.
- S3-compatible storage cho attachment/avatar và presigned upload/download.
- Stripe cho checkout, subscription seats và webhook billing.
- Trello import; GitHub OAuth/token integration.
- Workspace webhook nhận sự kiện card created/updated/moved/deleted và có test delivery.
- Redis được package DB khai báo; không thấy bằng chứng trong lần khảo sát này về websocket/realtime channel.

## Background/automation

cron router tồn tại và task/reward có mô hình frequency, task instance và violation evaluation. Việc chạy scheduler, tần suất và trigger production không được chứng minh đầy đủ chỉ từ các route đã đọc; được đưa vào Open Questions.
