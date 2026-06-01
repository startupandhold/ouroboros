import Image from "next/image";
import {
  COIN_COMMUNITY_URL,
  GITHUB_URL,
  PUMP_COIN_URL,
  X_COMMUNITY_URL,
} from "@/lib/siteLinks";

type OuroSocialLinksProps = {
  className?: string;
};

export function OuroSocialLinks({ className }: OuroSocialLinksProps) {
  return (
    <div
      className={className ? `top-bar-links ${className}` : "top-bar-links"}
      aria-label="Community links"
    >
      <a
        href={PUMP_COIN_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="top-bar-icon"
        aria-label="Ouroboros on Pump.fun"
      >
        <Image
          src="/image/pumpfun_icon.png"
          alt=""
          width={20}
          height={20}
          aria-hidden
        />
      </a>
      <a
        href={COIN_COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="top-bar-icon top-bar-icon--coin-community"
        aria-label="Ouroboros on Coin Communities"
        title="Coin Communities"
      >
        <Image
          src="/image/pump_community.svg"
          alt=""
          width={20}
          height={20}
          aria-hidden
        />
      </a>
      <a
        href={X_COMMUNITY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="top-bar-icon"
        aria-label="Ouroboros X community"
      >
        <Image
          src="/image/x_icon.png"
          alt=""
          width={20}
          height={20}
          aria-hidden
        />
      </a>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="top-bar-icon top-bar-icon--github"
        aria-label="Ouroboros on GitHub"
      >
        <Image
          src="/image/github.png"
          alt=""
          width={20}
          height={20}
          aria-hidden
        />
      </a>
    </div>
  );
}
