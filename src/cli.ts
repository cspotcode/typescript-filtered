#!/usr/bin/env -S node --loader ts-node/esm

import { padStart, sortBy } from 'lodash';
import { relative } from 'path';
import { cli, command, Option, zx, _ } from 'shell-scripter';
const {chalk} = zx;
import { DiagnosticCategory, Project } from 'ts-morph';
import { Filterer, ReclassifiedDiagnosticCategory } from './filters';
import { getFilterFromGitAttributes as getFiltersFromGitAttributes } from './gitattributes-filters';
import { tsDiagnosticMessages } from './ts-diagnostic-messages';

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
        noEmit: Option.Boolean('--noEmit'),
        noDiagnosticLogging: Option.Boolean('--noDiagnosticLogging', {
            description: 'Do not log diagnostics the way tsc does.'
        }),
        alwaysExitCodeZero: Option.Boolean('--exitCode0'),
        summary: Option.Boolean('--summary'),
        detailedSummary: Option.Boolean('--detailed-summary'),
        jsonSummary: Option.Boolean('--json-summary', {
            description: 'Implies --noDiagnosticLogging'
        })
    },
    async execute() {
        // const {console} = this;
        const {attrPrefix = 'ts', projectPath, noEmit, alwaysExitCodeZero, detailedSummary, summary: emitSummary, jsonSummary} = this;
        let {noDiagnosticLogging: _noDiagnosticLogging} = this;
        const noDiagnosticLogging = _noDiagnosticLogging || jsonSummary;
        const project = new Project({
            tsConfigFilePath: projectPath
        });
        const configFileParsingDiagnostics = project.getConfigFileParsingDiagnostics();
        if(configFileParsingDiagnostics.length) {
            console.log(project.formatDiagnosticsWithColorAndContext(configFileParsingDiagnostics));
            process.exit(alwaysExitCodeZero ? 0 : 1);
        }

        // Get a list of all source files
        const allSourceFiles = project.getSourceFiles();

        const shouldEmit = !(noEmit || project.getCompilerOptions().noEmit);

        if(shouldEmit) {
            project.emitSync();
        }

        const diagnostics = project.getPreEmitDiagnostics();

        const allFiles_ = new Set([
            ...allSourceFiles.map(sf => sf.getFilePath() as string),
            ...diagnostics.map(d => d.getSourceFile()?.getFilePath() as string).filter(v => v)
        ]);

        // To implement a new filter provider, add it here
        const filterers = [
            new Filterer(await getFiltersFromGitAttributes([...allFiles_], attrPrefix))
        ];

        const filteredDiagnostics = diagnostics.filter(diagnostic => {
            for(const filterer of filterers) {
                const newCategory = filterer.filter(diagnostic);
                if(newCategory === ReclassifiedDiagnosticCategory.Ignore) {
                    return false;
                }
                diagnostic.compilerObject.category = newCategory as any as DiagnosticCategory;
            }
            return true;
        });
        if(filteredDiagnostics.length) {
            if(noDiagnosticLogging) {
                console.log(chalk.red(`Skipped logging ${filteredDiagnostics.length} diagnostics.`));
            } else {
                console.log(project.formatDiagnosticsWithColorAndContext(filteredDiagnostics));
            }
        }

        const indent = '    ';
        const filterer = filterers[0];
        const summary = filterer.getSummary();
        const allFiles = new Set([
            ...allSourceFiles.map(sf => sf.getFilePath()),
            ...summary.files.keys()
        ]);
        if(emitSummary || detailedSummary) {
            // TODO make emitSummary do a terser emit
            console.log(chalk.green('-------'));
            console.log(chalk.green('Summary'));
            console.log(chalk.green('-------'));
            console.log();
            for(const path of sortBy([...allFiles])) {
                const fileStats = summary.files.get(path);
                if(!fileStats) continue;
                if(fileStats.ignoredCodes.size === 0 && fileStats.raisedCodes.size === 0 && fileStats.unnecessarilyFilteredCodes.size === 0 && !fileStats.unnecessaryCatchallFilter) continue;
                console.log(chalk.cyanBright(relative(process.cwd(), path)));
                function logCodeGroup(header: string, map: Map<number, number>) {
                    if(map.size) {
                        console.log(`${indent}${header}`);
                        for(const [code, quantity] of sortBy([...map.entries()], ([code, quantity]) => (-quantity * 10000 + code))) {
                            console.log(`${indent}${indent}${chalk.yellow(padStart(`${quantity}x`, 4))}${chalk.gray(padStart(`TS${code}`, 8) + ': ')}${tsDiagnosticMessages.get(code)}`);
                        }
                    }
                }
                logCodeGroup('Raised diagnostics:', fileStats.raisedCodes);
                logCodeGroup('Ignored diagnostics:', fileStats.ignoredCodes);
                if(fileStats.unnecessaryCatchallFilter || fileStats.unnecessarilyFilteredCodes.size) {
                    console.log(`${indent}Unnecessary ignore rules:`);
                    if(fileStats.unnecessaryCatchallFilter) {
                        console.log(`${indent}${indent}All ${chalk.gray(`(all diagnostics are ignored, but none were raised by this file)`)}`);
                    }
                    for(const code of fileStats.unnecessarilyFilteredCodes) {
                        console.log(`${indent}${indent}${indent}${chalk.gray(`${ padStart(`TS${code}`, 8) }: `)}${tsDiagnosticMessages.get(code) ?? '<invalid diagnostic code>'}`);
                    }
                }
                console.log();
            }
        } else if(jsonSummary) {
            throw new Error('not implemented yet');
        }

        return filteredDiagnostics.length && !alwaysExitCodeZero ? 1 : 0;
    }
});

cli({
    pkg: require('../package'),
    command: cmd
});
