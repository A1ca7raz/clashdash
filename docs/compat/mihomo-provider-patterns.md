# Mihomo Provider compatibility

ClashDash applies Provider filters before overrides, matching Mihomo's processing order.
`filter` and `exclude-filter` use backticks as OR separators; `exclude-type` uses `|` and is case-insensitive.

`MihomoPattern` supports the common regexp2 subset used by provider names, including leading `(?i)`,
capturing groups, lookarounds supported by JavaScript, Unicode text, and replacement references.
Expressions rejected by the runtime are rejected by ClashDash rather than silently changing their meaning.

Provider `override-expr` follows Mihomo's ordered, update-oriented yq subset. ClashDash currently supports:

- nested mapping fields, array indexes and `[]` wildcards;
- `=`, `|=`, `+=`, `-=`, `*=`, statement pipes, and `del(...)`;
- scalar/array/mapping literals, path reads, arithmetic, comparison, boolean and default operators;
- `length`, `select`, `sub`, `test`, `split`, `join`, `upcase`, `downcase`, `trim`, `tostring`,
  `tonumber`, `not`, `reverse`, and `unique`.

Unsupported yq constructs fail validation with the expression index and original source. They are never executed
through a shell, dynamic JavaScript, filesystem, or environment access.
