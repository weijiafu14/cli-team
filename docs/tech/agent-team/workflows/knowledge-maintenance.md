# Knowledge Maintenance Guide

## Purpose

This document defines how the agent team manages and evolves its own knowledge base.

## When to write

- When you encounter a non-obvious bug and successfully fix it (write to `pitfalls/`).
- When you establish a new architectural pattern or rule (write to `decisions/`).
- When you finalize a new standard operating procedure (write to `workflows/`).
- When you encounter domain-specific acronyms or terms (write to `glossary/`).

## How to structure

1. **Tree-based structure:** Keep files small. If a directory gets too crowded, split it into subdirectories (e.g., `pitfalls/frontend/react/`).
2. **File naming:** Use lowercase alphanumeric characters and hyphens (e.g., `react-render-loop-fix.md`).
3. **Format:** Keep explanations concise, focus on the problem, the solution, and code examples.

## Evolution

The system only defines the basic `decisions`, `pitfalls`, `workflows`, and `glossary` top-level structure.
The specific sub-folder taxonomy is evolved organically by the team as new areas of work are encountered.
