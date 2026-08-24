type CalendarOccurrence = {
  userId: string;
  taskMasterId: string;
  targetDate: Date;
};

type StoredCalendarOccurrence = CalendarOccurrence & {
  isDeleted: boolean;
};

const getOccurrenceKey = ({
  taskMasterId,
  userId,
  targetDate,
}: CalendarOccurrence): string =>
  `${taskMasterId}:${userId}:${targetDate.toISOString()}`;

export const mergeStoredAndVirtualTaskInstances = <
  TStored extends StoredCalendarOccurrence,
  TVirtual extends CalendarOccurrence,
>({
  storedInstances,
  virtualInstances,
}: {
  storedInstances: TStored[];
  virtualInstances: TVirtual[];
}): Array<TStored | TVirtual> => {
  const occupiedOccurrenceKeys = new Set(
    storedInstances.map(getOccurrenceKey),
  );
  const visibleStoredInstances = storedInstances.filter(
    (instance) => !instance.isDeleted,
  );
  const missingVirtualInstances = virtualInstances.filter(
    (instance) => !occupiedOccurrenceKeys.has(getOccurrenceKey(instance)),
  );

  return [...visibleStoredInstances, ...missingVirtualInstances];
};
