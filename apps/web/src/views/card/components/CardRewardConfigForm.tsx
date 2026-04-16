import { t } from "@lingui/core/macro";
import { AnimatePresence, motion } from "framer-motion";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { HiPlus, HiTrash } from "react-icons/hi2";

import Select from "~/components/Select";

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
}

export default function CardRewardConfigForm({
  cardPublicId,
  isReadOnly = false,
}: CardRewardConfigFormProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RewardConfigFormValues>({
    defaultValues: {
      rewardType: "project",
      bonusAmount: 0,
      currency: "VND",
      deductions: [],
    },
  });

  const rewardType = watch("rewardType");
  const isProject = rewardType === "project";

  const { fields, append, remove } = useFieldArray({
    control,
    name: "deductions",
  });

  const onSubmit = (data: RewardConfigFormValues) => {
    // UI Only implementation
    console.log("Reward Config Data:", data);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="shrink-0 space-y-3"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-900 dark:text-dark-1000">
        {t`Cấu hình thưởng / Khấu trừ`}
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-7 rounded-2xl border border-light-200 bg-white/70 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md transition-all dark:border-dark-300 dark:bg-dark-100/70"
      >
        {/* Loại cấu hình */}
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

        {/* Số tiền thưởng */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-dark-600">
              {t`Số tiền thưởng`}{" "}
              <span className="text-sm leading-none text-red-500">*</span>
            </label>
            {errors.bonusAmount && (
              <span className="text-[10px] font-bold text-red-500">{t`Bắt buộc nhập > 0`}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              disabled={isReadOnly || !isProject}
              {...register("bonusAmount", {
                valueAsNumber: true,
                required: isProject,
                min: isProject ? 0.01 : 0,
              })}
              className={`flex-1 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium outline-none transition-all focus:ring-[3px] dark:bg-dark-200 dark:text-white ${
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
                  className="w-32"
                />
              )}
            />
          </div>
        </div>

        {/* Danh sách Khấu trừ */}
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
                onClick={() => append({ reason: "", unitType: "vnd", value: 0 })}
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
                          <input
                            type="number"
                            disabled={isReadOnly}
                            {...register(`deductions.${index}.value` as const, {
                              valueAsNumber: true,
                            })}
                            placeholder="0"
                            className="w-full rounded border border-transparent bg-transparent px-3 py-2 text-sm outline-none transition-colors focus:border-light-200 focus:bg-light-50 dark:text-dark-1000 dark:focus:border-dark-300 dark:focus:bg-dark-200"
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
          <div className="flex justify-end border-t border-light-200 pt-4 dark:border-dark-300/50">
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              className="rounded-xl bg-emerald-500 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-emerald-500/20 transition-all hover:bg-emerald-600 focus:outline-none focus:ring-[3px] focus:ring-emerald-500/30 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {t`Lưu cấu hình`}
            </motion.button>
          </div>
        )}
      </form>
    </motion.div>
  );
}
