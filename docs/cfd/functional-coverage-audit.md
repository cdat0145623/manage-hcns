# Functional Coverage Audit

Status: Phase 2 baseline audit. Covered means the surface is mapped to a CFD function or explicitly marked N/A/Review.

## Router/API surface

| Source surface | Functional mapping | CFD | Status |
|---|---|---|---|
| auth endpoints | ACC-01 | ACC | Covered |
| workspace all/byId/bySlug/create/update/delete/search | WSP-01 | WSP | Covered |
| board all/allByUserId/byId/bySlug/create/update/delete/activities | WSP-02 | WSP | Covered |
| board template default/favorites | WSP-02.5 | WSP | Covered |
| list create/update/delete | WSP-03 | WSP | Covered |
| card create/byId/update/delete | TSK-01/02/03/06 | TSK | Covered |
| card add/remove label/member | TSK-04/05 | TSK | Covered |
| card comments | COL-01 | COL | Covered |
| card activities | COL-04.1 | COL | Covered |
| checklist CRUD/items | COL-02 | COL | Covered |
| attachment upload/confirm/update/delete/read | COL-03 | COL | Covered |
| member invite/delete/invite link/accept/updateRole | ACC-03 | ACC | Covered |
| user get/update/status/position | ACC-02 | ACC | Covered |
| permission reads/grants/revokes/resets/role permissions | ACC-04 | ACC | Covered |
| taskMaster create/update | OPS-01.1 | OPS | Covered |
| taskInstance all CRUD/virtual/comments/activity | OPS-01 | OPS/COL | Covered |
| dashboard protected/public | OPS-02 | OPS | Covered |
| reward reads/upsert/submit/withdraw/preview/approve/reject/revert/finalize | OPS-03/04/05 | OPS | Covered |
| reward public endpoints | INT-05.2 | INT/OPS | Covered |
| import Trello/GitHub | INT-01 | INT | Covered |
| integration providers/token/auth/disconnect | INT-02 | INT | Covered |
| webhook CRUD/test | INT-03 | INT | Covered |
| feedback.create | Application support feedback; no dedicated CFD capability | — | Review |
| health.health | Operational health endpoint, not functional user behavior | — | N/A |
| position CRUD | ACC-02.3 supporting data | ACC | Covered |
| cron router | Scheduler trigger/timing | OPS | Review: OQ-001 |

## Frontend route/page surface

| Source surface | Functional mapping | CFD | Status |
|---|---|---|---|
| login/signup/auth pages | ACC-01 | ACC | Covered |
| account/settings/account | ACC-02 | ACC | Covered |
| members/invite | ACC-03 | ACC | Covered |
| settings/permissions | ACC-04 | ACC | Covered |
| boards/templates | WSP-02, INT-01 | WSP/INT | Covered |
| workspace and board routes | WSP-01/02/03/04 | WSP | Covered |
| board drag/drop/filter/sidebar | WSP-03/04, TSK-03 | WSP/TSK | Covered |
| card detail/modal | TSK-01/02/04/05/06, COL, OPS reward | TSK/COL/OPS | Covered |
| calendar | OPS-01/02 | OPS | Covered |
| reports/dashboard | OPS-02/05 | OPS | Covered |
| settings integrations/webhooks/billing | INT-02/03/04 | INT | Covered |
| public board/card/API pages | INT-05 | INT/WSP/TSK/OPS | Covered |
| changelog/privacy/terms/oss/pricing | Product/legal/informational pages | — | N/A |

## Entity/schema surface

| Entity | Functional mapping | Status |
|---|---|---|
| User/session/account | ACC-01/02 | Covered |
| Workspace/member/role/permission/invite/slug | ACC/WSP | Covered |
| Board/list/favorite | WSP | Covered |
| Card/label/card-member/activity/comment | TSK/COL | Covered |
| Checklist/item/attachment/file activity | COL | Covered |
| Frequency/task master/instance | OPS | Covered |
| Reward config/deduction/snapshot/log/finalization | OPS | Covered |
| Import/integration/webhook/subscription | INT | Covered |
| Notification | COL/INT | Review: reader/trigger OQ-006 |
| Feedback | Application support surface | Review |

## Permission/validation/background/integration audit

| Surface | Mapping | Status |
|---|---|---|
| shared role defaults/hierarchy | ACC-04 and all protected CFD functions | Covered |
| assertPermission/assertCanEdit/assertCanDelete | ACC/WSP/TSK/COL | Covered |
| Zod inputs in routers | Function input/exception sections | Covered |
| optimistic board/card updates | TSK-03/WSP-03 | Covered |
| activity types/merge utility | COL-04 and mutation side effects | Covered |
| email mention/invite/reset | ACC/COL | Covered, individual provider triggers partially confirmed |
| S3 upload/download | COL-03 | Covered |
| Stripe checkout/subscription/seat | INT-04 | Covered |
| Trello/GitHub APIs | INT-01/02 | Covered |
| cron/scheduler | OPS-01/05 | Review OQ-001 |
| realtime/websocket | No source surface found | N/A based on repository scan |

## Audit conclusions

- Functional behavior important to Kanban core is mapped.
- Feedback and notification reader are not separate capabilities in the existing CFD set; notification reader remains Review under OQ-006, feedback is a low-scope support function.
- Scheduler production behavior and public/private boundary remain the highest-impact review surfaces.

