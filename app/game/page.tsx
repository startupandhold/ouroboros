import { OuroSnakeGame } from "@/components/OuroSnakeGame";
import { SolanaProviders } from "@/components/SolanaProviders";
import "../ouro-snake.css";

export const metadata = {
  title: "Ouroboros Snake",
  description:
    "A snake game with a twist — eat pump tokens, then devour yourself tail-first.",
};

export default function GamePage() {
  return (
    <SolanaProviders>
      <OuroSnakeGame />
    </SolanaProviders>
  );
}
