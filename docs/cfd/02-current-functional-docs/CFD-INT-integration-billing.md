# CFD-INT — Integration, Import & Billing

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-INT |
| Application | Kan |
| Module | Integration, Import & Billing |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

Module nhập dữ liệu từ Trello/GitHub, quản lý provider connection, workspace webhook, API key, Stripe billing và public access. Không bao gồm core board/card behavior.

### Actors

Authenticated user; workspace member có workspace manage; workspace billing administrator; anonymous public consumer; external provider/webhook/Stripe.

## 3. Functional Model

INT-01 Import
├── INT-01.1 Trello authorization/boards/import
└── INT-01.2 GitHub projects/import

INT-02 Provider integration
├── INT-02.1 Save/disconnect GitHub
├── INT-02.2 Read providers/status
└── INT-02.3 Trello authorization URL/disconnect

INT-03 Webhook
├── INT-03.1 List
├── INT-03.2 Create/update
├── INT-03.3 Delete
└── INT-03.4 Test/deliver

INT-04 Billing
├── INT-04.1 Checkout
├── INT-04.2 Billing session
└── INT-04.3 Stripe webhook/seat sync

INT-05 Public access/API
├── INT-05.1 Public board/card
└── INT-05.2 Public dashboard/reward/workspace

## 4. Current Functional Flow

Người dùng kết nối công cụ bên ngoài hoặc cấp quyền truy cập, chọn dự án/bảng cần nhập và nhận bảng mới cùng trạng thái nhập. Các thay đổi công việc có thể gửi sự kiện tới địa chỉ webhook của workspace. Thanh toán được khởi tạo và cập nhật theo sự kiện từ nhà cung cấp. Một số dữ liệu được cung cấp qua các liên kết công khai.

## 5. Functional Behavior

### INT-01.1 — Trello authorization and board import

**Entry:** Boards import form/settings Trello authorize. **Actor:** authenticated user.

**Input:** quyền truy cập Trello và các bảng được chọn.

**Behavior:** hệ thống xác thực kết nối, đọc các bảng đã chọn, ghi nhận phiên nhập đang bắt đầu, chuyển bảng/cột/công việc/nhãn sang dữ liệu Kan và kết thúc ở trạng thái thành công hoặc thất bại; giao diện hiển thị kết quả.

**Exceptions:** OAuth failure, provider API failure, malformed data, partial/import transaction failure.

**Data:** Import, Board, List, Card, Label with source/import relationship.

**Evidence:** packages/api/src/routers/import.ts → trello router, apps/web/src/pages/api/trello/authenticate.ts, ImportBoardsForm.tsx, imports.ts, docs/imports/trello.mdx.

### INT-01.2 — GitHub project import

**Entry:** ImportBoardsForm. **Actor:** authenticated user with GitHub connection/token.

**Input:** các dự án/kho lưu trữ GitHub được chọn.

**Behavior:** đọc dự án, ghi nhận phiên nhập, chuyển dữ liệu dự án thành bảng/cột/công việc, cập nhật trạng thái thành công/thất bại và làm mới danh sách bảng.

**Exceptions:** no token/connection, GitHub API error, invalid project, import status failed.

**Evidence:** import.ts → github router, integration.ts, ImportBoardsForm.tsx, imports.ts.

### INT-02.1 — Save/disconnect GitHub

**Actor/entry:** authenticated user in IntegrationsSettings.

**Input:** GitHub token for save; no input for disconnect.

**Behavior:** lưu thông tin kết nối được bảo vệ hoặc xóa kết nối; trạng thái kết nối được phản ánh trên màn hình tích hợp và nguồn nhập khả dụng thay đổi theo đó.

**Exceptions:** empty/invalid token, encryption/storage failure.

**Evidence:** integration.ts → saveGitHubToken/disconnectGitHub/getGitHubStatus, utils/encryption.ts, IntegrationsSettings.tsx, integrations.ts.

### INT-02.2 — Read provider list/status

**Actor:** authenticated user.

**Input:** none.

**Behavior:** trả danh sách công cụ được hỗ trợ và trạng thái kết nối hiện tại; giao diện hiển thị hành động kết nối/ngắt kết nối phù hợp.

**Evidence:** integration.ts → providers/getGitHubStatus, IntegrationsSettings.tsx.

### INT-02.3 — Trello authorization URL/disconnect

**Actor:** authenticated user.

**Input:** công cụ Trello; hệ thống trả liên kết cấp quyền hoặc xóa kết nối đã lưu.

**Evidence:** integration.ts → getAuthorizationUrl/disconnect, Trello authorize page.

### INT-03.1 — List workspace webhooks

**Permission:** workspace:manage; workspace public ID.

**Behavior:** xác định workspace, kiểm tra quyền quản lý và trả các webhook đã cấu hình để người dùng xem.

**Evidence:** webhook.ts → list, WebhookList.tsx, webhook repo/schema.

### INT-03.2 — Create/update webhook

**Permission:** workspace:manage.

**Input:** workspace, tên, URL, secret tùy chọn và các sự kiện muốn nhận.

**Validation:** URL schema; events array min 1; webhook name max per UI/router.

**Behavior:** tạo hoặc cập nhật webhook của workspace; khi cập nhật mà không nhập secret mới, secret cũ được giữ theo implementation; danh sách được làm mới.

**Exceptions:** invalid URL/name, empty events, webhook not in workspace, permission denied.

**Rule:** BR-CANDIDATE-013.

**Evidence:** webhook.ts → create/update, utils/webhook.ts, NewWebhookModal.tsx.

### INT-03.3 — Delete webhook

**Permission:** workspace:manage.

**Behavior:** xác định webhook thuộc workspace và xóa cấu hình; sau xác nhận, webhook biến mất khỏi danh sách.

**Evidence:** webhook.ts → delete, webhook.repo.ts → hardDelete, DeleteWebhookConfirmation.tsx.

### INT-03.4 — Test and deliver webhook

**Actor:** workspace manager for test; system for card event delivery.

**Input:** webhook ID; card event payload for system dispatch.

**Behavior:** thao tác kiểm tra gửi một payload thử tới URL. Khi các sự kiện công việc được tạo, cập nhật, di chuyển hoặc xóa, hệ thống chuyển thành payload và gửi không đồng bộ; secret tùy chọn được dùng để ký. Gửi thất bại được ghi nhận nhưng không chặn thay đổi công việc.

**Evidence:** webhook.ts → test, utils/webhook.ts → sendWebhooksForWorkspace, card.ts webhook calls, webhook tests.

### INT-04.1 — Create checkout session

**Actor/entry:** billing/pricing authenticated workspace user.

**Input:** workspace và lựa chọn gói/giá.

**Behavior:** kiểm tra người dùng và workspace, tạo phiên thanh toán, trả địa chỉ tiếp tục; giao diện điều hướng hoặc hiển thị lỗi.

**Exceptions:** Stripe key/config absent, invalid price/workspace, Stripe API error.

**Evidence:** apps/web/src/pages/api/stripe/create_checkout_session.ts, Pricing/BillingSettings views, packages/stripe/src/index.ts.

### INT-04.2 — Create billing session

**Actor:** workspace billing user.

**Input:** workspace và gói đăng ký hiện tại.

**Behavior:** tạo hoặc lấy phiên quản lý thanh toán và trả thông tin để người dùng tiếp tục.

**Evidence:** apps/web/src/pages/api/stripe/create_billing_session.ts, BillingSettings.tsx.

### INT-04.3 — Stripe webhook and seat synchronization

**Trigger:** Stripe sends webhook; member invite/remove changes seat count.

**Behavior:** xác thực sự kiện thanh toán, cập nhật trạng thái gói trong hệ thống; khi số thành viên thay đổi, số chỗ của gói có giới hạn được đồng bộ.

**Exceptions:** invalid signature/event, unknown subscription, Stripe unavailable; local and external state discrepancy requires operational verification.

**Evidence:** apps/web/src/pages/api/stripe/webhook.ts, member.ts seat update branches, subscription schema, stripe/index.ts.

### INT-05.1 — Public board/card

**Actor/entry:** anonymous public board pages/API.

**Input:** workspace slug, board slug/public ID, card public ID.

**Behavior:** hệ thống trả bảng/công việc và phần hoạt động được phép công khai theo điều kiện hiển thị; dữ liệu riêng tư hoặc không tồn tại không được hiển thị.

**Confidence:** PARTIALLY CONFIRMED across all endpoints; OQ-004.

**Evidence:** boardPublic.ts, board.ts → bySlug, card.ts → public byId/getActivities, public board views/API.

### INT-05.2 — Public dashboard/reward/workspace

**Actor:** anonymous public consumer.

**Input:** workspace/date/month/card identifiers.

**Behavior:** các trang và liên kết công khai có thể trả dashboard, thống kê thưởng theo tháng/hoàn tất, công việc, workspace và người dùng ở dạng được phép công khai.

**Evidence:** dashboardPublic.ts, rewardPublic.ts, workspacePublic.ts, userPublic.ts, public API pages.

## 6. Permission Model

| Function | Permission/scope |
|---|---|
| Import/provider connection | Authenticated user and provider credential |
| Webhook CRUD/test | workspace:manage |
| Billing | Authenticated workspace billing scope; exact role/plan gate OQ-009 |
| Public access | public procedure/visibility rules, boundary OQ-004 |

## 7. State/Data Model

| Entity | Before | Event | After |
|---|---|---|---|
| Import | started | import success | success |
| Import | started | provider/error | failed |
| Integration | disconnected | connect/token save | connected |
| Integration | connected | disconnect | disconnected |
| Webhook | active/configured | delete | removed |
| Subscription | provider event | webhook processing | local status updated |

## 8. UI & User Interaction

| UI | Main functions |
|---|---|
| ImportBoardsForm | INT-01, provider status |
| IntegrationsSettings/Trello authorize | INT-02 |
| WebhookSettings/WebhookList | INT-03 |
| Pricing/BillingSettings | INT-04 |
| Public boards/board/card/API pages | INT-05 |

## 9. Business Rules, Integration and Dependencies

BR-CANDIDATE-013 applies to webhooks; BR-CANDIDATE-014/015 are partially confirmed public/slug rules. External systems: Trello, GitHub, Stripe, S3/webhook consumers. Dependencies: ACC membership/auth, WSP workspace/board, TSK card events.

## 10. Open Questions / Limitations

OQ-004 public/private boundary; OQ-007 GitHub synchronization semantics; OQ-009 plan/seat enforcement. Import is provider-dependent and may fail; webhook delivery is non-blocking.

## 11. Traceability

| Function | UI | API/service | Entity | Related CFD |
|---|---|---|---|---|
| INT-01 | ImportBoardsForm | import/integration routers | Import/Board/List/Card | WSP/TSK |
| INT-02 | IntegrationsSettings | integration router/routes | Integration | ACC |
| INT-03 | Webhook settings | webhook router/utils | WorkspaceWebhook | WSP/TSK |
| INT-04 | pricing/billing | Stripe API/package | Subscription | ACC |
| INT-05 | public pages/API | public routers | Public projections | WSP/TSK/OPS |

## 12. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
