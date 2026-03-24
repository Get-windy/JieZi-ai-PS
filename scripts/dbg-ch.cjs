const path = require("path");
const WS = require(path.join(__dirname, "../upstream/node_modules/.pnpm/ws@8.19.0/node_modules/ws/index.js"));

const ws = new WS("ws://127.0.0.1:18789/api");
ws.on("open", () => {
  ws.send(JSON.stringify({ id: "dbg1", method: "channels.status", params: {} }));
});
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === "dbg1") {
    const s = msg.result ?? msg;
    const schemas = s.channelConfigSchemas ?? {};
    process.stdout.write("=== channelConfigSchemas keys: " + JSON.stringify(Object.keys(schemas)) + "\n");
    process.stdout.write("=== channelOrder: " + JSON.stringify(s.channelOrder) + "\n");
    for (const [k, v] of Object.entries(schemas)) {
      process.stdout.write("  schema[" + k + "] properties=" + JSON.stringify(Object.keys(v && v.properties ? v.properties : {})) + "\n");
    }
    if (Object.keys(schemas).length === 0) {
      process.stdout.write("EMPTY channelConfigSchemas\n");
    }
    ws.close();
    process.exit(0);
  }
});
ws.on("error", (e) => {
  process.stdout.write("ws error: " + e.message + "\n");
  process.exit(1);
});
setTimeout(() => {
  process.stdout.write("timeout\n");
  process.exit(1);
}, 15000);
