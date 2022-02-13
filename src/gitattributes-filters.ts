import { Diagnostic, DiagnosticCategory, SourceFile } from "ts-morph";
import {$} from 'shell-scripter';
import { chunk } from "lodash";
import { FileFilters, ProjectFilters, ReclassifiedDiagnosticCategory, TsCodeRule, TsDefaultRule } from "./filters";
import { relative } from "path";

/*
 * This file implements the .gitattributes filter provider.
 */

export async function getFilterFromGitAttributes(allSourceFiles: SourceFile[], attrPrefix: string): Promise<ProjectFilters> {
    // Ask git for all relevant attributes
    const allGitAttrs = new Map<string, Map<string, string>>();
    $.verbose = false;
    const {stdout: gitToplevelStdout} = await $`git rev-parse --show-toplevel`;
    const gitRoot = gitToplevelStdout.trim();
    // exclude files outside of git's root directory.  It'll throw an error if we ask about them
    const stdin = allSourceFiles
        .map(sf => sf.getFilePath())
        .filter(path => !relative(gitRoot.trim(), path).startsWith('..'))
        .join('\0');
    const gitProcess = $`git check-attr -z --stdin --all`;
    gitProcess.stdin.write(stdin);
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
    const filters: ProjectFilters = new Map<string, FileFilters>();
    for(const [filename, attrs] of allGitAttrs) {
        const filter = new FileFilters();
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
    return filters;
}