import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import { differenceInDays } from "date-fns";
import { motion } from "framer-motion";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  HiArrowPath,
  HiCalendarDays,
  HiCheck,
  HiCheckCircle,
  HiClock,
  HiCurrencyDollar,
  HiExclamationCircle,
  HiPencilSquare,
  HiUser,
} from "react-icons/hi2";
import { z } from "zod";

import {
  isRewardDeductionReasonKey,
  REWARD_DEDUCTION_REASON,
} from "@kan/shared/constants";

import type { RewardLogRow } from "./CardRewardFinalize";
import type { RewardStatus } from "./CardRewardSummaryCard";
import Select from "~/components/Select";
import { usePermissions } from "~/hooks/usePermissions";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import {
  invalidateCard,
  invalidateTaskInstance,
} from "~/utils/cardInvalidation";
import {
  formatRewardDayMonth,
  formatRewardDayMonthYear,
} from "~/utils/rewardDates";
import { CardRewardAdminReview } from "./CardRewardAdminReview";
import { CardRewardFinalize } from "./CardRewardFinalize";
import { CardRewardSummaryCard } from "./CardRewardSummaryCard";



interface RewardDeduction {
  id?: number;
  reason:
    | typeof REWARD_DEDUCTION_REASON.LATE
    | typeof REWARD_DEDUCTION_REASON.MOVE;
  unitType: "percent" | "vnd";
  value: number | null;
  displayOrder?: number;
}

const DEFAULT_DEDUCTION_PAIR: [RewardDeduction, RewardDeduction] = [
  {
    reason: REWARD_DEDUCTION_REASON.LATE,
    unitType: "vnd",
    value: 1,
    displayOrder: 0,
  },
  {
    reason: REWARD_DEDUCTION_REASON.MOVE,
    unitType: "vnd",
    value: 1,
    displayOrder: 1,
  },
];

function buildDeductionPairFromRemote(
  rows: Array<{
    id?: number;
    reason: string;
    value: string | number;
    unitType: string;
    displayOrder?: number;
  }>,
): RewardDeduction[] {
  const byReason = new Map<string, (typeof rows)[0]>();
  for (const d of rows) {
    const r = isRewardDeductionReasonKey(d.reason)
      ? d.reason
      : REWARD_DEDUCTION_REASON.LATE;
    if (
      r === REWARD_DEDUCTION_REASON.LATE ||
      r === REWARD_DEDUCTION_REASON.MOVE
    ) {
      byReason.set(r, d);
    }
  }
  const late = byReason.get(REWARD_DEDUCTION_REASON.LATE);
  const move = byReason.get(REWARD_DEDUCTION_REASON.MOVE);
  return [
    {
      id: late?.id,
      reason: REWARD_DEDUCTION_REASON.LATE,
      unitType: (late?.unitType as RewardDeduction["unitType"]) ?? "vnd",
      value: late
        ? parseFloat(String(late.value))
        : DEFAULT_DEDUCTION_PAIR[0].value,
      displayOrder: 0,
    },
    {
      id: move?.id,
      reason: REWARD_DEDUCTION_REASON.MOVE,
      unitType: (move?.unitType as RewardDeduction["unitType"]) ?? "vnd",
      value: move
        ? parseFloat(String(move.value))
        : DEFAULT_DEDUCTION_PAIR[1].value,
      displayOrder: 1,
    },
  ];
}

interface RewardConfigFormValues {
  rewardType: "project" | "responsibility";
  bonusAmount: number | null;
  currency: "VND";
  deductions: RewardDeduction[];
}

export type CardRewardConfigFormProps = {
  isReadOnly?: boolean;
  /** Kanban card — truyền đúng một trong: cardPublicId, taskInstanceId, hoặc taskMasterId (mẫu) */
  card?: any;
} & (
  | {
      cardPublicId: string;
      taskInstanceId?: undefined;
      taskMasterId?: undefined;
    }
  | {
      taskInstanceId: string;
      cardPublicId?: undefined;
      taskMasterId?: undefined;
    }
  | {
      taskMasterId: string;
      cardPublicId?: undefined;
      taskInstanceId?: undefined;
    }
);

export default function CardRewardConfigForm({
  cardPublicId,
  taskInstanceId,
  taskMasterId,
  isReadOnly = false,
  card,
}: CardRewardConfigFormProps) {
  const isTaskMasterTemplate = Boolean(taskMasterId);
  const isTaskInstanceReward = Boolean(taskInstanceId);
  const [viewMode, setViewMode] = useState<"edit" | "summary">("edit");
  useEffect(() => {
    if (isTaskMasterTemplate) setViewMode("edit");
  }, [isTaskMasterTemplate]);
  const { showPopup } = usePopup();
  const utils = api.useUtils();
  const { role } = usePermissions();
  const isAdmin = role === "ADMIN";
  const canFinalize = ["ADMIN", "AREA_MANAGER", "BRANCH_MANAGER"].includes(
    role ?? "",
  );
  /** Duyệt/từ chối reward config — API reject chỉ cho ADMIN. */
  const canReviewRewardApproval = role === "ADMIN";

  // ───────────────────────────────────────────────────────────────────────────
  // Queries & Mutations
  // ───────────────────────────────────────────────────────────────────────────
  const { data: remoteByCard, isLoading: loadingCard } =
    api.reward.getByCardId.useQuery(
      { cardPublicId: cardPublicId ?? "" },
      {
        enabled:
          !!cardPublicId && !isTaskInstanceReward && !isTaskMasterTemplate,
        refetchOnWindowFocus: false,
      },
    );

  const { data: remoteByTask, isLoading: loadingTask } =
    api.reward.getByTaskInstanceId.useQuery(
      { taskInstanceId: taskInstanceId ?? "" },
      {
        enabled:
          isTaskInstanceReward && !!taskInstanceId && !isTaskMasterTemplate,
        refetchOnWindowFocus: false,
      },
    );

  const { data: remoteByMaster, isLoading: loadingMaster } =
    api.reward.getByTaskMasterId.useQuery(
      { taskMasterId: taskMasterId ?? "" },
      {
        enabled: isTaskMasterTemplate && !!taskMasterId,
        refetchOnWindowFocus: false,
      },
    );

  const remoteData = isTaskMasterTemplate
    ? remoteByMaster
    : isTaskInstanceReward
      ? remoteByTask
      : remoteByCard;
  const isQueryLoading = isTaskMasterTemplate
    ? loadingMaster
    : isTaskInstanceReward
      ? loadingTask
      : loadingCard;

  /** Refetch reward config + card/task so modal và board đồng bộ sau mutation. */
  const refreshRewardState = async (opts?: { configId?: number }) => {
    if (isTaskMasterTemplate && taskMasterId) {
      await Promise.all([
        utils.reward.getByTaskMasterId.refetch({ taskMasterId }),
        utils.taskInstance.getVirtual.invalidate(),
      ]);
    } else if (isTaskInstanceReward && taskInstanceId) {
      await Promise.all([
        utils.reward.getByTaskInstanceId.refetch({ taskInstanceId }),
        invalidateTaskInstance(utils, taskInstanceId),
      ]);
    } else if (cardPublicId) {
      await Promise.all([
        utils.reward.getByCardId.refetch({ cardPublicId }),
        invalidateCard(utils, cardPublicId),
      ]);
    }
    if (opts?.configId != null) {
      await utils.reward.previewViolations.invalidate({
        configId: opts.configId,
      });
    }
  };

  const upsertMutation = api.reward.upsert.useMutation();
  const submitMutation = api.reward.submit.useMutation();
  const withdrawMutation = api.reward.withdraw.useMutation();
  const approveMutation = api.reward.approve.useMutation();
  const rejectMutation = api.reward.reject.useMutation();
  const revertMutation = api.reward.revert.useMutation();
  const finalizeMutation = api.reward.finalize.useMutation();

  const buildUpsertPayload = (
    data: RewardConfigFormValues,
    mode: "draft" | "submit",
  ) => {
    const deductions = data.deductions.map((d, i) => ({
      ...d,
      value: (d.value ?? 0).toString(),
      displayOrder: i,
    }));
    const source = isTaskMasterTemplate
      ? ({ taskMasterId: taskMasterId! } as const)
      : isTaskInstanceReward && taskInstanceId
        ? ({ taskInstanceId } as const)
        : ({ cardPublicId: cardPublicId! } as const);

    if (mode === "draft") {
      const draftBonus = data.bonusAmount;
      return {
        ...source,
        rewardType: data.rewardType,
        currency: data.currency,
        deductions,
        bonusAmount:
          data.rewardType === "project" &&
          typeof draftBonus === "number" &&
          draftBonus > 0
            ? draftBonus
            : undefined,
      };
    }

    return {
      ...source,
      rewardType: data.rewardType,
      bonusAmount:
        data.rewardType === "project" ? Number(data.bonusAmount ?? 0) : 0,
      currency: data.currency,
      deductions,
    };
  };

  const isMutating =
    upsertMutation.isPending ||
    submitMutation.isPending ||
    withdrawMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;



  // Define dynamic validation schema based on live rate
  const dynamicSchema = React.useMemo(() => {
    const deductionItemSchema = z
      .object({
        id: z.number().optional().nullable(),
        reason: z.enum([
          REWARD_DEDUCTION_REASON.LATE,
          REWARD_DEDUCTION_REASON.MOVE,
        ]),
        unitType: z.enum(["percent", "vnd"]),
        value: z
          .number()
          .nullable()
          .refine((v) => v !== null && v >= 0.01, t`Giá trị phải lớn hơn 0`),
        displayOrder: z.number().int().min(0).default(0),
      })
      .refine(
        (data) => {
          if (data.unitType === "percent") {
            return (data.value ?? 0) <= 100;
          }
          return true;
        },
        {
          message: t`Phần trăm không được vượt quá 100`,
          path: ["value"],
        },
      );

    return z
      .object({
        rewardType: z.enum(["project", "responsibility"]),
        bonusAmount: z.number().optional().nullable(),
        currency: z.literal("VND").default("VND"),
        deductions: z
          .array(deductionItemSchema)
          .length(2)
          .refine(
            (rows) =>
              rows[0]?.reason === REWARD_DEDUCTION_REASON.LATE &&
              rows[1]?.reason === REWARD_DEDUCTION_REASON.MOVE,
            {
              message: t`Danh sách khấu trừ phải gồm đúng 2 loại theo thứ tự.`,
            },
          ),
      })
      .refine(
        (d) =>
          d.rewardType === "responsibility" ||
          (d.bonusAmount != null && d.bonusAmount > 0),
        {
          message: t`Số tiền thưởng là bắt buộc khi loại thưởng là 'project'.`,
          path: ["bonusAmount"],
        },
      )
      .superRefine((data, ctx) => {
        if (data.rewardType === "project" && data.bonusAmount) {
          const bonusInVnd = data.bonusAmount;

          data.deductions.forEach((item, index) => {
            if (item.unitType === "vnd" && item.value !== null) {
              if (item.value > bonusInVnd) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: t`Khấu trừ không được lớn hơn tiền thưởng`,
                  path: ["deductions", index, "value"],
                });
              }
            }
          });
        }
      });
  }, []);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    formState: { errors },
  } = useForm<RewardConfigFormValues>({
    resolver: zodResolver(dynamicSchema),
    defaultValues: {
      rewardType: "project",
      bonusAmount: null,
      currency: "VND",
      deductions: [...DEFAULT_DEDUCTION_PAIR].map((d) => ({
        ...d,
        value: null,
      })),
    },
  });

  // Sync remote data to form
  useEffect(() => {
    if (remoteData) {
      reset({
        rewardType: remoteData.rewardType as any,
        bonusAmount: remoteData.bonusAmount
          ? parseFloat(remoteData.bonusAmount)
          : 0,
        currency: (remoteData.currency as any) || "VND",
        deductions: buildDeductionPairFromRemote(remoteData.deductions),
      });

      // If already has status beyond draft, default to summary view
      if (remoteData.approvalStatus !== "draft") {
        setViewMode("summary");
      }
    }
  }, [remoteData, reset]);

  const approvalStatus: RewardStatus =
    (remoteData?.approvalStatus as RewardStatus) || "draft";

  /** Chỉ áp dụng khi gửi duyệt (không chặn lưu nháp). Card: đủ ngày bắt đầu/kết thúc + ít nhất một thành viên (hoặc targetUser). */
  const rewardSubmitPrereqError = useMemo(() => {
    if (isTaskMasterTemplate) return null;
    if (cardPublicId && card == null) {
      return t`Đang tải dữ liệu card. Vui lòng thử lại sau.`;
    }
    const source = card;
    if (source == null) return null;

    const hasSchedule = source.startDate != null && source.dueDate != null;
    const hasMember =
      (Array.isArray(source.members) && source.members.length > 0) ||
      Boolean(source.targetUser);

    if (!hasSchedule && !hasMember) {
      return t`Vui lòng chọn ngày bắt đầu, ngày kết thúc và gán thành viên trên card trước khi gửi duyệt.`;
    }
    if (!hasSchedule) {
      return t`Vui lòng chọn ngày bắt đầu và ngày kết thúc trên card trước khi gửi duyệt.`;
    }
    if (!hasMember) {
      return t`Vui lòng gán ít nhất một thành viên cho card trước khi gửi duyệt.`;
    }
    return null;
  }, [isTaskMasterTemplate, cardPublicId, card]);

  const dbSnapshot: any = (remoteData as any)?.snapshot;

  const snapshotAssigneeName = useMemo(() => {
    const uid = dbSnapshot?.snappedTargetUser as string | undefined;
    if (!uid || !card?.members?.length) return undefined;
    const m = card.members.find(
      (x: { user?: { id?: string | null } | null }) => x.user?.id === uid,
    );
    return m?.name || m?.user?.name || undefined;
  }, [dbSnapshot, card?.members]);

  /** Sau khi dời lịch, backend hạ reward → draft: chuyển sang khung chỉnh sửa để thấy snapshot so sánh. */
  const prevRewardStatusRef = useRef<string | undefined>();
  useEffect(() => {
    const s = remoteData?.approvalStatus;
    if (
      prevRewardStatusRef.current === "approved" &&
      s === "draft" &&
      dbSnapshot
    ) {
      setViewMode("edit");
    }
    prevRewardStatusRef.current = s;
  }, [remoteData?.approvalStatus, dbSnapshot]);

  const showResubmitSnapshotBanner =
    !!dbSnapshot &&
    (approvalStatus === "draft" || approvalStatus === "rejected");

  /** Gộp so sánh + form một màn: không dùng màn summary riêng khi cần gửi duyệt lại. */
  useEffect(() => {
    if (viewMode === "summary" && showResubmitSnapshotBanner) {
      setViewMode("edit");
    }
  }, [viewMode, showResubmitSnapshotBanner]);

  const rewardType = watch("rewardType");
  const isProject = rewardType === "project";

  const formatNumber = (val: number | string | null | undefined) => {
    if (val === null || val === undefined || val === "") return "";
    const num =
      typeof val === "string" ? val.replace(/\D/g, "") : val.toString();
    if (!num) return "";
    return Number(num).toLocaleString("vi-VN");
  };

  const parseNumber = (val: string) => {
    const digits = val.replace(/\D/g, "");
    if (digits === "") return null;
    return Number(digits);
  };

  const handleWithdraw = async () => {
    if (!remoteData?.id) return;
    try {
      await withdrawMutation.mutateAsync({ configId: remoteData.id });
      showPopup({
        header: t`Thành công`,
        message: t`Đã rút lại yêu cầu phê duyệt`,
        icon: "success",
      });
      await refreshRewardState({ configId: remoteData.id });
      setViewMode("edit");
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi rút lại yêu cầu`,
        icon: "error",
      });
    }
  };

  const handleRevert = async () => {
    if (!remoteData?.id) return;
    try {
      await revertMutation.mutateAsync({ configId: remoteData.id });
      showPopup({
        header: t`Thành công`,
        message: t`Đã khôi phục Card và Cấu hình về bản Approved`,
        icon: "success",
      });
      await refreshRewardState({ configId: remoteData.id });
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi khôi phục cấu hình`,
        icon: "error",
      });
    }
  };

  const handleAdminApprove = async (decisions: any[]) => {
    if (!remoteData?.id) return;
    try {
      await approveMutation.mutateAsync({
        configId: remoteData.id,
        logDecisions: decisions,
      });
      showPopup({
        header: t`Thành công`,
        message: t`Đã duyệt cấu hình thưởng.`,
        icon: "success",
      });
      await refreshRewardState({ configId: remoteData.id });
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi duyệt cấu hình`,
        icon: "error",
      });
    }
  };

  const handleAdminFinalize = async (percent: number, note: string) => {
    if (!remoteData?.id) return;
    try {
      await finalizeMutation.mutateAsync({
        configId: remoteData.id,
        final_percent: percent,
        final_note: note,
      });
      showPopup({
        header: t`Thành công`,
        message: t`Đã nghiệm thu và tất toán tiền thưởng.`,
        icon: "success",
      });
      await refreshRewardState({ configId: remoteData.id });
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi nghiệm thu`,
        icon: "error",
      });
    }
  };

  const handleAdminReject = async (reason: string) => {
    if (!remoteData?.id) return;
    try {
      await rejectMutation.mutateAsync({
        configId: remoteData.id,
        rejectedReason: reason,
      });
      showPopup({
        header: t`Đã từ chối`,
        message: t`Đã từ chối cấu hình thưởng.`,
        icon: "success",
      });
      await refreshRewardState({ configId: remoteData.id });
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi từ chối cấu hình`,
        icon: "error",
      });
    }
  };

  /** Lưu + gửi duyệt (validate form). Khác với chỉ lưu nháp. */
  const submitForApproval = async (data: RewardConfigFormValues) => {
    if (rewardSubmitPrereqError) {
      showPopup({
        header: t`Thiếu thông tin`,
        message: rewardSubmitPrereqError,
        icon: "error",
      });
      return;
    }
    try {
      const result = await upsertMutation.mutateAsync(
        buildUpsertPayload(data, "submit"),
      );
      await refreshRewardState({ configId: result.configId });

      if (result.status === "draft" || result.status === "rejected") {
        await submitMutation.mutateAsync({ configId: result.configId });
        await refreshRewardState({ configId: result.configId });
      }

      showPopup({
        header: t`Thành công`,
        message: t`Đã gửi yêu cầu phê duyệt`,
        icon: "success",
      });
      setViewMode("summary");
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi lưu cấu hình`,
        icon: "error",
      });
    }
  };

  /** Mẫu task master: chỉ lưu nháp, không gửi duyệt. */
  const saveTemplateDraft = async (data: RewardConfigFormValues) => {
    try {
      const result = await upsertMutation.mutateAsync(
        buildUpsertPayload(data, "draft"),
      );
      showPopup({
        header: t`Thành công`,
        message: t`Đã lưu mẫu thưởng`,
        icon: "success",
      });
      await refreshRewardState({ configId: result.configId });
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi lưu cấu hình`,
        icon: "error",
      });
    }
  };

  // Prepare data for Summary View
  const getSummaryData = () => {
    const values = getValues();

    // Khi đã có bản ghi trên server, dùng remoteData cho tiền/khấu trừ — không dùng form (getValues),
    // tránh lệch oan với snapshot ngay sau duyệt (form chưa reset kịp hoặc decimal khác kiểu).
    const useRemoteReward =
      remoteData != null &&
      [
        "waiting_approval",
        "approved",
        "waiting_evaluation",
        "completed",
      ].includes(approvalStatus);

    let summaryBonus = values.bonusAmount;
    let summaryCurrency = values.currency;
    let summaryRewardType = values.rewardType;
    let summaryDeductions = values.deductions.map((d) => ({ ...d }));

    if (useRemoteReward) {
      summaryBonus = remoteData!.bonusAmount
        ? parseFloat(String(remoteData.bonusAmount))
        : 0;
      summaryCurrency =
        (remoteData!.currency as typeof values.currency) || "VND";
      summaryRewardType = remoteData!.rewardType as typeof values.rewardType;
      summaryDeductions = buildDeductionPairFromRemote(remoteData!.deductions);
    }

    // approvedByUser sẽ có khi backend getByCardId join user (hiện bỏ trống)
    const approvedByUser =
      (remoteData as { approvedByUser?: { name: string | null } | null } | null)
        ?.approvedByUser ?? null;

    // snapshot sẽ có khi backend join cardRewardSnapshots (hiện bỏ trống)
    const rawSnapshot =
      (
        remoteData as {
          snapshot?: {
            snappedStartDate?: string | null;
            snappedDueDate?: string | null;
            snappedBonusAmount?: string | null;
            snappedCurrency?: string;
          } | null;
        } | null
      )?.snapshot ?? null;

    const snapshot = rawSnapshot
      ? {
          snappedCardTitle:
            (rawSnapshot as any).snappedCardTitle ?? card?.title ?? "",
          snappedStartDate: rawSnapshot.snappedStartDate ?? null,
          snappedDueDate: rawSnapshot.snappedDueDate ?? null,
          snappedTargetUser: (rawSnapshot as any).snappedTargetUser ?? null,
          snappedRewardType:
            (rawSnapshot as any).snappedRewardType ?? "project",
          snappedBonusAmount: rawSnapshot.snappedBonusAmount ?? null,
          snappedCurrency: rawSnapshot.snappedCurrency ?? "VND",
          snappedDeductions: (rawSnapshot as any).snappedDeductions ?? [],
          assigneeName:
            card?.members?.[0]?.name || card?.members?.[0]?.user?.name || "",
          assigneeImage:
            card?.members?.[0]?.image ||
            card?.members?.[0]?.user?.image ||
            null,
        }
      : null;

    const rawLogs =
      (
        remoteData as {
          logs?: Array<{
            detectedAt: Date | string;
            violationType: string;
            isSkipped: boolean;
            deduction?: {
              unitType: "percent" | "vnd";
              value: string;
            } | null;
          }>;
        } | null
      )?.logs ?? [];
    const violationLogs = rawLogs
      .filter((l) => l.violationType !== "finalization_created")
      .map((l) => {
        let deductionValue = 0;
        let deductionUnit: "vnd" | "percent" | null = null;
        if (!l.isSkipped && l.deduction) {
          const v = Number(l.deduction.value);
          if (l.deduction.unitType === "vnd") {
            deductionValue = v;
            deductionUnit = "vnd";
          } else {
            // Giữ nguyên % (đặc biệt thưởng trách nhiệm: thưởng gốc 0 — không quy đổi ra tiền).
            deductionValue = v;
            deductionUnit = "percent";
          }
        }
        const reasonLabel =
          l.violationType === "deadline_extended"
            ? t`Dời deadline / timeline`
            : l.violationType === "deduction_changed" ||
                l.violationType === "completed_after_deadline"
              ? t`Trễ hạn (hoàn thành sau deadline)`
              : l.violationType;

        return {
          date:
            typeof l.detectedAt === "string"
              ? l.detectedAt
              : l.detectedAt.toISOString(),
          reason: reasonLabel,
          deductionValue,
          deductionUnit,
          isSkipped: Boolean(l.isSkipped),
        };
      });

    const finalization = (remoteData as any)?.finalization ?? null;

    return {
      ...values,
      rewardType: summaryRewardType,
      bonusAmount: summaryBonus,
      currency: summaryCurrency,
      approvalStatus,
      rejectedReason: remoteData?.rejectedReason ?? undefined,
      approvedBy: approvedByUser ? { name: approvedByUser.name } : undefined,
      approvedAt: remoteData?.approvedAt
        ? new Date(remoteData.approvedAt)
        : undefined,
      snapshot,
      violationLogs: violationLogs.length > 0 ? violationLogs : undefined,
      finalization,
      deductions: summaryDeductions.map((d) => ({ ...d })),
    };
  };

  if (isQueryLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  if (viewMode === "summary") {
    const summaryData = getSummaryData();
    const isWaitingApproval = summaryData.approvalStatus === "waiting_approval";
    // Chỉ hiển thị màn duyệt khi đang chờ admin; đã approved → CardRewardSummaryCard (có badge lệch nếu cần).
    // Trước đây gộp isBreachedApproved + so sánh assignee sai (publicId vs user id) khiến admin kẹt màn chờ dù API đã approved.
    if (canReviewRewardApproval && isWaitingApproval) {
      return (
        <CardRewardAdminReview
          data={{ ...summaryData, id: remoteData?.id! }}
          snapshotAssigneeName={snapshotAssigneeName}
          card={{
            cardTitle: card?.title || "Card Title",
            startDate: card?.startDate,
            dueDate: card?.dueDate,
            targetUser: card?.members?.[0]
              ? {
                  name: card.members[0].name || card.members[0].user?.name,
                  avatarUrl:
                    card.members[0].image || card.members[0].user?.image,
                  email:
                    card.members[0].email || card.members[0].user?.email || "",
                }
              : null,
          }}
          onApprove={handleAdminApprove}
          onReject={handleAdminReject}
          onRevert={handleRevert}
        />
      );
    }

    if (canFinalize && summaryData.approvalStatus === "waiting_evaluation") {
      return (
        <CardRewardFinalize
          data={{
            ...summaryData,
            id: remoteData?.id!,
            logs: (remoteData?.logs ?? []) as RewardLogRow[],
          }}
          onFinalize={handleAdminFinalize}
          onBack={() => setViewMode("edit")}
        />
      );
    }

    const effectivelyReadOnly = isReadOnly;

    return (
      <CardRewardSummaryCard
        data={summaryData}
        card={{
          cardTitle: card?.title || "Card Title",
          startDate: card?.startDate,
          dueDate: card?.dueDate,
          targetUser:
            (card as { targetUser?: string | null })?.targetUser ??
            card?.members?.[0]?.user?.id ??
            null,
          assignee: card?.members?.[0]
            ? {
                name: card.members[0].name || card.members[0].user?.name,
                image: card.members[0].image || card.members[0].user?.image,
                email: card.members[0].email || card.members[0].user?.email,
              }
            : null,
        }}
        isAdmin={isAdmin}
        onEdit={() => setViewMode("edit")}
        onWithdraw={handleWithdraw}
        onRevert={handleRevert}
      />
    );
  }

  const effectivelyReadOnly = isReadOnly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="shrink-0 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
          {t`Cấu hình thưởng / Khấu trừ`}
        </p>
        {showResubmitSnapshotBanner && (
          <span
            className={
              approvalStatus === "rejected"
                ? "rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
                : "rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-600 dark:border-dark-300 dark:bg-dark-200 dark:text-dark-600"
            }
          >
            {approvalStatus === "rejected" ? t`Từ chối` : t`Bản nháp`}
          </span>
        )}
      </div>

      {approvalStatus === "approved" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/10"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
              <HiCheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-900 dark:text-dark-1000">
                {t`Bạn đang chỉnh sửa bản thảo mới`}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] font-bold text-neutral-500">
                <span className="shrink-0">
                  {t`Bản cấu hình đã chốt`}:{" "}
                  {formatNumber(dbSnapshot?.snappedBonusAmount || 0)}{" "}
                  {dbSnapshot?.snappedCurrency || "VND"}
                </span>

                {card?.dueDate &&
                  dbSnapshot?.snappedDueDate &&
                  new Date(card.dueDate as string | Date).getTime() >
                    new Date(
                      dbSnapshot.snappedDueDate as string | Date,
                    ).getTime() && (
                    <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded bg-rose-100 px-1.5 py-0.5 font-black text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-rose-500" />
                      {t`Lệch Snapshot (+${Math.round(
                        (new Date(card.dueDate as string | Date).getTime() -
                          new Date(
                            dbSnapshot.snappedDueDate as string | Date,
                          ).getTime()) /
                          (1000 * 3600 * 24),
                      )} ngày)`}
                    </span>
                  )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewMode("summary")}
            className="shrink-0 rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600 shadow-sm transition-all hover:bg-emerald-50 dark:border-emerald-900/30 dark:bg-dark-100 dark:hover:bg-dark-200"
          >
            {t`Xem bản APPROVED`}
          </button>
        </motion.div>
      )}

      {showResubmitSnapshotBanner && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2"
        >
          {/* Snapshot — gọn một khối */}
          <div className="rounded-xl border border-neutral-200/90 bg-[#f7f7f2] px-3 py-2.5 dark:border-dark-300 dark:bg-dark-200/40">
            <p className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
              {t`Snapshot (chốt lúc duyệt)`}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] font-semibold text-neutral-800 dark:text-dark-800">
              <span className="inline-flex items-center gap-1.5">
                <HiCalendarDays className="h-4 w-4 shrink-0 text-neutral-400" />
                <span>
                  {dbSnapshot?.snappedStartDate
                    ? formatRewardDayMonth(dbSnapshot.snappedStartDate)
                    : "—"}{" "}
                  →{" "}
                  {dbSnapshot?.snappedDueDate
                    ? formatRewardDayMonthYear(dbSnapshot.snappedDueDate)
                    : "—"}
                </span>
              </span>
              <span className="inline-flex min-w-0 max-w-[40%] items-center gap-1.5">
                <HiUser className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">{snapshotAssigneeName ?? "—"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <HiCurrencyDollar className="h-4 w-4 shrink-0 text-neutral-400" />
                <span>
                  {formatNumber(dbSnapshot?.snappedBonusAmount || 0)}{" "}
                  {dbSnapshot?.snappedCurrency || "VND"}
                </span>
              </span>
            </div>
          </div>

          {/* Thẻ hiện tại — một dòng */}
          <div className="rounded-xl border border-light-200 bg-white px-3 py-2.5 dark:border-dark-300 dark:bg-dark-100">
            <p className="mb-1 text-[9px] font-bold uppercase tracking-widest text-neutral-400 dark:text-dark-600">
              {t`Hiện tại (card gốc)`}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[12px] font-semibold text-neutral-800 dark:text-dark-800">
              <span>
                {card?.startDate ? formatRewardDayMonth(card.startDate) : "—"} –{" "}
                {card?.dueDate ? formatRewardDayMonthYear(card.dueDate) : "—"}
              </span>
              {dbSnapshot?.snappedDueDate &&
                card?.dueDate &&
                (() => {
                  const d = differenceInDays(
                    new Date(card.dueDate),
                    new Date(dbSnapshot.snappedDueDate),
                  );
                  if (d === 0) return null;
                  return (
                    <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                      {d > 0 ? t`dời +${d} ngày` : t`sớm ${-d} ngày`}
                    </span>
                  );
                })()}
              <span className="text-neutral-500 dark:text-dark-600">·</span>
              <span className="inline-flex min-w-0 items-center gap-1">
                <HiUser className="h-4 w-4 shrink-0 text-neutral-400" />
                <span className="truncate">
                  {card?.members?.[0]?.name ||
                    card?.members?.[0]?.user?.name ||
                    "—"}
                </span>
              </span>
              {card?.status && (
                <>
                  <span className="text-neutral-400">·</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">
                    {String(card.status)}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50/90 px-2.5 py-2 dark:border-rose-900/40 dark:bg-rose-950/25">
            <HiExclamationCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <p className="text-[11px] font-medium leading-snug text-rose-900 dark:text-rose-100">
              {t`Dữ liệu đã thay đổi so với bản đã duyệt. Lưu và gửi duyệt lại để admin xem xét.`}
            </p>
          </div>
        </motion.div>
      )}

      <form
        onSubmit={handleSubmit(
          isTaskMasterTemplate ? saveTemplateDraft : submitForApproval,
        )}
        className="space-y-7 rounded-2xl border border-light-200 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-all dark:border-dark-300 dark:bg-dark-100/70"
      >
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
            {t`Loại cấu hình`}
          </label>
          <Controller
            name="rewardType"
            control={control}
            render={({ field }) => (
              <Select
                value={field.value}
                onChange={(val) => {
                  field.onChange(val);
                  if (val === "responsibility") {
                    setValue("bonusAmount", 0);
                  }
                }}
                disabled={effectivelyReadOnly}
                options={[
                  { value: "project", label: t`Thưởng Dự án (Project)` },
                  {
                    value: "responsibility",
                    label: t`Thưởng Trách nhiệm (Responsibility)`,
                  },
                ]}
                className="w-full"
              />
            )}
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
              {t`Số tiền thưởng`} <span className="text-red-500">*</span>
            </label>
            {errors.bonusAmount && (
              <span className="text-[10px] font-bold text-red-500">{t`Bắt buộc nhập > 0`}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1">
              <Controller
                name="bonusAmount"
                control={control}
                rules={{
                  required: isProject,
                  min: isProject ? 1 : 0,
                }}
                render={({ field }) => (
                  <input
                    type="text"
                    disabled={effectivelyReadOnly || !isProject}
                    value={formatNumber(field.value)}
                    onChange={(e) =>
                      field.onChange(parseNumber(e.target.value))
                    }
                    className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm font-bold outline-none transition-all focus:ring-[3px] dark:bg-dark-200 dark:text-white ${
                      !isProject
                        ? "cursor-not-allowed bg-neutral-50 opacity-50 dark:bg-dark-300"
                        : ""
                    } ${
                      errors.bonusAmount
                        ? "border-red-400 focus:border-red-500 focus:ring-red-500/10 dark:border-red-500/50"
                        : "border-light-200 focus:border-emerald-500 focus:ring-emerald-500/10 dark:border-dark-300/50 dark:focus:border-emerald-500/50"
                    }`}
                    placeholder={isProject ? "0" : t`Không áp dụng`}
                  />
                )}
              />
            </div>
            <div className="w-28 shrink-0">
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onChange={field.onChange}
                    disabled={effectivelyReadOnly}
                    options={[{ value: "VND", label: "VND" }]}
                    className="w-full"
                    buttonClassName="font-bold"
                  />
                )}
              />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
            {t`Danh sách Khấu trừ`}
          </label>

          <div className="overflow-hidden rounded-xl border border-light-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all dark:border-dark-300 dark:bg-dark-100">
            <table className="w-full text-left text-sm text-neutral-600 dark:text-dark-700">
              <thead className="bg-light-100 text-xs font-semibold text-neutral-500 dark:bg-dark-200 dark:text-dark-600">
                <tr>
                  <th className="border-b border-light-200 px-3 py-2 dark:border-dark-300">{t`Loại khấu trừ`}</th>
                  <th className="border-left border-b border-l border-light-200 px-3 py-2 dark:border-dark-300">{t`Loại`}</th>
                  <th className="border-left border-b border-l border-light-200 px-3 py-2 dark:border-dark-300">{t`Giá trị`}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-100 bg-white font-medium dark:divide-dark-300 dark:bg-dark-100">
                {[0, 1].map((index) => (
                  <tr
                    key={index}
                    className="group transition-colors hover:bg-light-50 dark:hover:bg-dark-200/40"
                  >
                    <td className="px-3 py-2">
                      <Controller
                        name={`deductions.${index}.reason`}
                        control={control}
                        render={({ field }) => (
                          <input type="hidden" {...field} />
                        )}
                      />
                      <span className="text-sm font-medium text-neutral-800 dark:text-dark-900">
                        {index === 0
                          ? t`Trễ hạn (hoàn thành sau deadline)`
                          : t`Dời deadline`}
                      </span>
                    </td>
                    <td className="w-[120px] border-l border-light-100 p-1 dark:border-dark-300">
                      <Controller
                        name={`deductions.${index}.unitType`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onChange={field.onChange}
                            disabled={effectivelyReadOnly}
                            options={[
                              { value: "percent", label: "%" },
                              { value: "vnd", label: "VND" },
                            ]}
                            className="w-full"
                          />
                        )}
                      />
                    </td>
                    <td className="w-[120px] border-l border-light-100 p-1 dark:border-dark-300">
                      <Controller
                        name={`deductions.${index}.value`}
                        control={control}
                        render={({ field }) => (
                          <motion.div
                            animate={
                              errors.deductions?.[index]?.value
                                ? { x: [-1, 1, -1, 1, 0] }
                                : {}
                            }
                            transition={{ duration: 0.4 }}
                            className="relative flex h-full items-center p-1"
                          >
                            <input
                              type="text"
                              disabled={effectivelyReadOnly}
                              value={formatNumber(field.value)}
                              onChange={(e) =>
                                field.onChange(parseNumber(e.target.value))
                              }
                              placeholder="0"
                              className={`w-full rounded-lg border px-3 py-2 text-sm font-bold outline-none transition-all dark:text-dark-1000 ${
                                errors.deductions?.[index]?.value
                                  ? "border-rose-500 bg-rose-100/30 text-rose-700 focus:ring-4 focus:ring-rose-500/10"
                                  : "border-transparent bg-transparent focus:border-light-200 focus:bg-light-50 dark:focus:bg-dark-200"
                              }`}
                            />
                          </motion.div>
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {!effectivelyReadOnly && (
          <div className="flex flex-col gap-2 border-t border-light-200 pt-4 dark:border-dark-300/50">
            {!isTaskMasterTemplate && rewardSubmitPrereqError && (
              <p className="text-right text-[11px] font-medium text-amber-800 dark:text-amber-200/90">
                {rewardSubmitPrereqError}
              </p>
            )}
            <div className="flex justify-end gap-3">
              {(approvalStatus === "draft" ||
                approvalStatus === "rejected") && (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  disabled={isMutating}
                  onClick={async () => {
                    try {
                      const data = getValues();
                      const result = await upsertMutation.mutateAsync(
                        buildUpsertPayload(data, "draft"),
                      );
                      showPopup({
                        header: t`Thành công`,
                        message: t`Đã lưu bản nháp`,
                        icon: "success",
                      });
                      await refreshRewardState({ configId: result.configId });
                    } catch (err: any) {
                      showPopup({
                        header: t`Lỗi`,
                        message: err.message,
                        icon: "error",
                      });
                    }
                  }}
                  className="rounded-xl border border-light-200 bg-white px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-neutral-600 transition-all hover:bg-light-50 disabled:opacity-50 dark:border-dark-300 dark:bg-dark-100 dark:text-dark-700"
                >
                  {isTaskMasterTemplate ? t`Lưu mẫu thưởng` : t`Lưu nháp`}
                </motion.button>
              )}

              {!isTaskMasterTemplate && (
                <motion.button
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isMutating || Boolean(rewardSubmitPrereqError)}
                  title={rewardSubmitPrereqError ?? undefined}
                  className="rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 focus:outline-none focus:ring-[3px] focus:ring-emerald-500/30 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {isMutating ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : approvalStatus === "rejected" ? (
                    t`Lưu & Gửi lại`
                  ) : (
                    t`Lưu & Gửi duyệt`
                  )}
                </motion.button>
              )}
            </div>
          </div>
        )}
      </form>
    </motion.div>
  );
}
