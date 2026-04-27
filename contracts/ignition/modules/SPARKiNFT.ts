import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("SPARKiNFTModule", (m) => {
  const verifier = m.contract("MockVerifier");
  const inft = m.contract("SPARKiNFT", [verifier]);
  return { verifier, inft };
});
