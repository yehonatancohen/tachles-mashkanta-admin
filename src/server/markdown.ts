/** Minimal Markdown → HTML for the agent's reports (see .claude/skills/conversion-review, Step 7):
 * headings, bullet/numbered lists, paragraphs, **bold**, `code` and links. Input is escaped first,
 * so the agent's text can never inject markup; only http(s) links are turned into anchors. */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(raw: string): string {
  let s = escapeHtml(raw);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  // Bare URLs not already inside an href or anchor text.
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer"><bdi>$2</bdi></a>');
  return s;
}

export function renderMarkdown(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };

  for (const line of md.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);

    if (!trimmed) {
      flushPara();
      closeList();
    } else if (heading) {
      flushPara();
      closeList();
      const level = Math.min(4, heading[1].length + 1); // ## → h3: the page already owns h1/h2
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1])}</li>`);
    } else if (list && /^\s{2,}/.test(line)) {
      // Continuation line of the previous list item.
      out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, `<br>${inline(trimmed)}</li>`);
    } else {
      closeList();
      para.push(trimmed);
    }
  }
  flushPara();
  closeList();
  return out.join('\n');
}
