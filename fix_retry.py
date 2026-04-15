path = r'i:\JieZI\JieZi-ai-PS\src\cron\agent-task-wake-scheduler.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = 'IMPORTANT: This task is already in-progress. Execute it NOW. Do NOT change its status \u2014 just work on it and call task_report_to_supervisor when done.'

new = """\u203c\ufe0f MANDATORY PROGRESS REPORT \u2014 You MUST call task_report_to_supervisor NOW with Task ID: \,
              `,
                Option A (Done):     status="done",         result=summary of what you accomplished,
                Option B (Working):  status="in-progress",  result=current progress + what remains + ETA,
                Option C (Blocked):  status="blocked",      result=specific blocker and what you need to unblock,
              `,
              DO NOT remain silent. Failing to call task_report_to_supervisor will trigger further escalation to your supervisor."""

if old in content:
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('OK - replaced')
else:
    print('NOT FOUND')
    idx = content.find('Execute it NOW. Do NOT change')
    print('Fallback search at:', idx)
