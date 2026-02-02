import type { OpenClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import { installSkill } from "../agents/skills-install.js";
import { buildWorkspaceSkillStatus } from "../agents/skills-status.js";
import { formatCliCommand } from "../cli/command-format.js";
import { t } from "../i18n/index.js";
import { detectBinary, resolveNodeManagerOptions } from "./onboard-helpers.js";

function summarizeInstallFailure(message: string): string | undefined {
  const cleaned = message.replace(/^Install failed(?:\s*\([^)]*\))?\s*:?\s*/i, "").trim();
  if (!cleaned) {
    return undefined;
  }
  const maxLen = 140;
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}

function formatSkillHint(skill: {
  description?: string;
  install: Array<{ label: string }>;
}): string {
  const desc = skill.description?.trim();
  const installLabel = skill.install[0]?.label?.trim();
  const combined = desc && installLabel ? `${desc} — ${installLabel}` : desc || installLabel;
  if (!combined) {
    return "install";
  }
  const maxLen = 90;
  return combined.length > maxLen ? `${combined.slice(0, maxLen - 1)}…` : combined;
}

function upsertSkillEntry(
  cfg: OpenClawConfig,
  skillKey: string,
  patch: { apiKey?: string },
): OpenClawConfig {
  const entries = { ...cfg.skills?.entries };
  const existing = (entries[skillKey] as { apiKey?: string } | undefined) ?? {};
  entries[skillKey] = { ...existing, ...patch };
  return {
    ...cfg,
    skills: {
      ...cfg.skills,
      entries,
    },
  };
}

export async function setupSkills(
  cfg: OpenClawConfig,
  workspaceDir: string,
  runtime: RuntimeEnv,
  prompter: WizardPrompter,
): Promise<OpenClawConfig> {
  const report = buildWorkspaceSkillStatus(workspaceDir, { config: cfg });
  const eligible = report.skills.filter((s) => s.eligible);
  const missing = report.skills.filter((s) => !s.eligible && !s.disabled && !s.blockedByAllowlist);
  const blocked = report.skills.filter((s) => s.blockedByAllowlist);

  const needsBrewPrompt =
    process.platform !== "win32" &&
    report.skills.some((skill) => skill.install.some((option) => option.kind === "brew")) &&
    !(await detectBinary("brew"));

  await prompter.note(
    [
      `${t('wizard.skills.status.eligible')}: ${eligible.length}`,
      `${t('wizard.skills.status.missing')}: ${missing.length}`,
      `${t('wizard.skills.status.blocked')}: ${blocked.length}`,
    ].join("\n"),
    t('wizard.skills.status.title'),
  );

  const shouldConfigure = await prompter.confirm({
    message: process.platform === "win32" 
      ? "现在配置技能？（Windows 用户建议默认跳过，在使用时配置）"
      : t('wizard.skills.configure_prompt'),
    initialValue: process.platform !== "win32",
  });
  if (!shouldConfigure) {
    return cfg;
  }

  if (needsBrewPrompt) {
    await prompter.note(
      [
        t('wizard.skills.homebrew.message'),
      ].join("\n"),
      t('wizard.skills.homebrew.title'),
    );
    const showBrewInstall = await prompter.confirm({
      message: t('wizard.skills.homebrew.show_command'),
      initialValue: true,
    });
    if (showBrewInstall) {
      await prompter.note(
        [
          `${t('wizard.skills.homebrew.run_command')}`,
          '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        ].join("\n"),
        t('wizard.skills.homebrew.install_title'),
      );
    }
  }

  const nodeManager = (await prompter.select({
    message: t('wizard.skills.node_manager'),
    options: resolveNodeManagerOptions(),
  })) as "npm" | "pnpm" | "bun";

  let next: OpenClawConfig = {
    ...cfg,
    skills: {
      ...cfg.skills,
      install: {
        ...cfg.skills?.install,
        nodeManager,
      },
    },
  };

  const installable = missing.filter(
    (skill) => skill.install.length > 0 && skill.missing.bins.length > 0,
  );
  if (installable.length > 0) {
    const shouldInstallAll = await prompter.confirm({
      message: `安装所有缺失的技能依赖？（共 ${installable.length} 个）`,
      initialValue: true,
    });

    const selected = shouldInstallAll ? installable.map((s) => s.name) : [];
    for (const name of selected) {
      const target = installable.find((s) => s.name === name);
      if (!target || target.install.length === 0) {
        continue;
      }
      const installId = target.install[0]?.id;
      if (!installId) {
        continue;
      }
      const spin = prompter.progress(`正在安装 ${name}…`);
      const result = await installSkill({
        workspaceDir,
        skillName: target.name,
        installId,
        config: next,
      });
      if (result.ok) {
        spin.stop(`已安装 ${name}`);
      } else {
        const code = result.code == null ? "" : ` (退出码 ${result.code})`;
        const detail = summarizeInstallFailure(result.message);
        spin.stop(`安装失败: ${name}${code}${detail ? ` — ${detail}` : ""}`);
        if (result.stderr) {
          runtime.log(result.stderr.trim());
        } else if (result.stdout) {
          runtime.log(result.stdout.trim());
        }
        runtime.log(
          `提示: 运行 \`${formatCliCommand("openclaw doctor")}\` 查看技能和依赖要求。`,
        );
        runtime.log("文档：https://docs.openclaw.ai/skills");
      }
    }
  }

  for (const skill of missing) {
    if (!skill.primaryEnv || skill.missing.env.length === 0) {
      continue;
    }
    const wantsKey = await prompter.confirm({
      message: `为 ${skill.name} 设置 ${skill.primaryEnv}？`,
      initialValue: false,
    });
    if (!wantsKey) {
      continue;
    }
    const apiKey = String(
      await prompter.text({
        message: `输入 ${skill.primaryEnv}`,
        validate: (value) => (value?.trim() ? undefined : "必填"),
      }),
    );
    next = upsertSkillEntry(next, skill.skillKey, { apiKey: apiKey.trim() });
  }

  return next;
}
