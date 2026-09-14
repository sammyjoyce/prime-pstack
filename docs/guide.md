# The prime-pstack guide

pstack works best when you stop micromanaging the agent. You describe what you want and how you will know it is done. `/poteto-mode` picks the playbook, runs the other skills as the steps need them, and shows you the evidence. This is the Prime Agent version of the upstream [pstack guide](https://github.com/cursor/plugins/tree/main/pstack/docs/guide). The prompts are the same. The mechanics underneath differ, and that is what this page covers.

## Set up

```bash
prime-agent package install /absolute/path/to/prime-pstack
```

Start a new session. The shipped roster already works: code delegates on `zai/glm-5.3`, judgment and prose on `anthropic/claude-opus-5`, tooling review on `openai/gpt-6-astra`, and the review panels on opus 5 / astra / glm 5.3 / fable 5.1, all at the `unlimited` budget. A roster model you have no credentials for is dropped for the session and that role runs on your parent model.

Run `/setup-pstack` to change any of it. It asks for a reasoning budget (`unlimited`, `large`, `medium`, `small`, `inherit`) and then a model per role. The picker lists your `enabledModels` (`/scoped-models`) when you have set that, otherwise every model you have credentials for. The file it writes is `~/.prime/agent/pstack/models.json`; delete a role line to fall back to the shipped default.

Every turn's system prompt carries the resolved table, one line per role, each entry with its `thinking=` level already clamped to that model's ceiling. Copy `model=` and `thinking=` from it as written.

## Route work through `/poteto-mode`

```text
/poteto-mode the export writes duplicate rows when a retry lands mid-run. repro first, then fix and verify.
```

`/poteto-mode` turns the mode on for the rest of the session and sends the task. The agent matches the Bug fix playbook, copies its steps into a todo list in its reply, and calls the other skills as each step fires. `/poteto-mode off` turns it off. Skill bodies load with `/skill:<name>`; the four discoverable skills (`how`, `why`, `unslop`, `typescript-best-practices`) also load on their own when a request matches.

## What a fan-out looks like here

Upstream, a skill says "launch all reviewers in a single message using the Task tool". Here that is one `ipython` cell:

```python
handles = []
for label, model in [("A", "anthropic/claude-opus-5"), ("B", "deepseek/deepseek-flash")]:
    h = await rlm.spawn(brief_for(label), name=f"reviewer-{label.lower()}", model=model, thinking="high")
    handles.append(h)
```

The agent then ends its turn. Each child replies with `await agent_message.send(report, receiver_role="parent")`, and the replies arrive as ordinary messages. `await rlm.collect(handles, timeout_ms=0)` gives status without steering anyone. Keep fan-outs under the parent inbox limit (20 pending replies) or have workers write reports to files and reply with the path.

A child that must stay read-only is told so in its brief. There is no `readonly` flag; the brief is the contract.

## Subagent briefs

`agents/poteto-agent.md` and `agents/comment-sicko.md` are prompt bodies. A skill that says "spawn a `comment-sicko` child" means: read that file, paste its body above the scope, and `rlm.spawn` the result. The `no-comments` skill does exactly that.

A `poteto-agent` child reads `skills/poteto-mode/SKILL.md` first. Upstream, Cursor resolves that skill by name inside the child. Here `poteto-mode` is hidden (`disable-model-invocation: true`), so it is not in the child's `<available_skills>` list. The extension injects a `pstack skills dir: <path>` line into every session's system prompt, children included and whether or not the mode is on, and the brief tells the child to read `<path>/poteto-mode/SKILL.md`.

## Run work while you sleep

```text
/poteto-mode im going to bed. migrate every caller to the new parser in a fresh worktree off <base>. run until every fixture passes. keep a decision log i can audit in the morning.
```

Upstream uses Cursor's `/loop` to re-check a finish condition. Here the Autonomous run playbook uses the built-in `rlm_heartbeat` skill (`await rlm_heartbeat.create(<check>, interval="30m")`) and watcher children that reply on an event. A standing objective is `await goal.create(<objective>)`. Sessions are daemon-backed, so closing the terminal does not stop the run; `prime-agent agents` lists it and `prime-agent attach <agent>` reconnects.

The decision log (`show-me-your-work`) and its end-of-run transcript check read the file named on the `Conversation log:` line of the system prompt.

## Where transcripts live

Root sessions: `~/.prime/agent/sessions/<uuid>.jsonl`. The first line is a header with `cwd`, so skills that mine history (`recall`, `automate-me`, `reflect`) filter on `cwd` rather than on a directory slug. Children: `~/.prime/agent/session-artifacts/<parent-uuid>/sub-<id>/<uuid>.jsonl`, the `session_dir` on the spawn handle.

## Evidence sources for `/why`

`why` maps MCP servers to evidence categories. Here the list comes from the system prompt's `# Generic MCP Connections` section plus `await mcp.list_tools(<server>)`, and installed Python skills (`linear`, `notion`, `websearch`) count as sources too. Children inherit the parent's MCP connections, so investigators can call them.

## Make it yours

`/automate-me` mines your history in this workspace for repeated preferences and drafts `.prime/agent/skills/<you>-mode/SKILL.md`. `/reflect` reviews a session with three parallel children and proposes skill edits. Test a skill change with the Eval playbook before you trust it; it reads the candidate children's transcripts, not their self-reports.

## Pitfalls specific to Prime Agent

- `rlm.spawn` returns at admission. Waiting on it for an answer blocks forever. End the turn.
- A `thinking=` level the child model does not support fails the spawn. The injected table is already clamped per model; when you pick a model yourself, check `await rlm.find_models(...)` and use a level it accepts.
- Provider quota errors surface as a child that exits without a reply (`request_failed` in its transcript, `provider stream failure` in `~/.prime/agent/logs/agent.jsonl`). Re-spawn on another model rather than retrying the same one.
- `bash()` runs one process per call. `os.chdir` and `os.environ` are what persist.
