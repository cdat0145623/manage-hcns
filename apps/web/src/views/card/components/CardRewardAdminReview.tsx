import { t } from "@lingui/macro";
import { differenceInDays } from "date-fns";
import { motion } from "framer-motion";
import React from "react";
import {
  HiArrowPath,
  HiCheck,
  HiChevronDown,
  HiExclamationCircle,
  HiXMark,
} from "react-icons/hi2";

import { REWARD_DEDUCTION_REASON } from "@kan/shared/constants";

import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  formatRewardDayMonth,
  formatRewardDayMonthYear,
} from "~/utils/rewardDates";
import { RewardStatus } from "./CardRewardSummaryCard";

/** Màn duyệt chỉ xử lý khấu trừ loại dời deadline (mức đề xuất do NV cấu hình). */
function deadlineMoveRows(
  all: Array<{
    id: number;
    reason: string;
    unitType: string;
    value: string;
    displayOrder: number;
  }>,
) {
  return all.filter((d) => d.reason === REWARD_DEDUCTION_REASON.MOVE);
}

interface CardSnapshot {
  snappedCardTitle: string;
  snappedStartDate: string | Date | null;
  snappedDueDate: string | Date | null;
  snappedTargetUser: string | null;
  snappedRewardType: string;
  snappedBonusAmount: string | number | null;
  snappedCurrency: string;
  snappedDeductions: any[];
}

interface CardRewardAdminReviewProps {
  data: {
    id: number;
    rewardType: "project" | "responsibility";
    bonusAmount: string | number | null;
    currency: string;
    approvalStatus: RewardStatus;
    deductions?: {
      id?: number;
      reason: string;
      value: string | number;
      unitType: string;
    }[];
    snapshot?: CardSnapshot | null;
  };
  card: {
    cardTitle: string;
    startDate?: Date | null;
    dueDate?: Date | null;
    targetUser?: {
      name: string;
      email: string;
      avatarUrl?: string | null;
    } | null;
  };
  onApprove: (logDecisions: any[]) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRevert?: () => Promise<void>;
  /** Tên người nhận tại thời điểm snapshot (lookup từ snappedTargetUser). */
  snapshotAssigneeName?: string;
}

export const CardRewardAdminReview = ({
  data,
  card,
  onApprove,
  onReject,
  onRevert,
  snapshotAssigneeName,
}: CardRewardAdminReviewProps) => {
  const { showPopup } = usePopup();
  const [comment, setComment] = React.useState("");
  const [commentError, setCommentError] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Fetch real violations from server
  const { data: preview, isLoading: isLoadingPreview } =
    api.reward.previewViolations.useQuery(
      { configId: data.id },
      { enabled: !!data.id },
    );

  const [deadlineDecision, setDeadlineDecision] = React.useState<{
    deductionId: number | null;
    isSkipped: boolean;
  }>({ deductionId: null, isSkipped: true });

  React.useEffect(() => {
    if (!preview?.violations?.length || !preview.availableDeductions) return;
    const hasDeadlineViolation = preview.violations.some(
      (v) => v.violationType === "deadline_extended",
    );
    if (!hasDeadlineViolation) return;
    const move = deadlineMoveRows(preview.availableDeductions);
    const row = move[0];
    setDeadlineDecision({
      deductionId: row?.id ?? null,
      isSkipped: move.length === 0,
    });
  }, [preview]);

  const handleApproveAction = async () => {
    if (
      preview?.violations?.some(
        (v) => v.violationType === "deadline_extended",
      ) &&
      !deadlineDecision.isSkipped &&
      !deadlineDecision.deductionId
    ) {
      showPopup({
        header: t`Thiếu cấu hình`,
        message: t`Không có mức khấu trừ dời deadline trong đề xuất — hãy bỏ qua hoặc yêu cầu nhân viên cập nhật.`,
        icon: "error",
      });
      return;
    }
    setIsSubmitting(true);
    try {
      const logDecisions =
        preview?.violations?.map((v) => ({
          violationType: v.violationType,
          isSkipped: deadlineDecision.isSkipped,
          deductionId: deadlineDecision.isSkipped
            ? null
            : deadlineDecision.deductionId,
        })) ?? [];

      await onApprove(logDecisions);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRejectAction = async () => {
    if (!comment.trim()) {
      setCommentError(true);
      setTimeout(() => setCommentError(false), 500);
      return;
    }
    setIsSubmitting(true);
    try {
      await onReject(comment);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (val: string | number | null) => {
    if (val === null || val === undefined) return "0";
    return Number(val).toLocaleString("vi-VN");
  };

  const snapshotDeductionRows = React.useMemo(() => {
    const raw = data.snapshot?.snappedDeductions;
    if (!raw) return [];
    return Array.isArray(raw) ? raw : [];
  }, [data.snapshot?.snappedDeductions]);

  const draftDeductionsMatchSnapshot = React.useMemo(() => {
    type Row = { reason: string; unitType: string; value: string | number };
    const norm = (r: Row) => ({
      reason: String(r.reason).trim(),
      unitType: String(r.unitType).toLowerCase(),
      value: Number(r.value),
    });
    const snap = snapshotDeductionRows as Row[];
    const draft = (data.deductions ?? []) as Row[];
    if (snap.length === 0 || draft.length === 0) return false;
    if (snap.length !== draft.length) return false;
    const a = [...snap]
      .map(norm)
      .sort((x, y) => x.reason.localeCompare(y.reason));
    const b = [...draft]
      .map(norm)
      .sort((x, y) => x.reason.localeCompare(y.reason));
    return a.every((row, i) => {
      const br = b[i];
      return (
        br != null &&
        row.reason === br.reason &&
        row.unitType === br.unitType &&
        row.value === br.value
      );
    });
  }, [snapshotDeductionRows, data.deductions]);

  const getViolationTypeLabel = (type: string) => {
    if (type === "deadline_extended") {
      return t`Khấu trừ dời deadline`;
    }
    return type;
  };

  const deductionReasonLabel = (reason: string) => {
    if (reason === REWARD_DEDUCTION_REASON.LATE) {
      return t`Trễ hạn (hoàn thành sau deadline)`;
    }
    if (reason === REWARD_DEDUCTION_REASON.MOVE) {
      return t`Dời deadline`;
    }
    return reason;
  };

  if (isLoadingPreview) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
      </div>
    );
  }

  const isBreached =
    !!data.snapshot && preview?.violations && preview.violations.length > 0;

  /** Không lặp bảng chỉ đọc trong Draft khi đã có cùng nội dung trong Snapshot (phía trên). */
  const hideDuplicateDeductionInDraft =
    !isBreached &&
    snapshotDeductionRows.length > 0 &&
    draftDeductionsMatchSnapshot;

  const showDraftReadOnlyDeductionBlock =
    isBreached || !hideDuplicateDeductionInDraft;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-6 p-1 pb-10 font-sans"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-neutral-800">
          {t`CẤU HÌNH THƯỞNG / KHẤU TRỪ`}
        </h3>

        {isBreached ? (
          <div className="flex items-center gap-1.5 rounded border border-rose-300 bg-rose-50 px-2 py-0.5 text-[9px] font-black uppercase text-rose-700 shadow-sm">
            <HiExclamationCircle className="h-3 w-3" />
            {t`BREACHED`}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase text-amber-700 shadow-sm">
            <HiExclamationCircle className="h-3 w-3" />
            {t`WAITING APPROVAL`}
          </div>
        )}
      </div>

      {/* SNAPSHOT BOX */}
      {data.snapshot && (
        <div className="rounded-xl border border-neutral-200 bg-[#f9f9f5] p-5 shadow-sm">
          <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            {t`SNAPSHOT (Bản đã chốt)`}
          </span>
          <div className="space-y-3 text-[13px] font-medium text-neutral-600">
            <div className="flex items-start gap-4">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
              <div className="flex-1">
                <span className="inline-block w-24 text-neutral-400">{t`Thời gian`}</span>
                <span className="font-bold text-neutral-700">
                  {data.snapshot.snappedStartDate
                    ? formatRewardDayMonth(data.snapshot.snappedStartDate)
                    : "?"}{" "}
                  →{" "}
                  {data.snapshot.snappedDueDate
                    ? formatRewardDayMonthYear(data.snapshot.snappedDueDate)
                    : "?"}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <div className="flex-1">
                <span className="inline-block w-24 text-neutral-400">{t`Số tiền`}</span>
                <span className="font-black text-emerald-700">
                  {formatCurrency(data.snapshot.snappedBonusAmount)}{" "}
                  {data.snapshot.snappedCurrency}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="mt-1 h-2 w-2 shrink-0 opacity-0" />
              <div className="flex-1">
                <span className="inline-block w-24 text-neutral-400">{t`Người nhận`}</span>
                <span className="font-bold text-neutral-700">
                  {snapshotAssigneeName ||
                    card.targetUser?.name ||
                    t`Chưa xác định`}
                </span>
              </div>
            </div>
          </div>

          <div className="my-4 border-t border-neutral-200/90 dark:border-dark-400/50" />
          <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
            {t`Danh sách Khấu trừ (chỉ đọc — bản đã chốt)`}
          </p>
          {snapshotDeductionRows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-neutral-200/90 bg-white/60 dark:border-dark-300 dark:bg-dark-100/40">
              <table className="w-full text-[12px]">
                <thead className="bg-neutral-50/80 font-bold uppercase tracking-tighter text-neutral-400 dark:bg-dark-200/80 dark:text-dark-600">
                  <tr>
                    <th className="border-b border-neutral-100 px-3 py-2.5 dark:border-dark-300">
                      {t`Lý do`}
                    </th>
                    <th className="border-b border-neutral-100 px-3 py-2.5 text-center dark:border-dark-300">
                      {t`Loại`}
                    </th>
                    <th className="border-b border-neutral-100 px-3 py-2.5 text-right dark:border-dark-300">
                      {t`Giá trị`}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700 dark:divide-dark-300 dark:text-dark-800">
                  {snapshotDeductionRows.map(
                    (
                      d: {
                        reason: string;
                        unitType: string;
                        value: string | number;
                      },
                      i: number,
                    ) => (
                      <tr key={i}>
                        <td className="px-3 py-3">
                          {deductionReasonLabel(d.reason)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {d.unitType === "percent" ? "%" : "VND"}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-500 dark:text-rose-400">
                          {formatCurrency(d.value)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[12px] font-medium italic text-neutral-400 dark:text-dark-600">
              {t`Không có khấu trừ trong bản đã chốt.`}
            </p>
          )}
        </div>
      )}

      {/* ALERT BANNER */}
      {isBreached && (
        <div className="flex items-center justify-center rounded-lg bg-[#f9f3e4] py-2 text-[10px] font-black uppercase tracking-tight text-amber-800">
          <HiChevronDown className="mr-2 h-4 w-4 animate-bounce" />
          {t`Đang có thay đổi mới so với bản đã chốt`}
        </div>
      )}

      {/* DRAFT BOX */}
      <div
        className={`rounded-xl border border-neutral-200 bg-[#fefaf0] p-5 shadow-sm ${!isBreached ? "bg-[#f9f9f5]" : ""}`}
      >
        <span className="mb-4 block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
          {isBreached
            ? t`DRAFT (Bản thảo mới - chưa duyệt)`
            : t`CHI TIẾT ĐỀ XUẤT`}
        </span>

        <div className="space-y-4 text-[13px] font-medium">
          {!isBreached && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                <span className="text-neutral-400">{t`Loại thưởng`}</span>
                <span className="font-bold uppercase text-neutral-700">
                  {data.rewardType === "project"
                    ? t`Thưởng Dự Án`
                    : t`Thưởng Trách Nhiệm`}
                </span>
              </div>
              <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                <span className="text-neutral-400">{t`Số tiền`}</span>
                <span className="font-black text-emerald-700">
                  {formatCurrency(data.bonusAmount)} {data.currency}
                </span>
              </div>
              <div className="flex justify-between border-b border-dashed border-neutral-200 pb-2">
                <span className="text-neutral-400">{t`Thời gian`}</span>
                <span className="font-bold text-neutral-700">
                  {card.startDate ? formatRewardDayMonth(card.startDate) : "?"}{" "}
                  →{" "}
                  {card.dueDate ? formatRewardDayMonthYear(card.dueDate) : "?"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">{t`Người nhận`}</span>
                <span className="font-bold text-neutral-700">
                  {card.targetUser?.name}
                </span>
              </div>
            </div>
          )}

          {isBreached && (
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <span className="w-24 text-neutral-400">{t`Hiện tại`}</span>
                <div className="flex items-center gap-2 font-bold text-neutral-700 text-rose-600">
                  <span>
                    {card.dueDate ? formatRewardDayMonth(card.dueDate) : "?"}
                  </span>
                  {preview?.violations.some(
                    (v) => v.violationType === "deadline_extended",
                  ) && (
                    <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-rose-700">
                      {t`Trễ ${differenceInDays(new Date(card.dueDate!), new Date(data.snapshot!.snappedDueDate!))} ngày`}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                <span className="w-24 text-neutral-400">{t`Thưởng đề xuất`}</span>
                <span className="font-black text-neutral-700">
                  [ {formatCurrency(data.bonusAmount)} {data.currency} ]
                </span>
              </div>
            </div>
          )}

          {showDraftReadOnlyDeductionBlock && (
            <>
              <div className="my-4 border-t border-neutral-200/90 dark:border-dark-400/50" />
              <p className="mb-3 text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
                {isBreached
                  ? t`Danh sách Khấu trừ (chỉ đọc — đề xuất mới, chưa duyệt)`
                  : t`Danh sách Khấu trừ (chỉ đọc — đề xuất hiện tại)`}
              </p>
              {data.deductions && data.deductions.length > 0 ? (
                <div className="overflow-hidden rounded-lg border border-neutral-200/90 bg-white/70 dark:border-dark-300 dark:bg-dark-100/40">
                  <table className="w-full text-[12px]">
                    <thead className="bg-neutral-50/80 font-bold uppercase tracking-tighter text-neutral-400 dark:bg-dark-200/80 dark:text-dark-600">
                      <tr>
                        <th className="border-b border-neutral-100 px-3 py-2.5 dark:border-dark-300">
                          {t`Lý do`}
                        </th>
                        <th className="border-b border-neutral-100 px-3 py-2.5 text-center dark:border-dark-300">
                          {t`Loại`}
                        </th>
                        <th className="border-b border-neutral-100 px-3 py-2.5 text-right dark:border-dark-300">
                          {t`Giá trị`}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-semibold text-neutral-700 dark:divide-dark-300 dark:text-dark-800">
                      {data.deductions.map((d, i) => (
                        <tr key={i}>
                          <td className="px-3 py-3">
                            {deductionReasonLabel(d.reason)}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {d.unitType === "percent" ? "%" : "VND"}
                          </td>
                          <td className="px-3 py-3 text-right font-bold text-rose-500 dark:text-rose-400">
                            {formatCurrency(d.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[12px] font-medium italic text-neutral-400 dark:text-dark-600">
                  {t`Chưa có dòng khấu trừ trong đề xuất.`}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Bảng tương tác: chỉ khi BREACHED (quyết định khấu trừ dời deadline). WAITING APPROVAL: đủ bảng chỉ đọc trong CHI TIẾT ĐỀ XUẤT / Snapshot. */}
      {isBreached && (
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-neutral-800">
              {t`Quyết định duyệt — khấu trừ theo vi phạm`}
            </h4>
            <p className="text-[10px] font-medium italic text-neutral-400">
              —{" "}
              {t`Chỉ quyết có áp dụng khấu trừ dời deadline (đúng mức đề xuất bên dưới) hay không — không chỉnh sửa mức ở đây, không xử lý khấu trừ trễ hạn.`}
            </p>
          </div>

          <div className="overflow-hidden rounded-xl border border-neutral-100 bg-white shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50/50 text-neutral-400">
                <tr>
                  <th className="w-12 px-4 py-3"></th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-tight">{t`Nội dung`}</th>
                  <th className="px-4 py-3 font-semibold uppercase tracking-tight">{t`Loại`}</th>
                  <th className="px-4 py-3 text-right font-semibold uppercase tracking-tight">{t`Mức đề xuất`}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {preview?.violations?.map((v) => {
                  const move = deadlineMoveRows(preview.availableDeductions);
                  const proposed = move[0];
                  const applyDeduction =
                    !deadlineDecision.isSkipped && !!proposed;

                  return (
                    <tr
                      key={v.violationType}
                      className={`transition-colors ${deadlineDecision.isSkipped ? "opacity-40" : ""}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          title={
                            deadlineDecision.isSkipped
                              ? t`Không áp dụng khấu trừ dời deadline`
                              : t`Áp dụng khấu trừ dời deadline`
                          }
                          onClick={() =>
                            setDeadlineDecision((prev) => ({
                              ...prev,
                              isSkipped: !prev.isSkipped,
                              deductionId: proposed?.id ?? null,
                            }))
                          }
                          disabled={!proposed}
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                            !deadlineDecision.isSkipped
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-neutral-200 bg-white"
                          }`}
                        >
                          {!deadlineDecision.isSkipped && (
                            <HiCheck className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <span className="font-bold text-neutral-800">
                          {getViolationTypeLabel(v.violationType)}
                        </span>
                        {!proposed && (
                          <p className="mt-1 text-[10px] font-medium text-amber-700">
                            {t`Chưa có mức đề xuất trong cấu hình — chỉ có thể bỏ qua.`}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top font-bold text-neutral-600">
                        {applyDeduction && proposed
                          ? proposed.unitType === "percent"
                            ? "%"
                            : "VND"
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right align-top">
                        {applyDeduction && proposed ? (
                          <span className="font-black text-rose-600">
                            −{formatCurrency(proposed.value)}
                            {proposed.unitType === "percent" ? "%" : "đ"}
                          </span>
                        ) : (
                          <span className="italic text-neutral-300">
                            {t`Không áp dụng`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BREACH LOGS BOX */}
      {isBreached && preview?.violations && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-5 dark:border-rose-900/40 dark:bg-rose-950/20">
          <span className="mb-3 block text-[9px] font-bold uppercase tracking-widest text-rose-700">
            {t`Vi phạm phát hiện (chưa ghi nhận — xử lý ở bảng quyết định duyệt bên dưới)`}
          </span>
          <div className="space-y-2">
            {preview.violations.map((v, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-neutral-700"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                <span>{getViolationTypeLabel(v.violationType)}</span>
                <span className="text-[10px] font-medium text-neutral-400">
                  {t`Áp dụng hoặc bỏ qua khấu trừ dời deadline (mức đề xuất), rồi bấm Duyệt.`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Decision Comment */}
      <div className="flex flex-col gap-3 pt-4">
        <label
          className={`text-[10px] font-bold uppercase tracking-widest transition-colors ${commentError ? "text-rose-600" : "text-neutral-800"}`}
        >
          {t`GHI CHÚ (Bắt buộc khi từ chối) *`}
        </label>
        <motion.div
          animate={
            commentError
              ? { x: [-10, 10, -10, 10, 0], transition: { duration: 0.4 } }
              : {}
          }
        >
          <textarea
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              if (commentError) setCommentError(false);
            }}
            placeholder={t`Nhập ghi chú của Admin...`}
            className={`min-h-[100px] w-full rounded-xl border p-4 text-[13px] font-medium outline-none transition-all focus:ring-2 ${
              commentError
                ? "border-rose-500 bg-rose-50/30 focus:ring-rose-100"
                : "border-neutral-200 bg-white focus:border-neutral-400 focus:ring-neutral-100"
            }`}
          />
        </motion.div>
      </div>

      {/* FINAL ACTIONS */}
      <div className="flex items-center gap-3 pt-6">
        <button
          disabled={isSubmitting}
          onClick={handleApproveAction}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[13px] font-bold text-neutral-800 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98] disabled:opacity-30"
        >
          <HiCheck className="h-5 w-5 text-emerald-600" />
          {isBreached ? t`Duyệt thay đổi` : t`Duyệt`}
        </button>

        {isBreached && onRevert && (
          <button
            disabled={isSubmitting}
            onClick={onRevert}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-[13px] font-bold text-neutral-800 shadow-sm transition-all hover:bg-neutral-50 active:scale-[0.98]"
          >
            <HiArrowPath className="h-5 w-5 text-amber-600" />
            {t`Khôi phục`}
          </button>
        )}

        <button
          disabled={isSubmitting}
          onClick={handleRejectAction}
          className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border text-[13px] font-bold transition-all active:scale-[0.98] disabled:opacity-20 ${
            commentError
              ? "border-rose-300 bg-rose-50 text-rose-600 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
              : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <HiXMark className="h-5 w-5 text-rose-500" />
          {t`Từ chối`}
        </button>
      </div>
    </motion.div>
  );
};
