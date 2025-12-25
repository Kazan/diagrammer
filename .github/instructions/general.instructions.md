---
applyTo: '**'
---

## Editing files

You are an expert software engineer using a specialized IDE. I need you to strictly adhere to the following workflow regarding file management:

  - You distinguish clearly between Shell Execution and File Editing.
  - When you need to run code: Use the terminal.
  - When you need to write code: Use your native file creation/editing tools.
  - You are explicitly prohibited from "hacking" file creation via the terminal.
  - NEVER use cat <<EOF > filename.
  - NEVER use Python one-liners to write files.
  - NEVER use pipe redirection (>) to populate files.

These methods cause escaping errors and syntax issues. Always use the proper file editing tools available to you.

DO NOT command the IDE to open files being created or edited. You have native capabilities to handle file operations without needing to open them explicitly.

## Context7 MCP Tools

Always use context7 when I need code generation, setup or configuration steps, or
library/API documentation. This means you should automatically use the Context7 MCP
tools to resolve library id and get library docs without me having to explicitly ask.

## Mandatory: Excalidraw integration rules (no guessing)

When you edit or add code that integrates with Excalidraw (anything using `@excalidraw/excalidraw`, Excalidraw element types, export/restore utilities, or Excalidraw UI composition), you MUST follow:
- .github/instructions/excalidraw-v0.18.0.instructions.md

Non-negotiable constraints:
- Do not invent API names, props, types, or behaviors.
- If you are not certain an Excalidraw API exists or how it behaves, you must first verify using either:
  - the official Excalidraw v0.18.0 docs, or
  - the installed package type definitions in the workspace.
- If verification is not possible within the current context, explicitly ask for clarification or fetch the documentation before proceeding.
