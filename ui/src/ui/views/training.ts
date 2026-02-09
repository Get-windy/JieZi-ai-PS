/**
 * Phase 6: 培训进度管理 UI
 *
 * 功能：
 * - 课程列表展示
 * - 培训进度跟踪
 * - 学习成果展示
 * - 证书管理
 */

import { html, nothing } from "lit";
import { t } from "../i18n.js";

// ========== 类型定义 ==========

export type TrainingCourse = {
  id: string;
  title: string;
  description: string;
  type: "onboarding" | "skill-specific" | "role-upgrade" | "continuous";
  level: "beginner" | "intermediate" | "advanced";
  duration: number; // 分钟
  modules: TrainingModule[];
  hasAssessment: boolean;
  passingScore?: number;
  prerequisites?: string[];
  tags?: string[];
  createdAt: number;
  createdBy: string;
  updatedAt?: number;
};

export type TrainingModule = {
  id: string;
  title: string;
  description: string;
  type: "video" | "reading" | "exercise" | "quiz" | "practice";
  duration: number; // 分钟
  content?: string;
  exercises?: any[];
  isRequired: boolean;
  order: number;
};

export type TrainingProgress = {
  id: string;
  agentId: string;
  courseId: string;
  status: "not-started" | "in-progress" | "completed" | "failed";
  overallProgress: number; // 0-100
  moduleProgress: Map<string, ModuleProgress>;
  exerciseResults: Map<string, ExerciseResult>;
  startedAt?: number;
  completedAt?: number;
  totalTimeSpent: number; // 秒
  passed?: boolean;
  assessmentScore?: number;
};

export type ModuleProgress = {
  moduleId: string;
  started: boolean;
  completed: boolean;
  startedAt?: number;
  completedAt?: number;
  timeSpent: number; // 秒
};

export type ExerciseResult = {
  exerciseId: string;
  score: number;
  totalPoints: number;
  passed: boolean;
  attemptCount: number;
  lastAttemptAt: number;
};

export type Certificate = {
  id: string;
  agentId: string;
  courseId?: string;
  type: "course-completion" | "skill-certification" | "role-certification";
  title: string;
  description: string;
  level?: string;
  issuedAt: number;
  expiresAt?: number;
  verificationCode: string;
};

export type TrainingProps = {
  loading: boolean;
  courses: TrainingCourse[];
  progresses: TrainingProgress[];
  certificates: Certificate[];
  selectedAgentId?: string;
  selectedCourseId?: string;
  filter: string;
  filterType: "all" | "onboarding" | "skill-specific" | "role-upgrade" | "continuous";
  filterStatus: "all" | "not-started" | "in-progress" | "completed" | "failed";
  filterLevel: "all" | "beginner" | "intermediate" | "advanced";
  activeTab: "courses" | "progress" | "certificates";
  onFilterChange: (filter: string) => void;
  onFilterTypeChange: (type: TrainingProps["filterType"]) => void;
  onFilterStatusChange: (status: TrainingProps["filterStatus"]) => void;
  onFilterLevelChange: (level: TrainingProps["filterLevel"]) => void;
  onTabChange: (tab: TrainingProps["activeTab"]) => void;
  onRefresh: () => void;
  onStartCourse: (courseId: string) => void;
  onResumeCourse: (courseId: string) => void;
  onViewCourse: (courseId: string) => void;
  onViewProgress: (progressId: string) => void;
  onViewCertificate: (certificateId: string) => void;
};

// ========== 主渲染函数 ==========

export function renderTraining(props: TrainingProps) {
  return html`
    <section class="card">
      ${renderHeader(props)}
      ${renderTabs(props)}
      ${renderContent(props)}
    </section>
  `;
}

// ========== 头部渲染 ==========

function renderHeader(props: TrainingProps) {
  return html`
    <div class="row" style="justify-content: space-between;">
      <div>
        <div class="card-title">${t("training.title")}</div>
        <div class="card-sub">${t("training.subtitle")}</div>
      </div>
      <div class="row" style="gap: 8px;">
        <button class="btn" ?disabled=${props.loading} @click=${props.onRefresh}>
          ${props.loading ? t("training.loading") : t("training.refresh")}
        </button>
      </div>
    </div>
  `;
}

// ========== 标签页渲染 ==========

function renderTabs(props: TrainingProps) {
  const tabs: Array<{ id: TrainingProps["activeTab"]; label: string }> = [
    { id: "courses", label: t("training.tab.courses") },
    { id: "progress", label: t("training.tab.progress") },
    { id: "certificates", label: t("training.tab.certificates") },
  ];

  return html`
    <div class="tabs" style="margin-top: 16px;">
      ${tabs.map(
        (tab) => html`
          <button
            class="tab ${props.activeTab === tab.id ? "tab-active" : ""}"
            @click=${() => props.onTabChange(tab.id)}
          >
            ${tab.label}
          </button>
        `,
      )}
    </div>
  `;
}

// ========== 内容渲染 ==========

function renderContent(props: TrainingProps) {
  switch (props.activeTab) {
    case "courses":
      return renderCoursesTab(props);
    case "progress":
      return renderProgressTab(props);
    case "certificates":
      return renderCertificatesTab(props);
    default:
      return nothing;
  }
}

// ========== 课程列表标签页 ==========

function renderCoursesTab(props: TrainingProps) {
  const filter = props.filter.trim().toLowerCase();
  let filtered = props.courses;

  // 文本搜索过滤
  if (filter) {
    filtered = filtered.filter(
      (course) =>
        course.title.toLowerCase().includes(filter) ||
        course.description.toLowerCase().includes(filter) ||
        course.tags?.some((tag) => tag.toLowerCase().includes(filter)),
    );
  }

  // 类型过滤
  if (props.filterType !== "all") {
    filtered = filtered.filter((course) => course.type === props.filterType);
  }

  // 级别过滤
  if (props.filterLevel !== "all") {
    filtered = filtered.filter((course) => course.level === props.filterLevel);
  }

  return html`
    <div style="margin-top: 16px;">
      ${renderCourseFilters(props)}
      
      ${
        filtered.length === 0
          ? html`<div class="muted" style="margin-top: 16px;">${t("training.courses.empty")}</div>`
          : html`
            <div class="training-courses-grid" style="margin-top: 16px;">
              ${filtered.map((course) => renderCourseCard(course, props))}
            </div>
          `
      }
    </div>
  `;
}

function renderCourseFilters(props: TrainingProps) {
  return html`
    <div class="filters">
      <label class="field" style="flex: 1;">
        <span>${t("training.filter.search")}</span>
        <input
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
          placeholder="${t("training.filter.search_placeholder")}"
        />
      </label>
      <label class="field" style="min-width: 150px;">
        <span>${t("training.filter.type")}</span>
        <select
          .value=${props.filterType}
          @change=${(e: Event) =>
            props.onFilterTypeChange((e.target as HTMLSelectElement).value as any)}
        >
          <option value="all">${t("training.filter.type.all")}</option>
          <option value="onboarding">${t("training.filter.type.onboarding")}</option>
          <option value="skill-specific">${t("training.filter.type.skill_specific")}</option>
          <option value="role-upgrade">${t("training.filter.type.role_upgrade")}</option>
          <option value="continuous">${t("training.filter.type.continuous")}</option>
        </select>
      </label>
      <label class="field" style="min-width: 150px;">
        <span>${t("training.filter.level")}</span>
        <select
          .value=${props.filterLevel}
          @change=${(e: Event) =>
            props.onFilterLevelChange((e.target as HTMLSelectElement).value as any)}
        >
          <option value="all">${t("training.filter.level.all")}</option>
          <option value="beginner">${t("training.filter.level.beginner")}</option>
          <option value="intermediate">${t("training.filter.level.intermediate")}</option>
          <option value="advanced">${t("training.filter.level.advanced")}</option>
        </select>
      </label>
    </div>
  `;
}

function renderCourseCard(course: TrainingCourse, props: TrainingProps) {
  const progress = props.progresses.find((p) => p.courseId === course.id);
  const statusBadge = getStatusBadge(progress);
  const progressPercent = progress?.overallProgress || 0;

  return html`
    <div class="training-course-card">
      <div class="course-header">
        <div class="course-title">${course.title}</div>
        <div class="chip-row" style="margin-top: 8px;">
          <span class="chip chip-${course.type}">${t(`training.type.${course.type}`)}</span>
          <span class="chip chip-${course.level}">${t(`training.level.${course.level}`)}</span>
          ${statusBadge}
        </div>
      </div>

      <div class="course-description">${course.description}</div>

      <div class="course-meta">
        <div class="meta-item">
          <span class="meta-icon">📚</span>
          <span>${course.modules.length} ${t("training.modules")}</span>
        </div>
        <div class="meta-item">
          <span class="meta-icon">⏱️</span>
          <span>${Math.floor(course.duration / 60)}${t("training.hours")}</span>
        </div>
        ${
          course.hasAssessment
            ? html`
              <div class="meta-item">
                <span class="meta-icon">✅</span>
                <span>${t("training.has_assessment")}</span>
              </div>
            `
            : nothing
        }
      </div>

      ${
        progress
          ? html`
            <div class="progress-bar-container" style="margin-top: 12px;">
              <div class="progress-bar">
                <div class="progress-fill" style="width: ${progressPercent}%;"></div>
              </div>
              <span class="progress-text">${progressPercent}%</span>
            </div>
          `
          : nothing
      }

      <div class="course-actions">
        ${
          !progress
            ? html`
              <button class="btn btn--primary" @click=${() => props.onStartCourse(course.id)}>
                ${t("training.start_course")}
              </button>
            `
            : progress.status === "in-progress"
              ? html`
                <button class="btn btn--primary" @click=${() => props.onResumeCourse(course.id)}>
                  ${t("training.resume_course")}
                </button>
              `
              : nothing
        }
        <button class="btn" @click=${() => props.onViewCourse(course.id)}>
          ${t("training.view_details")}
        </button>
      </div>
    </div>
  `;
}

function getStatusBadge(progress?: TrainingProgress) {
  if (!progress) {
    return html`<span class="chip chip-gray">${t("training.status.not_started")}</span>`;
  }

  const statusMap: Record<TrainingProgress["status"], string> = {
    "not-started": "gray",
    "in-progress": "blue",
    completed: "green",
    failed: "red",
  };

  const colorClass = statusMap[progress.status];
  return html`<span class="chip chip-${colorClass}">${t(`training.status.${progress.status}`)}</span>`;
}

// ========== 培训进度标签页 ==========

function renderProgressTab(props: TrainingProps) {
  const filter = props.filter.trim().toLowerCase();
  let filtered = props.progresses;

  // 状态过滤
  if (props.filterStatus !== "all") {
    filtered = filtered.filter((progress) => progress.status === props.filterStatus);
  }

  // 搜索过滤
  if (filter) {
    filtered = filtered.filter((progress) => {
      const course = props.courses.find((c) => c.id === progress.courseId);
      return course && course.title.toLowerCase().includes(filter);
    });
  }

  return html`
    <div style="margin-top: 16px;">
      ${renderProgressFilters(props)}
      
      ${
        filtered.length === 0
          ? html`<div class="muted" style="margin-top: 16px;">${t("training.progress.empty")}</div>`
          : html`
            <div class="training-progress-list" style="margin-top: 16px;">
              ${filtered.map((progress) => renderProgressCard(progress, props))}
            </div>
          `
      }
    </div>
  `;
}

function renderProgressFilters(props: TrainingProps) {
  return html`
    <div class="filters">
      <label class="field" style="flex: 1;">
        <span>${t("training.filter.search")}</span>
        <input
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
          placeholder="${t("training.filter.search_placeholder")}"
        />
      </label>
      <label class="field" style="min-width: 150px;">
        <span>${t("training.filter.status")}</span>
        <select
          .value=${props.filterStatus}
          @change=${(e: Event) =>
            props.onFilterStatusChange((e.target as HTMLSelectElement).value as any)}
        >
          <option value="all">${t("training.filter.status.all")}</option>
          <option value="not-started">${t("training.status.not_started")}</option>
          <option value="in-progress">${t("training.status.in_progress")}</option>
          <option value="completed">${t("training.status.completed")}</option>
          <option value="failed">${t("training.status.failed")}</option>
        </select>
      </label>
    </div>
  `;
}

function renderProgressCard(progress: TrainingProgress, props: TrainingProps) {
  const course = props.courses.find((c) => c.id === progress.courseId);
  if (!course) return nothing;

  const completedModules = Array.from(progress.moduleProgress.values()).filter(
    (m) => m.completed,
  ).length;
  const totalModules = course.modules.length;
  const timeSpentHours = Math.floor(progress.totalTimeSpent / 3600);
  const timeSpentMinutes = Math.floor((progress.totalTimeSpent % 3600) / 60);

  return html`
    <div class="list-item">
      <div class="list-main">
        <div class="list-title">${course.title}</div>
        <div class="list-sub">
          ${completedModules}/${totalModules} ${t("training.modules_completed")}
          • ${t("training.time_spent")}: ${timeSpentHours}${t("training.hours")} ${timeSpentMinutes}${t("training.minutes")}
        </div>

        <div class="progress-bar-container" style="margin-top: 8px;">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress.overallProgress}%;"></div>
          </div>
          <span class="progress-text">${progress.overallProgress}%</span>
        </div>

        ${
          progress.assessmentScore !== undefined
            ? html`
              <div class="muted" style="margin-top: 8px;">
                ${t("training.assessment_score")}: ${progress.assessmentScore}/${course.passingScore || 100}
              </div>
            `
            : nothing
        }
      </div>
      <div class="list-meta">
        ${getStatusBadge(progress)}
        <button class="btn" style="margin-top: 8px;" @click=${() => props.onViewProgress(progress.id)}>
          ${t("training.view_details")}
        </button>
      </div>
    </div>
  `;
}

// ========== 证书标签页 ==========

function renderCertificatesTab(props: TrainingProps) {
  const filter = props.filter.trim().toLowerCase();
  let filtered = props.certificates;

  // 搜索过滤
  if (filter) {
    filtered = filtered.filter(
      (cert) =>
        cert.title.toLowerCase().includes(filter) ||
        cert.description.toLowerCase().includes(filter),
    );
  }

  return html`
    <div style="margin-top: 16px;">
      <label class="field" style="max-width: 400px;">
        <span>${t("training.filter.search")}</span>
        <input
          .value=${props.filter}
          @input=${(e: Event) => props.onFilterChange((e.target as HTMLInputElement).value)}
          placeholder="${t("training.filter.search_placeholder")}"
        />
      </label>

      ${
        filtered.length === 0
          ? html`<div class="muted" style="margin-top: 16px;">${t("training.certificates.empty")}</div>`
          : html`
            <div class="certificates-grid" style="margin-top: 16px;">
              ${filtered.map((cert) => renderCertificateCard(cert, props))}
            </div>
          `
      }
    </div>
  `;
}

function renderCertificateCard(cert: Certificate, props: TrainingProps) {
  const isExpired = cert.expiresAt && cert.expiresAt < Date.now();
  const issuedDate = new Date(cert.issuedAt).toLocaleDateString();
  const expiresDate = cert.expiresAt ? new Date(cert.expiresAt).toLocaleDateString() : null;

  return html`
    <div class="certificate-card ${isExpired ? "certificate-expired" : ""}">
      <div class="certificate-icon">🏆</div>
      <div class="certificate-title">${cert.title}</div>
      <div class="certificate-description">${cert.description}</div>
      
      <div class="certificate-meta">
        <div class="meta-row">
          <span class="meta-label">${t("training.certificate.type")}:</span>
          <span class="chip chip-${cert.type}">${t(`training.certificate.type.${cert.type}`)}</span>
        </div>
        ${
          cert.level
            ? html`
              <div class="meta-row">
                <span class="meta-label">${t("training.certificate.level")}:</span>
                <span>${cert.level}</span>
              </div>
            `
            : nothing
        }
        <div class="meta-row">
          <span class="meta-label">${t("training.certificate.issued")}:</span>
          <span>${issuedDate}</span>
        </div>
        ${
          expiresDate
            ? html`
              <div class="meta-row">
                <span class="meta-label">${t("training.certificate.expires")}:</span>
                <span class="${isExpired ? "text-danger" : ""}">${expiresDate}</span>
              </div>
            `
            : nothing
        }
        <div class="meta-row">
          <span class="meta-label">${t("training.certificate.code")}:</span>
          <code class="mono">${cert.verificationCode}</code>
        </div>
      </div>

      ${
        isExpired
          ? html`<div class="certificate-expired-badge">${t("training.certificate.expired")}</div>`
          : nothing
      }

      <button class="btn btn--primary" style="margin-top: 16px;" @click=${() => props.onViewCertificate(cert.id)}>
        ${t("training.view_certificate")}
      </button>
    </div>
  `;
}
