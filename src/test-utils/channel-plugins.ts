// Re-export from upstream — overlay layer does not extend test-utils/channel-plugins.
export {
  createTestRegistry,
  createChannelTestPluginBase,
  createMSTeamsTestPluginBase,
  createMSTeamsTestPlugin,
  createOutboundTestPlugin,
} from "../../upstream/src/test-utils/channel-plugins.js";
export type { TestChannelRegistration } from "../../upstream/src/test-utils/channel-plugins.js";
