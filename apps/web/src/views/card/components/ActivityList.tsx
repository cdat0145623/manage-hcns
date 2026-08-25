import type { Locale as DateFnsLocale } from "date-fns";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { formatDistanceToNow, isValid } from "date-fns";
import { useEffect, useRef, useState } from "react";
import {
  HiChevronDoubleDown,
  HiChevronDoubleUp,
  HiOutlineArrowLeft,
  HiOutlineArrowRight,
  HiOutlineCheckCircle,
  HiOutlineClock,
  HiOutlinePaperClip,
  HiOutlinePencil,
  HiOutlinePlus,
  HiOutlineTag,
  HiOutlineTrash,
  HiOutlineUserMinus,
  HiOutlineUserPlus,
} from "react-icons/hi2";

import type { ActivityType, GetCardActivitiesOutput } from "@kan/api/types";
import { authClient } from "@kan/auth/client";
import {
  formatInAppCalendarZone,
  isSameCalendarYearInAppZone,
} from "@kan/shared/utils";

import Avatar from "~/components/Avatar";
import { useLocalisation } from "~/hooks/useLocalisation";
import { api } from "~/utils/api";
import { fixServerDate, getAvatarUrl } from "~/utils/helpers";
import Comment from "./Comment";

type ActivityWithMergedLabels =
  GetCardActivitiesOutput["activities"][number] & {
    mergedLabels?: string[];
    attachment?: {
      publicId: string;
      filename: string;
      originalFilename: string;
    } | null;
    taskInstanceExtension?: {
      publicId: string;
      previousEndDate: Date;
      newEndDate: Date;
      reason: string;
      createdAt: Date;
    } | null;
  };

const truncate = (value: string | null, maxLength = 50) => {
  if (!value) return value;
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
};

const toValidDate = (value: Date | string | number | null | undefined) => {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? date : null;
};

export const getUserDisplayName = (
  user: { name?: string | null; email?: string | null } | null | undefined,
): string => {
  if (user?.name?.trim()) return user.name;
  if (user?.email) return user.email;
  return t`Member`;
};

export const getActivityText = ({
  type,
  toTitle,
  fromList,
  toList,
  memberName,
  memberEmail,
  isSelf,
  label,
  fromTitle,
  toDueDate,
  oldValue,
  newValue,
  dateLocale,
  mergedLabels,
  attachmentName,
  extension,
}: {
  type: ActivityType;
  toTitle: string | null;
  fromList: string | null;
  toList: string | null;
  memberName: string | null;
  memberEmail: string | null;
  isSelf: boolean;
  label: string | null;
  fromTitle?: string | null;
  fromDueDate?: Date | null;
  toDueDate?: Date | null;
  oldValue?: string | null;
  newValue?: string | null;
  dateLocale: DateFnsLocale;
  mergedLabels?: string[];
  attachmentName?: string | null;
  extension?: ActivityWithMergedLabels["taskInstanceExtension"];
}) => {
  const displayName = memberName ?? memberEmail ?? t`Member`;
  const TextHighlight = ({ children }: { children: React.ReactNode }) => (
    <span className="font-medium text-light-1000 dark:text-dark-1000">
      {children}
    </span>
  );

  if (
    type === "updated_label_added" &&
    mergedLabels &&
    mergedLabels.length > 1
  ) {
    const labelList = mergedLabels.join(", ");
    return (
      <Trans>
        added {mergedLabels.length} labels:{" "}
        <TextHighlight>{labelList}</TextHighlight>
      </Trans>
    );
  }

  if (
    type === "updated_label_removed" &&
    mergedLabels &&
    mergedLabels.length > 1
  ) {
    const labelList = mergedLabels.join(", ");
    return (
      <Trans>
        removed {mergedLabels.length} labels:{" "}
        <TextHighlight>{labelList}</TextHighlight>
      </Trans>
    );
  }

  const ACTIVITY_TYPE_MAP = {
    created: t`created the card`,
    updated_title: t`updated the title`,
    updated_description: t`updated the description`,
    updated_list: t`moved the card to another list`,
    updated_index: t`changed the card's position`,
    updated_label_added: t`added a label to the card`,
    updated_label_removed: t`removed a label from the card`,
    member_assigned: t`added a member to the card`,
    member_unassigned: t`removed a member from the card`,
    updated_comment_added: t`added a comment`,
    updated_comment_updated: t`updated a comment`,
    updated_comment_deleted: t`deleted a comment`,
    comment: t`added a comment`,
    updated_checklist_added: t`added a checklist`,
    updated_checklist_renamed: t`renamed a checklist`,
    updated_checklist_deleted: t`deleted a checklist`,
    updated_checklist_item_added: t`added a checklist item`,
    updated_checklist_item_updated: t`updated a checklist item`,
    updated_checklist_item_completed: t`completed a checklist item`,
    updated_checklist_item_uncompleted: t`marked a checklist item as incomplete`,
    updated_checklist_item_deleted: t`deleted a checklist item`,
    updated_attachment_added: t`added an attachment`,
    updated_attachment_renamed: t`renamed an attachment`,
    updated_attachment_removed: t`removed an attachment`,
    deadline_changed: t`changed the due date`,
    deadline_added: t`added a due date`,
    deadline_removed: t`removed a due date`,
    archived: t`archived the card`,
    start_date_added: t`added a start date`,
    start_date_changed: t`changed a start date`,
    start_date_removed: t`removed a start date`,
    deadline_extended: t`gia hạn deadline`,
  } as const;

  if (!(type in ACTIVITY_TYPE_MAP)) return null;
  const baseText = ACTIVITY_TYPE_MAP[type as keyof typeof ACTIVITY_TYPE_MAP];

  if (type === "deadline_extended" && extension) {
    const previousDeadline = formatInAppCalendarZone(
      extension.previousEndDate,
      "HH:mm dd/MM/yyyy",
      { locale: dateLocale },
    );
    const newDeadline = formatInAppCalendarZone(
      extension.newEndDate,
      "HH:mm dd/MM/yyyy",
      { locale: dateLocale },
    );

    return (
      <>
        {t`gia hạn deadline từ`}{" "}
        <TextHighlight>{previousDeadline}</TextHighlight> {t`đến`}{" "}
        <TextHighlight>{newDeadline}</TextHighlight>. {t`Lý do`}:{" "}
        <TextHighlight>{extension.reason}</TextHighlight>
      </>
    );
  }

  if (type === "updated_title" && toTitle) {
    return (
      <Trans>
        updated the title to <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_list" && fromList && toList) {
    return (
      <Trans>
        moved the card from <TextHighlight>{truncate(fromList)}</TextHighlight>{" "}
        to
        <TextHighlight>{truncate(toList)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "member_assigned" && displayName) {
    if (isSelf) return <Trans>self-assigned the card</Trans>;

    return (
      <Trans>
        assigned <TextHighlight>{truncate(displayName)}</TextHighlight> to the
        card
      </Trans>
    );
  }

  if (type === "member_unassigned" && displayName) {
    if (isSelf) return <Trans>unassigned themselves from the card</Trans>;

    return (
      <Trans>
        unassigned <TextHighlight>{truncate(displayName)}</TextHighlight> from
        the card
      </Trans>
    );
  }

  if (type === "updated_label_added" && label) {
    return (
      <Trans>
        added label <TextHighlight>{truncate(label)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_label_removed" && label) {
    return (
      <Trans>
        removed label <TextHighlight>{truncate(label)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_added" && toTitle) {
    return (
      <Trans>
        added checklist <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_renamed" && toTitle) {
    return (
      <Trans>
        renamed checklist <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_deleted" && fromTitle) {
    return (
      <Trans>
        deleted checklist <TextHighlight>{truncate(fromTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_item_added" && toTitle) {
    return (
      <Trans>
        added checklist item <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_item_updated" && toTitle) {
    return (
      <Trans>
        renamed checklist item to{" "}
        <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_item_completed" && toTitle) {
    return (
      <Trans>
        completed checklist item{" "}
        <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_checklist_item_uncompleted" && toTitle) {
    return (
      <Trans>
        marked checklist item <TextHighlight>{truncate(toTitle)}</TextHighlight>{" "}
        as incomplete
      </Trans>
    );
  }

  if (type === "updated_checklist_item_deleted" && fromTitle) {
    return (
      <Trans>
        deleted checklist item{" "}
        <TextHighlight>{truncate(fromTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_attachment_added") {
    const filename = attachmentName ?? toTitle;
    if (!filename) return baseText;
    return (
      <Trans>
        added an attachment <TextHighlight>{truncate(filename)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_attachment_renamed" && fromTitle && toTitle) {
    return (
      <Trans>
        renamed an attachment from{" "}
        <TextHighlight>{truncate(fromTitle)}</TextHighlight> to{" "}
        <TextHighlight>{truncate(toTitle)}</TextHighlight>
      </Trans>
    );
  }

  if (type === "updated_attachment_removed") {
    const filename = attachmentName ?? toTitle;
    if (!filename) return baseText;
    return (
      <Trans>
        removed an attachment{" "}
        <TextHighlight>{truncate(filename)}</TextHighlight>
      </Trans>
    );
  }

  if (
    (type === "deadline_added" ||
      type === "deadline_changed" ||
      type === "deadline_removed") &&
    toValidDate(toDueDate)
  ) {
    const validDueDate = toValidDate(toDueDate);
    if (!validDueDate) return baseText;

    const showYear = !isSameCalendarYearInAppZone(validDueDate, new Date());
    const formattedDate = formatInAppCalendarZone(
      validDueDate,
      showYear ? "HH:mm do MMM yyyy" : "HH:mm do MMM",
      { locale: dateLocale },
    );
    return (
      <Trans>
        changed the due date to <TextHighlight>{formattedDate}</TextHighlight>
      </Trans>
    );
  }

  if (
    (type === "start_date_added" ||
      type === "start_date_changed" ||
      type === "start_date_removed") &&
    toValidDate(newValue)
  ) {
    const validStartDate = toValidDate(newValue);
    if (!validStartDate) return baseText;

    const showYear = !isSameCalendarYearInAppZone(validStartDate, new Date());
    const formattedDate = formatInAppCalendarZone(
      validStartDate,
      showYear ? "HH:mm do MMM yyyy" : "HH:mm do MMM",
      { locale: dateLocale },
    );
    return (
      <Trans>
        changed the start date to <TextHighlight>{formattedDate}</TextHighlight>
      </Trans>
    );
  }

  if (type === "deadline_removed") {
    return <Trans>removed the due date</Trans>;
  }

  return baseText;
};

const ACTIVITY_ICON_MAP: Partial<Record<ActivityType, React.ReactNode | null>> =
  {
    created: <HiOutlinePlus />,
    updated_title: <HiOutlinePencil />,
    updated_description: <HiOutlinePencil />,
    updated_label_added: <HiOutlineTag />,
    updated_label_removed: <HiOutlineTag />,
    member_assigned: <HiOutlineUserPlus />,
    member_unassigned: <HiOutlineUserMinus />,
    updated_checklist_added: <HiOutlinePlus />,
    updated_checklist_renamed: <HiOutlinePencil />,
    updated_checklist_deleted: <HiOutlineTrash />,
    updated_checklist_item_added: <HiOutlinePlus />,
    updated_checklist_item_updated: <HiOutlinePencil />,
    updated_checklist_item_completed: <HiOutlineCheckCircle />,
    updated_checklist_item_uncompleted: <HiOutlineCheckCircle />,
    updated_checklist_item_deleted: <HiOutlineTrash />,
    updated_attachment_added: <HiOutlinePaperClip />,
    updated_attachment_renamed: <HiOutlinePaperClip />,
    updated_attachment_removed: <HiOutlinePaperClip />,
    deadline_changed: <HiOutlineClock />,
    deadline_added: <HiOutlineClock />,
    deadline_removed: <HiOutlineClock />,
    deadline_extended: <HiOutlineClock />,
    start_date_changed: <HiOutlineClock />,
    start_date_added: <HiOutlineClock />,
    start_date_removed: <HiOutlineClock />,
  } as const;

export const getActivityIcon = (
  type: ActivityType,
  fromIndex?: number | null,
  toIndex?: number | null,
): React.ReactNode | null => {
  if (type === "updated_list" && fromIndex != null && toIndex != null) {
    return fromIndex > toIndex ? (
      <HiOutlineArrowLeft />
    ) : (
      <HiOutlineArrowRight />
    );
  }
  return ACTIVITY_ICON_MAP[type] ?? null;
};

const ACTIVITIES_PAGE_SIZE = 20;

const ActivityList = ({
  cardPublicId,
  taskInstanceId,
  isLoading: cardIsLoading,
  isAdmin: _isAdmin,
  isViewOnly,
  includedTypes,
  excludedTypes,
  isExpanded = false,
}: {
  cardPublicId?: string;
  taskInstanceId?: string;
  isLoading: boolean;
  isAdmin?: boolean;
  isViewOnly?: boolean;
  includedTypes?: ActivityType[];
  excludedTypes?: ActivityType[];
  isExpanded?: boolean;
}) => {
  const { dateLocale } = useLocalisation();
  const { data: sessionData } = authClient.useSession();
  const utils = api.useUtils();
  const [allActivities, setAllActivities] = useState<
    GetCardActivitiesOutput["activities"]
  >([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [showNav, setShowNav] = useState(false);

  const isFullyExpandedRef = useRef(false);
  const lastDataUpdatedAtRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);
  const hasInitiallyScrolledRef = useRef(false);

  const {
    data: firstPageData,
    isFetching: isFetchingFirst,
    dataUpdatedAt,
  } = (
    taskInstanceId
      ? api.taskInstance.getActivities.useQuery(
          {
            id: taskInstanceId,
            limit: ACTIVITIES_PAGE_SIZE,
          },
          {
            enabled: !!taskInstanceId,
          },
        )
      : api.card.getActivities.useQuery(
          {
            cardPublicId: cardPublicId!,
            limit: ACTIVITIES_PAGE_SIZE,
          },
          {
            enabled: !!cardPublicId && cardPublicId.length >= 12,
          },
        )
  ) as {
    data: GetCardActivitiesOutput | undefined;
    isFetching: boolean;
    dataUpdatedAt: number;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      if (isExpanded) {
        let parent = scrollRef.current.parentElement;
        while (parent) {
          const overflowY = window.getComputedStyle(parent).overflowY;
          if (
            (overflowY === "auto" ||
              overflowY === "scroll" ||
              overflowY === "overlay") &&
            parent.scrollHeight > parent.clientHeight
          ) {
            parent.scrollTo({
              top: parent.scrollHeight,
              behavior,
            });
          }
          parent = parent.parentElement;
        }
      } else {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior,
        });
      }
    }
  };

  const scrollToTop = (behavior: ScrollBehavior = "smooth") => {
    if (scrollRef.current) {
      if (isExpanded) {
        // Scroll all scrollable parents
        let parent = scrollRef.current.parentElement;
        while (parent) {
          const overflowY = window.getComputedStyle(parent).overflowY;
          if (
            (overflowY === "auto" ||
              overflowY === "scroll" ||
              overflowY === "overlay") &&
            parent.scrollHeight > parent.clientHeight
          ) {
            parent.scrollTo({
              top: 0,
              behavior,
            });
          }
          parent = parent.parentElement;
        }
      } else {
        scrollRef.current.scrollTo({
          top: 0,
          behavior,
        });
      }
    }
  };

  // Check if scrollable
  useEffect(() => {
    const checkScroll = () => {
      if (scrollRef.current) {
        setShowNav(
          scrollRef.current.scrollHeight > scrollRef.current.clientHeight,
        );
      }
    };
    checkScroll();
    // Re-check when activities change
  }, [allActivities]);

  // Auto-scroll on new comment by current user

  useEffect(() => {
    if (allActivities.length > prevLengthRef.current) {
      const lastActivity = allActivities[allActivities.length - 1];
      const isByMe = lastActivity?.user?.id === sessionData?.user.id;
      const isComment =
        lastActivity?.type === "comment" ||
        lastActivity?.type === "updated_comment_added";

      if (isByMe && isComment) {
        // Small delay to ensure the new activity is rendered
        setTimeout(() => scrollToBottom(), 100);
      }
    }
    prevLengthRef.current = allActivities.length;
  }, [allActivities, sessionData?.user.id]);

  useEffect(() => {
    if (firstPageData && dataUpdatedAt !== lastDataUpdatedAtRef.current) {
      lastDataUpdatedAtRef.current = dataUpdatedAt;

      if (isFullyExpandedRef.current && firstPageData.hasMore) {
        setAllActivities(firstPageData.activities);
        setHasMore(firstPageData.hasMore);

        const fetchAllRemaining = async () => {
          let currentActivities = [...firstPageData.activities];
          let currentHasMore = firstPageData.hasMore;

          while (currentHasMore) {
            const lastActivity =
              currentActivities[currentActivities.length - 1];
            if (!lastActivity) break;

            const nextCursor = new Date(lastActivity.createdAt).toISOString();
            const nextPage = (
              taskInstanceId
                ? await utils.taskInstance.getActivities.fetch({
                    id: taskInstanceId,
                    limit: ACTIVITIES_PAGE_SIZE,
                    cursor: nextCursor,
                  })
                : await utils.card.getActivities.fetch({
                    cardPublicId: cardPublicId!,
                    limit: ACTIVITIES_PAGE_SIZE,
                    cursor: nextCursor,
                  })
            ) as GetCardActivitiesOutput;

            const existingIds = new Set(
              currentActivities.map((a) => a.publicId),
            );
            const newActivities = nextPage.activities.filter(
              (a: { publicId: string }) => !existingIds.has(a.publicId),
            );
            currentActivities = [...currentActivities, ...newActivities];
            currentHasMore = nextPage.hasMore;
          }

          setAllActivities(currentActivities);
          setHasMore(false);
        };

        void fetchAllRemaining();
      } else {
        setAllActivities(firstPageData.activities);
        setHasMore(firstPageData.hasMore);

        if (!firstPageData.hasMore) {
          isFullyExpandedRef.current = true;
        }
      }
    }
  }, [firstPageData, dataUpdatedAt, cardPublicId, utils.card.getActivities]);

  const handleLoadMore = async () => {
    if (isLoadingMore || !hasMore || allActivities.length === 0) return;

    const lastActivity = allActivities[allActivities.length - 1];
    if (!lastActivity) return;

    setIsLoadingMore(true);
    try {
      const nextCursor = new Date(lastActivity.createdAt).toISOString();
      const nextPage = (
        taskInstanceId
          ? await utils.taskInstance.getActivities.fetch({
              id: taskInstanceId,
              limit: ACTIVITIES_PAGE_SIZE,
              cursor: nextCursor,
            })
          : await utils.card.getActivities.fetch({
              cardPublicId: cardPublicId!,
              limit: ACTIVITIES_PAGE_SIZE,
              cursor: nextCursor,
            })
      ) as GetCardActivitiesOutput;

      const existingIds = new Set(allActivities.map((a) => a.publicId));
      const newActivities = nextPage.activities.filter(
        (a: { publicId: string }) => !existingIds.has(a.publicId),
      );
      setAllActivities((prev) => [...prev, ...newActivities]);
      setHasMore(nextPage.hasMore);

      if (!nextPage.hasMore) {
        isFullyExpandedRef.current = true;
      }
    } finally {
      setIsLoadingMore(false);
    }
  };

  const isFetching = isFetchingFirst || isLoadingMore;
  const isLoading =
    cardIsLoading || (isFetchingFirst && allActivities.length === 0);

  return (
    <div className="group/activity-list relative w-full">
      <div
        ref={scrollRef}
        className={`flex flex-col space-y-4 pt-1 ${
          !isExpanded
            ? "max-h-[350px] overflow-y-auto scrollbar-thin scrollbar-thumb-light-400 dark:scrollbar-thumb-dark-300"
            : ""
        }`}
      >
        {allActivities
          .filter((activity) => {
            if (includedTypes) return includedTypes.includes(activity.type);
            if (excludedTypes) return !excludedTypes.includes(activity.type);
            return true;
          })
          .sort(
            (a, b) =>
              (toValidDate(a.createdAt)?.getTime() ?? 0) -
              (toValidDate(b.createdAt)?.getTime() ?? 0),
          )
          .map((activity, index) => {
            const createdAt = toValidDate(activity.createdAt);
            const extendedActivity = activity as ActivityWithMergedLabels;
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
              fromDueDate: activity.fromDueDate ?? null,
              toDueDate: activity.toDueDate ?? null,
              oldValue: activity.oldValue ?? null,
              newValue: activity.newValue ?? null,
              dateLocale: dateLocale,
              mergedLabels: extendedActivity.mergedLabels,
              attachmentName:
                extendedActivity.attachment?.originalFilename ?? null,
              extension: extendedActivity.taskInstanceExtension,
            });

            if (
              activity.type === "comment" ||
              activity.type === "updated_comment_added"
            ) {
              if (!createdAt) return null;
              return (
                <Comment
                  key={activity.publicId}
                  publicId={activity.comment?.publicId}
                  cardPublicId={cardPublicId}
                  taskInstanceId={taskInstanceId}
                  name={activity.user?.name ?? ""}
                  email={activity.user?.email ?? ""}
                  image={activity.user?.image ?? null}
                  isLoading={isLoading}
                  createdAt={fixServerDate(createdAt).toISOString()}
                  comment={activity.comment?.comment}
                  isEdited={!!activity.comment?.updatedAt}
                  isAuthor={
                    activity.comment?.createdBy === sessionData?.user.id
                  }
                  isViewOnly={!!isViewOnly}
                />
              );
            }

            if (!activityText) return null;
            if (!createdAt) return null;

            return (
              <div
                key={activity.publicId}
                className="relative flex items-center space-x-2"
              >
                <div className="relative">
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
                    isLoading={isLoading}
                  />
                  {index !== allActivities.length - 1 && (
                    <div className="absolute bottom-[-14px] left-1/2 top-[30px] w-0.5 -translate-x-1/2 bg-light-600 dark:bg-dark-600" />
                  )}
                </div>
                <p className="text-sm">
                  <span className="font-medium dark:text-dark-1000">{`${getUserDisplayName(activity.user)} `}</span>
                  <span className="space-x-1 text-light-900 dark:text-dark-800">
                    {activityText}
                  </span>
                  <span className="mx-1 text-light-900 dark:text-dark-800">
                    ·
                  </span>
                  <span className="space-x-1 text-light-900 dark:text-dark-800">
                    {formatDistanceToNow(fixServerDate(createdAt), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </span>
                </p>
              </div>
            );
          })}
        {hasMore && (
          <div className="flex justify-center py-4">
            <button
              onClick={handleLoadMore}
              disabled={isFetching}
              className="text-sm font-medium text-light-900 hover:text-light-1000 disabled:opacity-50 dark:text-dark-800 dark:hover:text-dark-1000"
            >
              {isFetching ? t`Loading...` : t`Load more activities`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActivityList;
