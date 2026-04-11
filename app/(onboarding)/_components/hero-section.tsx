"use client";

import { Button } from "@/components/ui/button";
import { Authenticated, Unauthenticated } from "convex/react";
import { motion, type Variants } from "framer-motion";
import Link  from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import SignIn1 from "@/components/auth/sign-in-1";

export function NewHeroSection() {
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" },
    },
  };

  const floatingVariants: Variants = {
    animate: {
      y: [0, -10, 0],
      transition: {
        duration: 3,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };
  const [open, setOpen] = useState(false);

  return (
    <section className="relative overflow-hidden bg-linear-to-br from-background via-background to-primary/5 px-4 py-20 md:py-32 w-full h-screen">
      <div className="mx-auto max-w-7xl">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10 text-center"
        >
          <motion.div variants={itemVariants} className="mb-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              Welcome to the Future
            </span>
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl"
          >
            Transform Your Workflow 
            <br />
            <span className="bg-linear-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              With Agentic AI Chat
            </span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mx-auto mb-20 max-w-2xl text-lg text-muted-foreground md:text-xl "
          >
            We help you automate tasks, with multi-step workflows, and boost your productivity with our intelligent AI Agent.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <Unauthenticated>
                {/* <SignInButton mode="modal" forceRedirectUrl="/dashboard"> */}

                {/* <Button size="lg" className="group gap-2" onClick={}>
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button> */}
      <Button
        size="lg"
        className="group gap-2"
        onClick={() => setOpen(true)}
      >
        Get Started
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen} >
                  <VisuallyHidden>
            <DialogTitle>Sign In</DialogTitle>
          </VisuallyHidden>
        <DialogContent className="p-0 w-fit max-w-none border-none bg-transparent shadow-none" showCloseButton={false}>
          <SignIn1 enabledOAuthStrategies={["oauth_google", "oauth_github"]} />
        </DialogContent>
      </Dialog>
          
              {/* </SignInButton> */}
            </Unauthenticated>
            <Authenticated>
              <Link href="/dashboard">
                <Button size="lg" className="group gap-2">
                  Go to Dashboard
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
            </Authenticated>
          </motion.div>

          <motion.div
            variants={floatingVariants}
            animate="animate"
            className="mt-26 flex items-center justify-center gap-8 text-sm text-muted-foreground"
          >
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">10K+</div>
              <div>Happy Customers</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">500+</div>
              <div>Projects Completed</div>
            </div>
            <div className="h-8 w-px bg-border" />
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">99%</div>
              <div>Satisfaction Rate</div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
