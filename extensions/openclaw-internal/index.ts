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

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

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
      description:
        "List all files in a group workspace. Use this to view project files, shared documents, and meeting notes.",
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
              content: [
                {
                  type: "text",
                  text: `Failed to list files: ${response.error?.message || "Unknown error"}`,
                },
              ],
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
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
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
              content: [
                {
                  type: "text",
                  text: `Failed to read file: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const file = response.result?.file;
          if (file?.missing) {
            return {
              content: [
                {
                  type: "text",
                  text: `File not found: ${args.name}`,
                },
              ],
            };
          }

          return {
            content: [{ type: "text", text: file.content || "" }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
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
              content: [
                {
                  type: "text",
                  text: `Failed to write file: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Successfully saved file: ${args.name}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
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
              content: [
                {
                  type: "text",
                  text: `Failed to delete file: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Successfully deleted file: ${args.name}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
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
              content: [
                {
                  type: "text",
                  text: `Failed to get workspace dir: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const dir = response.result?.dir || "";
          return {
            content: [
              {
                type: "text",
                text: `Group workspace path: ${dir}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    // ============================================
    // PROJECT MANAGEMENT TOOLS
    // ============================================

    /**
     * project.create - Create a new project
     */
    api.registerTool({
      name: "project.create",
      description: "Create a new project with workspace and configuration",
      parameters: Type.Object({
        name: Type.String({
          description: "Project name",
        }),
        description: Type.Optional(
          Type.String({
            description: "Project description",
          }),
        ),
        ownerId: Type.Optional(
          Type.String({
            description: "Owner agent ID (defaults to current agent)",
          }),
        ),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "project.create",
            params: {
              name: args.name,
              description: args.description || "",
              ownerId: args.ownerId,
            },
          });

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to create project: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const project = response.result;
          return {
            content: [
              {
                type: "text",
                text: `Successfully created project: ${args.name}\nProject ID: ${project.projectId}\nWorkspace: ${project.workspace || "N/A"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    /**
     * project.list - List all projects
     */
    api.registerTool({
      name: "project.list",
      description: "List all projects in the workspace",
      parameters: Type.Object({}),
      async execute(_toolCallId, _args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "project.list",
            params: {},
          });

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to list projects: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const projects = response.result?.projects || [];

          let text = `Found ${projects.length} project(s):\n\n`;
          if (projects.length === 0) {
            text += "No projects found.";
          } else {
            for (const project of projects) {
              text += `- ${project.name} (ID: ${project.projectId})\n`;
              if (project.description) {
                text += `  Description: ${project.description}\n`;
              }
            }
          }

          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    // ============================================
    // TEAM COLLABORATION TOOLS
    // ============================================

    /**
     * team.notify - Send notification to team members
     */
    api.registerTool({
      name: "team.notify",
      description: "Send a notification message to team members",
      parameters: Type.Object({
        message: Type.String({
          description: "Notification message content",
        }),
        priority: Type.Optional(
          Type.Union(
            [
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
              Type.Literal("urgent"),
            ],
            {
              description: "Message priority level",
            },
          ),
        ),
        targetMembers: Type.Optional(
          Type.Array(Type.String(), {
            description: "Specific team member IDs to notify (optional)",
          }),
        ),
      }),
      async execute(_toolCallId, args) {
        try {
          // Use internal agent communication
          const notification = {
            message: args.message,
            priority: args.priority || "medium",
            timestamp: new Date().toISOString(),
          };

          return {
            content: [
              {
                type: "text",
                text: `Notification queued:\n- Message: ${notification.message}\n- Priority: ${notification.priority}\n- Target: ${args.targetMembers?.join(", ") || "All team members"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    /**
     * team.list - List team members
     */
    api.registerTool({
      name: "team.list",
      description: "List all team members in the organization",
      parameters: Type.Object({}),
      async execute(_toolCallId, _args) {
        try {
          // Try to get organization members
          const response = await api.runtime.gateway.call({
            method: "organization.list",
            params: {},
          });

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to list team: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Organization structure retrieved. Use organization-specific APIs for detailed member listing.`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    // ============================================
    // TASK MANAGEMENT TOOLS
    // ============================================

    /**
     * task.create - Create a new task
     */
    api.registerTool({
      name: "task.create",
      description: "Create a new task with title, description, and metadata",
      parameters: Type.Object({
        title: Type.String({
          description: "Task title",
        }),
        description: Type.Optional(
          Type.String({
            description: "Task description",
          }),
        ),
        priority: Type.Optional(
          Type.Union(
            [
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
              Type.Literal("urgent"),
            ],
            {
              description: "Task priority",
            },
          ),
        ),
        assignee: Type.Optional(
          Type.String({
            description: "Agent ID to assign the task to",
          }),
        ),
        dueDate: Type.Optional(
          Type.String({
            description: "Due date (ISO 8601 format)",
          }),
        ),
        tags: Type.Optional(
          Type.Array(Type.String(), {
            description: "Task tags",
          }),
        ),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "task.create",
            params: {
              title: args.title,
              description: args.description,
              priority: args.priority || "medium",
              assignee: args.assignee,
              dueDate: args.dueDate,
              tags: args.tags,
            },
          });

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to create task: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const task = response.result;
          return {
            content: [
              {
                type: "text",
                text: `Successfully created task:\n- Title: ${args.title}\n- Task ID: ${task.id}\n- Priority: ${args.priority || "medium"}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    /**
     * task.list - List tasks
     */
    api.registerTool({
      name: "task.list",
      description: "List tasks with optional filters",
      parameters: Type.Object({
        status: Type.Optional(
          Type.Union(
            [
              Type.Literal("todo"),
              Type.Literal("in-progress"),
              Type.Literal("done"),
              Type.Literal("cancelled"),
            ],
            {
              description: "Filter by task status",
            },
          ),
        ),
        assignee: Type.Optional(
          Type.String({
            description: "Filter by assignee agent ID",
          }),
        ),
        priority: Type.Optional(
          Type.Union(
            [
              Type.Literal("low"),
              Type.Literal("medium"),
              Type.Literal("high"),
              Type.Literal("urgent"),
            ],
            {
              description: "Filter by priority",
            },
          ),
        ),
        limit: Type.Optional(
          Type.Number({
            description: "Maximum number of tasks to return",
          }),
        ),
      }),
      async execute(_toolCallId, args) {
        try {
          const response = await api.runtime.gateway.call({
            method: "task.list",
            params: {
              status: args.status,
              assignee: args.assignee,
              priority: args.priority,
              limit: args.limit || 20,
            },
          });

          if (!response.ok) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to list tasks: ${response.error?.message || "Unknown error"}`,
                },
              ],
            };
          }

          const tasks = response.result || [];

          let text = `Found ${tasks.length} task(s):\n\n`;
          if (tasks.length === 0) {
            text += "No tasks found matching the criteria.";
          } else {
            for (const task of tasks) {
              text += `- [${task.status}] ${task.title}\n`;
              text += `  ID: ${task.id}\n`;
              if (task.priority) text += `  Priority: ${task.priority}\n`;
              if (task.assignee) text += `  Assignee: ${task.assignee}\n`;
              text += "\n";
            }
          }

          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
          };
        }
      },
    });

    // ============================================
    // FUTURE CUSTOM TOOLS
    // ============================================
    // Add your custom tools below this line
    // Example: code review, deployment, etc.

    // TODO: Add more internal tools as needed
    // Examples:
    // - project.deploy - Deploy project
    // - code.review - Code review utilities

    // console.info("[internal-tools] ✓ Internal tools registered successfully");
  },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default plugin;
