import type { ReactNode } from "react";
import { HiXMark } from "react-icons/hi2";

interface CardCreationModalLayoutProps {
  children: ReactNode;
  footer: ReactNode;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
}

export function CardCreationModalLayout({
  children,
  footer,
  title,
  closeLabel,
  onClose,
}: CardCreationModalLayoutProps) {
  return (
    <>
      <div className="px-5 pt-5">
        <div className="flex w-full items-center justify-between pb-5">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-dark-1000">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            className="rounded p-1 hover:bg-light-200 focus:outline-none dark:hover:bg-dark-300"
            onClick={onClose}
          >
            <HiXMark size={18} className="text-light-900 dark:text-dark-900" />
          </button>
        </div>
        {children}
      </div>
      <div className="mt-5 flex items-center justify-end border-t border-light-600 px-5 pb-5 pt-5 dark:border-dark-600">
        {footer}
      </div>
    </>
  );
}
