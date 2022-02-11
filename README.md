```gitattributes

** tsdefine_decorator_errors=123,456,789
** TSCONDITION_GROUPNAME=123,OTHERGROUPNAME

# Suppress decorator-related rules in these files
src/** -ts_decorator_errors
src/high-quality-code ts_decorator_errors
```

```gitattributes
# Set to get all diagnostics, like vanilla TSC
** ts=all
# Set to get only errors, no warnings
test/spec/** ts=error
# Set to suppress all diagnostics for this file
test/spec/messy-file.ts ts=none
# Set to suppress diagnostic code 123 (note the minus sign, *or* set the value to "ignore")
src/codegen/** -ts123
src/codegen/** ts123=ignore
# To demote an error to a warning
src/codegen/** ts123=warn

# Use macro attributes to create compound rules (https://git-scm.com/docs/gitattributes#_defining_macro_attributes)
[attr]ts_unit_test ts=all -ts456 ts123=warn
[attr]ts_ignore_strict_null_checks -ts111 -ts666

test/**.unit.ts ts_unit_test
src/nulls-everywhere.ts ts_ignore_strict_null_checks
```
