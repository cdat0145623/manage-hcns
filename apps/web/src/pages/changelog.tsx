import { t } from "@lingui/core/macro";
import { HiCheckCircle, HiOutlineWrenchScrewdriver } from "react-icons/hi2";

import type { NextPageWithLayout } from "./_app";
import type { ChangelogChangeType } from "~/data/changelog";
import { getDashboardLayout } from "~/components/Dashboard";
import { PageHead } from "~/components/PageHead";
import { APP_VERSION, CHANGELOG_ENTRIES } from "~/data/changelog";

const sectionLabels: Record<ChangelogChangeType, string> = {
  added: t`Đã thêm`,
  changed: t`Đã thay đổi`,
  fixed: t`Đã sửa`,
};

const sectionIcons: Record<ChangelogChangeType, React.ReactNode> = {
  added: <HiCheckCircle className="h-4 w-4" aria-hidden="true" />,
  changed: (
    <HiOutlineWrenchScrewdriver className="h-4 w-4" aria-hidden="true" />
  ),
  fixed: <HiCheckCircle className="h-4 w-4" aria-hidden="true" />,
};

const ChangelogPage: NextPageWithLayout = () => {
  return (
    <>
      <PageHead title={t`Lịch sử cập nhật`} />
      <div className="m-auto h-full max-w-[900px] p-8 px-5 md:px-16 md:py-12">
        <div className="mb-10">
          <p className="mb-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            {t`Phiên bản hiện tại: v${APP_VERSION}`}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-light-1000 dark:text-dark-1000">
            {t`Lịch sử cập nhật`}
          </h1>
          <p className="mt-2 text-sm text-light-900 dark:text-dark-900">
            {t`Theo dõi các tính năng mới, thay đổi và lỗi đã được sửa.`}
          </p>
        </div>

        <div className="space-y-8">
          {CHANGELOG_ENTRIES.map((entry) => (
            <article
              key={entry.version}
              className="rounded-xl border border-light-300 bg-light-50 p-6 dark:border-dark-400 dark:bg-dark-100"
            >
              <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-bold text-light-1000 dark:text-dark-1000">
                  v{entry.version}
                </h2>
                <time
                  dateTime={entry.date}
                  className="text-xs text-light-900 dark:text-dark-900"
                >
                  {entry.date}
                </time>
              </div>

              <div className="space-y-5">
                {entry.sections.map((section) => (
                  <section key={section.type}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-light-1000 dark:text-dark-1000">
                      {sectionIcons[section.type]}
                      {sectionLabels[section.type]}
                    </h3>
                    <ul className="list-disc space-y-1.5 pl-6 text-sm text-light-900 dark:text-dark-900">
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
};

ChangelogPage.getLayout = (page) => getDashboardLayout(page);

export default ChangelogPage;
