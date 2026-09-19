import { ClientAppBoot } from '@/components/StaffGuard';
import { SessionLoading, SSR_SHELL_ID } from '@/components/SessionLoading';

/**
 * Loading shell is real Server Component HTML. ClientAppBoot hydrates as null,
 * then takes over — fixes Chrome DevTools mobile hydration mismatches.
 */
export default function AppSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Array children avoid JSX whitespace text nodes between siblings.
  return (
    <div className="contents">
      {[
        <div key="shell" id={SSR_SHELL_ID}>
          <SessionLoading />
        </div>,
        <ClientAppBoot key="boot">{children}</ClientAppBoot>,
      ]}
    </div>
  );
}
