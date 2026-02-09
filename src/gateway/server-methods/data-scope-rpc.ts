/**
 * 数据范围权限 Gateway RPC 方法
 *
 * 提供字段级权限、行级权限的管理接口
 */

import type { GatewayRequestHandlers } from "./types.js";
import { loadConfig, writeConfigFile } from "../../config/config.js";
import { dataScopeChecker, type DataScopeRule } from "../../permissions/data-scope-checker.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const dataScopeHandlers: GatewayRequestHandlers = {
  /**
   * 列出所有数据范围规则
   */
  "dataScope.rules.list": async ({ params, respond }) => {
    try {
      const config = loadConfig();
      const rules = config?.permissions?.dataScopeRules || [];

      respond(true, { rules, total: rules.length }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to list data scope rules: ${String(error)}`),
      );
    }
  },

  /**
   * 获取数据范围规则详情
   */
  "dataScope.rules.get": async ({ params, respond }) => {
    try {
      const ruleId = String(params?.ruleId ?? "").trim();

      if (!ruleId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ruleId is required"));
        return;
      }

      const config = loadConfig();
      const rules = config?.permissions?.dataScopeRules || [];
      const rule = rules.find((r: any) => r.id === ruleId);

      if (!rule) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Rule ${ruleId} not found`));
        return;
      }

      respond(true, { rule }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get data scope rule: ${String(error)}`),
      );
    }
  },

  /**
   * 创建数据范围规则
   */
  "dataScope.rules.create": async ({ params, respond }) => {
    try {
      const rule = params?.rule;

      if (!rule || typeof rule !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "rule is required"));
        return;
      }

      // 验证必需字段
      if (!rule.name || !rule.resourceType || !rule.resourcePattern || !rule.scope) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "rule must have name, resourceType, resourcePattern, and scope",
          ),
        );
        return;
      }

      // 生成规则ID
      const ruleId = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const newRule: DataScopeRule = {
        id: ruleId,
        ...rule,
        enabled: rule.enabled !== false,
      };

      // 保存到配置
      const config = loadConfig();
      if (!config.permissions) {
        config.permissions = {};
      }
      if (!config.permissions.dataScopeRules) {
        config.permissions.dataScopeRules = [];
      }

      config.permissions.dataScopeRules.push(newRule);
      writeConfigFile(config);

      // 更新运行时规则
      dataScopeChecker.addRule(newRule);

      respond(true, { rule: newRule }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to create data scope rule: ${String(error)}`),
      );
    }
  },

  /**
   * 更新数据范围规则
   */
  "dataScope.rules.update": async ({ params, respond }) => {
    try {
      const ruleId = String(params?.ruleId ?? "").trim();
      const updates = params?.updates;

      if (!ruleId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ruleId is required"));
        return;
      }

      if (!updates || typeof updates !== "object") {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "updates is required"));
        return;
      }

      const config = loadConfig();
      const rules = config?.permissions?.dataScopeRules || [];
      const ruleIndex = rules.findIndex((r: any) => r.id === ruleId);

      if (ruleIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Rule ${ruleId} not found`));
        return;
      }

      // 更新规则
      rules[ruleIndex] = {
        ...rules[ruleIndex],
        ...updates,
        id: ruleId, // 确保ID不变
      };

      config.permissions!.dataScopeRules = rules;
      writeConfigFile(config);

      // 重新初始化数据范围检查器
      dataScopeChecker.initialize(rules);

      respond(true, { rule: rules[ruleIndex] }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to update data scope rule: ${String(error)}`),
      );
    }
  },

  /**
   * 删除数据范围规则
   */
  "dataScope.rules.delete": async ({ params, respond }) => {
    try {
      const ruleId = String(params?.ruleId ?? "").trim();

      if (!ruleId) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "ruleId is required"));
        return;
      }

      const config = loadConfig();
      const rules = config?.permissions?.dataScopeRules || [];
      const ruleIndex = rules.findIndex((r: any) => r.id === ruleId);

      if (ruleIndex === -1) {
        respond(false, undefined, errorShape(ErrorCodes.NOT_FOUND, `Rule ${ruleId} not found`));
        return;
      }

      // 删除规则
      rules.splice(ruleIndex, 1);
      config.permissions!.dataScopeRules = rules;
      writeConfigFile(config);

      // 重新初始化数据范围检查器
      dataScopeChecker.initialize(rules);

      respond(true, { success: true }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to delete data scope rule: ${String(error)}`),
      );
    }
  },

  /**
   * 检查数据范围权限
   */
  "dataScope.check": async ({ params, respond }) => {
    try {
      const subject = params?.subject;
      const resourceType = String(params?.resourceType ?? "").trim();
      const resourceId = String(params?.resourceId ?? "").trim();
      const operation = String(params?.operation ?? "").trim();

      if (!subject || !resourceType || !resourceId || !operation) {
        respond(
          false,
          undefined,
          errorShape(
            ErrorCodes.INVALID_REQUEST,
            "subject, resourceType, resourceId, and operation are required",
          ),
        );
        return;
      }

      const result = dataScopeChecker.check({
        subject,
        resourceType: resourceType as any,
        resourceId,
        operation: operation as any,
        resourceData: params?.resourceData,
        organizationContext: params?.organizationContext,
      });

      respond(true, { result }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to check data scope: ${String(error)}`),
      );
    }
  },

  /**
   * 获取数据范围统计信息
   */
  "dataScope.statistics": async ({ params, respond }) => {
    try {
      const stats = dataScopeChecker.getStatistics();
      respond(true, { statistics: stats }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Failed to get data scope statistics: ${String(error)}`),
      );
    }
  },

  /**
   * 批量启用/禁用规则
   */
  "dataScope.rules.batchToggle": async ({ params, respond }) => {
    try {
      const ruleIds = params?.ruleIds;
      const enabled = Boolean(params?.enabled);

      if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "ruleIds array is required"),
        );
        return;
      }

      const config = loadConfig();
      const rules = config?.permissions?.dataScopeRules || [];
      let updatedCount = 0;

      for (const ruleId of ruleIds) {
        const ruleIndex = rules.findIndex((r: any) => r.id === ruleId);
        if (ruleIndex !== -1) {
          rules[ruleIndex].enabled = enabled;
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        config.permissions!.dataScopeRules = rules;
        writeConfigFile(config);

        // 重新初始化数据范围检查器
        dataScopeChecker.initialize(rules);
      }

      respond(true, { updatedCount }, undefined);
    } catch (error) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to batch toggle data scope rules: ${String(error)}`,
        ),
      );
    }
  },
};
