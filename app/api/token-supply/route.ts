import { Connection } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { DEFAULT_RPC, OUROBOROS_MINT } from "@/lib/constants";

/** Pump.fun genesis UI supply (1B tokens, 6 decimals). */
export const ORIGINAL_UI_SUPPLY = 1_000_000_000;

export const revalidate = 45;

export async function GET() {
  try {
    const connection = new Connection(DEFAULT_RPC, "confirmed");
    const supply = await connection.getTokenSupply(OUROBOROS_MINT);
    const current = supply.value.uiAmount ?? 0;
    const eaten = Math.max(0, ORIGINAL_UI_SUPPLY - current);
    const eatenPct =
      ORIGINAL_UI_SUPPLY > 0 ? (eaten / ORIGINAL_UI_SUPPLY) * 100 : 0;

    return NextResponse.json({
      mint: OUROBOROS_MINT.toBase58(),
      original: ORIGINAL_UI_SUPPLY,
      current,
      eaten,
      eatenPct,
      decimals: supply.value.decimals,
      raw: supply.value.amount,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "supply fetch failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
