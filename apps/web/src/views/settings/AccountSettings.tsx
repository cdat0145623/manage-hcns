import { t } from "@lingui/core/macro";
import { env } from "next-runtime-env";

import Button from "~/components/Button";
import FeedbackModal from "~/components/FeedbackModal";
import { FontSizeSelector } from "~/components/FontSizeSelector";
import { LanguageSelector } from "~/components/LanguageSelector";
import Modal from "~/components/modal";
import { NewWorkspaceForm } from "~/components/NewWorkspaceForm";
import { PageHead } from "~/components/PageHead";
import { useModal } from "~/providers/modal";
import { api } from "~/utils/api";
import Avatar from "./components/Avatar";
import { ChangePasswordFormConfirmation } from "./components/ChangePasswordConfirmation";
import { DeleteAccountConfirmation } from "./components/DeleteAccountConfirmation";
import UpdateDisplayNameForm from "./components/UpdateDisplayNameForm";

export default function AccountSettings() {
  const { modalContentType, openModal, isOpen } = useModal();
  const isCredentialsEnabled =
    env("NEXT_PUBLIC_ALLOW_CREDENTIALS")?.toLowerCase() === "true";
  const { data } = api.user.getUser.useQuery();

  return (
    <>
      <PageHead title={t`Settings | Account`} />

      <div className="mb-8 border-t border-light-300 dark:border-dark-300">
        <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
          {t`Ảnh đại diện`}
        </h2>
        <Avatar userId={data?.id} userImage={data?.image} />

        <div className="mb-4">
          <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Tên hiển thị`}
          </h2>
          <UpdateDisplayNameForm displayName={data?.name ?? ""} />
        </div>

        <div className="mb-4">
          <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Email`}
          </h2>
          <p className="text-sm text-neutral-700 dark:text-dark-900">{data?.email}</p>
        </div>

        <div className="mb-8 border-t border-light-300 dark:border-dark-300">
          <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Ngôn ngữ`}
          </h2>
          <p className="mb-8 text-sm text-neutral-500 dark:text-dark-900">
            {t`Thay đổi ngôn ngữ`}
          </p>
          <LanguageSelector />
        </div>

        <div className="mb-8 border-t border-light-300 dark:border-dark-300">
          <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Kích thước phông chữ`}
          </h2>
          <p className="mb-8 text-sm text-neutral-500 dark:text-dark-900">
            {t`Thay đổi kích thước phông chữ`}
          </p>
          <FontSizeSelector />
        </div>

        <div className="mb-8 border-t border-light-300 dark:border-dark-300">
          <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
            {t`Xóa tài khoản`}
          </h2>
          <p className="mb-8 text-sm text-neutral-500 dark:text-dark-900">
            {t`Khi bạn xóa tài khoản, không có cách nào để khôi phục. Hành động này không thể hoàn tác.`}
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => openModal("DELETE_ACCOUNT")}
            >
              {t`Xóa tài khoản`}
            </Button>
          </div>
        </div>

        {isCredentialsEnabled && (
          <div className="mb-8 border-t border-light-300 dark:border-dark-300">
            <h2 className="mb-4 mt-8 text-[14px] font-bold text-neutral-900 dark:text-dark-1000">
              {t`Thay đổi mật khẩu`}
            </h2>
            <p className="mb-8 text-sm text-neutral-500 dark:text-dark-900">
              {t`Bạn sắp thay đổi mật khẩu.`}
            </p>
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={() => openModal("CHANGE_PASSWORD")}
              >
                {t`Thay đổi mật khẩu`}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Account-specific modals */}
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "DELETE_ACCOUNT"}
      >
        <DeleteAccountConfirmation />
      </Modal>
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "CHANGE_PASSWORD"}
      >
        <ChangePasswordFormConfirmation />
      </Modal>

      {/* Global modals */}
      <Modal
        modalSize="md"
        isVisible={isOpen && modalContentType === "NEW_FEEDBACK"}
      >
        <FeedbackModal />
      </Modal>
      <Modal
        modalSize="sm"
        isVisible={isOpen && modalContentType === "NEW_WORKSPACE"}
      >
        <NewWorkspaceForm />
      </Modal>
    </>
  );
}
