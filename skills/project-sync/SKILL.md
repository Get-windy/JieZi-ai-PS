---
name: project-sync
description: "Sync GOALS.md milestone status to external project management tools (Trello, Notion). Use when: (1) a milestone completes and you want to update the Trello card or Notion database row, (2) you want to push the full active goal list to an external board, (3) checking if external tools have new tasks to pull into GOALS.md. Requires TRELLO_API_KEY + TRELLO_TOKEN, or NOTION_API_KEY."
metadata:
  {
    "openclaw": {
      "emoji": "🔄",
      "requires": { "bins": ["jq"] }
    }
  }
---

# Project Sync

Keeps `GOALS.md` in sync with external project management boards (Trello, Notion).

## Quick Reference

```bash
# Mark a Trello card done (by card name search)
CARD_NAME="Milestone name" BOARD_ID="xxx" ./skills/project-sync/scripts/trello-complete.sh

# Push all active goals to Notion database
NOTION_DB_ID="xxx" ./skills/project-sync/scripts/notion-push-goals.sh

# Pull new tasks from Trello "To Do" list into GOALS.md
TRELLO_LIST_ID="xxx" ./skills/project-sync/scripts/trello-pull-tasks.sh
```

## Setup

### Trello

```bash
export TRELLO_API_KEY="your-api-key"   # from https://trello.com/app-key
export TRELLO_TOKEN="your-token"        # click "Token" link on that page
```

### Notion

```bash
mkdir -p ~/.config/notion
echo "ntn_your_key_here" > ~/.config/notion/api_key
# Share your project database with the integration
```

---

## Workflow: Milestone Completes → Sync External Board

When a milestone in `GOALS.md` reaches ✅ Done:

### Option A: Trello

```bash
# 1. Find the card by name
TRELLO_KEY=$TRELLO_API_KEY
TRELLO_TOK=$TRELLO_TOKEN
CARD_NAME="Milestone: API layer complete"

# Search for card across your boards
CARD=$(curl -s "https://api.trello.com/1/search?query=${CARD_NAME}&modelTypes=cards&key=$TRELLO_KEY&token=$TRELLO_TOK" | jq '.cards[0]')
CARD_ID=$(echo $CARD | jq -r '.id')

# 2. Find the "Done" list on the board
BOARD_ID=$(echo $CARD | jq -r '.idBoard')
DONE_LIST=$(curl -s "https://api.trello.com/1/boards/$BOARD_ID/lists?key=$TRELLO_KEY&token=$TRELLO_TOK" | jq '.[] | select(.name | ascii_downcase | contains("done"))' | jq -r '.id')

# 3. Move card to Done
curl -s -X PUT "https://api.trello.com/1/cards/$CARD_ID?key=$TRELLO_KEY&token=$TRELLO_TOK" \
  -d "idList=$DONE_LIST" | jq '{name: .name, list: .idList}'

# 4. Add completion comment
curl -s -X POST "https://api.trello.com/1/cards/$CARD_ID/actions/comments?key=$TRELLO_KEY&token=$TRELLO_TOK" \
  -d "text=✅ Milestone completed. DoD verified. Updated from GOALS.md."
```

### Option B: Notion

```bash
NOTION_KEY=$(cat ~/.config/notion/api_key)
NOTION_VERSION="2025-09-03"

# 1. Find the page in your Notion project database
DB_ID="your-database-id"
MILESTONE_NAME="API layer complete"

PAGE=$(curl -s -X POST "https://api.notion.com/v1/data_sources/$DB_ID/query" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: $NOTION_VERSION" \
  -H "Content-Type: application/json" \
  -d "{\"filter\": {\"property\": \"Name\", \"title\": {\"contains\": \"$MILESTONE_NAME\"}}}" | jq '.results[0]')

PAGE_ID=$(echo $PAGE | jq -r '.id')

# 2. Update status to Done
curl -s -X PATCH "https://api.notion.com/v1/pages/$PAGE_ID" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: $NOTION_VERSION" \
  -H "Content-Type: application/json" \
  -d '{"properties": {"Status": {"select": {"name": "Done"}}}}'
```

---

## Workflow: Push Active Goals to Notion Database

Use this to initialize or refresh a Notion project tracker from `GOALS.md`:

```bash
NOTION_KEY=$(cat ~/.config/notion/api_key)
NOTION_VERSION="2025-09-03"
DB_ID="your-database-id"

# Create a new row for each active milestone
# (Parse GOALS.md manually or use the agent to extract milestone lines)
GOAL_NAME="Feature X"
MILESTONE="API layer complete"
STATUS="In Progress"

curl -s -X POST "https://api.notion.com/v1/pages" \
  -H "Authorization: Bearer $NOTION_KEY" \
  -H "Notion-Version: $NOTION_VERSION" \
  -H "Content-Type: application/json" \
  -d "{
    \"parent\": {\"database_id\": \"$DB_ID\"},
    \"properties\": {
      \"Name\": {\"title\": [{\"text\": {\"content\": \"$MILESTONE\"}}]},
      \"Goal\": {\"rich_text\": [{\"text\": {\"content\": \"$GOAL_NAME\"}}]},
      \"Status\": {\"select\": {\"name\": \"$STATUS\"}},
      \"Source\": {\"rich_text\": [{\"text\": {\"content\": \"GOALS.md\"}}]}
    }
  }"
```

---

## Workflow: Pull New Tasks from Trello into GOALS.md

Check Trello's "To Do" list for cards not yet in `GOALS.md`:

```bash
TRELLO_KEY=$TRELLO_API_KEY
TRELLO_TOK=$TRELLO_TOKEN
LIST_ID="your-todo-list-id"

# Get all cards in To Do
curl -s "https://api.trello.com/1/lists/$LIST_ID/cards?key=$TRELLO_KEY&token=$TRELLO_TOK" \
  | jq '.[] | {name: .name, desc: .desc, id: .id}'

# For each card not in GOALS.md:
# - Add as a new milestone under the relevant Active Goal
# - Or create a new Active Goal section if none fits
```

---

## Agent Integration

Add to coding agent prompts for long tasks to auto-sync on milestone completion:

```bash
# Template to include in coding-agent prompt:
"After the milestone '[Milestone Name]' is verified and complete:
1. Update GOALS.md milestone status to ✅ Done
2. Run: curl -s -X PUT \"https://api.trello.com/1/cards/CARD_ID?key=$TRELLO_KEY&token=$TRELLO_TOK\" -d \"idList=DONE_LIST_ID\"
3. Run: openclaw system event --text \"Milestone done: [Milestone Name]\" --mode now"
```

---

## Notes

- Keep `GOALS.md` as the source of truth. External boards are mirrors, not masters.
- If Trello and GOALS.md conflict, GOALS.md wins.
- Notion's `data_source_id` and `database_id` are different — use `data_source_id` for queries, `database_id` for creating pages.
- Rate limits: Trello ~300 req/10s; Notion ~3 req/s.
