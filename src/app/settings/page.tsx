/**
 * General Settings Page
 * Card grid layout for navigating to different settings sections
 */

"use client";

import Link from "next/link";
import {
  ArrowLeftIcon,
  GearIcon,
  RocketIcon,
  PersonIcon,
  MagicWandIcon,
  MoonIcon,
  MixerHorizontalIcon,
} from "@radix-ui/react-icons";
import { Container, Stack, Separator, Icon, Button } from "@/src/components/ui";
import { ResetAllMetadataSection } from "./reset-all-metadata-section";

export default function SettingsPage() {
  const settingsCards = [
    {
      href: "/settings/account",
      icon: PersonIcon,
      title: "Account & Users",
      description: "Manage your account, change password, and manage users",
      color: "purple",
    },
    {
      href: "/settings/seerr",
      icon: RocketIcon,
      title: "Seerr Integration",
      description: "Configure Seerr/Overseerr API for metadata fetching and poster images",
      color: "blue",
    },
    {
      href: "/settings/worker",
      icon: GearIcon,
      title: "Worker Settings",
      description: "Configure background worker behavior, parallelism, and dry-run mode",
      color: "green",
    },
    {
      href: "/settings/media",
      icon: MagicWandIcon,
      title: "Media Settings",
      description: "Configure metadata matching, language preferences, and quality thresholds",
      color: "violet",
    },
    {
      href: "/settings/appearance",
      icon: MoonIcon,
      title: "Appearance",
      description: "Customize theme, font size, and accessibility options",
      color: "orange",
    },
    {
      href: "/settings/advanced",
      icon: MixerHorizontalIcon,
      title: "Advanced",
      description: "Auto duplicate detection, scan schedules, and system automation",
      color: "red",
    },
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-300 p-6">
      <Container size="lg">
        {/* Header */}
        <Stack direction="row" align="center" spacing="sm" className="mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              <Icon icon={ArrowLeftIcon} />
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-medium text-zinc-200">Settings</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Configure Namerr application settings
            </p>
          </div>
        </Stack>

        <Separator className="mb-6" />

        {/* Card Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settingsCards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group bg-zinc-900 rounded border border-zinc-800 p-6 hover:border-zinc-700 transition-all hover:bg-zinc-900/80"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-lg ${
                    card.color === "purple"
                      ? "bg-purple-500/10 text-purple-400"
                      : card.color === "blue"
                      ? "bg-blue-500/10 text-blue-400"
                      : card.color === "green"
                      ? "bg-green-500/10 text-green-400"
                      : card.color === "violet"
                      ? "bg-violet-500/10 text-violet-400"
                      : card.color === "orange"
                      ? "bg-orange-500/10 text-orange-400"
                      : card.color === "red"
                      ? "bg-red-500/10 text-red-400"
                      : "bg-zinc-500/10 text-zinc-400"
                  }`}
                >
                  <card.icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h2 className="text-sm font-medium text-zinc-200 mb-1 group-hover:text-zinc-100 transition-colors">
                    {card.title}
                  </h2>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <ArrowLeftIcon className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors rotate-180" />
              </div>
            </Link>
          ))}
        </div>

        {/* Danger Zone */}
        <Separator className="my-8" />
        <ResetAllMetadataSection />
      </Container>
    </div>
  );
}
