
let excludeList;
const exclusionsWithErrors = new Set();
function readExcludeList() {
    excludeList = new Set(
        fs.readFileSync(".typechecker-ignore", "utf8")
        .split("\n")
        .filter(v => v && v[0] !== "#")
    );
}
readExcludeList();
setInterval(readExcludeList, 1e3);
let emit = true;
let failed = false;
lineReader.eachLine(process.stdin, (line, last) => {
    const lineWithoutColorCodes = line.replace(/\x1B(?:c|\[\d\d?m)/g, "");
    const match = lineWithoutColorCodes.match(/^(.*?)(?:\(\d+,\d+\): |:\d+:\d+ -)/);
    if(match) {
        emit = !excludeList.has(match[1]);
        if(emit) {
            failed = true;
        } else {
            exclusionsWithErrors.add(match[1]);
        }
    }
    const match2 = lineWithoutColorCodes.match(/^\[\d/);
    if(match2) {
        emit = true;
    }
    if(emit) {
        console.log(line);
    }
    if(last) {
        const unnecessaryExclusions = require("lodash").without(Array.from(excludeList), ...Array.from(exclusionsWithErrors));
        if(unnecessaryExclusions.length) {
            console.log(`The following typechecking exclusions are unnecessary because they have no type errors.  They can be removed from .typechecker-ignore:\n${ unnecessaryExclusions.join("\n") }`);
        }
        process.exit(failed ? 1 : 0);
    }
});