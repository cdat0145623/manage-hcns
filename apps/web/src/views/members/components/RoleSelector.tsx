import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from "@headlessui/react";
import { HiChevronDown, HiCheck  } from "react-icons/hi2";
import { Fragment } from "react";
import { Role } from "@kan/shared";

interface RoleOption {
  value: Role;
  label: string;
  shortLabel: string;
  description: string;
  dotClass: string;
  iconClass: string;
  letter: string;
}

const ROLES: RoleOption[] = [
  {
    value: "ADMIN",
    label: "Administrator",
    shortLabel: "Admin",
    description: "Full system access",
    dotClass: "bg-[#7F77DD]",
    iconClass: "bg-[#EEEDFE] text-[#534AB7]",
    letter: "A",
  },
  {
    value: "NVKT_MANAGER",
    label: "Technical Manager",
    shortLabel: "NVKT",
    description: "Manage tech operations",
    dotClass: "bg-[#1D9E75]",
    iconClass: "bg-[#E1F5EE] text-[#0F6E56]",
    letter: "T",
  },
  {
    value: "NVKD_MANAGER",
    label: "Business Manager",
    shortLabel: "NVKD",
    description: "Manage business ops",
    dotClass: "bg-[#378ADD]",
    iconClass: "bg-[#E6F1FB] text-[#185FA5]",
    letter: "B",
  },
  {
    value: "NVVP",
    label: "Staff",
    shortLabel: "NVVP",
    description: "Standard access",
    dotClass: "bg-[#888780]",
    iconClass: "bg-[#F1EFE8] text-[#5F5E5A] dark:bg-white/10 dark:text-white/60",
    letter: "S",
  },
];

interface RoleSelectProps {
  value: Role;
  onChange: (role: Role) => void;
  disabled?: boolean;
}

export function RoleSelect({ value, onChange, disabled }: RoleSelectProps) {
  const selected = ROLES.find((r) => r.value === value) ?? ROLES[3];

  return (
    <Listbox value={value} onChange={onChange} disabled={disabled}>
      <div className="relative w-full">
        {/* Trigger button */}
        <ListboxButton className="flex w-48 items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition hover:border-black/20 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:border-white/20 dark:hover:bg-white/10">
          <span className={`h-2 w-2 shrink-0 rounded-full ${selected?.dotClass}`} />
          <span className="flex-1 text-left">{selected?.label}</span>
          <span className="text-xs font-normal text-gray-400 dark:text-white/40">
            {selected?.shortLabel}
          </span>
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
          <ListboxOptions className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-xl border border-black/10 bg-white p-1 shadow-lg outline-none dark:border-white/10 dark:bg-neutral-900 dark:shadow-black/40">
            {ROLES.map((role, i) => (
              <Fragment key={role.value}>
                {/* Divider before Staff */}
                {i === ROLES.length - 1 && (
                  <div className="my-1 h-px bg-black/5 dark:bg-white/5" />
                )}
                <ListboxOption
                  value={role.value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ui-active:bg-gray-50 dark:ui-active:bg-white/5"
                >
                  {/* Role icon */}
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${role.iconClass}`}
                  >
                    {role.letter}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white">
                      {role.label}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-white/40">
                      {role.description}
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