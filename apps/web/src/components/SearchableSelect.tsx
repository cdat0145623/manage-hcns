import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Transition,
} from "@headlessui/react";
import { t } from "@lingui/core/macro";
import { Fragment, useMemo, useState } from "react";
import { HiCheck, HiChevronUpDown } from "react-icons/hi2";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noOptionsMessage?: string;
}

export default function SearchableSelect({
  value,
  onChange,
  options,
  disabled,
  className = "",
  buttonClassName = "",
  placeholder = t`Select an option`,
  searchPlaceholder = t`Search...`,
  noOptionsMessage = t`No options found`,
}: SearchableSelectProps) {
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value) ?? null;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return options;

    return options.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery),
    );
  }, [options, query]);

  return (
    <Combobox
      value={selected}
      onChange={(option: Option | null) => {
        if (option) onChange(option.value);
      }}
      onClose={() => setQuery("")}
      disabled={disabled}
    >
      <div className={`relative ${className}`}>
        <div className="relative">
          <ComboboxInput
            className={`relative w-full cursor-pointer rounded-xl border border-light-200 bg-white py-2.5 pl-4 pr-10 text-left text-sm font-medium outline-none transition-all placeholder:text-neutral-400 hover:border-emerald-500/50 focus:border-emerald-500 focus:ring-[3px] focus:ring-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-300/50 dark:bg-dark-200 dark:text-white dark:placeholder:text-dark-600 dark:focus:border-emerald-500/50 ${buttonClassName}`}
            displayValue={(option: Option | null) => option?.label ?? ""}
            onFocus={() => setQuery("")}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={selected ? searchPlaceholder : placeholder}
            aria-label={placeholder}
          />
          <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2 focus:outline-none">
            <HiChevronUpDown
              className="h-5 w-5 text-neutral-400"
              aria-hidden="true"
            />
          </ComboboxButton>
        </div>

        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <ComboboxOptions
            anchor="bottom start"
            className="z-[9999] w-[var(--input-width)] min-w-[180px] overflow-hidden rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.12)] [--anchor-gap:4px] focus:outline-none dark:border-dark-400 dark:bg-dark-100"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <ComboboxOption
                  key={option.value}
                  value={option}
                  className="group relative cursor-pointer select-none rounded-xl py-2.5 pl-10 pr-4 text-sm text-neutral-700 transition-all data-[focus]:bg-emerald-500/10 data-[focus]:text-emerald-600 dark:text-neutral-300 dark:data-[focus]:bg-emerald-500/20 dark:data-[focus]:text-emerald-400"
                >
                  {({ selected: isSelected }) => (
                    <>
                      <span
                        className={`block truncate ${isSelected ? "font-bold" : "font-semibold"}`}
                      >
                        {option.label}
                      </span>
                      {isSelected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-emerald-500">
                          <HiCheck
                            className="h-4 w-4 stroke-[3]"
                            aria-hidden="true"
                          />
                        </span>
                      )}
                    </>
                  )}
                </ComboboxOption>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-neutral-500 dark:text-dark-600">
                {noOptionsMessage}
              </div>
            )}
          </ComboboxOptions>
        </Transition>
      </div>
    </Combobox>
  );
}
