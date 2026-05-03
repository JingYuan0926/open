import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("RightHandAIINFTModule", (m) => {
  const verifier = m.contract("MockVerifier");
  const inft = m.contract("RightHandAIINFT", [verifier]);
  return { verifier, inft };
});
