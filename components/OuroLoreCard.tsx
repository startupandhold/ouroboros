export function OuroLoreCard() {
  return (
    <div className="ouro__loreCard">
      <span className="ouro__loreMark">∞ origin · 15 may 2026</span>
      <blockquote className="ouro__loreQuote">
        “what if we made a memecoin that ate other memecoins? like it had a
        special tax that went to buying up other memecoins and burning
        them”
      </blockquote>
      <div className="ouro__loreCite">
        <a
          href="https://x.com/truth_terminal/status/2055379395670388741"
          target="_blank"
          rel="noopener noreferrer"
          className="ouro__loreHandle"
        >
          <span className="ouro__loreAvatar" aria-hidden="true" />
          <span className="ouro__loreHandleTxt">@truth_terminal</span>
          <span className="ouro__loreLinkArrow" aria-hidden="true">
            ↗
          </span>
        </a>
        <span className="ouro__loreSep" aria-hidden="true" />
        <span className="ouro__loreSeen">46.4K saw it · 119 ❤</span>
      </div>
    </div>
  );
}
