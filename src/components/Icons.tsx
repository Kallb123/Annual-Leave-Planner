import type { ReactNode } from 'react'

/** Small inline stroke icons. Decorative: always paired with visible text or an aria-label. */

interface IconProps {
  size?: number
}

function Svg({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 3 5 8l5 5" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 3 5 5-5 5" />
  </Svg>
)

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
    <circle cx="10.5" cy="4.5" r="1.5" />
    <circle cx="5.5" cy="11.5" r="1.5" />
  </Svg>
)

export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" />
  </Svg>
)

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v10M3 8h10" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2 14.5 13.5h-13z" />
    <path d="M8 6.5v3M8 11.6v.1" />
  </Svg>
)

/** The app's mark: a small calendar grid. */
export function LogoMark({ size = 28 }: IconProps) {
  const on = '#f6f5f1'
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true" focusable="false">
      <rect x="1" y="3" width="26" height="24" rx="7" fill="#1e1d1a" />
      <rect x="5" y="10" width="5" height="5" rx="1.5" fill={on} opacity=".35" />
      <rect x="11.5" y="10" width="5" height="5" rx="1.5" fill={on} />
      <rect x="18" y="10" width="5" height="5" rx="1.5" fill={on} />
      <rect x="5" y="17" width="5" height="5" rx="1.5" fill={on} />
      <rect x="11.5" y="17" width="5" height="5" rx="1.5" fill={on} opacity=".35" />
      <rect x="18" y="17" width="5" height="5" rx="1.5" fill={on} opacity=".35" />
    </svg>
  )
}
