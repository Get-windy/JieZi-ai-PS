import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { WebSocket } = require("../upstream/node_modules/.pnpm/ws@8.19.0/node_modules/ws/index.js");

const ws = new WebSocket("ws://127.0.0.1:18789/api");
ws.on("open", () => {
  ws.send(JSON.stringify({ id: "dbg1", method: "channels.status", params: {} }));
});
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === "dbg1") {
    const s = msg.result ?? msg;
    console.log("=== channels.status response ===");
    console.log("channelConfigSchemas keys:", JSON.stringify(Object.keys(s.channelConfigSchemas ?? {})));
    console.log("channelOrder:", JSON.stringify(s.channelOrder));
    const schemas = s.channelConfigSchemas ?? {};
    for (const [k, v] of Object.entries(schemas)) {
      console.log(`  schema[${k}] hasProperties=${!!(v?.properties)} keys=${JSON.stringify(Object.keys(v?.properties ?? {}))}`);
    }
    if (Object.keys(schemas).length === 0) {
      console.log("⚠️  channelConfigSchemas is EMPTY — plugins may have no configSchema");
    }
    ws.close();
    process.exit(0);
  }
});
ws.on("error", (e) => {
  console.error("ws error:", e.message);
  process.exit(1);
});
setTimeout(() => {
  console.log("timeout");
  process.exit(1);
}, 15000);
