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
- Target current Android Gradle Plugin and Kotlin releases; prefer KSP over KAPT when available.
- Keep dependencies centralized (version catalogs/BOMs) and avoid duplicate coordinates across modules.

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
- Lifecycle: prefer `repeatOnLifecycle`/`flowWithLifecycle`; use `collectAsStateWithLifecycle` in Compose.
- Background work: use WorkManager for deferrable tasks, Foreground Service only when user-visible and justified.
- Paging: use Paging 3 with `cachedIn` scopes and stable keys.
- Prefer `repeatOnLifecycle` over `launchWhenX` to avoid keeping upstream flows active; use `flowWithLifecycle` for a single flow, and separate child launches inside `repeatOnLifecycle` for multiple flows.

## Android Patterns
- UI: prefer Jetpack Compose; keep composables pure and stable-friendly. Use `remember` sparingly, avoid `MutableState` leaks, key lists, and keep modifiers first.
- State: hoist state; expose immutable `StateFlow`/`LiveData` to UI, mutable types scoped to ViewModel. Normalize data and handle loading/error/empty explicitly.
- DI: favor Hilt/Koin; constructor inject dependencies; avoid service locators and singletons unless truly global.
- Resources: keep strings in resources; avoid hardcoded text. Use dimension/color resources or theme tokens.
- Navigation: use type-safe args; avoid passing large objects between destinations; prefer IDs/keys.
- Compose stability: prefer immutable UI models, mark stable types (`@Stable`/`@Immutable`) when needed, and avoid recreating lambdas/objects in recomposition.
- Effects: use `LaunchedEffect`/`DisposableEffect` with explicit keys; keep side effects off the main tree.
- Persistence: prefer `rememberSaveable` for UI state that should survive process death; use `Saver` for custom types.
- Accessibility: provide semantics, content descriptions, and focus order; honor dynamic type and contrast.
- Lazy layouts: provide stable `key` values and avoid backwards state writes; use `derivedStateOf` to debounce hot state (e.g., scroll position) and `snapshotFlow` when bridging Compose state to Flow for analytics/side-effects.
- Side-effects: prefer keyed `LaunchedEffect` for suspend work, wrap changing lambdas with `rememberUpdatedState` to avoid unintended restarts, and use `DisposableEffect` for registrations that need cleanup; avoid `LaunchedEffect(true)` unless lifecycle-scoped work is truly required.
- Performance: add baseline profiles (default + app-specific) and keep expensive calculations behind `remember`; run release/R8 builds when profiling.

## Testing
- Write unit tests for ViewModels/use-cases; use fakes over mocks where possible. Test coroutine code with `runTest` and injected dispatchers.
- Compose UI: test semantics and state; use snapshot/semantics matchers instead of sleeps. Espresso/UITest: avoid brittle waits.
- Keep tests deterministic: no real clocks or randomness without seeding; prefer `TestDispatcher`/`TestScope`.
- Use `MainDispatcherRule` (or equivalent) to swap Dispatchers.Main in tests; avoid real delays (`advanceUntilIdle`).
- Prefer contract tests for navigation/DI wiring; stub network with fakes or MockWebServer.

## Documentation & Comments
- KDoc on public/protected APIs; start with a summary fragment. Keep block tags ordered (`@param`, `@return`, `@throws`).
- Add intent comments only when the code cannot state it; update/remove stale comments during edits.

## Safety & Performance
- Validate inputs at boundaries; prefer nullable-safe ops (`?.`, `?:`, `require`, `check`).
- Avoid blocking the main thread; move IO/CPU to background dispatchers. Use batching/debouncing for hot flows.
- Avoid reflection-heavy patterns on hot paths; cache expensive computations.
- Use UTF-8 source encoding and ASCII spaces (no tabs) per the Android Kotlin style guide; keep imports ASCII-sorted and wildcard-free.

## Tooling
- Run detekt/ktlint/formatters if present; keep code within 100 columns. Ensure imports are sorted and wildcard-free.
- Keep Gradle scripts idiomatic Kotlin DSL: use `plugins` block, typed accessors, version catalogs if available, and avoid hardcoding duplicates.
- Favor configuration cache and build cache friendly patterns; avoid dynamic task graph mutations.
- Prefer module separation for feature isolation; keep shared modules small and stable.
- Generate and ship baseline profiles; benchmark critical journeys and keep profile artifacts up to date.
