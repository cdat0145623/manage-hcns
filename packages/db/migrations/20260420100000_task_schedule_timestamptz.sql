-- Interpret existing naive timestamps as Asia/Ho_Chi_Minh wall time (app calendar zone),
-- then store as timestamptz for correct instant round-trip regardless of server TZ.
ALTER TABLE "frequence" ALTER COLUMN "dtStart" TYPE timestamptz USING (
  CASE
    WHEN "dtStart" IS NULL THEN NULL
    ELSE "dtStart" AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END
);

ALTER TABLE "taskMasters" ALTER COLUMN "startDate" TYPE timestamptz USING "startDate" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "taskMasters" ALTER COLUMN "endDate" TYPE timestamptz USING "endDate" AT TIME ZONE 'Asia/Ho_Chi_Minh';

ALTER TABLE "taskInstances" ALTER COLUMN "targetDate" TYPE timestamptz USING (
  CASE
    WHEN "targetDate" IS NULL THEN NULL
    ELSE "targetDate" AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END
);

ALTER TABLE "taskInstances" ALTER COLUMN "actualDate" TYPE timestamptz USING (
  CASE
    WHEN "actualDate" IS NULL THEN NULL
    ELSE "actualDate" AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END
);

ALTER TABLE "taskInstances" ALTER COLUMN "endDate" TYPE timestamptz USING (
  CASE
    WHEN "endDate" IS NULL THEN NULL
    ELSE "endDate" AT TIME ZONE 'Asia/Ho_Chi_Minh'
  END
);
