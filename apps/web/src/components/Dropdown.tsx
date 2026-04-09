import { Menu, Transition, Portal } from "@headlessui/react";
import { Fragment } from "react";

export default function Dropdown({
  items,
  children,
  disabled,
}: {
  items: { label: string; action?: () => void; icon?: React.ReactNode; disabled?: boolean }[];
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Menu as="div" className="relative inline-block text-left">
      <div>
        <Menu.Button
          disabled={disabled}
          className="flex h-7 w-7 items-center justify-center rounded-[5px] hover:bg-light-200 focus:outline-none dark:hover:bg-dark-200"
        >
          {children}
        </Menu.Button>
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
        <div className="relative z-[999]">
          <Menu.Items className="absolute right-0 mt-3 w-64 origin-top-right rounded-[20px] border-none !bg-white p-2 !opacity-100 shadow-[0_20px_50px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.05)] focus:outline-none dark:!bg-dark-200">
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <Menu.Item key={item.label} disabled={item.disabled}>
                  <button
                    onClick={item.action}
                    disabled={item.disabled ?? !item.action}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold text-neutral-800 transition-colors hover:bg-light-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-dark-1000 dark:hover:bg-dark-300"
                  >
                    {item.icon && <span className="flex shrink-0 items-center justify-center text-light-600 dark:text-dark-600">{item.icon}</span>}
                    <span>{item.label}</span>
                  </button>
                </Menu.Item>
              ))}
            </div>
          </Menu.Items>
        </div>
      </Transition>
    </Menu>
  );
}
