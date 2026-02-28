/**
 * Phase 4: 组织层级结构查询和路径计算
 * 
 * 提供组织树形结构的构建、查询和路径计算功能
 */

import type { Organization } from "./types.js";
import { organizationStorage } from "./storage.js";

/**
 * 组织树节点
 */
export interface OrganizationTreeNode extends Organization {
  children: OrganizationTreeNode[];
  depth: number;
  path: string[]; // 从根到当前节点的路径
}

/**
 * 组织层级服务
 */
export class OrganizationHierarchyService {
  /**
   * 构建组织树
   */
  async buildTree(rootId?: string): Promise<OrganizationTreeNode[]> {
    const allOrgs = await organizationStorage.listOrganizations();
    
    if (allOrgs.length === 0) {
      return [];
    }

    // 创建ID到组织的映射
    const orgMap = new Map<string, Organization>();
    for (const org of allOrgs) {
      orgMap.set(org.id, org);
    }

    // 构建树形结构
    const buildNode = (org: Organization, depth: number, path: string[]): OrganizationTreeNode => {
      const node: OrganizationTreeNode = {
        ...org,
        children: [],
        depth,
        path: [...path, org.id],
      };

      // 查找子组织
      const children = allOrgs.filter((o) => o.parentId === org.id);
      node.children = children.map((child) => buildNode(child, depth + 1, node.path));

      return node;
    };

    // 如果指定了根ID，只构建该子树
    if (rootId) {
      const rootOrg = orgMap.get(rootId);
      if (!rootOrg) {
        return [];
      }
      return [buildNode(rootOrg, 0, [])];
    }

    // 查找所有根组织（没有parentId的组织）
    const roots = allOrgs.filter((org) => !org.parentId);
    return roots.map((root) => buildNode(root, 0, []));
  }

  /**
   * 获取组织的所有祖先路径
   */
  async getAncestors(organizationId: string): Promise<Organization[]> {
    const ancestors: Organization[] = [];
    let currentId: string | undefined = organizationId;

    while (currentId) {
      const org = await organizationStorage.getOrganization(currentId);
      if (!org) {
        break;
      }
      
      // 不包含自己
      if (currentId !== organizationId) {
        ancestors.push(org);
      }

      currentId = org.parentId;
    }

    return ancestors.reverse(); // 从根到父级的顺序
  }

  /**
   * 获取组织的所有后代
   */
  async getDescendants(organizationId: string): Promise<Organization[]> {
    const descendants: Organization[] = [];
    const queue: string[] = [organizationId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = await organizationStorage.getChildOrganizations(currentId);

      for (const child of children) {
        descendants.push(child);
        queue.push(child.id);
      }
    }

    return descendants;
  }

  /**
   * 计算两个组织之间的关系路径
   */
  async getRelationPath(fromId: string, toId: string): Promise<Organization[]> {
    const fromAncestors = await this.getAncestors(fromId);
    const toAncestors = await this.getAncestors(toId);

    // 找到共同祖先
    let commonAncestorIndex = -1;
    for (let i = 0; i < Math.min(fromAncestors.length, toAncestors.length); i++) {
      if (fromAncestors[i].id === toAncestors[i].id) {
        commonAncestorIndex = i;
      } else {
        break;
      }
    }

    // 构建路径
    const path: Organization[] = [];

    // 从 from 到共同祖先
    const fromOrg = await organizationStorage.getOrganization(fromId);
    if (fromOrg) {
      path.push(fromOrg);
    }

    for (let i = fromAncestors.length - 1; i > commonAncestorIndex; i--) {
      path.push(fromAncestors[i]);
    }

    // 从共同祖先到 to
    if (commonAncestorIndex >= 0) {
      for (let i = commonAncestorIndex; i < toAncestors.length; i++) {
        if (!path.find((o) => o.id === toAncestors[i].id)) {
          path.push(toAncestors[i]);
        }
      }
    }

    const toOrg = await organizationStorage.getOrganization(toId);
    if (toOrg && !path.find((o) => o.id === toId)) {
      path.push(toOrg);
    }

    return path;
  }

  /**
   * 检查组织A是否是组织B的祖先
   */
  async isAncestor(ancestorId: string, descendantId: string): Promise<boolean> {
    const ancestors = await this.getAncestors(descendantId);
    return ancestors.some((org) => org.id === ancestorId);
  }

  /**
   * 检查组织A是否是组织B的后代
   */
  async isDescendant(descendantId: string, ancestorId: string): Promise<boolean> {
    return this.isAncestor(ancestorId, descendantId);
  }

  /**
   * 获取组织的层级深度（从根节点开始）
   */
  async getDepth(organizationId: string): Promise<number> {
    const ancestors = await this.getAncestors(organizationId);
    return ancestors.length;
  }

  /**
   * 获取组织的同级组织（相同父组织）
   */
  async getSiblings(organizationId: string): Promise<Organization[]> {
    const org = await organizationStorage.getOrganization(organizationId);
    if (!org) {
      return [];
    }

    if (!org.parentId) {
      // 如果没有父组织，返回所有根组织（除了自己）
      const allOrgs = await organizationStorage.listOrganizations();
      return allOrgs.filter((o) => !o.parentId && o.id !== organizationId);
    }

    // 获取相同父组织的所有子组织（除了自己）
    const siblings = await organizationStorage.getChildOrganizations(org.parentId);
    return siblings.filter((s) => s.id !== organizationId);
  }

  /**
   * 获取组织的完整路径字符串
   */
  async getPathString(organizationId: string, separator = " > "): Promise<string> {
    const ancestors = await this.getAncestors(organizationId);
    const org = await organizationStorage.getOrganization(organizationId);
    
    if (!org) {
      return "";
    }

    const path = [...ancestors, org];
    return path.map((o) => o.name).join(separator);
  }

  /**
   * 查找组织树中的所有叶子节点（没有子组织的组织）
   */
  async getLeafOrganizations(rootId?: string): Promise<Organization[]> {
    const tree = await this.buildTree(rootId);
    const leaves: Organization[] = [];

    const traverse = (nodes: OrganizationTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length === 0) {
          leaves.push(node);
        } else {
          traverse(node.children);
        }
      }
    };

    traverse(tree);
    return leaves;
  }

  /**
   * 统计组织树的统计信息
   */
  async getTreeStatistics(rootId?: string): Promise<{
    totalOrganizations: number;
    maxDepth: number;
    leafCount: number;
    avgChildrenCount: number;
  }> {
    const tree = await this.buildTree(rootId);
    let totalOrganizations = 0;
    let maxDepth = 0;
    let leafCount = 0;
    let totalChildrenCount = 0;
    let nonLeafCount = 0;

    const traverse = (nodes: OrganizationTreeNode[]) => {
      for (const node of nodes) {
        totalOrganizations++;
        maxDepth = Math.max(maxDepth, node.depth);

        if (node.children.length === 0) {
          leafCount++;
        } else {
          nonLeafCount++;
          totalChildrenCount += node.children.length;
          traverse(node.children);
        }
      }
    };

    traverse(tree);

    return {
      totalOrganizations,
      maxDepth,
      leafCount,
      avgChildrenCount: nonLeafCount > 0 ? totalChildrenCount / nonLeafCount : 0,
    };
  }
}

/**
 * 全局层级服务实例
 */
export const organizationHierarchy = new OrganizationHierarchyService();
