"use client";

import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { toast } from "sonner";


export default function GlobalError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error:", error);

    toast("Something went wrong");
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-screen gap-4">
      <h2 className="text-xl font-semibold">
        Something went wrong
      </h2>

      <Button
        onClick={() => reset()}
        className="px-4 py-2 rounded"
        variant={"outline"}
      >
        Try again
      </Button>
    </div>
  );
}