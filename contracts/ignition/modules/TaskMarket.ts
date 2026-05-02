import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Sepolia ENS infrastructure addresses.
const NAME_WRAPPER_SEPOLIA = "0x0635513f179D50A207757E05759CbD106d7dFcE8";
const PUBLIC_RESOLVER_SEPOLIA = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

export default buildModule("TaskMarketModule", (m) => {
  const nameWrapper = m.getParameter("nameWrapper", NAME_WRAPPER_SEPOLIA);
  const resolver = m.getParameter("resolver", PUBLIC_RESOLVER_SEPOLIA);
  // Required: namehash of the parent domain (e.g. namehash("righthand.eth")).
  // Pass via --parameters '{"TaskMarketModule":{"parentNode":"0x..."}}'.
  const parentNode = m.getParameter<`0x${string}`>("parentNode");

  const taskMarket = m.contract("TaskMarket", [
    nameWrapper,
    resolver,
    parentNode,
  ]);

  return { taskMarket };
});
