"use client";

import { Suspense } from "react";
import Chat from "../_components/chat";

function ChatFallback() {
  return <div className="flex items-center justify-center h-full">Loading chat...</div>;
}

export default function Dashboard() {
  return (
    <div>
      <Suspense fallback={<ChatFallback />}>
        <Chat />
      </Suspense>
    </div>
  );
}