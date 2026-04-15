import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { HiChevronDown, HiCheck  } from "react-icons/hi2";
import { Fragment } from "react";
import { api } from "~/utils/api";

interface PositionSelectProps {
  value: string;
  onChange: (role: string) => void;
  disabled?: boolean;
  className?: string;
}

export function PositionSelect({ value, onChange, disabled, className }: PositionSelectProps) {
    const {data: positions} = api.position.all.useQuery();
    const selected = positions?.find((r) => r.publicId === value);

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className || "w-full"}`}>
        {/* Trigger button */}
        <ListboxButton className="flex w-full items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition hover:border-black/20 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/10">
          <span className="flex-1 text-left">{selected?.name}</span>
          <HiChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400 transition duration-200 ui-open:rotate-180 dark:text-white/40" />
        </ListboxButton>

        {/* Dropdown */}
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="opacity-0 scale-95 translate-y-1"
          enterTo="opacity-100 scale-100 translate-y-0"
          leave="transition ease-in duration-75"
          leaveFrom="opacity-100 scale-100 translate-y-0"
          leaveTo="opacity-0 scale-95 translate-y-1"
        >
          <ListboxOptions
            anchor={{ to: "bottom start", gap: 6 }}
            className="z-50 w-[var(--button-width)] overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg outline-none dark:border-white/10 dark:bg-neutral-900 dark:shadow-black/40 [--anchor-max-height:200px]"
          >            
            {positions?.map((position, i) => (
              <Fragment key={position.publicId}>
                <ListboxOption
                  value={position.publicId}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ui-active:bg-gray-50 dark:ui-active:bg-white/5"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {position.name}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-white/40">
                      {position.description}
                    </p>
                  </div>

                  {/* Check */}
                  <HiCheck className="h-3.5 w-3.5 shrink-0 text-gray-700 opacity-0 ui-selected:opacity-100 dark:text-white" />
                </ListboxOption>
              </Fragment>
            ))}
          </ListboxOptions>
        </Transition>
      </div>
    </Listbox>
  );
}