/**
 * OpenClaw Internal Tools Plugin
 * 
 * Central registry for all internal tools developed by the team.
 * This plugin automatically scans and registers:
 * - Group workspace management tools
 * - Custom development tools
 * - Team-specific utility tools
 * 
 * All tools added here will be available to agents through the standard tool catalog.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { Type } from "@sinclair/typebox";

const plugin = {
  id: "openclaw-internal",
  name: "OpenClaw Internal Tools",
  description: "Internal tools registry for custom development and team-specific utilities",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    // Note: Use api.runtime.log for logging if needed
    // const log = api.runtime.log.createSubsystem("internal-tools");
    
    // console.info("[internal-tools] Registering internal tools...");

    // ============================================
    // GROUP WORKSPACE TOOLS
    // ============================================

    /**
     * groups.files.list - List files in group workspace
     */
    api.registerTool({
      name: "groups.files.list",
      description: "List all files in a group workspace. Use this to view project files, shared documents, and meeting notes.",
      parameters: Type.Object({
        groupId: Type.String({
          description: "The group ID (e.g., 'group_1773403635480_mvh5nt')",
        }),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "groups.files.list",
            params: { groupId: args.groupId },
          });
          
          if (!response.ok) {
            return {
              content: [{
                type: "text",
                text: `Failed to list files: ${response.error?.message || "Unknown error"}`,
              }],
            };
          }
          
          const files = response.result?.files || [];
          const workspace = response.result?.workspace || "";
          
          let text = `Group Workspace: ${workspace}\n\n`;
          if (files.length === 0) {
            text += "No files found.\n";
          } else {
            text += `Found ${files.length} file(s):\n\n`;
            for (const file of files) {
              text += `- ${file.name} (${formatFileSize(file.size)})\n`;
            }
          }
          
          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      },
    });

    /**
     * groups.files.get - Read file content
     */
    api.registerTool({
      name: "groups.files.get",
      description: "Read a specific file's content from group workspace",
      parameters: Type.Object({
        groupId: Type.String({
          description: "The group ID",
        }),
        name: Type.String({
          description: "File name (e.g., 'SHARED_MEMORY.md', 'meeting-notes.md')",
        }),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "groups.files.get",
            params: { groupId: args.groupId, name: args.name },
          });
          
          if (!response.ok) {
            return {
              content: [{
                type: "text",
                text: `Failed to read file: ${response.error?.message || "Unknown error"}`,
              }],
            };
          }
          
          const file = response.result?.file;
          if (file?.missing) {
            return {
              content: [{
                type: "text",
                text: `File not found: ${args.name}`,
              }],
            };
          }
          
          return {
            content: [{ type: "text", text: file.content || "" }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      },
    });

    /**
     * groups.files.set - Write/create file
     */
    api.registerTool({
      name: "groups.files.set",
      description: "Create or update a file in group workspace",
      parameters: Type.Object({
        groupId: Type.String({
          description: "The group ID",
        }),
        name: Type.String({
          description: "File name",
        }),
        content: Type.String({
          description: "File content",
        }),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "groups.files.set",
            params: {
              groupId: args.groupId,
              name: args.name,
              content: args.content,
            },
          });
          
          if (!response.ok) {
            return {
              content: [{
                type: "text",
                text: `Failed to write file: ${response.error?.message || "Unknown error"}`,
              }],
            };
          }
          
          return {
            content: [{
              type: "text",
              text: `Successfully saved file: ${args.name}`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      },
    });

    /**
     * groups.files.delete - Delete file
     */
    api.registerTool({
      name: "groups.files.delete",
      description: "Delete a file from group workspace",
      parameters: Type.Object({
        groupId: Type.String({
          description: "The group ID",
        }),
        name: Type.String({
          description: "File name to delete",
        }),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "groups.files.delete",
            params: { groupId: args.groupId, name: args.name },
          });
          
          if (!response.ok) {
            return {
              content: [{
                type: "text",
                text: `Failed to delete file: ${response.error?.message || "Unknown error"}`,
              }],
            };
          }
          
          return {
            content: [{
              type: "text",
              text: `Successfully deleted file: ${args.name}`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      },
    });

    /**
     * groups.workspace.getDir - Get group workspace path
     */
    api.registerTool({
      name: "groups.workspace.getDir",
      description: "Get the filesystem path of a group's workspace",
      parameters: Type.Object({
        groupId: Type.String({
          description: "The group ID",
        }),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "groups.workspace.getDir",
            params: { groupId: args.groupId },
          });
          
          if (!response.ok) {
            return {
              content: [{
                type: "text",
                text: `Failed to get workspace dir: ${response.error?.message || "Unknown error"}`,
              }],
            };
          }
          
          const dir = response.result?.dir || "";
          return {
            content: [{
              type: "text",
              text: `Group workspace path: ${dir}`,
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            }],
          };
        }
      },
    });


    // ============================================
    // FUTURE CUSTOM TOOLS
    // ============================================
    // Add your custom tools below this line
    // Example: project management, code review, deployment, etc.
    
    // TODO: Add more internal tools as needed
    // Examples:
    // - project.create - Create new project
    // - project.deploy - Deploy project
    // - code.review - Code review utilities
    // - team.notify - Team notification tools
    
    // console.info("[internal-tools] ✓ Internal tools registered successfully");
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default plugin;
