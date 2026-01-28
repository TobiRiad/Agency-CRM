import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(date)
}

export function formatDateTime(input: string | Date): string {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function formatPercentage(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "0%"
  return `${(value * 100).toFixed(decimals)}%`
}

export function calculateRate(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0
  return numerator / denominator
}

export function groupBy<T, K extends string | number>(
  items: T[],
  getKey: (item: T) => K
): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const key = getKey(item)
    ;(acc[key] ||= []).push(item)
    return acc
  }, {} as Record<K, T[]>)
}

// Funnel stage helpers (used by campaign settings UI)
export const FUNNEL_STAGE_COLORS = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const

export const DEFAULT_FUNNEL_STAGES = [
  { name: "Uncategorized", color: "gray" },
  { name: "New", color: "blue" },
  { name: "Contacted", color: "indigo" },
  { name: "Interested", color: "violet" },
  { name: "Meeting Set", color: "purple" },
  { name: "Won", color: "green" },
  { name: "Lost", color: "red" },
] as const

export function getStageColor(color: string): string {
  // Maps a semantic color name to Tailwind classes used across the UI.
  // Keep this conservative: default to gray if an unknown color is passed.
  const c = (color || "gray").toLowerCase()
  const map: Record<string, string> = {
    slate: "bg-slate-100 text-slate-800 border-slate-200",
    gray: "bg-gray-100 text-gray-800 border-gray-200",
    zinc: "bg-zinc-100 text-zinc-800 border-zinc-200",
    neutral: "bg-neutral-100 text-neutral-800 border-neutral-200",
    stone: "bg-stone-100 text-stone-800 border-stone-200",
    red: "bg-red-100 text-red-800 border-red-200",
    orange: "bg-orange-100 text-orange-800 border-orange-200",
    amber: "bg-amber-100 text-amber-800 border-amber-200",
    yellow: "bg-yellow-100 text-yellow-800 border-yellow-200",
    lime: "bg-lime-100 text-lime-800 border-lime-200",
    green: "bg-green-100 text-green-800 border-green-200",
    emerald: "bg-emerald-100 text-emerald-800 border-emerald-200",
    teal: "bg-teal-100 text-teal-800 border-teal-200",
    cyan: "bg-cyan-100 text-cyan-800 border-cyan-200",
    sky: "bg-sky-100 text-sky-800 border-sky-200",
    blue: "bg-blue-100 text-blue-800 border-blue-200",
    indigo: "bg-indigo-100 text-indigo-800 border-indigo-200",
    violet: "bg-violet-100 text-violet-800 border-violet-200",
    purple: "bg-purple-100 text-purple-800 border-purple-200",
    fuchsia: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
    pink: "bg-pink-100 text-pink-800 border-pink-200",
    rose: "bg-rose-100 text-rose-800 border-rose-200",
  }
  return map[c] || map.gray
}
