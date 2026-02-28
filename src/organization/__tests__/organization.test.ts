/**
 * Phase 4: 组织系统测试
 * 
 * 验证组织CRUD、成员管理、关系管理和层级结构功能
 */

import { organizationStorage } from "../storage.js";
import { organizationHierarchy } from "../hierarchy.js";
import type { Organization, OrganizationMember, CollaborationRelation } from "../types.js";

async function testOrganizationCRUD() {
  console.log("\n=== Testing Organization CRUD ===");

  try {
    // 清理测试数据
    console.log("Clearing test data...");

    // 创建公司
    const company: Organization = {
      id: "test-company-1",
      name: "Test Company",
      level: "company",
      type: "company",
      industry: "Technology",
      location: "Beijing",
      memberIds: [],
      members: [],
      sharedResources: {
        knowledgeBases: [],
        documents: [],
        tools: [],
        workspaces: [],
      },
      createdAt: Date.now(),
      createdBy: "test",
    };

    const createdCompany = await organizationStorage.createOrganization(company);
    console.log("✓ Created company:", createdCompany.name);

    // 创建部门
    const department: Organization = {
      id: "test-dept-1",
      name: "Engineering Department",
      level: "department",
      type: "department",
      parentId: "test-company-1",
      memberIds: [],
      members: [],
      sharedResources: {
        knowledgeBases: [],
        documents: [],
        tools: [],
        workspaces: [],
      },
      createdAt: Date.now(),
      createdBy: "test",
    };

    const createdDept = await organizationStorage.createOrganization(department);
    console.log("✓ Created department:", createdDept.name);

    // 创建团队
    const team: Organization = {
      id: "test-team-1",
      name: "Backend Team",
      level: "team",
      type: "team",
      parentId: "test-dept-1",
      memberIds: [],
      members: [],
      sharedResources: {
        knowledgeBases: [],
        documents: [],
        tools: [],
        workspaces: [],
      },
      createdAt: Date.now(),
      createdBy: "test",
    };

    const createdTeam = await organizationStorage.createOrganization(team);
    console.log("✓ Created team:", createdTeam.name);

    // 更新组织
    const updated = await organizationStorage.updateOrganization("test-company-1", {
      description: "A test technology company",
    });
    console.log("✓ Updated company description");

    // 列出组织
    const allOrgs = await organizationStorage.listOrganizations();
    console.log(`✓ Listed ${allOrgs.length} organizations`);

    // 获取子组织
    const children = await organizationStorage.getChildOrganizations("test-company-1");
    console.log(`✓ Found ${children.length} child organization(s)`);

    console.log("✅ Organization CRUD test passed");
  } catch (err) {
    console.error("❌ Organization CRUD test failed:", err);
    throw err;
  }
}

async function testMemberManagement() {
  console.log("\n=== Testing Member Management ===");

  try {
    // 添加成员
    const member1: OrganizationMember = {
      id: "agent-001",
      type: "agent",
      role: "admin",
      title: "Team Lead",
      joinedAt: Date.now(),
    };

    await organizationStorage.addMember("test-team-1", member1);
    console.log("✓ Added member 1");

    const member2: OrganizationMember = {
      id: "agent-002",
      type: "agent",
      role: "member",
      title: "Developer",
      reportTo: "agent-001",
      joinedAt: Date.now(),
    };

    await organizationStorage.addMember("test-team-1", member2);
    console.log("✓ Added member 2");

    // 获取成员列表
    const members = await organizationStorage.getMembers("test-team-1");
    console.log(`✓ Retrieved ${members.length} member(s)`);

    // 更新成员
    await organizationStorage.updateMember("test-team-1", "agent-002", {
      role: "lead",
      title: "Senior Developer",
    });
    console.log("✓ Updated member role");

    // 移除成员
    await organizationStorage.removeMember("test-team-1", "agent-002");
    console.log("✓ Removed member");

    const finalMembers = await organizationStorage.getMembers("test-team-1");
    console.log(`✓ Final member count: ${finalMembers.length}`);

    console.log("✅ Member management test passed");
  } catch (err) {
    console.error("❌ Member management test failed:", err);
    throw err;
  }
}

async function testRelationManagement() {
  console.log("\n=== Testing Relation Management ===");

  try {
    // 创建关系
    const relation1: CollaborationRelation = {
      id: "rel-001",
      type: "supervisor",
      fromAgentId: "agent-001",
      toAgentId: "agent-002",
      organizationId: "test-team-1",
      createdAt: Date.now(),
      createdBy: "test",
    };

    await organizationStorage.createRelation(relation1);
    console.log("✓ Created supervisor relation");

    const relation2: CollaborationRelation = {
      id: "rel-002",
      type: "colleague",
      fromAgentId: "agent-002",
      toAgentId: "agent-003",
      organizationId: "test-team-1",
      createdAt: Date.now(),
      createdBy: "test",
    };

    await organizationStorage.createRelation(relation2);
    console.log("✓ Created colleague relation");

    // 列出关系
    const allRelations = await organizationStorage.listRelations();
    console.log(`✓ Listed ${allRelations.length} relation(s)`);

    // 按类型过滤
    const supervisorRelations = await organizationStorage.listRelations({
      type: "supervisor",
    });
    console.log(`✓ Found ${supervisorRelations.length} supervisor relation(s)`);

    // 按组织过滤
    const teamRelations = await organizationStorage.listRelations({
      organizationId: "test-team-1",
    });
    console.log(`✓ Found ${teamRelations.length} relation(s) in team`);

    // 删除关系
    await organizationStorage.deleteRelation("rel-002");
    console.log("✓ Deleted relation");

    console.log("✅ Relation management test passed");
  } catch (err) {
    console.error("❌ Relation management test failed:", err);
    throw err;
  }
}

async function testHierarchyStructure() {
  console.log("\n=== Testing Hierarchy Structure ===");

  try {
    // 构建组织树
    const tree = await organizationHierarchy.buildTree();
    console.log(`✓ Built organization tree with ${tree.length} root(s)`);

    // 获取祖先
    const ancestors = await organizationHierarchy.getAncestors("test-team-1");
    console.log(`✓ Found ${ancestors.length} ancestor(s)`);

    // 获取后代
    const descendants = await organizationHierarchy.getDescendants("test-company-1");
    console.log(`✓ Found ${descendants.length} descendant(s)`);

    // 获取深度
    const depth = await organizationHierarchy.getDepth("test-team-1");
    console.log(`✓ Team depth: ${depth}`);

    // 获取路径字符串
    const pathString = await organizationHierarchy.getPathString("test-team-1");
    console.log(`✓ Organization path: ${pathString}`);

    // 获取统计信息
    const stats = await organizationHierarchy.getTreeStatistics();
    console.log(`✓ Tree statistics:`, stats);

    // 检查祖先关系
    const isAncestor = await organizationHierarchy.isAncestor(
      "test-company-1",
      "test-team-1",
    );
    console.log(`✓ Is company ancestor of team: ${isAncestor}`);

    console.log("✅ Hierarchy structure test passed");
  } catch (err) {
    console.error("❌ Hierarchy structure test failed:", err);
    throw err;
  }
}

async function testStatistics() {
  console.log("\n=== Testing Statistics ===");

  try {
    const stats = await organizationStorage.getStatistics();
    console.log("✓ Storage statistics:", stats);

    console.log("✅ Statistics test passed");
  } catch (err) {
    console.error("❌ Statistics test failed:", err);
    throw err;
  }
}

async function cleanupTestData() {
  console.log("\n=== Cleaning up test data ===");

  try {
    // 删除测试组织（按照层级从下到上）
    await organizationStorage.deleteOrganization("test-team-1");
    console.log("✓ Deleted test team");

    await organizationStorage.deleteOrganization("test-dept-1");
    console.log("✓ Deleted test department");

    await organizationStorage.deleteOrganization("test-company-1");
    console.log("✓ Deleted test company");

    // 删除测试关系
    const relations = await organizationStorage.listRelations();
    for (const rel of relations) {
      if (rel.id.startsWith("rel-")) {
        await organizationStorage.deleteRelation(rel.id);
      }
    }
    console.log("✓ Deleted test relations");

    console.log("✅ Cleanup completed");
  } catch (err) {
    console.error("❌ Cleanup failed:", err);
    // 不抛出错误，允许测试继续
  }
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log("\n🚀 Starting Phase 4 Organization System Tests\n");

  try {
    await testOrganizationCRUD();
    await testMemberManagement();
    await testRelationManagement();
    await testHierarchyStructure();
    await testStatistics();

    console.log("\n✅ All tests passed!");
  } catch (err) {
    console.error("\n❌ Tests failed:", err);
    throw err;
  } finally {
    await cleanupTestData();
  }
}

// 导出测试函数
export { runAllTests };
