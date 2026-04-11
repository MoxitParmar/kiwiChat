"use client"

import {
  type LucideIcon,
} from "lucide-react"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { OrganizationProfile } from "@clerk/nextjs"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import {shadcn} from "@clerk/themes"

export function NavPages({
  projects,
}: {
  projects: {
    name: string
    url: string
    icon: LucideIcon
  }[]
}) {
  const pathname = usePathname()

  return (
    <>
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Pages</SidebarGroupLabel>
      <SidebarMenu>
      {projects.map((item,i) => {
        const isActive =
          pathname === item.url ||
          (item.url !== "/" && pathname.startsWith(`${item.url}/`))

        return (
          <SidebarMenuItem key={`item.name}-${i}`}>
            {item.name === "Settings1" ? (
              <Dialog>
                <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                  <DialogTrigger asChild>
                    <button className="flex w-full items-center gap-2">
                      <item.icon />
                      <span>{item.name}</span>
                    </button>
                  </DialogTrigger>
                </SidebarMenuButton>

                <DialogContent className="p-0 w-fit max-w-none border-none bg-transparent shadow-none" showCloseButton={false}>
                  {/* <DialogHeader> */}
                  {/* </DialogHeader> */}

                     <VisuallyHidden>
                    <DialogTitle>Organization profile</DialogTitle>
                    </VisuallyHidden>
                  <OrganizationProfile appearance={{theme: shadcn}} routing="hash" />
                </DialogContent>
              </Dialog>
            ) : (
              <SidebarMenuButton asChild isActive={isActive} tooltip={item.name}>
                <Link href={item.url}>
                  <item.icon />
                  <span>{item.name}</span>
                </Link>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        )
      })}
      </SidebarMenu>
      
    </SidebarGroup>
    </>
  )
}
