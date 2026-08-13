# CFD-OPS — Recurring Task & Reward

## 1. Document Information

| Field | Value |
|---|---|
| Document ID | CFD-OPS |
| Application | Kan |
| Module | Recurring Task, Calendar & Reward |
| Version | Baseline v1.0 |
| Status | Current |
| Generated From | Existing System |
| Evidence | Source Code |
| Requirement Reference | Existing System Baseline |

## 2. Functional Overview

Module quản lý task định kỳ và task instance, calendar/dashboard/report, reward configuration, approval, violation evaluation và finalization. Reward có thể gắn với card, task master hoặc task instance.

Actors là authenticated user, target assignee, người submit và approver theo guard implementation. Mapping chính xác giữa role business và approver là OQ-002.

## 3. Functional Model

OPS-01 Recurring tasks: master, frequency, instances, virtual instances.

OPS-02 Calendar and reports: date views, dashboard metrics, pending approvals, breach list.

OPS-03 Reward configuration: source lookup, upsert, deductions.

OPS-04 Reward workflow: submit, withdraw, approve, reject, revert.

OPS-05 Violation/finalization: preview, logs, final amount, completed.

## 4. Current Functional Flow

Một nhiệm vụ định kỳ mô tả nhịp lặp và người thực hiện; từng lần thực hiện có ngày mục tiêu và trạng thái riêng. Người dùng có thể theo dõi trên lịch, cấu hình khoản thưởng ở trạng thái nháp, gửi duyệt, chờ phê duyệt, xử lý thay đổi sau duyệt và tất toán. Báo cáo đọc các dữ liệu này; thời điểm hệ thống tự sinh lần thực hiện trong production chưa được chứng minh.

## 5. Functional Behavior

### OPS-01.1 — Create/update task master and frequency

**Entry:** lịch và biểu mẫu tạo nhiệm vụ. **Actor:** người dùng đã đăng nhập theo quyền hiện tại.

**Input:** tên, mô tả, nhịp lặp, ngày bắt đầu/kết thúc và người thực hiện.

**Validation:** required dates/target and valid recurrence input; target/user must resolve.

**Behavior:** hệ thống lưu nhịp lặp và nhiệm vụ mẫu, gắn người thực hiện, sau đó lịch được cập nhật.

**Data:** tạo/cập nhật nhịp lặp và nhiệm vụ mẫu; xóa dùng trạng thái lưu trữ theo behavior hiện tại.

**Exceptions:** invalid date range, user/frequency missing, duplicate/DB error.

**Evidence:** taskMaster.ts → create/update, tasks.ts schema, CreateEventModal.tsx.

### OPS-01.2 — Create/read/update/delete task instance

**Entry:** calendar event/detail and recurrence hook.

**Input:** lần thực hiện, nhiệm vụ mẫu, người thực hiện, ngày mục tiêu, tên/mô tả, trạng thái pending/done/missed và ngày thực tế/kết thúc.

**Behavior:** tạo một lần thực hiện thuộc nhiệm vụ mẫu, đọc và sửa nội dung/trạng thái, hoặc xóa theo trạng thái hiện tại. Bình luận, tệp và lịch sử dùng các chức năng cộng tác. Cùng một người không thể có hai lần thực hiện của cùng nhiệm vụ mẫu trong cùng ngày mục tiêu.

**Exceptions:** invalid UUID, master/user missing, duplicate target date, status/date validation, unauthorized target.

**Rules:** BR-CANDIDATE-001 and 016.

**Evidence:** taskInstance.ts → byId/create/update/delete, tasks.ts, Calendar.tsx, EventDetailModal.tsx.

### OPS-01.3 — Read virtual recurring tasks

**Entry:** lịch; input là nhiệm vụ mẫu và khoảng ngày.

**Behavior:** hệ thống tính các lần xuất hiện theo nhịp lặp và khoảng ngày; lịch có thể hiển thị sự kiện chưa có bản ghi chính thức. Khi người dùng sửa một sự kiện, implementation có thể tạo bản ghi tương ứng.

**Confidence:** behavior of virtual calculation is CONFIRMED at API/UI boundary; scheduler persistence is OQ-001.

**Evidence:** taskInstance.ts → getVirtual, useRecurrence.ts, calendar components.

### OPS-02.1 — Calendar views and date interaction

**Actor:** authenticated user. **Input:** month/week/day/date filters, user scope.

**Behavior:** lịch đọc công việc và nhiệm vụ theo ngày, hiển thị theo tháng/tuần/ngày, mở chi tiết, tạo sự kiện và sửa/xóa lần thực hiện. Ngày bắt đầu tuần lấy từ thiết lập workspace.

**Evidence:** calendar.tsx, Calendar.tsx, MonthView/WeekView/DayView, workspace settings.

### OPS-02.2 — Dashboard/report metrics

**Actor:** người dùng đã đăng nhập; một số báo cáo có luồng công khai riêng.

**Input:** workspace, khoảng ngày, người dùng và bộ lọc bảng.

**Behavior:** hệ thống tổng hợp chỉ số công việc, nhiệm vụ và thưởng; báo cáo kết hợp chỉ số, người dùng, bảng, nhiệm vụ hiển thị tạm thời và hồ sơ chờ duyệt; giao diện hiển thị báo cáo và vi phạm.

**Evidence:** dashboard.ts → get, dashboardPublic.ts, ReportsView.tsx, Dashboard.tsx.

### OPS-03.1 — Read reward config by source

**Entry:** bảng thông tin thưởng trong công việc hoặc task detail.

**Input:** công việc hoặc nhiệm vụ làm đối tượng nguồn.

**Behavior:** hệ thống xác định đối tượng nguồn và trả cấu hình, các khoản khấu trừ, bản chụp đã duyệt, nhật ký và kết quả tất toán. Nếu chưa có cấu hình, giao diện hiển thị trạng thái chưa thiết lập.

**Evidence:** reward.ts → getByCardId/getByTaskInstanceId/getByTaskMasterId, CardRewardConfigForm.tsx.

### OPS-03.2 — Upsert reward config/deductions

**Permission:** quyền trên đối tượng nguồn và người dùng theo implementation; vai trò phê duyệt cụ thể là PARTIALLY CONFIRMED.

**Input:** loại thưởng project/responsibility, số tiền/loại tiền, đúng một đối tượng nguồn trong công việc hoặc nhiệm vụ, và các khoản khấu trừ theo phần trăm hoặc VND.

**Validation:** project reward amount requirement, deduction values/ranges, source XOR DB constraint.

**Behavior:** hệ thống tạo/cập nhật cấu hình và các khoản khấu trừ; giữ trạng thái phê duyệt theo nhánh hiện tại; ghi lịch sử khi có hỗ trợ; giao diện hiển thị bản nháp đã lưu.

**Rule:** BR-CANDIDATE-010.

**Evidence:** reward.ts → upsert, rewards.ts schema, CardRewardConfigForm.tsx, reward validation copy.

### OPS-04.1 — Submit reward for approval

**Actor:** người tạo cấu hình hoặc người thực hiện theo điều kiện hiện tại.

**Preconditions:** source exists; implementation/UI checks start/end dates, assigned member and usable reward proposal/config.

**Input:** đối tượng nguồn và cấu hình thưởng.

**Behavior:** hệ thống kiểm tra điều kiện; ghi nhận đề xuất; chuyển từ nháp sang chờ phê duyệt; giao diện xác nhận đã gửi.

**Exceptions:** missing dates, no assignee, no amount/config, incompatible current status.

**Evidence:** reward.ts → submit, CardRewardConfigForm.tsx, reward UI messages.

### OPS-04.2 — Withdraw submitted reward

**Actor:** submitter/authorized user.

**Behavior:** chỉ cho rút lại ở trạng thái phù hợp; đề xuất trở về trạng thái có thể chỉnh sửa theo nhánh hiện tại; giao diện xác nhận đã rút.

**Evidence:** reward.ts → withdraw, reward form.

### OPS-04.3 — Approve reward

**Actor:** người phê duyệt đã vượt qua điều kiện quyền.

**Input:** source/config ID.

**Behavior:** kiểm tra đề xuất đang chờ; chuyển sang đã duyệt; lưu người/thời điểm duyệt và một bản chụp bất biến của tiêu đề, ngày, người thực hiện, loại thưởng, số tiền và khấu trừ; giao diện hiển thị bản đã duyệt.

**Side effects:** future changes can produce violation logs; card activity may record reward config/approval.

**Evidence:** reward.ts → approve, rewards.ts snapshot schema, CardRewardAdminReview.tsx.

### OPS-04.4 — Reject reward

**Actor:** người phê duyệt. **Input:** lý do từ chối.

**Behavior:** kiểm tra lý do, chuyển sang bị từ chối và lưu lý do; giao diện hiển thị trạng thái cùng nguyên nhân.

**Exceptions:** missing reason, wrong state, unauthorized.

**Evidence:** reward.ts → reject, CardRewardConfigForm.tsx, reward copy.

### OPS-04.5 — Revert reward

**Actor:** authorized reviewer/owner.

**Behavior:** đưa cấu hình bị từ chối hoặc trạng thái được implementation hỗ trợ trở về bản nháp có thể chỉnh sửa; bản chụp/lý do được xử lý theo behavior hiện tại.

**Evidence:** reward.ts → revert, reward UI. Exact permitted source states should be verified if operationally important.

### OPS-05.1 — Preview reward violations

**Actor:** reviewer/admin panel.

**Input:** config/source ID and current data.

**Behavior:** so sánh dữ liệu hiện tại với bản đã duyệt; nhận diện thay đổi deadline, ngày bắt đầu, người thực hiện, cấu hình, khấu trừ, tất toán và hoàn thành sau deadline; trả bản xem trước.

**Evidence:** reward.ts → previewViolations, rewardViolation.ts, CardRewardAdminReview.tsx.

### OPS-05.2 — Evaluate/log violations

**Trigger:** thay đổi công việc/nhiệm vụ sau khi duyệt hoặc trong luồng đánh giá. **Behavior:** cấu hình có thể chuyển sang chờ đánh giá và hệ thống tạo nhật ký vi phạm với giá trị trước/sau, loại vi phạm và trạng thái bỏ qua.

**Evidence:** rewardViolation.ts, reward.ts, rewards.ts logs schema, reports breach components.

### OPS-05.3 — Finalize reward

**Actor:** người phê duyệt/đánh giá được phép; mapping vai trò là OQ-002.

**Input:** completionPercent, suggestedAmount, finalAmount, finalNote.

**Validation:** config/source status compatible; numeric values and finalization eligibility.

**Behavior:** tạo kết quả tất toán duy nhất, chuyển thưởng sang hoàn tất, lưu tỷ lệ hoàn thành, số tiền cuối, ghi chú, người và thời điểm; giao diện hiển thị kết quả đã tất toán.

**Evidence:** reward.ts → finalize, rewards.ts finalization schema, CardRewardFinalize.tsx.

## 6. Permission Model

Các thao tác thưởng đều yêu cầu đăng nhập và kiểm tra đối tượng nguồn/quyền. Vì chưa đủ bằng chứng để gắn một vai trò business cụ thể cho người phê duyệt, CFD giữ kết luận ở mức “người được phép” và dẫn tới OQ-002.

## 7. State Model

| Entity | Before | Event | After |
|---|---|---|---|
| TaskInstance | pending | complete | done |
| TaskInstance | pending | miss | missed |
| RewardConfig | draft | submit | waiting_approval |
| RewardConfig | waiting_approval | approve | approved |
| RewardConfig | waiting_approval | reject | rejected |
| RewardConfig | rejected | revert | draft |
| RewardConfig | approved | data evaluation | waiting_evaluation |
| RewardConfig | waiting_evaluation | finalize | completed |

## 8. UI & User Interaction

| UI | Main functions |
|---|---|
| Calendar and event modals | OPS-01, OPS-02 |
| CardRewardConfigForm | OPS-03, OPS-04 |
| CardRewardAdminReview | OPS-04.3, OPS-05.1 |
| CardRewardFinalize | OPS-05.3 |
| ReportsView/breach modal | OPS-02.2, OPS-05 |

## 9. Rules, Data, Integration

Rules 001, 010, 011, 016; reward snapshot is assignee user ID, not workspace member public ID. Data graph: Frequency → TaskMaster → TaskInstance; source → RewardConfig → Snapshot/Logs/Finalization. No external service required for core workflow.

## 10. Open Questions / Limitations

OQ-001 scheduler trigger/production; OQ-002 approver role mapping; OQ-009 plan restrictions. Virtual recurring tasks and reward flow are code-confirmed at API/UI level, but scheduler timing is not.

## 11. Traceability

| Function | UI | API/service | Entity | Related CFD |
|---|---|---|---|---|
| OPS-01 | calendar | taskMaster/taskInstance | Frequency/Task* | TSK/COL |
| OPS-02 | calendar/reports | dashboard/public routers | Metrics | WSP/INT |
| OPS-03 | reward forms | reward get/upsert | RewardConfig/Deduction | TSK |
| OPS-04 | reward forms/review | reward submit/approve/reject | RewardConfig/Snapshot | ACC/TSK |
| OPS-05 | reports/review/finalize | preview/violation/finalize | Logs/Finalization | TSK/COL |

## 12. Change History

| Version | Date | Change | Source |
|---|---|---|---|
| Baseline v1.0 | 2026-08-11 | Phase 2 expansion | Existing System |
