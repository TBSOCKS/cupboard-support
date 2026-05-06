'use client';

import React from 'react';

/**
 * Tiny markdown renderer scoped to what chat messages actually use:
 * - **bold** and *italic*
 * - [text](url) links
 * - bulleted lists (lines starting with - or *)
 * - line breaks (preserved)
 *
 * No images, no code blocks, no headers — chat doesn't need them and
 * a heavier library would be overkill for this.
 */
export function MarkdownText({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === 'list') {
          return (
            <ul
              key={i}
              className="list-disc pl-5 my-1.5 space-y-1 marker:text-cupboard-warm"
            >
              {block.items.map((item, j) => (
                <li key={j}>{renderInline(item)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="my-0 first:mt-0 last:mb-0 [&:not(:last-child)]:mb-2">
            {renderInline(block.text)}
          </p>
        );
      })}
    </>
  );
}

type Block =
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let currentList: string[] | null = null;
  let currentParagraph: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length > 0) {
      blocks.push({
        type: 'paragraph',
        text: currentParagraph.join(' ').trim(),
      });
      currentParagraph = [];
    }
  };
  const flushList = () => {
    if (currentList && currentList.length > 0) {
      blocks.push({ type: 'list', items: currentList });
      currentList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const bulletMatch = line.match(/^[-*•]\s+(.*)/);

    if (bulletMatch) {
      flushParagraph();
      if (!currentList) currentList = [];
      currentList.push(bulletMatch[1]);
      continue;
    }

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    flushList();
    currentParagraph.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
}

/**
 * Render a single line of text with inline formatting:
 * **bold**, *italic*, and [text](url) links.
 */
function renderInline(text: string): React.ReactNode {
  // Tokenize by markdown patterns. Order matters — bold (**) before italic (*).
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(pattern).filter(Boolean);

  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^\*[^*]+\*$/.test(part)) {
      return (
        <em key={i} className="italic">
          {part.slice(1, -1)}
        </em>
      );
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      // Only allow http(s) links to be safe
      if (!/^https?:\/\//i.test(href)) {
        return <span key={i}>{label}</span>;
      }
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-cupboard-warm/60 underline-offset-2 hover:decoration-cupboard-deep"
        >
          {label}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
