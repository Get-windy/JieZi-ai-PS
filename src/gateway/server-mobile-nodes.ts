import type { NodeRegistry } from "../../upstream/src/gateway/node-registry.js";

export function hasConnectedMobileNode(registry: NodeRegistry): boolean {
  return registry.listConnected().some((node) => {
    const platform = node.platform?.toLowerCase();
    const deviceFamily = node.deviceFamily?.toLowerCase();
    return platform === "ios" || platform === "android" || deviceFamily === "mobile";
  });
}
