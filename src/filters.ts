import { Diagnostic, DiagnosticCategory } from "ts-morph";
import { ConvenienceMap } from "./conveniencemap";

/** All filters for entire project */
export type ProjectFilters = Map<string, FileFilters>;
/** Filters for a single file, describes how to include or exclude diagnostics by code */
export class FileFilters {
    defaultRule = TsDefaultRule.All;
    codeRules = new Map<number, TsCodeRule>();
}
export const enum TsDefaultRule {
    All,
    OnlyErrors,
    AsWarnings,
    Ignore
}
export const enum TsCodeRule {
    Allow,
    AsError,
    AsWarning,
    Ignore
}

export const enum ReclassifiedDiagnosticCategory {
    Warning = DiagnosticCategory.Warning,
    Error = DiagnosticCategory.Error,
    Suggestion = DiagnosticCategory.Suggestion,
    Message = DiagnosticCategory.Message,
    Ignore
}

export class Filterer {
    summary = new DiagnosticsSummary();
    constructor(private filters: ProjectFilters) {
        for(const [filename, filter] of filters) {
            const fileSummary = this.summary.files.getWithDefault(filename);
            // for(const )
        }
    }
    // ignoredDiagnostics = ConvenienceMap.create<string, Set<number>>((_key: string) => new Set());
    // raisedDiagnostics = ConvenienceMap.create<string, Set<number>>((_key: string) => new Set());
    filter(diagnostic: Diagnostic): ReclassifiedDiagnosticCategory {
        const {filters} = this;
        const path = diagnostic.getSourceFile()?.getFilePath();
        let ret = diagnostic.getCategory() as any as ReclassifiedDiagnosticCategory;
        if(!path) return ret;
        const _filter = filters.get(path);
        if(_filter)
            ret = classifyDiagnostic(diagnostic, _filter);
        const code = diagnostic.getCode();
        const summary = this.summary.files.getWithDefault(path);
        if(summary) {
            if(ret === ReclassifiedDiagnosticCategory.Ignore) {
                summary.ignoredCodes.set(code, (summary.ignoredCodes.get(code) ?? 0) + 1);
            } else {
                summary.raisedCodes.set(code, (summary.ignoredCodes.get(code) ?? 0) + 1);
            }
        }
        return ret;
    }
    getSummary(): DiagnosticsSummary {
        for(const [path, filters] of this.filters) {
            const fileSummary = this.summary.files.getWithDefault(path);
            if(filters.defaultRule === TsDefaultRule.Ignore && fileSummary.ignoredCodes.size === 0) {
                fileSummary.unnecessaryCatchallFilter = true;
            }
            for(const [code, rule] of filters.codeRules) {
                if(rule === TsCodeRule.Ignore && !fileSummary.ignoredCodes.has(code)) fileSummary.unnecessarilyFilteredCodes.add(code);
            }
        }
        return this.summary;
    }
}

function classifyDiagnostic(diagnostic: Diagnostic, filter: FileFilters): ReclassifiedDiagnosticCategory {
    const category = diagnostic.getCategory();
    if(category === DiagnosticCategory.Suggestion || category === DiagnosticCategory.Message)
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

class DiagnosticsSummary {
    files = ConvenienceMap.create<string, FileDiagnosticsSummary>(filename => new FileDiagnosticsSummary());
}
class FileDiagnosticsSummary {
    ignoredCodes = new Map<number, number>();
    unnecessaryCatchallFilter = false;
    unnecessarilyFilteredCodes = new Set<number>();
    raisedCodes = new Map<number, number>();
}
