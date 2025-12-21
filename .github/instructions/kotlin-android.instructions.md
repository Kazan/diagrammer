---
description: 'Kotlin Android development standards and best practices'
applyTo: '**/*.kt, **/*.kts'
---

# Kotlin (Android) Development

Instructions for writing and reviewing Kotlin code in Android projects following the Android/Kotlin style guide (https://developer.android.com/kotlin/style-guide) and modern Android best practices.

## Core Principles
- Prefer readability and safety over cleverness; keep functions small and single-purpose.
- Follow Google Android Kotlin Style: K&R braces, 4-space indents, 100-char column limit, no tabs, no wildcard imports, ASCII sorting for imports.
- Keep files cohesive by theme; order sections as: header > file annotations > package > imports > top-level declarations with a logical order.
- Embrace null-safety, immutability (`val` by default), and expression functions when they stay clear.

## Naming & Structure
- File names match the primary declaration (PascalCase) or describe grouped extensions; use `.kt`/`.kts`.
- Packages are lowercase, concatenated words (no underscores). Types use PascalCase; functions/props camelCase; constants UPPER_SNAKE_CASE in objects or top-level only. Backing properties use `_name`.
- Compose: `@Composable` functions returning `Unit` are PascalCase nouns; UI state is hoisted and passed as data + event lambdas.

## Formatting Essentials
- Braces on same line; line break after `{` and before `}`; always use braces for control flow unless a single-line expression fits wholly on one line.
- One statement per line; no semicolons. Break long signatures with one parameter per line; closing `)` and return type on their own line.
- Place spaces around binary operators and after commas/colons (except member references/dots/ranges). Space before `{` and after control keywords.
- Blank lines separate logical sections and class members; avoid multiple consecutive blanks.
- Prefer actual Unicode for readable symbols; escape only when non-printable.

## Language & API Usage
- Coroutines: prefer `suspend`/Flow; launch with structured concurrency (`viewModelScope`, `lifecycleScope`), cancel on scope end. Avoid `GlobalScope`.
- Threads/Dispatchers: use `Dispatchers.IO` for IO, `Default` for CPU; confine UI work to `Main`/`Main.immediate`. Inject dispatchers for testability.
- Collections: favor immutable views and `copy` on data classes. Avoid mutating shared state; guard concurrent access.
- Error handling: use `Result`, sealed types, or domain errors; avoid swallowing exceptions. Wrap `withContext` calls in try/catch as needed.
- Serialization/interop: keep DTOs separate from domain models; add explicit types for public APIs and library boundaries.

## Android Patterns
- UI: prefer Jetpack Compose; keep composables pure and stable-friendly. Use `remember` sparingly, avoid `MutableState` leaks, key lists, and keep modifiers first.
- State: hoist state; expose immutable `StateFlow`/`LiveData` to UI, mutable types scoped to ViewModel. Normalize data and handle loading/error/empty explicitly.
- DI: favor Hilt/Koin; constructor inject dependencies; avoid service locators and singletons unless truly global.
- Resources: keep strings in resources; avoid hardcoded text. Use dimension/color resources or theme tokens.
- Navigation: use type-safe args; avoid passing large objects between destinations; prefer IDs/keys.

## Testing
- Write unit tests for ViewModels/use-cases; use fakes over mocks where possible. Test coroutine code with `runTest` and injected dispatchers.
- Compose UI: test semantics and state; use snapshot/semantics matchers instead of sleeps. Espresso/UITest: avoid brittle waits.
- Keep tests deterministic: no real clocks or randomness without seeding; prefer `TestDispatcher`/`TestScope`.

## Documentation & Comments
- KDoc on public/protected APIs; start with a summary fragment. Keep block tags ordered (`@param`, `@return`, `@throws`).
- Add intent comments only when the code cannot state it; update/remove stale comments during edits.

## Safety & Performance
- Validate inputs at boundaries; prefer nullable-safe ops (`?.`, `?:`, `require`, `check`).
- Avoid blocking the main thread; move IO/CPU to background dispatchers. Use batching/debouncing for hot flows.
- Avoid reflection-heavy patterns on hot paths; cache expensive computations.

## Tooling
- Run detekt/ktlint/formatters if present; keep code within 100 columns. Ensure imports are sorted and wildcard-free.
- Keep Gradle scripts idiomatic Kotlin DSL: use `plugins` block, typed accessors, version catalogs if available, and avoid hardcoding duplicates.
