import { t } from "@lingui/core/macro";
import React from "react";

interface SessionUnavailableProps {
  isRetrying: boolean;
  onRetry: () => void;
}

export function SessionUnavailableBanner({
  isRetrying,
  onRetry,
}: SessionUnavailableProps) {
  return (
    <div
      className="fixed left-1/2 top-3 z-[100] flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-lg shadow-amber-950/10"
      role="alert"
    >
      <p>
        <span className="font-semibold">{t`Mất kết nối tới máy chủ`}.</span>{" "}
        {t`Dữ liệu có thể chưa được cập nhật`}.
      </p>
      <button
        className="shrink-0 rounded-lg bg-amber-950 px-3 py-1.5 font-semibold text-white transition-opacity disabled:cursor-wait disabled:opacity-60"
        disabled={isRetrying}
        onClick={onRetry}
        type="button"
      >
        {isRetrying ? t`Đang thử lại…` : t`Thử lại`}
      </button>
    </div>
  );
}

export function AuthSessionUnavailableScreen({
  isRetrying,
  onRetry,
}: SessionUnavailableProps) {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#f8f7fc] px-6 text-[#25232d]">
      <div className="absolute left-6 top-6 flex items-center gap-2 text-sm font-semibold tracking-[-0.02em] text-[#3c3947]">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#6956d8] text-[11px] font-bold text-white">
          K
        </span>
        <span>
          kan<span className="text-[#6956d8]">.</span>
        </span>
      </div>

      <section
        className="w-full max-w-sm rounded-2xl border border-[#e8e5f0] bg-white px-7 py-8 text-center shadow-[0_20px_60px_rgba(57,48,91,0.10)]"
        role="alert"
      >
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#ebe8ff] text-lg font-bold text-[#6956d8]">
          K
        </div>
        <h1 className="text-lg font-semibold tracking-[-0.02em]">
          {t`Không thể kết nối tới máy chủ`}
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#6d6978]">
          {t`Vui lòng kiểm tra kết nối và thử lại sau ít phút.`}
        </p>
        <button
          className="mt-6 w-full rounded-xl bg-[#6956d8] px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          disabled={isRetrying}
          onClick={onRetry}
          type="button"
        >
          {isRetrying ? t`Đang thử lại…` : t`Thử lại`}
        </button>
      </section>
    </main>
  );
}
