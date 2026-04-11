"use client";

import UserDropdown1 from "@/components/auth/user-dropdown-1";
import { useUser } from "@clerk/nextjs";

export function HeaderUserSection() {
  const { user, isLoaded } = useUser();

if (!isLoaded) return <div className="h-10 w-10 animate-pulse rounded-full bg-sidebar-primary scale-90" />;

  return <UserDropdown1 user={user ?? undefined} />;
}
