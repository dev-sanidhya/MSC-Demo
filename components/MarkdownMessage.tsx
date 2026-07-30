"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { clsx } from "clsx";

type MarkdownMessageProps = {
  content: string;
  tone?: "user" | "assistant";
};

// Compact, chat-bubble-scaled markdown styling — deliberately not a full
// "prose" article look (no big heading jumps, tight spacing) since this
// renders inside a ~75%-width message bubble, not a document.
function buildComponents(tone: "user" | "assistant"): Components {
  const linkColor = tone === "user" ? "text-accent-strong underline" : "text-accent underline";
  const codeBg = tone === "user" ? "bg-black/15" : "bg-surface-2";

  return {
    p: ({ children }) => <p className="whitespace-pre-wrap [&:not(:first-child)]:mt-2">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={clsx(linkColor, "underline-offset-2 hover:opacity-80")}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>,
    ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => (
      <h1 className="mt-3 text-[15px] font-semibold text-foreground first:mt-0">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-3 text-sm font-semibold text-foreground first:mt-0">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-2.5 text-sm font-semibold text-foreground first:mt-0">{children}</h3>
    ),
    blockquote: ({ children }) => (
      <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-foreground/80 first:mt-0">
        {children}
      </blockquote>
    ),
    hr: () => <hr className="my-3 border-border-subtle" />,
    code: ({ className, children, ...props }) => {
      const isBlock = /language-/.test(className ?? "");
      if (isBlock) {
        return (
          <code
            className={clsx("block overflow-x-auto rounded-lg p-3 text-[13px] leading-relaxed", codeBg)}
            {...props}
          >
            {children}
          </code>
        );
      }
      return (
        <code className={clsx("rounded px-1 py-0.5 font-mono text-[0.85em]", codeBg)} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => <pre className="mt-2 first:mt-0">{children}</pre>,
    table: ({ children }) => (
      <div className="mt-2 overflow-x-auto first:mt-0">
        <table className="min-w-full border-collapse text-[13px]">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="border-b border-border-subtle">{children}</thead>,
    th: ({ children }) => <th className="px-2 py-1 text-left font-semibold text-foreground">{children}</th>,
    td: ({ children }) => <td className="border-t border-border-subtle px-2 py-1 align-top">{children}</td>,
  };
}

export function MarkdownMessage({ content, tone = "assistant" }: MarkdownMessageProps) {
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={buildComponents(tone)}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
