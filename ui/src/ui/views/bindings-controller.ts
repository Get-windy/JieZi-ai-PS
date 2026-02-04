import type { BindingEntry, BindingsProps } from "./bindings.js";
import type { AgentsListResult } from "../types.js";

type RpcClient = {
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

export class BindingsController {
  private bindings: BindingEntry[] = [];
  private agentsList: AgentsListResult | null = null;
  private editingId: string | null = null;
  private editForm: Partial<BindingEntry> | null = null;
  private loading = true;
  private saving = false;
  private error: string | null = null;

  constructor(
    private rpc: RpcClient,
    private render: () => void
  ) {}

  async init() {
    await Promise.all([this.loadBindings(), this.loadAgents()]);
  }

  private async loadBindings() {
    this.loading = true;
    this.error = null;
    this.render();

    try {
      // 从配置文件读取 bindings
      const snapshot = await this.rpc.request<any>("config.get", {});
      const config = snapshot?.config || {};
      const bindingsArray = config?.bindings || [];
      
      // 转换为 BindingEntry 格式
      this.bindings = bindingsArray.map((b: any, index: number) => ({
        id: b.id || `binding-${index}`,
        agentId: b.agentId || "default",
        match: b.match || {},
      }));
    } catch (err) {
      this.error = String(err);
      console.error("Failed to load bindings:", err);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private async loadAgents() {
    try {
      const result = await this.rpc.request<AgentsListResult>("agents.list", {});
      this.agentsList = result as AgentsListResult;
      this.render();
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  }

  handleAdd = () => {
    this.editingId = "new";
    this.editForm = {
      id: `binding-${Date.now()}`,
      agentId: "",
      match: {},
    };
    this.render();
  };

  handleEdit = (id: string) => {
    const binding = this.bindings.find((b) => b.id === id);
    if (!binding) return;

    this.editingId = id;
    this.editForm = JSON.parse(JSON.stringify(binding));
    this.render();
  };

  handleDelete = async (id: string) => {
    if (!confirm("确定要删除此绑定吗？")) return;

    this.saving = true;
    this.error = null;
    this.render();

    try {
      // 从配置中删除绑定
      const snapshot = await this.rpc.request<any>("config.get", {});
      const config = snapshot?.config || {};
      const bindingsArray = config?.bindings || [];
      const filtered = bindingsArray.filter((b: any, index: number) => {
        const bindingId = b.id || `binding-${index}`;
        return bindingId !== id;
      });

      // 保存配置 - 使用 config.patch
      const baseHash = snapshot?.hash || null;
      const patchPayload = { bindings: filtered };
      await this.rpc.request("config.patch", {
        raw: JSON.stringify(patchPayload, null, 2),
        baseHash,
      });

      // 重新加载
      await this.loadBindings();
    } catch (err) {
      this.error = String(err);
      console.error("Failed to delete binding:", err);
    } finally {
      this.saving = false;
      this.render();
    }
  };

  handleSave = async () => {
    if (!this.editForm) return;

    // 验证必填字段
    if (!this.editForm.agentId || !this.editForm.match?.channel) {
      alert("请至少选择代理和通道");
      return;
    }

    this.saving = true;
    this.error = null;
    this.render();

    try {
      const snapshot = await this.rpc.request<any>("config.get", {});
      const config = snapshot?.config || {};
      let bindingsArray = config?.bindings || [];

      // 清理空值
      const cleanMatch: any = {};
      if (this.editForm.match?.channel) {
        cleanMatch.channel = this.editForm.match.channel;
      }
      if (this.editForm.match?.accountId) {
        cleanMatch.accountId = this.editForm.match.accountId;
      }
      if (this.editForm.match?.peer) {
        const peer: any = {};
        if (this.editForm.match.peer.kind) peer.kind = this.editForm.match.peer.kind;
        if (this.editForm.match.peer.id) peer.id = this.editForm.match.peer.id;
        if (Object.keys(peer).length > 0) cleanMatch.peer = peer;
      }
      if (this.editForm.match?.guildId) {
        cleanMatch.guildId = this.editForm.match.guildId;
      }
      if (this.editForm.match?.teamId) {
        cleanMatch.teamId = this.editForm.match.teamId;
      }

      const newBinding = {
        agentId: this.editForm.agentId,
        match: cleanMatch,
      };

      if (this.editingId === "new") {
        // 添加新绑定
        bindingsArray.push(newBinding);
      } else {
        // 更新现有绑定
        const index = bindingsArray.findIndex((b: any, idx: number) => {
          const bindingId = b.id || `binding-${idx}`;
          return bindingId === this.editingId;
        });
        if (index !== -1) {
          bindingsArray[index] = newBinding;
        }
      }

      // 保存配置 - 使用 config.patch
      const baseHash = snapshot?.hash || null;
      const patchPayload = { bindings: bindingsArray };
      await this.rpc.request("config.patch", {
        raw: JSON.stringify(patchPayload, null, 2),
        baseHash,
      });

      // 关闭编辑器并重新加载
      this.editingId = null;
      this.editForm = null;
      await this.loadBindings();
    } catch (err) {
      this.error = String(err);
      console.error("Failed to save binding:", err);
    } finally {
      this.saving = false;
      this.render();
    }
  };

  handleCancel = () => {
    this.editingId = null;
    this.editForm = null;
    this.render();
  };

  handleFormChange = (field: string, value: unknown) => {
    if (!this.editForm) return;

    // 处理嵌套字段
    const parts = field.split(".");
    if (parts.length === 1) {
      this.editForm = { ...this.editForm, [field]: value };
    } else if (parts[0] === "match") {
      const match = { ...this.editForm.match };
      if (parts.length === 2) {
        if (value === "") {
          delete (match as any)[parts[1]];
        } else {
          (match as any)[parts[1]] = value;
        }
      } else if (parts[1] === "peer") {
        const peer = { ...(match.peer || {}) };
        if (value === "") {
          delete (peer as any)[parts[2]];
        } else {
          (peer as any)[parts[2]] = value;
        }
        if (Object.keys(peer).length > 0) {
          match.peer = peer as any;
        } else {
          delete match.peer;
        }
      }
      this.editForm = { ...this.editForm, match };
    }

    this.render();
  };

  handleRefresh = async () => {
    await Promise.all([this.loadBindings(), this.loadAgents()]);
  };

  getProps(): BindingsProps {
    return {
      loading: this.loading,
      saving: this.saving,
      error: this.error,
      bindings: this.bindings,
      agentsList: this.agentsList,
      editingId: this.editingId,
      editForm: this.editForm,
      onAdd: this.handleAdd,
      onEdit: this.handleEdit,
      onDelete: this.handleDelete,
      onSave: this.handleSave,
      onCancel: this.handleCancel,
      onFormChange: this.handleFormChange,
      onRefresh: this.handleRefresh,
    };
  }
}
