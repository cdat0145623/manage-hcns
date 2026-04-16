import { Listbox, Transition, Portal } from "@headlessui/react";
import { Fragment } from "react";
import { HiChevronUpDown, HiCheck } from "react-icons/hi2";
import { motion } from "framer-motion";

interface Option {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  className?: string;
}

export default function Select({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: SelectProps) {
  const selected = options.find((opt) => opt.value === value) || options[0];

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className={`relative ${className}`}>
        <Listbox.Button className="relative w-full cursor-pointer rounded-xl border border-light-200 bg-white py-2.5 pl-4 pr-10 text-left text-sm font-medium outline-none transition-all hover:border-emerald-500/50 focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-500/10 dark:border-dark-300/50 dark:bg-dark-200 dark:text-white dark:focus:border-emerald-500/50">
          <span className="block truncate">{selected?.label}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <HiChevronUpDown
              className="h-5 w-5 text-neutral-400"
              aria-hidden="true"
            />
          </span>
        </Listbox.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Listbox.Options
            anchor="bottom start"
            className="z-[9999] w-[var(--button-width)] min-w-[120px] overflow-hidden rounded-2xl border border-white/40 bg-white/80 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] backdrop-blur-xl focus:outline-none dark:border-dark-400/40 dark:bg-dark-100 [--anchor-gap:4px]"
          >
            {options.map((option) => (
              <Listbox.Option
                key={option.value}
                className={({ active }) =>
                  `relative cursor-pointer select-none rounded-xl py-2.5 pl-10 pr-4 transition-all ${
                    active
                      ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "text-neutral-700 dark:text-neutral-300"
                  }`
                }
                value={option.value}
              >
                {({ selected }) => (
                  <>
                    <span
                      className={`block truncate text-sm ${
                        selected ? "font-bold" : "font-semibold"
                      }`}
                    >
                      {option.label}
                    </span>
                    {selected ? (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-emerald-500">
                        <HiCheck
                          className="h-4 w-4 stroke-[3]"
                          aria-hidden="true"
                        />
                      </span>
                    ) : null}
                  </>
                )}
              </Listbox.Option>
            ))}
          </Listbox.Options>
        </Transition>
      </div>
    </Listbox>
  );
}
