"use client";

type MobileSheetProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function MobileSheet({ open, onClose, children }: MobileSheetProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end md:hidden">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border-t border-border-subtle bg-surface shadow-xl">
        <div className="flex shrink-0 justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
