"use client";

import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Menu, User2 } from "lucide-react";
import { useAuth, useUser } from "@clerk/nextjs";
import { UserResource } from "@clerk/types";
import { User } from "@clerk/nextjs/server";
import { Button } from "@/components/ui/button";
import { DropdownMenuContentProps } from "@radix-ui/react-dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import ProfileForm1 from "./profile-form-1";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger, } from '@/components/ui/dialog'
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"

export type UserDropdown1Props = {
  /**
   * A Clerk [User](https://clerk.com/docs/reference/javascript/user) object retrieved from either the frontend or backend SDK.
   **/
  user?: Partial<UserResource> | Partial<User>;
  /**
   * [DropdownMenuContent](https://www.radix-ui.com/primitives/docs/components/dropdown-menu#content)
   * props that drill down to the content of the UserDropdown.
   * @default {side: "bottom", align: "end"}
   **/
  dropdownMenuContentProps?: DropdownMenuContentProps;
};

export default function UserDropdown1({
  user: propUser,
  dropdownMenuContentProps = { side: "bottom", align: "end" },
}: UserDropdown1Props) {
  const { signOut } = useAuth();
  const [open, setOpen] = React.useState(false);

  const { user: hookUser, isLoaded: hookLoaded } = useUser();

  const user = propUser ?? hookUser;
  const isLoaded = propUser ? true : hookLoaded;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="flex flex-row w-20 h-11 items-center justify-between rounded-3xl py-1.5 px-3 gap-1 transition-all hover:shadow-md duration-100 scale-90"
          variant="outline"
        >
          <div className="w-1/2">
            <Menu className="size-5" />
          </div>

          <div className="w-1/2">
            {isLoaded && user ? (
              <Avatar className="aspect-square size-8 rounded-full bg-slate-400">
                <AvatarImage
                  src={user.imageUrl}
                  className="object-cover"
                  alt="User profile picture"
                />
                <AvatarFallback />
              </Avatar>
            ) : (
              <Skeleton className={`size-8 rounded-full`} />
            )}
          </div>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-full" {...dropdownMenuContentProps}>
        <DropdownMenuItem onClick={() => setOpen(true)}>
          <User2 className="mr-1" size={20} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={() => signOut()}>
          <LogOut className="mr-1" size={20} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 w-fit max-w-none border-none bg-transparent shadow-none" showCloseButton={false}>
          {/* <DialogHeader> */}
          <VisuallyHidden>
            <DialogTitle>Profile</DialogTitle>
          </VisuallyHidden>
            {/* <DialogDescription>Update your profile information</DialogDescription> */}
          {/* </DialogHeader> */}
          { user && <ProfileForm1 user={user} /> }
          {/* <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter> */}
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
