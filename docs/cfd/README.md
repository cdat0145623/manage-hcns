# Current Functional Documentation — Kan

Đây là bộ tài liệu mô tả functional behavior hiện tại của ứng dụng Kan, reverse-engineer từ repository. Wording phản ánh implementation hiện tại; không phải BRD, user guide hay kế hoạch phát triển.

## Chỉ mục

1. [Application overview](01-overview/application-functional-overview.md)
2. Phân tích: repository-map, functional-inventory, actor-permission-matrix, workflow-analysis, business-rule-candidates, proposed-cfd-structure, open-questions trong 00-analysis/.
3. CFD:
   - [CFD-ACC — Account & Access](02-current-functional-docs/CFD-ACC-account-access.md)
   - [CFD-WSP — Workspace & Board](02-current-functional-docs/CFD-WSP-workspace-board.md)
   - [CFD-TSK — Card & Workflow](02-current-functional-docs/CFD-TSK-card-workflow.md)
   - [CFD-COL — Collaboration & Records](02-current-functional-docs/CFD-COL-collaboration-records.md)
   - [CFD-OPS — Recurring Task & Reward](02-current-functional-docs/CFD-OPS-task-reward.md)
   - [CFD-INT — Integration & Billing](02-current-functional-docs/CFD-INT-integration-billing.md)
4. [Cross-module functional flows](cross-module-functional-flows.md)
5. [Functional coverage audit](functional-coverage-audit.md)

Confidence: CONFIRMED = implementation rõ; PARTIALLY CONFIRMED = có code nhưng boundary chưa đầy đủ; UNCLEAR = cần xác minh.
