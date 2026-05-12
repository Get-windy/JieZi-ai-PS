import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";

export default defineChannelPluginEntry({
  id: "bluebubbles",
  name: "BlueBubbles",
  channels: ["bluebubbles"],
  register() {
    return {};
  },
});
