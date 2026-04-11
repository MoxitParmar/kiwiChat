

import { HeaderUserSection } from './_components/header-user-section'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggleButton } from './_components/theme-toggle'
import React from 'react'
import { AppSidebar } from './_components/app-sidebar'

const layout = ({ children }: { children: React.ReactNode }) => {
  return (
      //   <SidebarProvider >
      // <AppSidebar/>
      // <SidebarInset>
      <>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12  px-4 ">
          <div className="flex items-center gap-2">
            {/*<SidebarTrigger className="-ml-1 " variant={"outline"} />*/}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <HeaderUserSection />
          </div>
        </header>
          <div>{children}</div>
      </>
    //   </SidebarInset>
    // </SidebarProvider>
  )
}

export default layout