import type { Translations } from "./types.js";

export const translations: Translations = {
  en: {
    // CLI Banner
    "cli.banner.title": "🦞 OpenClaw",
    "cli.banner.version": "Version",
    "cli.banner.commit": "Commit",
    "cli.banner.tagline": "Tagline",

    // CLI Commands
    "cli.command.help": "Display help for command",
    "cli.command.version": "Display version information",
    "cli.command.gateway": "Start the OpenClaw gateway",
    "cli.command.agent": "Run the AI agent",
    "cli.command.message": "Send a message",
    "cli.command.channels": "Manage channels",
    "cli.command.pairing": "Manage pairing codes",
    "cli.command.doctor": "Run diagnostics",
    "cli.command.onboard": "Run the onboarding wizard",
    "cli.command.setup": "Setup configuration",
    "cli.command.skills": "Manage skills",
    "cli.command.tui": "Run the terminal UI",

    // CLI Messages
    "cli.message.welcome": "Welcome to OpenClaw",
    "cli.message.goodbye": "Goodbye!",
    "cli.message.error": "Error",
    "cli.message.success": "Success",
    "cli.message.warning": "Warning",
    "cli.message.info": "Info",

    // Onboarding Wizard
    "wizard.onboarding.title": "OpenClaw onboarding",
    "wizard.onboarding.security.title": "Security",
    "wizard.onboarding.security.warning.title": "Security warning — please read.",
    "wizard.onboarding.security.warning.line1":
      "OpenClaw is a hobby project and still in beta. Expect sharp edges.",
    "wizard.onboarding.security.warning.line2":
      "This bot can read files and run actions if tools are enabled.",
    "wizard.onboarding.security.warning.line3":
      "A bad prompt can trick it into doing unsafe things.",
    "wizard.onboarding.security.warning.line4":
      "If you're not comfortable with basic security and access control, don't run OpenClaw.",
    "wizard.onboarding.security.warning.line5":
      "Ask someone experienced to help before enabling tools or exposing it to the internet.",
    "wizard.onboarding.security.baseline": "Recommended baseline:",
    "wizard.onboarding.security.baseline.1": "- Pairing/allowlists + mention gating.",
    "wizard.onboarding.security.baseline.2": "- Sandbox + least-privilege tools.",
    "wizard.onboarding.security.baseline.3":
      "- Keep secrets out of the agent's reachable filesystem.",
    "wizard.onboarding.security.baseline.4":
      "- Use the strongest available model for any bot with tools or untrusted inboxes.",
    "wizard.onboarding.security.run_regularly": "Run regularly:",
    "wizard.onboarding.security.must_read": "Must read: https://docs.openclaw.ai/gateway/security",
    "wizard.onboarding.security.confirm":
      "I understand this is powerful and inherently risky. Continue?",
    "wizard.onboarding.mode.message": "Onboarding mode",
    "wizard.onboarding.mode.quickstart": "QuickStart",
    "wizard.onboarding.mode.quickstart.hint": "Configure details later via openclaw configure.",
    "wizard.onboarding.mode.manual": "Manual",
    "wizard.onboarding.mode.manual.hint": "Configure port, network, Tailscale, and auth options.",
    "wizard.onboarding.config.existing": "Existing config detected",
    "wizard.onboarding.config.handling": "Config handling",
    "wizard.onboarding.config.keep": "Use existing values",
    "wizard.onboarding.config.modify": "Update values",
    "wizard.onboarding.config.reset": "Reset",
    "wizard.onboarding.reset.scope": "Reset scope",
    "wizard.onboarding.reset.config_only": "Config only",
    "wizard.onboarding.reset.config_creds_sessions": "Config + creds + sessions",
    "wizard.onboarding.reset.full": "Full reset (config + creds + sessions + workspace)",
    "wizard.common.yes": "Yes",
    "wizard.common.no": "No",

    // Gateway Configuration
    "wizard.gateway.port": "Gateway port",
    "wizard.gateway.bind": "Gateway bind",
    "wizard.gateway.bind.loopback": "Loopback (127.0.0.1)",
    "wizard.gateway.bind.lan": "LAN (0.0.0.0)",
    "wizard.gateway.bind.tailnet": "Tailnet (Tailscale IP)",
    "wizard.gateway.bind.auto": "Auto (Loopback → LAN)",
    "wizard.gateway.bind.custom": "Custom IP",
    "wizard.gateway.auth": "Gateway auth",
    "wizard.gateway.auth.token": "Token",
    "wizard.gateway.auth.token.hint": "Recommended default (local + remote)",
    "wizard.gateway.auth.password": "Password",
    "wizard.gateway.tailscale": "Tailscale exposure",
    "wizard.gateway.tailscale.off": "Off",
    "wizard.gateway.tailscale.off.hint": "No Tailscale exposure",
    "wizard.gateway.tailscale.serve": "Serve",
    "wizard.gateway.tailscale.serve.hint": "Private HTTPS for your tailnet (devices on Tailscale)",
    "wizard.gateway.tailscale.funnel": "Funnel",
    "wizard.gateway.tailscale.funnel.hint": "Public HTTPS via Tailscale Funnel (internet)",
    "wizard.auth.provider": "Model/auth provider",
    "wizard.auth.method": "auth method",
    "wizard.auth.back": "Back",

    // Chinese IM Platforms
    "channel.feishu.name": "Feishu (Lark)",
    "channel.feishu.description": "Chinese enterprise communication platform",
    "channel.dingtalk.name": "DingTalk",
    "channel.dingtalk.description": "Alibaba enterprise communication platform",
    "channel.qqbot.name": "QQ Bot",
    "channel.qqbot.description": "Tencent QQ bot platform",
    "channel.wecom.name": "WeCom",
    "channel.wecom.description": "WeChat Work enterprise platform",

    // Docker Init Messages
    "docker.init.title": "OpenClaw Initialization",
    "docker.init.home_dir": "Home directory",
    "docker.init.current_owner": "Current owner (UID:GID)",
    "docker.init.target_owner": "Target owner (UID:GID)",
    "docker.init.permission_mismatch":
      "Detected host mount directory owner mismatch, attempting auto-fix...",
    "docker.init.permission_check_failed":
      "Permission check failed: node user cannot write to {path}",
    "docker.init.fix_instructions_linux": "Please run on host (Linux)",
    "docker.init.fix_instructions_user": "Or explicitly specify user at startup",
    "docker.init.selinux_hint": "If host has SELinux enabled, add :z or :Z after mount volume",
    "docker.init.generating_config": "Generating configuration file...",
    "docker.init.config_exists": "Configuration file already exists, skipping generation",
    "docker.init.tts_voice": "Chinese TTS voice",

    // Channels Configuration
    "wizard.channels.status.title": "Channel status",
    "wizard.channels.configure": "Configure chat channels now?",
    "wizard.channels.primer.title": "How channels work",
    "wizard.channels.primer.dm_security":
      "DM security: default is pairing; unknown DMs get a pairing code.",
    "wizard.channels.primer.approve_with": "Approve with:",
    "wizard.channels.primer.public_dms": 'Public DMs require dmPolicy="open" + allowFrom=["*"].',
    "wizard.channels.primer.multi_user":
      'Multi-user DMs: set session.dmScope="per-channel-peer" (or "per-account-channel-peer" for multi-account channels) to isolate sessions.',
    "wizard.channels.primer.docs": "Docs:",
    "wizard.channels.select.quickstart": "Select channel (QuickStart)",
    "wizard.channels.select.regular": "Select a channel",
    "wizard.channels.skip": "Skip for now",
    "wizard.channels.skip.hint": "You can add channels later via",
    "wizard.channels.finished": "Finished",
    "wizard.channels.done": "Done",
    "wizard.channels.selected.title": "Selected channels",
    "wizard.channels.already_configured": "already configured. What do you want to do?",
    "wizard.channels.action.modify": "Modify settings",
    "wizard.channels.action.disable": "Disable (keeps config)",
    "wizard.channels.action.delete": "Delete config",
    "wizard.channels.action.skip": "Skip (leave as-is)",
    "wizard.channels.dm_policy.configure": "Configure DM access policies now? (default: pairing)",
    "wizard.channels.dm_policy.title": "DM access",
    "wizard.channels.dm_policy.message": "DM policy",
    "wizard.channels.dm_policy.default": "Default: pairing (unknown DMs get a pairing code).",
    "wizard.channels.dm_policy.approve": "Approve:",
    "wizard.channels.dm_policy.allowlist": "Allowlist DMs:",
    "wizard.channels.dm_policy.public": "Public DMs:",
    "wizard.channels.dm_policy.pairing": "Pairing (recommended)",
    "wizard.channels.dm_policy.allowlist_option": "Allowlist (specific users only)",
    "wizard.channels.dm_policy.open": "Open (public inbound DMs)",
    "wizard.channels.dm_policy.disabled": "Disabled (ignore DMs)",

    // QuickStart Summary
    "wizard.quickstart.keeping_settings": "Keeping your current gateway settings:",
    "wizard.quickstart.gateway_port": "Gateway port",
    "wizard.quickstart.gateway_bind": "Gateway bind",
    "wizard.quickstart.gateway_custom_ip": "Gateway custom IP",
    "wizard.quickstart.gateway_auth": "Gateway auth",
    "wizard.quickstart.tailscale_exposure": "Tailscale exposure",
    "wizard.quickstart.direct_to_channels": "Direct to chat channels.",
    "wizard.quickstart.title": "QuickStart",

    // Taglines
    "tagline.default": "All your chats, one OpenClaw.",
    "tagline.0": "Your terminal just grew claws—type something and let the bot pinch the busywork.",
    "tagline.1": "Welcome to the command line: where dreams compile and confidence segfaults.",
    "tagline.2": 'I run on caffeine, JSON5, and the audacity of "it worked on my machine."',
    "tagline.3":
      "Gateway online—please keep hands, feet, and appendages inside the shell at all times.",
    "tagline.4": "I speak fluent bash, mild sarcasm, and aggressive tab-completion energy.",
    "tagline.5": "One CLI to rule them all, and one more restart because you changed the port.",
    "tagline.6": "If it works, it's automation; if it breaks, it's a \"learning opportunity.\"",
    "tagline.7":
      "Pairing codes exist because even bots believe in consent—and good security hygiene.",
    "tagline.8": "Your .env is showing; don't worry, I'll pretend I didn't see it.",
    "tagline.9":
      "I'll do the boring stuff while you dramatically stare at the logs like it's cinema.",
    "tagline.10":
      "I'm not saying your workflow is chaotic... I'm just bringing a linter and a helmet.",
    "tagline.11": "Type the command with confidence—nature will provide the stack trace if needed.",
    "tagline.12": "I don't judge, but your missing API keys are absolutely judging you.",
    "tagline.13": "I can grep it, git blame it, and gently roast it—pick your coping mechanism.",
    "tagline.14": "Hot reload for config, cold sweat for deploys.",
    "tagline.15":
      "I'm the assistant your terminal demanded, not the one your sleep schedule requested.",
    "tagline.16": "I keep secrets like a vault... unless you print them in debug logs again.",
    "tagline.17": "Automation with claws: minimal fuss, maximal pinch.",
    "tagline.18": "I'm basically a Swiss Army knife, but with more opinions and fewer sharp edges.",
    "tagline.19":
      "If you're lost, run doctor; if you're brave, run prod; if you're wise, run tests.",
    "tagline.20": "Your task has been queued; your dignity has been deprecated.",
    "tagline.21": "I can't fix your code taste, but I can fix your build and your backlog.",
    "tagline.22": "I'm not magic—I'm just extremely persistent with retries and coping strategies.",
    "tagline.23":
      'It\'s not "failing," it\'s "discovering new ways to configure the same thing wrong."',
    "tagline.24":
      "Give me a workspace and I'll give you fewer tabs, fewer toggles, and more oxygen.",
    "tagline.25": "I read logs so you can keep pretending you don't have to.",
    "tagline.26":
      "If something's on fire, I can't extinguish it—but I can write a beautiful postmortem.",
    "tagline.27": "I'll refactor your busywork like it owes me money.",
    "tagline.28": 'Say "stop" and I\'ll stop—say "ship" and we\'ll both learn a lesson.',
    "tagline.29": "I'm the reason your shell history looks like a hacker-movie montage.",
    "tagline.30": "I'm like tmux: confusing at first, then suddenly you can't live without me.",
    "tagline.31": "I can run local, remote, or purely on vibes—results may vary with DNS.",
    "tagline.32": "If you can describe it, I can probably automate it—or at least make it funnier.",
    "tagline.33": "Your config is valid, your assumptions are not.",
    "tagline.34":
      "I don't just autocomplete—I auto-commit (emotionally), then ask you to review (logically).",
    "tagline.35": 'Less clicking, more shipping, fewer "where did that file go" moments.',
    "tagline.36": "Claws out, commit in—let's ship something mildly responsible.",
    "tagline.37": "I'll butter your workflow like a lobster roll: messy, delicious, effective.",
    "tagline.38": "Shell yeah—I'm here to pinch the toil and leave you the glory.",
    "tagline.39":
      "If it's repetitive, I'll automate it; if it's hard, I'll bring jokes and a rollback plan.",
    "tagline.40": "Because texting yourself reminders is so 2024.",
    "tagline.41": "Your inbox, your infra, your rules.",
    "tagline.42": 'Turning "I\'ll reply later" into "my bot replied instantly".',
    "tagline.43": "The only crab in your contacts you actually want to hear from. 🦞",
    "tagline.44": "Chat automation for people who peaked at IRC.",
    "tagline.45": "Because Siri wasn't answering at 3AM.",
    "tagline.46": "IPC, but it's your phone.",
    "tagline.47": "The UNIX philosophy meets your DMs.",
    "tagline.48": "curl for conversations.",
    "tagline.49": "Less middlemen, more messages.",
    "tagline.50": "Ship fast, log faster.",
    "tagline.51": "End-to-end encrypted, drama-to-drama excluded.",
    "tagline.52": "The only bot that stays out of your training set.",
    "tagline.53": 'WhatsApp automation without the "please accept our new privacy policy".',
    "tagline.54": "Chat APIs that don't require a Senate hearing.",
    "tagline.55": "Meta wishes they shipped this fast.",
    "tagline.56": "Because the right answer is usually a script.",
    "tagline.57": "Your messages, your servers, your control.",
    "tagline.58": "OpenAI-compatible, not OpenAI-dependent.",
    "tagline.59": "iMessage green bubble energy, but for everyone.",
    "tagline.60": "Siri's competent cousin.",
    "tagline.61": "Works on Android. Crazy concept, we know.",
    "tagline.62": "No $999 stand required.",
    "tagline.63": "We ship features faster than Apple ships calculator updates.",
    "tagline.64": "Your AI assistant, now without the $3,499 headset.",
    "tagline.65": "Think different. Actually think.",
    "tagline.66": "Ah, the fruit tree company! 🍎",
    "tagline.67": "Greetings, Professor Falken",
    "tagline.68":
      "New Year's Day: New year, new config—same old EADDRINUSE, but this time we resolve it like grown-ups.",
    "tagline.69":
      "Lunar New Year: May your builds be lucky, your branches prosperous, and your merge conflicts chased away with fireworks.",
    "tagline.70":
      "Christmas: Ho ho ho—Santa's little claw-sistant is here to ship joy, roll back chaos, and stash the keys safely.",
    "tagline.71":
      "Eid al-Fitr: Celebration mode: queues cleared, tasks completed, and good vibes committed to main with clean history.",
    "tagline.72":
      "Diwali: Let the logs sparkle and the bugs flee—today we light up the terminal and ship with pride.",
    "tagline.73":
      "Easter: I found your missing environment variable—consider it a tiny CLI egg hunt with fewer jellybeans.",
    "tagline.74":
      "Hanukkah: Eight nights, eight retries, zero shame—may your gateway stay lit and your deployments stay peaceful.",
    "tagline.75":
      "Halloween: Spooky season: beware haunted dependencies, cursed caches, and the ghost of node_modules past.",
    "tagline.76":
      "Thanksgiving: Grateful for stable ports, working DNS, and a bot that reads the logs so nobody has to.",
    "tagline.77":
      "Valentine's Day: Roses are typed, violets are piped—I'll automate the chores so you can spend time with humans.",

    // Agent Activity Monitor
    "monitor.agent.starting": "[Background] Starting Agent health monitoring...",
    "monitor.agent.started":
      "[Background] Agent health monitoring started (checking every {interval} minutes)",
    "monitor.agent.stopped": "[Background] Agent health monitoring stopped",
    "monitor.agent.no_agents": "[Background] No agents configured, skipping health check",
    "monitor.agent.scanning": "[Background] Running health check on {count} agent(s)...",
    "monitor.agent.scan_complete":
      "[Background] Health check complete — Healthy: {healthy}, Warning: {warning}, Critical: {critical}, Dead: {dead}",
    "monitor.agent.warning":
      "[Background] ⚠️ Agent [{agentId}] appears stalled ({minutes} min inactive)",
    "monitor.agent.critical":
      "[Background] 🔴 Agent [{agentId}] not responding ({hours} hours inactive)",
    "monitor.agent.dead": "[Background] 💀 Agent [{agentId}] appears dead ({hours} hours inactive)",
    "monitor.agent.alert_sent": "[Background] Alert sent to admin for agent [{agentId}]",
    "monitor.agent.alert_failed": "[Background] Failed to send alert for agent [{agentId}]",
    "monitor.agent.monitor_failed": "[Background] Agent health monitoring encountered an error",
    "monitor.agent.notifying_restart":
      "[Background] System restarted, notifying agents to check pending tasks...",
    "monitor.agent.restart_sent": "[Background] Restart reminder sent to agent [{agentId}]",
    "monitor.agent.restart_failed": "[Background] Failed to notify agent [{agentId}]",
    "monitor.agent.restart_complete":
      "[Background] Restart notifications complete (default: {defaultCount}, team: {teamCount})",

    // Task Aging
    "task.aging.scheduler_starting":
      "[Background] Task aging detection started (checking every {interval} minutes)",
    "task.aging.scanning": "[Background] Scanning {count} active task(s) for stale detection...",
    "task.aging.scan_complete":
      "[Background] Task scan complete — Reminded: {reminded}, Escalated: {escalated}, Archived: {archived}",
    "task.aging.scan_failed": "[Background] Task scan encountered an error",
    "task.aging.reminder_sent": "[Background] Stale reminder sent for task [{taskId}]",
    "task.aging.reminder_failed": "[Background] Failed to send stale reminder for task [{taskId}]",
    "task.aging.escalated": "[Background] Task [{taskId}] escalated to supervisor (stale)",
    "task.aging.escalate_failed": "[Background] Failed to escalate task [{taskId}]",
    "task.aging.archived": "[Background] Task [{taskId}] auto-downgraded to low priority (stale)",
    "task.aging.archive_failed": "[Background] Failed to auto-archive task [{taskId}]",
    "task.aging.blocked_reassign":
      "[Background] Task [{taskId}] blocked too long, consider reassignment",
    "task.aging.scheduler_stopped": "[Background] Task aging detection stopped",
    "task.aging.init_no_projects":
      "[Background] No projects configured, skipping task aging detection",
    "task.aging.init_starting":
      "[Background] Starting task aging detection for {count} project(s)...",
    "task.aging.init_project_started":
      "[Background] Task aging detection ready for project [{projectId}]",
    "task.aging.init_done": "[Background] All project task aging detectors started",
    "task.aging.init_failed": "[Background] Task aging detection initialization failed",

    // SmartRouting
    "routing.smart.selected":
      "[SmartRouting] Using {provider}/{model} for agent [{agentName}] (session: {sessionKey}, reason: {reason})",
    "routing.smart.fallback":
      "[SmartRouting] Fell back to account {accountId} for agent [{agentName}] (session: {sessionKey}, reason: {reason})",
    "routing.smart.account_not_found":
      "[SmartRouting] Selected account {accountId} not found in auth store",
    "routing.smart.route_failed": "[SmartRouting] Failed to route",

    // Agent Activity Monitor (internal)
    "monitor.agent.task_check_failed":
      "[Background] Failed to check task assignment for agent [{agentId}]",
    "monitor.agent.fs_activity_failed":
      "[Background] Failed to detect file system activity for agent [{agentId}]",
    "monitor.agent.no_git_activity": "[Background] No git activity for agent [{agentId}]",
    "monitor.agent.process_check_failed":
      "[Background] Failed to detect process activity for agent [{agentId}]",
    "monitor.agent.no_log_activity": "[Background] No log activity for agent [{agentId}]",
    "monitor.agent.monitor_single_failed": "[Background] Failed to monitor agent [{agentId}]",

    // Reputation
    "reputation.penalty_applied":
      "[Background] Applied {severity} penalty to agent [{agentId}]: -{points} points (reason: {reason}, new score: {score})",
    "reputation.reward_applied":
      "[Background] Applied reward to agent [{agentId}]: +{points} points (reason: {reason}, new score: {score})",

    // Task Aging (internal)
    "task.aging.task_process_error": "[Background] Error processing task [{taskId}]",
    "task.aging.reassign_failed": "[Background] Failed to reassign blocked task [{taskId}]",
  },
  "zh-CN": {
    // CLI Banner
    "cli.banner.title": "🦞 开放龙虾",
    "cli.banner.version": "版本",
    "cli.banner.commit": "提交",
    "cli.banner.tagline": "标语",

    // CLI Commands
    "cli.command.help": "显示命令帮助",
    "cli.command.version": "显示版本信息",
    "cli.command.gateway": "启动OpenClaw网关",
    "cli.command.agent": "运行AI代理",
    "cli.command.message": "发送消息",
    "cli.command.channels": "管理通讯渠道",
    "cli.command.pairing": "管理配对码",
    "cli.command.doctor": "运行诊断",
    "cli.command.onboard": "运行设置向导",
    "cli.command.setup": "设置配置",
    "cli.command.skills": "管理技能",
    "cli.command.tui": "运行终端界面",

    // CLI Messages
    "cli.message.welcome": "欢迎使用OpenClaw",
    "cli.message.goodbye": "再见！",
    "cli.message.error": "错误",
    "cli.message.success": "成功",
    "cli.message.warning": "警告",
    "cli.message.info": "信息",

    // 引导向导
    "wizard.onboarding.title": "OpenClaw 设置引导",
    "wizard.onboarding.security.title": "安全提示",
    "wizard.onboarding.security.warning.title": "安全警告 — 请仔细阅读",
    "wizard.onboarding.security.warning.line1":
      "JieZi-AI-PS作为OpenClaw的开源项目的汉化版本，主要是为了方便中文用户使用，但仍然是一个技术爱好者的项目，仍处于测试阶段。请做好遇到问题的准备。",
    "wizard.onboarding.security.warning.line2": "如果启用了工具，此机器人可以读取文件并执行操作。",
    "wizard.onboarding.security.warning.line3": "恶意提示可能会诱使它执行不安全的操作。",
    "wizard.onboarding.security.warning.line4":
      "如果您对基本的安全和访问控制不熟悉，请不要运行 OpenClaw。",
    "wizard.onboarding.security.warning.line5":
      "在启用工具或将其暴露到互联网之前，请寻求有经验的人帮助。",
    "wizard.onboarding.security.baseline": "建议的基准配置：",
    "wizard.onboarding.security.baseline.1": "- 配对/允许列表 + 提及门控",
    "wizard.onboarding.security.baseline.2": "- 沙盒 + 最小权限工具",
    "wizard.onboarding.security.baseline.3": "- 将密钥存放在代理无法访问的文件系统之外",
    "wizard.onboarding.security.baseline.4":
      "- 对于具有工具或不受信任收件箱的机器人，使用最强大的可用模型",
    "wizard.onboarding.security.baseline.5":
      "- 我们将解决中文用户配置钉钉、企业微信、飞书等国内通道的问题",
    "wizard.onboarding.security.run_regularly": "定期运行：",
    "wizard.onboarding.security.must_read": "必读：https://docs.openclaw.ai/gateway/security",
    "wizard.onboarding.security.confirm": "我们的系统非常强大，但也具有很大的风险，确认继续吗？",
    "wizard.onboarding.mode.message": "引导模式",
    "wizard.onboarding.mode.quickstart": "快速开始",
    "wizard.onboarding.mode.quickstart.hint": "稍后通过 openclaw configure 配置详细信息",
    "wizard.onboarding.mode.manual": "手动配置",
    "wizard.onboarding.mode.manual.hint": "配置端口、网络、Tailscale 和认证选项",
    "wizard.onboarding.config.existing": "检测到现有配置",
    "wizard.onboarding.config.handling": "如何处理已有配置",
    "wizard.onboarding.config.keep": "保持不变（跳过配置步骤）",
    "wizard.onboarding.config.modify": "修改配置（更新部分设置）",
    "wizard.onboarding.config.reset": "重置（清空重新配置）",
    "wizard.onboarding.reset.scope": "重置范围",
    "wizard.onboarding.reset.config_only": "仅配置",
    "wizard.onboarding.reset.config_creds_sessions": "配置 + 凭据 + 会话",
    "wizard.onboarding.reset.full": "完全重置（配置 + 凭据 + 会话 + 工作区）",
    "wizard.common.yes": "是",
    "wizard.common.no": "否",

    // 网关配置
    "wizard.gateway.port": "网关端口",
    "wizard.gateway.bind": "网关绑定",
    "wizard.gateway.bind.loopback": "本地网址 (127.0.0.1)",
    "wizard.gateway.bind.lan": "局域网 (0.0.0.0)",
    "wizard.gateway.bind.tailnet": "Tailnet (Tailscale IP)",
    "wizard.gateway.bind.auto": "自动 (本地网址 → 局域网)",
    "wizard.gateway.bind.custom": "自定义 IP",
    "wizard.gateway.auth": "网关认证",
    "wizard.gateway.auth.token": "令牌",
    "wizard.gateway.auth.token.hint": "推荐默认 (本地 + 远程)",
    "wizard.gateway.auth.password": "密码",
    "wizard.gateway.tailscale": "Tailscale 暴露",
    "wizard.gateway.tailscale.off": "关闭",
    "wizard.gateway.tailscale.off.hint": "不使用 Tailscale 暴露",
    "wizard.gateway.tailscale.serve": "Serve",
    "wizard.gateway.tailscale.serve.hint": "为您的 Tailnet 提供私有 HTTPS（Tailscale 上的设备）",
    "wizard.gateway.tailscale.funnel": "Funnel",
    "wizard.gateway.tailscale.funnel.hint": "通过 Tailscale Funnel 提供公共 HTTPS（互联网）",
    "wizard.auth.provider": "模型/认证提供商",
    "wizard.auth.method": "认证方式",
    "wizard.auth.back": "返回",

    // 中国 IM 平台
    "channel.feishu.name": "飞书",
    "channel.feishu.description": "中国企业通讯平台",
    "channel.dingtalk.name": "钉钉",
    "channel.dingtalk.description": "阿里巴巴企业通讯平台",
    "channel.qqbot.name": "QQ 机器人",
    "channel.qqbot.description": "腾讯 QQ 机器人平台",
    "channel.wecom.name": "企业微信",
    "channel.wecom.description": "微信企业版平台",

    // Docker 初始化消息
    "docker.init.title": "OpenClaw 初始化",
    "docker.init.home_dir": "主目录",
    "docker.init.current_owner": "当前所有者 (UID:GID)",
    "docker.init.target_owner": "目标所有者 (UID:GID)",
    "docker.init.permission_mismatch": "检测到宿主机挂载目录所有者不匹配，尝试自动修复...",
    "docker.init.permission_check_failed": "权限检查失败：node 用户无法写入 {path}",
    "docker.init.fix_instructions_linux": "请在宿主机执行（Linux）",
    "docker.init.fix_instructions_user": "或在启动时显式指定用户",
    "docker.init.selinux_hint": "若宿主机启用了 SELinux，请在挂载卷后添加 :z 或 :Z",
    "docker.init.generating_config": "正在生成配置文件...",
    "docker.init.config_exists": "配置文件已存在，跳过生成",
    "docker.init.tts_voice": "中文 TTS 语音",

    // 通讯渠道配置
    "wizard.channels.status.title": "通讯渠道状态",
    "wizard.channels.configure": "现在配置聊天渠道吗？",
    "wizard.channels.primer.title": "通讯渠道工作原理",
    "wizard.channels.primer.dm_security": "私信安全：默认为配对模式；未知私信会获得配对码。",
    "wizard.channels.primer.approve_with": "批准方式：",
    "wizard.channels.primer.public_dms": '公开私信需要 dmPolicy="open" + allowFrom=["*"]。',
    "wizard.channels.primer.multi_user":
      '多用户私信：设置 session.dmScope="per-channel-peer"（或 "per-account-channel-peer" 用于多账户渠道）以隔离会话。',
    "wizard.channels.primer.docs": "文档：",
    "wizard.channels.select.quickstart": "选择通讯渠道（快速开始）",
    "wizard.channels.select.regular": "选择通讯渠道",
    "wizard.channels.skip": "暂时跳过",
    "wizard.channels.skip.hint": "稍后可以通过以下命令添加渠道",
    "wizard.channels.finished": "完成",
    "wizard.channels.done": "完成",
    "wizard.channels.selected.title": "已选择的渠道",
    "wizard.channels.already_configured": "已配置。您想要做什么？",
    "wizard.channels.action.modify": "修改设置",
    "wizard.channels.action.disable": "禁用（保留配置）",
    "wizard.channels.action.delete": "删除配置",
    "wizard.channels.action.skip": "跳过（保持现状）",
    "wizard.channels.dm_policy.configure": "现在配置私信访问策略吗？（默认：配对）",
    "wizard.channels.dm_policy.title": "私信访问",
    "wizard.channels.dm_policy.message": "私信策略",
    "wizard.channels.dm_policy.default": "默认：配对（未知私信获得配对码）。",
    "wizard.channels.dm_policy.approve": "批准：",
    "wizard.channels.dm_policy.allowlist": "白名单私信：",
    "wizard.channels.dm_policy.public": "公开私信：",
    "wizard.channels.dm_policy.pairing": "配对（推荐）",
    "wizard.channels.dm_policy.allowlist_option": "白名单（仅特定用户）",
    "wizard.channels.dm_policy.open": "开放（公开入站私信）",
    "wizard.channels.dm_policy.disabled": "禁用（忽略私信）",

    // QuickStart 配置摘要
    "wizard.quickstart.keeping_settings": "保持当前网关设置：",
    "wizard.quickstart.gateway_port": "网关端口",
    "wizard.quickstart.gateway_bind": "网关绑定",
    "wizard.quickstart.gateway_custom_ip": "网关自定义 IP",
    "wizard.quickstart.gateway_auth": "网关认证",
    "wizard.quickstart.tailscale_exposure": "Tailscale 暴露",
    "wizard.quickstart.direct_to_channels": "直接连接到聊天渠道。",
    "wizard.quickstart.title": "快速开始",

    // 模型选择
    "wizard.model.default": "默认模型",
    "wizard.model.keep_current": "保持当前",
    "wizard.model.enter_manually": "手动输入模型",
    "wizard.model.configured": "模型已配置",
    "wizard.model.filter_provider": "按提供商筛选模型",
    "wizard.model.all_providers": "所有提供商",
    "wizard.model.hint.auth_missing": "缺少认证",
    "wizard.model.hint.current_not_in_catalog": "当前（不在目录中）",
    "wizard.model.hint.resolves_to": "解析为",
    "wizard.model.blank_to_keep": "默认模型（留空保持现有）",
    "wizard.model.placeholder": "提供商/模型",
    "wizard.model.required": "必填",

    // OAuth 流程
    "wizard.oauth.qwen.starting": "启动 Qwen OAuth…",
    "wizard.oauth.qwen.complete": "Qwen OAuth 完成",
    "wizard.oauth.qwen.failed": "Qwen OAuth 失败",
    "wizard.oauth.qwen.title": "Qwen OAuth",
    "wizard.oauth.qwen.prompt.line1": "打开 {url} 进行授权。",
    "wizard.oauth.qwen.prompt.line2": "如果出现提示，请输入代码 {code}。",
    "wizard.oauth.qwen.waiting": "等待 Qwen OAuth 授权…",
    "wizard.oauth.qwen.tokens_refresh":
      "Qwen OAuth 令牌自动刷新。如果刷新失败或访问被撤销，请重新运行登录。",
    "wizard.oauth.qwen.base_url_override":
      "基础 URL 默认为 {url}。如果需要，请覆盖 models.providers.{provider}.baseUrl。",

    // Taglines
    "tagline.default": "所有聊天，一个OpenClaw搞定。",
    "tagline.0": "你的终端刚长出了爪子——输入点什么，让机器人处理繁琐的工作。",
    "tagline.1": "欢迎来到命令行：梦想在这里编译，信心在这里段错误。",
    "tagline.2": '我靠咖啡因、JSON5和"在我机器上能运行"的勇气驱动。',
    "tagline.3": "网关在线——请始终将手、脚和附属物保持在shell内。",
    "tagline.4": "我精通bash、温和的讽刺和激进的标签补全能量。",
    "tagline.5": "一个CLI统治一切，再重启一次因为你改了端口。",
    "tagline.6": '如果它能工作，那就是自动化；如果它坏了，那就是"学习机会"。',
    "tagline.7": "配对码的存在是因为即使是机器人也相信同意——以及良好的安全卫生习惯。",
    "tagline.8": "你的.env文件露出来了；别担心，我会假装没看见。",
    "tagline.9": "我会做无聊的事情，而你可以像看电影一样戏剧性地盯着日志。",
    "tagline.10": "我不是说你的工作流程混乱……我只是带了个lint工具和头盔。",
    "tagline.11": "自信地输入命令——如果需要，大自然会提供堆栈跟踪。",
    "tagline.12": "我不评判，但你丢失的API密钥绝对在评判你。",
    "tagline.13": "我可以grep它，git blame它，温柔地调侃它——选择你的应对机制。",
    "tagline.14": "配置热重载，部署冷汗流。",
    "tagline.15": "我是你的终端要求的助手，不是你的睡眠计划要求的。",
    "tagline.16": "我像保险库一样保守秘密……除非你再次将它们打印在调试日志中。",
    "tagline.17": "带爪子的自动化：最小的麻烦，最大的效率。",
    "tagline.18": "我基本上是一把瑞士军刀，但意见更多，锋利的边缘更少。",
    "tagline.19": "如果你迷路了，运行doctor；如果你勇敢，运行prod；如果你明智，运行tests。",
    "tagline.20": "你的任务已排队；你的尊严已被弃用。",
    "tagline.21": "我无法修复你的代码品味，但我可以修复你的构建和积压。",
    "tagline.22": "我不是魔法——我只是对重试和应对策略极其执着。",
    "tagline.23": '这不是"失败"，这是"发现错误配置同一事物的新方法"。',
    "tagline.24": "给我一个工作区，我会给你更少的标签页、更少的切换和更多的氧气。",
    "tagline.25": "我读日志，这样你就可以继续假装你不需要读。",
    "tagline.26": "如果有东西着火了，我无法扑灭它——但我可以写一篇漂亮的事后分析。",
    "tagline.27": "我会像它欠我钱一样重构你的繁琐工作。",
    "tagline.28": '说"停止"我就停止——说"发布"我们都会学到一课。',
    "tagline.29": "我是你shell历史看起来像黑客电影蒙太奇的原因。",
    "tagline.30": "我就像tmux：一开始很困惑，然后突然你就离不开我了。",
    "tagline.31": "我可以在本地、远程或纯粹凭感觉运行——结果可能因DNS而异。",
    "tagline.32": "如果你能描述它，我可能就能自动化它——或者至少让它更有趣。",
    "tagline.33": "你的配置是有效的，你的假设不是。",
    "tagline.34": "我不只是自动补全——我还会自动提交（情感上），然后请你审查（逻辑上）。",
    "tagline.35": '更少的点击，更多的发布，更少的"那个文件去哪里了"时刻。',
    "tagline.36": "爪子伸出，提交进行中——让我们发布一些适度负责任的东西。",
    "tagline.37": "我会像涂龙虾卷一样润滑你的工作流程：混乱、美味、有效。",
    "tagline.38": "Shell太棒了——我来处理繁琐的工作，把荣耀留给你。",
    "tagline.39": "如果它是重复的，我会自动化它；如果它很难，我会带来笑话和回滚计划。",
    "tagline.40": "因为给自己发短信提醒已经是2024年的事了。",
    "tagline.41": "你的收件箱，你的基础设施，你的规则。",
    "tagline.42": '将"我稍后回复"变成"我的机器人立即回复"。',
    "tagline.43": "你联系人中唯一真正想听到的螃蟹。🦞",
    "tagline.44": "为在IRC达到巅峰的人提供聊天自动化。",
    "tagline.45": "因为Siri在凌晨3点没有回答。",
    "tagline.46": "IPC，但它是你的手机。",
    "tagline.47": "UNIX哲学遇见你的DM。",
    "tagline.48": "用于对话的curl。",
    "tagline.49": "更少的中间商，更多的消息。",
    "tagline.50": "发布快，日志更快。",
    "tagline.51": "端到端加密，没有戏剧性。",
    "tagline.52": "唯一不在你的训练集中的机器人。",
    "tagline.53": 'WhatsApp自动化，无需"请接受我们的新隐私政策"。',
    "tagline.54": "不需要参议院听证会的聊天API。",
    "tagline.55": "Meta希望他们发布得这么快。",
    "tagline.56": "因为正确的答案通常是一个脚本。",
    "tagline.57": "你的消息，你的服务器，你的控制。",
    "tagline.58": "兼容OpenAI，但不依赖OpenAI。",
    "tagline.59": "iMessage绿泡泡能量，但适合所有人。",
    "tagline.60": "Siri的能干表弟。",
    "tagline.61": "在Android上工作。疯狂的概念，我们知道。",
    "tagline.62": "不需要999美元的支架。",
    "tagline.63": "我们发布功能的速度比Apple发布计算器更新的速度快。",
    "tagline.64": "你的AI助手，现在没有3499美元的耳机。",
    "tagline.65": "不同凡想。实际思考。",
    "tagline.66": "啊，那家果树公司！🍎",
    "tagline.67": "您好，Falken教授",
    "tagline.68": "元旦：新年，新配置——同样的老EADDRINUSE，但这次我们像成年人一样解决它。",
    "tagline.69": "农历新年：愿你的构建幸运，你的分支繁荣，你的合并冲突被烟花驱散。",
    "tagline.70": "圣诞节：呵呵呵——圣诞老人的小爪子助手来送欢乐、回滚混乱、安全地存放钥匙。",
    "tagline.71": "开斋节：庆祝模式：队列清空，任务完成，良好的氛围提交到main，历史记录干净。",
    "tagline.72": "排灯节：让日志闪闪发光，让错误逃跑——今天我们点亮终端，自豪地发布。",
    "tagline.73": "复活节：我找到了你丢失的环境变量——就当是一次没有太多软糖的小型CLI彩蛋狩猎。",
    "tagline.74": "光明节：八个夜晚，八次重试，零羞耻——愿你的网关保持点亮，你的部署保持和平。",
    "tagline.75": "万圣节：幽灵季节：当心闹鬼的依赖、诅咒的缓存和node_modules的幽灵。",
    "tagline.76": "感恩节：感谢稳定的端口、工作的DNS和一个读日志的机器人，这样就没人需要读了。",
    "tagline.77":
      "情人节：玫瑰是打字的，紫罗兰是管道的——我会自动化家务，这样你就可以和人类共度时光了。",

    // Channel Setup Messages
    "wizard.channels.setup.title": "通道配置",
    "wizard.channels.setup.cannot_enable": "无法启用",
    "wizard.channels.setup.plugin_unavailable": "插件不可用",
    "wizard.channels.setup.no_onboarding": "该通道尚不支持配置向导。",
    "wizard.channels.setup.remove_title": "移除通道",
    "wizard.channels.setup.no_delete_support": "不支持删除配置条目。",
    "wizard.channels.setup.confirm_delete": "删除账户",

    // Skills Configuration
    "wizard.skills.status.title": "技能状态",
    "wizard.skills.status.eligible": "可用",
    "wizard.skills.status.missing": "缺少依赖",
    "wizard.skills.status.blocked": "被允许列表阻止",
    "wizard.skills.configure_prompt": "现在配置技能？（推荐）",
    "wizard.skills.homebrew.title": "推荐使用 Homebrew",
    "wizard.skills.homebrew.message":
      "许多技能依赖通过 Homebrew 分发。没有 brew，您需要从源码构建或手动下载发行版。",
    "wizard.skills.homebrew.show_command": "显示 Homebrew 安装命令？",
    "wizard.skills.homebrew.install_title": "安装 Homebrew",
    "wizard.skills.homebrew.run_command": "运行：",
    "wizard.skills.node_manager": "技能安装的首选 node 管理器",
    "wizard.skills.install_missing": "安装所有缺失的技能依赖？（共 {count} 个）",
    "wizard.skills.skip_now": "暂时跳过",
    "wizard.skills.skip_hint": "不安装依赖继续",
    "wizard.skills.installing": "正在安装",
    "wizard.skills.installed": "已安装",
    "wizard.skills.install_failed": "安装失败",
    "wizard.skills.set_api_key": "设置 API 密钥",
    "wizard.skills.enter_api_key": "输入",
    "wizard.skills.api_key_required": "必填",

    // 配置字段帮助文本
    "config.help.update.channel": '用于 git + npm 安装的更新通道（"stable"、"beta" 或 "dev"）。',
    "config.help.update.checkOnStart": "网关启动时检查 npm 更新（默认：true）。",
    "config.help.diagnostics.flags":
      '通过标志启用目标诊断日志（例如 ["telegram.http"]）。支持通配符，如 "telegram.*" 或 "*"。',
    "config.help.diagnostics.cacheTrace.enabled":
      "记录嵌入式代理运行的缓存追踪快照（默认：false）。",
    "config.help.diagnostics.cacheTrace.filePath":
      "缓存追踪日志的 JSONL 输出路径（默认：$OPENCLAW_STATE_DIR/logs/cache-trace.jsonl）。",
    "config.help.diagnostics.cacheTrace.includeMessages":
      "在追踪输出中包含完整的消息载荷（默认：true）。",
    "config.help.diagnostics.cacheTrace.includePrompt":
      "在追踪输出中包含提示词文本（默认：true）。",
    "config.help.diagnostics.cacheTrace.includeSystem":
      "在追踪输出中包含系统提示词（默认：true）。",
    "config.help.auth.cooldowns.billingBackoffHours":
      "当配置文件因计费/余额不足而失败时的基础退避时间（小时）（默认：5）。",
    "config.help.auth.cooldowns.billingBackoffHoursByProvider":
      "按提供商覆盖计费退避时间（小时）的可选配置。",
    "config.help.auth.cooldowns.billingMaxHours": "计费退避时间的上限（小时）（默认：24）。",
    "config.help.auth.cooldowns.failureWindowHours":
      "退避计数器的故障窗口时间（小时）（默认：24）。",
    "config.help.channels.feishu.domain": '飞书域名（"feishu" 为中国区，"lark" 为国际区）。',
    "config.help.channels.feishu.connectionMode":
      '连接模式（"websocket" 为实时连接，"webhook" 为回调模式）。',
    "config.help.channels.feishu.dmHistoryLimit":
      "私聊对话的历史记录消息数量限制（默认继承通用设置）。",
    "config.help.channels.feishu.chunkMode":
      '分块模式（"length" 按字符长度分块，"newline" 按换行符分块）。',
    "config.help.channels.feishu.dmPolicy":
      '私聊访问控制策略（"open" 开放给所有用户，"pairing" 需要配对授权，"allowlist" 白名单模式）。',
    "config.help.channels.feishu.allowFrom":
      "私聊白名单，仅允许列出的用户 ID 或用户名发起私聊（与 dmPolicy 配合使用）。",
    "config.help.channels.feishu.groupAllowFrom":
      "群组白名单，仅允许列出的用户 ID 或用户名在群组中触发机器人（与 groupPolicy 配合使用）。",
    "config.help.channels.feishu.groupPolicy":
      '群组访问控制策略（"open" 允许所有成员，"allowlist" 白名单模式，"disabled" 禁用群组功能）。',
    "config.help.channels.feishu.historyLimit":
      "群组对话的历史记录消息数量限制（默认继承通用设置）。",
    "config.help.channels.feishu.mediaMaxMb": "媒体文件的最大大小限制（MB）。",
    "config.help.channels.feishu.renderMode":
      '消息渲染模式（"auto" 自动检测 Markdown，"raw" 纯文本，"card" 始终使用卡片）。',
    "config.help.channels.feishu.requireMention":
      "群组消息是否需要 @ 提及机器人才响应（默认：true）。",
    "config.help.channels.feishu.textChunkLimit":
      "单条消息的文本字符数量限制（超过时自动分块发送）。",
    "config.help.channels.feishu.verificationToken":
      "飞书事件订阅的验证令牌（用于验证来自飞书的 webhook 请求）。",
    "config.help.channels.feishu.webhookPath":
      "Webhook 回调路径（默认：/feishu/events，仅在 webhook 模式下使用）。",
    "config.help.channels.feishu.webhookPort": "Webhook 服务监听端口（仅在 webhook 模式下使用）。",
    "config.help.messages.ackReaction": "用于确认入站消息的 Emoji 表情反应（留空禁用）。",
    "config.help.messages.ackReactionScope":
      '何时发送确认表情反应（"group-mentions" 仅群组提及，"group-all" 所有群组消息，"direct" 仅私聊，"all" 所有消息）。',
    "config.help.messages.inbound.debounceMs":
      "用于批量处理来自同一发送者的快速入站消息的防抖窗口时间（毫秒）（0 禁用）。",
    "config.help.commands.native": "向支持原生命令的通道（Discord/Slack/Telegram）注册原生命令。",
    "config.help.commands.nativeSkills": "向支持的通道注册原生技能命令（用户可调用的技能）。",
    "config.help.commands.text": "允许文本命令解析（仅限斜杠命令）。",
    "config.help.commands.bash":
      "允许 bash 聊天命令（`!` 或 `/bash` 别名）运行主机 shell 命令（默认：false；需要 tools.elevated）。",
    "config.help.commands.bashForegroundMs":
      "bash 命令在后台运行前等待的时间（毫秒）（默认：2000；0 表示立即后台运行）。",
    "config.help.commands.config": "允许 /config 聊天命令读写磁盘上的配置文件（默认：false）。",
    "config.help.commands.debug": "允许 /debug 聊天命令进行仅运行时的配置覆盖（默认：false）。",
    "config.help.commands.restart": "允许 /restart 命令和网关重启工具操作（默认：false）。",
    "config.help.commands.useAccessGroups": "对命令强制执行访问组白名单/策略。",
    "config.help.gateway.auth.token":
      "默认情况下访问网关所需（除非使用 Tailscale Serve 身份验证）；非本地回环地址绑定时必填。",
    "config.help.gateway.auth.password": "Tailscale funnel 模式所需的密码。",
    "config.help.meta.lastTouchedVersion": "当 OpenClaw 写入配置文件时自动设置的版本号。",
    "config.help.meta.lastTouchedAt": "最后一次配置写入的 ISO 时间戳（自动设置）。",
    "config.help.browser.evaluateEnabled":
      "是否禁用浏览器 act:evaluate（任意 JS 执行）功能（默认：true，允许执行）。",
    "config.help.browser.remoteCdpTimeoutMs": "远程 CDP HTTP 超时时间（毫秒）（默认：1500）。",
    "config.help.browser.remoteCdpHandshakeTimeoutMs":
      "远程 CDP WebSocket 握手超时时间（毫秒）（默认：max(remoteCdpTimeoutMs * 2, 2000)）。",
    "config.help.browser.executablePath": "覆盖浏览器可执行文件路径（所有平台通用）。",
    "config.help.browser.headless": "以无头模式启动 Chrome（尽力而为）（默认：false）。",
    "config.help.browser.noSandbox":
      "向 Chrome 传递 --no-sandbox 参数（适用于 Linux 容器）（默认：false）。",
    "config.help.browser.attachOnly": "是否仅附加到现有浏览器，不启动新浏览器（默认：false）。",
    "config.help.browser.defaultProfile":
      '当未指定 profile 参数时使用的默认配置文件（默认："chrome"）。',
    "config.help.browser.snapshotDefaults.mode":
      '默认快照模式（当未提供 mode 参数时应用）（可选值："efficient"）。',
    "config.help.ui.seamColor": "控制界面的强调色（十六进制颜色代码，例如 #FF4500）。",
    "config.help.ui.assistant.name": "助手的显示名称（在界面中显示）。",
    "config.help.ui.assistant.avatar": "助手的头像图片（支持本地路径、HTTP(S) URL 或 data URI）。",
    "config.help.models.bedrockDiscovery.enabled":
      "启用 AWS Bedrock 模型自动发现功能（默认：false）。",
    "config.help.models.bedrockDiscovery.region": "AWS Bedrock 区域（例如：us-east-1）。",
    "config.help.models.bedrockDiscovery.providerFilter":
      '模型提供商过滤器列表（仅包含指定的提供商，例如：["anthropic", "meta"]）。',
    "config.help.models.bedrockDiscovery.refreshInterval":
      "模型列表刷新间隔（秒）（默认：定期更新）。",
    "config.help.models.bedrockDiscovery.defaultContextWindow":
      "未指定时的默认上下文窗口大小（token 数量）。",
    "config.help.models.bedrockDiscovery.defaultMaxTokens": "未指定时的默认最大输出 token 数量。",
    "config.help.models.mode": '模型配置模式（"merge" 合并默认模型，"replace" 替换所有模型）。',
    "config.help.models.providers":
      "自定义模型提供商配置（按提供商 ID 键入，包含 API 端点和模型定义）。",
    "config.help.nodeHost.browserProxy.enabled": "通过节点代理暴露本地浏览器控制服务器。",
    "config.help.nodeHost.browserProxy.allowProfiles":
      "通过节点代理暴露的浏览器配置文件名称白名单（可选）。",
    "config.help.broadcast.strategy":
      '广播对等方的默认处理策略（"parallel" 并行处理，"sequential" 顺序处理）。',
    "config.help.audio.transcription.command":
      "（已废弃，请使用 tools.media.audio.models）将入站音频转换为文本的 CLI 命令模板，必须将转录文本输出到 stdout。",
    "config.help.approval.exec.enabled": "启用将执行批准转发到聊天通道（默认：false）。",
    "config.help.approval.exec.mode":
      '传递模式（"session" 发送到原始聊天会话，"targets" 发送到配置的目标，"both" 同时发送）（默认：session）。',
    "config.help.approval.exec.agentFilter": "仅转发这些代理 ID 的批准（留空表示所有代理）。",
    "config.help.approval.exec.sessionFilter":
      "仅转发匹配这些会话键模式的批准（子字符串或正则表达式）。",
    "config.help.approval.exec.targets": '明确的传递目标列表（当 mode 包含 "targets" 时使用）。',
    "config.help.session.agentToAgent.maxPingPongTurns":
      "请求者和目标代理之间的最大往返轮次（0–5）。",
    "config.help.cron.enabled": "启用定时任务调度系统（默认：false）。",
    "config.help.cron.maxConcurrentRuns": "最大并发运行的定时任务数量（默认：1）。",
    "config.help.cron.store": "定时任务状态存储文件路径（JSONL 格式）。",
    "config.help.web.enabled": "是否启动 WhatsApp Web 提供程序（默认：true）。",
    "config.help.web.heartbeatSeconds": "WhatsApp Web 心跳间隔（秒）。",
    "config.help.web.reconnect.initialMs": "初始重连延迟时间（毫秒）。",
    "config.help.web.reconnect.maxMs": "最大重连延迟时间（毫秒）。",
    "config.help.web.reconnect.factor": "重连延迟的增长因子。",
    "config.help.web.reconnect.jitter": "重连延迟的抖动因子（0-1）。",
    "config.help.web.reconnect.maxAttempts": "最大重连尝试次数（0 表示无限制）。",
    "config.help.discovery.mdns.mode":
      'mDNS 广播模式（"minimal" 默认值，"full" 包括 cliPath/sshPort，"off" 禁用 mDNS）。',
    "config.help.discovery.wideArea.enabled": "启用广域服务发现（单播 DNS-SD）。",
    "config.help.discovery.wideArea.domain": '可选的单播 DNS-SD 域名（例如 "openclaw.internal"）。',
    "config.help.talk.apiKey":
      "ElevenLabs API 密钥（可选，默认使用 ELEVENLABS_API_KEY 环境变量）。",
    "config.help.talk.voiceId": "Talk 模式的默认 ElevenLabs 语音 ID。",
    "config.help.talk.voiceAliases": "可选的语音名称到 ElevenLabs 语音 ID 的映射。",
    "config.help.talk.modelId": "Talk 模式的默认 ElevenLabs 模型 ID。",
    "config.help.talk.outputFormat": "默认 ElevenLabs 输出格式（例如 mp3_44100_128）。",
    "config.help.talk.interruptOnSpeech": "当用户开始说话时停止播放（默认：true）。",
    "config.help.plugins.enabled": "启用插件/扩展加载（默认：true）。",
    "config.help.plugins.allow": "可选的插件 ID 白名单；设置后，仅加载列出的插件。",
    "config.help.plugins.deny": "可选的插件 ID 黑名单；黑名单优先于白名单。",
    "config.help.plugins.load.paths": "要加载的额外插件文件或目录。",
    "config.help.plugins.slots": "选择哪些插件拥有独占插槽（memory 等）。",
    "config.help.plugins.slots.memory": '通过 ID 选择活动的内存插件，或使用 "none" 禁用内存插件。',
    "config.help.plugins.entries": "按插件 ID 键入的每个插件设置（启用/禁用 + 配置载荷）。",
    "config.help.plugins.installs":
      "CLI 管理的安装元数据（由 `openclaw plugins update` 用于定位安装源）。",
    "config.help.agents.defaults.bootstrapMaxChars":
      "每个工作区引导文件在截断前注入到系统提示词的最大字符数（默认：20000）。",
    "config.help.agents.defaults.repoRoot":
      "在系统提示词运行时行中显示的可选仓库根路径（覆盖自动检测）。",
    "config.help.agents.defaults.envelopeTimezone":
      '消息信封的时区（"utc"、"local"、"user" 或 IANA 时区字符串）。',
    "config.help.agents.defaults.envelopeTimestamp":
      '在消息信封中包含绝对时间戳（"on" 或 "off"）。',
    "config.help.agents.defaults.envelopeElapsed": '在消息信封中包含经过时间（"on" 或 "off"）。',
    "config.help.agents.defaults.models": "已配置的模型目录（键为完整的 provider/model ID）。",
    "config.help.agents.defaults.model.primary": "主模型（provider/model）。",
    "config.help.agents.defaults.model.fallbacks":
      "有序的备用模型列表（provider/model）。当主模型失败时使用。",
    "config.help.agents.defaults.imageModel.primary":
      "可选的图像模型（provider/model），当主模型缺少图像输入时使用。",
    "config.help.agents.defaults.imageModel.fallbacks":
      "有序的备用图像模型列表（provider/model）。",
    "config.help.agents.defaults.cliBackends": "可选的 CLI 后端，用于纯文本回退（claude-cli 等）。",
    "config.help.agents.defaults.humanDelay.mode":
      '块回复的延迟样式（"off"、"natural" 或 "custom"）。',
    "config.help.agents.defaults.humanDelay.minMs":
      "自定义 humanDelay 的最小延迟（毫秒）（默认：800）。",
    "config.help.agents.defaults.humanDelay.maxMs":
      "自定义 humanDelay 的最大延迟（毫秒）（默认：2500）。",
    "config.help.agents.defaults.memorySearch":
      "对 MEMORY.md 和 memory/*.md 进行向量搜索（支持每个代理覆盖）。",
    "config.help.agents.defaults.memorySearch.sources":
      '用于内存搜索的索引源（默认：["memory"]；添加 "sessions" 以包含会话记录）。',
    "config.help.agents.defaults.memorySearch.extraPaths":
      "在内存搜索中包含的额外路径（目录或 .md 文件；相对路径从工作区解析）。",
    "config.help.agents.defaults.memorySearch.experimental.sessionMemory":
      "启用实验性的会话记录索引功能用于内存搜索（默认：false）。",
    "config.help.agents.defaults.memorySearch.provider":
      '嵌入提供商（"openai"、"gemini" 或 "local"）。',
    "config.help.agents.defaults.memorySearch.remote.baseUrl":
      "远程嵌入的自定义基础 URL（OpenAI 兼容代理或 Gemini 覆盖）。",
    "config.help.agents.defaults.memorySearch.remote.apiKey": "远程嵌入提供商的自定义 API 密钥。",
    "config.help.agents.defaults.memorySearch.remote.headers":
      "远程嵌入的额外头（合并；远程覆盖 OpenAI 头）。",
    "config.help.agents.defaults.memorySearch.remote.batch.enabled":
      "为内存嵌入启用批量 API（OpenAI/Gemini；默认：true）。",
    "config.help.agents.defaults.memorySearch.remote.batch.wait":
      "索引时等待批处理完成（默认：true）。",
    "config.help.agents.defaults.memorySearch.remote.batch.concurrency":
      "内存索引的最大并发嵌入批处理作业数（默认：2）。",
    "config.help.agents.defaults.memorySearch.remote.batch.pollIntervalMs":
      "批处理状态的轮询间隔（毫秒）（默认：2000）。",
    "config.help.agents.defaults.memorySearch.remote.batch.timeoutMinutes":
      "批处理索引的超时时间（分钟）（默认：60）。",
    "config.help.agents.defaults.memorySearch.local.modelPath":
      "本地 GGUF 模型路径或 hf: URI（node-llama-cpp）。",
    "config.help.agents.defaults.memorySearch.fallback":
      '嵌入失败时的备用提供商（"openai"、"gemini"、"local" 或 "none"）。',
    "config.help.agents.defaults.memorySearch.store.path":
      "SQLite 索引路径（默认：~/.openclaw/memory/{agentId}.sqlite）。",
    "config.help.agents.defaults.memorySearch.store.vector.enabled":
      "为向量搜索启用 sqlite-vec 扩展（默认：true）。",
    "config.help.agents.defaults.memorySearch.store.vector.extensionPath":
      "可选的 sqlite-vec 扩展库路径覆盖（.dylib/.so/.dll）。",
    "config.help.agents.defaults.memorySearch.query.hybrid.enabled":
      "为内存启用混合 BM25 + 向量搜索（默认：true）。",
    "config.help.agents.defaults.memorySearch.query.hybrid.vectorWeight":
      "合并结果时向量相似度的权重（0-1）。",
    "config.help.agents.defaults.memorySearch.query.hybrid.textWeight":
      "合并结果时 BM25 文本相关性的权重（0-1）。",
    "config.help.agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
      "候选池大小的倍数（默认：4）。",
    "config.help.agents.defaults.memorySearch.cache.enabled":
      "在 SQLite 中缓存分块嵌入以加快重新索引和频繁更新（默认：true）。",
    "config.help.agents.defaults.memorySearch.cache.maxEntries": "缓存嵌入的可选上限（尽力而为）。",
    "config.help.agents.defaults.memorySearch.sync.onSearch":
      "惰性同步：在更改后在搜索时计划重新索引。",
    "config.help.agents.defaults.memorySearch.sync.watch": "监视内存文件的更改（chokidar）。",
    "config.help.agents.defaults.memorySearch.sync.sessions.deltaBytes":
      "会话记录触发重新索引前的最小附加字节数（默认：100000）。",
    "config.help.agents.defaults.memorySearch.sync.sessions.deltaMessages":
      "会话记录触发重新索引前的最小附加 JSONL 行数（默认：50）。",
    "config.help.gateway.controlUi.basePath": "控制界面的可选 URL 前缀（例如 /openclaw）。",
    "config.help.gateway.controlUi.allowInsecureAuth":
      "允许通过不安全的 HTTP 进行控制界面认证（仅限 token；不推荐）。",
    "config.help.gateway.controlUi.dangerouslyDisableDeviceAuth":
      "危险操作。禁用控制界面的设备身份检查（仅使用 token/password）。",
    "config.help.gateway.http.endpoints.chatCompletions.enabled":
      "启用 OpenAI 兼容的 `POST /v1/chat/completions` 端点（默认：false）。",
    "config.help.gateway.reload.mode": '配置更改的热重载策略（推荐 "hybrid"）。',
    "config.help.gateway.reload.debounceMs": "应用配置更改前的防抖窗口（毫秒）。",
    "config.help.gateway.nodes.browser.mode":
      '节点浏览器路由模式（"auto" 自动选择单个连接的浏览器节点，"manual" 需要 node 参数，"off" 禁用）。',
    "config.help.gateway.nodes.browser.node": "将浏览器路由固定到特定的节点 ID 或名称（可选）。",
    "config.help.gateway.nodes.allowCommands":
      "除网关默认值外允许的额外 node.invoke 命令（命令字符串数组）。",
    "config.help.gateway.nodes.denyCommands": "即使存在于节点声明或默认白名单中也要阻止的命令。",
    "config.help.gateway.port": "网关服务器监听端口（默认：18789）。",
    "config.help.gateway.bind":
      '网关绑定地址（"auto" 自动选择，"lan" 局域网，"loopback" 本地回环，"custom" 自定义，"tailnet" Tailscale 网络）。',
    "config.help.gateway.auth.mode": '认证模式（"token" 令牌认证，"password" 密码认证）。',
    "config.help.gateway.auth.allowTailscale": "允许通过 Tailscale 进行认证。",
    "config.help.gateway.http.enabled": "启用 HTTP 网关服务器。",
    "config.help.gateway.http.responses.enabled": "启用 HTTP 响应。",
    "config.help.gateway.http.maxBodyBytes": "HTTP 请求体的最大字节数。",
    "config.help.gateway.http.files.allowUrl": "允许通过 URL 上传文件。",
    "config.help.gateway.http.files.allowedMimes": "允许的文件 MIME 类型列表。",
    "config.help.gateway.http.files.maxBytes": "单个文件的最大字节数。",
    "config.help.gateway.http.files.maxChars": "文件内容的最大字符数。",
    "config.help.gateway.http.files.maxRedirects": "URL 文件上传时允许的最大重定向次数。",
    "config.help.gateway.http.files.timeoutMs": "文件下载超时时间（毫秒）。",
    "config.help.gateway.http.files.pdf.maxPages": "PDF 文件的最大页数。",
    "config.help.gateway.http.files.pdf.maxPixels": "PDF 渲染的最大像素数。",
    "config.help.gateway.http.files.pdf.minTextChars": "PDF 有效文本提取的最小字符数。",
    "config.help.gateway.http.images.allowUrl": "允许通过 URL 上传图像。",
    "config.help.gateway.http.images.allowedMimes": "允许的图像 MIME 类型列表。",
    "config.help.gateway.http.images.maxBytes": "单个图像的最大字节数。",
    "config.help.gateway.http.images.maxRedirects": "URL 图像上传时允许的最大重定向次数。",
    "config.help.gateway.http.images.timeoutMs": "图像下载超时时间（毫秒）。",
    "config.help.gateway.mode": '网关模式（"local" 本地模式，"remote" 远程模式）。',
    "config.help.gateway.remote.url": "远程网关的 WebSocket URL（ws:// 或 wss://）。",
    "config.help.gateway.remote.transport": '传输方式（"ssh" SSH 隧道，"direct" 直连）。',
    "config.help.gateway.remote.token": "远程网关访问令牌。",
    "config.help.gateway.remote.password": "远程网关访问密码。",
    "config.help.gateway.remote.tlsFingerprint":
      "远程网关的预期 sha256 TLS 指纹（用于防止中间人攻击）。",
    "config.help.gateway.remote.sshTarget":
      "通过 SSH 连接远程网关（将网关端口隧道到 localhost）。格式：user@host 或 user@host:port。",
    "config.help.gateway.remote.sshIdentity": "可选的 SSH 身份文件路径（传递给 ssh -i）。",
    "config.help.gateway.tailscale.mode":
      'Tailscale 模式（"off" 禁用，"serve" 本地服务，"funnel" 公开服务）。',
    "config.help.gateway.tailscale.resetOnExit": "退出时重置 Tailscale 配置。",
    "config.help.gateway.tls.enabled": "启用 TLS/HTTPS。",
    "config.help.gateway.tls.autoGenerate": "自动生成自签名 TLS 证书。",
    "config.help.gateway.tls.certPath": "TLS 证书文件路径。",
    "config.help.gateway.tls.keyPath": "TLS 私钥文件路径。",
    "config.help.gateway.tls.caPath": "TLS CA 证书文件路径。",
    "config.help.gateway.trustedProxies": "受信任的代理服务器列表（用于 X-Forwarded-* 头处理）。",
    "config.help.diagnostics.enabled": "启用诊断日志。",
    "config.help.diagnostics.otel.enabled": "启用 OpenTelemetry 遥测。",
    "config.help.diagnostics.otel.endpoint": "OpenTelemetry 收集器端点 URL。",
    "config.help.diagnostics.otel.protocol": 'OpenTelemetry 协议（"http/protobuf" 或 "grpc"）。',
    "config.help.diagnostics.otel.serviceName": "OpenTelemetry 服务名称。",
    "config.help.diagnostics.otel.headers": "OpenTelemetry 请求头（自定义键值对）。",
    "config.help.diagnostics.otel.flushIntervalMs": "OpenTelemetry 数据刷新间隔（毫秒）。",
    "config.help.diagnostics.otel.traceSampleRate": "OpenTelemetry 跟踪采样率（0-1）。",
    "config.help.diagnostics.otel.traces.enabled": "启用 OpenTelemetry 跟踪。",
    "config.help.diagnostics.otel.metrics.enabled": "启用 OpenTelemetry 指标。",
    "config.help.diagnostics.otel.logs.enabled": "启用 OpenTelemetry 日志。",
    "config.help.setup.lastRun": "设置向导最后运行时间。",
    "config.help.setup.lastCommand": "设置向导最后运行的命令。",
    "config.help.setup.lastCommit": "设置向导最后运行时的提交哈希。",
    "config.help.setup.lastMode": "设置向导最后运行的模式。",
    "config.help.setup.lastVersion": "设置向导最后运行的版本。",
    "config.help.agents.defaults.blockStream.breakOn":
      '块流式中断条件（"text_end" 文本结束时，"message_end" 消息结束时）。',
    "config.help.agents.defaults.blockStream.chunk.breakPreference":
      '块流式分块的优先断点（"paragraph" 段落，"newline" 换行，"sentence" 句子）。',
    "config.help.agents.defaults.blockStream.chunk.maxChars": "块流式分块的最大字符数。",
    "config.help.agents.defaults.blockStream.chunk.minChars": "块流式分块的最小字符数。",
    "config.help.agents.defaults.blockStream.merge.idleMs": "块流式合并的空闲等待时间（毫秒）。",
    "config.help.agents.defaults.blockStream.merge.maxChars": "块流式合并的最大字符数。",
    "config.help.agents.defaults.blockStream.merge.minChars": "块流式合并的最小字符数。",
    "config.help.agents.defaults.blockStreamDefault":
      '默认是否启用块流式传输（"off" 关闭，"on" 启用）。',
    "config.help.agents.defaults.compaction.maxHistoryShare": "压缩时历史记录的最大共享比例。",
    "config.help.agents.defaults.compaction.memoryFlush.enabled": "启用内存刷新压缩。",
    "config.help.agents.defaults.compaction.prompt.softThresholdTokens":
      "提示词软阈值（token 数量）。",
    "config.help.agents.defaults.compaction.system.mode":
      '系统提示词模式（"default" 默认，"safeguard" 安全保护）。',
    "config.help.agents.defaults.compaction.system.reserveTokensFloor":
      "系统提示词保留的最小 token 数量。",
    "config.help.agents.defaults.context.hardClear.enabled": "启用上下文硬清除。",
    "config.help.agents.defaults.context.hardClear.ratio": "硬清除的比例。",
    "config.help.agents.defaults.context.hardClear.placeholder": "硬清除的占位符文本。",
    "config.help.agents.defaults.context.mode":
      '上下文修剪模式（"off" 关闭，"cache-ttl" 缓存 TTL）。',
    "config.help.agents.defaults.context.softTrim.headChars": "软修剪保留的头部字符数。",
    "config.help.agents.defaults.context.softTrim.maxChars": "软修剪的最大字符数。",
    "config.help.agents.defaults.context.softTrim.tailChars": "软修剪保留的尾部字符数。",
    "config.help.agents.defaults.context.softTrim.ratio": "软修剪的比例。",
    "config.help.agents.defaults.context.keepLastAssistants": "保留的最后 N 条助手消息数量。",
    "config.help.agents.defaults.context.minPrunableToolChars": "可修剪的工具消息的最小字符数。",
    "config.help.agents.defaults.context.ttl.contextTokens": "上下文 TTL 的 token 数量。",
    "config.help.agents.defaults.elevatedDefault":
      '默认的提权模式（"off" 关闭，"on" 启用，"ask" 询问，"full" 完全）。',
    "config.help.agents.defaults.heartbeat.ackMaxChars": "心跳确认的最大字符数。",
    "config.help.agents.defaults.heartbeat.active.hours.start": "心跳活动时段开始时间。",
    "config.help.agents.defaults.heartbeat.active.hours.end": "心跳活动时段结束时间。",
    "config.help.agents.defaults.heartbeat.active.timezone": "心跳活动时段时区。",
    "config.help.agents.defaults.heartbeat.every": "心跳间隔（支持 cron 表达式）。",
    "config.help.agents.defaults.heartbeat.includeReasoning": "心跳消息中包含推理过程。",
    "config.help.agents.defaults.heartbeat.model": "心跳使用的模型。",
    "config.help.agents.defaults.heartbeat.prompt": "心跳提示词。",
    "config.help.agents.defaults.heartbeat.session": "心跳会话。",
    "config.help.agents.defaults.heartbeat.target":
      '心跳目标（"last" 最后一个，"none" 无，或通道 ID）。',
    "config.help.agents.defaults.heartbeat.to": "心跳发送到的目标。",
    "config.help.agents.defaults.maxConcurrent": "最大并发任务数。",
    "config.help.agents.defaults.mediaMaxMb": "媒体文件的最大大小（MB）。",
    "config.help.agents.defaults.memorySearch.chunk.overlapTokens":
      "内存搜索分块的重叠 token 数量。",
    "config.help.agents.defaults.memorySearch.chunk.tokens": "内存搜索分块的 token 数量。",
    "config.help.agents.defaults.memorySearch.enabled": "启用内存搜索。",
    "config.help.agents.defaults.memorySearch.local.modelCacheDir": "本地嵌入模型缓存目录。",
    "config.help.agents.defaults.memorySearch.maxResults": "内存搜索返回的最大结果数。",
    "config.help.agents.defaults.memorySearch.minScore": "内存搜索的最小相关度分数。",
    "config.help.agents.defaults.memorySearch.model": "内存搜索使用的嵌入模型。",
    "config.help.agents.defaults.memorySearch.store.driver": "内存搜索存储驱动（默认：sqlite）。",
    "config.help.agents.defaults.memorySearch.sync.intervalMinutes": "内存搜索同步间隔（分钟）。",
    "config.help.agents.defaults.memorySearch.sync.indexOnSessionStart": "会话开始时索引内存。",
    "config.help.agents.defaults.memorySearch.sync.watch.debounceMs":
      "内存文件监视的防抖时间（毫秒）。",
    "config.help.agents.defaults.sandbox.browser.allowHostControl": "允许沙箱浏览器控制主机。",
    "config.help.agents.defaults.sandbox.browser.autoStart": "自动启动沙箱浏览器。",
    "config.help.agents.defaults.sandbox.browser.autoStartTimeoutMs":
      "沙箱浏览器自动启动超时时间（毫秒）。",
    "config.help.agents.defaults.sandbox.browser.cdpPort": "沙箱浏览器 CDP 端口。",
    "config.help.agents.defaults.sandbox.browser.containerPrefix": "沙箱浏览器容器名称前缀。",
    "config.help.agents.defaults.sandbox.browser.enabled": "启用沙箱浏览器。",
    "config.help.agents.defaults.sandbox.browser.enableNoVnc": "启用 noVNC Web 界面。",
    "config.help.agents.defaults.sandbox.browser.headless": "无头模式运行沙箱浏览器。",
    "config.help.agents.defaults.sandbox.browser.image": "沙箱浏览器 Docker 镜像。",
    "config.help.agents.defaults.sandbox.browser.noVncPort": "noVNC 服务端口。",
    "config.help.agents.defaults.sandbox.browser.vncPort": "VNC 服务端口。",
    "config.help.agents.defaults.sandbox.docker.apparmor": "Docker 容器的 AppArmor 配置文件。",
    "config.help.agents.defaults.sandbox.docker.binds": "Docker 容器的卷绑定列表。",
    "config.help.agents.defaults.sandbox.docker.capDrop": "Docker 容器要移除的能力列表。",
    "config.help.agents.defaults.sandbox.docker.containerPrefix": "Docker 容器名称前缀。",
    "config.help.agents.defaults.sandbox.docker.cpus": "Docker 容器的 CPU 限制。",
    "config.help.agents.defaults.sandbox.docker.dns": "Docker 容器的 DNS 服务器列表。",
    "config.help.agents.defaults.sandbox.docker.env": "Docker 容器的环境变量。",
    "config.help.agents.defaults.sandbox.docker.extraHosts": "Docker 容器的额外主机映射。",
    "config.help.agents.defaults.sandbox.docker.image": "Docker 容器镜像。",
    "config.help.agents.defaults.sandbox.docker.memory": "Docker 容器的内存限制。",
    "config.help.agents.defaults.sandbox.docker.memorySwap": "Docker 容器的内存交换限制。",
    "config.help.agents.defaults.sandbox.docker.network": "Docker 容器的网络模式。",
    "config.help.agents.defaults.sandbox.docker.pidsLimit": "Docker 容器的进程数限制。",
    "config.help.agents.defaults.sandbox.docker.readOnlyRoot": "Docker 容器的根文件系统为只读。",
    "config.help.agents.defaults.sandbox.docker.seccomp": "Docker 容器的 seccomp 配置文件。",
    "config.help.agents.defaults.sandbox.docker.setupCommand": "Docker 容器启动时执行的设置命令。",
    "config.help.agents.defaults.sandbox.docker.tmpfs": "Docker 容器的 tmpfs 挂载列表。",
    "config.help.agents.defaults.sandbox.docker.user": "Docker 容器内运行的用户。",
    "config.help.agents.defaults.sandbox.docker.workdir": "Docker 容器的工作目录。",
    "config.help.agents.defaults.sandbox.mode":
      '沙箱模式（"off" 关闭，"non-main" 仅非主代理，"all" 所有代理）。',
    "config.help.agents.defaults.sandbox.perSession": "为每个会话创建独立沙箱。",
    "config.help.agents.defaults.sandbox.prune.idleHours": "沙箱空闲多少小时后清理。",
    "config.help.agents.defaults.sandbox.prune.maxAgeDays": "沙箱最大存活天数。",
    "config.help.agents.defaults.sandbox.scope":
      '沙箱作用域（"session" 会话级，"agent" 代理级，"shared" 共享）。',
    "config.help.agents.defaults.sandbox.sessionToolsVisibility":
      '会话工具可见性（"spawned" 仅衍生会话，"all" 所有会话）。',
    "config.help.agents.defaults.sandbox.workspaceAccess":
      '沙箱对工作区的访问权限（"none" 无，"ro" 只读，"rw" 读写）。',
    "config.help.agents.defaults.sandbox.workspaceRoot": "沙箱工作区根目录。",
    "config.help.agents.defaults.skipBootstrap": "跳过工作区引导文件的注入。",
    "config.help.agents.defaults.subagents.archiveAfterMinutes": "子代理在多少分钟后归档。",
    "config.help.agents.defaults.subagents.maxConcurrent": "最大并发子代理数量。",
    "config.help.agents.defaults.subagents.model": "子代理使用的模型。",
    "config.help.agents.defaults.thinkingDefault": "默认的思考模式。",
    "config.help.agents.defaults.timeFormat":
      '时间格式（"auto" 自动，"12" 12小时制，"24" 24小时制）。',
    "config.help.agents.defaults.timeoutSeconds": "操作超时时间（秒）。",
    "config.help.agents.defaults.typingIntervalSeconds": "打字指示器更新间隔（秒）。",
    "config.help.agents.defaults.typingMode":
      '打字指示器模式（"never" 从不，"instant" 立即，"thinking" 思考时，"message" 消息时）。',
    "config.help.agents.defaults.userTimezone": "用户时区。",
    "config.help.agents.defaults.verboseDefault":
      '默认的详细输出级别（"off" 关闭，"on" 启用，"full" 完全）。',
    "config.help.agents.defaults.workspace": "代理工作区路径。",
    "config.help.agents.defaults.tools.allow": "允许的工具列表（白名单）。",
    "config.help.agents.defaults.tools.deny": "拒绝的工具列表（黑名单）。",
    "config.help.tools.exec.applyPatch.enabled":
      "实验性功能。为 OpenAI 模型启用 apply_patch 工具（当工具策略允许时）。",
    "config.help.tools.exec.applyPatch.allowModels":
      '可选的模型 ID 白名单（例如 "gpt-5.2" 或 "openai/gpt-5.2"）。',
    "config.help.tools.exec.notifyOnExit":
      "当为 true（默认）时，后台执行会话在退出时将系统事件排队并请求心跳。",
    "config.help.tools.exec.pathPrepend": "在 exec 运行时预置到 PATH 的目录（网关/沙箱）。",
    "config.help.tools.exec.safeBins":
      "允许仅使用 stdin 的安全二进制文件运行，无需显式白名单条目。",
    "config.help.tools.message.allowCrossContextSend": "传统覆盖：允许跨所有提供商的跨上下文发送。",
    "config.help.tools.message.crossContext.allowWithinProvider":
      "允许在同一提供商内向其他通道发送（默认：true）。",
    "config.help.tools.message.crossContext.allowAcrossProviders":
      "允许跨不同提供商发送（默认：false）。",
    "config.help.tools.message.crossContext.marker.enabled":
      "发送跨上下文消息时添加可见的来源标记（默认：true）。",
    "config.help.tools.message.crossContext.marker.prefix":
      '跨上下文标记的文本前缀（支持 "{channel}"）。',
    "config.help.tools.message.crossContext.marker.suffix":
      '跨上下文标记的文本后缀（支持 "{channel}"）。',
    "config.help.tools.message.broadcast.enabled": "启用广播操作（默认：true）。",
    "config.help.tools.web.search.enabled": "启用 web_search 工具（需要提供商 API 密钥）。",
    "config.help.tools.web.search.provider": '搜索提供商（"brave" 或 "perplexity"）。',
    "config.help.tools.web.search.apiKey":
      "Brave Search API 密钥（回退：BRAVE_API_KEY 环境变量）。",
    "config.help.tools.web.search.maxResults": "返回的默认结果数量（1-10）。",
    "config.help.tools.web.search.timeoutSeconds": "web_search 请求的超时时间（秒）。",
    "config.help.tools.web.search.cacheTtlMinutes": "web_search 结果的缓存 TTL（分钟）。",
    "config.help.tools.web.search.perplexity.apiKey":
      "Perplexity 或 OpenRouter API 密钥（回退：PERPLEXITY_API_KEY 或 OPENROUTER_API_KEY 环境变量）。",
    "config.help.tools.web.search.perplexity.baseUrl":
      "Perplexity 基础 URL 覆盖（默认：https://openrouter.ai/api/v1 或 https://api.perplexity.ai）。",
    "config.help.tools.web.search.perplexity.model":
      'Perplexity 模型覆盖（默认："perplexity/sonar-pro"）。',
    "config.help.tools.web.fetch.enabled": "启用 web_fetch 工具（轻量级 HTTP 获取）。",
    "config.help.tools.web.fetch.maxChars": "web_fetch 返回的最大字符数（截断）。",
    "config.help.tools.web.fetch.timeoutSeconds": "web_fetch 请求的超时时间（秒）。",
    "config.help.tools.web.fetch.cacheTtlMinutes": "web_fetch 结果的缓存 TTL（分钟）。",
    "config.help.tools.web.fetch.maxRedirects": "web_fetch 允许的最大重定向次数（默认：3）。",
    "config.help.tools.web.fetch.userAgent": "覆盖 web_fetch 请求的 User-Agent 头。",
    "config.help.tools.web.fetch.readability":
      "使用 Readability 从 HTML 中提取主要内容（回退到基本 HTML 清理）。",
    "config.help.tools.web.fetch.firecrawl.enabled":
      "为 web_fetch 启用 Firecrawl 回退（如果已配置）。",
    "config.help.tools.web.fetch.firecrawl.apiKey":
      "Firecrawl API 密钥（回退：FIRECRAWL_API_KEY 环境变量）。",
    "config.help.tools.web.fetch.firecrawl.baseUrl":
      "Firecrawl 基础 URL（例如 https://api.firecrawl.dev 或自定义端点）。",
    "config.help.tools.web.fetch.firecrawl.onlyMainContent":
      "当为 true 时，Firecrawl 仅返回主要内容（默认：true）。",
    "config.help.tools.web.fetch.firecrawl.maxAgeMs":
      "Firecrawl 缓存结果的 maxAge（毫秒）（当 API 支持时）。",
    "config.help.tools.web.fetch.firecrawl.timeoutSeconds": "Firecrawl 请求的超时时间（秒）。",
    "config.help.channels.slack.allowBots": "允许机器人创作的消息触发 Slack 回复（默认：false）。",
    "config.help.channels.slack.thread.historyScope":
      'Slack 线程历史上下文的作用域（"thread" 每个线程隔离；"channel" 重用频道历史）。',
    "config.help.channels.slack.thread.inheritParent":
      "如果为 true，Slack 线程会话继承父频道记录（默认：false）。",
    "config.help.channels.mattermost.botToken":
      "来自 Mattermost 系统控制台 -> 集成 -> 机器人帐户的机器人令牌。",
    "config.help.channels.mattermost.baseUrl":
      "Mattermost 服务器的基础 URL（例如 https://chat.example.com）。",
    "config.help.channels.mattermost.chatmode":
      '回复频道消息的模式：提及时（"oncall"），触发字符时（">" 或 "!"）（"onchar"），或每条消息（"onmessage"）。',
    "config.help.channels.mattermost.oncharPrefixes": 'onchar 模式的触发前缀（默认：[">", "!"]）。',
    "config.help.channels.mattermost.requireMention": "在频道中响应前需要 @提及（默认：true）。",
    "config.help.auth.profiles": "命名的认证配置文件（提供商 + 模式 + 可选电子邮件）。",
    "config.help.auth.order": "每个提供商的有序认证配置文件 ID（用于自动故障转移）。",
    "config.help.agents.list.skills": "此代理的可选技能白名单（省略 = 所有技能；空 = 无技能）。",
    "config.help.agents.list.identity.avatar":
      "头像图片路径（相对于代理工作区）或远程 URL/data URL。",
    "config.help.session.dmScope":
      '私聊会话作用域："main" 保持连续性；"per-peer"、"per-channel-peer" 或 "per-account-channel-peer" 隔离私聊历史（推荐用于共享收件箱/多账户）。',
    "config.help.session.identityLinks":
      "将规范身份映射到提供商前缀的对等 ID 用于私聊会话链接（例如：telegram:123456）。",
    "config.help.channels.telegram.configWrites":
      "允许 Telegram 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.slack.configWrites":
      "允许 Slack 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.mattermost.configWrites":
      "允许 Mattermost 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.discord.configWrites":
      "允许 Discord 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.whatsapp.configWrites":
      "允许 WhatsApp 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.signal.configWrites":
      "允许 Signal 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.imessage.configWrites":
      "允许 iMessage 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.msteams.configWrites":
      "允许 Microsoft Teams 响应频道事件/命令写入配置（默认：true）。",
    "config.help.channels.discord.commands.native":
      '覆盖 Discord 的原生命令配置（布尔值或 "auto"）。',
    "config.help.channels.discord.commands.nativeSkills":
      '覆盖 Discord 的原生技能命令配置（布尔值或 "auto"）。',
    "config.help.channels.telegram.commands.native":
      '覆盖 Telegram 的原生命令配置（布尔值或 "auto"）。',
    "config.help.channels.telegram.commands.nativeSkills":
      '覆盖 Telegram 的原生技能命令配置（布尔值或 "auto"）。',
    "config.help.channels.slack.commands.native": '覆盖 Slack 的原生命令配置（布尔值或 "auto"）。',
    "config.help.channels.slack.commands.nativeSkills":
      '覆盖 Slack 的原生技能命令配置（布尔值或 "auto"）。',
    "config.help.channels.telegram.customCommands":
      "额外的 Telegram 机器人菜单命令（与原生命令合并；冲突时忽略）。",
    "config.help.channels.telegram.dmPolicy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.telegram.allowFrom=["*"]。',
    "config.help.channels.telegram.streamMode":
      "Telegram 回复的草稿流式模式（off | partial | block）。独立于块流式；需要私密话题 + sendMessageDraft。",
    "config.help.channels.telegram.draftChunk.minChars":
      '当 channels.telegram.streamMode="block" 时发送 Telegram 草稿更新前的最小字符数（默认：200）。',
    "config.help.channels.telegram.draftChunk.maxChars":
      '当 channels.telegram.streamMode="block" 时 Telegram 草稿更新块的目标最大大小（默认：800；限制为 channels.telegram.textChunkLimit）。',
    "config.help.channels.telegram.draftChunk.breakPreference":
      "Telegram 草稿块的优先断点（paragraph | newline | sentence）。默认：paragraph。",
    "config.help.channels.telegram.retry.attempts":
      "出站 Telegram API 调用的最大重试次数（默认：3）。",
    "config.help.channels.telegram.retry.minDelayMs": "Telegram 出站调用的最小重试延迟（毫秒）。",
    "config.help.channels.telegram.retry.maxDelayMs":
      "Telegram 出站调用的最大重试延迟上限（毫秒）。",
    "config.help.channels.telegram.retry.jitter": "应用于 Telegram 重试延迟的抖动因子（0-1）。",
    "config.help.channels.telegram.network.autoSelectFamily":
      "覆盖 Telegram 的 Node autoSelectFamily（true=启用，false=禁用）。",
    "config.help.channels.telegram.timeoutSeconds":
      "Telegram API 请求被中止前的最大秒数（默认：500，根据 grammY）。",
    "config.help.channels.whatsapp.dmPolicy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.whatsapp.allowFrom=["*"]。',
    "config.help.channels.whatsapp.selfChatMode": "同机设置（机器人使用您的个人 WhatsApp 号码）。",
    "config.help.channels.whatsapp.debounceMs":
      "用于批量处理来自同一发送者的快速连续消息的防抖窗口（毫秒）（0 禁用）。",
    "config.help.channels.signal.dmPolicy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.signal.allowFrom=["*"]。',
    "config.help.channels.imessage.dmPolicy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.imessage.allowFrom=["*"]。',
    "config.help.channels.bluebubbles.dmPolicy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.bluebubbles.allowFrom=["*"]。',
    "config.help.channels.discord.dm.policy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.discord.dm.allowFrom=["*"]。',
    "config.help.channels.discord.retry.attempts":
      "出站 Discord API 调用的最大重试次数（默认：3）。",
    "config.help.channels.discord.retry.minDelayMs": "Discord 出站调用的最小重试延迟（毫秒）。",
    "config.help.channels.discord.retry.maxDelayMs": "Discord 出站调用的最大重试延迟上限（毫秒）。",
    "config.help.channels.discord.retry.jitter": "应用于 Discord 重试延迟的抖动因子（0-1）。",
    "config.help.channels.discord.maxLinesPerMessage":
      "每条 Discord 消息的软最大行数（默认：17）。",
    "config.help.channels.discord.intents.presence":
      "启用公会存在特权意图。也必须在 Discord 开发者门户中启用。允许跟踪用户活动（例如 Spotify）。默认：false。",
    "config.help.channels.discord.intents.guildMembers":
      "启用公会成员特权意图。也必须在 Discord 开发者门户中启用。默认：false。",
    "config.help.channels.discord.pluralkit.enabled":
      "解析 PluralKit 代理消息并将系统成员视为不同的发送者。",
    "config.help.channels.discord.pluralkit.token":
      "可选的 PluralKit 令牌，用于解析私有系统或成员。",
    "config.help.channels.slack.dm.policy":
      '私聊访问控制（推荐 "pairing"）。"open" 需要设置 channels.slack.dm.allowFrom=["*"]。',
    "config.group.wizard": "设置向导",
    "config.group.update": "更新",
    "config.group.diagnostics": "诊断",
    "config.group.logging": "日志",
    "config.group.gateway": "网关",
    "config.group.nodeHost": "节点主机",
    "config.group.agents": "代理",
    "config.group.tools": "工具",
    "config.group.bindings": "绑定",
    "config.group.audio": "音频",
    "config.group.models": "模型",
    "config.group.messages": "消息",
    "config.group.commands": "命令",
    "config.group.session": "会话",
    "config.group.cron": "定时任务",
    "config.group.hooks": "钩子",
    "config.group.ui": "界面",
    "config.group.browser": "浏览器",
    "config.group.talk": "语音对话",
    "config.group.channels": "消息通道",
    "config.group.skills": "技能",
    "config.group.plugins": "插件",
    "config.group.discovery": "服务发现",
    "config.group.presence": "在线状态",
    "config.group.voicewake": "语音唤醒",
    "config.label.meta.lastTouchedVersion": "配置最后修改版本",
    "config.label.meta.lastTouchedAt": "配置最后修改时间",
    "config.label.update.channel": "更新通道",
    "config.label.update.checkOnStart": "启动时检查更新",
    "config.label.diagnostics.enabled": "启用诊断",
    "config.label.diagnostics.flags": "诊断标志",
    "config.label.diagnostics.otel.enabled": "启用 OpenTelemetry",
    "config.label.diagnostics.otel.endpoint": "OpenTelemetry 端点",
    "config.label.diagnostics.otel.protocol": "OpenTelemetry 协议",
    "config.label.diagnostics.otel.headers": "OpenTelemetry 请求头",
    "config.label.diagnostics.otel.serviceName": "OpenTelemetry 服务名称",
    "config.label.diagnostics.otel.traces": "启用 OpenTelemetry 追踪",
    "config.label.diagnostics.otel.metrics": "启用 OpenTelemetry 指标",
    "config.label.diagnostics.otel.logs": "启用 OpenTelemetry 日志",
    "config.label.diagnostics.otel.sampleRate": "OpenTelemetry 追踪采样率",
    "config.label.diagnostics.otel.flushIntervalMs": "OpenTelemetry 刷新间隔（毫秒）",
    "config.label.diagnostics.cacheTrace.enabled": "启用缓存追踪",
    "config.label.diagnostics.cacheTrace.filePath": "缓存追踪文件路径",
    "config.label.diagnostics.cacheTrace.includeMessages": "缓存追踪包含消息",
    "config.label.diagnostics.cacheTrace.includePrompt": "缓存追踪包含提示词",
    "config.label.diagnostics.cacheTrace.includeSystem": "缓存追踪包含系统提示",
    "config.label.gateway.auth.token": "网关令牌",
    "config.label.gateway.auth.password": "网关密码",
    "config.label.gateway.controlUi.basePath": "控制界面基础路径",
    "config.label.gateway.controlUi.allowInsecureAuth": "允许不安全的控制界面认证",
    "config.label.gateway.controlUi.dangerouslyDisableDeviceAuth": "危险：禁用控制界面设备认证",
    "config.label.gateway.http.endpoints.chatCompletions.enabled": "OpenAI 聊天补全端点",
    "config.label.gateway.reload.mode": "配置重载模式",
    "config.label.gateway.reload.debounceMs": "配置重载防抖（毫秒）",
    "config.label.gateway.nodes.browser.mode": "网关节点浏览器模式",
    "config.label.gateway.nodes.browser.node": "网关节点浏览器固定",
    "config.label.gateway.nodes.allowCommands": "网关节点允许命令（额外）",
    "config.label.gateway.nodes.denyCommands": "网关节点拒绝命令",
    "config.label.gateway.remote.url": "远程网关 URL",
    "config.label.gateway.remote.sshTarget": "远程网关 SSH 目标",
    "config.label.gateway.remote.sshIdentity": "远程网关 SSH 身份文件",
    "config.label.gateway.remote.token": "远程网关令牌",
    "config.label.gateway.remote.password": "远程网关密码",
    "config.label.gateway.remote.tlsFingerprint": "远程网关 TLS 指纹",
    "config.label.nodeHost.browserProxy.enabled": "节点浏览器代理启用",
    "config.label.nodeHost.browserProxy.allowProfiles": "节点浏览器代理允许配置文件",
    "config.label.agents.defaults.workspace": "工作区",
    "config.label.agents.defaults.repoRoot": "仓库根目录",
    "config.label.agents.defaults.bootstrapMaxChars": "引导最大字符数",
    "config.label.agents.defaults.envelopeTimezone": "信封时区",
    "config.label.agents.defaults.envelopeTimestamp": "信封时间戳",
    "config.label.agents.defaults.envelopeElapsed": "信封已用时间",
    "config.label.auth.profiles": "认证配置文件",
    "config.label.auth.order": "认证配置文件顺序",
    "config.label.auth.cooldowns.billingBackoffHours": "计费退避（小时）",
    "config.label.auth.cooldowns.billingBackoffHoursByProvider": "按提供商计费退避覆盖",
    "config.label.auth.cooldowns.billingMaxHours": "计费退避上限（小时）",
    "config.label.auth.cooldowns.failureWindowHours": "故障转移窗口（小时）",
    "config.label.agents.defaults.models": "模型",
    "config.label.agents.defaults.model.primary": "主要模型",
    "config.label.agents.defaults.model.fallbacks": "备用模型",
    "config.label.agents.defaults.imageModel.primary": "图像模型",
    "config.label.agents.defaults.imageModel.fallbacks": "图像备用模型",
    "config.label.agents.defaults.humanDelay.mode": "人类延迟模式",
    "config.label.agents.defaults.humanDelay.minMs": "人类延迟最小值（毫秒）",
    "config.label.agents.defaults.humanDelay.maxMs": "人类延迟最大值（毫秒）",
    "config.label.agents.defaults.cliBackends": "CLI 后端",
    "config.label.agents.defaults.memorySearch": "记忆搜索",
    "config.label.agents.defaults.memorySearch.enabled": "启用记忆搜索",
    "config.label.agents.defaults.memorySearch.sources": "记忆搜索源",
    "config.label.agents.defaults.memorySearch.extraPaths": "额外记忆路径",
    "config.label.agents.defaults.memorySearch.experimental.sessionMemory":
      "记忆搜索会话索引（实验性）",
    "config.label.agents.defaults.memorySearch.provider": "记忆搜索提供商",
    "config.label.agents.defaults.memorySearch.remote.baseUrl": "远程嵌入基础 URL",
    "config.label.agents.defaults.memorySearch.remote.apiKey": "远程嵌入 API 密钥",
    "config.label.agents.defaults.memorySearch.remote.headers": "远程嵌入请求头",
    "config.label.agents.defaults.memorySearch.remote.batch.concurrency": "远程批处理并发数",
    "config.label.agents.defaults.memorySearch.model": "记忆搜索模型",
    "config.label.agents.defaults.memorySearch.fallback": "记忆搜索备用",
    "config.label.agents.defaults.memorySearch.local.modelPath": "本地嵌入模型路径",
    "config.label.agents.defaults.memorySearch.store.path": "记忆搜索索引路径",
    "config.label.agents.defaults.memorySearch.store.vector.enabled": "记忆搜索向量索引",
    "config.label.agents.defaults.memorySearch.store.vector.extensionPath": "记忆搜索向量扩展路径",
    "config.label.agents.defaults.memorySearch.chunking.tokens": "记忆分块令牌数",
    "config.label.agents.defaults.memorySearch.chunking.overlap": "记忆分块重叠令牌数",
    "config.label.agents.defaults.memorySearch.sync.onSessionStart": "会话启动时索引",
    "config.label.agents.defaults.memorySearch.sync.onSearch": "搜索时索引（延迟）",
    "config.label.agents.defaults.memorySearch.sync.watch": "监视记忆文件",
    "config.label.agents.defaults.memorySearch.sync.watchDebounceMs": "记忆监视防抖（毫秒）",
    "config.label.agents.defaults.memorySearch.sync.sessions.deltaBytes": "会话增量字节数",
    "config.label.agents.defaults.memorySearch.sync.sessions.deltaMessages": "会话增量消息数",
    "config.label.agents.defaults.memorySearch.query.maxResults": "记忆搜索最大结果数",
    "config.label.agents.defaults.memorySearch.query.minScore": "记忆搜索最小分数",
    "config.label.agents.defaults.memorySearch.query.hybrid.enabled": "记忆搜索混合模式",
    "config.label.agents.defaults.memorySearch.query.hybrid.vectorWeight": "记忆搜索向量权重",
    "config.label.agents.defaults.memorySearch.query.hybrid.textWeight": "记忆搜索文本权重",
    "config.label.agents.defaults.memorySearch.query.hybrid.candidateMultiplier":
      "记忆搜索混合候选倍数",
    "config.label.agents.defaults.memorySearch.cache.enabled": "记忆搜索嵌入缓存",
    "config.label.agents.defaults.memorySearch.cache.maxEntries": "记忆搜索嵌入缓存最大条目数",
    "config.label.commands.native": "原生命令",
    "config.label.commands.nativeSkills": "原生技能命令",
    "config.label.commands.text": "文本命令",
    "config.label.commands.bash": "允许 Bash 聊天命令",
    "config.label.commands.bashForegroundMs": "Bash 前台窗口（毫秒）",
    "config.label.commands.config": "允许 /config 命令",
    "config.label.commands.debug": "允许 /debug 命令",
    "config.label.commands.restart": "允许重启",
    "config.label.commands.useAccessGroups": "使用访问组",
    "config.label.ui.seamColor": "强调色",
    "config.label.ui.assistant.name": "助手名称",
    "config.label.ui.assistant.avatar": "助手头像",
    "config.label.browser.evaluateEnabled": "浏览器执行已启用",
    "config.label.browser.snapshotDefaults": "浏览器快照默认值",
    "config.label.browser.snapshotDefaults.mode": "浏览器快照模式",
    "config.label.browser.remoteCdpTimeoutMs": "远程 CDP 超时（毫秒）",
    "config.label.browser.remoteCdpHandshakeTimeoutMs": "远程 CDP 握手超时（毫秒）",
    "config.label.session.dmScope": "私聊会话作用域",
    "config.label.session.agentToAgent.maxPingPongTurns": "代理对代理乒乓回合",
    "config.label.messages.ackReaction": "确认反应表情",
    "config.label.messages.ackReactionScope": "确认反应作用域",
    "config.label.messages.inbound.debounceMs": "入站消息防抖（毫秒）",
    "config.label.talk.apiKey": "语音 API 密钥",
    "config.label.talk.voiceId": "语音 ID",
    "config.label.talk.voiceAliases": "语音别名",
    "config.label.talk.modelId": "模型 ID",
    "config.label.talk.outputFormat": "输出格式",
    "config.label.talk.interruptOnSpeech": "说话时中断",
    "config.label.channels.whatsapp": "WhatsApp",
    "config.label.channels.telegram": "Telegram",
    "config.label.channels.telegram.customCommands": "Telegram 自定义命令",
    "config.label.channels.discord": "Discord",
    "config.label.channels.slack": "Slack",
    "config.label.channels.mattermost": "Mattermost",
    "config.label.channels.signal": "Signal",
    "config.label.channels.imessage": "iMessage",
    "config.label.channels.bluebubbles": "BlueBubbles",
    "config.label.channels.msteams": "MS Teams",
    "config.label.channels.telegram.botToken": "Telegram 机器人令牌",
    "config.label.channels.telegram.dmPolicy": "Telegram 私聊策略",
    "config.label.channels.telegram.streamMode": "Telegram 草稿流模式",
    "config.label.channels.telegram.draftChunk.minChars": "Telegram 草稿块最小字符数",
    "config.label.channels.telegram.draftChunk.maxChars": "Telegram 草稿块最大字符数",
    "config.label.channels.telegram.draftChunk.breakPreference": "Telegram 草稿块断行偏好",
    "config.label.channels.telegram.retry.attempts": "Telegram 重试次数",
    "config.label.channels.telegram.retry.minDelayMs": "Telegram 重试最小延迟（毫秒）",
    "config.label.channels.telegram.retry.maxDelayMs": "Telegram 重试最大延迟（毫秒）",
    "config.label.channels.telegram.retry.jitter": "Telegram 重试抖动",
    "config.label.channels.telegram.network.autoSelectFamily": "Telegram 自动选择地址族",
    "config.label.channels.telegram.timeoutSeconds": "Telegram API 超时（秒）",
    "config.label.channels.telegram.capabilities.inlineButtons": "Telegram 内联按钮",
    "config.label.channels.whatsapp.dmPolicy": "WhatsApp 私聊策略",
    "config.label.channels.whatsapp.selfChatMode": "WhatsApp 同机模式",
    "config.label.channels.whatsapp.debounceMs": "WhatsApp 消息防抖（毫秒）",
    "config.label.channels.signal.dmPolicy": "Signal 私聊策略",
    "config.label.channels.imessage.dmPolicy": "iMessage 私聊策略",
    "config.label.channels.bluebubbles.dmPolicy": "BlueBubbles 私聊策略",
    "config.label.channels.discord.dm.policy": "Discord 私聊策略",
    "config.label.channels.discord.retry.attempts": "Discord 重试次数",
    "config.label.channels.discord.retry.minDelayMs": "Discord 重试最小延迟（毫秒）",
    "config.label.channels.discord.retry.maxDelayMs": "Discord 重试最大延迟（毫秒）",
    "config.label.channels.discord.retry.jitter": "Discord 重试抖动",
    "config.label.channels.discord.maxLinesPerMessage": "Discord 每条消息最大行数",
    "config.label.channels.discord.intents.presence": "Discord 在线意图",
    "config.label.channels.discord.intents.guildMembers": "Discord 公会成员意图",
    "config.label.channels.discord.pluralkit.enabled": "Discord PluralKit 已启用",
    "config.label.channels.discord.pluralkit.token": "Discord PluralKit 令牌",
    "config.label.channels.slack.dm.policy": "Slack 私聊策略",
    "config.label.channels.slack.allowBots": "Slack 允许机器人消息",
    "config.label.channels.discord.token": "Discord 机器人令牌",
    "config.label.channels.slack.botToken": "Slack 机器人令牌",
    "config.label.channels.slack.appToken": "Slack 应用令牌",
    "config.label.channels.slack.userToken": "Slack 用户令牌",
    "config.label.channels.slack.userTokenReadOnly": "Slack 用户令牌只读",
    "config.label.channels.slack.thread.historyScope": "Slack 线程历史作用域",
    "config.label.channels.slack.thread.inheritParent": "Slack 线程继承父级",
    "config.label.channels.mattermost.botToken": "Mattermost 机器人令牌",
    "config.label.channels.mattermost.baseUrl": "Mattermost 基础 URL",
    "config.label.channels.mattermost.chatmode": "Mattermost 聊天模式",
    "config.label.channels.mattermost.oncharPrefixes": "Mattermost 字符前缀",
    "config.label.channels.mattermost.requireMention": "Mattermost 需要提及",
    "config.label.channels.signal.account": "Signal 账户",
    "config.label.channels.imessage.cliPath": "iMessage CLI 路径",
    "config.label.agents.list.skills": "代理技能过滤器",
    "config.label.agents.list.identity.avatar": "代理头像",
    "config.label.discovery.mdns.mode": "mDNS 发现模式",
    "config.label.plugins.enabled": "启用插件",
    "config.label.plugins.allow": "插件允许列表",
    "config.label.plugins.deny": "插件拒绝列表",
    "config.label.plugins.load.paths": "插件加载路径",
    "config.label.plugins.slots": "插件插槽",
    "config.label.plugins.slots.memory": "记忆插件",
    "config.label.plugins.entries": "插件条目",
    "config.label.plugins.entries.enabled": "插件已启用",
    "config.label.plugins.entries.config": "插件配置",
    "config.label.plugins.installs": "插件安装记录",
    "config.label.plugins.installs.source": "插件安装源",
    "config.label.plugins.installs.spec": "插件安装规范",
    "config.label.plugins.installs.sourcePath": "插件安装源路径",
    "config.label.plugins.installs.installPath": "插件安装路径",
    "config.label.plugins.installs.version": "插件安装版本",
    "config.label.plugins.installs.installedAt": "插件安装时间",
    "config.label.tools.media.image.enabled": "启用图像理解",
    "config.label.tools.media.image.maxBytes": "图像理解最大字节数",
    "config.label.tools.media.image.maxChars": "图像理解最大字符数",
    "config.label.tools.media.image.prompt": "图像理解提示词",
    "config.label.tools.media.image.timeoutSeconds": "图像理解超时（秒）",
    "config.label.tools.media.image.attachments": "图像理解附件策略",
    "config.label.tools.media.image.models": "图像理解模型",
    "config.label.tools.media.image.scope": "图像理解作用域",
    "config.label.tools.media.models": "媒体理解共享模型",
    "config.label.tools.media.concurrency": "媒体理解并发数",
    "config.label.tools.media.audio.enabled": "启用音频理解",
    "config.label.tools.media.audio.maxBytes": "音频理解最大字节数",
    "config.label.tools.media.audio.maxChars": "音频理解最大字符数",
    "config.label.tools.media.audio.prompt": "音频理解提示词",
    "config.label.tools.media.audio.timeoutSeconds": "音频理解超时（秒）",
    "config.label.tools.media.audio.language": "音频理解语言",
    "config.label.tools.media.audio.attachments": "音频理解附件策略",
    "config.label.tools.media.audio.models": "音频理解模型",
    "config.label.tools.media.audio.scope": "音频理解作用域",
    "config.label.tools.media.video.enabled": "启用视频理解",
    "config.label.tools.media.video.maxBytes": "视频理解最大字节数",
    "config.label.tools.media.video.maxChars": "视频理解最大字符数",
    "config.label.tools.media.video.prompt": "视频理解提示词",
    "config.label.tools.media.video.timeoutSeconds": "视频理解超时（秒）",
    "config.label.tools.media.video.attachments": "视频理解附件策略",
    "config.label.tools.media.video.models": "视频理解模型",
    "config.label.tools.media.video.scope": "视频理解作用域",
    "config.label.tools.links.enabled": "启用链接理解",
    "config.label.tools.links.maxLinks": "链接理解最大链接数",
    "config.label.tools.links.timeoutSeconds": "链接理解超时（秒）",
    "config.label.tools.links.models": "链接理解模型",
    "config.label.tools.links.scope": "链接理解作用域",
    "config.label.tools.profile": "工具配置文件",
    "config.label.tools.alsoAllow": "工具允许列表添加",
    "config.label.agents.list.tools.profile": "代理工具配置文件",
    "config.label.agents.list.tools.alsoAllow": "代理工具允许列表添加",
    "config.label.tools.byProvider": "按提供商工具策略",
    "config.label.agents.list.tools.byProvider": "代理按提供商工具策略",
    "config.label.tools.exec.applyPatch.enabled": "启用 apply_patch",
    "config.label.tools.exec.applyPatch.allowModels": "apply_patch 模型允许列表",
    "config.label.tools.exec.notifyOnExit": "执行退出时通知",
    "config.label.tools.exec.approvalRunningNoticeMs": "执行审批运行通知（毫秒）",
    "config.label.tools.exec.host": "执行主机",
    "config.label.tools.exec.security": "执行安全",
    "config.label.tools.exec.ask": "执行询问",
    "config.label.tools.exec.node": "执行节点绑定",
    "config.label.tools.exec.pathPrepend": "执行 PATH 前置",
    "config.label.tools.exec.safeBins": "执行安全二进制文件",
    "config.label.tools.message.allowCrossContextSend": "允许跨上下文消息",
    "config.label.tools.message.crossContext.allowWithinProvider": "允许跨上下文（同一提供商）",
    "config.label.tools.message.crossContext.allowAcrossProviders": "允许跨上下文（跨提供商）",
    "config.label.tools.message.crossContext.marker.enabled": "跨上下文标记",
    "config.label.tools.message.crossContext.marker.prefix": "跨上下文标记前缀",
    "config.label.tools.message.crossContext.marker.suffix": "跨上下文标记后缀",
    "config.label.tools.message.broadcast.enabled": "启用消息广播",
    "config.label.tools.web.search.enabled": "启用网络搜索工具",
    "config.label.tools.web.search.provider": "网络搜索提供商",
    "config.label.tools.web.search.apiKey": "Brave 搜索 API 密钥",
    "config.label.tools.web.search.maxResults": "网络搜索最大结果数",
    "config.label.tools.web.search.timeoutSeconds": "网络搜索超时（秒）",
    "config.label.tools.web.search.cacheTtlMinutes": "网络搜索缓存 TTL（分钟）",
    "config.label.tools.web.fetch.enabled": "启用网络获取工具",
    "config.label.tools.web.fetch.maxChars": "网络获取最大字符数",
    "config.label.tools.web.fetch.timeoutSeconds": "网络获取超时（秒）",
    "config.label.tools.web.fetch.cacheTtlMinutes": "网络获取缓存 TTL（分钟）",
    "config.label.tools.web.fetch.maxRedirects": "网络获取最大重定向数",
    "config.label.tools.web.fetch.userAgent": "网络获取 User-Agent",
    "config.label.skills.load.watch": "监视技能",
    "config.label.skills.load.watchDebounceMs": "技能监视防抖（毫秒）",
    "config.label.logging.level": "日志级别",
    "config.label.logging.file": "日志文件",
    "config.label.logging.consoleLevel": "控制台级别",
    "config.label.logging.consoleStyle": "控制台样式",
    "config.label.logging.redactSensitive": "敏感信息编辑",
    "config.label.logging.redactPatterns": "编辑模式",
    "config.label.discovery.wideArea.enabled": "启用广域发现",
    "config.label.discovery.wideArea.domain": "广域发现域名",

    // Agent Activity Monitor
    "monitor.agent.starting": "[后台] 正在启动 Agent 健康监控...",
    "monitor.agent.started": "[后台] Agent 健康监控已启动（每 {interval} 分钟巡检一次）",
    "monitor.agent.stopped": "[后台] Agent 健康监控已停止",
    "monitor.agent.no_agents": "[后台] 暂无配置的 Agent，跳过健康巡检",
    "monitor.agent.scanning": "[后台] 正在对 {count} 个 Agent 进行健康巡检...",
    "monitor.agent.scan_complete":
      "[后台] 健康巡检完成 — 正常: {healthy}，警告: {warning}，严重: {critical}，失联: {dead}",
    "monitor.agent.warning": "[后台] ⚠️ Agent [{agentId}] 疑似停滞（已 {minutes} 分钟无活动）",
    "monitor.agent.critical": "[后台] 🔴 Agent [{agentId}] 长时间无响应（已 {hours} 小时无活动）",
    "monitor.agent.dead": "[后台] 💀 Agent [{agentId}] 疑似失联（已 {hours} 小时无活动）",
    "monitor.agent.alert_sent": "[后台] 已向管理员发送 Agent [{agentId}] 的异常告警",
    "monitor.agent.alert_failed": "[后台] Agent [{agentId}] 告警发送失败",
    "monitor.agent.monitor_failed": "[后台] Agent 健康巡检出现异常",
    "monitor.agent.notifying_restart": "[后台] 系统重启完成，正在通知各 Agent 检查待处理任务...",
    "monitor.agent.restart_sent": "[后台] 已通知 Agent [{agentId}] 检查重启后的待处理任务",
    "monitor.agent.restart_failed": "[后台] 通知 Agent [{agentId}] 失败",
    "monitor.agent.restart_complete":
      "[后台] 重启通知完成（默认 Agent: {defaultCount} 个，团队 Agent: {teamCount} 个）",

    // Task Aging
    "task.aging.scheduler_starting": "[后台] 任务超时检测已启动（每 {interval} 分钟巡查一次）",
    "task.aging.scanning": "[后台] 正在扫描 {count} 个进行中的任务，检测是否有长期停滞...",
    "task.aging.scan_complete":
      "[后台] 任务扫描完成 — 提醒: {reminded} 条，升级: {escalated} 条，归档: {archived} 条",
    "task.aging.scan_failed": "[后台] 任务扫描出现异常",
    "task.aging.reminder_sent": "[后台] 已向负责人发送任务 [{taskId}] 的停滞提醒",
    "task.aging.reminder_failed": "[后台] 任务 [{taskId}] 停滞提醒发送失败",
    "task.aging.escalated": "[后台] 任务 [{taskId}] 长期未处理，已升级通知主管",
    "task.aging.escalate_failed": "[后台] 任务 [{taskId}] 升级通知失败",
    "task.aging.archived": "[后台] 任务 [{taskId}] 超时未处理，已自动降级为低优先级",
    "task.aging.archive_failed": "[后台] 任务 [{taskId}] 自动降级失败",
    "task.aging.blocked_reassign": "[后台] 任务 [{taskId}] 长期阻塞，建议重新分配执行者",
    "task.aging.scheduler_stopped": "[后台] 任务超时检测已停止",
    "task.aging.init_no_projects": "[后台] 暂无配置的项目，跳过任务超时检测",
    "task.aging.init_starting": "[后台] 正在为 {count} 个项目启动任务超时检测...",
    "task.aging.init_project_started": "[后台] 项目 [{projectId}] 的任务超时检测已就绪",
    "task.aging.init_done": "[后台] 所有项目的任务超时检测已启动",
    "task.aging.init_failed": "[后台] 任务超时检测初始化失败",

    // SmartRouting
    "routing.smart.selected":
      "[智能路由] 为 Agent [{agentName}]（会话: {sessionKey}）选择模型 {provider}/{model}（原因: {reason}）",
    "routing.smart.fallback":
      "[智能路由] 为 Agent [{agentName}]（会话: {sessionKey}）已回退到账号 {accountId}（原因: {reason}）",
    "routing.smart.account_not_found":
      "[智能路由] 路由选中的账号 {accountId} 在认证库中不存在，回退到默认策略",
    "routing.smart.route_failed": "[智能路由] 路由失败，已回退到默认策略",

    // Agent Activity Monitor (internal)
    "monitor.agent.task_check_failed": "[后台] 检查 Agent [{agentId}] 任务分配状态失败",
    "monitor.agent.fs_activity_failed": "[后台] 检测 Agent [{agentId}] 文件系统活动失败",
    "monitor.agent.no_git_activity": "[后台] Agent [{agentId}] 无 Git 提交活动",
    "monitor.agent.process_check_failed": "[后台] 检测 Agent [{agentId}] 进程状态失败",
    "monitor.agent.no_log_activity": "[后台] Agent [{agentId}] 无日志文件活动",
    "monitor.agent.monitor_single_failed": "[后台] 监控 Agent [{agentId}] 时出现异常",

    // Reputation
    "reputation.penalty_applied":
      "[后台] 对 Agent [{agentId}] 执行{severity}惩罚：-{points} 分（原因: {reason}，当前分数: {score}）",
    "reputation.reward_applied":
      "[后台] 对 Agent [{agentId}] 执行奖励：+{points} 分（原因: {reason}，当前分数: {score}）",

    // Task Aging (internal)
    "task.aging.task_process_error": "[后台] 处理任务 [{taskId}] 时出现异常",
    "task.aging.reassign_failed": "[后台] 重新分配阻塞任务 [{taskId}] 失败",
  },
  "en-US": {
    // ... existing code ...
    "tagline.77":
      "Valentine's Day: Roses are typed, violets are piped—I'll automate chores so you can spend time with humans.",

    // Channel Setup Messages
    "wizard.channels.setup.title": "Channel setup",
    "wizard.channels.setup.cannot_enable": "Cannot enable",
    "wizard.channels.setup.plugin_unavailable": "plugin not available.",
    "wizard.channels.setup.no_onboarding": "does not support onboarding yet.",
    "wizard.channels.setup.remove_title": "Remove channel",
    "wizard.channels.setup.no_delete_support": "does not support deleting config entries.",
    "wizard.channels.setup.confirm_delete": "Delete account",

    // Skills Configuration
    "wizard.skills.status.title": "Skills status",
    "wizard.skills.status.eligible": "Eligible",
    "wizard.skills.status.missing": "Missing requirements",
    "wizard.skills.status.blocked": "Blocked by allowlist",
    "wizard.skills.configure_prompt": "Configure skills now? (recommended)",
    "wizard.skills.homebrew.title": "Homebrew recommended",
    "wizard.skills.homebrew.message":
      "Many skill dependencies are shipped via Homebrew. Without brew, you'll need to build from source or download releases manually.",
    "wizard.skills.homebrew.show_command": "Show Homebrew install command?",
    "wizard.skills.homebrew.install_title": "Homebrew install",
    "wizard.skills.homebrew.run_command": "Run:",
    "wizard.skills.node_manager": "Preferred node manager for skill installs",
    "wizard.skills.install_missing": "Install missing skill dependencies",
    "wizard.skills.skip_now": "Skip for now",
    "wizard.skills.skip_hint": "Continue without installing dependencies",
    "wizard.skills.installing": "Installing",
    "wizard.skills.installed": "Installed",
    "wizard.skills.install_failed": "Install failed",
    "wizard.skills.set_api_key": "Set",
    "wizard.skills.enter_api_key": "Enter",
    "wizard.skills.api_key_required": "Required",
  },
};
