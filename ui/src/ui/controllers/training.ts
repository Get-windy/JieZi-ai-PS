/**
 * Phase 6: Training Controller
 * 培训管理控制器
 */

import type { GatewayBrowserClient } from "../gateway.ts";
import type { TrainingCourse, TrainingProgress, Certificate } from "../views/training.ts";

export type TrainingState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  loading: boolean;
  courses: TrainingCourse[];
  progresses: TrainingProgress[];
  certificates: Certificate[];
  selectedAgentId?: string;
  selectedCourseId?: string;
  error: string | null;
  filter: string;
  filterType: "all" | "onboarding" | "skill-specific" | "role-upgrade" | "continuous";
  filterStatus: "all" | "not-started" | "in-progress" | "completed" | "failed";
  filterLevel: "all" | "beginner" | "intermediate" | "advanced";
  activeTab: "courses" | "progress" | "certificates";
};

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

/**
 * 加载培训课程列表
 */
export async function loadCourses(state: TrainingState) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.loading) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const result = await state.client.request<{ courses: TrainingCourse[] }>(
      "training.courses.list",
      {},
    );
    if (result?.courses) {
      state.courses = result.courses;
    }
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to load courses:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 加载培训进度
 */
export async function loadProgresses(state: TrainingState, agentId?: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.loading) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const result = await state.client.request<{ progresses: TrainingProgress[] }>(
      "training.progresses.list",
      { agentId },
    );
    if (result?.progresses) {
      state.progresses = result.progresses;
    }
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to load progresses:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 加载证书列表
 */
export async function loadCertificates(state: TrainingState, agentId?: string) {
  if (!state.client || !state.connected) {
    return;
  }
  if (state.loading) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    const result = await state.client.request<{ certificates: Certificate[] }>(
      "training.certificates.list",
      { agentId },
    );
    if (result?.certificates) {
      state.certificates = result.certificates;
    }
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to load certificates:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 刷新所有数据
 */
export async function refreshAll(state: TrainingState) {
  await Promise.all([
    loadCourses(state),
    loadProgresses(state, state.selectedAgentId),
    loadCertificates(state, state.selectedAgentId),
  ]);
}

/**
 * 开始课程学习
 */
export async function startCourse(state: TrainingState, courseId: string, agentId: string) {
  if (!state.client || !state.connected) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    await state.client.request("training.course.start", {
      courseId,
      agentId,
    });
    // 重新加载进度
    await loadProgresses(state, agentId);
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to start course:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 完成模块
 */
export async function completeModule(
  state: TrainingState,
  params: {
    agentId: string;
    courseId: string;
    moduleId: string;
    timeSpent: number;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    await state.client.request("training.module.complete", params);
    // 重新加载进度
    await loadProgresses(state, params.agentId);
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to complete module:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 完成课程
 */
export async function completeCourse(
  state: TrainingState,
  params: {
    agentId: string;
    courseId: string;
    assessmentScore?: number;
  },
) {
  if (!state.client || !state.connected) {
    return;
  }

  state.loading = true;
  state.error = null;

  try {
    await state.client.request("training.course.complete", params);
    // 重新加载进度和证书
    await Promise.all([
      loadProgresses(state, params.agentId),
      loadCertificates(state, params.agentId),
    ]);
  } catch (err) {
    state.error = getErrorMessage(err);
    console.error("Failed to complete course:", err);
  } finally {
    state.loading = false;
  }
}

/**
 * 更新过滤器
 */
export function updateFilter(state: TrainingState, filter: string) {
  state.filter = filter;
}

export function updateFilterType(state: TrainingState, filterType: TrainingState["filterType"]) {
  state.filterType = filterType;
}

export function updateFilterStatus(
  state: TrainingState,
  filterStatus: TrainingState["filterStatus"],
) {
  state.filterStatus = filterStatus;
}

export function updateFilterLevel(state: TrainingState, filterLevel: TrainingState["filterLevel"]) {
  state.filterLevel = filterLevel;
}

/**
 * 切换标签页
 */
export function changeTab(state: TrainingState, tab: TrainingState["activeTab"]) {
  state.activeTab = tab;

  // 切换标签页时加载对应的数据
  if (tab === "courses" && state.courses.length === 0) {
    loadCourses(state);
  } else if (tab === "progress" && state.progresses.length === 0) {
    loadProgresses(state, state.selectedAgentId);
  } else if (tab === "certificates" && state.certificates.length === 0) {
    loadCertificates(state, state.selectedAgentId);
  }
}

/**
 * 选择智能助手
 */
export function selectAgent(state: TrainingState, agentId: string) {
  state.selectedAgentId = agentId;
  // 重新加载该智能助手的进度和证书
  loadProgresses(state, agentId);
  loadCertificates(state, agentId);
}
