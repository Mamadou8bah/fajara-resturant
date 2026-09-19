import type { ReactElement, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export function IconHome(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </Svg>
  );
}

export function IconOrders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </Svg>
  );
}

export function IconKitchen(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c-1.5 3-1.5 5.5 0 8" />
      <path d="M8 4c-1.2 2.8-1.2 5.5 0 8" />
      <path d="M16 4c-1.2 2.8-1.2 5.5 0 8" />
      <path d="M6 12h12v2a2 2 0 01-2 2H8a2 2 0 01-2-2v-2z" />
      <path d="M9 16v5" />
      <path d="M15 16v5" />
      <path d="M7 21h10" />
    </Svg>
  );
}

export function IconFloor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

export function IconCheckout(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </Svg>
  );
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h10" />
      <circle cx="18.5" cy="18" r="2.5" />
    </Svg>
  );
}

export function IconInventory(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3.3 7.9 12 13l8.7-5.1" />
      <path d="M12 13v8" />
    </Svg>
  );
}

export function IconEmployees(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M15.2 14.2c2.2.3 3.8 1.5 4.3 3.8" />
    </Svg>
  );
}

export function IconReports(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V10" />
      <path d="M12 16V7" />
      <path d="M16 16v-4" />
    </Svg>
  );
}

export function IconSettings(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
    </Svg>
  );
}

export function IconMore(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconLogout(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}

export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </Svg>
  );
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9a6 6 0 0112 0c0 7 3 7 3 7H3s3 0 3-7" />
      <path d="M10 19a2 2 0 004 0" />
    </Svg>
  );
}

export function IconQr(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8V5a1 1 0 011-1h3" />
      <path d="M16 4h3a1 1 0 011 1v3" />
      <path d="M20 16v3a1 1 0 01-1 1h-3" />
      <path d="M8 20H5a1 1 0 01-1-1v-3" />
      <rect x="7" y="7" width="4" height="4" rx="0.5" />
      <rect x="13" y="7" width="4" height="4" rx="0.5" />
      <rect x="7" y="13" width="4" height="4" rx="0.5" />
      <path d="M13 13h2v2h-2z" />
      <path d="M16 13h1v1" />
      <path d="M13 16h1v1" />
      <path d="M16 17h1v1h-1z" />
    </Svg>
  );
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 21 21" />
    </Svg>
  );
}

export function IconStar(props: IconProps) {
  return (
    <Svg {...props} fill="currentColor" stroke="none">
      <path d="M12 3.2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.6 7.2 18.1l.9-5.4L4.2 8.9l5.4-.8L12 3.2z" />
    </Svg>
  );
}

export function IconCart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 5h2l1.5 10h11L20 8H7" />
      <circle cx="9.5" cy="19" r="1.4" />
      <circle cx="16.5" cy="19" r="1.4" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function IconUserPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.5 19c.8-3.2 3-5 6.5-5s5.7 1.8 6.5 5" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </Svg>
  );
}

export function IconUtensils(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 3v8a2 2 0 002 2h0a2 2 0 002-2V3" />
      <path d="M8 13v8" />
      <path d="M16 3v18" />
      <path d="M16 3c2.5 0 4 1.8 4 4.5S18.5 12 16 12" />
    </Svg>
  );
}

export function IconShifts(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
      <path d="M8 17h8" />
    </Svg>
  );
}

export function IconActivity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 15l3-4 3 2 4-6" />
    </Svg>
  );
}

export function IconSales(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v18" />
      <path d="M7 8h8a3 3 0 010 6H9a3 3 0 000 6h8" />
    </Svg>
  );
}

const BY_HREF: Record<string, (props: IconProps) => ReactElement> = {
  '/app/dashboard': IconHome,
  '/app/orders': IconOrders,
  '/app/kitchen': IconKitchen,
  '/app/floor': IconFloor,
  '/app/checkout': IconCheckout,
  '/app/sales': IconSales,
  '/app/menu': IconMenu,
  '/app/inventory': IconInventory,
  '/app/employees': IconEmployees,
  '/app/shifts': IconShifts,
  '/app/reports': IconReports,
  '/app/activity': IconActivity,
  '/app/settings': IconSettings,
};

export function NavIcon({
  href,
  className = 'h-5 w-5',
  active = false,
}: {
  href: string;
  className?: string;
  active?: boolean;
}) {
  const Icon = BY_HREF[href] ?? IconHome;
  return (
    <Icon
      className={className}
      strokeWidth={active ? 2.25 : 1.8}
    />
  );
}
