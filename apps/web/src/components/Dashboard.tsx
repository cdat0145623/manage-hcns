import { useRouter } from "next/router";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import {
  TbLayoutSidebarLeftCollapse,
  TbLayoutSidebarLeftExpand,
  TbLayoutSidebarRightCollapse,
  TbLayoutSidebarRightExpand,
} from "react-icons/tb";

import { useClickOutside } from "~/hooks/useClickOutside";
import { useAuthSession } from "~/providers/auth-session";
import { useModal } from "~/providers/modal";
import { useWorkspace } from "~/providers/workspace";
import { api } from "~/utils/api";
import { AuthLoadingScreen } from "./AuthLoadingScreen";
import {
  AuthSessionUnavailableScreen,
  SessionUnavailableBanner,
} from "./SessionUnavailable";
import SideNavigation from "./SideNavigation";

interface DashboardProps {
  children: React.ReactNode;
  rightPanel?: React.ReactNode;
  hasRightPanel?: boolean;
  requiredRole?: string;
}

export function getDashboardLayout(
  page: React.ReactElement,
  rightPanel?: React.ReactNode,
  hasRightPanel = false,
  requiredRole?: string,
) {
  return (
    <Dashboard
      rightPanel={rightPanel}
      hasRightPanel={hasRightPanel}
      requiredRole={requiredRole}
    >
      {page}
    </Dashboard>
  );
}

export default function Dashboard({
  children,
  rightPanel,
  hasRightPanel = false,
  requiredRole,
}: DashboardProps) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { openModal } = useModal();

  const {
    session,
    status: sessionStatus,
    isRetrying,
    retrySession,
  } = useAuthSession();
  const sessionLoading = sessionStatus === "loading";
  const { data: user, isLoading: userLoading } = api.user.getUser.useQuery(
    undefined,
    {
      enabled: !!session?.user,
    },
  );

  const [isSideNavOpen, setIsSideNavOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const sideNavRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const sideNavButtonRef = useRef<HTMLButtonElement>(null);
  const rightPanelButtonRef = useRef<HTMLButtonElement>(null);

  const { availableWorkspaces, hasLoaded } = useWorkspace();

  const toggleSideNav = () => {
    setIsSideNavOpen(!isSideNavOpen);
    if (!isSideNavOpen) {
      setIsRightPanelOpen(false);
    }
  };

  const closeSideNav = () => {
    setIsSideNavOpen(false);
  };

  const toggleRightPanel = () => {
    setIsRightPanelOpen(!isRightPanelOpen);
    if (!isRightPanelOpen) {
      setIsSideNavOpen(false);
    }
  };

  useClickOutside(sideNavRef, (event) => {
    if (sideNavButtonRef.current?.contains(event.target as Node)) {
      return;
    }
    if (isSideNavOpen) {
      setIsSideNavOpen(false);
    }
  });

  useClickOutside(rightPanelRef, (event) => {
    if (rightPanelButtonRef.current?.contains(event.target as Node)) {
      return;
    }
    if (isRightPanelOpen) {
      setIsRightPanelOpen(false);
    }
  });

  // Only redirect on initial mount if role requirement is not met
  const hasCheckedRoleRef = useRef(false);
  useEffect(() => {
    if (sessionStatus !== "unauthenticated") {
      return;
    }

    const currentPath =
      typeof window === "undefined"
        ? "/"
        : `${window.location.pathname}${window.location.search}`;

    void router.replace(`/login?next=${encodeURIComponent(currentPath)}`);
  }, [router, sessionStatus]);

  useEffect(() => {
    if (
      !hasCheckedRoleRef.current &&
      session?.user &&
      !userLoading &&
      requiredRole &&
      user &&
      user.role !== requiredRole
    ) {
      hasCheckedRoleRef.current = true;
      void router.push("/boards");
    }
  }, [session?.user, user, userLoading, requiredRole, router]);

  const isDarkMode = resolvedTheme === "dark";

  useEffect(() => {
    if (
      session?.user &&
      !sessionLoading &&
      hasLoaded &&
      availableWorkspaces.length === 0
    ) {
      openModal("NEW_WORKSPACE", undefined, undefined, false);
    }
  }, [
    session?.user,
    sessionLoading,
    hasLoaded,
    availableWorkspaces.length,
    openModal,
  ]);

  if (sessionLoading) {
    return <AuthLoadingScreen />;
  }

  if (sessionStatus === "unavailable" && !session?.user) {
    return (
      <AuthSessionUnavailableScreen
        isRetrying={isRetrying}
        onRetry={() => void retrySession()}
      />
    );
  }

  if (!session?.user) return <AuthLoadingScreen />;

  return (
    <>
      {sessionStatus === "unavailable" ? (
        <SessionUnavailableBanner
          isRetrying={isRetrying}
          onRetry={() => void retrySession()}
        />
      ) : null}
      <style jsx global>{`
        html {
          height: 100vh;
          overflow: hidden;
          min-width: 320px;
          background-color: ${!isDarkMode ? "hsl(0deg 0% 97.3%)" : "#1c1c1c"};
        }
      `}</style>
      <div className="relative flex h-screen flex-col bg-light-50 dark:bg-dark-50 md:bg-light-100 md:p-3 md:dark:bg-dark-100">
        {/* Mobile Header */}
        <div className="flex h-12 items-center justify-between border-b border-light-300 bg-light-50 px-3 dark:border-dark-300 dark:bg-dark-50 md:hidden">
          <button
            ref={sideNavButtonRef}
            onClick={toggleSideNav}
            className="rounded p-1.5 transition-all hover:bg-light-200 dark:hover:bg-dark-100"
          >
            {isSideNavOpen ? (
              <TbLayoutSidebarLeftCollapse
                size={20}
                className="text-light-900 dark:text-dark-900"
              />
            ) : (
              <TbLayoutSidebarLeftExpand
                size={20}
                className="text-light-900 dark:text-dark-900"
              />
            )}
          </button>

          {hasRightPanel && (
            <button
              ref={rightPanelButtonRef}
              onClick={toggleRightPanel}
              className="rounded p-1.5 transition-all hover:bg-light-200 dark:hover:bg-dark-100"
            >
              {isRightPanelOpen ? (
                <TbLayoutSidebarRightCollapse
                  size={20}
                  className="text-light-900 dark:text-dark-900"
                />
              ) : (
                <TbLayoutSidebarRightExpand
                  size={20}
                  className="text-light-900 dark:text-dark-900"
                />
              )}
            </button>
          )}
        </div>

        <div className="flex h-[calc(100dvh-4.5rem)] min-h-0 w-full md:h-[calc(100dvh-1.5rem)]">
          <div
            ref={sideNavRef}
            className={`fixed top-12 z-40 h-[calc(100dvh-3rem)] w-[calc(100vw-1.5rem)] transform transition-transform duration-300 ease-in-out md:relative md:top-0 md:h-full md:w-auto md:translate-x-0 ${isSideNavOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} `}
          >
            {requiredRole && userLoading ? (
              <></>
            ) : (
              <SideNavigation
                user={{
                  displayName: user?.name ?? session.user.name,
                  email: user?.email ?? session.user.email,
                  image: user?.image ?? undefined,
                }}
                isLoading={userLoading}
                onCloseSideNav={closeSideNav}
              />
            )}
          </div>

          <div className="relative h-full min-h-0 w-full overflow-hidden md:rounded-lg md:border md:border-light-300 md:bg-light-50 md:dark:border-dark-300 md:dark:bg-dark-50">
            <div className="relative flex h-full min-h-0 w-full overflow-hidden">
              <div className="h-full w-full overflow-y-auto">
                {requiredRole && userLoading ? <></> : children}
              </div>

              {/* Mobile Right Panel */}
              {hasRightPanel && rightPanel && (
                <div
                  ref={rightPanelRef}
                  className={`fixed right-0 top-12 z-40 h-[calc(100dvh-3rem)] w-80 transform border-l border-light-300 bg-light-200 transition-transform duration-300 ease-in-out dark:border-dark-300 dark:bg-dark-100 md:hidden ${
                    isRightPanelOpen ? "translate-x-0" : "translate-x-full"
                  }`}
                >
                  <div className="h-full">{rightPanel}</div>
                </div>
              )}

              {/* Desktop Right Panel */}
              {hasRightPanel && rightPanel && (
                <div className="hidden md:block">{rightPanel}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
