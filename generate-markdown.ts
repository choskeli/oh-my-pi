import fs from "fs";
import path from "path";

const OAUTH_DIR = "packages/ai/src/utils/oauth";
const PROVIDERS_DIR = "packages/ai/src/providers";

function readFileContent(dir: string, file: string) {
    try {
        return fs.readFileSync(path.join(dir, file), "utf-8");
    } catch {
        return "";
    }
}

const oauthFiles = fs.readdirSync(OAUTH_DIR).filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts" && f !== "callback-server.ts" && f !== "pkce.ts");
const providerFiles = fs.readdirSync(PROVIDERS_DIR).filter(f => f.endsWith(".ts") && f !== "index.ts" && f !== "types.ts" && !f.includes("response"));

let markdown = `# oh-my-pi Authentication and API Providers Guide

This document details the exact code implementations for every supported AI provider in \`oh-my-pi\`.
It covers both how they authenticate (via \`packages/ai/src/utils/oauth\`) and how they actually execute model calls and streaming (via \`packages/ai/src/providers\`).

`;

for (const oauthFile of oauthFiles) {
    const providerName = oauthFile.replace(".ts", "");
    const providerImplFile = providerFiles.find(f => f === oauthFile || f === `${providerName}-cli.ts`);

    markdown += `\n## ${providerName.toUpperCase()}\n\n`;

    // Auth code
    const authCode = readFileContent(OAUTH_DIR, oauthFile);
    if (authCode) {
        markdown += `### Authentication Implementation (\`${oauthFile}\`)\n\n\`\`\`typescript\n${authCode}\n\`\`\`\n\n`;
    }

    // Provider code
    if (providerImplFile) {
        const providerCode = readFileContent(PROVIDERS_DIR, providerImplFile);
        if (providerCode) {
            markdown += `### Provider API Implementation (\`${providerImplFile}\`)\n\n\`\`\`typescript\n${providerCode}\n\`\`\`\n\n`;
        }
    }
}

fs.writeFileSync("oh-my-pi-oauth-providers-guide.md", markdown);
console.log("Markdown generated.");
