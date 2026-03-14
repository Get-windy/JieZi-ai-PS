const WebSocket = require("ws");

async function testTools() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://127.0.0.1:18789", {
      headers: {
        "authorization": "Bearer test-token",
        "x-openclaw-scopes": "operator.read",
      },
    });

    ws.on("open", () => {
      console.log("Connected to gateway");
      
      // Request tools catalog
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools.catalog",
        params: {
          agentId: "main",
          includePlugins: true,
        },
      };
      
      console.log("Requesting tools catalog...");
      ws.send(JSON.stringify(request));
    });

    ws.on("message", (data) => {
      const response = JSON.parse(data.toString());
      console.log("\n=== TOOLS CATALOG RESPONSE ===");
      
      if (response.result && response.result.groups) {
        const allTools = response.result.groups.flatMap(g => g.tools || []);
        const groupTools = allTools.filter(t => t.id.startsWith("groups."));
        
        console.log(`\nTotal tools found: ${allTools.length}`);
        console.log(`Group tools found: ${groupTools.length}`);
        
        if (groupTools.length > 0) {
          console.log("\n✓ SUCCESS! Group workspace tools are available:");
          groupTools.forEach(tool => {
            console.log(`  - ${tool.id}: ${tool.description}`);
          });
        } else {
          console.log("\n✗ FAILED! No group workspace tools found.");
          console.log("\nAvailable tool groups:");
          response.result.groups.forEach(g => {
            console.log(`  ${g.id} (${g.source}): ${g.tools?.length || 0} tools`);
          });
        }
      } else if (response.error) {
        console.log("Error:", response.error);
      }
      
      ws.close();
      resolve();
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      reject(err);
    });
  });
}

testTools().catch(console.error);
