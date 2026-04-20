import { useRouter } from "next/router";
import { t } from "@lingui/core/macro";
import { useEffect } from "react";

import { PageHead } from "~/components/PageHead";
import { api } from "~/utils/api";
import CardDetailsModalContent from "./components/CardDetailsModalContent";

export default function CardPage({ isTemplate }: { isTemplate?: boolean }) {
  const router = useRouter();
  const cardId = Array.isArray(router.query.cardId)
    ? router.query.cardId[0]
    : router.query.cardId;

  const {
    data: card,
    isLoading,
    error,
  } = api.card.byId.useQuery(
    { cardPublicId: cardId ?? "" },
    { enabled: !!cardId && cardId.length >= 12 },
  );

  const board = card?.list.board;
  const boardId = board?.publicId;

  // Redirect to 404 if card doesn't exist
  useEffect(() => {
    if (router.isReady && cardId && !isLoading) {
      if (error?.data?.code === "NOT_FOUND" || !card) {
        void router.replace("/404");
      }
    }
  }, [router, cardId, isLoading, error, card]);

  const handleClose = () => {
    if (boardId) {
      void router.push(
        isTemplate ? `/templates/${boardId}` : `/boards/${boardId}`,
      );
    } else {
      void router.push(isTemplate ? "/templates" : "/boards");
    }
  };

  const handleAfterCardDeleted = () => {
    if (boardId) {
      void router.replace(
        isTemplate ? `/templates/${boardId}` : `/boards/${boardId}`,
      );
    } else {
      void router.replace(isTemplate ? "/templates" : "/boards");
    }
  };

  if (!cardId) return null;

  return (
    <>
      <PageHead
        title={t`${card?.title ?? t`Card`} | ${board?.name ?? t`Board`}`}
      />
      <div className="flex h-full flex-1 flex-col overflow-hidden bg-light-100 dark:bg-dark-50">
        <div className="mx-auto flex h-full flex-col bg-white shadow-xl dark:bg-dark-100">
          <CardDetailsModalContent
            cardId={cardId}
            isTemplate={isTemplate}
            onClose={handleClose}
            onCardDeleted={handleAfterCardDeleted}
          />
        </div>
      </div>
    </>
  );
}
