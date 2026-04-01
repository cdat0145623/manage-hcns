import { motion } from "framer-motion";
import Modal from "../modal";

interface SuccessModalProps {
  isVisible: boolean;
  onClose: () => void;
  title?: string;
  message?: string;
}

export function SuccessModal({
  isVisible,
  onClose,
  title = "Created Successfully!",
  message = "Your event has been added to the calendar.",
}: SuccessModalProps) {
  return (
    <Modal isVisible={isVisible} centered modalSize="md">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative overflow-hidden rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-dark-100"
      >
        {/* Background Decorative Gradient */}
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/5" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/5" />

        <div className="relative z-10 flex flex-col items-center">
          {/* Animated Checkmark Circle */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              delay: 0.1,
            }}
            className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30"
          >
            <motion.svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={3}
            >
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </motion.svg>
          </motion.div>

          <h3 className="mb-2 text-2xl font-black tracking-tight text-neutral-900 dark:text-white">
            {title}
          </h3>
          <p className="mb-8 max-w-[240px] text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {message}
          </p>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="min-w-[160px] rounded-xl bg-neutral-900 px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100"
          >
            Done
          </motion.button>
        </div>
      </motion.div>
    </Modal>
  );
}
