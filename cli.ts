#!/usr/bin/env -S node --loader ts-node/esm

import {chunk, first, indexOf} from 'lodash';
import {cli, command, Option, $} from 'shell-scripter';
import {Diagnostic, DiagnosticCategory, Project, SourceFile, ts} from 'ts-morph';

const a: string = 123;

class Foo {
    foo() {
        const b: {a?: number} = {};
        const c = b.a;
        console.log(c.toFixed());

    }
}


const cmd = command({
    usage: {
        description: 'Compile a ts project but ignore certain diagnostics, following ignore rules declared as gitattributes'
    },
    options: {
        projectPath: Option.String('--project', {
            required: true,
            description: 'Path to tsconfig'
        }),
        attrPrefix: Option.String('--attr-prefix', {
            description: 'Pull ignore rules from gitattributes with this prefix.  Default: "ts"',
        }),
        noEmit: Option.Boolean('--noEmit')
    },
    async execute() {
        // const {console} = this;
        const {attrPrefix = 'ts', projectPath, noEmit} = this;
        const project = new Project({
            tsConfigFilePath: projectPath
        });
        const configFileParsingDiagnostics = project.getConfigFileParsingDiagnostics();
        if(configFileParsingDiagnostics.length) {
            console.log(project.formatDiagnosticsWithColorAndContext(configFileParsingDiagnostics));
            process.exit(1);
        }

        // Get a list of all source files
        const allSourceFiles = project.getSourceFiles();

        const filter = await getFilterFromGitAttributes(allSourceFiles, attrPrefix);

        const shouldEmit = !(noEmit || project.getCompilerOptions().noEmit);

        if(shouldEmit) {
            project.emitSync();
        }

        let diagnostics = project.getPreEmitDiagnostics();
        diagnostics = diagnostics.filter(diagnostic => {
            const newCategory = filter(diagnostic);
            if(newCategory as any as DiagnosticCategory !== diagnostic.getCategory()) {
                console.log(`reclassifying diagnostic ${diagnostic.getMessageText()}: ${diagnostic.getCategory()} --> ${ newCategory }`);
            }
            if(newCategory === ReclassifiedDiagnosticCategory.Ignore) return false;
            diagnostic.compilerObject.category = newCategory as any as DiagnosticCategory;
            return true;
        });
        if(diagnostics.length) {
            console.log(project.formatDiagnosticsWithColorAndContext(diagnostics));
            process.exit(1);
        }
    }
});

const enum TsDefaultRule {
    All,
    OnlyErrors,
    AsWarnings,
    Ignore
}
const enum TsCodeRule {
    Allow,
    AsError,
    AsWarning,
    Ignore
}
const enum ReclassifiedDiagnosticCategory {
    Warning = ts.DiagnosticCategory.Warning,
    Error = ts.DiagnosticCategory.Error,
    Suggestion = ts.DiagnosticCategory.Suggestion,
    Message = ts.DiagnosticCategory.Message,
    Ignore
}
class Filter {
    defaultRule = TsDefaultRule.All;
    codeRules = new Map<number, TsCodeRule>();
}

async function getFilterFromGitAttributes(allSourceFiles: SourceFile[], attrPrefix: string) {
    // Ask git for all relevant attributes
    const allGitAttrs = new Map<string, Map<string, string>>();
    $.verbose = false;
    const gitProcess = $`git check-attr -z --stdin --all`;
    gitProcess.stdin.write(allSourceFiles.map(sf => sf.getFilePath()).join('\0'));
    gitProcess.stdin.end();
    const {stdout} = await gitProcess;

    // Parse git's output into a data structure
    for(const [path, attr, info] of chunk(stdout.split('\0'), 3)) {
        if(!path) continue;
        let attrs = allGitAttrs.get(path);
        if(!attrs) {
            attrs = new Map<string, string>();
            allGitAttrs.set(path, attrs!);
        }
        attrs.set(attr, info);
    }

    // Parse the git attrs into data structure more suitable for filtering
    const filters = new Map<string, Filter>();
    for(const [filename, attrs] of allGitAttrs) {
        const filter = new Filter();
        filters.set(filename, filter);
        for(const [fullKey, value] of attrs) {
            if(!fullKey.startsWith(attrPrefix)) continue;
            const key = fullKey.slice(attrPrefix.length);
            if(key === '') {
                switch(value) {
                    case 'unset':
                    case 'ignore':
                    case 'none':
                        filter.defaultRule = TsDefaultRule.Ignore;
                        break;
                    case 'onlyerrors':
                        filter.defaultRule = TsDefaultRule.OnlyErrors;
                        break;
                    case 'aswarnings':
                        filter.defaultRule = TsDefaultRule.AsWarnings;
                        break;
                    case 'all':
                    case 'set':
                        filter.defaultRule = TsDefaultRule.All;
                        break;
                    default:
                        throw new Error(`Unrecognized attribute value: ${fullKey}=${value}`);
                }
            } else if(/^\d+$/.test(key)) {
                const code = +key;
                switch(value) {
                    case 'unset':
                    case 'ignore':
                    case 'none':
                        filter.codeRules.set(code, TsCodeRule.Ignore);
                        break;
                    case 'error':
                    case 'err':
                        filter.codeRules.set(code, TsCodeRule.AsError);
                        break;
                    case 'warn':
                    case 'warning':
                        filter.codeRules.set(code, TsCodeRule.AsWarning);
                        break;
                    case 'set':
                        filter.codeRules.set(code, TsCodeRule.Allow);
                        break;
                    default:
                        throw new Error(`Unrecognized attribute value: ${fullKey}=${value}`);
                }
            }
        }
    }
    return filterFn;
    function filterFn(diagnostic: Diagnostic): ReclassifiedDiagnosticCategory {
        const path = diagnostic.getSourceFile()?.getFilePath();
        if(!path) return diagnostic.getCategory() as any as ReclassifiedDiagnosticCategory;
        const _filter = filters.get(path);
        if(!_filter) return diagnostic.getCategory() as any as ReclassifiedDiagnosticCategory;
        return classifyDiagnostic(diagnostic, _filter);
    }
}
function classifyDiagnostic(diagnostic: Diagnostic, filter: Filter): ReclassifiedDiagnosticCategory {
    const category = diagnostic.getCategory();
    if(category === ts.DiagnosticCategory.Suggestion || category === ts.DiagnosticCategory.Message)
        return category as any as ReclassifiedDiagnosticCategory;
    const code = diagnostic.getCode();
    const codeRule = filter.codeRules.get(code);
    if(codeRule != null) {
        if(codeRule === TsCodeRule.Ignore) return ReclassifiedDiagnosticCategory.Ignore;
        if(codeRule === TsCodeRule.AsError) return ReclassifiedDiagnosticCategory.Error;
        if(codeRule === TsCodeRule.AsWarning) return ReclassifiedDiagnosticCategory.Warning;
        return category as any as ReclassifiedDiagnosticCategory;
    }
    if(filter.defaultRule === TsDefaultRule.Ignore) return ReclassifiedDiagnosticCategory.Ignore;
    if(filter.defaultRule === TsDefaultRule.AsWarnings) return ReclassifiedDiagnosticCategory.Warning;
    if(filter.defaultRule === TsDefaultRule.OnlyErrors) {
        if(category !== DiagnosticCategory.Error) return ReclassifiedDiagnosticCategory.Ignore;
    }
    return category as any as ReclassifiedDiagnosticCategory;
}

cli({
    pkg: require('./package'),
    command: cmd
});
