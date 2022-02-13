# typescript-filtered

A CLI similar to `tsc` but that can filter out certain diagnostics per-directory, per-file, and per-diagnostic code.

```
npx cspotcode/typescript-with-diagnostic-filters --help
npx cspotcode/typescript-with-diagnostic-filters --project ./tsconfig.json --noEmit
```

Filters are declared in `.gitattributes`.

```gitattributes
# .gitattributes example

# Set to get all diagnostics, like vanilla TSC.  This is the default
** ts=all

# Set to suppress all diagnostics for this file (note the minus sign, *or* set the value to "none" or "ignore")
test/spec/messy-file.ts -ts
test/spec/messy-file.ts ts=none

# Set to suppress diagnostic code 123 (note the minus sign, *or* set the value to "ignore")
src/codegen/** -ts123
src/codegen/** ts123=ignore

# Use macro attributes to create compound rules (https://git-scm.com/docs/gitattributes#_defining_macro_attributes)
[attr]ts_unit_test ts=all -ts456 -ts123
[attr]ts_ignore_strict_null_checks -ts111 -ts666
test/**.unit.ts ts_unit_test
src/nulls-everywhere.ts ts_ignore_strict_null_checks
```

<!--
# Set to get only errors, no warnings
test/spec/** ts=error
# To demote an error to a warning
src/codegen/** ts123=warn

-->
