const fs = require('fs');
const ts = require('typescript');
const src = fs.readFileSync('src/logParser.ts', 'utf8');
const result = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const moduleWrapper = { exports: {} };
const fn = new Function('exports', 'require', result.outputText);
fn(moduleWrapper.exports, require);
const { parseCSV } = moduleWrapper.exports;

const csvData = `timestamp,message
1686658271000,"{
    ""timestamp"": ""2026-06-12 13:11:11,853+0000"",
    ""level"": ""INFO"",
    ""function"": ""lambda_function"",
    ""requestId"": ""b2de37b3-f459-4a5f-b93d-1fac7e8d32d8"",
    ""message"": ""Request received"",
    ""metadata"": {
        ""userId"": ""42""
    }
}"
1686658272000,just a normal line`;

const entries = parseCSV(csvData);
console.log(JSON.stringify(entries, null, 2));
