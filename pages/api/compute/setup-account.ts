import type { NextApiRequest, NextApiResponse } from "next";
import { getComputeBroker } from "@/lib/0g-compute";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, amount, provider: providerAddress, service } = req.body;

  if (!action) {
    return res.status(400).json({
      error: "action is required (create-ledger | deposit | transfer | get-balance)",
    });
  }

  try {
    const broker = await getComputeBroker();

    if (action === "create-ledger") {
      const depositAmount = Number(amount) || 0.5;
      await broker.ledger.addLedger(depositAmount);
      return res.status(200).json({
        success: true,
        action: "create-ledger",
        depositAmount,
        message: `Ledger created with ${depositAmount} A0GI`,
      });
    }

    if (action === "deposit") {
      const depositAmount = Number(amount) || 0.5;
      await broker.ledger.depositFund(depositAmount);
      return res.status(200).json({
        success: true,
        action: "deposit",
        amount: depositAmount,
        message: `Deposited ${depositAmount} A0GI to ledger`,
      });
    }

    if (action === "transfer") {
      if (!providerAddress) {
        return res.status(400).json({ error: "provider address is required for transfer" });
      }
      // Convert to neuron (bigint). 1 A0GI = 10^18 neuron
      const amtFloat = Number(amount) || 0.1;
      const neuron = BigInt(Math.floor(amtFloat * 1e18));

      const serviceType = service === "fine-tuning" ? "fine-tuning" : "inference";
      await broker.ledger.transferFund(providerAddress, serviceType, neuron);
      return res.status(200).json({
        success: true,
        action: "transfer",
        provider: providerAddress,
        amount: amtFloat,
        service: serviceType,
        neuron: neuron.toString(),
        message: `Transferred ${amtFloat} A0GI to provider ${serviceType} sub-account`,
      });
    }

    if (action === "get-balance") {
      const ledger = await broker.ledger.getLedger();
      return res.status(200).json({
        success: true,
        action: "get-balance",
        ledger: JSON.parse(
          JSON.stringify(ledger, (_k, v) =>
            typeof v === "bigint" ? v.toString() : v
          )
        ),
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}
