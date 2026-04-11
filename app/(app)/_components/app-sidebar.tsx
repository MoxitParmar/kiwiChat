"use client"

import { useMemo, useState } from "react"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useMutation, useQuery } from "convex/react"
import { useAuth } from "@clerk/nextjs"
import { api } from "@/convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { PlusIcon, MoreVerticalIcon, Trash2Icon } from "lucide-react"

type ConversationRecord = {
  _id: string
  title: string
  lastMessagePreview: string
  lastMessageAt: number
  createdAt: number
  updatedAt: number
}

type ConversationGroup = {
  period: string
  conversations: ConversationRecord[]
}

function getPeriodLabel(timestamp: number) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const yesterday = today - 24 * 60 * 60 * 1000
  const sevenDaysAgo = today - 7 * 24 * 60 * 60 * 1000
  const thirtyDaysAgo = today - 30 * 24 * 60 * 60 * 1000

  if (timestamp >= today) {
    return "Today"
  }

  if (timestamp >= yesterday) {
    return "Yesterday"
  }

  if (timestamp >= sevenDaysAgo) {
    return "Last 7 days"
  }

  if (timestamp >= thirtyDaysAgo) {
    return "Last month"
  }

  return "Older"
}

function groupConversations(conversations: ConversationRecord[]) {
  const bucketOrder = ["Today", "Yesterday", "Last 7 days", "Last month", "Older"]
  const buckets = new Map<string, ConversationRecord[]>()

  for (const conversation of conversations) {
    const period = getPeriodLabel(conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt)
    const bucket = buckets.get(period) ?? []
    bucket.push(conversation)
    buckets.set(period, bucket)
  }

  return bucketOrder
    .map(period => ({
      period,
      conversations: buckets.get(period) ?? [],
    }))
    .filter(group => group.conversations.length > 0)
}

function ConversationItem({ conversation, onDeleteConversation }: { conversation: ConversationRecord; onDeleteConversation: (id: string) => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeConversationId = searchParams.get("conversationId")

  return (
    <SidebarMenuItem className="group">
      <SidebarMenuButton
        isActive={activeConversationId === conversation._id}
        className="h-auto min-h-14 w-full items-start justify-start rounded-xl px-3 py-2 text-left"
        onClick={() => {
          const params = new URLSearchParams(searchParams.toString())
          params.set("conversationId", conversation._id)
          router.push(`?${params.toString()}`, { scroll: false })
        }}
        type="button"
      >
        <div className="flex w-full min-w-0 flex-col gap-0.5 text-left">
          <span className="truncate text-sm font-medium leading-5">
            {conversation.title}
          </span>
          {conversation.lastMessagePreview ? (
            <span className="line-clamp-2 text-xs leading-4 text-sidebar-foreground/65">
              {conversation.lastMessagePreview}
            </span>
          ) : (
            <span className="text-xs leading-4 text-sidebar-foreground/40">
              No messages yet
            </span>
          )}
        </div>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="absolute right-2 top-2 rounded-md p-1 opacity-0 hover:bg-accent group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
            type="button"
          >
            <MoreVerticalIcon className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onDeleteConversation(conversation._id)
            }}
            className="text-destructive focus:text-destructive"
          >
            <Trash2Icon className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

export function SidebarWithChatHistory() {
  const { isSignedIn, isLoaded } = useAuth()
  const conversations = useQuery(api.chat.listConversations, isSignedIn && isLoaded ? { limit: 100 } : "skip")
  const createConversation = useMutation(api.chat.createConversation)
  const deleteConversation = useMutation(api.chat.deleteConversation)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)

  const groupedConversations = useMemo(() => {
    return groupConversations((conversations ?? []) as ConversationRecord[])
  }, [conversations])

  const handleNewChat = async () => {
    const result = await createConversation({})
    router.push(`${pathname}?conversationId=${result.conversationId}`, { scroll: false })
  }

  const handleDeleteConversation = async () => {
    if (!deletingConversationId) return

    try {
      await deleteConversation({ conversationId: deletingConversationId as any })
      
      const activeConversationId = searchParams.get("conversationId")
      if (activeConversationId === deletingConversationId) {
        const params = new URLSearchParams(searchParams.toString())
        params.delete("conversationId")
        router.push(pathname + (params.toString() ? `?${params.toString()}` : ""), { scroll: false })
      }
      
      setDeletingConversationId(null)
    } catch (error) {
      console.error("Failed to delete conversation:", error)
      setDeletingConversationId(null)
    }
  }

  return (
    <Sidebar variant="floating">
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-2 py-4">
        <div className="flex flex-row items-center gap-1 px-2">
          <svg width="32" height="32" viewBox="0 0 226 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-primary scale-60">
            <line x1="17.5" y1="-17.5" x2="241.533" y2="-17.5" transform="matrix(0.000335564 1 -1 0.00027096 190.723 0.00474548)" stroke="currentColor" strokeWidth="35" strokeLinecap="round"/>
            <line x1="17.5" y1="-17.5" x2="241.533" y2="-17.5" transform="matrix(0.000335564 1 -1 0.00027096 115.788 0.00643921)" stroke="currentColor" strokeWidth="35" strokeLinecap="round"/>
            <line x1="17.5" y1="-17.5" x2="241.533" y2="-17.5" transform="matrix(0.000452024 1 -1 0.00020115 40.81 0.00643921)" stroke="currentColor" strokeWidth="35" strokeLinecap="round"/>
            <line x1="17.5001" y1="63.2933" x2="57.0494" y2="19.3172" stroke="currentColor" strokeWidth="35" strokeLinecap="round"/>
          </svg>
          <div className="text-md font-base tracking-tight text-primary">
            chat.1ll.app
          </div>
        </div>
        {/* <Button variant="ghost" className="size-8">
          <Search className="size-4" />
        </Button> */}
      </SidebarHeader>

      <SidebarContent>
        <div className="px-4">
          <Button
            variant="outline"
            className="mb-4 flex w-full items-center gap-2"
            onClick={handleNewChat}
            type="button"
          >
            <PlusIcon className="size-4" />
            <span>New Chat</span>
          </Button>
        </div>

        {conversations === undefined ? (
          <div className="px-4 text-sm text-muted-foreground">Loading chats...</div>
        ) : groupedConversations.length === 0 ? (
          <div className="px-4 text-sm text-muted-foreground">
            No conversations yet. Start a new chat to see it here.
          </div>
        ) : (
          groupedConversations.map((group: ConversationGroup) => (
            <SidebarGroup key={group.period}>
              <SidebarGroupLabel>{group.period}</SidebarGroupLabel>
              <SidebarMenu>
                {group.conversations.map((conversation) => (
                  <ConversationItem conversation={conversation} key={conversation._id} onDeleteConversation={setDeletingConversationId} />
                ))}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <Dialog open={deletingConversationId !== null} onOpenChange={(open) => !open && setDeletingConversationId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingConversationId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConversation}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sidebar>
  )
}