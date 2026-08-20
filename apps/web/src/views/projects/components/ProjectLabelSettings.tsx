import type { FormEvent } from "react";
import { t } from "@lingui/core/macro";
import { useEffect, useState } from "react";
import { HiOutlinePlusSmall, HiOutlineTrash } from "react-icons/hi2";

import { colours } from "@kan/shared/constants";

import type { RouterOutputs } from "~/utils/api";
import Button from "~/components/Button";
import Input from "~/components/Input";
import LabelIcon from "~/components/LabelIcon";
import Select from "~/components/Select";
import { usePopup } from "~/providers/popup";
import { api } from "~/utils/api";

type ProjectBoard = RouterOutputs["projectBoard"]["byId"];
type LabelField = ProjectBoard["labelFields"][number];

interface ProjectLabelSettingsProps {
  boardPublicId: string;
  fields: LabelField[];
  canEdit: boolean;
  onRefresh: () => Promise<void>;
}

const getErrorMessage = (error: { message?: string }) =>
  error.message ?? t`Vui lòng thử lại sau.`;

export default function ProjectLabelSettings({
  boardPublicId,
  fields,
  canEdit,
  onRefresh,
}: ProjectLabelSettingsProps) {
  const { showPopup } = usePopup();
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldMode, setNewFieldMode] = useState<"single" | "multiple">(
    "multiple",
  );
  const [fieldNames, setFieldNames] = useState<Record<string, string>>({});
  const [newOptionNames, setNewOptionNames] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    setFieldNames(
      Object.fromEntries(fields.map((field) => [field.publicId, field.name])),
    );
  }, [fields]);

  const handleError = (error: { message?: string }, header: string) =>
    showPopup({ header, message: getErrorMessage(error), icon: "error" });

  const createField = api.projectBoard.createLabelField.useMutation({
    onSuccess: async () => {
      setNewFieldName("");
      await onRefresh();
    },
    onError: (error) => handleError(error, t`Không thể tạo nhóm nhãn`),
  });
  const updateField = api.projectBoard.updateLabelField.useMutation({
    onSuccess: onRefresh,
    onError: (error) => handleError(error, t`Không thể cập nhật nhóm nhãn`),
  });
  const deleteField = api.projectBoard.deleteLabelField.useMutation({
    onSuccess: onRefresh,
    onError: (error) => handleError(error, t`Không thể xóa nhóm nhãn`),
  });
  const createOption = api.projectBoard.createLabelOption.useMutation({
    onSuccess: async (_, variables) => {
      setNewOptionNames((current) => ({
        ...current,
        [variables.fieldPublicId]: "",
      }));
      await onRefresh();
    },
    onError: (error) => handleError(error, t`Không thể tạo lựa chọn nhãn`),
  });
  const updateOption = api.projectBoard.updateLabelOption.useMutation({
    onSuccess: onRefresh,
    onError: (error) => handleError(error, t`Không thể cập nhật lựa chọn nhãn`),
  });
  const deleteOption = api.projectBoard.deleteLabelOption.useMutation({
    onSuccess: onRefresh,
    onError: (error) => handleError(error, t`Không thể xóa lựa chọn nhãn`),
  });

  const submitField = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newFieldName.trim();
    if (!canEdit || !name) return;
    createField.mutate({
      boardPublicId,
      name,
      selectionMode: newFieldMode,
    });
  };

  return (
    <section className="space-y-3 border-t border-light-200 pt-4 dark:border-dark-300">
      <div>
        <h3 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
          {t`Nhãn tùy chỉnh cho card`}
        </h3>
        <p className="mt-1 text-xs text-light-800 dark:text-dark-800">
          {t`Tạo tối đa 3 nhóm nhãn. Mỗi nhóm có thể chọn một hoặc nhiều lựa chọn.`}
        </p>
      </div>

      {fields.map((field) => {
        const fieldName = fieldNames[field.publicId] ?? field.name;
        const newOptionName = newOptionNames[field.publicId] ?? "";
        const nextColourCode =
          colours.find(
            ({ code }) =>
              !field.options.some((option) => option.colourCode === code),
          )?.code ?? colours[field.options.length % colours.length]?.code;
        return (
          <div
            key={field.publicId}
            className="rounded-xl border border-light-300 p-3 dark:border-dark-300"
          >
            <div className="flex items-start gap-2">
              <Input
                name={`label-field-${field.publicId}`}
                value={fieldName}
                onChange={(event) =>
                  setFieldNames((current) => ({
                    ...current,
                    [field.publicId]: event.target.value,
                  }))
                }
                onBlur={() => {
                  const name = fieldName.trim();
                  if (canEdit && name && name !== field.name) {
                    updateField.mutate({
                      boardPublicId,
                      fieldPublicId: field.publicId,
                      name,
                    });
                  }
                }}
                disabled={!canEdit || updateField.isPending}
                className="min-w-0 flex-1"
              />
              <Select
                value={field.selectionMode}
                onChange={(selectionMode) =>
                  updateField.mutate({
                    boardPublicId,
                    fieldPublicId: field.publicId,
                    selectionMode: selectionMode as "single" | "multiple",
                  })
                }
                options={[
                  { value: "single", label: t`Một lựa chọn` },
                  { value: "multiple", label: t`Nhiều lựa chọn` },
                ]}
                disabled={!canEdit || updateField.isPending}
                className="w-40"
                buttonClassName="!rounded-xl !px-3 !py-2.5"
              />
              {canEdit && (
                <button
                  type="button"
                  aria-label={t`Xóa nhóm nhãn`}
                  onClick={() => {
                    if (
                      window.confirm(
                        t`Xóa nhóm nhãn này và các lựa chọn bên trong?`,
                      )
                    ) {
                      deleteField.mutate({
                        boardPublicId,
                        fieldPublicId: field.publicId,
                      });
                    }
                  }}
                  className="rounded-xl p-2 text-red-600 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <HiOutlineTrash className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="mt-3 space-y-2">
              {field.options.map((option) => (
                <div key={option.publicId} className="flex items-center gap-2">
                  <LabelIcon colourCode={option.colourCode} />
                  <Input
                    name={`label-option-${option.publicId}`}
                    defaultValue={option.name}
                    onBlur={(event) => {
                      const name = event.target.value.trim();
                      if (canEdit && name && name !== option.name) {
                        updateOption.mutate({
                          boardPublicId,
                          optionPublicId: option.publicId,
                          name,
                        });
                      }
                    }}
                    disabled={!canEdit || updateOption.isPending}
                    className="min-w-0 flex-1 !py-2"
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    {colours.map((colour) => (
                      <button
                        key={colour.code}
                        type="button"
                        aria-label={`${t`Chọn màu`} ${colour.name}`}
                        aria-pressed={option.colourCode === colour.code}
                        title={colour.name}
                        onClick={() => {
                          if (canEdit && option.colourCode !== colour.code) {
                            updateOption.mutate({
                              boardPublicId,
                              optionPublicId: option.publicId,
                              colourCode: colour.code,
                            });
                          }
                        }}
                        disabled={!canEdit || updateOption.isPending}
                        className={`h-4 w-4 rounded-full transition-transform hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-light-900 focus-visible:ring-offset-1 dark:focus-visible:ring-dark-1000 dark:focus-visible:ring-offset-dark-200 ${option.colourCode === colour.code ? "ring-2 ring-light-1000 ring-offset-1 dark:ring-dark-1000" : ""}`}
                        style={{ backgroundColor: colour.code }}
                      />
                    ))}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={t`Xóa lựa chọn nhãn`}
                      onClick={() => {
                        if (window.confirm(t`Xóa lựa chọn nhãn này?`)) {
                          deleteOption.mutate({
                            boardPublicId,
                            optionPublicId: option.publicId,
                          });
                        }
                      }}
                      className="rounded-lg p-1.5 text-light-800 hover:bg-light-200 dark:text-dark-800 dark:hover:bg-dark-300"
                    >
                      <HiOutlineTrash className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = newOptionName.trim();
                  if (!canEdit || !name) return;
                  createOption.mutate({
                    boardPublicId,
                    fieldPublicId: field.publicId,
                    name,
                    colourCode: nextColourCode,
                  });
                }}
              >
                <Input
                  name={`new-label-option-${field.publicId}`}
                  value={newOptionName}
                  onChange={(event) =>
                    setNewOptionNames((current) => ({
                      ...current,
                      [field.publicId]: event.target.value,
                    }))
                  }
                  placeholder={t`Thêm lựa chọn…`}
                  disabled={!canEdit || createOption.isPending}
                  className="min-w-0 flex-1 !py-2"
                />
                <Button
                  type="submit"
                  size="sm"
                  variant="ghost"
                  iconOnly
                  iconLeft={<HiOutlinePlusSmall className="h-4 w-4" />}
                  aria-label={t`Thêm lựa chọn nhãn`}
                  disabled={!canEdit || createOption.isPending}
                />
              </form>
            </div>
          </div>
        );
      })}

      {fields.length < 3 && (
        <form
          onSubmit={submitField}
          className="rounded-xl border border-dashed border-light-300 p-3 dark:border-dark-300"
        >
          <div className="flex items-center gap-2">
            <Input
              name="new-label-field"
              value={newFieldName}
              onChange={(event) => setNewFieldName(event.target.value)}
              placeholder={t`Tên nhóm nhãn mới…`}
              disabled={!canEdit || createField.isPending}
              className="min-w-0 flex-1"
            />
            <Select
              value={newFieldMode}
              onChange={(value) =>
                setNewFieldMode(value as "single" | "multiple")
              }
              options={[
                { value: "single", label: t`Một lựa chọn` },
                { value: "multiple", label: t`Nhiều lựa chọn` },
              ]}
              disabled={!canEdit || createField.isPending}
              className="w-40"
              buttonClassName="!rounded-xl !px-3 !py-2.5"
            />
            <Button
              type="submit"
              size="sm"
              disabled={
                !canEdit || createField.isPending || !newFieldName.trim()
              }
              isLoading={createField.isPending}
            >
              {t`Thêm nhóm`}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
