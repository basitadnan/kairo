import {
  BookOpen,
  CalendarBlank,
  CalendarCheck,
  ChatCircleDots,
  DotsThreeCircle,
  GearSix,
  GraduationCap,
  Leaf,
  ListChecks,
  Sun,
  UploadSimple,
} from '@phosphor-icons/react'

export interface NavItem {
  to: string
  label: string
  icon: typeof Sun
}

/** Bottom tab bar on phones: the four daily destinations plus More. */
export const TAB_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: Sun },
  { to: '/schedule', label: 'Timetable', icon: CalendarBlank },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/exams', label: 'Exams', icon: GraduationCap },
]

export const MORE_ITEM: NavItem = { to: '/more', label: 'More', icon: DotsThreeCircle }

/** Desktop sidebar: everything, one glance away. */
export const SIDEBAR_MAIN: NavItem[] = [
  ...TAB_ITEMS.slice(0, 4),
  { to: '/courses', label: 'Courses', icon: BookOpen },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/personal', label: 'Personal', icon: Leaf },
  { to: '/assistant', label: 'Assistant', icon: ChatCircleDots },
]

export const SIDEBAR_FOOTER: NavItem[] = [
  { to: '/import', label: 'Import', icon: UploadSimple },
  { to: '/settings', label: 'Settings', icon: GearSix },
]
