// 手绘细线 SVG 图标（禁 emoji）。统一 currentColor、圆角描边，呼应手札的细钢笔线。
import type { ReactElement, SVGProps } from 'react'
import type { IconKind } from '../cards/types'

interface IconProps {
  readonly size?: number
}

const stroke = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
})

export function IconChevronLeft({ size = 20 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M14.5 5.5 8.5 12l6 6.5" />
    </svg>
  )
}

export function IconChevronRight({ size = 20 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M9.5 5.5 15.5 12l-6 6.5" />
    </svg>
  )
}

export function IconGear({ size = 18 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.4M12 18.1v2.4M3.5 12h2.4M18.1 12h2.4M6 6l1.7 1.7M16.3 16.3 18 18M18 6l-1.7 1.7M7.7 16.3 6 18" />
    </svg>
  )
}

export function IconPencil({ size = 15 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="m5 19 .8-3.2L16.5 5.9a1.5 1.5 0 0 1 2.1 0l.5.5a1.5 1.5 0 0 1 0 2.1L8.9 18.4 5.7 19 5 19Z" />
    </svg>
  )
}

export function IconDots({ size = 16 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <circle cx="5.5" cy="12" r="0.6" fill="currentColor" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
      <circle cx="18.5" cy="12" r="0.6" fill="currentColor" />
    </svg>
  )
}

export function IconPaperclip({ size = 17 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M8.4 19.5 16.8 11a2.9 2.9 0 0 0-4.1-4.1L4.8 14.8a1.9 1.9 0 0 0 2.7 2.7l7.5-7.5a.9.9 0 0 0-1.3-1.3l-6.9 6.9" />
    </svg>
  )
}

export function IconText({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M5 7h14M5 12h14M5 17h8" />
    </svg>
  )
}

export function IconImage({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <rect x="4.5" y="5.5" width="15" height="13" rx="1.6" />
      <circle cx="9.2" cy="10" r="1.2" />
      <path d="m5.5 17 4.7-4.6 3 3 2.3-2 3 3.6" />
    </svg>
  )
}

export function IconFile({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M7 3.5h7l4 4V20a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4A.9.9 0 0 1 7 3.5Z" />
      <path d="M13.8 3.6v4.2h4.1" />
    </svg>
  )
}

export function IconUnknownShape({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <rect x="7.5" y="7.5" width="11" height="11" rx="1.6" strokeDasharray="2.6 2.4" />
      <path d="M4.5 14.5c0 .8.7 1.5 1.5 1.5" opacity="0.55" />
      <path d="M3.5 10.5c0 .8.7 1.5 1.5 1.5" opacity="0.35" />
    </svg>
  )
}

export function IconSearch({ size = 17 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <circle cx="10.8" cy="10.8" r="5.4" />
      <path d="m15 15 4.2 4.2" />
    </svg>
  )
}

export function IconCaretDown({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="m6.5 9.5 5.5 5 5.5-5" />
    </svg>
  )
}

export function IconAudio({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M4.5 9.5v5h3.2l4.3 3.6V5.9L7.7 9.5H4.5Z" />
      <path d="M16.5 8.8a4.6 4.6 0 0 1 0 6.4M18.8 6.2a8 8 0 0 1 0 11.6" opacity="0.7" />
    </svg>
  )
}

export function IconVideo({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <rect x="4" y="6" width="11" height="12" rx="1.6" />
      <path d="m16.6 10.6 3.4-2.4v7.6l-3.4-2.4" />
    </svg>
  )
}

export function IconPdf({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M7 3.5h7l4 4V20a.9.9 0 0 1-.9.9H7a.9.9 0 0 1-.9-.9V4.4A.9.9 0 0 1 7 3.5Z" />
      <path d="M13.8 3.6v4.2h4.1" />
      <path d="M8.6 17.4c1.9-3.4 4.9-3.4 6.8 0" opacity="0.8" />
      <circle cx="12" cy="14.6" r="1.1" opacity="0.8" />
    </svg>
  )
}

export function IconCode({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  )
}

export function IconLinkSign({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <path d="M10.2 13.8a3.4 3.4 0 0 1 0-4.8l2.2-2.2a3.4 3.4 0 0 1 4.8 4.8l-1 1" />
      <path d="M13.8 10.2a3.4 3.4 0 0 1 0 4.8l-2.2 2.2a3.4 3.4 0 0 1-4.8-4.8l1-1" />
    </svg>
  )
}

export function IconMd({ size = 13 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <rect x="3.5" y="6" width="17" height="12" rx="1.8" />
      <path d="M6.5 15V9.5L9 12.6l2.5-3.1V15" />
      <path d="M15 9.5v4.2m0 0 1.8-1.9M15 13.7l-1.8-1.9" />
    </svg>
  )
}

export function IconStack({ size = 17 }: IconProps): ReactElement {
  return (
    <svg {...stroke(size)}>
      <rect x="6.5" y="6.5" width="12" height="12" rx="1.6" strokeDasharray="3 2.6" />
      <path d="M4.2 16.2a1.8 1.8 0 0 0 1.8 1.8" opacity="0.6" />
      <path d="M2.8 12.4a1.8 1.8 0 0 0 1.8 1.8" opacity="0.4" />
    </svg>
  )
}

const KIND_ICONS: Record<IconKind, () => ReactElement> = {
  text: () => <IconText />,
  image: () => <IconImage />,
  file: () => <IconFile />,
  mystery: () => <IconUnknownShape />,
  stack: () => <IconStack size={13} />,
  audio: () => <IconAudio />,
  video: () => <IconVideo />,
  pdf: () => <IconPdf />,
  code: () => <IconCode />,
  link: () => <IconLinkSign />,
  md: () => <IconMd />,
}

export function CardTypeIcon({ kind }: { readonly kind: IconKind }): ReactElement {
  const icon = KIND_ICONS[kind]
  return (
    <span className="bj-kind-ico" aria-hidden>
      {icon()}
    </span>
  )
}
