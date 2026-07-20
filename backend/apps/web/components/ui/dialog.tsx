"use client";

import {
  Dialog as RACDialog,
  Heading,
  Modal,
  ModalOverlay,
  Text,
} from "react-aria-components";

import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
};

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <ModalOverlay
      isOpen={open}
      onOpenChange={onOpenChange}
      isDismissable
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <Modal className="w-full max-w-lg outline-none">{children}</Modal>
    </ModalOverlay>
  );
}

export function DialogContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <RACDialog
      className={cn(
        "rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-5 shadow-[0_1px_2px_rgba(18,22,28,0.06),0_8px_24px_rgba(18,22,28,0.12)] outline-none",
        className,
      )}
    >
      {children}
    </RACDialog>
  );
}

export function DialogHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5 pb-4", className)}>{children}</div>
  );
}

export function DialogTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Heading
      slot="title"
      className={cn("text-base font-semibold leading-none tracking-tight", className)}
    >
      {children}
    </Heading>
  );
}

export function DialogDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text
      slot="description"
      className={cn("text-sm text-[var(--color-muted-foreground)]", className)}
    >
      {children}
    </Text>
  );
}

export function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("pb-4", className)}>{children}</div>;
}

export function DialogFooter({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}>
      {children}
    </div>
  );
}
