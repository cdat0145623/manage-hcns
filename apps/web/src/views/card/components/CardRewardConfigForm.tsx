import { zodResolver } from "@hookform/resolvers/zod";
import { t } from "@lingui/macro";
import { AnimatePresence, motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import {
  HiCheckCircle,
  HiExclamationCircle,
  HiPlus,
  HiTrash,
} from "react-icons/hi2";
import { z } from "zod";

import type { RewardStatus } from "./CardRewardSummaryCard";
import Select from "~/components/Select";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";
import { CardRewardSummaryCard } from "./CardRewardSummaryCard";

const DEFAULT_USD_TO_VND = 25400;

interface RewardDeduction {
  reason: string;
  unitType: "percent" | "vnd";
  value: number;
}

interface RewardConfigFormValues {
  rewardType: "project" | "responsibility";
  bonusAmount: number;
  currency: "VND" | "USD";
  deductions: RewardDeduction[];
}

interface CardRewardConfigFormProps {
  cardPublicId: string;
  isReadOnly?: boolean;
  card?: any; // Passing full card data from parent
}

export default function CardRewardConfigForm({
  cardPublicId,
  isReadOnly = false,
  card,
}: CardRewardConfigFormProps) {
  const [viewMode, setViewMode] = useState<"edit" | "summary">("edit");
  const { showPopup } = usePopup();
  const utils = api.useUtils();

  // ───────────────────────────────────────────────────────────────────────────
  // Queries & Mutations
  // ───────────────────────────────────────────────────────────────────────────
  const { data: remoteData, isLoading: isQueryLoading } =
    api.reward.getByCardId.useQuery(
      { cardPublicId },
      {
        enabled: !!cardPublicId,
        refetchOnWindowFocus: false,
      },
    );

  const upsertMutation = api.reward.upsert.useMutation();
  const submitMutation = api.reward.submit.useMutation();
  const withdrawMutation = api.reward.withdraw.useMutation();
  const approveMutation = api.reward.approve.useMutation();
  const rejectMutation = api.reward.reject.useMutation();

  const isMutating =
    upsertMutation.isPending ||
    submitMutation.isPending ||
    withdrawMutation.isPending ||
    approveMutation.isPending ||
    rejectMutation.isPending;

  const [exRate, setExRate] = React.useState(DEFAULT_USD_TO_VND);
  const [isRateLoading, setIsRateLoading] = React.useState(false);

  // Fetch real-time exchange rate
  useEffect(() => {
    const fetchRate = async () => {
      setIsRateLoading(true);
      try {
        const res = await fetch(
          "https://api.frankfurter.dev/latest?from=USD&to=VND",
        );
        const data = await res.json();
        if (data?.rates?.VND) {
          setExRate(data.rates.VND);
        }
      } catch (err) {
        console.error("Failed to fetch exchange rate:", err);
      } finally {
        setIsRateLoading(false);
      }
    };
    fetchRate();
  }, []);

  // Define dynamic validation schema based on live rate
  const dynamicSchema = React.useMemo(() => {
    const deductionItemSchema = z
      .object({
        id: z.number().optional().nullable(),
        reason: z
          .string()
          .min(1, t`Lý do là bắt buộc`)
          .max(500),
        unitType: z.enum(["percent", "vnd"]),
        value: z.number().min(0.01, t`Giá trị phải lớn hơn 0`),
        displayOrder: z.number().int().min(0).default(0),
      })
      .refine(
        (data) => {
          if (data.unitType === "percent") {
            return data.value < 100;
          }
          return true;
        },
        {
          message: t`Phần trăm phải nhỏ hơn 100`,
          path: ["value"],
        },
      );

    return z
      .object({
        rewardType: z.enum(["project", "responsibility"]),
        bonusAmount: z.number().optional().nullable(),
        currency: z.string().length(3).default("VND"),
        deductions: z.array(deductionItemSchema).default([]),
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
          const bonusInVnd =
            data.currency === "USD"
              ? data.bonusAmount * exRate
              : data.bonusAmount;

          data.deductions.forEach((item, index) => {
            if (item.unitType === "vnd") {
              if (item.value > bonusInVnd) {
                const displayBonus = data.bonusAmount ?? 0;
                const displayVnd = Math.round(bonusInVnd).toLocaleString();
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message:
                    data.currency === "USD"
                      ? t`Khấu trừ vượt quá ${displayBonus}$ (~${displayVnd}đ)`
                      : t`Khấu trừ không được lớn hơn tiền thưởng`,
                  path: ["deductions", index, "value"],
                });
              }
            }
          });
        }
      });
  }, [exRate]);

  const {
    register,
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
      bonusAmount: 0,
      currency: "VND",
      deductions: [],
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
        deductions: remoteData.deductions.map((d) => ({
          id: d.id,
          reason: d.reason,
          unitType: d.unitType as any,
          value: parseFloat(d.value),
          displayOrder: d.displayOrder,
        })),
      });

      // If already has status beyond draft, default to summary view
      if (remoteData.approvalStatus !== "draft") {
        setViewMode("summary");
      }
    }
  }, [remoteData, reset]);

  const approvalStatus: RewardStatus =
    (remoteData?.approvalStatus as RewardStatus) || "draft";

  const rewardType = watch("rewardType");
  const isProject = rewardType === "project";

  const { fields, append, remove } = useFieldArray({
    control,
    name: "deductions",
  });

  const formatNumber = (val: number | string) => {
    if (!val && val !== 0) return "";
    const num =
      typeof val === "string" ? val.replace(/\D/g, "") : val.toString();
    if (!num) return "";
    return Number(num).toLocaleString("vi-VN");
  };

  const parseNumber = (val: string) => {
    return Number(val.replace(/\D/g, "")) || 0;
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
      await utils.reward.getByCardId.invalidate({ cardPublicId });
      setViewMode("edit");
    } catch (err: any) {
      showPopup({
        header: t`Lỗi`,
        message: err.message || t`Lỗi khi rút lại yêu cầu`,
        icon: "error",
      });
    }
  };

  const onSubmit = async (data: RewardConfigFormValues) => {
    try {
      const payload = {
        cardPublicId,
        rewardType: data.rewardType,
        bonusAmount:
          data.rewardType === "project" ? data.bonusAmount?.toString() : null,
        currency: data.currency,
        deductions: data.deductions.map((d) => ({
          ...d,
          value: d.value.toString(),
        })),
      };

      const result = await upsertMutation.mutateAsync(payload);
      showPopup({
        header: t`Thành công`,
        message: t`Đã lưu cấu hình thưởng`,
        icon: "success",
      });
      await utils.reward.getByCardId.invalidate({ cardPublicId });

      // Only call submit if it's currently draft or rejected
      // If it's already waiting_approval, just updating is enough
      if (approvalStatus === "draft" || approvalStatus === "rejected") {
        await submitMutation.mutateAsync({ configId: result.configId });
        showPopup({
          header: t`Thành công`,
          message: t`Đã gửi yêu cầu phê duyệt`,
          icon: "success",
        });
        await utils.reward.getByCardId.invalidate({ cardPublicId });
      }

      setViewMode("summary");
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
          startDate: rawSnapshot.snappedStartDate ?? null,
          dueDate: rawSnapshot.snappedDueDate ?? null,
          assigneeName:
            card?.members?.[0]?.name || card?.members?.[0]?.user?.name || "",
          assigneeImage:
            card?.members?.[0]?.image ||
            card?.members?.[0]?.user?.image ||
            null,
          bonusAmount: rawSnapshot.snappedBonusAmount ?? null,
          currency: rawSnapshot.snappedCurrency ?? "VND",
        }
      : null;

    // logs sẽ có khi backend join cardRewardLogs
    const rawLogs =
      (
        remoteData as {
          logs?: { detectedAt: Date | string; violationType: string }[];
        } | null
      )?.logs ?? [];
    const violationLogs = rawLogs.map((l) => ({
      date:
        typeof l.detectedAt === "string"
          ? l.detectedAt
          : l.detectedAt.toISOString(),
      reason: l.violationType,
      deductionValue: 0,
    }));

    return {
      ...values,
      approvalStatus,
      rejectedReason: remoteData?.rejectedReason ?? undefined,
      approvedBy: approvedByUser ? { name: approvedByUser.name } : undefined,
      approvedAt: remoteData?.approvedAt
        ? new Date(remoteData.approvedAt)
        : undefined,
      snapshot,
      violationLogs: violationLogs.length > 0 ? violationLogs : undefined,
      deductions: values.deductions.map((d) => ({ ...d })),
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
    return (
      <CardRewardSummaryCard
        data={getSummaryData()}
        card={{
          cardTitle: card?.title || "Card Title",
          startDate: card?.startDate,
          dueDate: card?.dueDate,
          assignee: card?.members?.[0]
            ? {
                name: card.members[0].name || card.members[0].user?.name,
                image: card.members[0].image || card.members[0].user?.image,
                email: card.members[0].email || card.members[0].user?.email,
              }
            : null,
        }}
        onEdit={() => setViewMode("edit")}
        onWithdraw={handleWithdraw}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="shrink-0 space-y-3"
    >
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
          {t`Cấu hình thưởng / Khấu trừ`}
        </p>

        <div className="flex items-center gap-3">
          {/* Helper for demo: simulate admin approve */}
          <button
            type="button"
            disabled={isMutating}
            onClick={async () => {
              if (!remoteData?.id) return;
              try {
                await approveMutation.mutateAsync({ configId: remoteData.id });
                showPopup({
                  header: t`Thành công`,
                  message: t`Đã duyệt cấu hình thưởng`,
                  icon: "success",
                });
                await utils.reward.getByCardId.invalidate({ cardPublicId });
                setViewMode("summary");
              } catch (err: any) {
                showPopup({
                  header: t`Lỗi`,
                  message: err.message,
                  icon: "error",
                });
              }
            }}
            className="text-[9px] font-bold text-emerald-500 hover:underline disabled:opacity-50"
          >
            {t`Demo Approve`}
          </button>

          <span className="h-2 w-[1px] bg-neutral-200 dark:bg-dark-300" />
          <button
            type="button"
            disabled={isMutating}
            onClick={async () => {
              if (!remoteData?.id) return;
              try {
                await rejectMutation.mutateAsync({
                  configId: remoteData.id,
                  rejectedReason: t`Số tiền thưởng vượt ngân sách Q2.`,
                });
                showPopup({
                  header: t`Thành công`,
                  message: t`Đã từ chối cấu hình thưởng`,
                  icon: "success",
                });
                await utils.reward.getByCardId.invalidate({ cardPublicId });
                setViewMode("summary");
              } catch (err: any) {
                showPopup({
                  header: t`Lỗi`,
                  message: err.message,
                  icon: "error",
                });
              }
            }}
            className="text-[9px] font-bold text-rose-500 hover:underline disabled:opacity-50"
          >
            {t`Demo Reject`}
          </button>
        </div>
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
              <div className="mt-0.5 flex items-center gap-2 text-[10px] font-bold text-neutral-500">
                <span>{t`Bản cấu hình đã chốt`}: 10.000.000 VND</span>
                {card?.dueDate &&
                  new Date(card.dueDate).getTime() >
                    new Date("2026-04-16").getTime() && (
                    <span className="flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 font-black text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" />
                      {t`Lệch Snapshot (+${Math.round(
                        (new Date(card.dueDate).getTime() -
                          new Date("2026-04-16").getTime()) /
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
            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-emerald-600 shadow-sm transition-all hover:bg-emerald-50 dark:border-emerald-900/30 dark:bg-dark-100 dark:hover:bg-dark-200"
          >
            {t`Xem bản APPROVED`}
          </button>
        </motion.div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
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
                disabled={isReadOnly}
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
                    disabled={isReadOnly || !isProject}
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
                    disabled={isReadOnly}
                    options={[
                      { value: "VND", label: "VND" },
                      { value: "USD", label: "USD" },
                    ]}
                    className="w-full"
                    buttonClassName="font-bold"
                  />
                )}
              />
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
              {t`Danh sách Khấu trừ`}
            </label>
            {!isReadOnly && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() =>
                  append({ reason: "", unitType: "vnd", value: 0 })
                }
                className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
              >
                <HiPlus className="h-3.5 w-3.5" />
                {t`THÊM`}
              </motion.button>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-light-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.02)] transition-all dark:border-dark-300 dark:bg-dark-100">
            <table className="w-full text-left text-sm text-neutral-600 dark:text-dark-700">
              <thead className="bg-light-100 text-xs font-semibold text-neutral-500 dark:bg-dark-200 dark:text-dark-600">
                <tr>
                  <th className="border-b border-light-200 px-3 py-2 dark:border-dark-300">{t`Lý do`}</th>
                  <th className="border-left border-b border-l border-light-200 px-3 py-2 dark:border-dark-300">{t`Loại`}</th>
                  <th className="border-left border-b border-l border-light-200 px-3 py-2 dark:border-dark-300">{t`Giá trị`}</th>
                  <th className="border-left w-8 border-b border-l border-light-200 px-2 py-2 dark:border-dark-300"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-100 bg-white font-medium dark:divide-dark-300 dark:bg-dark-100">
                <AnimatePresence mode="popLayout">
                  {fields.length === 0 ? (
                    <motion.tr
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <td
                        colSpan={4}
                        className="px-4 py-8 text-center text-xs italic text-neutral-400 dark:text-dark-600"
                      >
                        {t`(Chưa có mục)`}
                      </td>
                    </motion.tr>
                  ) : (
                    fields.map((field, index) => (
                      <motion.tr
                        key={field.id}
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="group transition-colors hover:bg-light-50 dark:hover:bg-dark-200/40"
                      >
                        <td className="p-1">
                          <input
                            disabled={isReadOnly}
                            {...register(`deductions.${index}.reason` as const)}
                            placeholder={t`Nhập lý do khấu trừ...`}
                            className="w-full rounded border border-transparent bg-transparent px-3 py-2 text-sm outline-none transition-all placeholder:text-light-400 focus:border-light-200 focus:bg-light-50 dark:text-dark-1000 dark:focus:border-dark-300 dark:focus:bg-dark-200"
                          />
                        </td>
                        <td className="w-[120px] border-l border-light-100 p-1 dark:border-dark-300">
                          <Controller
                            name={`deductions.${index}.unitType`}
                            control={control}
                            render={({ field }) => (
                              <Select
                                value={field.value}
                                onChange={field.onChange}
                                disabled={isReadOnly}
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
                                  disabled={isReadOnly}
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
                        <td className="border-l border-light-100 p-1 text-center dark:border-dark-300">
                          {!isReadOnly && (
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              type="button"
                              onClick={() => remove(index)}
                              className="mx-auto flex h-7 w-7 items-center justify-center rounded-lg text-red-400 opacity-50 transition-all hover:bg-red-50 hover:text-red-500 hover:opacity-100 dark:hover:bg-red-500/10"
                            >
                              <HiTrash className="h-4 w-4" />
                            </motion.button>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>

        {!isReadOnly && (
          <div className="flex justify-end gap-3 border-t border-light-200 pt-4 dark:border-dark-300/50">
            {approvalStatus === "draft" && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                disabled={isMutating}
                onClick={async () => {
                  try {
                    const data = getValues();
                    const payload = {
                      cardPublicId,
                      rewardType: data.rewardType,
                      // Draft được phép chưa điền bonusAmount → gửi null nếu chưa có giá trị > 0
                      bonusAmount:
                        data.rewardType === "project" && data.bonusAmount && data.bonusAmount > 0
                          ? data.bonusAmount.toString()
                          : null,
                      currency: data.currency,
                      deductions: data.deductions.map((d) => ({
                        ...d,
                        value: d.value.toString(),
                      })),
                    };
                    await upsertMutation.mutateAsync(payload);
                    showPopup({
                      header: t`Thành công`,
                      message: t`Đã lưu bản nháp`,
                      icon: "success",
                    });
                    await utils.reward.getByCardId.invalidate({ cardPublicId });
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
                {t`Lưu nháp`}
              </motion.button>
            )}

            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isMutating}
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
          </div>
        )}
      </form>
    </motion.div>
  );
}
