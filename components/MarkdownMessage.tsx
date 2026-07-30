import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
// Imported here (JS import) rather than via CSS `@import` in globals.css —
// Turbopack's CSS resolver fails to reach this path inside node_modules
// even though Node itself resolves it fine; a JS-level import is the
// documented, working way to pull in a package's CSS in Next.js.
import "katex/dist/katex.min.css";

type MarkdownMessageProps = { content: string };

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div className="markdown-message min-w-0 overflow-hidden">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener" className="font-medium text-accent-strong underline decoration-accent/50 underline-offset-2 hover:decoration-accent">
              {children}
            </a>
          ),
          code: ({ children, className, ...props }) => (
            <code {...props} className={`${className ?? ""} rounded bg-background/70 px-1.5 py-0.5 font-mono text-[0.85em] text-accent-strong`}>
              {children}
            </code>
          ),
          pre: ({ children }) => <pre className="overflow-x-auto rounded-lg border border-border-subtle bg-background/70 p-3 font-mono text-xs leading-relaxed">{children}</pre>,
          table: ({ children }) => <div className="overflow-x-auto rounded-lg border border-border-subtle"><table className="w-full border-collapse text-left text-xs">{children}</table></div>,
          th: ({ children }) => <th className="border-b border-border-strong bg-background/60 px-3 py-2 font-semibold text-foreground">{children}</th>,
          td: ({ children }) => <td className="border-b border-border-subtle px-3 py-2 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
