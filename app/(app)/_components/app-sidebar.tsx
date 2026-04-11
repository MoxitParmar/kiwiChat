"use client";

import * as React from "react";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { NavPages } from "./nav-pages";
import OrganizationSwitcher1 from "@/components/auth/organization-switcher-1";

const pages = [
  {
    name: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Projects",
    url: "/projects",
    icon: FolderOpen,
  },
  {
    name: "Activity",
    url: "/activity",
    icon: Users,
  },

];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {

  {
    return (
      <Sidebar
        collapsible="offcanvas"
        variant="floating"
        {...props}
        suppressHydrationWarning
      >
        <SidebarHeader>
          {/* <TeamSwitcher /> */}
        </SidebarHeader>
        <SidebarContent>
          <NavPages projects={pages} />
        </SidebarContent>
      </Sidebar>
    );
  }
}

