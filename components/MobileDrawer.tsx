"use client";

type MobileDrawerProps = {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function MobileDrawer({ open, onClose, children }: MobileDrawerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex md:hidden">
      <button
        type="button"
        aria-label="Close chat list"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex h-full max-w-[85vw] flex-col shadow-xl">
        {children}
      </div>
    </div>
  );
}
