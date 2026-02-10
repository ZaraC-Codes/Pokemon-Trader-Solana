/**
 * Update ball prices and catch rates.
 *
 * Usage:
 *   # Set a single ball price (SOLCATCH, 9 decimals):
 *   npx ts-node scripts/solana/set-prices.ts --ball-price 0 2000000000
 *
 *   # Set a single catch rate (0-100):
 *   npx ts-node scripts/solana/set-prices.ts --catch-rate 0 5
 *
 *   # Set all prices at once (Poke, Great, Ultra, Master):
 *   npx ts-node scripts/solana/set-prices.ts --all-prices 1000000000,10000000000,25000000000,49900000000
 *
 *   # Set all catch rates at once:
 *   npx ts-node scripts/solana/set-prices.ts --all-rates 2,20,50,99
 *
 *   # Set max active Pokemon (1-20):
 *   npx ts-node scripts/solana/set-prices.ts --max-pokemon 10
 */
import { loadProgram, deriveGamePDAs, BALL_NAMES, formatTokenAmount } from "./common";

interface PriceUpdate {
  ballType: number;
  price: number;
}

interface RateUpdate {
  ballType: number;
  rate: number;
}

async function main() {
  const args = process.argv.slice(2);

  const priceUpdates: PriceUpdate[] = [];
  const rateUpdates: RateUpdate[] = [];
  let maxPokemon: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ball-price" && args[i + 1] && args[i + 2]) {
      priceUpdates.push({
        ballType: parseInt(args[++i]),
        price: parseInt(args[++i]),
      });
    }
    if (args[i] === "--catch-rate" && args[i + 1] && args[i + 2]) {
      rateUpdates.push({
        ballType: parseInt(args[++i]),
        rate: parseInt(args[++i]),
      });
    }
    if (args[i] === "--all-prices" && args[i + 1]) {
      const prices = args[++i].split(",").map(Number);
      if (prices.length !== 4) {
        console.error("Error: --all-prices requires exactly 4 comma-separated values");
        process.exit(1);
      }
      for (let j = 0; j < 4; j++) {
        priceUpdates.push({ ballType: j, price: prices[j] });
      }
    }
    if (args[i] === "--all-rates" && args[i + 1]) {
      const rates = args[++i].split(",").map(Number);
      if (rates.length !== 4) {
        console.error("Error: --all-rates requires exactly 4 comma-separated values");
        process.exit(1);
      }
      for (let j = 0; j < 4; j++) {
        rateUpdates.push({ ballType: j, rate: rates[j] });
      }
    }
    if (args[i] === "--max-pokemon" && args[i + 1]) {
      maxPokemon = parseInt(args[++i]);
    }
  }

  if (priceUpdates.length === 0 && rateUpdates.length === 0 && maxPokemon === undefined) {
    console.error(
      "Usage:\n" +
      "  npx ts-node scripts/solana/set-prices.ts --ball-price <type> <price>\n" +
      "  npx ts-node scripts/solana/set-prices.ts --catch-rate <type> <rate>\n" +
      "  npx ts-node scripts/solana/set-prices.ts --all-prices <p0>,<p1>,<p2>,<p3>\n" +
      "  npx ts-node scripts/solana/set-prices.ts --all-rates <r0>,<r1>,<r2>,<r3>\n" +
      "  npx ts-node scripts/solana/set-prices.ts --max-pokemon <1-20>\n" +
      "\n" +
      "Ball types: 0=Poke, 1=Great, 2=Ultra, 3=Master\n" +
      "Prices are in SOLCATCH atomic units (9 decimals, e.g. 1000000000 = 1.0 SOLCATCH)\n" +
      "Catch rates are 0-100 (percent)"
    );
    process.exit(1);
  }

  const { program, provider, authority } = loadProgram();
  const pdas = deriveGamePDAs(program.programId);

  // Show current state first
  const gameConfig = await program.account.gameConfig.fetch(pdas.gameConfig);
  console.log("=== Current Configuration ===");
  for (let i = 0; i < 4; i++) {
    console.log(
      `  ${BALL_NAMES[i].padEnd(12)} Price: ${formatTokenAmount(gameConfig.ballPrices[i])} SolBalls, Rate: ${gameConfig.catchRates[i]}%`
    );
  }
  console.log(`  Max Active Pokemon: ${gameConfig.maxActivePokemon}`);
  console.log("");

  // Apply price updates
  for (const update of priceUpdates) {
    if (update.ballType < 0 || update.ballType > 3) {
      console.error(`  [SKIP] Invalid ball type: ${update.ballType}`);
      continue;
    }
    if (update.price <= 0) {
      console.error(`  [SKIP] Price must be > 0`);
      continue;
    }

    try {
      const tx = await program.methods
        .setBallPrice(update.ballType, new (await import("@coral-xyz/anchor")).BN(update.price))
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
        })
        .rpc();

      console.log(
        `  [OK] ${BALL_NAMES[update.ballType]} price → ${formatTokenAmount(update.price)} SolBalls — TX: ${tx}`
      );
    } catch (err: any) {
      console.error(
        `  [FAIL] ${BALL_NAMES[update.ballType]} price → ${err.message || err}`
      );
    }
  }

  // Apply rate updates
  for (const update of rateUpdates) {
    if (update.ballType < 0 || update.ballType > 3) {
      console.error(`  [SKIP] Invalid ball type: ${update.ballType}`);
      continue;
    }
    if (update.rate < 0 || update.rate > 100) {
      console.error(`  [SKIP] Catch rate must be 0-100`);
      continue;
    }

    try {
      const tx = await program.methods
        .setCatchRate(update.ballType, update.rate)
        .accounts({
          authority,
          gameConfig: pdas.gameConfig,
        })
        .rpc();

      console.log(
        `  [OK] ${BALL_NAMES[update.ballType]} catch rate → ${update.rate}% — TX: ${tx}`
      );
    } catch (err: any) {
      console.error(
        `  [FAIL] ${BALL_NAMES[update.ballType]} catch rate → ${err.message || err}`
      );
    }
  }

  // Apply max active pokemon
  if (maxPokemon !== undefined) {
    if (maxPokemon < 1 || maxPokemon > 20) {
      console.error(`  [SKIP] Max active Pokemon must be 1-20`);
    } else {
      try {
        const tx = await program.methods
          .setMaxActivePokemon(maxPokemon)
          .accounts({
            authority,
            gameConfig: pdas.gameConfig,
          })
          .rpc();

        console.log(`  [OK] Max active Pokemon → ${maxPokemon} — TX: ${tx}`);
      } catch (err: any) {
        console.error(`  [FAIL] Max active Pokemon → ${err.message || err}`);
      }
    }
  }

  // Show updated state
  console.log("");
  const updatedConfig = await program.account.gameConfig.fetch(pdas.gameConfig);
  console.log("=== Updated Configuration ===");
  for (let i = 0; i < 4; i++) {
    console.log(
      `  ${BALL_NAMES[i].padEnd(12)} Price: ${formatTokenAmount(updatedConfig.ballPrices[i])} SolBalls, Rate: ${updatedConfig.catchRates[i]}%`
    );
  }
  console.log(`  Max Active Pokemon: ${updatedConfig.maxActivePokemon}`);
}

main().catch(console.error);
