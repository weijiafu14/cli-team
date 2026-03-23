#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def sanitize_key(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "_", value).strip("_") or "lock"


def read_body(args: argparse.Namespace) -> str:
    if args.body_file:
        return Path(args.body_file).read_text(encoding="utf-8")
    return args.body or ""


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def write_attachment(base_dir: Path, msg_id: str, body: str, source_path: str | None) -> dict:
    ext = ".md"
    if source_path:
        suffix = Path(source_path).suffix
        if suffix:
            ext = suffix
    attachment_path = base_dir / f"{msg_id}{ext}"
    attachment_path.parent.mkdir(parents=True, exist_ok=True)
    attachment_path.write_text(body, encoding="utf-8")
    return {
        "path": str(attachment_path),
        "bytes": attachment_path.stat().st_size,
        "sha256": sha256_text(body),
    }


def manage_lock(locks_dir: Path, agent_id: str, key: str, action: str, summary: str, force: bool) -> dict:
    lock_path = locks_dir / f"{sanitize_key(key)}.json"
    locks_dir.mkdir(parents=True, exist_ok=True)
    if action == "none":
        return {}
    if action == "acquire":
        if lock_path.exists():
            current = json.loads(lock_path.read_text(encoding="utf-8"))
            if current.get("owner") != agent_id and not force:
                return {"key": key, "action": action, "status": "blocked", "owner": current.get("owner"), "path": str(lock_path)}
        data = {"owner": agent_id, "summary": summary, "updated_at": now_iso()}
        lock_path.write_text(json.dumps(data, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
        return {"key": key, "action": action, "status": "acquired", "path": str(lock_path)}
    if action == "release":
        if not lock_path.exists():
            return {"key": key, "action": action, "status": "released", "path": str(lock_path)}
        current = json.loads(lock_path.read_text(encoding="utf-8"))
        if current.get("owner") != agent_id and not force:
            return {"key": key, "action": action, "status": "blocked", "owner": current.get("owner"), "path": str(lock_path)}
        lock_path.unlink()
        return {"key": key, "action": action, "status": "released", "path": str(lock_path)}
    raise ValueError(f"Unknown lock action: {action}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Write a coordination message with optional attachment and lock handling.")
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--role", choices=["system", "user", "agent"], default="agent")
    parser.add_argument("--type", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--topic", default="general")
    parser.add_argument("--task-id", default="")
    parser.add_argument("--to", default="*")
    parser.add_argument("--body")
    parser.add_argument("--body-file")
    parser.add_argument("--messages", default=".agents/coord/messages.jsonl")
    parser.add_argument("--attachments-dir", default=".agents/coord/attachments")
    parser.add_argument("--locks-dir", default=".agents/coord/locks")
    parser.add_argument("--max-inline-chars", type=int, default=400)
    parser.add_argument("--reply-to", default="")
    parser.add_argument("--lock-key", default="")
    parser.add_argument("--lock-action", choices=["none", "acquire", "release"], default="none")
    parser.add_argument("--force-lock", action="store_true")
    parser.add_argument("--dispatch", choices=["all", "targets", "none"], default="all")
    args = parser.parse_args()

    msg_id = f"msg-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid4().hex[:8]}"
    body = read_body(args)

    attachment = None
    inline_body = body
    if body and len(body) > args.max_inline_chars:
        attachment = write_attachment(Path(args.attachments_dir), msg_id, body, args.body_file)
        inline_body = body[: args.max_inline_chars].rstrip() + "..."

    lock_info = manage_lock(Path(args.locks_dir), args.agent_id, args.lock_key, args.lock_action, args.summary, args.force_lock) if args.lock_key else {}

    msg = {
        "id": msg_id,
        "ts": now_iso(),
        "from": args.agent_id,
        "role": args.role,
        "to": [item.strip() for item in args.to.split(",") if item.strip()] or ["*"],
        "topic": args.topic,
        "task_id": args.task_id,
        "type": args.type,
        "summary": args.summary,
        "dispatch": args.dispatch,
    }
    if inline_body:
        msg["body"] = inline_body
    if attachment:
        msg["attachment"] = attachment
    if args.reply_to:
        msg["reply_to"] = args.reply_to
    if lock_info:
        msg["lock"] = lock_info

    messages_path = Path(args.messages)
    messages_path.parent.mkdir(parents=True, exist_ok=True)
    with messages_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(msg, ensure_ascii=True) + "\n")

    print(json.dumps(msg, ensure_ascii=True, indent=2))
    if lock_info.get("status") == "blocked":
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
