'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Session, isPaidPlan } from '@/types'
import { initials, avatarColor, planLabel } from '@/lib/utils'
import { theme, T } from '@/lib/tokens'
import { resolveTradeConfig } from '@/lib/trade-resolver'

type NavItem  = { label: string; href: string; icon: (a: boolean) => React.ReactNode; badge?: number | null; soon?: boolean; exact?: boolean }
type NavGroup = { title: string; items: NavItem[] }

// ── Illustrated Icons (3D style, matching SVG asset set) ──────────────────────
function IconOverview({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="14" width="52" height="44" rx="8" fill="url(#ov_card)"/>
      <rect x="6" y="14" width="52" height="44" rx="8" fill="white" opacity="0.92"/>
      <path d="M32 10L10 28h6v20h10V36h12v12h10V28h6L32 10z" fill="url(#ov_house)"/>
      <path d="M32 10L10 28h6v20h10V36h12v12h10V28h6L32 10z" fill="url(#ov_house2)" opacity="0.7"/>
      <rect x="26" y="36" width="12" height="12" rx="2" fill="url(#ov_door)"/>
      <defs>
        <linearGradient id="ov_card" x1="6" y1="14" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e8f5f4"/><stop offset="1" stopColor="#f5f9f9"/>
        </linearGradient>
        <linearGradient id="ov_house" x1="10" y1="10" x2="54" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
        <linearGradient id="ov_house2" x1="32" y1="10" x2="32" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.3"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="ov_door" x1="26" y1="36" x2="38" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0A5653"/><stop offset="1" stopColor="#062E2C"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconPipeline({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="6" width="40" height="52" rx="6" fill="url(#pl_pad)"/>
      <rect x="8" y="6" width="40" height="52" rx="6" fill="white" opacity="0.95"/>
      <rect x="8" y="6" width="40" height="12" rx="6" fill="url(#pl_top)"/>
      <rect x="8" y="12" width="40" height="6" fill="url(#pl_top)"/>
      <circle cx="18" cy="30" r="3" fill="url(#pl_chk)"/>
      <path d="M16.5 30l1.5 1.5 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="24" y="28" width="16" height="2" rx="1" fill="url(#pl_line)"/>
      <circle cx="18" cy="40" r="3" fill="url(#pl_chk)"/>
      <path d="M16.5 40l1.5 1.5 3-3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="24" y="38" width="12" height="2" rx="1" fill="url(#pl_line)"/>
      <circle cx="18" cy="50" r="3" fill="#E5E7EB"/>
      <rect x="24" y="48" width="14" height="2" rx="1" fill="#E5E7EB"/>
      <defs>
        <linearGradient id="pl_pad" x1="8" y1="6" x2="48" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f0faf9"/><stop offset="1" stopColor="#ffffff"/>
        </linearGradient>
        <linearGradient id="pl_top" x1="8" y1="6" x2="48" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
        <linearGradient id="pl_chk" x1="15" y1="27" x2="21" y2="33" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
        <linearGradient id="pl_line" x1="24" y1="29" x2="40" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CA3AF"/><stop offset="1" stopColor="#D1D5DB"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconCalendar({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="12" width="52" height="46" rx="8" fill="white"/>
      <rect x="6" y="12" width="52" height="18" rx="8" fill="url(#cal_head)"/>
      <rect x="6" y="24" width="52" height="6" fill="url(#cal_head)"/>
      <rect x="14" y="6" width="6" height="14" rx="3" fill="url(#cal_pin)"/>
      <rect x="44" y="6" width="6" height="14" rx="3" fill="url(#cal_pin)"/>
      <rect x="14" y="36" width="8" height="8" rx="2" fill="#E5F7F5"/>
      <rect x="28" y="36" width="8" height="8" rx="2" fill="url(#cal_today)"/>
      <rect x="42" y="36" width="8" height="8" rx="2" fill="#E5F7F5"/>
      <rect x="14" y="48" width="8" height="6" rx="2" fill="#F3F4F6"/>
      <rect x="28" y="48" width="8" height="6" rx="2" fill="#F3F4F6"/>
      <rect x="42" y="48" width="8" height="6" rx="2" fill="#F3F4F6"/>
      <defs>
        <linearGradient id="cal_head" x1="6" y1="12" x2="58" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#14B8A6"/>
        </linearGradient>
        <linearGradient id="cal_pin" x1="14" y1="6" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6B7280"/><stop offset="1" stopColor="#374151"/>
        </linearGradient>
        <linearGradient id="cal_today" x1="28" y1="36" x2="36" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconMessages({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="4" y="8" width="56" height="42" rx="12" fill="url(#msg_bg)"/>
      <rect x="4" y="8" width="56" height="42" rx="12" fill="url(#msg_shine)" opacity="0.4"/>
      <circle cx="20" cy="29" r="4" fill="white" opacity="0.9"/>
      <circle cx="32" cy="29" r="4" fill="white" opacity="0.9"/>
      <circle cx="44" cy="29" r="4" fill="white" opacity="0.9"/>
      <path d="M24 50l8 8 8-8" fill="url(#msg_bg)"/>
      <defs>
        <linearGradient id="msg_bg" x1="4" y1="8" x2="60" y2="50" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8"/><stop offset="1" stopColor="#0284C7"/>
        </linearGradient>
        <linearGradient id="msg_shine" x1="4" y1="8" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconEstimates({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="4" width="40" height="52" rx="6" fill="white" stroke="#E5E7EB" strokeWidth="1"/>
      <rect x="36" y="4" width="12" height="16" rx="3" fill="url(#est_tag)"/>
      <path d="M36 4h8l4 4v8h-12V4z" fill="url(#est_tag)"/>
      <rect x="16" y="22" width="20" height="2.5" rx="1.25" fill="#D1D5DB"/>
      <rect x="16" y="28" width="24" height="2.5" rx="1.25" fill="#E5E7EB"/>
      <rect x="16" y="34" width="18" height="2.5" rx="1.25" fill="#E5E7EB"/>
      <circle cx="20" cy="43" r="5" fill="url(#est_check)"/>
      <path d="M17.5 43l2 2 3.5-3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <text x="38" y="14" fontSize="9" fontWeight="800" fill="white" fontFamily="sans-serif" textAnchor="middle">$</text>
      <defs>
        <linearGradient id="est_tag" x1="36" y1="4" x2="48" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B"/><stop offset="1" stopColor="#D97706"/>
        </linearGradient>
        <linearGradient id="est_check" x1="15" y1="38" x2="25" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconInvoices({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M10 4h36l8 8v46a4 4 0 01-4 4H10a4 4 0 01-4-4V8a4 4 0 014-4z" fill="white" stroke="#E5E7EB" strokeWidth="1"/>
      <path d="M46 4l8 8H50a4 4 0 01-4-4V4z" fill="url(#inv_fold)"/>
      <rect x="8" y="48" width="48" height="14" rx="4" fill="url(#inv_roll)" opacity="0.12"/>
      <path d="M8 52q12-6 24 0t24 0" stroke="url(#inv_roll)" strokeWidth="2" fill="none"/>
      <text x="32" y="22" fontSize="11" fontWeight="800" fill="url(#inv_dollar)" fontFamily="sans-serif" textAnchor="middle">$</text>
      <rect x="16" y="28" width="22" height="2" rx="1" fill="#D1D5DB"/>
      <rect x="16" y="33" width="18" height="2" rx="1" fill="#E5E7EB"/>
      <rect x="16" y="38" width="20" height="2" rx="1" fill="#E5E7EB"/>
      <defs>
        <linearGradient id="inv_fold" x1="46" y1="4" x2="54" y2="12" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CA3AF"/><stop offset="1" stopColor="#6B7280"/>
        </linearGradient>
        <linearGradient id="inv_roll" x1="8" y1="48" x2="56" y2="62" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
        <linearGradient id="inv_dollar" x1="26" y1="12" x2="38" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B"/><stop offset="1" stopColor="#D97706"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconClients({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="22" cy="22" r="12" fill="url(#cli_p1)"/>
      <circle cx="22" cy="22" r="12" fill="url(#cli_shine)" opacity="0.35"/>
      <path d="M2 52c0-10 9-16 20-16s20 6 20 16" fill="url(#cli_p1)" opacity="0.85"/>
      <circle cx="44" cy="26" r="9" fill="url(#cli_p2)"/>
      <circle cx="44" cy="26" r="9" fill="url(#cli_shine2)" opacity="0.25"/>
      <path d="M34 52c0-8 6-12 14-12 5 0 14 3 14 12" fill="url(#cli_p2)" opacity="0.7"/>
      <defs>
        <linearGradient id="cli_p1" x1="10" y1="10" x2="42" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4ADE80"/><stop offset="1" stopColor="#16A34A"/>
        </linearGradient>
        <linearGradient id="cli_p2" x1="35" y1="17" x2="53" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9CA3AF"/><stop offset="1" stopColor="#6B7280"/>
        </linearGradient>
        <linearGradient id="cli_shine" x1="10" y1="10" x2="22" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.6"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="cli_shine2" x1="35" y1="17" x2="44" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconProperties({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M32 6L8 26h6v30h14V40h8v16h14V26h6L32 6z" fill="url(#prop_wall)"/>
      <path d="M32 6L8 26h6v30h14V40h8v16h14V26h6L32 6z" fill="url(#prop_shine)" opacity="0.4"/>
      <rect x="26" y="40" width="12" height="16" rx="2" fill="url(#prop_door)"/>
      <rect x="14" y="30" width="10" height="10" rx="2" fill="url(#prop_win)"/>
      <rect x="40" y="30" width="10" height="10" rx="2" fill="url(#prop_win)"/>
      <path d="M32 6L8 26h6L32 10l18 16h6L32 6z" fill="url(#prop_roof)"/>
      <defs>
        <linearGradient id="prop_wall" x1="8" y1="6" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA"/><stop offset="1" stopColor="#2563EB"/>
        </linearGradient>
        <linearGradient id="prop_roof" x1="8" y1="6" x2="56" y2="26" gradientUnits="userSpaceOnUse">
          <stop stopColor="#93C5FD"/><stop offset="1" stopColor="#3B82F6"/>
        </linearGradient>
        <linearGradient id="prop_door" x1="26" y1="40" x2="38" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E40AF"/><stop offset="1" stopColor="#1E3A8A"/>
        </linearGradient>
        <linearGradient id="prop_win" x1="14" y1="30" x2="24" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BAE6FD"/><stop offset="1" stopColor="#7DD3FC"/>
        </linearGradient>
        <linearGradient id="prop_shine" x1="8" y1="6" x2="32" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.4"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconMeasure({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="4" y="36" width="36" height="22" rx="4" transform="rotate(-45 4 36)" fill="url(#msr_ruler)"/>
      <rect x="4" y="36" width="36" height="22" rx="4" transform="rotate(-45 4 36)" fill="url(#msr_shine)" opacity="0.3"/>
      <line x1="12" y1="44" x2="16" y2="40" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="18" y1="38" x2="22" y2="34" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <line x1="24" y1="32" x2="28" y2="28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="46" cy="22" r="14" fill="url(#msr_dish_bg)"/>
      <path d="M40 28 Q46 16 52 22" stroke="url(#msr_signal)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <path d="M37 31 Q46 12 55 20" stroke="url(#msr_signal)" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6"/>
      <circle cx="46" cy="26" r="3" fill="white"/>
      <line x1="46" y1="26" x2="46" y2="34" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <defs>
        <linearGradient id="msr_ruler" x1="4" y1="36" x2="40" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FCD34D"/><stop offset="1" stopColor="#D97706"/>
        </linearGradient>
        <linearGradient id="msr_dish_bg" x1="32" y1="8" x2="60" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2DD4BF"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
        <linearGradient id="msr_signal" x1="37" y1="12" x2="55" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="white"/><stop offset="1" stopColor="rgba(255,255,255,0.5)"/>
        </linearGradient>
        <linearGradient id="msr_shine" x1="4" y1="36" x2="22" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconRevenue({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="6" y="8" width="52" height="48" rx="8" fill="url(#rev_body)"/>
      <rect x="6" y="8" width="52" height="14" rx="8" fill="url(#rev_screen)"/>
      <rect x="6" y="16" width="52" height="6" fill="url(#rev_screen)"/>
      <rect x="12" y="10" width="28" height="8" rx="3" fill="url(#rev_display)"/>
      <rect x="12" y="28" width="10" height="8" rx="3" fill="url(#rev_btn)"/>
      <rect x="27" y="28" width="10" height="8" rx="3" fill="url(#rev_btn)"/>
      <rect x="42" y="28" width="10" height="8" rx="3" fill="url(#rev_btn_op)"/>
      <rect x="12" y="40" width="10" height="8" rx="3" fill="url(#rev_btn)"/>
      <rect x="27" y="40" width="10" height="8" rx="3" fill="url(#rev_btn)"/>
      <rect x="42" y="40" width="10" height="8" rx="3" fill="url(#rev_btn_op)"/>
      <defs>
        <linearGradient id="rev_body" x1="6" y1="8" x2="58" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8"/><stop offset="1" stopColor="#0369A1"/>
        </linearGradient>
        <linearGradient id="rev_screen" x1="6" y1="8" x2="58" y2="22" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0EA5E9"/><stop offset="1" stopColor="#0284C7"/>
        </linearGradient>
        <linearGradient id="rev_display" x1="12" y1="10" x2="40" y2="18" gradientUnits="userSpaceOnUse">
          <stop stopColor="#86EFAC"/><stop offset="1" stopColor="#4ADE80"/>
        </linearGradient>
        <linearGradient id="rev_btn" x1="12" y1="28" x2="22" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#BAE6FD"/><stop offset="1" stopColor="#7DD3FC"/>
        </linearGradient>
        <linearGradient id="rev_btn_op" x1="42" y1="28" x2="52" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B"/><stop offset="1" stopColor="#D97706"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconProfile({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="8" y="8" width="42" height="48" rx="4" fill="#F0FDF4" transform="rotate(-8 8 8)"/>
      <rect x="10" y="10" width="42" height="48" rx="4" fill="white" stroke="#E5E7EB" strokeWidth="1"/>
      <path d="M44 52l8-8-8-8-4 4-4-4-8 8 4 4-4 4 8 8 4-4z" fill="url(#prf_pencil)"/>
      <path d="M52 44l4-4-4-4-4 4z" fill="url(#prf_tip)"/>
      <rect x="18" y="18" width="20" height="3" rx="1.5" fill="#D1D5DB"/>
      <rect x="18" y="25" width="26" height="2" rx="1" fill="#E5E7EB"/>
      <rect x="18" y="30" width="22" height="2" rx="1" fill="#E5E7EB"/>
      <defs>
        <linearGradient id="prf_pencil" x1="36" y1="36" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#86EFAC"/><stop offset="1" stopColor="#16A34A"/>
        </linearGradient>
        <linearGradient id="prf_tip" x1="48" y1="40" x2="56" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F59E0B"/><stop offset="1" stopColor="#D97706"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconSettings({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="10" fill="url(#set_inner)"/>
      <path d="M32 8v6M32 50v6M8 32h6M50 32h6M15.5 15.5l4.2 4.2M44.3 44.3l4.2 4.2M15.5 48.5l4.2-4.2M44.3 19.7l4.2-4.2" stroke="url(#set_spoke)" strokeWidth="3.5" strokeLinecap="round"/>
      <circle cx="32" cy="32" r="14" stroke="url(#set_ring)" strokeWidth="3" fill="none"/>
      <circle cx="32" cy="32" r="5" fill="url(#set_core)"/>
      <defs>
        <linearGradient id="set_inner" x1="22" y1="22" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#E2E8F0"/><stop offset="1" stopColor="#CBD5E1"/>
        </linearGradient>
        <linearGradient id="set_ring" x1="18" y1="18" x2="46" y2="46" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8"/><stop offset="1" stopColor="#64748B"/>
        </linearGradient>
        <linearGradient id="set_spoke" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8"/><stop offset="1" stopColor="#64748B"/>
        </linearGradient>
        <linearGradient id="set_core" x1="27" y1="27" x2="37" y2="37" gradientUnits="userSpaceOnUse">
          <stop stopColor="#475569"/><stop offset="1" stopColor="#1E293B"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconCommunity({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="20" r="10" fill="url(#com_c)"/>
      <path d="M12 52c0-11 9-18 20-18s20 7 20 18" fill="url(#com_c)" opacity="0.8"/>
      <circle cx="10" cy="26" r="7" fill="url(#com_s)"/>
      <path d="M0 52c0-8 5-12 12-12" stroke="url(#com_s)" strokeWidth="7" fill="none" strokeLinecap="round"/>
      <circle cx="54" cy="26" r="7" fill="url(#com_s)"/>
      <path d="M64 52c0-8-5-12-12-12" stroke="url(#com_s)" strokeWidth="7" fill="none" strokeLinecap="round"/>
      <defs>
        <linearGradient id="com_c" x1="22" y1="10" x2="42" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8"/><stop offset="1" stopColor="#4F46E5"/>
        </linearGradient>
        <linearGradient id="com_s" x1="0" y1="10" x2="20" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A5B4FC"/><stop offset="1" stopColor="#6366F1"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconLearn({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="4" y="8" width="26" height="48" rx="4" fill="url(#lrn_l)"/>
      <rect x="34" y="8" width="26" height="48" rx="4" fill="url(#lrn_r)"/>
      <rect x="4" y="8" width="26" height="48" rx="4" fill="url(#lrn_shine)" opacity="0.2"/>
      <path d="M30 10v44" stroke="#CBD5E1" strokeWidth="2"/>
      <defs>
        <linearGradient id="lrn_l" x1="4" y1="8" x2="30" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399"/><stop offset="1" stopColor="#059669"/>
        </linearGradient>
        <linearGradient id="lrn_r" x1="34" y1="8" x2="60" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6EE7B7"/><stop offset="1" stopColor="#34D399"/>
        </linearGradient>
        <linearGradient id="lrn_shine" x1="4" y1="8" x2="18" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.6"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconDeals({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M32 56S8 42 8 26a14 14 0 0124-9.9A14 14 0 0156 26c0 16-24 30-24 30z" fill="url(#deal_heart)"/>
      <path d="M32 56S8 42 8 26a14 14 0 0124-9.9A14 14 0 0156 26c0 16-24 30-24 30z" fill="url(#deal_shine)" opacity="0.3"/>
      <defs>
        <linearGradient id="deal_heart" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB7185"/><stop offset="1" stopColor="#E11D48"/>
        </linearGradient>
        <linearGradient id="deal_shine" x1="8" y1="8" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconPhotos({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="4" y="12" width="56" height="44" rx="8" fill="url(#ph_bg)"/>
      <path d="M20 12l-6 8h-10v-8z" fill="url(#ph_tab)"/>
      <circle cx="32" cy="36" r="12" fill="url(#ph_lens)"/>
      <circle cx="32" cy="36" r="7" fill="url(#ph_inner)"/>
      <circle cx="28" cy="32" r="2" fill="white" opacity="0.5"/>
      <defs>
        <linearGradient id="ph_bg" x1="4" y1="12" x2="60" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#475569"/><stop offset="1" stopColor="#1E293B"/>
        </linearGradient>
        <linearGradient id="ph_tab" x1="4" y1="12" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#64748B"/><stop offset="1" stopColor="#334155"/>
        </linearGradient>
        <linearGradient id="ph_lens" x1="20" y1="24" x2="44" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8"/><stop offset="1" stopColor="#64748B"/>
        </linearGradient>
        <linearGradient id="ph_inner" x1="25" y1="29" x2="39" y2="43" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1E293B"/><stop offset="1" stopColor="#0F172A"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconCompliance({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M32 4L6 14v18c0 15 11 26 26 28 15-2 26-13 26-28V14L32 4z" fill="url(#cmp_shield)"/>
      <path d="M32 4L6 14v18c0 15 11 26 26 28 15-2 26-13 26-28V14L32 4z" fill="url(#cmp_shine)" opacity="0.25"/>
      <path d="M22 32l7 7 13-13" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="cmp_shield" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D399"/><stop offset="1" stopColor="#059669"/>
        </linearGradient>
        <linearGradient id="cmp_shine" x1="6" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconAI({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M32 4l28 16v24L32 60 4 44V20L32 4z" fill="url(#ai_hex)"/>
      <path d="M32 4l28 16v24L32 60 4 44V20L32 4z" fill="url(#ai_shine)" opacity="0.25"/>
      <circle cx="32" cy="32" r="8" fill="white" opacity="0.2"/>
      <path d="M26 32h12M32 26v12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
      <defs>
        <linearGradient id="ai_hex" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8"/><stop offset="1" stopColor="#4338CA"/>
        </linearGradient>
        <linearGradient id="ai_shine" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconMaterials({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <path d="M8 20L32 8l24 12v28L32 56 8 44V20z" fill="url(#mat_box)"/>
      <path d="M8 20L32 32M32 32L56 20M32 32v24" stroke="white" strokeWidth="2" opacity="0.4"/>
      <path d="M8 20l24 12 24-12" fill="url(#mat_top)"/>
      <defs>
        <linearGradient id="mat_box" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FB923C"/><stop offset="1" stopColor="#C2410C"/>
        </linearGradient>
        <linearGradient id="mat_top" x1="8" y1="20" x2="56" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDBA74"/><stop offset="1" stopColor="#FB923C"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconPermit({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <rect x="10" y="4" width="44" height="56" rx="6" fill="white" stroke="#E5E7EB" strokeWidth="1.5"/>
      <rect x="18" y="4" width="28" height="12" rx="4" fill="url(#prm_clip)"/>
      <rect x="16" y="24" width="22" height="2.5" rx="1.25" fill="#D1D5DB"/>
      <rect x="16" y="30" width="28" height="2" rx="1" fill="#E5E7EB"/>
      <rect x="16" y="35" width="24" height="2" rx="1" fill="#E5E7EB"/>
      <path d="M18 44l5 5 10-10" stroke="url(#prm_check)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <defs>
        <linearGradient id="prm_clip" x1="18" y1="4" x2="46" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#94A3B8"/><stop offset="1" stopColor="#64748B"/>
        </linearGradient>
        <linearGradient id="prm_check" x1="18" y1="39" x2="33" y2="49" gradientUnits="userSpaceOnUse">
          <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0F766E"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function IconTime({ s = 22 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="28" fill="url(#time_face)"/>
      <circle cx="32" cy="32" r="28" fill="url(#time_shine)" opacity="0.2"/>
      <circle cx="32" cy="32" r="24" fill="white" opacity="0.08"/>
      <path d="M32 16v16l10 6" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="32" cy="32" r="3" fill="white"/>
      <defs>
        <linearGradient id="time_face" x1="4" y1="4" x2="60" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60A5FA"/><stop offset="1" stopColor="#2563EB"/>
        </linearGradient>
        <linearGradient id="time_shine" x1="4" y1="4" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" stopOpacity="0.5"/><stop offset="1" stopColor="white" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

// Wrapper — illustrated icons ignore the active bool (colour is baked in),
// but the sidebar dims them slightly when inactive via opacity on the parent span.
const icon = {
  overview:   (_a: boolean) => <IconOverview />,
  pipeline:   (_a: boolean) => <IconPipeline />,
  calendar:   (_a: boolean) => <IconCalendar />,
  messages:   (_a: boolean) => <IconMessages />,
  estimates:  (_a: boolean) => <IconEstimates />,
  invoices:   (_a: boolean) => <IconInvoices />,
  revenue:    (_a: boolean) => <IconRevenue />,
  clients:    (_a: boolean) => <IconClients />,
  properties: (_a: boolean) => <IconProperties />,
  photos:     (_a: boolean) => <IconPhotos />,
  compliance: (_a: boolean) => <IconCompliance />,
  ai:         (_a: boolean) => <IconAI />,
  materials:  (_a: boolean) => <IconMaterials />,
  measure:    (_a: boolean) => <IconMeasure />,
  permit:     (_a: boolean) => <IconPermit />,
  time:       (_a: boolean) => <IconTime />,
  learn:      (_a: boolean) => <IconLearn />,
  deals:      (_a: boolean) => <IconDeals />,
  community:  (_a: boolean) => <IconCommunity />,
  profile:    (_a: boolean) => <IconProfile />,
  settings:   (_a: boolean) => <IconSettings />,
}

// ── Nav config ────────────────────────────────────────────────────────────────
// buildNav consumes TradeConfig from lib/trade-config.ts.
// Never add trade-specific branches here — edit lib/trade-config.ts instead.
function buildNav(nl: number, tradeSlug?: string | null, tradeName?: string | null): NavGroup[] {
  const tc = resolveTradeConfig(tradeSlug, tradeName)
  const t  = tc.terms

  // Resolve icon safely — falls back to clients icon if key not found in map
  function navIcon(key: string): (a: boolean) => React.ReactNode {
    return (icon as Record<string, (a: boolean) => React.ReactNode>)[key] ?? icon.clients
  }

  const groups: NavGroup[] = [
    { title: 'TODAY', items: [
      { label: t.overview  ?? 'Overview',  href: '/dashboard',          icon: icon.overview,  exact: true },
      { label: t.pipeline  ?? 'Pipeline',  href: '/dashboard/pipeline', icon: icon.pipeline,  badge: nl },
      { label: 'Calendar',                 href: '/dashboard/calendar', icon: icon.calendar },
      { label: 'Messages',                 href: '/messages',           icon: icon.messages },
    ]},
    { title: 'MONEY', items: [
      { label: t.estimates ?? 'Estimates', href: '/dashboard/estimates', icon: icon.estimates },
      { label: 'Invoices',                 href: '/dashboard/invoices',  icon: icon.invoices },
      { label: 'Revenue',                  href: '/dashboard/revenue',   icon: icon.revenue,   soon: true },
    ]},
  ]

  // Trade-specific section (MY EQUIPMENT, ROOFING TOOLS, GC TOOLS, etc.)
  if (tc.tradeSection) {
    groups.push({
      title: tc.tradeSection.title,
      items: [
        // First item is always Clients/Customers/Owners/Properties
        { label: t.clients ?? 'Clients', href: '/dashboard/clients', icon: icon.clients },
        // Then trade-specific items from config
        ...tc.tradeSection.items.map(item => ({
          label: item.label,
          href:  item.href,
          icon:  navIcon(item.iconKey),
          soon:  item.soon,
        })),
      ],
    })
  } else {
    // No trade section — Clients lives in MY BUSINESS (default)
    groups.push({ title: 'MY BUSINESS', items: [
      { label: t.clients ?? 'Clients', href: '/dashboard/clients',    icon: icon.clients },
      { label: 'Photo Vault',          href: '/dashboard/photos',     icon: icon.photos,    soon: true },
      { label: 'Compliance',           href: '/dashboard/compliance', icon: icon.compliance, soon: true },
    ]})
  }

  groups.push({ title: 'THE GUILD', items: [
    { label: 'Learn',       href: '/dashboard/learn', icon: icon.learn,     soon: true },
    { label: 'Local Deals', href: '/dashboard/deals', icon: icon.deals,     soon: true },
    { label: 'Community',   href: '/community',       icon: icon.community },
  ]})

  return groups
}

// ── NavLink ───────────────────────────────────────────────────────────────────
function NavLink({ item, active, onNav }: { item: NavItem; active: boolean; onNav?: () => void }) {
  const row = (
    <div className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-100 cursor-pointer"
      style={
        active ? {
          // Strong teal background — clearly active
          background: 'rgba(20,184,166,0.24)',
          boxShadow: 'inset 0 0 0 1px rgba(20,184,166,0.45)',
          color: '#FFFFFF',
        } : item.soon ? {
          color: 'rgba(255,255,255,0.45)',
          cursor: 'default',
        } : {
          color: 'rgba(255,255,255,0.92)',
        }
      }
    >
      {/* Active left bar */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
          style={{ background: '#2DD4BF' }} />
      )}

      {/* Icon — full opacity when active, dimmed when inactive */}
      <span style={{ opacity: active ? 1 : item.soon ? 0.25 : 0.72, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        {item.icon(active)}
      </span>

      {/* Label */}
      <span className="flex-1">{item.label}</span>

      {/* Badge */}
      {(item.badge ?? 0) > 0 && (
        <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full text-[10px] font-bold"
          style={{ background: '#0F766E', color: '#fff' }}>
          {item.badge}
        </span>
      )}

      {/* Soon tag — indigo pill matching mobile drawer */}
      {item.soon && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
          style={{ background: '#4F46E5', color: '#fff', letterSpacing: '0.04em' }}>SOON</span>
      )}
    </div>
  )

  if (item.soon) return row
  return <Link href={item.href} onClick={onNav} className="block">{row}</Link>
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Av({ s, px }: { s: Session; px: number }) {
  const [bg, fg] = avatarColor(s.name || 'P')
  if ((s as any).avatar_url) return <img src={(s as any).avatar_url} alt={s.name} className="rounded-full object-cover flex-shrink-0" style={{ width: px, height: px }} />
  return <div className="rounded-full flex items-center justify-center font-semibold flex-shrink-0" style={{ width: px, height: px, background: bg, color: fg, fontSize: px * 0.38 }}>{initials(s.name || 'P')}</div>
}

// ── Scrollbar CSS ─────────────────────────────────────────────────────────────
const SB = `
  .pg-sb::-webkit-scrollbar{display:none}
  .pg-main::-webkit-scrollbar{width:4px}.pg-main::-webkit-scrollbar-track{background:transparent}
  .pg-main::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:9px}
`

// ── Logo SVG ──────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
      <path d="M16 2L4 7V16C4 22.6 9.4 28.4 16 30C22.6 28.4 28 22.6 28 16V7L16 2Z" fill="url(#lg)"/>
      <text x="8.5" y="21" fontSize="12" fontWeight="700" fill="white" fontFamily="DM Sans,sans-serif">PG</text>
      <defs><linearGradient id="lg" x1="16" y1="2" x2="16" y2="30" gradientUnits="userSpaceOnUse">
        <stop stopColor="#14B8A6"/><stop offset="1" stopColor="#0C5F57"/>
      </linearGradient></defs>
    </svg>
  )
}

// ── Mobile bottom nav ─────────────────────────────────────────────────────────
function MobileNav({ nl, onAdd, onMore }: { nl: number; onAdd: () => void; onMore: () => void }) {
  const p = usePathname()
  const left  = [{ label: 'Home', href: '/dashboard', icon: icon.overview, exact: true, badge: 0 }, { label: 'Pipeline', href: '/dashboard/pipeline', icon: icon.pipeline, badge: nl }]
  const right = [{ label: 'Calendar', href: '/dashboard/calendar', icon: icon.calendar, badge: 0 }]

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{ background: 'rgba(255,255,255,.98)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderTop: '1px solid rgba(0,0,0,.08)', boxShadow: '0 -4px 12px rgba(0,0,0,.06)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-[60px] px-1">
        {left.map(t => {
          const a = t.exact ? p === t.href : p === t.href
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-[3px] flex-1 py-2 relative">
              <span style={{ color: a ? '#0F766E' : '#7C756E' }}>{t.icon(a)}</span>
              <span className="text-[11.5px] font-semibold" style={{ color: a ? '#0F766E' : '#7C756E' }}>{t.label}</span>
              {t.badge > 0 && <span className="absolute top-1.5 right-3 w-[15px] h-[15px] rounded-full flex items-center justify-center" style={{ background: '#0F766E', color: '#fff', fontSize: 11.5, fontWeight: 700 }}>{t.badge}</span>}
            </Link>
          )
        })}

        {/* FAB */}
        <button onClick={onAdd} className="w-[54px] h-[54px] rounded-[16px] flex items-center justify-center -mt-4 active:scale-95 transition-all"
          style={{ background: 'linear-gradient(145deg,#14B8A6,#0A6460)', boxShadow: '0 6px 20px rgba(15,118,110,.45)' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>

        {right.map(t => {
          const a = p === t.href
          return (
            <Link key={t.href} href={t.href} className="flex flex-col items-center gap-[3px] flex-1 py-2">
              <span style={{ color: a ? '#0F766E' : '#7C756E' }}>{t.icon(a)}</span>
              <span className="text-[11.5px] font-semibold" style={{ color: a ? '#0F766E' : '#7C756E' }}>{t.label}</span>
            </Link>
          )
        })}

        <button onClick={onMore} className="flex flex-col items-center gap-[3px] flex-1 py-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7C756E" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
          <span className="text-[11.5px] font-semibold" style={{ color: '#7C756E' }}>More</span>
        </button>
      </div>
    </nav>
  )
}

// ── More drawer ───────────────────────────────────────────────────────────────
function MoreDrawer({ open, onClose, session, nl, dk, onToggleDark }: { open: boolean; onClose: () => void; session: Session | null; nl: number; dk: boolean; onToggleDark?: () => void }) {
  const p = usePathname()
  const [visible, setVisible] = React.useState(false)
  const [closing, setClosing] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setClosing(false)
      // small delay so CSS transition fires
      requestAnimationFrame(() => setVisible(true))
    } else {
      setVisible(false)
    }
  }, [open])

  // Lock body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  function handleClose() {
    setClosing(true)
    setVisible(false)
    setTimeout(() => { setClosing(false); onClose() }, 320)
  }

  if (!open && !closing) return null

  const tradeCity = [session?.trade, session?.city].filter(Boolean).join(' · ')

  return (
    // pointerEvents none once invisible — content underneath is immediately tappable
    <div className="md:hidden fixed inset-0 z-[60]" style={{ pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Backdrop — fades in/out. Only right side (20%+) is tappable to close */}
      <div className="absolute inset-0" onClick={handleClose}
        style={{
          background: 'rgba(4,12,24,.82)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.28s ease',
        }} />

      {/* Sheet — slides in from left, Gmail-style */}
      <div className="absolute top-0 left-0 bottom-0 flex flex-col"
        style={{
          background: 'linear-gradient(180deg, #0F2847 0%, #091525 60%, #060D18 100%)',
          width: '80vw',
          maxWidth: 320,
          boxShadow: '4px 0 40px rgba(0,0,0,.6)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: visible ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)',
          overflowY: 'auto',
        }}>

        {/* Top spacer for status bar */}
        <div className="flex-shrink-0" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }} />

        {/* User identity card */}
        {session && (
          <div className="mx-4 mt-3 mb-1 flex-shrink-0">
            <div className="px-4 py-4 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(20,184,166,.22) 0%, rgba(15,39,80,.8) 100%)',
                border: '1.5px solid rgba(45,212,191,.45)',
                boxShadow: '0 0 20px rgba(20,184,166,.12), inset 0 1px 0 rgba(255,255,255,.08)',
              }}>
              {/* Top row: avatar + name + trade/city */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-shrink-0 rounded-full p-[3px]"
                  style={{ background: 'linear-gradient(135deg, #2DD4BF, #0F766E)' }}>
                  <Av s={session} px={42} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white leading-tight truncate" style={{ fontSize: 17 }}>{session.name}</div>
                  {tradeCity && (
                    <div className="mt-0.5 truncate" style={{ fontSize: 13, color: 'rgba(255,255,255,.62)' }}>{tradeCity}</div>
                  )}
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', marginTop: 2, letterSpacing: '0.03em' }}>
                    {planLabel(session.plan)} Plan
                  </div>
                </div>
              </div>
              {/* Upgrade button — full width, clearly a CTA */}
              {!isPaidPlan(session.plan) && (
                <button className="w-full font-bold rounded-xl active:scale-[.98] transition-all"
                  style={{
                    fontSize: 14,
                    padding: '10px 16px',
                    background: 'linear-gradient(135deg, #D97706, #B45309)',
                    color: '#FFFFFF',
                    border: 'none',
                    boxShadow: '0 3px 12px rgba(217,119,6,.45)',
                    letterSpacing: '0.01em',
                    cursor: 'pointer',
                  }}>
                  Upgrade to Pro ↗
                </button>
              )}
            </div>
          </div>
        )}

        {/* Nav groups — scrollable */}
        <div className="flex-1 overflow-y-auto px-3 pt-3 pb-16" style={{ scrollbarWidth: 'none' }}>
          {buildNav(nl, session?.trade_slug, session?.trade).map((g, gi) => (
            <div key={g.title} className={gi > 0 ? 'mt-8' : 'mt-2'}>
              {/* Section header with line */}
              <div className="flex items-center gap-3 px-2 mb-2">
                <span className="text-[14px] font-black tracking-[.15em] uppercase flex-shrink-0"
                  style={{ color: 'rgba(45,212,191,0.8)' }}>{g.title}</span>
                <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.4) 0%, rgba(45,212,191,0.08) 100%)' }} />
              </div>
              {/* Items */}
              {g.items.map(item => (
                <div key={item.href}>
                  <DrawerNavLink item={item} active={p === item.href} onNav={handleClose} />
                </div>
              ))}
            </div>
          ))}

          {/* Account section */}
          <div className="mt-7">
            <div className="flex items-center gap-3 px-2 mb-2">
              <span className="text-[14px] font-bold tracking-[.12em] uppercase flex-shrink-0"
                style={{ color: 'rgba(45,212,191,0.8)' }}>ACCOUNT</span>
              <div className="flex-1 h-[1px]" style={{ background: 'linear-gradient(90deg, rgba(45,212,191,0.4) 0%, rgba(45,212,191,0.08) 100%)' }} />
            </div>
            <DrawerNavLink item={{ label: 'Profile', href: '/edit-profile', icon: icon.profile }} active={p === '/edit-profile'} onNav={handleClose} />
            {/* Dark mode toggle */}
            <button onClick={() => { if (onToggleDark) onToggleDark() }}
              className="relative flex items-center gap-4 px-4 rounded-2xl w-full mb-[2px]"
              style={{ paddingTop: 13, paddingBottom: 13, background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <span className="flex-shrink-0 flex items-center justify-center w-[28px]" style={{ color: 'rgba(255,255,255,.70)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              </span>
              <span className="flex-1 text-left" style={{ fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,.85)', letterSpacing: '-0.1px' }}>Dark Mode</span>
              <div className="w-10 h-[22px] rounded-full relative flex-shrink-0"
                style={{ background: dk ? '#0F766E' : 'rgba(255,255,255,0.18)', transition: 'background 0.2s' }}>
                <div className="absolute top-[3px] w-4 h-4 bg-white rounded-full shadow"
                  style={{ left: dk ? '22px' : '3px', transition: 'left 0.2s' }} />
              </div>
            </button>
            <DrawerNavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: icon.settings, soon: true }} active={false} onNav={handleClose} />
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Drawer-specific NavLink (larger, bolder than sidebar NavLink) ─────────────
function DrawerNavLink({ item, active, onNav }: { item: NavItem; active: boolean; onNav?: () => void }) {
  const row = (
    <div
      className="relative flex items-center gap-4 px-4 rounded-2xl transition-all duration-150 cursor-pointer mb-[2px]"
      style={{
        paddingTop: 13,
        paddingBottom: 13,
        background: active
          ? 'rgba(20,184,166,0.26)'
          : 'transparent',
        boxShadow: active
          ? 'inset 0 0 0 1.5px rgba(20,184,166,0.55)'
          : 'none',
      }}
    >
      {/* Active left accent — thicker, more visible */}
      {active && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[4px] h-8 rounded-r-full"
          style={{ background: '#2DD4BF', boxShadow: '0 0 8px rgba(45,212,191,0.6)' }} />
      )}

      {/* Icon — full opacity when active, 60% when available, 22% when soon */}
      <span className="flex-shrink-0 flex items-center justify-center w-[28px]"
        style={{ color: active ? '#2DD4BF' : item.soon ? 'rgba(255,255,255,.20)' : 'rgba(255,255,255,.70)' }}>
        {item.icon(active)}
      </span>

      {/* Label — 16px bold, full white active, 85% available, 30% soon */}
      <span className="flex-1 font-bold"
        style={{
          fontSize: 17,
          color: active ? '#ffffff' : item.soon ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.92)',
          letterSpacing: '-0.01em',
        }}>
        {item.label}
      </span>

      {/* Badge */}
      {(item.badge ?? 0) > 0 && (
        <span className="flex items-center justify-center h-[22px] min-w-[22px] px-1.5 rounded-full text-[11px] font-bold"
          style={{ background: '#0F766E', color: '#fff', boxShadow: '0 0 8px rgba(15,118,110,0.5)' }}>
          {item.badge}
        </span>
      )}

      {/* Soon pill — styled intentionally, not as an error */}
      {item.soon && (
        <span className="text-[14px] font-bold px-2.5 py-0.5 rounded-full flex-shrink-0 tracking-wider"
          style={{
            background: 'rgba(99,102,241,0.15)',
            color: 'rgba(165,180,252,0.7)',
            border: '1px solid rgba(99,102,241,0.2)',
          }}>
          SOON
        </span>
      )}
    </div>
  )

  if (item.soon) return row
  return <Link href={item.href} onClick={onNav} className="block">{row}</Link>
}

// ── Quick Add sheet ───────────────────────────────────────────────────────────
function QuickSheet({ open, onClose, onAddLead }: { open: boolean; onClose: () => void; onAddLead: () => void }) {
  if (!open) return null
  const opts = [
    { label: 'New Lead',   sub: 'Add to pipeline',    icon: icon.pipeline,  fn: () => { onClose(); onAddLead() },                                        soon: false },
    { label: 'New Client', sub: 'Add to address book', icon: icon.clients,   fn: () => { onClose(); window.location.href = '/dashboard/clients' }, soon: false },
    { label: 'Estimate',   sub: 'Create a new estimate', icon: icon.estimates, fn: () => { onClose(); window.location.href = '/dashboard/estimates/new' }, soon: false },
    { label: 'Invoice',    sub: 'Create a new invoice',  icon: icon.invoices,  fn: () => { onClose(); window.location.href = '/dashboard/invoices' }, soon: false },
  ]
  return (
    <div className="md:hidden fixed inset-0 z-[60]">
      <div className="absolute inset-0" onClick={onClose} style={{ background: 'rgba(5,15,30,.5)', backdropFilter: 'blur(4px)' }} />
      <div className="absolute bottom-0 left-0 right-0 rounded-t-[28px] bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex justify-center pt-3"><div className="w-10 h-1 rounded-full bg-gray-200" /></div>
        <div className="px-5 pt-3 pb-2">
          <p className="text-[14px] font-bold tracking-[.1em] uppercase mb-4" style={{ color: '#7A746E' }}>What would you like to add?</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {opts.map(o => (
              <button key={o.label} onClick={o.fn} disabled={o.soon}
                className="flex flex-col items-start gap-2 p-4 rounded-2xl text-left active:scale-[.97] transition-all"
                style={{ backgroundColor: o.soon ? '#FAFAF9' : '#F5F4F0', border: `1px solid ${o.soon ? '#EDE9E4' : '#DDD8D2'}`, opacity: o.soon ? .4 : 1 }}>
                <span style={{ color: '#0F766E' }}>{o.icon(false)}</span>
                <div>
                  <div className="text-[14px] font-semibold" style={{ color: '#0A1628' }}>{o.label}</div>
                  <div className="text-[14px] mt-0.5" style={{ color: '#7A746E' }}>{o.sub}</div>
                </div>
              </button>
            ))}
          </div>
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl text-sm font-semibold mb-3" style={{ backgroundColor: '#F5F4F0', color: '#9CA3AF' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}


// ── Status options ─────────────────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { label: 'Available for jobs',  sub: "I'm ready to receive new leads",  dot: '#22C55E', value: 'available' },
  { label: 'Busy (limited jobs)', sub: "I'm taking limited new jobs",      dot: '#F59E0B', value: 'busy' },
  { label: 'On a job',            sub: "I'm currently working on a job",   dot: '#3B82F6', value: 'on_job' },
  { label: 'Not taking jobs',     sub: "I'm not accepting new leads",      dot: '#EF4444', value: 'not_taking' },
  { label: 'Do not disturb',      sub: 'Pause notifications',              dot: '#8B5CF6', value: 'dnd' },
]

function TopHeader({ session, dk, onAddLead, onToggleDark }: {
  session: Session | null; dk: boolean; onAddLead?: () => void; onToggleDark?: () => void
}) {
  const [status,     setStatus]     = React.useState('available')
  const [statusOpen, setStatusOpen] = React.useState(false)
  const [userOpen,   setUserOpen]   = React.useState(false)
  const t   = theme(dk)
  const current = STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0]
  const bg  = t.cardBg
  const bdr = t.cardBorder
  const txt = dk ? '#F1F5F9' : '#0A1628'

  function handleLogout() {
    sessionStorage.removeItem('pg_pro')
    window.location.href = '/login'
  }

  return (
    <div className="flex items-center justify-end gap-2 md:gap-3 px-3 md:px-6 py-2.5 md:py-3 flex-shrink-0"
      style={{ backgroundColor: bg, borderBottom: `1px solid ${bdr}` }}>

      {/* Add New Lead button */}
      {onAddLead && (
        <button onClick={onAddLead}
          className="flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-xl text-[12px] md:text-[13px] font-semibold transition-all hover:opacity-90 active:scale-95"
          style={{ backgroundColor: '#0F766E', color: 'white' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          <span className="hidden sm:inline">Add New Lead</span>
          <span className="sm:hidden">Add Lead</span>
        </button>
      )}

      {/* Available for jobs dropdown */}
      <div className="relative">
        <button onClick={() => { setStatusOpen(o => !o); setUserOpen(false) }}
          className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all hover:opacity-80"
          style={{ border: `1px solid ${bdr}`, color: txt, backgroundColor: bg }}>
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: current.dot }} />
          <span className="hidden md:inline">{current.label}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="hidden md:block">
            <path d={statusOpen ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
          </svg>
        </button>
        {statusOpen && (
          <div className="absolute right-0 top-full mt-1 w-64 rounded-2xl shadow-xl z-50 py-1 overflow-hidden"
            style={{ backgroundColor: bg, border: `1px solid ${bdr}` }}>
            {STATUS_OPTIONS.map(opt => (
              <button key={opt.value}
                onClick={() => { setStatus(opt.value); setStatusOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:opacity-70 transition-opacity">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: opt.dot }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-semibold" style={{ color: txt }}>{opt.label}</div>
                  <div className="text-[14px]" style={{ color: '#9CA3AF' }}>{opt.sub}</div>
                </div>
                {opt.value === status && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Location — hidden on mobile */}
      {session?.city && (
        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium"
          style={{ border: `1px solid ${bdr}`, color: txt }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0zM12 10a1 1 0 100-2 1 1 0 000 2" />
          </svg>
          {session.city}{session.state ? `, ${session.state}` : ''}
        </div>
      )}

      {/* Bell */}
      <div className="relative cursor-pointer flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth="1.8" strokeLinecap="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
          style={{ backgroundColor: '#EF4444' }}>3</span>
      </div>

      {/* Avatar + name — click for user menu */}
      {session && (
        <div className="relative">
          <button onClick={() => { setUserOpen(o => !o); setStatusOpen(false) }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Av s={session} px={28} />
            <span className="text-[14px] font-semibold" style={{ color: txt }}>{session.name?.split(' ')[0]}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth="2.5" strokeLinecap="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {userOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-2xl shadow-xl z-50 overflow-hidden py-1"
              style={{ backgroundColor: bg, border: `1px solid ${bdr}` }}>

              {/* User info */}
              <div className="px-4 py-3 border-b" style={{ borderColor: bdr }}>
                <div className="text-[14px] font-bold" style={{ color: txt }}>{session.name}</div>
                <div className="text-[14px] mt-0.5" style={{ color: '#9CA3AF' }}>{session.email}</div>
              </div>

              {/* Dark mode toggle */}
              <button onClick={() => { if (onToggleDark) onToggleDark(); setUserOpen(false) }}
                className="w-full flex items-center justify-between px-4 py-3 hover:opacity-70 transition-opacity">
                <div className="flex items-center gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth="1.8" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                  <span className="text-[14px] font-medium" style={{ color: txt }}>Dark Mode</span>
                </div>
                {/* Toggle switch */}
                <div className="w-9 h-5 rounded-full relative transition-colors"
                  style={{ backgroundColor: dk ? '#0F766E' : '#D1D5DB' }}>
                  <div className="w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all shadow-sm"
                    style={{ left: dk ? '18px' : '2px' }} />
                </div>
              </button>

              {/* Profile link */}
              <a href="/edit-profile"
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:opacity-70 transition-opacity">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth="1.8" strokeLinecap="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8" />
                </svg>
                <span className="text-[14px] font-medium" style={{ color: txt }}>Profile</span>
              </a>

              {/* Logout */}
              <button onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-4 py-3 hover:opacity-70 transition-opacity border-t"
                style={{ borderColor: bdr }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                </svg>
                <span className="text-[14px] font-medium" style={{ color: '#EF4444' }}>Log out</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main shell ────────────────────────────────────────────────────────────────
export default function DashboardShell({ children, session, newLeads = 0, onAddLead, darkMode, onToggleDark, fullBleed }: {
  children: React.ReactNode; session: Session | null; newLeads?: number; onAddLead?: () => void; darkMode?: boolean; onToggleDark?: () => void; fullBleed?: boolean
}) {
  const p   = usePathname()
  const nav = buildNav(newLeads, session?.trade_slug, session?.trade)
  const [moreOpen,  setMoreOpen]  = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Silently refresh session if trade_slug missing (stale sessionStorage from before trade was set)
  React.useEffect(() => {
    if (!session?.id || session?.trade_slug) return
    fetch(`/api/auth?id=${session.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.session?.trade_slug) {
          sessionStorage.setItem('pg_pro', JSON.stringify(d.session))
          window.location.reload()
        }
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id])

  const isA = (h: string, ex?: boolean) => ex ? p === h : p === h
  const dk = darkMode ?? false
  const t  = theme(dk)

  return (
    <>
      <style>{SB}</style>
      <div className="min-h-screen" style={{ backgroundColor: '#ECEAE5' }}>

        {/* ── DESKTOP ──────────────────────────────────────────────────────── */}
        <div className="hidden md:flex h-screen overflow-hidden">

          <aside className="flex-shrink-0 flex flex-col h-full overflow-hidden"
            style={{ width: 220, background: 'linear-gradient(180deg,#0F2847 0%,#091525 60%,#060D18 100%)', borderRight: '1px solid rgba(255,255,255,.04)' }}>

            {/* Logo */}
            <Link href="/dashboard" className="flex items-center gap-2.5 px-5 pt-5 pb-5 flex-shrink-0 hover:opacity-80 transition-opacity">
              <Logo />
              <div className="flex items-baseline gap-[1px]">
                <span className="font-serif text-[15px] font-bold text-white tracking-tight">ProGuild</span>
                <span className="text-[14px] font-semibold" style={{ color: '#2DD4BF' }}>.ai</span>
              </div>
            </Link>

            {/* Quick Add */}
            <div className="px-4 mb-6 flex-shrink-0">
              <button onClick={onAddLead}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:brightness-110 active:scale-[.98]"
                style={{ background: 'linear-gradient(135deg,#14B8A6 0%,#0A6460 100%)', color: '#fff', boxShadow: '0 4px 14px rgba(20,184,166,.3)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.8" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add New Lead
              </button>
            </div>

            {/* Nav */}
            <div className="flex-1 px-3 pb-4 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
              {nav.map((g, gi) => (
                <div key={g.title} className={gi > 0 ? 'mt-5' : ''}>
                  {/* Section header — teal label + gradient rule line (matches mobile drawer) */}
                  <div className="flex items-center gap-2 px-2 pb-2">
                    <span className="text-[14px] font-bold tracking-[.15em] uppercase flex-shrink-0"
                      style={{ color: 'rgba(45,212,191,0.80)' }}>{g.title}</span>
                    <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg,rgba(45,212,191,0.35),rgba(45,212,191,0.04))' }} />
                  </div>
                  {g.items.map(item => (
                    <div key={item.href} className="mb-0.5">
                      <NavLink item={item} active={isA(item.href, item.exact)} />
                    </div>
                  ))}
                </div>
              ))}

              {/* Account */}
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <div className="flex items-center gap-2 px-2 pb-2">
                  <span className="text-[14px] font-bold tracking-[.15em] uppercase flex-shrink-0"
                    style={{ color: 'rgba(45,212,191,0.80)' }}>ACCOUNT</span>
                  <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg,rgba(45,212,191,0.35),rgba(45,212,191,0.04))' }} />
                </div>
                <div className="mb-0.5"><NavLink item={{ label: 'Profile', href: '/edit-profile', icon: icon.profile }} active={p === '/edit-profile'} /></div>
                <div className="mb-0.5"><NavLink item={{ label: 'Settings', href: '/dashboard/settings', icon: icon.settings, soon: true }} active={false} /></div>
              </div>
            </div>

            {/* Pro identity bottom */}
            {session && (
              <div className="flex-shrink-0 px-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,.07)' }}>
                {/* Upgrade CTA */}
                {(!session.plan || session.plan === 'Free') && (
                  <button className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[12px] font-bold mb-3 transition-all hover:brightness-110 active:scale-[.98]"
                    style={{ background: 'linear-gradient(135deg,#D97706 0%,#B45309 100%)', color: '#fff', boxShadow: '0 3px 10px rgba(217,119,6,.35)' }}>
                    Upgrade to Pro
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
                  </button>
                )}
                {/* Avatar + name */}
                <div className="flex items-center gap-2.5">
                  {/* Avatar with teal gradient ring */}
                  <div style={{ padding: 2, borderRadius: '50%', background: 'linear-gradient(135deg,#2DD4BF,#0F766E)', flexShrink: 0 }}>
                    <Av s={session} px={28} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold text-white truncate">{session.name}</div>
                    <div className="text-[14px] mt-px truncate" style={{ color: 'rgba(255,255,255,.45)' }}>
                      {session.trade || planLabel(session.plan)}{session.city ? ` · ${session.city}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </aside>

          <main className={`pg-main flex-1 flex flex-col ${fullBleed ? 'overflow-hidden' : 'overflow-y-auto'}`} style={{ backgroundColor: t.pageBg, color: dk ? '#F1F5F9' : undefined }}>
            {/* ── Top header bar ─────────────────────────────────────────── */}
            <TopHeader session={session} dk={dk} onAddLead={onAddLead} onToggleDark={onToggleDark} />
            <div className={fullBleed ? 'flex-1 overflow-hidden flex flex-col' : 'flex-1'}>
              {children}
            </div>
          </main>
        </div>

        {/* ── MOBILE ───────────────────────────────────────────────────────── */}
        <div className="md:hidden" suppressHydrationWarning>
          <main className="pb-[68px] min-h-screen" style={{ backgroundColor: t.pageBg }}>
            {children}
          </main>
          <MobileNav nl={newLeads} onAdd={() => setSheetOpen(true)} onMore={() => setMoreOpen(true)} />
          <MoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} session={session} nl={newLeads} dk={dk} onToggleDark={onToggleDark} />
          <QuickSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onAddLead={() => { if (onAddLead) onAddLead() }} />
        </div>
      </div>
    </>
  )
}
