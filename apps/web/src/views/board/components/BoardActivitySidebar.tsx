import { t } from "@lingui/core/macro";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useRef, useState } from "react";
import { HiOutlineXMark } from "react-icons/hi2";
import { twMerge } from "tailwind-merge";

import { authClient } from "@kan/auth/client";
import Avatar from "~/components/Avatar";
import { useLocalisation } from "~/hooks/useLocalisation";
import { api } from "~/utils/api";
import { getAvatarUrl } from "~/utils/helpers";
import {
  getActivityIcon,
  getActivityText,
  getUserDisplayName,
} from "../../card/components/ActivityList";
import Comment from "../../card/components/Comment";
import type { GetBoardActivitiesOutput } from "@kan/api/types";

const ACTIVITIES_PAGE_SIZE = 20;

interface BoardActivitySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  boardPublicId: string;
}

export default function BoardActivitySidebar({
  isOpen,
  onClose,
  boardPublicId,
}: BoardActivitySidebarProps) {
  const { dateLocale } = useLocalisation();
  const { data: sessionData } = authClient.useSession();
  const utils = api.useUtils();
  const [allActivities, setAllActivities] = useState<
    GetBoardActivitiesOutput["activities"]
  >([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const {
    data: firstPageData,
    isFetching: isFetchingFirst,
    dataUpdatedAt,
  } = api.board.getActivities.useQuery(
    {
      boardPublicId,
      limit: ACTIVITIES_PAGE_SIZE,
    },
    {
      enabled: isOpen && !!boardPublicId,
    },
  );

  useEffect(() => {
    if (firstPageData) {
      setAllActivities(firstPageData.activities);
      setHasMore(firstPageData.hasMore);
    }
  }, [firstPageData]);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || allActivities.length === 0) return;

    const lastActivity = allActivities[allActivities.length - 1];
    if (!lastActivity) return;

    setIsLoadingMore(true);
    try {
      const nextPage = await utils.board.getActivities.fetch({
        boardPublicId,
        limit: ACTIVITIES_PAGE_SIZE,
        cursor: new Date(lastActivity.createdAt),
      });

      const existingIds = new Set(allActivities.map((a) => a.publicId));
      const newActivities = nextPage.activities.filter(
        (a: any) => !existingIds.has(a.publicId),
      );
      setAllActivities((prev) => [...prev, ...newActivities]);
      setHasMore(nextPage.hasMore);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const isFetching = isFetchingFirst || isLoadingMore;

  return (
    <div
      className={twMerge(
        "fixed right-0 top-0 z-[60] h-full w-[350px] transform border-l border-light-200 bg-light-50 shadow-2xl transition-transform duration-300 ease-in-out dark:border-dark-200 dark:bg-dark-100",
        isOpen ? "translate-x-0" : "translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-light-200 p-4 dark:border-dark-200">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-dark-1000">
            {t`Menu`}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-light-800 hover:bg-light-200 dark:text-dark-800 dark:hover:bg-dark-200"
          >
            <HiOutlineXMark className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-light-400 dark:scrollbar-thumb-dark-300">
          <div className="mb-6">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-light-800 dark:text-dark-800">
              {t`Activity`}
            </h3>
            <div className="space-y-6">
              {allActivities.map((activity, index) => {
                const activityText = getActivityText({
                  type: activity.type,
                  toTitle: activity.toTitle,
                  fromList: activity.fromList?.name ?? null,
                  toList: activity.toList?.name ?? null,
                  memberName: activity.member?.user?.name ?? null,
                  memberEmail: activity.member?.user?.email ?? null,
                  isSelf: activity.member?.user?.id === sessionData?.user.id,
                  label: activity.label?.name ?? null,
                  fromTitle: activity.fromTitle ?? null,
                  toDueDate: activity.toDueDate ?? null,
                  dateLocale: dateLocale,
                });

                if (activity.type === "card.updated.comment.added")
                  return (
                    <Comment
                      key={activity.publicId}
                      publicId={activity.comment?.publicId}
                      cardPublicId={activity.card?.publicId}
                      name={activity.user?.name ?? ""}
                      email={activity.user?.email ?? ""}
                      image={activity.user?.image ?? null}
                      isLoading={false}
                      createdAt={activity.createdAt.toISOString()}
                      comment={activity.comment?.comment}
                      isEdited={!!activity.comment?.updatedAt}
                      isAuthor={
                        activity.comment?.createdBy === sessionData?.user.id
                      }
                      isViewOnly={true}
                    />
                  );

                if (!activityText) return null;

                return (
                  <div
                    key={activity.publicId}
                    className="relative flex items-start space-x-3"
                  >
                    <div className="relative mt-0.5">
                      <Avatar
                        size="sm"
                        name={activity.user?.name ?? ""}
                        email={activity.user?.email ?? ""}
                        imageUrl={
                          getAvatarUrl(activity.user?.image ?? null) || undefined
                        }
                        icon={getActivityIcon(
                          activity.type,
                          activity.fromList?.index,
                          activity.toList?.index,
                        )}
                      />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-sm leading-snug">
                        <span className="font-bold text-neutral-900 dark:text-dark-1000">
                          {getUserDisplayName(activity.user)}
                        </span>{" "}
                        <span className="text-light-900 dark:text-dark-800">
                          {activityText}
                        </span>
                        {activity.card && (
                          <>
                            {" "}
                            <span className="text-light-800 dark:text-dark-900">
                              {t`on`}
                            </span>{" "}
                            <span className="font-medium text-primary-600 dark:text-primary-400">
                              {activity.card.title}
                            </span>
                          </>
                        )}
                      </p>
                      <span className="mt-1 text-xs text-light-700 dark:text-dark-700">
                        {formatDistanceToNow(new Date(activity.createdAt), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isFetching}
                  className="text-sm font-medium text-primary-600 hover:text-primary-700 disabled:opacity-50 dark:text-primary-400"
                >
                  {isFetching ? t`Loading...` : t`Load more activities`}
                </button>
              </div>
            )}

            {!allActivities.length && !isFetching && (
              <p className="py-8 text-center text-sm text-light-700 dark:text-dark-800">
                {t`No activity yet.`}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
